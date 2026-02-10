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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  Plus, Search, Building2, Phone, Globe, Mail, 
  MoreVertical, Trash2, Eye, Users, TrendingUp
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const accountTypes = [
  { value: 'prospect', label: 'Prospect', color: 'bg-blue-100 text-blue-800' },
  { value: 'customer', label: 'Customer', color: 'bg-green-100 text-green-800' },
  { value: 'vendor', label: 'Vendor', color: 'bg-purple-100 text-purple-800' },
  { value: 'partner', label: 'Partner', color: 'bg-orange-100 text-orange-800' }
];

const industries = [
  'Retail', 'Wholesale', 'E-commerce', 'Manufacturing', 'Services', 'Other'
];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { toast } = useToast();

  const [newAccount, setNewAccount] = useState({
    name: '',
    account_type: 'prospect',
    industry: '',
    website: '',
    phone: '',
    description: ''
  });

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        page_size: 25
      });
      if (search) params.append('search', search);
      if (filterType !== 'all') params.append('account_type', filterType);
      
      const res = await fetch(`${API}/crm/accounts?${params}`, { credentials: 'include' });
      const data = await res.json();
      setAccounts(data.accounts || []);
      setPagination(data.pagination || { page: 1, total: 0, total_pages: 0 });
    } catch (error) {
      toast({ title: "Error", description: "Failed to load accounts", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, search, filterType, toast]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreate = async () => {
    try {
      const res = await fetch(`${API}/crm/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newAccount)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create account');
      }
      
      toast({ title: "Success", description: "Account created successfully" });
      setIsCreateOpen(false);
      setNewAccount({ name: '', account_type: 'prospect', industry: '', website: '', phone: '', description: '' });
      fetchAccounts();
    } catch (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const viewAccount = async (accountId) => {
    try {
      const res = await fetch(`${API}/crm/accounts/${accountId}`, { credentials: 'include' });
      const data = await res.json();
      setSelectedAccount(data);
      setIsDetailOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load account details", variant: "destructive" });
    }
  };

  const deleteAccount = async (accountId) => {
    if (!confirm('Are you sure you want to delete this account?')) return;
    try {
      await fetch(`${API}/crm/accounts/${accountId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      toast({ title: "Success", description: "Account deleted" });
      fetchAccounts();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete account", variant: "destructive" });
    }
  };

  const getTypeBadge = (type) => {
    const typeConfig = accountTypes.find(t => t.value === type);
    return typeConfig ? (
      <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
    ) : (
      <Badge variant="outline">{type}</Badge>
    );
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount || 0);
  };

  return (
    <div className="p-6 space-y-6" data-testid="accounts-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Accounts
          </h1>
          <p className="text-sm text-muted-foreground">Manage your customer and prospect accounts</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-account-btn">
              <Plus className="h-4 w-4 mr-2" />
              New Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Account</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Account Name *</Label>
                <Input 
                  placeholder="Company name"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                  data-testid="account-name-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select 
                    value={newAccount.account_type} 
                    onValueChange={(v) => setNewAccount({...newAccount, account_type: v})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accountTypes.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Select 
                    value={newAccount.industry} 
                    onValueChange={(v) => setNewAccount({...newAccount, industry: v})}
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
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input 
                    placeholder="Phone number"
                    value={newAccount.phone}
                    onChange={(e) => setNewAccount({...newAccount, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input 
                    placeholder="https://..."
                    value={newAccount.website}
                    onChange={(e) => setNewAccount({...newAccount, website: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                  placeholder="Notes about this account..."
                  value={newAccount.description}
                  onChange={(e) => setNewAccount({...newAccount, description: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newAccount.name} data-testid="save-account-btn">
                Create Account
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
                placeholder="Search accounts..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="search-accounts"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {accountTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
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
              No accounts found. Create your first account to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Pipeline</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map(account => (
                  <TableRow key={account.account_id} className="cursor-pointer hover:bg-muted/50" data-testid={`account-row-${account.account_id}`}>
                    <TableCell onClick={() => viewAccount(account.account_id)}>
                      <div className="font-medium">{account.name}</div>
                      {account.website && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {account.website}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{getTypeBadge(account.account_type)}</TableCell>
                    <TableCell>{account.industry || '-'}</TableCell>
                    <TableCell>
                      {account.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {account.phone}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium text-blue-600">
                      {formatCurrency(account.pipeline_value)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {formatCurrency(account.total_revenue)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => viewAccount(account.account_id)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteAccount(account.account_id)} className="text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedAccount && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {selectedAccount.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                {/* Account Info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Type</div>
                      <div className="mt-1">{getTypeBadge(selectedAccount.account_type)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Pipeline Value</div>
                      <div className="text-xl font-bold text-blue-600">{formatCurrency(selectedAccount.pipeline_value)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Total Revenue</div>
                      <div className="text-xl font-bold text-green-600">{formatCurrency(selectedAccount.total_revenue)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Open Opps</div>
                      <div className="text-xl font-bold">{selectedAccount.open_opportunities || 0}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Contact Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    {selectedAccount.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {selectedAccount.phone}
                      </div>
                    )}
                    {selectedAccount.website && (
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <a href={selectedAccount.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {selectedAccount.website}
                        </a>
                      </div>
                    )}
                    {selectedAccount.industry && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {selectedAccount.industry}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Contacts */}
                {selectedAccount.contacts?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Contacts ({selectedAccount.contacts.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedAccount.contacts.map(contact => (
                          <div key={contact.contact_id} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                            <div>
                              <div className="font-medium">{contact.full_name}</div>
                              <div className="text-sm text-muted-foreground">{contact.title || contact.email}</div>
                            </div>
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="text-blue-600">
                                <Mail className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Opportunities */}
                {selectedAccount.opportunities?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Opportunities ({selectedAccount.opportunities.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedAccount.opportunities.map(opp => (
                          <div key={opp.opportunity_id} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                            <div>
                              <div className="font-medium">{opp.name}</div>
                              <div className="text-sm text-muted-foreground">
                                Stage: {opp.stage} | Close: {opp.close_date}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-green-600">{formatCurrency(opp.amount)}</div>
                              <div className="text-sm text-muted-foreground">{opp.probability}%</div>
                            </div>
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
