import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Clock, Edit, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";


const STAGES = [
  { id: "fulfill_print", name: "Print List" },
  { id: "fulfill_mount", name: "Mount" },
  { id: "fulfill_finish", name: "Finish" },
  { id: "fulfill_pack", name: "Pack & Ship" },
];

export function TimeEntryManager() {
  const [entries, setEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editEntry, setEditEntry] = useState(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [error, setError] = useState(null);
  
  // Sorting and filtering
  const [sortBy, setSortBy] = useState("user_date"); // user_date, date_desc, user_asc
  const [filterUser, setFilterUser] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [entriesRes, usersRes] = await Promise.all([
        fetch(`${API}/fulfillment/admin/time-entries?limit=200`, { credentials: "include" }),
        fetch(`${API}/fulfillment/admin/users`, { credentials: "include" })
      ]);
      
      if (entriesRes.status === 403 || usersRes.status === 403) {
        setError("You don't have permission to manage time entries. Admin or Manager role required.");
        return;
      }
      
      if (entriesRes.ok) {
        const data = await entriesRes.json();
        // Sort by user name first, then by date (most recent first)
        const sorted = data.sort((a, b) => {
          // Primary sort: user name
          const nameCompare = (a.user_name || "").localeCompare(b.user_name || "");
          if (nameCompare !== 0) return nameCompare;
          // Secondary sort: date (most recent first)
          const dateA = a.completed_at || a.created_at || "";
          const dateB = b.completed_at || b.created_at || "";
          return dateB.localeCompare(dateA);
        });
        setEntries(sorted);
      }
      if (usersRes.ok) setUsers(await usersRes.json());
    } catch (err) {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoStopInactive() {
    try {
      const res = await fetch(`${API}/fulfillment/timers/auto-stop-inactive`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message);
        loadData();
      }
    } catch (err) {
      toast.error("Failed to auto-stop inactive timers");
    }
  }

  function getSortedFilteredEntries() {
    let filtered = entries;
    
    // Filter by user
    if (filterUser !== "all") {
      filtered = filtered.filter(e => e.user_id === filterUser);
    }
    
    // Sort entries
    return filtered.sort((a, b) => {
      if (sortBy === "user_date") {
        // Primary: user name, Secondary: date desc
        const nameCompare = (a.user_name || "").localeCompare(b.user_name || "");
        if (nameCompare !== 0) return nameCompare;
        const dateA = a.completed_at || a.created_at || "";
        const dateB = b.completed_at || b.created_at || "";
        return dateB.localeCompare(dateA);
      } else if (sortBy === "date_desc") {
        const dateA = a.completed_at || a.created_at || "";
        const dateB = b.completed_at || b.created_at || "";
        return dateB.localeCompare(dateA);
      } else if (sortBy === "user_asc") {
        return (a.user_name || "").localeCompare(b.user_name || "");
      }
      return 0;
    });
  }

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Time Entry Management
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleAutoStopInactive} className="gap-2">
              <AlertTriangle className="w-4 h-4" />
              Stop Inactive Timers
            </Button>
            <Button onClick={() => setShowAddDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Manual Entry
            </Button>
          </div>
        </div>
        {/* Sort and Filter Controls */}
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Sort:</Label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user_date">User → Date</SelectItem>
                <SelectItem value="date_desc">Date (Newest)</SelectItem>
                <SelectItem value="user_asc">User (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">User:</Label>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="secondary" className="text-xs">
            {getSortedFilteredEntries().length} entries
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <EntriesTable 
          entries={getSortedFilteredEntries()} 
          onEdit={setEditEntry} 
          onRefresh={loadData} 
        />
      </CardContent>

      <EditEntryDialog 
        entry={editEntry} 
        onClose={() => setEditEntry(null)} 
        onSave={loadData} 
      />
      
      <AddEntryDialog
        open={showAddDialog}
        users={users}
        onClose={() => setShowAddDialog(false)}
        onSave={loadData}
      />
    </Card>
  );
}

function LoadingState() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-8">
        <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
      </CardContent>
    </Card>
  );
}

function ErrorState({ message }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-8 text-center">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
        <p className="text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

function EntriesTable({ entries, onEdit, onRefresh }) {
  async function handleDelete(logId) {
    if (!confirm("Are you sure you want to delete this time entry?")) return;
    
    try {
      const res = await fetch(`${API}/fulfillment/admin/time-entries/${logId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Time entry deleted");
        onRefresh();
      } else {
        toast.error("Failed to delete entry");
      }
    } catch (err) {
      toast.error("Failed to delete entry");
    }
  }

  return (
    <div className="max-h-[500px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead>User</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Order</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <EntryRow 
              key={entry.log_id} 
              entry={entry} 
              onEdit={() => onEdit(entry)}
              onDelete={() => handleDelete(entry.log_id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EntryRow({ entry, onEdit, onDelete }) {
  const dateStr = entry.completed_at 
    ? new Date(entry.completed_at).toLocaleDateString() 
    : "—";
  
  return (
    <TableRow className="border-border">
      <TableCell className="font-medium">{entry.user_name}</TableCell>
      <TableCell>{entry.stage_name}</TableCell>
      <TableCell className="font-mono text-sm">
        {entry.order_number ? `#${entry.order_number}` : "—"}
      </TableCell>
      <TableCell className="text-right font-mono">
        {formatDuration(entry.duration_minutes)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{dateStr}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          {entry.manual_entry && (
            <Badge variant="outline" className="text-xs">Manual</Badge>
          )}
          {entry.auto_stopped && (
            <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500">Auto-stopped</Badge>
          )}
          {entry.edited_at && (
            <Badge variant="outline" className="text-xs border-blue-500 text-blue-500">Edited</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-red-500 hover:text-red-600">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function EditEntryDialog({ entry, onClose, onSave }) {
  const [duration, setDuration] = useState("");
  const [items, setItems] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setDuration(entry.duration_minutes?.toString() || "");
      setItems(entry.items_processed?.toString() || "0");
      setNotes(entry.admin_notes || "");
    }
  }, [entry]);

  async function handleSave() {
    setSaving(true);
    try {
      const params = new URLSearchParams();
      if (duration) params.append("duration_minutes", duration);
      if (items) params.append("items_processed", items);
      if (notes) params.append("notes", notes);

      const res = await fetch(`${API}/fulfillment/admin/time-entries/${entry.log_id}?${params}`, {
        method: "PUT",
        credentials: "include"
      });
      
      if (res.ok) {
        toast.success("Time entry updated");
        onClose();
        onSave();
      } else {
        toast.error("Failed to update entry");
      }
    } catch (err) {
      toast.error("Failed to update entry");
    } finally {
      setSaving(false);
    }
  }

  if (!entry) return null;

  return (
    <Dialog open={!!entry} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Time Entry</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg text-sm">
            <div><span className="text-muted-foreground">User:</span> {entry.user_name}</div>
            <div><span className="text-muted-foreground">Stage:</span> {entry.stage_name}</div>
            <div><span className="text-muted-foreground">Order:</span> {entry.order_number || "—"}</div>
            <div><span className="text-muted-foreground">Original:</span> {formatDuration(entry.original_duration_minutes || entry.duration_minutes)}</div>
          </div>
          
          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Enter duration in minutes"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Items Processed</Label>
            <Input
              type="number"
              value={items}
              onChange={(e) => setItems(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Admin Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for edit..."
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddEntryDialog({ open, users, onClose, onSave }) {
  const [userId, setUserId] = useState("");
  const [stageId, setStageId] = useState("");
  const [duration, setDuration] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [items, setItems] = useState("0");
  const [notes, setNotes] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedUser = users.find(u => u.user_id === userId);
  const selectedStage = STAGES.find(s => s.id === stageId);

  async function handleSave() {
    if (!userId || !stageId || !duration) {
      toast.error("Please fill in required fields");
      return;
    }

    setSaving(true);
    try {
      const params = new URLSearchParams({
        user_id: userId,
        user_name: selectedUser?.name || "Unknown",
        stage_id: stageId,
        stage_name: selectedStage?.name || stageId,
        duration_minutes: duration,
        items_processed: items || "0",
        orders_processed: "1"
      });
      
      if (orderNumber) params.append("order_number", orderNumber);
      if (notes) params.append("notes", notes);
      if (entryDate) params.append("entry_date", new Date(entryDate).toISOString());

      const res = await fetch(`${API}/fulfillment/admin/time-entries/add?${params}`, {
        method: "POST",
        credentials: "include"
      });
      
      if (res.ok) {
        toast.success("Manual time entry added");
        onClose();
        onSave();
        // Reset form
        setUserId("");
        setStageId("");
        setDuration("");
        setOrderNumber("");
        setItems("0");
        setNotes("");
        setEntryDate("");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to add entry");
      }
    } catch (err) {
      toast.error("Failed to add entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Manual Time Entry</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>User *</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Stage *</Label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duration (minutes) *</Label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 45"
              />
            </div>
            <div className="space-y-2">
              <Label>Items Processed</Label>
              <Input
                type="number"
                value={items}
                onChange={(e) => setItems(e.target.value)}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Order Number</Label>
              <Input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Entry Date</Label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for manual entry..."
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Adding..." : "Add Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDuration(minutes) {
  if (!minutes) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
