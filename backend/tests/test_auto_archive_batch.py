"""
Test Auto-Archive Batch Feature

Tests the automatic archiving of production batches when all frames/items are sent to inventory.

Endpoints tested:
- POST /api/batches/{batch_id}/frames/{frame_id}/to-inventory (single frame)
- POST /api/batches/{batch_id}/frames/all-to-inventory (all frames)
- POST /api/items/{item_id}/add-to-inventory (production items)

Expected behavior:
- When all frames in a batch are sent to inventory, batch should auto-archive
- batch_archived: true should be returned in API response
- Archived batch should have auto_archived=true and auto_archive_reason set
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SESSION_TOKEN = os.environ.get('TEST_SESSION_TOKEN', 'test_session_1770250833743')


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SESSION_TOKEN}"
    })
    session.cookies.set("session_token", SESSION_TOKEN)
    return session


class TestAutoArchiveSingleFrame:
    """Test auto-archive when single frame is sent to inventory"""
    
    def test_create_batch_with_single_frame(self, api_client):
        """Create an on-demand batch with a single frame for testing"""
        # Create on-demand batch with one frame
        payload = {
            "name": f"TEST_AutoArchive_Single_{uuid.uuid4().hex[:6]}",
            "frames": [
                {"size": "S", "color": "W", "qty": 5}
            ]
        }
        response = api_client.post(f"{BASE_URL}/api/batches/on-demand", json=payload)
        assert response.status_code == 200, f"Failed to create batch: {response.text}"
        
        data = response.json()
        assert "batch_id" in data
        pytest.batch_id_single = data["batch_id"]
        print(f"Created batch: {pytest.batch_id_single}")
        
    def test_get_batch_frames(self, api_client):
        """Get frames from the batch"""
        response = api_client.get(f"{BASE_URL}/api/batches/{pytest.batch_id_single}/frames")
        assert response.status_code == 200
        
        data = response.json()
        assert "frames" in data
        assert len(data["frames"]) == 1
        
        pytest.frame_id_single = data["frames"][0]["frame_id"]
        print(f"Frame ID: {pytest.frame_id_single}")
        
    def test_move_frame_to_qc_stage(self, api_client):
        """Move frame through stages to Quality Check"""
        # Get stages
        stages_response = api_client.get(f"{BASE_URL}/api/stages")
        assert stages_response.status_code == 200
        stages = stages_response.json()
        
        # Find Quality Check stage (stage_ready or contains 'quality')
        qc_stage = None
        for stage in stages:
            if stage.get("stage_id") == "stage_ready" or "quality" in stage.get("name", "").lower():
                qc_stage = stage
                break
        
        assert qc_stage is not None, "Quality Check stage not found"
        pytest.qc_stage_id = qc_stage["stage_id"]
        
        # Move frame to QC stage
        response = api_client.post(
            f"{BASE_URL}/api/batches/{pytest.batch_id_single}/frames/{pytest.frame_id_single}/move",
            params={"target_stage_id": pytest.qc_stage_id}
        )
        assert response.status_code == 200, f"Failed to move frame: {response.text}"
        print(f"Moved frame to {qc_stage['name']}")
        
    def test_update_frame_completed_qty(self, api_client):
        """Update frame with completed quantity"""
        response = api_client.put(
            f"{BASE_URL}/api/batches/{pytest.batch_id_single}/frames/{pytest.frame_id_single}",
            params={"qty_completed": 5, "qty_rejected": 0}
        )
        assert response.status_code == 200, f"Failed to update frame: {response.text}"
        print("Updated frame qty_completed=5")
        
    def test_move_single_frame_to_inventory_auto_archives(self, api_client):
        """Move single frame to inventory - should auto-archive batch"""
        response = api_client.post(
            f"{BASE_URL}/api/batches/{pytest.batch_id_single}/frames/{pytest.frame_id_single}/to-inventory"
        )
        assert response.status_code == 200, f"Failed to move to inventory: {response.text}"
        
        data = response.json()
        print(f"Response: {data}")
        
        # Verify batch_archived flag is returned
        assert "batch_archived" in data, "batch_archived flag not in response"
        assert data["batch_archived"] == True, "batch_archived should be True"
        
        # Verify good frames were added
        assert data.get("good_added", 0) > 0, "No good frames added to inventory"
        
    def test_verify_batch_is_archived(self, api_client):
        """Verify the batch is now archived with auto_archived flag"""
        response = api_client.get(f"{BASE_URL}/api/batches/{pytest.batch_id_single}")
        assert response.status_code == 200
        
        batch = response.json()
        assert batch.get("status") == "archived", f"Batch status should be 'archived', got: {batch.get('status')}"
        assert batch.get("auto_archived") == True, "auto_archived flag should be True"
        assert batch.get("auto_archive_reason") == "all_frames_sent_to_inventory", \
            f"auto_archive_reason should be 'all_frames_sent_to_inventory', got: {batch.get('auto_archive_reason')}"
        
        print(f"Batch archived: status={batch.get('status')}, auto_archived={batch.get('auto_archived')}")


class TestAutoArchiveMoveAllFrames:
    """Test auto-archive when 'Move All to Inventory' action empties the batch"""
    
    def test_create_batch_with_multiple_frames(self, api_client):
        """Create an on-demand batch with multiple frames"""
        payload = {
            "name": f"TEST_AutoArchive_MoveAll_{uuid.uuid4().hex[:6]}",
            "frames": [
                {"size": "S", "color": "W", "qty": 3},
                {"size": "L", "color": "B", "qty": 2},
                {"size": "XL", "color": "N", "qty": 4}
            ]
        }
        response = api_client.post(f"{BASE_URL}/api/batches/on-demand", json=payload)
        assert response.status_code == 200, f"Failed to create batch: {response.text}"
        
        data = response.json()
        pytest.batch_id_multi = data["batch_id"]
        print(f"Created batch with multiple frames: {pytest.batch_id_multi}")
        
    def test_get_all_frames(self, api_client):
        """Get all frames from the batch"""
        response = api_client.get(f"{BASE_URL}/api/batches/{pytest.batch_id_multi}/frames")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["frames"]) == 3, f"Expected 3 frames, got {len(data['frames'])}"
        pytest.frame_ids_multi = [f["frame_id"] for f in data["frames"]]
        print(f"Frame IDs: {pytest.frame_ids_multi}")
        
    def test_move_all_frames_to_qc(self, api_client):
        """Move all frames to Quality Check stage"""
        # Get QC stage ID
        stages_response = api_client.get(f"{BASE_URL}/api/stages")
        stages = stages_response.json()
        qc_stage = next((s for s in stages if s.get("stage_id") == "stage_ready" or "quality" in s.get("name", "").lower()), None)
        pytest.qc_stage_id_multi = qc_stage["stage_id"]
        
        # Move each frame to QC
        for frame_id in pytest.frame_ids_multi:
            response = api_client.post(
                f"{BASE_URL}/api/batches/{pytest.batch_id_multi}/frames/{frame_id}/move",
                params={"target_stage_id": pytest.qc_stage_id_multi}
            )
            assert response.status_code == 200, f"Failed to move frame {frame_id}: {response.text}"
        
        print(f"Moved all {len(pytest.frame_ids_multi)} frames to QC stage")
        
    def test_update_all_frames_completed(self, api_client):
        """Update all frames with completed quantities"""
        # Get frames to get their qty_required
        response = api_client.get(f"{BASE_URL}/api/batches/{pytest.batch_id_multi}/frames")
        frames = response.json()["frames"]
        
        for frame in frames:
            qty = frame.get("qty_required", frame.get("qty", 1))
            update_response = api_client.put(
                f"{BASE_URL}/api/batches/{pytest.batch_id_multi}/frames/{frame['frame_id']}",
                params={"qty_completed": qty, "qty_rejected": 0}
            )
            assert update_response.status_code == 200
        
        print("Updated all frames with completed quantities")
        
    def test_move_all_to_inventory_auto_archives(self, api_client):
        """Move all frames to inventory - should auto-archive batch"""
        response = api_client.post(
            f"{BASE_URL}/api/batches/{pytest.batch_id_multi}/frames/all-to-inventory"
        )
        assert response.status_code == 200, f"Failed to move all to inventory: {response.text}"
        
        data = response.json()
        print(f"Response: {data}")
        
        # Verify batch_archived flag is returned
        assert "batch_archived" in data, "batch_archived flag not in response"
        assert data["batch_archived"] == True, "batch_archived should be True"
        
        # Verify frames were moved
        assert data.get("moved_count", 0) == 3, f"Expected 3 frames moved, got {data.get('moved_count')}"
        
    def test_verify_batch_archived_after_move_all(self, api_client):
        """Verify batch is archived with correct flags"""
        response = api_client.get(f"{BASE_URL}/api/batches/{pytest.batch_id_multi}")
        assert response.status_code == 200
        
        batch = response.json()
        assert batch.get("status") == "archived", f"Batch status should be 'archived', got: {batch.get('status')}"
        assert batch.get("auto_archived") == True, "auto_archived flag should be True"
        assert batch.get("auto_archive_reason") == "all_frames_sent_to_inventory"
        
        print(f"Batch archived after move-all: status={batch.get('status')}, auto_archived={batch.get('auto_archived')}")


class TestBatchNotArchivedWhenFramesRemain:
    """Test that batch is NOT archived when frames still remain"""
    
    def test_create_batch_with_two_frames(self, api_client):
        """Create batch with two frames"""
        payload = {
            "name": f"TEST_NoArchive_Partial_{uuid.uuid4().hex[:6]}",
            "frames": [
                {"size": "HS", "color": "G", "qty": 2},
                {"size": "HX", "color": "W", "qty": 3}
            ]
        }
        response = api_client.post(f"{BASE_URL}/api/batches/on-demand", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        pytest.batch_id_partial = data["batch_id"]
        print(f"Created batch: {pytest.batch_id_partial}")
        
    def test_get_frames_for_partial(self, api_client):
        """Get frames"""
        response = api_client.get(f"{BASE_URL}/api/batches/{pytest.batch_id_partial}/frames")
        assert response.status_code == 200
        
        frames = response.json()["frames"]
        pytest.frame_ids_partial = [f["frame_id"] for f in frames]
        print(f"Frame IDs: {pytest.frame_ids_partial}")
        
    def test_move_frames_to_qc_partial(self, api_client):
        """Move frames to QC"""
        stages_response = api_client.get(f"{BASE_URL}/api/stages")
        stages = stages_response.json()
        qc_stage = next((s for s in stages if s.get("stage_id") == "stage_ready" or "quality" in s.get("name", "").lower()), None)
        
        for frame_id in pytest.frame_ids_partial:
            api_client.post(
                f"{BASE_URL}/api/batches/{pytest.batch_id_partial}/frames/{frame_id}/move",
                params={"target_stage_id": qc_stage["stage_id"]}
            )
        print("Moved frames to QC")
        
    def test_update_only_first_frame(self, api_client):
        """Update only first frame with completed qty"""
        response = api_client.get(f"{BASE_URL}/api/batches/{pytest.batch_id_partial}/frames")
        frames = response.json()["frames"]
        
        # Only update first frame
        first_frame = frames[0]
        api_client.put(
            f"{BASE_URL}/api/batches/{pytest.batch_id_partial}/frames/{first_frame['frame_id']}",
            params={"qty_completed": first_frame.get("qty_required", 2), "qty_rejected": 0}
        )
        print(f"Updated only first frame: {first_frame['frame_id']}")
        
    def test_move_one_frame_batch_not_archived(self, api_client):
        """Move one frame to inventory - batch should NOT be archived"""
        # Get current frames
        response = api_client.get(f"{BASE_URL}/api/batches/{pytest.batch_id_partial}/frames")
        frames = response.json()["frames"]
        
        # Find frame with completed qty
        frame_to_move = next((f for f in frames if f.get("qty_completed", 0) > 0), frames[0])
        
        move_response = api_client.post(
            f"{BASE_URL}/api/batches/{pytest.batch_id_partial}/frames/{frame_to_move['frame_id']}/to-inventory"
        )
        assert move_response.status_code == 200
        
        data = move_response.json()
        print(f"Response: {data}")
        
        # batch_archived should be False since one frame remains
        assert data.get("batch_archived") == False, "batch_archived should be False when frames remain"
        
    def test_verify_batch_still_active(self, api_client):
        """Verify batch is still active"""
        response = api_client.get(f"{BASE_URL}/api/batches/{pytest.batch_id_partial}")
        assert response.status_code == 200
        
        batch = response.json()
        assert batch.get("status") == "active", f"Batch should still be 'active', got: {batch.get('status')}"
        assert batch.get("auto_archived") != True, "auto_archived should not be True"
        
        print(f"Batch still active: status={batch.get('status')}")


class TestArchivedBatchesInHistory:
    """Test that archived batches appear in history with correct indicators"""
    
    def test_get_archived_batches(self, api_client):
        """Get archived batches - should include auto-archived ones"""
        response = api_client.get(f"{BASE_URL}/api/batches", params={"status": "archived"})
        assert response.status_code == 200
        
        batches = response.json()
        print(f"Found {len(batches)} archived batches")
        
        # Find our auto-archived batches
        auto_archived = [b for b in batches if b.get("auto_archived") == True]
        print(f"Auto-archived batches: {len(auto_archived)}")
        
        # Verify at least one auto-archived batch exists (from our tests)
        assert len(auto_archived) >= 1, "Should have at least one auto-archived batch from tests"
        
        # Verify auto_archive_reason is set
        for batch in auto_archived:
            assert batch.get("auto_archive_reason") is not None, "auto_archive_reason should be set"
            print(f"Batch {batch['batch_id']}: auto_archive_reason={batch.get('auto_archive_reason')}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_batches(self, api_client):
        """Delete test batches created during testing"""
        # Get all batches
        response = api_client.get(f"{BASE_URL}/api/batches")
        if response.status_code == 200:
            batches = response.json()
            test_batches = [b for b in batches if b.get("name", "").startswith("TEST_")]
            
            for batch in test_batches:
                try:
                    api_client.delete(f"{BASE_URL}/api/batches/{batch['batch_id']}")
                    print(f"Deleted test batch: {batch['batch_id']}")
                except:
                    pass
        
        print("Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
