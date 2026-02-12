import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  ListTodo,
  Plus,
  Search,
  Filter,
  Calendar as CalendarIcon,
  User,
  Users,
  Clock,
  AlertCircle,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Trash2,
  Edit,
  Share2,
  MessageSquare,
  Package,
  UserCircle,
  ChevronRight,
  Loader2,
  Flag,
  RefreshCw,
  History,
  LayoutGrid,
  List,
  GripVertical
} from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";
import { format } from "date-fns";
import { notificationEvents } from "@/components/NotificationBell";

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: "🔴" },
  high: { label: "High", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: "🟠" },
  medium: { label: "Medium", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: "🟡" },
  low: { label: "Low", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: "🟢" },
};

const STATUS_CONFIG = {
  pending: { label: "To Do", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  in_progress: { label: "In Progress", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  completed: { label: "Completed", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  cancelled: { label: "Cancelled", color: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const KANBAN_COLUMNS = [
  { id: "pending", title: "To Do", color: "border-gray-500/50" },
  { id: "in_progress", title: "In Progress", color: "border-blue-500/50" },
  { id: "completed", title: "Completed", color: "border-green-500/50" },
];

export default function Tasks({ user }) {
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [managersAdmins, setManagersAdmins] = useState([]); // For workers to assign to management
  
  // View toggles
  const [viewMode, setViewMode] = useState("kanban"); // "kanban" or "list"
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskDetail, setTaskDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // Drag state for Kanban
  const [draggedTask, setDraggedTask] = useState(null);
  
  // Create form
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    due_date: null,
    priority: "medium",
    assigned_to: "",
    customer_id: "",
    order_id: "",
    checklist: [],
    shared_with: []
  });
  const [newChecklistItem, setNewChecklistItem] = useState("");
  
  // Comment form
  const [newComment, setNewComment] = useState("");

  const fetchTasks = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("page_size", "100"); // Get more for Kanban view
      if (searchTerm) params.append("search", searchTerm);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (priorityFilter !== "all") params.append("priority", priorityFilter);
      
      // Handle "My Tasks" filter
      if (showMyTasksOnly && user?.user_id) {
        params.append("assigned_to", user.user_id);
      } else if (assigneeFilter !== "all") {
        params.append("assigned_to", assigneeFilter);
      }
      
      const response = await fetch(`${API}/tasks?${params.toString()}`, {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
        setTotalPages(data.pagination?.total_pages || 1);
        setCurrentPage(data.pagination?.page || 1);
      }
    } catch (error) {
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, priorityFilter, assigneeFilter]);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API}/tasks/stats`, { credentials: "include" });
      if (response.ok) {
        setStats(await response.json());
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch(`${API}/users`, { credentials: "include" });
      if (response.ok) {
        setTeamMembers(await response.json());
      }
    } catch (error) {
      console.error("Failed to fetch team:", error);
    }
  };

  const fetchManagersAdmins = async () => {
    try {
      const response = await fetch(`${API}/users/managers-admins`, { credentials: "include" });
      if (response.ok) {
        setManagersAdmins(await response.json());
      }
    } catch (error) {
      console.error("Failed to fetch managers/admins:", error);
    }
  };

  const fetchTaskDetail = async (taskId) => {
    try {
      setDetailLoading(true);
      const response = await fetch(`${API}/tasks/${taskId}`, { credentials: "include" });
      if (response.ok) {
        setTaskDetail(await response.json());
      }
    } catch (error) {
      toast.error("Failed to load task details");
    } finally {
      setDetailLoading(false);
    }
  };

  const createTask = async () => {
    if (!newTask.title.trim()) {
      toast.error("Task title is required");
      return;
    }
    
    try {
      const payload = {
        ...newTask,
        due_date: newTask.due_date ? newTask.due_date.toISOString() : null,
        checklist: newTask.checklist.map(text => ({ text, completed: false })),
        assigned_to: newTask.assigned_to && newTask.assigned_to !== "unassigned" ? newTask.assigned_to : null,
        customer_id: newTask.customer_id || null,
        order_id: newTask.order_id || null,
      };
      
      const response = await fetch(`${API}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        toast.success("Task created");
        setShowCreateDialog(false);
        resetNewTask();
        fetchTasks(1);
        fetchStats();
        // Trigger notification refresh
        notificationEvents.emit();
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to create task");
      }
    } catch (error) {
      toast.error("Failed to create task");
    }
  };

  const updateTaskStatus = async (taskId, status) => {
    try {
      const response = await fetch(`${API}/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      
      if (response.ok) {
        toast.success(`Task marked as ${status}`);
        fetchTasks(currentPage);
        fetchStats();
        if (taskDetail?.task_id === taskId) {
          fetchTaskDetail(taskId);
        }
      }
    } catch (error) {
      toast.error("Failed to update task");
    }
  };

  const toggleChecklistItem = async (taskId, itemId, completed) => {
    try {
      const response = await fetch(`${API}/tasks/${taskId}/checklist/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ completed }),
      });
      
      if (response.ok) {
        fetchTaskDetail(taskId);
      }
    } catch (error) {
      toast.error("Failed to update checklist");
    }
  };

  const addChecklistItemToTask = async (taskId, text) => {
    try {
      const response = await fetch(`${API}/tasks/${taskId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      
      if (response.ok) {
        fetchTaskDetail(taskId);
      }
    } catch (error) {
      toast.error("Failed to add checklist item");
    }
  };

  const addComment = async () => {
    if (!newComment.trim() || !taskDetail) return;
    
    try {
      const response = await fetch(`${API}/tasks/${taskDetail.task_id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: newComment }),
      });
      
      if (response.ok) {
        toast.success("Comment added");
        setNewComment("");
        fetchTaskDetail(taskDetail.task_id);
      }
    } catch (error) {
      toast.error("Failed to add comment");
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    
    try {
      const response = await fetch(`${API}/tasks/${taskId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (response.ok) {
        toast.success("Task deleted");
        setSelectedTask(null);
        setTaskDetail(null);
        fetchTasks(currentPage);
        fetchStats();
      }
    } catch (error) {
      toast.error("Failed to delete task");
    }
  };

  const resetNewTask = () => {
    setNewTask({
      title: "",
      description: "",
      due_date: null,
      priority: "medium",
      assigned_to: "",
      customer_id: "",
      order_id: "",
      checklist: [],
      shared_with: []
    });
    setNewChecklistItem("");
  };

  const addChecklistToNewTask = () => {
    if (!newChecklistItem.trim()) return;
    setNewTask(prev => ({
      ...prev,
      checklist: [...prev.checklist, newChecklistItem.trim()]
    }));
    setNewChecklistItem("");
  };

  const removeChecklistFromNewTask = (index) => {
    setNewTask(prev => ({
      ...prev,
      checklist: prev.checklist.filter((_, i) => i !== index)
    }));
  };

  // Drag and drop handlers for Kanban
  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.status === newStatus) {
      setDraggedTask(null);
      return;
    }
    
    // Optimistically update UI
    setTasks(prev => prev.map(t => 
      t.task_id === draggedTask.task_id ? { ...t, status: newStatus } : t
    ));
    
    // Update on server
    await updateTaskStatus(draggedTask.task_id, newStatus);
    setDraggedTask(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
  };

  // Get tasks grouped by status for Kanban view
  const getTasksByStatus = (status) => {
    return tasks.filter(t => t.status === status);
  };

  useEffect(() => {
    fetchTeamMembers();
    fetchStats();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      setCurrentPage(1);
      fetchTasks(1);
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm, statusFilter, priorityFilter, assigneeFilter, showMyTasksOnly]);

  useEffect(() => {
    if (selectedTask) {
      fetchTaskDetail(selectedTask);
    }
  }, [selectedTask]);

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return format(new Date(dateStr), "MMM d, yyyy");
  };

  return (
    <div className="space-y-6" data-testid="tasks-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold flex items-center gap-2">
            <ListTodo className="w-8 h-8" />
            Tasks
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage tasks across orders and customers
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2" data-testid="create-task-btn">
          <Plus className="w-4 h-4" />
          Create Task
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-gray-400">{stats.pending || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">In Progress</p>
              <p className="text-2xl font-bold text-blue-400">{stats.in_progress || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold text-green-400">{stats.completed || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50 border-red-500/30">
            <CardContent className="pt-4">
              <p className="text-xs text-red-400">Overdue</p>
              <p className="text-2xl font-bold text-red-400">{stats.overdue || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50 border-amber-500/30">
            <CardContent className="pt-4">
              <p className="text-xs text-amber-400">Due Today</p>
              <p className="text-2xl font-bold text-amber-400">{stats.due_today || 0}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters & View Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View Toggle */}
        <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-1">
          <Button
            variant={viewMode === "kanban" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("kanban")}
            className="gap-1"
          >
            <LayoutGrid className="w-4 h-4" />
            Kanban
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="gap-1"
          >
            <List className="w-4 h-4" />
            List
          </Button>
        </div>
        
        {/* My Tasks Toggle */}
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg">
          <Switch
            id="my-tasks"
            checked={showMyTasksOnly}
            onCheckedChange={setShowMyTasksOnly}
          />
          <Label htmlFor="my-tasks" className="text-sm cursor-pointer">
            My Tasks
          </Label>
        </div>
        
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-background"
            data-testid="search-tasks"
          />
        </div>
        
        {viewMode === "list" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        )}
        
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px] bg-background">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="urgent">🔴 Urgent</SelectItem>
            <SelectItem value="high">🟠 High</SelectItem>
            <SelectItem value="medium">🟡 Medium</SelectItem>
            <SelectItem value="low">🟢 Low</SelectItem>
          </SelectContent>
        </Select>
        
        {!showMyTasksOnly && (
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[160px] bg-background">
              <User className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {teamMembers.map(member => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        <Button variant="ghost" size="sm" onClick={() => fetchTasks(currentPage)}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Kanban View */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {KANBAN_COLUMNS.map((column) => (
            <div
              key={column.id}
              className={`bg-card/30 rounded-lg border-2 border-dashed ${column.color} min-h-[500px] flex flex-col`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className="p-3 border-b border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{column.title}</h3>
                  <Badge variant="outline" className="text-xs">
                    {getTasksByStatus(column.id).length}
                  </Badge>
                </div>
                {column.id === "pending" && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowCreateDialog(true)}
                    className="h-7 w-7 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                )}
              </div>
              
              {/* Column Content */}
              <ScrollArea className="flex-1 p-2">
                <div className="space-y-2">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : getTasksByStatus(column.id).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <p>No tasks</p>
                    </div>
                  ) : (
                    getTasksByStatus(column.id).map((task) => (
                      <div
                        key={task.task_id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedTask(task.task_id)}
                        className={`
                          p-3 rounded-lg bg-card border border-border/50 cursor-pointer
                          hover:border-primary/50 hover:shadow-md transition-all
                          ${draggedTask?.task_id === task.task_id ? 'opacity-50 scale-95' : ''}
                          ${isOverdue(task.due_date) && task.status !== 'completed' ? 'border-red-500/50' : ''}
                        `}
                        data-testid={`kanban-task-${task.task_id}`}
                      >
                        {/* Task Card Header */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{task.title}</p>
                          </div>
                          <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0 cursor-grab" />
                        </div>
                        
                        {/* Task Description */}
                        {task.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                            {task.description}
                          </p>
                        )}
                        
                        {/* Task Meta */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Priority */}
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${PRIORITY_CONFIG[task.priority]?.color}`}
                          >
                            {PRIORITY_CONFIG[task.priority]?.icon}
                          </Badge>
                          
                          {/* Due Date */}
                          {task.due_date && (
                            <span className={`text-xs flex items-center gap-1 ${
                              isOverdue(task.due_date) && task.status !== 'completed' 
                                ? 'text-red-400' 
                                : 'text-muted-foreground'
                            }`}>
                              <CalendarIcon className="w-3 h-3" />
                              {formatDate(task.due_date)}
                            </span>
                          )}
                          
                          {/* Checklist Progress */}
                          {task.checklist?.length > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              {task.checklist.filter(c => c.completed).length}/{task.checklist.length}
                            </span>
                          )}
                        </div>
                        
                        {/* Assignee */}
                        {task.assigned_name && (
                          <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-1">
                            <UserCircle className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground truncate">
                              {task.assigned_name}
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No tasks found</p>
                <Button variant="outline" className="mt-4" onClick={() => setShowCreateDialog(true)}>
                  Create your first task
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {tasks.map((task) => (
                <div
                  key={task.task_id}
                  className="flex items-center gap-4 p-4 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setSelectedTask(task.task_id)}
                  data-testid={`task-row-${task.task_id}`}
                >
                  {/* Status checkbox */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={task.status === "completed"}
                      onCheckedChange={(checked) => 
                        updateTaskStatus(task.task_id, checked ? "completed" : "pending")
                      }
                    />
                  </div>
                  
                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{PRIORITY_CONFIG[task.priority]?.icon}</span>
                      <p className={`font-medium truncate ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                        {task.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {task.due_date && (
                        <span className={`flex items-center gap-1 ${isOverdue(task.due_date) && task.status !== "completed" ? "text-red-400" : ""}`}>
                          <CalendarIcon className="w-3 h-3" />
                          {formatDate(task.due_date)}
                        </span>
                      )}
                      {task.assigned_name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {task.assigned_name}
                        </span>
                      )}
                      {task.customer_name && (
                        <span className="flex items-center gap-1">
                          <UserCircle className="w-3 h-3" />
                          {task.customer_name}
                        </span>
                      )}
                      {task.order_number && (
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          #{task.order_number}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Checklist progress */}
                  {task.checklist?.length > 0 && (
                    <div className="w-20">
                      <Progress value={task.checklist_progress || 0} className="h-1" />
                      <p className="text-xs text-muted-foreground mt-1 text-center">
                        {task.checklist?.filter(i => i.completed).length}/{task.checklist?.length}
                      </p>
                    </div>
                  )}
                  
                  {/* Status badge */}
                  <Badge variant="outline" className={STATUS_CONFIG[task.status]?.color}>
                    {STATUS_CONFIG[task.status]?.label}
                  </Badge>
                  
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => {
                    setCurrentPage(p => p - 1);
                    fetchTasks(currentPage - 1);
                  }}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => {
                    setCurrentPage(p => p + 1);
                    fetchTasks(currentPage + 1);
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Create Task Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Task title..."
                data-testid="task-title-input"
              />
            </div>
            
            <div>
              <Label>Description</Label>
              <Textarea
                value={newTask.description}
                onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Task description..."
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {newTask.due_date ? format(newTask.due_date, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={newTask.due_date}
                      onSelect={(date) => setNewTask(prev => ({ ...prev, due_date: date }))}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Label>Priority</Label>
                <Select 
                  value={newTask.priority} 
                  onValueChange={(val) => setNewTask(prev => ({ ...prev, priority: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">🔴 Urgent</SelectItem>
                    <SelectItem value="high">🟠 High</SelectItem>
                    <SelectItem value="medium">🟡 Medium</SelectItem>
                    <SelectItem value="low">🟢 Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label>Assign To</Label>
              <Select 
                value={newTask.assigned_to} 
                onValueChange={(val) => setNewTask(prev => ({ ...prev, assigned_to: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teamMembers.map(member => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Checklist */}
            <div>
              <Label>Checklist</Label>
              <div className="space-y-2 mt-2">
                {newTask.checklist.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 bg-muted/30 rounded px-3 py-2">
                    <Circle className="w-4 h-4 text-muted-foreground" />
                    <span className="flex-1 text-sm">{item}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => removeChecklistFromNewTask(index)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    value={newChecklistItem}
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    placeholder="Add checklist item..."
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChecklistToNewTask())}
                  />
                  <Button size="sm" variant="outline" onClick={addChecklistToNewTask}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => (setShowCreateDialog(false), resetNewTask())}>
              Cancel
            </Button>
            <Button onClick={createTask} data-testid="save-task-btn">
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {taskDetail && (
                <>
                  <span>{PRIORITY_CONFIG[taskDetail.priority]?.icon}</span>
                  <span className="truncate">{taskDetail.title}</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : taskDetail ? (
            <Tabs defaultValue="details" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="checklist">Checklist ({taskDetail.checklist?.length || 0})</TabsTrigger>
                <TabsTrigger value="comments">Comments ({taskDetail.comments?.length || 0})</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              
              <ScrollArea className="flex-1 mt-4">
                <TabsContent value="details" className="space-y-4 mt-0">
                  {/* Status & Priority */}
                  <div className="flex items-center gap-3">
                    <Select 
                      value={taskDetail.status}
                      onValueChange={(val) => updateTaskStatus(taskDetail.task_id, val)}
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Badge variant="outline" className={PRIORITY_CONFIG[taskDetail.priority]?.color}>
                      {PRIORITY_CONFIG[taskDetail.priority]?.label} Priority
                    </Badge>
                    
                    {taskDetail.due_date && (
                      <Badge variant="outline" className={isOverdue(taskDetail.due_date) && taskDetail.status !== "completed" ? "text-red-400 border-red-500/30" : ""}>
                        <CalendarIcon className="w-3 h-3 mr-1" />
                        {formatDate(taskDetail.due_date)}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Description */}
                  {taskDetail.description && (
                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-sm whitespace-pre-wrap">{taskDetail.description}</p>
                    </div>
                  )}
                  
                  {/* Meta info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Assigned to</p>
                      <p className="font-medium">{taskDetail.assigned_name || "Unassigned"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Created by</p>
                      <p className="font-medium">{taskDetail.created_by_name}</p>
                    </div>
                    {taskDetail.customer && (
                      <div>
                        <p className="text-muted-foreground">Customer</p>
                        <p className="font-medium">{taskDetail.customer.full_name}</p>
                      </div>
                    )}
                    {taskDetail.order && (
                      <div>
                        <p className="text-muted-foreground">Order</p>
                        <p className="font-medium">#{taskDetail.order.order_number}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-4 border-t">
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => deleteTask(taskDetail.task_id)}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="checklist" className="space-y-3 mt-0">
                  {taskDetail.checklist?.map((item) => (
                    <div key={item.item_id} className="flex items-center gap-3 bg-muted/30 rounded-lg p-3">
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={(checked) => toggleChecklistItem(taskDetail.task_id, item.item_id, checked)}
                      />
                      <span className={`flex-1 ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                  
                  <div className="flex items-center gap-2 pt-2">
                    <Input
                      placeholder="Add checklist item..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.target.value.trim()) {
                          addChecklistItemToTask(taskDetail.task_id, e.target.value.trim());
                          e.target.value = "";
                        }
                      }}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="comments" className="space-y-4 mt-0">
                  <div className="flex items-start gap-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      rows={2}
                    />
                    <Button onClick={addComment} disabled={!newComment.trim()}>
                      Send
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {taskDetail.comments?.map((comment) => (
                      <div key={comment.comment_id} className="bg-muted/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{comment.user_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(comment.created_at)}
                          </span>
                        </div>
                        <p className="text-sm">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="history" className="space-y-2 mt-0">
                  {taskDetail.activities?.map((activity) => (
                    <div key={activity.activity_id} className="flex items-start gap-3 text-sm">
                      <History className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <span className="font-medium">{activity.user_name}</span>
                        <span className="text-muted-foreground"> {activity.action.replace(/_/g, " ")} </span>
                        <span className="text-xs text-muted-foreground">
                          · {formatDate(activity.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Export for use in other components
export { PRIORITY_CONFIG, STATUS_CONFIG };
