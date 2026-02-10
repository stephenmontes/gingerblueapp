import { useState, useEffect, useCallback } from 'react';
import { API } from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Search, Building2, Phone, Mail, MapPin, 
  User, ShoppingCart, DollarSign, TrendingUp, Clock,
  Tag, Edit, Save, Lock, Unlock, MessageCircle
} from 'lucide-react';
import ActivityTimeline from '@/components/crm/ActivityTimeline';

const accountStatuses = [
  { value: 'prospect', label: 'Prospect', color: 'bg-blue-100 text-blue-800' },
  { value: 'customer', label: 'Customer', color: 'bg-green-100 text-green-800' },
  { value: 'dormant', label: 'Dormant', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'churned', label: 'Churned', color: 'bg-red-100 text-red-800' },
  { value: 'vip', label: 'VIP', color: 'bg-purple-100 text-purple-800' }
];

const industries = [
  'Retail', 'Wholesale', 'E-commerce', 'Manufacturing', 'Services', 
  'Hospitality', 'Healthcare', 'Education', 'Other'
];

const territories = [
  'Northeast', 'Southeast', 'Midwest', 'Southwest', 'West', 'International'
];

export default function UnifiedAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        page_size: 25
      });
      if (search) params.append('search', search);
      if (filterStatus !== 'all') params.append('account_status', filterStatus);
      
      const res = await fetch(`${API}/customer-crm/accounts?${params}`, { credentials: 'include' });
      const data = await res.json();
      setAccounts(data.accounts || []);
      setPagination(data.pagination || { page: 1, total: 0, total_pages: 0 });
    } catch (error) {
      toast.error("Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, search, filterStatus]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const viewAccount = async (customerId) => {
    try {
      const res = await fetch(`${API}/customer-crm/accounts/${customerId}`, { credentials: 'include' });
      const data = await res.json();
      setSelectedAccount(data);
      setEditData(data.crm_data || {});
      setIsDetailOpen(true);
      setIsEditing(false);
    } catch (error) {
      toast.error("Failed to load account details");
    }
  };

  const saveCRMData = async () => {
    if (!selectedAccount) return;
    try {
      const customerId = selectedAccount.shopify_data.customer_id;
      const res = await fetch(`${API}/customer-crm/accounts/${customerId}/crm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editData)
      });
      
      if (!res.ok) throw new Error('Failed to save');
      
      toast.success("CRM data saved");
      setIsEditing(false);
      viewAccount(customerId);
      fetchAccounts();
    } catch (error) {
      toast.error("Failed to save CRM data");
    }
  };

  const getStatusBadge = (status) => {
    const config = accountStatuses.find(s => s.value === status);
    return config ? (
      <Badge className={config.color}>{config.label}</Badge>
    ) : (
      <Badge variant="outline">{status || 'Unknown'}</Badge>
    );
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD', 
      maximumFractionDigits: 0 
    }).format(amount || 0);
  };

  return (
    <div className="p-6 space-y-6" data-testid="unified-accounts-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Customer Accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            Unified view: Shopify data + CRM fields + ERP rollups
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <div className="font-medium text-blue-900">Field Ownership Rules</div>
              <div className="text-sm text-blue-700">
                <span className="font-medium">Shopify-owned fields</span> (name, email, address) are read-only and sync from Shopify. 
                <span className="font-medium"> CRM fields</span> (status, tags, territory, notes) are editable and never overwritten by sync.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by name, email, company..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {accountStatuses.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Accounts Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : accounts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No accounts found. Sync customers from Shopify to see them here.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>CRM Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map(account => (
                  <TableRow 
                    key={account.customer_id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => viewAccount(account.customer_id)}
                  >
                    <TableCell>
                      <div className="font-medium">{account.full_name || account.email}</div>
                      {account.has_crm_record && (
                        <Badge variant="outline" className="text-xs">CRM</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {account.company && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {account.company}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {account.email && (
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            {account.email}
                          </div>
                        )}
                        {account.phone && (
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3" />
                            {account.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(account.account_status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {account.owner_name || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {account.shopify_orders_count || 0}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {formatCurrency(account.shopify_total_spent)}
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

      {/* Account Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedAccount && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {selectedAccount.shopify_data?.first_name} {selectedAccount.shopify_data?.last_name}
                  {selectedAccount.shopify_data?.default_address?.company && (
                    <span className="text-muted-foreground font-normal">
                      - {selectedAccount.shopify_data.default_address.company}
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>

              <Tabs defaultValue="overview" className="mt-4">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="timeline" className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    Timeline
                  </TabsTrigger>
                  <TabsTrigger value="shopify">Shopify Data</TabsTrigger>
                  <TabsTrigger value="crm">CRM Data</TabsTrigger>
                  <TabsTrigger value="orders">Orders & Activity</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                  {/* ERP Rollups */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <ShoppingCart className="h-4 w-4" />
                          Total Orders
                        </div>
                        <div className="text-2xl font-bold">{selectedAccount.erp_data?.total_orders || 0}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          Total Revenue
                        </div>
                        <div className="text-2xl font-bold text-green-600">
                          {formatCurrency(selectedAccount.erp_data?.total_revenue)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="h-4 w-4" />
                          Pipeline Value
                        </div>
                        <div className="text-2xl font-bold text-blue-600">
                          {formatCurrency(selectedAccount.erp_data?.pipeline_value)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          Open Orders
                        </div>
                        <div className="text-2xl font-bold">
                          {selectedAccount.erp_data?.open_orders_count || 0}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Quick Info */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Lock className="h-4 w-4 text-gray-400" />
                          Contact Info (Shopify)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {selectedAccount.shopify_data?.email || '-'}
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {selectedAccount.shopify_data?.phone || '-'}
                        </div>
                        {selectedAccount.shopify_data?.default_address && (
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                            <div className="text-sm">
                              {selectedAccount.shopify_data.default_address.address1}<br/>
                              {selectedAccount.shopify_data.default_address.city}, {selectedAccount.shopify_data.default_address.province} {selectedAccount.shopify_data.default_address.zip}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Unlock className="h-4 w-4 text-green-500" />
                          CRM Info (Editable)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-sm">Status:</span>
                          {getStatusBadge(selectedAccount.crm_data?.account_status)}
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          Owner: {selectedAccount.crm_data?.owner_name || 'Unassigned'}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-sm">Territory:</span>
                          {selectedAccount.crm_data?.territory || '-'}
                        </div>
                        {selectedAccount.crm_data?.tags?.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            {selectedAccount.crm_data.tags.map((tag, i) => (
                              <Badge key={i} variant="secondary">{tag}</Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Shopify Data Tab (Read-only) */}
                <TabsContent value="shopify" className="space-y-4">
                  <Card className="border-gray-300 bg-gray-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-gray-600">
                        <Lock className="h-4 w-4" />
                        Shopify-Owned Fields (Read-Only)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">
                        These fields are synced from Shopify and cannot be edited here. Changes must be made in Shopify.
                      </p>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-gray-500">Email</Label>
                          <div className="font-medium">{selectedAccount.shopify_data?.email || '-'}</div>
                        </div>
                        <div>
                          <Label className="text-gray-500">Phone</Label>
                          <div className="font-medium">{selectedAccount.shopify_data?.phone || '-'}</div>
                        </div>
                        <div>
                          <Label className="text-gray-500">First Name</Label>
                          <div className="font-medium">{selectedAccount.shopify_data?.first_name || '-'}</div>
                        </div>
                        <div>
                          <Label className="text-gray-500">Last Name</Label>
                          <div className="font-medium">{selectedAccount.shopify_data?.last_name || '-'}</div>
                        </div>
                        <div>
                          <Label className="text-gray-500">Shopify ID</Label>
                          <div className="font-mono text-sm">{selectedAccount.shopify_data?.shopify_id || '-'}</div>
                        </div>
                        <div>
                          <Label className="text-gray-500">Orders Count</Label>
                          <div className="font-medium">{selectedAccount.shopify_data?.orders_count || 0}</div>
                        </div>
                        <div>
                          <Label className="text-gray-500">Total Spent</Label>
                          <div className="font-medium">{formatCurrency(selectedAccount.shopify_data?.total_spent)}</div>
                        </div>
                        <div>
                          <Label className="text-gray-500">Accepts Marketing</Label>
                          <div>{selectedAccount.shopify_data?.accepts_marketing ? 'Yes' : 'No'}</div>
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-gray-500">Shopify Tags</Label>
                          <div className="font-medium">{selectedAccount.shopify_data?.shopify_tags || '-'}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* CRM Data Tab (Editable) */}
                <TabsContent value="crm" className="space-y-4">
                  <Card className="border-green-300 bg-green-50">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                        <Unlock className="h-4 w-4" />
                        CRM-Owned Fields (Editable)
                      </CardTitle>
                      {!isEditing ? (
                        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={saveCRMData}>
                            <Save className="h-4 w-4 mr-1" />
                            Save
                          </Button>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">
                        These fields are CRM-owned and will never be overwritten by Shopify sync.
                      </p>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Account Status</Label>
                          {isEditing ? (
                            <Select 
                              value={editData.account_status || 'prospect'} 
                              onValueChange={(v) => setEditData({...editData, account_status: v})}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {accountStatuses.map(s => (
                                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div>{getStatusBadge(editData.account_status)}</div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Industry</Label>
                          {isEditing ? (
                            <Select 
                              value={editData.industry || ''} 
                              onValueChange={(v) => setEditData({...editData, industry: v})}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select industry" />
                              </SelectTrigger>
                              <SelectContent>
                                {industries.map(i => (
                                  <SelectItem key={i} value={i}>{i}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="font-medium">{editData.industry || '-'}</div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Territory</Label>
                          {isEditing ? (
                            <Select 
                              value={editData.territory || ''} 
                              onValueChange={(v) => setEditData({...editData, territory: v})}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select territory" />
                              </SelectTrigger>
                              <SelectContent>
                                {territories.map(t => (
                                  <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="font-medium">{editData.territory || '-'}</div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Account Type</Label>
                          {isEditing ? (
                            <Input 
                              value={editData.account_type || ''} 
                              onChange={(e) => setEditData({...editData, account_type: e.target.value})}
                              placeholder="B2B, Wholesale, etc."
                            />
                          ) : (
                            <div className="font-medium">{editData.account_type || '-'}</div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Credit Limit ($)</Label>
                          {isEditing ? (
                            <Input 
                              type="number"
                              value={editData.credit_limit || ''} 
                              onChange={(e) => setEditData({...editData, credit_limit: parseFloat(e.target.value) || null})}
                              placeholder="0"
                            />
                          ) : (
                            <div className="font-medium">{formatCurrency(editData.credit_limit)}</div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Payment Terms</Label>
                          {isEditing ? (
                            <Input 
                              value={editData.payment_terms || ''} 
                              onChange={(e) => setEditData({...editData, payment_terms: e.target.value})}
                              placeholder="Net 30, COD, etc."
                            />
                          ) : (
                            <div className="font-medium">{editData.payment_terms || '-'}</div>
                          )}
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <Label>CRM Notes</Label>
                          {isEditing ? (
                            <Textarea 
                              value={editData.notes || ''} 
                              onChange={(e) => setEditData({...editData, notes: e.target.value})}
                              placeholder="Internal notes about this account..."
                              rows={3}
                            />
                          ) : (
                            <div className="font-medium whitespace-pre-wrap">{editData.notes || '-'}</div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Orders & Activity Tab */}
                <TabsContent value="orders" className="space-y-4">
                  {/* Recent Orders */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        Recent Orders
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedAccount.recent_orders?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedAccount.recent_orders.map((order, i) => (
                            <div key={i} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                              <div>
                                <div className="font-medium">{order.name || order.order_id}</div>
                                <div className="text-sm text-muted-foreground">
                                  {new Date(order.created_at).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">{formatCurrency(order.total_price)}</div>
                                <Badge variant="outline">{order.fulfillment_status || 'pending'}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-muted-foreground text-center py-4">No orders found</div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Opportunities */}
                  {selectedAccount.opportunities?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Opportunities
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {selectedAccount.opportunities.map((opp, i) => (
                            <div key={i} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                              <div>
                                <div className="font-medium">{opp.name}</div>
                                <div className="text-sm text-muted-foreground capitalize">
                                  {opp.stage?.replace('_', ' ')} - {opp.probability}%
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-green-600">{formatCurrency(opp.amount)}</div>
                                <div className="text-xs text-muted-foreground">Close: {opp.close_date}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
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
