import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Clock, 
  Plus, 
  Pencil, 
  Trash2, 
  Loader2,
  Calendar,
  User,
  BarChart3,
  DollarSign
} from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";


export function ProductionTimeEntryDialog({ isOpen, onClose, user }) {
  const [activeTab, setActiveTab] = useState("history");
  const [timeEntries, setTimeEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState(null);
  
  // Add entry form state
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    user_id: "",
    user_name: "",
    stage_id: "",
    stage_name: "",
    duration_minutes: "",
    items_processed: "0",
    notes: "",
    entry_date: new Date().toISOString().split("T")[0]
  });
  const [addLoading, setAddLoading] = useState(false);
  
  // Edit state
  const [editEntry, setEditEntry] = useState(null);
  const [editForm, setEditForm] = useState({
    duration_minutes: "",
    items_processed: "",
    notes: ""
  });
  const [editLoading, setEditLoading] = useState(false);
  
  // Delete state
  const [deleteEntry, setDeleteEntry] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  async function loadData() {
    setLoading(true);
    try {
      const [entriesRes, usersRes, stagesRes, kpisRes] = await Promise.all([
        fetch(`${API}/production/admin/time-entries?limit=100`, { credentials: "include" }),
        fetch(`${API}/fulfillment/admin/users`, { credentials: "include" }),
        fetch(`${API}/stages`, { credentials: "include" }),
        fetch(`${API}/production/stats/overall-kpis?period=this_week`, { credentials: "include" })
      ]);
      
      if (entriesRes.ok) setTimeEntries(await entriesRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (stagesRes.ok) setStages(await stagesRes.json());
      if (kpisRes.ok) setKpis(await kpisRes.json());
    } catch (err) {
      toast.error("Failed to load time entry data");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEntry() {
    if (!addForm.user_id || !addForm.stage_id || !addForm.duration_minutes) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    setAddLoading(true);
    try {
      const selectedUser = users.find(u => u.user_id === addForm.user_id);
      const selectedStage = stages.find(s => s.stage_id === addForm.stage_id);
      
      const params = new URLSearchParams({
        user_id: addForm.user_id,
        user_name: selectedUser?.name || addForm.user_name,
        stage_id: addForm.stage_id,
        stage_name: selectedStage?.name || addForm.stage_name,
        duration_minutes: addForm.duration_minutes,
        items_processed: addForm.items_processed || "0"
      });
      
      if (addForm.notes) params.append("notes", addForm.notes);
      if (addForm.entry_date) params.append("entry_date", addForm.entry_date);
      
      const res = await fetch(`${API}/production/admin/time-entries/add?${params}`, {
        method: "POST",
        credentials: "include"
      });
      
      if (res.ok) {
        toast.success("Time entry added");
        setAddFormOpen(false);
        setAddForm({
          user_id: "",
          user_name: "",
          stage_id: "",
          stage_name: "",
          duration_minutes: "",
          items_processed: "0",
          notes: "",
          entry_date: new Date().toISOString().split("T")[0]
        });
        loadData();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to add time entry");
      }
    } catch (err) {
      toast.error("Failed to add time entry");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleEditEntry() {
    if (!editEntry) return;
    
    setEditLoading(true);
    try {
      const params = new URLSearchParams();
      if (editForm.duration_minutes) params.append("duration_minutes", editForm.duration_minutes);
      if (editForm.items_processed) params.append("items_processed", editForm.items_processed);
      if (editForm.notes) params.append("notes", editForm.notes);
      
      const res = await fetch(`${API}/production/admin/time-entries/${editEntry.log_id}?${params}`, {
        method: "PUT",
        credentials: "include"
      });
      
      if (res.ok) {
        toast.success("Time entry updated");
        setEditEntry(null);
        loadData();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to update time entry");
      }
    } catch (err) {
      toast.error("Failed to update time entry");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteEntry() {
    if (!deleteEntry) return;
    
    setDeleteLoading(true);
    try {
      const res = await fetch(`${API}/production/admin/time-entries/${deleteEntry.log_id}`, {
        method: "DELETE",
        credentials: "include"
      });
      
      if (res.ok) {
        toast.success("Time entry deleted");
        setDeleteEntry(null);
        loadData();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to delete time entry");
      }
    } catch (err) {
      toast.error("Failed to delete time entry");
    } finally {
      setDeleteLoading(false);
    }
  }

  function openEditDialog(entry) {
    setEditEntry(entry);
    setEditForm({
      duration_minutes: entry.duration_minutes?.toString() || "",
      items_processed: entry.items_processed?.toString() || "0",
      notes: entry.admin_notes || ""
    });
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return "—";
    try {
      const date = new Date(isoStr);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
    } catch {
      return isoStr;
    }
  }

  function formatDuration(minutes) {
    if (!minutes) return "0m";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Production Time Entry Management
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="history" data-testid="time-history-tab">Time History</TabsTrigger>
                <TabsTrigger value="kpis" data-testid="time-kpis-tab">KPIs & Stats</TabsTrigger>
              </TabsList>

              <TabsContent value="history" className="flex-1 overflow-hidden flex flex-col mt-4">
                {/* Add Entry Button */}
                {isAdmin && (
                  <div className="flex justify-end mb-4">
                    <Button
                      onClick={() => setAddFormOpen(true)}
                      className="gap-2"
                      data-testid="add-time-entry-btn"
                    >
                      <Plus className="w-4 h-4" />
                      Add Manual Entry
                    </Button>
                  </div>
                )}

                {/* Time Entries List */}
                <ScrollArea className="flex-1 h-[calc(85vh-220px)]">
                  <div className="space-y-2 pr-4">
                    {timeEntries.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No time entries found</p>
                      </div>
                    ) : (
                      timeEntries.map((entry) => (
                        <div
                          key={entry.log_id}
                          className="p-4 bg-muted/30 rounded-lg border border-border hover:border-primary/30 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium">{entry.user_name}</span>
                                <Badge variant="outline">{entry.stage_name}</Badge>
                                {entry.manual_entry && (
                                  <Badge variant="secondary" className="text-xs">Manual</Badge>
                                )}
                                {entry.edited_at && (
                                  <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/50">Edited</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDuration(entry.duration_minutes)}
                                </span>
                                <span>{entry.items_processed || 0} items</span>
                                <span>{formatDateTime(entry.completed_at)}</span>
                              </div>
                              {entry.admin_notes && (
                                <p className="text-xs text-muted-foreground italic mt-1">
                                  Note: {entry.admin_notes}
                                </p>
                              )}
                            </div>
                            
                            {isAdmin && (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditDialog(entry)}
                                  data-testid={`edit-entry-${entry.log_id}`}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDeleteEntry(entry)}
                                  data-testid={`delete-entry-${entry.log_id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="kpis" className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  {kpis && (
                    <div className="space-y-6 pr-4">
                      {/* Period Info */}
                      <div className="text-center p-4 bg-primary/10 rounded-lg">
                        <p className="text-sm text-muted-foreground">{kpis.period_label}</p>
                        <p className="font-medium">{kpis.date_range}</p>
                      </div>

                      {/* KPI Cards */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KpiCard
                          icon={<Clock className="w-5 h-5" />}
                          label="Total Hours"
                          value={kpis.total_hours}
                          color="primary"
                        />
                        <KpiCard
                          icon={<BarChart3 className="w-5 h-5" />}
                          label="Total Items"
                          value={kpis.total_items}
                          color="green"
                        />
                        <KpiCard
                          icon={<DollarSign className="w-5 h-5" />}
                          label="Labor Cost"
                          value={`$${kpis.labor_cost}`}
                          color="yellow"
                        />
                        <KpiCard
                          icon={<BarChart3 className="w-5 h-5" />}
                          label="Avg Time/Item"
                          value={`${kpis.avg_time_per_item}m`}
                          color="blue"
                        />
                      </div>

                      {/* Period Selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Period:</span>
                        <Select
                          value={kpis.period}
                          onValueChange={async (period) => {
                            const res = await fetch(`${API}/production/stats/overall-kpis?period=${period}`, {
                              credentials: "include"
                            });
                            if (res.ok) setKpis(await res.json());
                          }}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="yesterday">Yesterday</SelectItem>
                            <SelectItem value="this_week">This Week</SelectItem>
                            <SelectItem value="last_week">Last Week</SelectItem>
                            <SelectItem value="this_month">This Month</SelectItem>
                            <SelectItem value="last_month">Last Month</SelectItem>
                            <SelectItem value="all_time">All Time</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Entry Dialog */}
      <Dialog open={addFormOpen} onOpenChange={setAddFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Time Entry</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>User *</Label>
              <Select value={addForm.user_id} onValueChange={(val) => setAddForm(f => ({ ...f, user_id: val }))}>
                <SelectTrigger data-testid="add-entry-user-select">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Stage *</Label>
              <Select value={addForm.stage_id} onValueChange={(val) => setAddForm(f => ({ ...f, stage_id: val }))}>
                <SelectTrigger data-testid="add-entry-stage-select">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.stage_id} value={s.stage_id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration (minutes) *</Label>
                <Input
                  type="number"
                  min="1"
                  value={addForm.duration_minutes}
                  onChange={(e) => setAddForm(f => ({ ...f, duration_minutes: e.target.value }))}
                  placeholder="e.g., 60"
                  data-testid="add-entry-duration"
                />
              </div>
              <div className="space-y-2">
                <Label>Items Processed</Label>
                <Input
                  type="number"
                  min="0"
                  value={addForm.items_processed}
                  onChange={(e) => setAddForm(f => ({ ...f, items_processed: e.target.value }))}
                  placeholder="0"
                  data-testid="add-entry-items"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={addForm.entry_date}
                onChange={(e) => setAddForm(f => ({ ...f, entry_date: e.target.value }))}
                data-testid="add-entry-date"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={addForm.notes}
                onChange={(e) => setAddForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes..."
                data-testid="add-entry-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFormOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEntry} disabled={addLoading} data-testid="add-entry-submit">
              {addLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={!!editEntry} onOpenChange={() => setEditEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
          </DialogHeader>
          
          {editEntry && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm"><strong>User:</strong> {editEntry.user_name}</p>
                <p className="text-sm"><strong>Stage:</strong> {editEntry.stage_name}</p>
                <p className="text-sm"><strong>Original Duration:</strong> {formatDuration(editEntry.original_duration_minutes || editEntry.duration_minutes)}</p>
              </div>

              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  min="0"
                  value={editForm.duration_minutes}
                  onChange={(e) => setEditForm(f => ({ ...f, duration_minutes: e.target.value }))}
                  data-testid="edit-entry-duration"
                />
              </div>

              <div className="space-y-2">
                <Label>Items Processed</Label>
                <Input
                  type="number"
                  min="0"
                  value={editForm.items_processed}
                  onChange={(e) => setEditForm(f => ({ ...f, items_processed: e.target.value }))}
                  data-testid="edit-entry-items"
                />
              </div>

              <div className="space-y-2">
                <Label>Admin Notes</Label>
                <Input
                  value={editForm.notes}
                  onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Reason for edit..."
                  data-testid="edit-entry-notes"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button onClick={handleEditEntry} disabled={editLoading} data-testid="edit-entry-submit">
              {editLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteEntry} onOpenChange={() => setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this time entry for {deleteEntry?.user_name} 
              ({formatDuration(deleteEntry?.duration_minutes)}). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEntry}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-entry"
            >
              {deleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


function KpiCard({ icon, label, value, color }) {
  const colorClasses = {
    primary: "bg-primary/20 text-primary",
    green: "bg-green-500/20 text-green-400",
    yellow: "bg-yellow-500/20 text-yellow-400",
    blue: "bg-blue-500/20 text-blue-400"
  };

  return (
    <div className="p-4 bg-muted/30 rounded-lg border border-border">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${colorClasses[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
