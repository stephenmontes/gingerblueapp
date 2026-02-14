import { useState, useEffect } from 'react';
import { API } from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Headphones, Plus, Search, Edit, Trash2, Eye, Clock, AlertTriangle,
  User, Building2, MessageSquare, Send, Loader2, CheckCircle, XCircle,
  AlertCircle, Filter
} from 'lucide-react';

const statusConfig = {
  new: { label: 'New', color: 'bg-blue-500', icon: AlertCircle },
  in_progress: { label: 'In Progress', color: 'bg-amber-500', icon: Clock },
  waiting_customer: { label: 'Waiting on Customer', color: 'bg-purple-500', icon: User },
  escalated: { label: 'Escalated', color: 'bg-red-500', icon: AlertTriangle },
  resolved: { label: 'Resolved', color: 'bg-green-500', icon: CheckCircle },
  closed: { label: 'Closed', color: 'bg-gray-500', icon: XCircle }
};

const priorityConfig = {
  low: { label: 'Low', color: 'bg-gray-400' },
  medium: { label: 'Medium', color: 'bg-blue-500' },
  high: { label: 'High', color: 'bg-amber-500' },
  critical: { label: 'Critical', color: 'bg-red-500' }
};

export default function CasesPage({ user }) {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Dialogs
  const [caseDialog, setCaseDialog] = useState({ open: false, data: null });
  const [detailDialog, setDetailDialog] = useState({ open: false, caseData: null });
  const [saving, setSaving] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isPublicComment, setIsPublicComment] = useState(false);

  useEffect(() => {
    fetchCases();
    fetchStats();
    fetchConfig();
    fetchUsers();
    fetchAccounts();
  }, [statusFilter, priorityFilter, assignedFilter]);

  const fetchCases = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter && priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (assignedFilter && assignedFilter !== 'all') params.append('assigned_to', assignedFilter);
      if (searchQuery) params.append('search', searchQuery);
      
      const res = await fetch(`${API}/cases?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCases(data.cases || []);
      }
    } catch (error) {
      toast.error('Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/cases/stats`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats');
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API}/cases/config`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (error) {
      console.error('Failed to load config');
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API}/users`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || data || []);
      }
    } catch (error) {
      console.error('Failed to load users');
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API}/crm/accounts?page_size=100`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Failed to load accounts');
    }
  };

  const fetchCaseDetail = async (caseId) => {
    try {
      const res = await fetch(`${API}/cases/${caseId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDetailDialog({ open: true, caseData: data });
      }
    } catch (error) {
      toast.error('Failed to load case details');
    }
  };

  const saveCase = async () => {
    const data = caseDialog.data;
    if (!data.subject) {
      toast.error('Subject is required');
      return;
    }

    setSaving(true);
    try {
      const isNew = !data.case_id;
      const url = isNew ? `${API}/cases` : `${API}/cases/${data.case_id}`;
      
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save case');
      }

      toast.success(isNew ? 'Case created' : 'Case updated');
      setCaseDialog({ open: false, data: null });
      fetchCases();
      fetchStats();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteCase = async (caseId) => {
    if (!confirm('Are you sure you want to delete this case?')) return;
    
    try {
      const res = await fetch(`${API}/cases/${caseId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (res.ok) {
        toast.success('Case deleted');
        fetchCases();
        fetchStats();
      } else {
        toast.error('Failed to delete case');
      }
    } catch (error) {
      toast.error('Failed to delete case');
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    
    try {
      const res = await fetch(`${API}/cases/${detailDialog.caseData.case_id}/comments?comment=${encodeURIComponent(newComment)}&is_public=${isPublicComment}`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (res.ok) {
        toast.success('Comment added');
        setNewComment('');
        fetchCaseDetail(detailDialog.caseData.case_id);
      } else {
        toast.error('Failed to add comment');
      }
    } catch (error) {
      toast.error('Failed to add comment');
    }
  };

  const updateCaseStatus = async (caseId, newStatus) => {
    try {
      const res = await fetch(`${API}/cases/${caseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });
      
      if (res.ok) {
        toast.success('Status updated');
        fetchCases();
        fetchStats();
        if (detailDialog.open) {
          fetchCaseDetail(caseId);
        }
      }
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchCases();
  };

  const getNewCaseData = () => ({
    subject: '',
    description: '',
    status: 'new',
    priority: 'medium',
    category: '',
    origin: '',
    account_id: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    assigned_to: '',
    due_date: '',
    internal_notes: ''
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const isOverdue = (caseData) => {
    if (!caseData.due_date) return false;
    if (['resolved', 'closed'].includes(caseData.status)) return false;
    return new Date(caseData.due_date) < new Date();
  };

  return (
    <div className="p-6 space-y-6" data-testid="cases-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Headphones className="h-6 w-6" />
            Case Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and resolve customer support tickets
          </p>
        </div>
        <Button 
          onClick={() => setCaseDialog({ open: true, data: getNewCaseData() })}
          data-testid="create-case-btn"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Case
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="cursor-pointer hover:border-primary" onClick={() => setStatusFilter('')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Headphones className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.total_open}</p>
                  <p className="text-xs text-muted-foreground">Open Cases</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary" onClick={() => setAssignedFilter(user?.user_id || '')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.my_open_cases}</p>
                  <p className="text-xs text-muted-foreground">My Cases</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary" onClick={() => setPriorityFilter('critical')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.critical_high}</p>
                  <p className="text-xs text-muted-foreground">Critical/High</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.overdue}</p>
                  <p className="text-xs text-muted-foreground">Overdue</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.resolved_today}</p>
                  <p className="text-xs text-muted-foreground">Resolved Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search cases..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="submit" variant="secondary">
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowFilters(!showFilters)}>
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
            </div>
            
            {showFilters && (
              <div className="flex flex-wrap gap-4 pt-2 border-t">
                <div className="w-40">
                  <Label className="text-xs">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {config?.statuses?.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <Label className="text-xs">Priority</Label>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All priorities</SelectItem>
                      {config?.priorities?.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-48">
                  <Label className="text-xs">Assigned To</Label>
                  <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All users</SelectItem>
                      {users.map(u => (
                        <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="ghost" onClick={() => {
                  setStatusFilter('');
                  setPriorityFilter('');
                  setAssignedFilter('');
                  setSearchQuery('');
                }}>
                  Clear filters
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Cases Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cases.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Headphones className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No cases found</p>
              <p className="text-sm">Create a new case to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case #</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((caseItem) => (
                  <TableRow 
                    key={caseItem.case_id} 
                    className={isOverdue(caseItem) ? 'bg-red-50' : ''}
                    data-testid={`case-row-${caseItem.case_id}`}
                  >
                    <TableCell className="font-mono text-sm">
                      {caseItem.case_number}
                      {isOverdue(caseItem) && (
                        <Badge variant="destructive" className="ml-2 text-xs">Overdue</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium line-clamp-1">{caseItem.subject}</p>
                        {caseItem.category && (
                          <p className="text-xs text-muted-foreground">{caseItem.category}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {caseItem.account_name || caseItem.contact_name || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusConfig[caseItem.status]?.color || 'bg-gray-500'} text-white`}>
                        {statusConfig[caseItem.status]?.label || caseItem.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`border-2 ${priorityConfig[caseItem.priority]?.color?.replace('bg-', 'border-')}`}>
                        {priorityConfig[caseItem.priority]?.label || caseItem.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {caseItem.assigned_to_name || <span className="text-muted-foreground">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(caseItem.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => fetchCaseDetail(caseItem.case_id)}
                          data-testid={`view-case-${caseItem.case_id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setCaseDialog({ open: true, data: { ...caseItem, existing: true } })}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {(user?.role === 'admin' || user?.role === 'manager') && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => deleteCase(caseItem.case_id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Case Dialog */}
      <Dialog open={caseDialog.open} onOpenChange={(open) => !open && setCaseDialog({ open: false, data: null })}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Headphones className="h-5 w-5" />
              {caseDialog.data?.existing ? 'Edit Case' : 'New Case'}
            </DialogTitle>
          </DialogHeader>
          {caseDialog.data && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Subject*</Label>
                <Input 
                  value={caseDialog.data.subject}
                  onChange={(e) => setCaseDialog({
                    ...caseDialog,
                    data: { ...caseDialog.data, subject: e.target.value }
                  })}
                  placeholder="Brief description of the issue"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select 
                    value={caseDialog.data.status}
                    onValueChange={(val) => setCaseDialog({
                      ...caseDialog,
                      data: { ...caseDialog.data, status: val }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {config?.statuses?.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select 
                    value={caseDialog.data.priority}
                    onValueChange={(val) => setCaseDialog({
                      ...caseDialog,
                      data: { ...caseDialog.data, priority: val }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {config?.priorities?.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select 
                    value={caseDialog.data.category || ''}
                    onValueChange={(val) => setCaseDialog({
                      ...caseDialog,
                      data: { ...caseDialog.data, category: val === 'none' ? '' : val }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {config?.categories?.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Origin</Label>
                  <Select 
                    value={caseDialog.data.origin || ''}
                    onValueChange={(val) => setCaseDialog({
                      ...caseDialog,
                      data: { ...caseDialog.data, origin: val === 'none' ? '' : val }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select origin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {config?.origins?.map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                  value={caseDialog.data.description || ''}
                  onChange={(e) => setCaseDialog({
                    ...caseDialog,
                    data: { ...caseDialog.data, description: e.target.value }
                  })}
                  placeholder="Detailed description of the issue..."
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account</Label>
                  <Select 
                    value={caseDialog.data.account_id || ''}
                    onValueChange={(val) => setCaseDialog({
                      ...caseDialog,
                      data: { ...caseDialog.data, account_id: val === 'none' ? '' : val }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {accounts.map(a => (
                        <SelectItem key={a.account_id} value={a.account_id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assigned To</Label>
                  <Select 
                    value={caseDialog.data.assigned_to || ''}
                    onValueChange={(val) => setCaseDialog({
                      ...caseDialog,
                      data: { ...caseDialog.data, assigned_to: val === 'none' ? '' : val }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {users.map(u => (
                        <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Contact Information</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Name</Label>
                    <Input 
                      value={caseDialog.data.contact_name || ''}
                      onChange={(e) => setCaseDialog({
                        ...caseDialog,
                        data: { ...caseDialog.data, contact_name: e.target.value }
                      })}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Email</Label>
                    <Input 
                      type="email"
                      value={caseDialog.data.contact_email || ''}
                      onChange={(e) => setCaseDialog({
                        ...caseDialog,
                        data: { ...caseDialog.data, contact_email: e.target.value }
                      })}
                      placeholder="john@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Phone</Label>
                    <Input 
                      value={caseDialog.data.contact_phone || ''}
                      onChange={(e) => setCaseDialog({
                        ...caseDialog,
                        data: { ...caseDialog.data, contact_phone: e.target.value }
                      })}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input 
                    type="datetime-local"
                    value={caseDialog.data.due_date || ''}
                    onChange={(e) => setCaseDialog({
                      ...caseDialog,
                      data: { ...caseDialog.data, due_date: e.target.value }
                    })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Internal Notes</Label>
                <Textarea 
                  value={caseDialog.data.internal_notes || ''}
                  onChange={(e) => setCaseDialog({
                    ...caseDialog,
                    data: { ...caseDialog.data, internal_notes: e.target.value }
                  })}
                  placeholder="Notes for internal use only (not visible to customer)..."
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCaseDialog({ open: false, data: null })}>
              Cancel
            </Button>
            <Button onClick={saveCase} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>Save Case</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Case Detail Dialog */}
      <Dialog open={detailDialog.open} onOpenChange={(open) => !open && setDetailDialog({ open: false, caseData: null })}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {detailDialog.caseData && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">{detailDialog.caseData.case_number}</span>
                  <span>{detailDialog.caseData.subject}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="flex items-center gap-2 mb-4">
                <Badge className={`${statusConfig[detailDialog.caseData.status]?.color || 'bg-gray-500'} text-white`}>
                  {statusConfig[detailDialog.caseData.status]?.label || detailDialog.caseData.status}
                </Badge>
                <Badge variant="outline" className={`border-2 ${priorityConfig[detailDialog.caseData.priority]?.color?.replace('bg-', 'border-')}`}>
                  {priorityConfig[detailDialog.caseData.priority]?.label || detailDialog.caseData.priority}
                </Badge>
                {detailDialog.caseData.category && (
                  <Badge variant="secondary">{detailDialog.caseData.category}</Badge>
                )}
                {isOverdue(detailDialog.caseData) && (
                  <Badge variant="destructive">Overdue</Badge>
                )}
              </div>

              <Tabs defaultValue="details">
                <TabsList>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="activity">Activity ({detailDialog.caseData.activities?.length || 0})</TabsTrigger>
                  <TabsTrigger value="related">Related</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-4">
                  {detailDialog.caseData.description && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Description</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-sm whitespace-pre-wrap">{detailDialog.caseData.description}</p>
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Account & Contact
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Account</span>
                          <span>{detailDialog.caseData.account_name || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Contact</span>
                          <span>{detailDialog.caseData.contact_name || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Email</span>
                          <span>{detailDialog.caseData.contact_email || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Phone</span>
                          <span>{detailDialog.caseData.contact_phone || '-'}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Timeline
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Created</span>
                          <span>{formatDate(detailDialog.caseData.created_at)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Due Date</span>
                          <span className={isOverdue(detailDialog.caseData) ? 'text-red-600 font-medium' : ''}>
                            {formatDate(detailDialog.caseData.due_date)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">First Response</span>
                          <span>{formatDate(detailDialog.caseData.first_response_at)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Resolved</span>
                          <span>{formatDate(detailDialog.caseData.resolved_at)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Quick Actions */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-2">
                        {detailDialog.caseData.status !== 'in_progress' && (
                          <Button size="sm" variant="outline" onClick={() => updateCaseStatus(detailDialog.caseData.case_id, 'in_progress')}>
                            Start Working
                          </Button>
                        )}
                        {detailDialog.caseData.status !== 'waiting_customer' && (
                          <Button size="sm" variant="outline" onClick={() => updateCaseStatus(detailDialog.caseData.case_id, 'waiting_customer')}>
                            Waiting on Customer
                          </Button>
                        )}
                        {!['resolved', 'closed'].includes(detailDialog.caseData.status) && (
                          <>
                            <Button size="sm" variant="outline" className="text-green-600" onClick={() => updateCaseStatus(detailDialog.caseData.case_id, 'resolved')}>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Resolve
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => updateCaseStatus(detailDialog.caseData.case_id, 'escalated')}>
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              Escalate
                            </Button>
                          </>
                        )}
                        {detailDialog.caseData.status === 'resolved' && (
                          <Button size="sm" variant="outline" onClick={() => updateCaseStatus(detailDialog.caseData.case_id, 'closed')}>
                            Close Case
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="activity" className="space-y-4">
                  {/* Add Comment */}
                  <Card>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <Textarea 
                          placeholder="Add a comment..."
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          rows={3}
                        />
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-sm">
                            <input 
                              type="checkbox"
                              checked={isPublicComment}
                              onChange={(e) => setIsPublicComment(e.target.checked)}
                            />
                            Public response (visible to customer)
                          </label>
                          <Button size="sm" onClick={addComment} disabled={!newComment.trim()}>
                            <Send className="h-4 w-4 mr-1" />
                            Add Comment
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Activity Feed */}
                  <div className="space-y-3">
                    {detailDialog.caseData.activities?.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No activity yet</p>
                      </div>
                    ) : (
                      detailDialog.caseData.activities?.map(activity => (
                        <Card key={activity.activity_id} className={activity.is_public ? 'border-l-4 border-l-blue-500' : ''}>
                          <CardContent className="py-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm font-medium">{activity.created_by_name}</p>
                                <p className="text-sm whitespace-pre-wrap mt-1">{activity.description}</p>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatDate(activity.created_at)}
                              </div>
                            </div>
                            {activity.is_public && (
                              <Badge variant="outline" className="mt-2 text-xs">Public</Badge>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="related">
                  {detailDialog.caseData.related_cases?.length > 0 ? (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Related Cases (Same Account)</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          {detailDialog.caseData.related_cases.map(rc => (
                            <div key={rc.case_id} className="flex items-center justify-between p-2 border rounded">
                              <div>
                                <span className="font-mono text-sm">{rc.case_number}</span>
                                <span className="ml-2 text-sm">{rc.subject}</span>
                              </div>
                              <Badge className={`${statusConfig[rc.status]?.color || 'bg-gray-500'} text-white`}>
                                {statusConfig[rc.status]?.label || rc.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No related cases found</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
