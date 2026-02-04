"""
Test suite for Task Management and Notifications APIs
Tests CRUD operations for tasks, checklists, comments, and notifications
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test session created for testing
SESSION_TOKEN = "test_session_1770170851654"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session with auth cookie"""
    session = requests.Session()
    session.cookies.set("session_token", SESSION_TOKEN)
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def test_task_id(api_client):
    """Create a test task and return its ID"""
    response = api_client.post(f"{BASE_URL}/api/tasks", json={
        "title": "TEST_Pytest Task",
        "description": "Task created by pytest",
        "priority": "high",
        "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
        "checklist": [
            {"text": "Checklist item 1", "completed": False},
            {"text": "Checklist item 2", "completed": False}
        ]
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    return data["task_id"]


class TestTasksAPI:
    """Task CRUD endpoint tests"""
    
    def test_get_tasks_empty_or_list(self, api_client):
        """GET /tasks returns list with pagination"""
        response = api_client.get(f"{BASE_URL}/api/tasks")
        assert response.status_code == 200
        data = response.json()
        assert "tasks" in data
        assert "pagination" in data
        assert isinstance(data["tasks"], list)
        assert "page" in data["pagination"]
        assert "total_count" in data["pagination"]
    
    def test_get_task_stats(self, api_client):
        """GET /tasks/stats returns statistics"""
        response = api_client.get(f"{BASE_URL}/api/tasks/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "pending" in data
        assert "in_progress" in data
        assert "completed" in data
        assert "overdue" in data
        assert "due_today" in data
    
    def test_create_task(self, api_client):
        """POST /tasks creates a new task"""
        response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Create Task Test",
            "description": "Testing task creation",
            "priority": "medium"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "task_id" in data
        assert data["task"]["title"] == "TEST_Create Task Test"
        assert data["task"]["priority"] == "medium"
        assert data["task"]["status"] == "pending"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{data['task_id']}")
    
    def test_create_task_with_checklist(self, api_client):
        """POST /tasks with checklist items"""
        response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Task with Checklist",
            "checklist": [
                {"text": "Step 1", "completed": False},
                {"text": "Step 2", "completed": False}
            ]
        })
        assert response.status_code == 200
        data = response.json()
        assert len(data["task"]["checklist"]) == 2
        assert data["task"]["checklist"][0]["text"] == "Step 1"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{data['task_id']}")
    
    def test_get_single_task(self, api_client, test_task_id):
        """GET /tasks/{task_id} returns task details"""
        response = api_client.get(f"{BASE_URL}/api/tasks/{test_task_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["task_id"] == test_task_id
        assert "activities" in data
        assert "comments" in data
    
    def test_update_task_status(self, api_client, test_task_id):
        """PUT /tasks/{task_id} updates task status"""
        response = api_client.put(f"{BASE_URL}/api/tasks/{test_task_id}", json={
            "status": "in_progress"
        })
        assert response.status_code == 200
        assert response.json()["success"] is True
        
        # Verify update
        get_response = api_client.get(f"{BASE_URL}/api/tasks/{test_task_id}")
        assert get_response.json()["status"] == "in_progress"
    
    def test_update_task_priority(self, api_client, test_task_id):
        """PUT /tasks/{task_id} updates task priority"""
        response = api_client.put(f"{BASE_URL}/api/tasks/{test_task_id}", json={
            "priority": "urgent"
        })
        assert response.status_code == 200
        
        # Verify update
        get_response = api_client.get(f"{BASE_URL}/api/tasks/{test_task_id}")
        assert get_response.json()["priority"] == "urgent"
    
    def test_filter_tasks_by_status(self, api_client):
        """GET /tasks?status=pending filters correctly"""
        response = api_client.get(f"{BASE_URL}/api/tasks?status=pending")
        assert response.status_code == 200
        data = response.json()
        for task in data["tasks"]:
            assert task["status"] == "pending"
    
    def test_filter_tasks_by_priority(self, api_client):
        """GET /tasks?priority=high filters correctly"""
        response = api_client.get(f"{BASE_URL}/api/tasks?priority=high")
        assert response.status_code == 200
        data = response.json()
        for task in data["tasks"]:
            assert task["priority"] == "high"
    
    def test_search_tasks(self, api_client):
        """GET /tasks?search=TEST filters by search term"""
        response = api_client.get(f"{BASE_URL}/api/tasks?search=TEST")
        assert response.status_code == 200
        data = response.json()
        # All returned tasks should contain TEST in title or description
        for task in data["tasks"]:
            assert "TEST" in task["title"].upper() or (task.get("description") and "TEST" in task["description"].upper())
    
    def test_pagination(self, api_client):
        """GET /tasks with pagination parameters"""
        response = api_client.get(f"{BASE_URL}/api/tasks?page=1&page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert data["pagination"]["page"] == 1
        assert data["pagination"]["page_size"] == 10


class TestChecklistAPI:
    """Checklist item endpoint tests"""
    
    def test_toggle_checklist_item(self, api_client, test_task_id):
        """PUT /tasks/{task_id}/checklist/{item_id} toggles completion"""
        # Get task to find checklist item
        task_response = api_client.get(f"{BASE_URL}/api/tasks/{test_task_id}")
        task = task_response.json()
        
        if task["checklist"]:
            item_id = task["checklist"][0]["item_id"]
            
            # Toggle to completed
            response = api_client.put(
                f"{BASE_URL}/api/tasks/{test_task_id}/checklist/{item_id}",
                json={"completed": True}
            )
            assert response.status_code == 200
            
            # Verify
            verify_response = api_client.get(f"{BASE_URL}/api/tasks/{test_task_id}")
            checklist = verify_response.json()["checklist"]
            item = next(i for i in checklist if i["item_id"] == item_id)
            assert item["completed"] is True
    
    def test_add_checklist_item(self, api_client, test_task_id):
        """POST /tasks/{task_id}/checklist adds new item"""
        response = api_client.post(
            f"{BASE_URL}/api/tasks/{test_task_id}/checklist",
            json={"text": "New checklist item"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["item"]["text"] == "New checklist item"
    
    def test_checklist_progress_updates(self, api_client, test_task_id):
        """Checklist progress updates when items are completed"""
        task_response = api_client.get(f"{BASE_URL}/api/tasks/{test_task_id}")
        task = task_response.json()
        
        # Complete all items
        for item in task["checklist"]:
            api_client.put(
                f"{BASE_URL}/api/tasks/{test_task_id}/checklist/{item['item_id']}",
                json={"completed": True}
            )
        
        # Verify progress is 100%
        verify_response = api_client.get(f"{BASE_URL}/api/tasks/{test_task_id}")
        assert verify_response.json()["checklist_progress"] == 100


class TestCommentsAPI:
    """Task comments endpoint tests"""
    
    def test_add_comment(self, api_client, test_task_id):
        """POST /tasks/{task_id}/comments adds a comment"""
        response = api_client.post(
            f"{BASE_URL}/api/tasks/{test_task_id}/comments",
            json={"content": "This is a test comment"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["comment"]["content"] == "This is a test comment"
        assert "comment_id" in data["comment"]
    
    def test_comments_appear_in_task_detail(self, api_client, test_task_id):
        """Comments appear in task detail response"""
        response = api_client.get(f"{BASE_URL}/api/tasks/{test_task_id}")
        assert response.status_code == 200
        data = response.json()
        assert "comments" in data
        assert len(data["comments"]) > 0


class TestNotificationsAPI:
    """Notification endpoint tests"""
    
    def test_get_notifications(self, api_client):
        """GET /notifications returns notification list"""
        response = api_client.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        assert "unread_count" in data
    
    def test_get_unread_count(self, api_client):
        """GET /notifications/unread-count returns count"""
        response = api_client.get(f"{BASE_URL}/api/notifications/unread-count")
        assert response.status_code == 200
        data = response.json()
        assert "unread_count" in data
        assert isinstance(data["unread_count"], int)
    
    def test_mark_all_as_read(self, api_client):
        """PUT /notifications/read-all marks all as read"""
        response = api_client.put(f"{BASE_URL}/api/notifications/read-all")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


class TestTaskWithAssociations:
    """Test tasks with customer/order associations"""
    
    def test_create_task_with_customer(self, api_client):
        """POST /tasks with customer_id associates customer"""
        # Get a customer ID first
        customers_response = api_client.get(f"{BASE_URL}/api/customers?page_size=1")
        if customers_response.status_code == 200:
            customers = customers_response.json().get("customers", [])
            if customers:
                customer_id = customers[0]["customer_id"]
                
                response = api_client.post(f"{BASE_URL}/api/tasks", json={
                    "title": "TEST_Customer Task",
                    "customer_id": customer_id
                })
                assert response.status_code == 200
                data = response.json()
                assert data["task"]["customer_id"] == customer_id
                assert data["task"]["customer_name"] is not None
                
                # Cleanup
                api_client.delete(f"{BASE_URL}/api/tasks/{data['task_id']}")
    
    def test_create_task_with_order(self, api_client):
        """POST /tasks with order_id associates order"""
        # Get an order ID first
        orders_response = api_client.get(f"{BASE_URL}/api/orders?page_size=1")
        if orders_response.status_code == 200:
            orders = orders_response.json().get("orders", [])
            if orders:
                order_id = orders[0]["order_id"]
                
                response = api_client.post(f"{BASE_URL}/api/tasks", json={
                    "title": "TEST_Order Task",
                    "order_id": order_id
                })
                assert response.status_code == 200
                data = response.json()
                assert data["task"]["order_id"] == order_id
                assert data["task"]["order_number"] is not None
                
                # Cleanup
                api_client.delete(f"{BASE_URL}/api/tasks/{data['task_id']}")


class TestTaskDeletion:
    """Test task deletion"""
    
    def test_delete_task(self, api_client):
        """DELETE /tasks/{task_id} removes task"""
        # Create a task to delete
        create_response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Task to Delete"
        })
        task_id = create_response.json()["task_id"]
        
        # Delete it
        delete_response = api_client.delete(f"{BASE_URL}/api/tasks/{task_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["success"] is True
        
        # Verify it's gone
        get_response = api_client.get(f"{BASE_URL}/api/tasks/{task_id}")
        assert get_response.status_code == 404


class TestAuthRequired:
    """Test that endpoints require authentication"""
    
    def test_tasks_requires_auth(self):
        """GET /tasks without auth returns 401"""
        response = requests.get(f"{BASE_URL}/api/tasks")
        assert response.status_code == 401
    
    def test_notifications_requires_auth(self):
        """GET /notifications without auth returns 401"""
        response = requests.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 401


# Cleanup fixture
@pytest.fixture(scope="module", autouse=True)
def cleanup(api_client):
    """Cleanup test tasks after all tests"""
    yield
    # Delete all TEST_ prefixed tasks
    response = api_client.get(f"{BASE_URL}/api/tasks?search=TEST_")
    if response.status_code == 200:
        for task in response.json().get("tasks", []):
            api_client.delete(f"{BASE_URL}/api/tasks/{task['task_id']}")
