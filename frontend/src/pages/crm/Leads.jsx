import { useState, useEffect, useCallback } from 'react';
import { API } from '@/utils/api';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  Plus, Search, UserPlus, Phone, Mail, ArrowRight, 
  MoreVertical, Trash2, Building2, Sparkles
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const leadStatuses = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-800' },
  { value: 'contacted', label: 'Contacted', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'qualified', label: 'Qualified', color: 'bg-green-100 text-green-800' },
  { value: 'unqualified', label: 'Unqualified', color: 'bg-gray-100 text-gray-800' },
  { value: 'converted', label: 'Converted', color: 'bg-purple-100 text-purple-800' }
];

const leadSources = [
  { value: 'website', label: 'Website' },
  { value: 'trade_show', label: 'Trade Show' },
  { value: 'referral', label: 'Referral' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'other', label: 'Other' }
];

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  

  const [newLead, setNewLead] = useState({
    first_name: '',
    last_name: '',
    company: '',
    email: '',
    phone: '',
    source: 'website',
    description: ''
  });

  const [convertData, setConvertData] = useState({
    create_opportunity: true,
    opportunity_name: '',
    opportunity_amount: ''
  });

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        page_size: 25
      });
      if (search) params.append('search', search);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterSource !== 'all') params.append('source', filterSource);
      
      const res = await fetch(`${API}/crm/leads?${params}`, { credentials: 'include' });
      const data = await res.json();
      setLeads(data.leads || []);
      setPagination(data.pagination || { page: 1, total: 0, total_pages: 0 });
    } catch (error) {
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, search, filterStatus, filterSource]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleCreate = async () => {
    try {
      const res = await fetch(`${API}/crm/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newLead)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create lead');
      }
      
      toast.success("Lead created successfully");
      setIsCreateOpen(false);
      setNewLead({ first_name: '', last_name: '', company: '', email: '', phone: '', source: 'website', description: '' });
      fetchLeads();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleConvert = async () => {
    if (!selectedLead) return;
    try {
      const res = await fetch(`${API}/crm/leads/${selectedLead.lead_id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          create_opportunity: convertData.create_opportunity,
          opportunity_name: convertData.opportunity_name || `${selectedLead.company || selectedLead.full_name} - Opportunity`,
          opportunity_amount: parseFloat(convertData.opportunity_amount) || 0
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to convert lead');
      }
      
      const result = await res.json();
      toast({ 
        title: "Lead Converted!", 
        description: `Created Account${result.opportunity_id ? ' and Opportunity' : ''}` 
      });
      setIsConvertOpen(false);
      setSelectedLead(null);
      setConvertData({ create_opportunity: true, opportunity_name: '', opportunity_amount: '' });
      fetchLeads();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const deleteLead = async (leadId) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    try {
      await fetch(`${API}/crm/leads/${leadId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      toast.success("Lead deleted");
      fetchLeads();
    } catch (error) {
      toast.error("Failed to delete lead");
    }
  };

  const openConvertDialog = (lead) => {
    setSelectedLead(lead);
    setConvertData({
      create_opportunity: true,
      opportunity_name: `${lead.company || lead.full_name} - Opportunity`,
      opportunity_amount: ''
    });
    setIsConvertOpen(true);
  };

  const getStatusBadge = (status) => {
    const statusConfig = leadStatuses.find(s => s.value === status);
    return statusConfig ? (
      <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
    ) : (
      <Badge variant="outline">{status}</Badge>
    );
  };

  const getSourceLabel = (source) => {
    const sourceConfig = leadSources.find(s => s.value === source);
    return sourceConfig?.label || source;
  };

  return (
    <div className="p-6 space-y-6" data-testid="leads-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="h-6 w-6" />
            Leads
          </h1>
          <p className="text-sm text-muted-foreground">Track and convert potential customers</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-lead-btn">
              <Plus className="h-4 w-4 mr-2" />
              New Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Lead</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input 
                    placeholder="First name"
                    value={newLead.first_name}
                    onChange={(e) => setNewLead({...newLead, first_name: e.target.value})}
                    data-testid="lead-firstname-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input 
                    placeholder="Last name"
                    value={newLead.last_name}
                    onChange={(e) => setNewLead({...newLead, last_name: e.target.value})}
                    data-testid="lead-lastname-input"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input 
                  placeholder="Company name"
                  value={newLead.company}
                  onChange={(e) => setNewLead({...newLead, company: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input 
                    type="email"
                    placeholder="email@example.com"
                    value={newLead.email}
                    onChange={(e) => setNewLead({...newLead, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input 
                    placeholder="Phone number"
                    value={newLead.phone}
                    onChange={(e) => setNewLead({...newLead, phone: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Lead Source</Label>
                <Select 
                  value={newLead.source} 
                  onValueChange={(v) => setNewLead({...newLead, source: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {leadSources.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea 
                  placeholder="Additional notes..."
                  value={newLead.description}
                  onChange={(e) => setNewLead({...newLead, description: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleCreate} 
                disabled={!newLead.first_name || !newLead.last_name}
                data-testid="save-lead-btn"
              >
                Create Lead
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search leads..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="search-leads"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {leadStatuses.filter(s => s.value !== 'converted').map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {leadSources.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No leads found. Create your first lead to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map(lead => (
                  <TableRow key={lead.lead_id} data-testid={`lead-row-${lead.lead_id}`}>
                    <TableCell>
                      <div className="font-medium">{lead.full_name}</div>
                      {lead.title && (
                        <div className="text-sm text-muted-foreground">{lead.title}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.company && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {lead.company}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {lead.email && (
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            {lead.email}
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3" />
                            {lead.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getSourceLabel(lead.source)}</TableCell>
                    <TableCell>{getStatusBadge(lead.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => openConvertDialog(lead)}
                          disabled={lead.status === 'converted'}
                          data-testid={`convert-lead-${lead.lead_id}`}
                        >
                          <Sparkles className="h-4 w-4 mr-1" />
                          Convert
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => deleteLead(lead.lead_id)} className="text-red-600">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex justify-center gap-2">
          <Button 
            variant="outline" 
            disabled={pagination.page <= 1}
            onClick={() => setPagination(p => ({...p, page: p.page - 1}))}
          >
            Previous
          </Button>
          <span className="flex items-center px-4">
            Page {pagination.page} of {pagination.total_pages}
          </span>
          <Button 
            variant="outline" 
            disabled={pagination.page >= pagination.total_pages}
            onClick={() => setPagination(p => ({...p, page: p.page + 1}))}
          >
            Next
          </Button>
        </div>
      )}

      {/* Convert Lead Dialog */}
      <Dialog open={isConvertOpen} onOpenChange={setIsConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Convert Lead to Account
            </DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">{selectedLead.full_name}</div>
                <div className="text-sm text-muted-foreground">
                  {selectedLead.company && `${selectedLead.company} • `}
                  {selectedLead.email}
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="create_opp"
                    checked={convertData.create_opportunity}
                    onChange={(e) => setConvertData({...convertData, create_opportunity: e.target.checked})}
                    className="rounded"
                  />
                  <Label htmlFor="create_opp">Create an Opportunity</Label>
                </div>
                
                {convertData.create_opportunity && (
                  <div className="space-y-4 pl-6 border-l-2">
                    <div className="space-y-2">
                      <Label>Opportunity Name</Label>
                      <Input 
                        value={convertData.opportunity_name}
                        onChange={(e) => setConvertData({...convertData, opportunity_name: e.target.value})}
                        placeholder="Opportunity name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount ($)</Label>
                      <Input 
                        type="number"
                        value={convertData.opportunity_amount}
                        onChange={(e) => setConvertData({...convertData, opportunity_amount: e.target.value})}
                        placeholder="0"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConvertOpen(false)}>Cancel</Button>
            <Button onClick={handleConvert} data-testid="confirm-convert-btn">
              <Sparkles className="h-4 w-4 mr-2" />
              Convert Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
