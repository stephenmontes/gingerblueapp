import { useState, useEffect, useCallback } from 'react';
import { API } from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, Search, TrendingUp, Calendar, Building2,
  Kanban, List, GripVertical
} from 'lucide-react';

const stages = [
  { id: 'prospecting', name: 'Prospecting', color: 'bg-gray-500', probability: 10 },
  { id: 'qualification', name: 'Qualification', color: 'bg-blue-500', probability: 20 },
  { id: 'needs_analysis', name: 'Needs Analysis', color: 'bg-purple-500', probability: 40 },
  { id: 'proposal', name: 'Proposal', color: 'bg-yellow-500', probability: 60 },
  { id: 'negotiation', name: 'Negotiation', color: 'bg-green-500', probability: 80 }
];

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState([]);
  const [pipeline, setPipeline] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [view, setView] = useState('kanban');
  const [pagination, setPagination] = useState({ page: 1, total: 0 });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { toast } = useToast();

  const [newOpp, setNewOpp] = useState({
    name: '',
    account_id: '',
    amount: '',
    close_date: new Date().toISOString().split('T')[0],
    stage: 'prospecting',
    description: ''
  });

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API}/crm/accounts?page_size=100`, { credentials: 'include' });
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  const fetchOpportunities = useCallback(async () => {
    try {
      setLoading(true);
      if (view === 'kanban') {
        const res = await fetch(`${API}/crm/opportunities/pipeline`, { credentials: 'include' });
        const data = await res.json();
        setPipeline(data.pipeline || {});
      } else {
        const params = new URLSearchParams({ page: pagination.page, page_size: 25 });
        if (search) params.append('search', search);
        if (filterStage !== 'all') params.append('stage', filterStage);
        
        const res = await fetch(`${API}/crm/opportunities?${params}`, { credentials: 'include' });
        const data = await res.json();
        setOpportunities(data.opportunities || []);
        setPagination(data.pagination || { page: 1, total: 0 });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load opportunities", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [view, pagination.page, search, filterStage, toast]);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const handleCreate = async () => {
    try {
      const res = await fetch(`${API}/crm/opportunities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...newOpp,
          amount: parseFloat(newOpp.amount) || 0
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create opportunity');
      }
      
      toast({ title: "Success", description: "Opportunity created successfully" });
      setIsCreateOpen(false);
      setNewOpp({ name: '', account_id: '', amount: '', close_date: new Date().toISOString().split('T')[0], stage: 'prospecting', description: '' });
      fetchOpportunities();
    } catch (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const updateStage = async (oppId, newStage) => {
    try {
      await fetch(`${API}/crm/opportunities/${oppId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stage: newStage })
      });
      toast({ title: "Stage Updated", description: `Moved to ${newStage}` });
      fetchOpportunities();
    } catch (error) {
      toast({ title: "Error", description: "Failed to update stage", variant: "destructive" });
    }
  };

  const viewOpportunity = async (oppId) => {
    try {
      const res = await fetch(`${API}/crm/opportunities/${oppId}`, { credentials: 'include' });
      const data = await res.json();
      setSelectedOpp(data);
      setIsDetailOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load opportunity details", variant: "destructive" });
    }
  };

  const deleteOpportunity = async (oppId) => {
    if (!confirm('Are you sure you want to delete this opportunity?')) return;
    try {
      await fetch(`${API}/crm/opportunities/${oppId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      toast({ title: "Success", description: "Opportunity deleted" });
      fetchOpportunities();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete opportunity", variant: "destructive" });
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const getTotalPipeline = () => {
    return Object.values(pipeline).reduce((sum, stage) => sum + (stage.total_amount || 0), 0);
  };

  const getWeightedPipeline = () => {
    return Object.values(pipeline).reduce((sum, stage) => sum + (stage.weighted_amount || 0), 0);
  };

  const handleDragStart = (e, oppId) => {
    e.dataTransfer.setData('oppId', oppId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, newStage) => {
    e.preventDefault();
    const oppId = e.dataTransfer.getData('oppId');
    if (oppId) {
      updateStage(oppId, newStage);
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="opportunities-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Opportunities
          </h1>
          <p className="text-sm text-muted-foreground">Track and manage your sales pipeline</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="kanban" className="flex items-center gap-1">
                <Kanban className="h-4 w-4" />
                Kanban
              </TabsTrigger>
              <TabsTrigger value="list" className="flex items-center gap-1">
                <List className="h-4 w-4" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-opp-btn">
                <Plus className="h-4 w-4 mr-2" />
                New Opportunity
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Opportunity</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Opportunity Name *</Label>
                  <Input 
                    placeholder="Deal name"
                    value={newOpp.name}
                    onChange={(e) => setNewOpp({...newOpp, name: e.target.value})}
                    data-testid="opp-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account *</Label>
                  <Select 
                    value={newOpp.account_id} 
                    onValueChange={(v) => setNewOpp({...newOpp, account_id: v})}
                  >
                    <SelectTrigger data-testid="opp-account-select">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(acc => (
                        <SelectItem key={acc.account_id} value={acc.account_id}>
                          {acc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount ($)</Label>
                    <Input 
                      type="number"
                      placeholder="0"
                      value={newOpp.amount}
                      onChange={(e) => setNewOpp({...newOpp, amount: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Close Date</Label>
                    <Input 
                      type="date"
                      value={newOpp.close_date}
                      onChange={(e) => setNewOpp({...newOpp, close_date: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select 
                    value={newOpp.stage} 
                    onValueChange={(v) => setNewOpp({...newOpp, stage: v})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea 
                    placeholder="Notes about this opportunity..."
                    value={newOpp.description}
                    onChange={(e) => setNewOpp({...newOpp, description: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button 
                  onClick={handleCreate} 
                  disabled={!newOpp.name || !newOpp.account_id}
                  data-testid="save-opp-btn"
                >
                  Create Opportunity
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Pipeline Summary */}
      {view === 'kanban' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Pipeline</div>
              <div className="text-2xl font-bold text-blue-600">{formatCurrency(getTotalPipeline())}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Weighted Pipeline</div>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(getWeightedPipeline())}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Open Deals</div>
              <div className="text-2xl font-bold">
                {Object.values(pipeline).reduce((sum, stage) => sum + (stage.count || 0), 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Avg Deal Size</div>
              <div className="text-2xl font-bold">
                {formatCurrency(getTotalPipeline() / Math.max(Object.values(pipeline).reduce((sum, stage) => sum + (stage.count || 0), 0), 1))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kanban View */}
      {view === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4" data-testid="kanban-board">
          {stages.map(stage => (
            <div 
              key={stage.id}
              className="flex-shrink-0 w-72"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              <div className={`${stage.color} text-white px-3 py-2 rounded-t-lg flex justify-between items-center`}>
                <span className="font-medium">{stage.name}</span>
                <Badge variant="secondary" className="bg-white/20 text-white">
                  {pipeline[stage.id]?.count || 0}
                </Badge>
              </div>
              <div className="bg-muted/50 rounded-b-lg p-2 min-h-[400px] space-y-2">
                <div className="text-sm text-muted-foreground px-2 py-1">
                  {formatCurrency(pipeline[stage.id]?.total_amount || 0)}
                </div>
                {pipeline[stage.id]?.opportunities?.map(opp => (
                  <Card 
                    key={opp.opportunity_id}
                    className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                    draggable
                    onDragStart={(e) => handleDragStart(e, opp.opportunity_id)}
                    onClick={() => viewOpportunity(opp.opportunity_id)}
                    data-testid={`opp-card-${opp.opportunity_id}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{opp.name}</div>
                          <div className="text-sm text-muted-foreground truncate flex items-center gap-1">
                            <Building2 className="h-3 w-3 flex-shrink-0" />
                            {opp.account_name}
                          </div>
                        </div>
                        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-lg font-bold text-green-600">{formatCurrency(opp.amount)}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {opp.close_date}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search opportunities..."
                    className="pl-10"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={filterStage} onValueChange={setFilterStage}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    {stages.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">Loading...</div>
              ) : opportunities.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No opportunities found.
                </div>
              ) : (
                <div className="divide-y">
                  {opportunities.map(opp => (
                    <div 
                      key={opp.opportunity_id}
                      className="p-4 hover:bg-muted/50 cursor-pointer flex justify-between items-center"
                      onClick={() => viewOpportunity(opp.opportunity_id)}
                    >
                      <div className="flex-1">
                        <div className="font-medium">{opp.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {opp.account_name} • Stage: {opp.stage} • Close: {opp.close_date}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">{formatCurrency(opp.amount)}</div>
                        <div className="text-sm text-muted-foreground">{opp.probability}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Opportunity Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedOpp && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  {selectedOpp.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Amount</div>
                      <div className="text-xl font-bold text-green-600">{formatCurrency(selectedOpp.amount)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Probability</div>
                      <div className="text-xl font-bold">{selectedOpp.probability}%</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Stage</div>
                      <div className="text-xl font-bold capitalize">{selectedOpp.stage?.replace('_', ' ')}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Close Date</div>
                      <div className="text-xl font-bold">{selectedOpp.close_date}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Move Stage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {stages.map(stage => (
                        <Button
                          key={stage.id}
                          variant={selectedOpp.stage === stage.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            updateStage(selectedOpp.opportunity_id, stage.id);
                            setSelectedOpp({...selectedOpp, stage: stage.id});
                          }}
                        >
                          {stage.name}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
                        onClick={() => {
                          updateStage(selectedOpp.opportunity_id, 'closed_won');
                          setIsDetailOpen(false);
                        }}
                      >
                        Won
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-red-50 text-red-700 border-red-300 hover:bg-red-100"
                        onClick={() => {
                          updateStage(selectedOpp.opportunity_id, 'closed_lost');
                          setIsDetailOpen(false);
                        }}
                      >
                        Lost
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {selectedOpp.account && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Account
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="font-medium">{selectedOpp.account.name}</div>
                    </CardContent>
                  </Card>
                )}

                {selectedOpp.description && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedOpp.description}</p>
                    </CardContent>
                  </Card>
                )}

                {selectedOpp.stage_history?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Stage History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedOpp.stage_history.map((history, idx) => (
                          <div key={idx} className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                            <span className="capitalize">{history.stage?.replace('_', ' ')}</span>
                            <span className="text-muted-foreground">
                              {new Date(history.entered_at).toLocaleDateString()} by {history.user_name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
