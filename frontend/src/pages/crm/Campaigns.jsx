import { useState, useEffect } from 'react';
import { API } from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Megaphone, Plus, Search, Edit, Trash2, Eye, DollarSign, Users, 
  TrendingUp, BarChart3, Calendar, Target, ArrowUpRight, Loader2
} from 'lucide-react';

const campaignTypes = [
  { value: 'email', label: 'Email Campaign' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'trade_show', label: 'Trade Show' },
  { value: 'webinar', label: 'Webinar' },
  { value: 'advertising', label: 'Advertising' },
  { value: 'content_marketing', label: 'Content Marketing' },
  { value: 'referral', label: 'Referral Program' },
  { value: 'direct_mail', label: 'Direct Mail' },
  { value: 'telemarketing', label: 'Telemarketing' },
  { value: 'other', label: 'Other' }
];

const campaignStatuses = [
  { value: 'planned', label: 'Planned', color: 'bg-gray-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-500' },
  { value: 'completed', label: 'Completed', color: 'bg-green-500' },
  { value: 'paused', label: 'Paused', color: 'bg-yellow-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-500' }
];

const getStatusColor = (status) => {
  const found = campaignStatuses.find(s => s.value === status);
  return found ? found.color : 'bg-gray-500';
};

const getTypeLabel = (type) => {
  const found = campaignTypes.find(t => t.value === type);
  return found ? found.label : type;
};

export default function CampaignsPage({ user }) {
  const [campaigns, setCampaigns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  
  const [campaignDialog, setCampaignDialog] = useState({ open: false, data: null });
  const [detailDialog, setDetailDialog] = useState({ open: false, campaign: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCampaigns();
    fetchSummary();
  }, [statusFilter, typeFilter]);

  const fetchCampaigns = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (typeFilter) params.append('campaign_type', typeFilter);
      if (searchQuery) params.append('search', searchQuery);
      
      const res = await fetch(`${API}/campaigns?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch(`${API}/campaigns/reports/summary`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Failed to load summary');
    }
  };

  const fetchCampaignDetail = async (campaignId) => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDetailDialog({ open: true, campaign: data });
      }
    } catch (error) {
      toast.error('Failed to load campaign details');
    }
  };

  const saveCampaign = async () => {
    const data = campaignDialog.data;
    if (!data.name || !data.campaign_type) {
      toast.error('Name and type are required');
      return;
    }

    setSaving(true);
    try {
      const isNew = !data.campaign_id;
      const url = isNew 
        ? `${API}/campaigns`
        : `${API}/campaigns/${data.campaign_id}`;
      
      const params = new URLSearchParams();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '' && key !== 'campaign_id') {
          if (Array.isArray(value)) {
            value.forEach(v => params.append(key, v));
          } else {
            params.append(key, value);
          }
        }
      });

      const res = await fetch(`${url}?${params}`, {
        method: isNew ? 'POST' : 'PUT',
        credentials: 'include'
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save campaign');
      }

      toast.success(isNew ? 'Campaign created' : 'Campaign updated');
      setCampaignDialog({ open: false, data: null });
      fetchCampaigns();
      fetchSummary();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteCampaign = async (campaignId) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (res.ok) {
        toast.success('Campaign deleted');
        fetchCampaigns();
        fetchSummary();
      } else {
        toast.error('Failed to delete campaign');
      }
    } catch (error) {
      toast.error('Failed to delete campaign');
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchCampaigns();
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
  };

  return (
    <div className="p-6 space-y-6" data-testid="campaigns-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" />
            Campaign Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Track marketing campaigns and measure ROI
          </p>
        </div>
        <Button 
          onClick={() => setCampaignDialog({ 
            open: true, 
            data: { 
              name: '', 
              campaign_type: 'email', 
              status: 'planned',
              description: '',
              start_date: '',
              end_date: '',
              budget: '',
              expected_revenue: '',
              target_audience: '',
              channels: [],
              tags: []
            }
          })}
          data-testid="create-campaign-btn"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{summary.total_campaigns}</p>
                  <p className="text-xs text-muted-foreground">Total Campaigns</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{summary.total_leads}</p>
                  <p className="text-xs text-muted-foreground">Leads Generated</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{formatCurrency(summary.total_revenue_won)}</p>
                  <p className="text-xs text-muted-foreground">Revenue Won</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className={`h-5 w-5 ${summary.overall_roi >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                <div>
                  <p className="text-2xl font-bold">{summary.overall_roi}%</p>
                  <p className="text-xs text-muted-foreground">Overall ROI</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search campaigns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-40">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  {campaignStatuses.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label className="text-xs">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All types</SelectItem>
                  {campaignTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" variant="secondary">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No campaigns found</p>
              <p className="text-sm">Create your first campaign to start tracking</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.campaign_id} data-testid={`campaign-row-${campaign.campaign_id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        {campaign.start_date && (
                          <p className="text-xs text-muted-foreground">
                            {campaign.start_date} - {campaign.end_date || 'Ongoing'}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTypeLabel(campaign.campaign_type)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${getStatusColor(campaign.status)} text-white`}>
                        {campaign.status?.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(campaign.budget)}
                    </TableCell>
                    <TableCell className="text-right">
                      {campaign.leads_generated || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(campaign.revenue_won)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={campaign.roi >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {campaign.roi || 0}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => fetchCampaignDetail(campaign.campaign_id)}
                          data-testid={`view-campaign-${campaign.campaign_id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setCampaignDialog({ open: true, data: { ...campaign, existing: true } })}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {(user?.role === 'admin' || user?.role === 'manager') && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => deleteCampaign(campaign.campaign_id)}
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

      {/* Campaign Dialog */}
      <Dialog open={campaignDialog.open} onOpenChange={(open) => !open && setCampaignDialog({ open: false, data: null })}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              {campaignDialog.data?.existing ? 'Edit Campaign' : 'New Campaign'}
            </DialogTitle>
          </DialogHeader>
          {campaignDialog.data && (
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Campaign Name*</Label>
                  <Input 
                    value={campaignDialog.data.name}
                    onChange={(e) => setCampaignDialog({
                      ...campaignDialog,
                      data: { ...campaignDialog.data, name: e.target.value }
                    })}
                    placeholder="e.g., Spring Trade Show 2026"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type*</Label>
                  <Select 
                    value={campaignDialog.data.campaign_type}
                    onValueChange={(val) => setCampaignDialog({
                      ...campaignDialog,
                      data: { ...campaignDialog.data, campaign_type: val }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {campaignTypes.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select 
                    value={campaignDialog.data.status}
                    onValueChange={(val) => setCampaignDialog({
                      ...campaignDialog,
                      data: { ...campaignDialog.data, status: val }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {campaignStatuses.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                  value={campaignDialog.data.description || ''}
                  onChange={(e) => setCampaignDialog({
                    ...campaignDialog,
                    data: { ...campaignDialog.data, description: e.target.value }
                  })}
                  placeholder="Campaign goals, target audience, key messages..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input 
                    type="date"
                    value={campaignDialog.data.start_date || ''}
                    onChange={(e) => setCampaignDialog({
                      ...campaignDialog,
                      data: { ...campaignDialog.data, start_date: e.target.value }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input 
                    type="date"
                    value={campaignDialog.data.end_date || ''}
                    onChange={(e) => setCampaignDialog({
                      ...campaignDialog,
                      data: { ...campaignDialog.data, end_date: e.target.value }
                    })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Budget ($)</Label>
                  <Input 
                    type="number"
                    value={campaignDialog.data.budget || ''}
                    onChange={(e) => setCampaignDialog({
                      ...campaignDialog,
                      data: { ...campaignDialog.data, budget: e.target.value }
                    })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expected Revenue ($)</Label>
                  <Input 
                    type="number"
                    value={campaignDialog.data.expected_revenue || ''}
                    onChange={(e) => setCampaignDialog({
                      ...campaignDialog,
                      data: { ...campaignDialog.data, expected_revenue: e.target.value }
                    })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Input 
                  value={campaignDialog.data.target_audience || ''}
                  onChange={(e) => setCampaignDialog({
                    ...campaignDialog,
                    data: { ...campaignDialog.data, target_audience: e.target.value }
                  })}
                  placeholder="e.g., Retail buyers, Interior designers, Wholesale accounts"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignDialog({ open: false, data: null })}>
              Cancel
            </Button>
            <Button onClick={saveCampaign} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>Save Campaign</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Detail Dialog */}
      <Dialog open={detailDialog.open} onOpenChange={(open) => !open && setDetailDialog({ open: false, campaign: null })}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {detailDialog.campaign && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5" />
                  {detailDialog.campaign.name}
                  <Badge className={`${getStatusColor(detailDialog.campaign.status)} text-white ml-2`}>
                    {detailDialog.campaign.status?.replace('_', ' ')}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <Tabs defaultValue="overview" className="mt-4">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="leads">Leads ({detailDialog.campaign.leads?.length || 0})</TabsTrigger>
                  <TabsTrigger value="opportunities">Opportunities ({detailDialog.campaign.opportunities?.length || 0})</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-4 text-center">
                        <p className="text-3xl font-bold text-blue-600">{detailDialog.campaign.metrics?.leads_generated || 0}</p>
                        <p className="text-sm text-muted-foreground">Leads Generated</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 text-center">
                        <p className="text-3xl font-bold text-green-600">{formatCurrency(detailDialog.campaign.metrics?.revenue_won)}</p>
                        <p className="text-sm text-muted-foreground">Revenue Won</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 text-center">
                        <p className={`text-3xl font-bold ${detailDialog.campaign.metrics?.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {detailDialog.campaign.metrics?.roi || 0}%
                        </p>
                        <p className="text-sm text-muted-foreground">ROI</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Details */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Campaign Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type</span>
                        <span>{getTypeLabel(detailDialog.campaign.campaign_type)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Budget</span>
                        <span>{formatCurrency(detailDialog.campaign.budget)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Expected Revenue</span>
                        <span>{formatCurrency(detailDialog.campaign.expected_revenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cost per Lead</span>
                        <span>{formatCurrency(detailDialog.campaign.metrics?.cost_per_lead)}</span>
                      </div>
                      {detailDialog.campaign.start_date && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Duration</span>
                          <span>{detailDialog.campaign.start_date} - {detailDialog.campaign.end_date || 'Ongoing'}</span>
                        </div>
                      )}
                      {detailDialog.campaign.target_audience && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Target Audience</span>
                          <span>{detailDialog.campaign.target_audience}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {detailDialog.campaign.description && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Description</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {detailDialog.campaign.description}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="leads">
                  {detailDialog.campaign.leads?.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailDialog.campaign.leads.map(lead => (
                          <TableRow key={lead.lead_id}>
                            <TableCell className="font-medium">{lead.full_name}</TableCell>
                            <TableCell>{lead.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{lead.status}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(lead.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No leads attributed to this campaign</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="opportunities">
                  {detailDialog.campaign.opportunities?.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Stage</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailDialog.campaign.opportunities.map(opp => (
                          <TableRow key={opp.opportunity_id}>
                            <TableCell className="font-medium">{opp.name}</TableCell>
                            <TableCell className="text-right">{formatCurrency(opp.amount)}</TableCell>
                            <TableCell>
                              <Badge variant={opp.stage === 'closed_won' ? 'default' : 'outline'}>
                                {opp.stage?.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(opp.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No opportunities attributed to this campaign</p>
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
