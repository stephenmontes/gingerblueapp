"""
Test P0 Fixes:
1. Timer banner receives activeTimer prop from Production.jsx
2. Rejection tracking in Quality Check stage (stage_ready)
3. PUT /api/batches/{batch_id}/frames/{frame_id} accepts qty_completed and qty_rejected
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SESSION_TOKEN = "test_session_1769977085456"

@pytest.fixture
def api_client():
    """Shared requests session with auth cookie"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    session.cookies.set("session_token", SESSION_TOKEN)
    return session


class TestFrameUpdateEndpoint:
    """Test PUT /api/batches/{batch_id}/frames/{frame_id} endpoint"""
    
    def test_update_frame_qty_completed_only(self, api_client):
        """Test updating only qty_completed"""
        # Get a frame first
        res = api_client.get(f"{BASE_URL}/api/batches/batch_9314298d/frames")
        assert res.status_code == 200, f"Failed to get frames: {res.text}"
        
        data = res.json()
        frames = data.get("frames", [])
        assert len(frames) > 0, "No frames found in batch"
        
        # Use first frame
        frame = frames[0]
        frame_id = frame["frame_id"]
        
        # Update qty_completed only
        update_res = api_client.put(
            f"{BASE_URL}/api/batches/batch_9314298d/frames/{frame_id}?qty_completed=5"
        )
        assert update_res.status_code == 200, f"Failed to update frame: {update_res.text}"
        
        result = update_res.json()
        assert result.get("frame_id") == frame_id
        assert result.get("qty_completed") == 5
        
    def test_update_frame_qty_rejected_only(self, api_client):
        """Test updating qty_rejected parameter"""
        # Get frames
        res = api_client.get(f"{BASE_URL}/api/batches/batch_9314298d/frames")
        assert res.status_code == 200
        
        frames = res.json().get("frames", [])
        assert len(frames) > 0
        
        frame = frames[0]
        frame_id = frame["frame_id"]
        
        # Update with qty_rejected
        update_res = api_client.put(
            f"{BASE_URL}/api/batches/batch_9314298d/frames/{frame_id}?qty_completed=5&qty_rejected=2"
        )
        assert update_res.status_code == 200, f"Failed to update frame with rejection: {update_res.text}"
        
        # Verify the update persisted
        verify_res = api_client.get(f"{BASE_URL}/api/batches/batch_9314298d/frames")
        assert verify_res.status_code == 200
        
        updated_frames = verify_res.json().get("frames", [])
        updated_frame = next((f for f in updated_frames if f["frame_id"] == frame_id), None)
        assert updated_frame is not None
        assert updated_frame.get("qty_rejected") == 2, f"qty_rejected not persisted: {updated_frame}"
        
    def test_update_frame_both_qty_completed_and_rejected(self, api_client):
        """Test updating both qty_completed and qty_rejected together"""
        res = api_client.get(f"{BASE_URL}/api/batches/batch_9314298d/frames")
        assert res.status_code == 200
        
        frames = res.json().get("frames", [])
        assert len(frames) > 0
        
        frame = frames[1] if len(frames) > 1 else frames[0]
        frame_id = frame["frame_id"]
        
        # Update both values
        update_res = api_client.put(
            f"{BASE_URL}/api/batches/batch_9314298d/frames/{frame_id}?qty_completed=10&qty_rejected=3"
        )
        assert update_res.status_code == 200
        
        # Verify persistence
        verify_res = api_client.get(f"{BASE_URL}/api/batches/batch_9314298d/frames")
        updated_frames = verify_res.json().get("frames", [])
        updated_frame = next((f for f in updated_frames if f["frame_id"] == frame_id), None)
        
        assert updated_frame is not None
        assert updated_frame.get("qty_completed") == 10
        assert updated_frame.get("qty_rejected") == 3
        
    def test_update_nonexistent_frame(self, api_client):
        """Test updating a frame that doesn't exist"""
        update_res = api_client.put(
            f"{BASE_URL}/api/batches/batch_9314298d/frames/nonexistent_frame?qty_completed=5"
        )
        assert update_res.status_code == 404


class TestQualityCheckStage:
    """Test Quality Check stage (stage_ready) specific functionality"""
    
    def test_frames_in_quality_check_stage(self, api_client):
        """Test that frames can be filtered by Quality Check stage"""
        res = api_client.get(
            f"{BASE_URL}/api/batches/batch_9314298d/frames?stage_id=stage_ready"
        )
        assert res.status_code == 200
        
        data = res.json()
        frames = data.get("frames", [])
        
        # All returned frames should be in stage_ready
        for frame in frames:
            assert frame.get("current_stage_id") == "stage_ready", \
                f"Frame {frame.get('frame_id')} not in stage_ready"
                
    def test_quality_check_stage_exists(self, api_client):
        """Verify Quality Check stage exists with correct ID"""
        res = api_client.get(f"{BASE_URL}/api/stages")
        assert res.status_code == 200
        
        stages = res.json()
        quality_check = next((s for s in stages if s["stage_id"] == "stage_ready"), None)
        
        assert quality_check is not None, "Quality Check stage (stage_ready) not found"
        assert quality_check.get("name") == "Quality Check"
        assert quality_check.get("order") == 5  # Last production stage


class TestBatchFramesEndpoint:
    """Test GET /api/batches/{batch_id}/frames endpoint"""
    
    def test_get_batch_frames(self, api_client):
        """Test getting frames for a batch"""
        res = api_client.get(f"{BASE_URL}/api/batches/batch_9314298d/frames")
        assert res.status_code == 200
        
        data = res.json()
        assert "batch_id" in data
        assert "frames" in data
        assert "size_groups" in data
        assert "grand_total_required" in data
        assert "grand_total_completed" in data
        
    def test_frames_have_rejection_field(self, api_client):
        """Test that frames include qty_rejected field"""
        res = api_client.get(f"{BASE_URL}/api/batches/batch_9314298d/frames")
        assert res.status_code == 200
        
        frames = res.json().get("frames", [])
        assert len(frames) > 0
        
        for frame in frames:
            assert "qty_rejected" in frame, f"Frame {frame.get('frame_id')} missing qty_rejected field"
            
    def test_frames_filter_by_stage(self, api_client):
        """Test filtering frames by stage_id"""
        # Get frames for cutting stage
        res = api_client.get(
            f"{BASE_URL}/api/batches/batch_9314298d/frames?stage_id=stage_cutting"
        )
        assert res.status_code == 200
        
        frames = res.json().get("frames", [])
        for frame in frames:
            assert frame.get("current_stage_id") == "stage_cutting"


class TestActiveTimerEndpoint:
    """Test timer-related endpoints"""
    
    def test_get_active_timers(self, api_client):
        """Test GET /api/user/active-timers endpoint"""
        res = api_client.get(f"{BASE_URL}/api/user/active-timers")
        assert res.status_code == 200
        
        # Should return a list (empty or with timers)
        data = res.json()
        assert isinstance(data, list)
        
    def test_stages_active_workers(self, api_client):
        """Test GET /api/stages/active-workers endpoint"""
        res = api_client.get(f"{BASE_URL}/api/stages/active-workers")
        assert res.status_code == 200
        
        # Should return a dict of stage_id -> worker count
        data = res.json()
        assert isinstance(data, dict)


class TestAuthRequired:
    """Test that endpoints require authentication"""
    
    def test_frames_requires_auth(self):
        """Test that frames endpoint requires authentication"""
        res = requests.get(f"{BASE_URL}/api/batches/batch_9314298d/frames")
        assert res.status_code == 401
        
    def test_update_frame_requires_auth(self):
        """Test that update frame endpoint requires authentication"""
        res = requests.put(
            f"{BASE_URL}/api/batches/batch_9314298d/frames/frame_test?qty_completed=5"
        )
        assert res.status_code == 401
        
    def test_active_timers_requires_auth(self):
        """Test that active timers endpoint requires authentication"""
        res = requests.get(f"{BASE_URL}/api/user/active-timers")
        assert res.status_code == 401


# Reset test data after tests
@pytest.fixture(scope="class", autouse=True)
def cleanup_test_data(api_client):
    """Reset frame quantities after tests"""
    yield
    # Reset frames to original state
    try:
        res = api_client.get(f"{BASE_URL}/api/batches/batch_9314298d/frames")
        if res.status_code == 200:
            frames = res.json().get("frames", [])
            for frame in frames:
                api_client.put(
                    f"{BASE_URL}/api/batches/batch_9314298d/frames/{frame['frame_id']}?qty_completed=0&qty_rejected=0"
                )
    except Exception as e:
        print(f"Cleanup failed: {e}")
