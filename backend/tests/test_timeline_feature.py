"""
Test Activity Timeline Feature
Tests for Salesforce-style Activity Timeline/Chatter feature including:
- Timeline item CRUD (POST, GET, PUT, DELETE)
- Follow/Unfollow records
- Activity types including 'onboarding'
- System event auto-logging (stage changes)
- Notifications API
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test session (shared across tests)
session = requests.Session()


def get_unique_id():
    return uuid.uuid4().hex[:8]


class TestTimelineAPISetup:
    """Setup and authentication tests"""

    def test_01_auth_dev_login(self):
        """Authenticate using dev login"""
        res = session.get(f"{BASE_URL}/api/auth/dev-login")
        assert res.status_code == 200
        data = res.json()
        assert "message" in data or "redirect" in data
        print(f"Auth successful: {data}")


class TestActivityTypes:
    """Test Activity Types endpoint"""
    
    def test_get_activity_types(self):
        """GET /api/timeline/activity-types returns all configured types including ONBOARDING"""
        res = session.get(f"{BASE_URL}/api/timeline/activity-types")
        assert res.status_code == 200
        data = res.json()
        
        assert "activity_types" in data
        types = {t["type"] for t in data["activity_types"]}
        
        # Verify required activity types exist
        required_types = {"chat_post", "note", "call_log", "email_log", "meeting_log", "onboarding", "stage_changed"}
        for req_type in required_types:
            assert req_type in types, f"Missing activity type: {req_type}"
        
        # Verify onboarding has correct config
        onboarding = next((t for t in data["activity_types"] if t["type"] == "onboarding"), None)
        assert onboarding is not None, "ONBOARDING type not found"
        assert onboarding["label"] == "Onboarding"
        assert onboarding["user_created"] == True
        assert onboarding["allows_replies"] == True
        print(f"Found {len(types)} activity types including ONBOARDING")


class TestTimelineItemCRUD:
    """Test Timeline Item CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.test_entity_id = f"test_entity_{get_unique_id()}"
        self.created_items = []
        yield
        # Cleanup created items
        for item_id in self.created_items:
            session.delete(f"{BASE_URL}/api/timeline/items/{item_id}")
    
    def test_create_chat_post(self):
        """POST /api/timeline/items - Create a chat post"""
        payload = {
            "entity_type": "opportunity",
            "entity_id": self.test_entity_id,
            "activity_type": "chat_post",
            "body": "Test chat post for timeline feature testing",
            "visibility": "public"
        }
        res = session.post(f"{BASE_URL}/api/timeline/items", json=payload)
        assert res.status_code == 200
        data = res.json()
        
        assert "item_id" in data
        assert data["activity_type"] == "chat_post"
        assert data["body"] == payload["body"]
        assert data["entity_type"] == "opportunity"
        assert data["is_deleted"] == False
        self.created_items.append(data["item_id"])
        print(f"Created chat post: {data['item_id']}")
    
    def test_create_note(self):
        """POST /api/timeline/items - Create a note"""
        payload = {
            "entity_type": "opportunity",
            "entity_id": self.test_entity_id,
            "activity_type": "note",
            "body": "Test note for timeline",
            "visibility": "internal"
        }
        res = session.post(f"{BASE_URL}/api/timeline/items", json=payload)
        assert res.status_code == 200
        data = res.json()
        
        assert data["activity_type"] == "note"
        assert data["visibility"] == "internal"
        self.created_items.append(data["item_id"])
        print(f"Created note: {data['item_id']}")
    
    def test_create_call_log(self):
        """POST /api/timeline/items - Create a call log with duration"""
        payload = {
            "entity_type": "opportunity",
            "entity_id": self.test_entity_id,
            "activity_type": "call_log",
            "body": "Discussed pricing options",
            "call_duration_minutes": 15,
            "call_outcome": "connected",
            "metadata": {"duration_minutes": 15, "outcome": "connected"}
        }
        res = session.post(f"{BASE_URL}/api/timeline/items", json=payload)
        assert res.status_code == 200
        data = res.json()
        
        assert data["activity_type"] == "call_log"
        assert data["call_duration_minutes"] == 15
        assert data["call_outcome"] == "connected"
        self.created_items.append(data["item_id"])
        print(f"Created call log: {data['item_id']}")
    
    def test_create_onboarding_activity(self):
        """POST /api/timeline/items - Create an ONBOARDING activity (new type)"""
        payload = {
            "entity_type": "opportunity",
            "entity_id": self.test_entity_id,
            "activity_type": "onboarding",
            "body": "Customer onboarding session completed. Covered product setup and integration.",
            "visibility": "public",
            "metadata": {"session_type": "initial_setup", "duration": "60min"}
        }
        res = session.post(f"{BASE_URL}/api/timeline/items", json=payload)
        assert res.status_code == 200
        data = res.json()
        
        assert data["activity_type"] == "onboarding"
        assert "onboarding" in data["body"].lower()
        self.created_items.append(data["item_id"])
        print(f"Created ONBOARDING activity: {data['item_id']}")
    
    def test_create_with_mentions(self):
        """POST /api/timeline/items - Create post with @mentions"""
        payload = {
            "entity_type": "opportunity",
            "entity_id": self.test_entity_id,
            "activity_type": "chat_post",
            "body": "Hey @TestUser please review this deal"
        }
        res = session.post(f"{BASE_URL}/api/timeline/items", json=payload)
        assert res.status_code == 200
        data = res.json()
        
        assert "mentions" in data
        # Mentions may or may not resolve depending on user existence
        self.created_items.append(data["item_id"])
        print(f"Created post with mentions: {data['item_id']}")
    
    def test_get_timeline_items(self):
        """GET /api/timeline/items/{entity_type}/{entity_id}"""
        # First create some items
        for i in range(3):
            session.post(f"{BASE_URL}/api/timeline/items", json={
                "entity_type": "opportunity",
                "entity_id": self.test_entity_id,
                "activity_type": "chat_post",
                "body": f"Test post {i}"
            })
        
        res = session.get(f"{BASE_URL}/api/timeline/items/opportunity/{self.test_entity_id}")
        assert res.status_code == 200
        data = res.json()
        
        assert "items" in data
        assert "pagination" in data
        assert len(data["items"]) >= 3
        assert data["pagination"]["total"] >= 3
        print(f"Retrieved {len(data['items'])} timeline items")
    
    def test_filter_timeline_by_activity_type(self):
        """GET /api/timeline/items with activity_types filter"""
        # Create mixed items
        session.post(f"{BASE_URL}/api/timeline/items", json={
            "entity_type": "opportunity",
            "entity_id": self.test_entity_id,
            "activity_type": "note",
            "body": "Filtered note test"
        })
        session.post(f"{BASE_URL}/api/timeline/items", json={
            "entity_type": "opportunity",
            "entity_id": self.test_entity_id,
            "activity_type": "chat_post",
            "body": "Filtered post test"
        })
        
        # Filter for notes only
        res = session.get(
            f"{BASE_URL}/api/timeline/items/opportunity/{self.test_entity_id}",
            params={"activity_types": "note"}
        )
        assert res.status_code == 200
        data = res.json()
        
        for item in data["items"]:
            assert item["activity_type"] == "note"
        print(f"Filter by activity_type working - found {len(data['items'])} notes")


class TestFollowUnfollow:
    """Test Follow/Unfollow functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.test_entity_id = f"test_follow_{get_unique_id()}"
        yield
        # Cleanup
        session.delete(f"{BASE_URL}/api/timeline/follow/opportunity/{self.test_entity_id}")
    
    def test_follow_record(self):
        """POST /api/timeline/follow/{entity_type}/{entity_id}"""
        res = session.post(f"{BASE_URL}/api/timeline/follow/opportunity/{self.test_entity_id}")
        assert res.status_code == 200
        data = res.json()
        
        assert data["success"] == True
        assert "follow" in data
        assert data["follow"]["entity_type"] == "opportunity"
        assert data["follow"]["entity_id"] == self.test_entity_id
        assert "notify_on" in data["follow"]
        print(f"Followed record: {data['follow']['follow_id']}")
    
    def test_get_follow_status(self):
        """GET /api/timeline/follow/{entity_type}/{entity_id}"""
        # First follow
        session.post(f"{BASE_URL}/api/timeline/follow/opportunity/{self.test_entity_id}")
        
        res = session.get(f"{BASE_URL}/api/timeline/follow/opportunity/{self.test_entity_id}")
        assert res.status_code == 200
        data = res.json()
        
        assert data["is_following"] == True
        assert data["follow"] is not None
        print(f"Follow status verified: is_following={data['is_following']}")
    
    def test_unfollow_record(self):
        """DELETE /api/timeline/follow/{entity_type}/{entity_id}"""
        # First follow
        session.post(f"{BASE_URL}/api/timeline/follow/opportunity/{self.test_entity_id}")
        
        # Then unfollow
        res = session.delete(f"{BASE_URL}/api/timeline/follow/opportunity/{self.test_entity_id}")
        assert res.status_code == 200
        data = res.json()
        
        assert data["success"] == True
        
        # Verify unfollowed
        status_res = session.get(f"{BASE_URL}/api/timeline/follow/opportunity/{self.test_entity_id}")
        status_data = status_res.json()
        assert status_data["is_following"] == False
        print("Unfollow verified")


class TestNotifications:
    """Test Notifications API"""
    
    def test_get_notifications(self):
        """GET /api/timeline/notifications"""
        res = session.get(f"{BASE_URL}/api/timeline/notifications")
        assert res.status_code == 200
        data = res.json()
        
        assert "notifications" in data
        assert "unread_count" in data
        assert "pagination" in data
        print(f"Notifications: {data['unread_count']} unread, {data['pagination']['total']} total")
    
    def test_get_notifications_filtered(self):
        """GET /api/timeline/notifications with is_read filter"""
        res = session.get(f"{BASE_URL}/api/timeline/notifications", params={"is_read": "false"})
        assert res.status_code == 200
        data = res.json()
        
        # All returned should be unread
        for notif in data["notifications"]:
            assert notif["is_read"] == False
        print(f"Filtered unread notifications: {len(data['notifications'])}")


class TestStageChangeAutoLog:
    """Test that stage changes automatically log to timeline"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        # Create test account and opportunity
        self.unique_id = get_unique_id()
        account_res = session.post(f"{BASE_URL}/api/crm/accounts", json={
            "name": f"TEST_StageLog_Account_{self.unique_id}",
            "account_type": "customer"
        })
        self.account_id = account_res.json()["account_id"]
        
        opp_res = session.post(f"{BASE_URL}/api/crm/opportunities", json={
            "name": f"TEST_StageLog_Opp_{self.unique_id}",
            "account_id": self.account_id,
            "amount": 10000,
            "stage": "prospecting",
            "close_date": "2026-12-31"
        })
        self.opp_id = opp_res.json()["opportunity_id"]
        yield
        # Cleanup
        session.delete(f"{BASE_URL}/api/crm/opportunities/{self.opp_id}")
        session.delete(f"{BASE_URL}/api/crm/accounts/{self.account_id}")
    
    def test_stage_change_creates_timeline_event(self):
        """Changing opportunity stage creates stage_changed event in timeline"""
        # Change stage
        res = session.put(f"{BASE_URL}/api/crm/opportunities/{self.opp_id}", json={
            "stage": "qualification"
        })
        assert res.status_code == 200
        
        # Check timeline
        timeline_res = session.get(f"{BASE_URL}/api/timeline/items/opportunity/{self.opp_id}")
        assert timeline_res.status_code == 200
        data = timeline_res.json()
        
        # Find stage_changed event
        stage_events = [i for i in data["items"] if i["activity_type"] == "stage_changed"]
        assert len(stage_events) >= 1, "Stage change event not found in timeline"
        
        latest_event = stage_events[0]
        assert "Prospecting" in latest_event["body"]
        assert "Qualification" in latest_event["body"]
        assert latest_event["metadata"]["old_value"] == "Prospecting"
        assert latest_event["metadata"]["new_value"] == "Qualification"
        print(f"Stage change logged: {latest_event['body']}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_data(self):
        """Remove all TEST_ prefixed test data"""
        # Cleanup test accounts
        accounts_res = session.get(f"{BASE_URL}/api/crm/accounts?search=TEST_")
        if accounts_res.status_code == 200:
            for acc in accounts_res.json().get("accounts", []):
                if acc["name"].startswith("TEST_"):
                    session.delete(f"{BASE_URL}/api/crm/accounts/{acc['account_id']}")
        
        # Cleanup test opportunities
        opps_res = session.get(f"{BASE_URL}/api/crm/opportunities?search=TEST_")
        if opps_res.status_code == 200:
            for opp in opps_res.json().get("opportunities", []):
                if opp["name"].startswith("TEST_"):
                    session.delete(f"{BASE_URL}/api/crm/opportunities/{opp['opportunity_id']}")
        
        print("Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
