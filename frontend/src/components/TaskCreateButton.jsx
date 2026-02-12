import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ListTodo, Plus, Calendar as CalendarIcon, Circle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";
import { format } from "date-fns";
import { notificationEvents } from "./NotificationBell";

export function TaskCreateButton({ 
  customerId = null, 
  customerName = null,
  orderId = null, 
  orderNumber = null,
  variant = "outline",
  size = "sm",
  className = "",
  children = null,
  onTaskCreated = null,
  user = null, // Add user prop to determine role
  ...restProps
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [managersAdmins, setManagersAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [task, setTask] = useState({
    title: "",
    description: "",
    due_date: null,
    priority: "medium",
    assigned_to: "",
    checklist: []
  });
  const [newChecklistItem, setNewChecklistItem] = useState("");

  useEffect(() => {
    if (showDialog) {
      fetchManagersAdmins();
      // Only fetch all team members for managers/admins
      if (user?.role === "admin" || user?.role === "manager") {
        fetchTeamMembers();
      }
    }
  }, [showDialog, user?.role]);

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

  const createTask = async () => {
    if (!task.title.trim()) {
      toast.error("Task title is required");
      return;
    }
    
    setLoading(true);
    try {
      const payload = {
        ...task,
        due_date: task.due_date ? task.due_date.toISOString() : null,
        checklist: task.checklist.map(text => ({ text, completed: false })),
        assigned_to: task.assigned_to && task.assigned_to !== "unassigned" ? task.assigned_to : null,
        customer_id: customerId,
        order_id: orderId,
      };
      
      const response = await fetch(`${API}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        toast.success("Task created");
        setShowDialog(false);
        resetTask();
        onTaskCreated?.();
        // Trigger notification refresh for all listeners
        notificationEvents.emit();
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to create task");
      }
    } catch (error) {
      toast.error("Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  const resetTask = () => {
    setTask({
      title: "",
      description: "",
      due_date: null,
      priority: "medium",
      assigned_to: "",
      checklist: []
    });
    setNewChecklistItem("");
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    setTask(prev => ({
      ...prev,
      checklist: [...prev.checklist, newChecklistItem.trim()]
    }));
    setNewChecklistItem("");
  };

  const removeChecklistItem = (index) => {
    setTask(prev => ({
      ...prev,
      checklist: prev.checklist.filter((_, i) => i !== index)
    }));
  };

  const handleButtonClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDialog(true);
  };

  return (
    <>
      <Button 
        variant={variant} 
        size={size} 
        className={className}
        onClick={handleButtonClick}
        type="button"
        {...restProps}
      >
        {children || (
          <>
            <ListTodo className="w-4 h-4 mr-1" />
            Task
          </>
        )}
      </Button>

      {showDialog && createPortal(
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto z-[100]" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
              <ListTodo className="w-5 h-5" />
              Create Task
            </DialogTitle>
          </DialogHeader>
          
          {/* Context info */}
          {(customerName || orderNumber) && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              {customerName && <p>Customer: <strong>{customerName}</strong></p>}
              {orderNumber && <p>Order: <strong>#{orderNumber}</strong></p>}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={task.title}
                onChange={(e) => setTask(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Task title..."
              />
            </div>
            
            <div>
              <Label>Description</Label>
              <Textarea
                value={task.description}
                onChange={(e) => setTask(prev => ({ ...prev, description: e.target.value }))}
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
                      {task.due_date ? format(task.due_date, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={task.due_date}
                      onSelect={(date) => setTask(prev => ({ ...prev, due_date: date }))}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Label>Priority</Label>
                <Select 
                  value={task.priority} 
                  onValueChange={(val) => setTask(prev => ({ ...prev, priority: val }))}
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
                value={task.assigned_to} 
                onValueChange={(val) => setTask(prev => ({ ...prev, assigned_to: val }))}
              >
                <SelectTrigger data-testid="task-assign-to-select">
                  <SelectValue placeholder="Select assignee..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  
                  {/* Managers & Admins Section - Always visible to all users */}
                  {managersAdmins.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                        Management
                      </div>
                      {managersAdmins.map(member => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          <div className="flex items-center gap-2">
                            <span>{member.name}</span>
                            <Badge variant="outline" className="text-xs py-0 h-4 capitalize">
                              {member.role}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  
                  {/* All Team Members - Only visible to managers/admins */}
                  {(user?.role === "admin" || user?.role === "manager") && teamMembers.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                        All Team Members
                      </div>
                      {teamMembers
                        .filter(m => !managersAdmins.some(ma => ma.user_id === m.user_id))
                        .map(member => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            <div className="flex items-center gap-2">
                              <span>{member.name}</span>
                              <Badge variant="outline" className="text-xs py-0 h-4 capitalize opacity-60">
                                {member.role}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {user?.role === "worker" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Assign tasks to management for review or action
                </p>
              )}
            </div>
            
            {/* Checklist */}
            <div>
              <Label>Checklist</Label>
              <div className="space-y-2 mt-2">
                {task.checklist.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 bg-muted/30 rounded px-3 py-2">
                    <Circle className="w-4 h-4 text-muted-foreground" />
                    <span className="flex-1 text-sm">{item}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => removeChecklistItem(index)}
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
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChecklistItem())}
                  />
                  <Button size="sm" variant="outline" onClick={addChecklistItem}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => (setShowDialog(false), resetTask())}>
              Cancel
            </Button>
            <Button onClick={createTask} disabled={loading}>
              {loading ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
      document.body
      )}
    </>
  );
}
