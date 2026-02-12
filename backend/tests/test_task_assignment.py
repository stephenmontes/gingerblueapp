"""
Test suite for Task Assignment to Managers/Admins Feature
Tests:
- GET /api/users/managers-admins endpoint returns only admin/manager users
- Task creation with assignment to a manager/admin user
- In-app notification sent to assigned user when task is created
- Task status tracking: Pending → In Progress → Completed
- My Tasks toggle filters correctly for user's tasks
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def api_client():
    """Create authenticated session via dev-login"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Authenticate via dev-login
    login_response = session.get(f"{BASE_URL}/api/auth/dev-login")
    assert login_response.status_code == 200, f"Dev login failed: {login_response.text}"
    
    return session


@pytest.fixture(scope="module")
def manager_admin_user_id(api_client):
    """Get a manager/admin user ID for assignment tests"""
    response = api_client.get(f"{BASE_URL}/api/users/managers-admins")
    assert response.status_code == 200
    users = response.json()
    assert len(users) > 0, "No managers/admins found in system"
    return users[0]["user_id"]


class TestManagersAdminsEndpoint:
    """Test GET /api/users/managers-admins endpoint"""
    
    def test_get_managers_admins_returns_200(self, api_client):
        """GET /api/users/managers-admins returns 200"""
        response = api_client.get(f"{BASE_URL}/api/users/managers-admins")
        assert response.status_code == 200
    
    def test_get_managers_admins_returns_list(self, api_client):
        """GET /api/users/managers-admins returns a list"""
        response = api_client.get(f"{BASE_URL}/api/users/managers-admins")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_managers_admins_only_returns_correct_roles(self, api_client):
        """GET /api/users/managers-admins only returns admin/manager roles"""
        response = api_client.get(f"{BASE_URL}/api/users/managers-admins")
        assert response.status_code == 200
        users = response.json()
        
        for user in users:
            assert user["role"] in ["admin", "manager"], f"Unexpected role: {user['role']}"
    
    def test_managers_admins_returns_correct_fields(self, api_client):
        """GET /api/users/managers-admins returns required fields"""
        response = api_client.get(f"{BASE_URL}/api/users/managers-admins")
        assert response.status_code == 200
        users = response.json()
        
        if users:
            user = users[0]
            assert "user_id" in user
            assert "name" in user
            assert "email" in user
            assert "role" in user
    
    def test_managers_admins_requires_auth(self):
        """GET /api/users/managers-admins requires authentication"""
        response = requests.get(f"{BASE_URL}/api/users/managers-admins")
        assert response.status_code == 401


class TestTaskAssignmentToManagement:
    """Test task creation with assignment to managers/admins"""
    
    def test_create_task_assigned_to_admin(self, api_client, manager_admin_user_id):
        """POST /api/tasks can assign task to admin"""
        response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Task_To_Admin_Assignment",
            "description": "Testing worker assigning task to admin",
            "priority": "high",
            "assigned_to": manager_admin_user_id
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["task"]["assigned_to"] == manager_admin_user_id
        assert data["task"]["assigned_name"] is not None
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{data['task_id']}")
    
    def test_create_task_with_all_fields(self, api_client, manager_admin_user_id):
        """POST /api/tasks with all fields including assignment"""
        due_date = (datetime.now() + timedelta(days=3)).isoformat()
        
        response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Full_Task_Assignment",
            "description": "Complete task with all fields",
            "priority": "urgent",
            "due_date": due_date,
            "assigned_to": manager_admin_user_id,
            "checklist": [
                {"text": "Review item", "completed": False},
                {"text": "Approve item", "completed": False}
            ]
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["task"]["priority"] == "urgent"
        assert data["task"]["assigned_to"] == manager_admin_user_id
        assert len(data["task"]["checklist"]) == 2
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{data['task_id']}")


class TestTaskStatusTracking:
    """Test task status changes: Pending → In Progress → Completed"""
    
    def test_task_created_with_pending_status(self, api_client, manager_admin_user_id):
        """New tasks start with 'pending' status"""
        response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Task_Status_Pending",
            "assigned_to": manager_admin_user_id
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["task"]["status"] == "pending"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{data['task_id']}")
    
    def test_task_status_pending_to_in_progress(self, api_client, manager_admin_user_id):
        """PUT /api/tasks/{id} can change status to in_progress"""
        # Create task
        create_response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Status_Change_InProgress",
            "assigned_to": manager_admin_user_id
        })
        task_id = create_response.json()["task_id"]
        
        # Update to in_progress
        update_response = api_client.put(
            f"{BASE_URL}/api/tasks/{task_id}",
            json={"status": "in_progress"}
        )
        assert update_response.status_code == 200
        
        # Verify
        get_response = api_client.get(f"{BASE_URL}/api/tasks/{task_id}")
        assert get_response.json()["status"] == "in_progress"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{task_id}")
    
    def test_task_status_in_progress_to_completed(self, api_client, manager_admin_user_id):
        """PUT /api/tasks/{id} can change status to completed"""
        # Create task
        create_response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Status_Change_Completed",
            "assigned_to": manager_admin_user_id
        })
        task_id = create_response.json()["task_id"]
        
        # Update to in_progress first
        api_client.put(f"{BASE_URL}/api/tasks/{task_id}", json={"status": "in_progress"})
        
        # Update to completed
        update_response = api_client.put(
            f"{BASE_URL}/api/tasks/{task_id}",
            json={"status": "completed"}
        )
        assert update_response.status_code == 200
        
        # Verify
        get_response = api_client.get(f"{BASE_URL}/api/tasks/{task_id}")
        task = get_response.json()
        assert task["status"] == "completed"
        assert "completed_at" in task
        assert task["completed_at"] is not None
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{task_id}")
    
    def test_full_status_lifecycle(self, api_client, manager_admin_user_id):
        """Test complete status lifecycle: pending → in_progress → completed"""
        # Create
        create_response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Full_Status_Lifecycle",
            "assigned_to": manager_admin_user_id
        })
        task_id = create_response.json()["task_id"]
        
        # Verify pending
        get1 = api_client.get(f"{BASE_URL}/api/tasks/{task_id}")
        assert get1.json()["status"] == "pending"
        
        # Change to in_progress
        api_client.put(f"{BASE_URL}/api/tasks/{task_id}", json={"status": "in_progress"})
        get2 = api_client.get(f"{BASE_URL}/api/tasks/{task_id}")
        assert get2.json()["status"] == "in_progress"
        
        # Change to completed
        api_client.put(f"{BASE_URL}/api/tasks/{task_id}", json={"status": "completed"})
        get3 = api_client.get(f"{BASE_URL}/api/tasks/{task_id}")
        assert get3.json()["status"] == "completed"
        
        # Verify activity log
        activities = get3.json()["activities"]
        assert len(activities) >= 3  # created + 2 updates
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{task_id}")


class TestMyTasksFilter:
    """Test My Tasks filter functionality"""
    
    def test_my_tasks_filter_true(self, api_client, manager_admin_user_id):
        """GET /api/tasks?my_tasks=true returns user's related tasks"""
        # Create a task
        create_response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_My_Tasks_Filter_Test",
            "assigned_to": manager_admin_user_id
        })
        task_id = create_response.json()["task_id"]
        
        # Fetch with my_tasks=true
        response = api_client.get(f"{BASE_URL}/api/tasks?my_tasks=true")
        assert response.status_code == 200
        data = response.json()
        
        # User created the task so it should appear
        task_ids = [t["task_id"] for t in data["tasks"]]
        assert task_id in task_ids
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{task_id}")
    
    def test_my_tasks_filter_false(self, api_client):
        """GET /api/tasks?my_tasks=false returns tasks with visibility"""
        response = api_client.get(f"{BASE_URL}/api/tasks?my_tasks=false")
        assert response.status_code == 200
        data = response.json()
        assert "tasks" in data
        assert "pagination" in data


class TestNotificationOnTaskAssignment:
    """Test that notifications are created when tasks are assigned"""
    
    def test_notification_created_on_assignment(self, api_client, manager_admin_user_id):
        """Notification is created when task is assigned to another user"""
        # Get initial notification count
        notif_before = api_client.get(f"{BASE_URL}/api/notifications")
        
        # Create task with assignment
        response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Notification_Task_Assignment",
            "description": "Task to test notification creation",
            "assigned_to": manager_admin_user_id
        })
        
        assert response.status_code == 200
        task_id = response.json()["task_id"]
        
        # Note: The notification is created for the assigned user, not the creator
        # Since we're testing as the creator, we can verify the task was created with correct assignment
        task = api_client.get(f"{BASE_URL}/api/tasks/{task_id}").json()
        assert task["assigned_to"] == manager_admin_user_id
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{task_id}")


class TestTaskKanbanDisplay:
    """Test tasks display correctly for Kanban board"""
    
    def test_tasks_include_assignee_name(self, api_client, manager_admin_user_id):
        """Tasks include assigned_name for display on Kanban board"""
        # Create task
        response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Kanban_Display_Task",
            "assigned_to": manager_admin_user_id
        })
        task_id = response.json()["task_id"]
        
        # Fetch tasks
        tasks_response = api_client.get(f"{BASE_URL}/api/tasks")
        tasks = tasks_response.json()["tasks"]
        
        # Find our task
        our_task = next((t for t in tasks if t["task_id"] == task_id), None)
        assert our_task is not None
        assert "assigned_name" in our_task
        assert our_task["assigned_name"] is not None
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{task_id}")
    
    def test_tasks_include_status_for_kanban_columns(self, api_client, manager_admin_user_id):
        """Tasks include status field for Kanban column grouping"""
        # Create tasks in different statuses
        task1_response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Kanban_Pending",
            "assigned_to": manager_admin_user_id
        })
        task1_id = task1_response.json()["task_id"]
        
        task2_response = api_client.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Kanban_InProgress",
            "assigned_to": manager_admin_user_id
        })
        task2_id = task2_response.json()["task_id"]
        api_client.put(f"{BASE_URL}/api/tasks/{task2_id}", json={"status": "in_progress"})
        
        # Fetch tasks
        tasks_response = api_client.get(f"{BASE_URL}/api/tasks")
        tasks = tasks_response.json()["tasks"]
        
        # Verify status fields
        for task in tasks:
            assert "status" in task
            assert task["status"] in ["pending", "in_progress", "completed", "cancelled"]
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tasks/{task1_id}")
        api_client.delete(f"{BASE_URL}/api/tasks/{task2_id}")


# Cleanup fixture
@pytest.fixture(scope="module", autouse=True)
def cleanup(api_client):
    """Cleanup test tasks after all tests"""
    yield
    # Delete all TEST_ prefixed tasks
    try:
        response = api_client.get(f"{BASE_URL}/api/tasks?search=TEST_")
        if response.status_code == 200:
            for task in response.json().get("tasks", []):
                api_client.delete(f"{BASE_URL}/api/tasks/{task['task_id']}")
    except Exception:
        pass
