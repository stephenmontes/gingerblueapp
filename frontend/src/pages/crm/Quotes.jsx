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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { 
  Plus, Search, FileText, Building2, Trash2, Send, Check, X,
  Copy, ShoppingCart, DollarSign, Calendar, User
} from 'lucide-react';

const statusColors = {
  draft: 'bg-gray-500',
  sent: 'bg-blue-500',
  accepted: 'bg-green-500',
  rejected: 'bg-red-500',
  converted: 'bg-purple-500'
};

const statusLabels = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  converted: 'Converted'
};

export default function QuotesPage() {
  const [quotes, setQuotes] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0 });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  // New quote form
  const [newQuote, setNewQuote] = useState({
    quote_name: '',
    opportunity_id: '',
    account_id: '',
    contact_id: '',
    valid_until: '',
    line_items: [],
    subtotal: 0,
    discount_percent: 0,
    discount_amount: 0,
    tax_percent: 0,
    tax_amount: 0,
    shipping_amount: 0,
    total: 0,
    notes: '',
    terms: 'Payment due within 30 days of invoice.'
  });

  const fetchOpportunities = async () => {
    try {
      const res = await fetch(`${API}/crm/opportunities?page_size=200`, { credentials: 'include' });
      const data = await res.json();
      setOpportunities(data.opportunities || []);
    } catch (error) {
      console.error('Failed to fetch opportunities:', error);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API}/crm/accounts?page_size=200`, { credentials: 'include' });
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  const fetchContacts = async (accountId) => {
    if (!accountId) {
      setContacts([]);
      return;
    }
    try {
      const res = await fetch(`${API}/crm/contacts?account_id=${accountId}&page_size=100`, { credentials: 'include' });
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    }
  };

  const fetchQuotes = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: pagination.page, page_size: 25 });
      if (search) params.append('search', search);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      
      const res = await fetch(`${API}/crm/quotes?${params}`, { credentials: 'include' });
      const data = await res.json();
      setQuotes(data.quotes || []);
      setPagination(data.pagination || { page: 1, total: 0 });
    } catch (error) {
      toast.error("Failed to load quotes");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, search, filterStatus]);

  useEffect(() => {
    fetchOpportunities();
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  // Search products from Shopify catalog
  const searchProducts = async (query) => {
    if (!query || query.length < 2) {
      setProductResults([]);
      return;
    }
    try {
      setSearchingProducts(true);
      const res = await fetch(`${API}/crm/quotes/products/search?q=${encodeURIComponent(query)}`, {
        credentials: 'include'
      });
      const data = await res.json();
      setProductResults(data.products || []);
    } catch (error) {
      console.error('Product search failed:', error);
    } finally {
      setSearchingProducts(false);
    }
  };

  // Debounced product search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchProducts(productSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // Add product to line items
  const addLineItem = (product) => {
    const existingIndex = newQuote.line_items.findIndex(
      item => item.product_id === product.product_id && item.variant_id === product.variant_id
    );

    let updatedItems;
    if (existingIndex >= 0) {
      updatedItems = [...newQuote.line_items];
      updatedItems[existingIndex].quantity += 1;
      updatedItems[existingIndex].total = updatedItems[existingIndex].quantity * updatedItems[existingIndex].unit_price;
    } else {
      const newItem = {
        product_id: product.product_id,
        variant_id: product.variant_id,
        product_name: product.title,
        variant_title: product.variant_title,
        sku: product.sku,
        quantity: 1,
        unit_price: product.price,
        discount_percent: 0,
        total: product.price,
        image_url: product.image_url
      };
      updatedItems = [...newQuote.line_items, newItem];
    }
    
    updateQuoteWithItems(updatedItems);
    setProductSearch('');
    setProductResults([]);
  };

  // Update line item quantity
  const updateLineItemQuantity = (index, quantity) => {
    if (quantity < 1) return;
    const updatedItems = [...newQuote.line_items];
    updatedItems[index].quantity = quantity;
    updatedItems[index].total = quantity * updatedItems[index].unit_price * (1 - updatedItems[index].discount_percent / 100);
    updateQuoteWithItems(updatedItems);
  };

  // Update line item discount
  const updateLineItemDiscount = (index, discount) => {
    const updatedItems = [...newQuote.line_items];
    updatedItems[index].discount_percent = Math.max(0, Math.min(100, discount));
    updatedItems[index].total = updatedItems[index].quantity * updatedItems[index].unit_price * (1 - updatedItems[index].discount_percent / 100);
    updateQuoteWithItems(updatedItems);
  };

  // Remove line item
  const removeLineItem = (index) => {
    const updatedItems = newQuote.line_items.filter((_, i) => i !== index);
    updateQuoteWithItems(updatedItems);
  };

  // Recalculate totals
  const updateQuoteWithItems = (items) => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discountAmount = subtotal * (newQuote.discount_percent / 100);
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = afterDiscount * (newQuote.tax_percent / 100);
    const total = afterDiscount + taxAmount + parseFloat(newQuote.shipping_amount || 0);
    
    setNewQuote(prev => ({
      ...prev,
      line_items: items,
      subtotal: Math.round(subtotal * 100) / 100,
      discount_amount: Math.round(discountAmount * 100) / 100,
      tax_amount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100
    }));
  };

  // Handle opportunity selection (auto-fill account)
  const handleOpportunitySelect = (oppId) => {
    const opp = opportunities.find(o => o.opportunity_id === oppId);
    if (opp) {
      setNewQuote(prev => ({
        ...prev,
        opportunity_id: oppId,
        account_id: opp.account_id,
        quote_name: `Quote for ${opp.name}`
      }));
      fetchContacts(opp.account_id);
    }
  };

  const handleCreate = async () => {
    try {
      const res = await fetch(`${API}/crm/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newQuote)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create quote');
      }
      
      toast.success("Quote created successfully");
      setIsCreateOpen(false);
      resetForm();
      fetchQuotes();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const resetForm = () => {
    setNewQuote({
      quote_name: '',
      opportunity_id: '',
      account_id: '',
      contact_id: '',
      valid_until: '',
      line_items: [],
      subtotal: 0,
      discount_percent: 0,
      discount_amount: 0,
      tax_percent: 0,
      tax_amount: 0,
      shipping_amount: 0,
      total: 0,
      notes: '',
      terms: 'Payment due within 30 days of invoice.'
    });
    setContacts([]);
    setProductSearch('');
    setProductResults([]);
  };

  const viewQuote = async (quoteId) => {
    try {
      const res = await fetch(`${API}/crm/quotes/${quoteId}`, { credentials: 'include' });
      const data = await res.json();
      setSelectedQuote(data);
      setIsDetailOpen(true);
    } catch (error) {
      toast.error("Failed to load quote details");
    }
  };

  const sendQuote = async (quoteId) => {
    try {
      await fetch(`${API}/crm/quotes/${quoteId}/send`, {
        method: 'POST',
        credentials: 'include'
      });
      toast.success("Quote marked as sent");
      fetchQuotes();
      if (selectedQuote?.quote_id === quoteId) {
        viewQuote(quoteId);
      }
    } catch (error) {
      toast.error("Failed to send quote");
    }
  };

  const acceptQuote = async (quoteId) => {
    try {
      await fetch(`${API}/crm/quotes/${quoteId}/accept`, {
        method: 'POST',
        credentials: 'include'
      });
      toast.success("Quote accepted! Opportunity amount updated.");
      fetchQuotes();
      if (selectedQuote?.quote_id === quoteId) {
        viewQuote(quoteId);
      }
    } catch (error) {
      toast.error("Failed to accept quote");
    }
  };

  const rejectQuote = async (quoteId) => {
    const reason = prompt("Rejection reason (optional):");
    try {
      await fetch(`${API}/crm/quotes/${quoteId}/reject?reason=${encodeURIComponent(reason || '')}`, {
        method: 'POST',
        credentials: 'include'
      });
      toast.success("Quote rejected");
      fetchQuotes();
      if (selectedQuote?.quote_id === quoteId) {
        viewQuote(quoteId);
      }
    } catch (error) {
      toast.error("Failed to reject quote");
    }
  };

  const cloneQuote = async (quoteId) => {
    try {
      const res = await fetch(`${API}/crm/quotes/${quoteId}/clone`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      toast.success(`New version created: ${data.quote_number}`);
      fetchQuotes();
      viewQuote(data.quote_id);
    } catch (error) {
      toast.error("Failed to clone quote");
    }
  };

  const convertToOrder = async (quoteId) => {
    if (!confirm('Convert this quote to an order? This will mark the opportunity as Closed Won.')) return;
    try {
      await fetch(`${API}/crm/quotes/${quoteId}/convert-to-order`, {
        method: 'POST',
        credentials: 'include'
      });
      toast.success("Quote converted to order! Opportunity closed.");
      fetchQuotes();
      setIsDetailOpen(false);
    } catch (error) {
      toast.error("Failed to convert quote");
    }
  };

  const deleteQuote = async (quoteId) => {
    if (!confirm('Delete this quote?')) return;
    try {
      await fetch(`${API}/crm/quotes/${quoteId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      toast.success("Quote deleted");
      fetchQuotes();
      setIsDetailOpen(false);
    } catch (error) {
      toast.error(error.message || "Failed to delete quote");
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  return (
    <div className="p-6 space-y-6" data-testid="quotes-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Quotes
          </h1>
          <p className="text-sm text-muted-foreground">Create and manage sales quotes</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="create-quote-btn">
              <Plus className="h-4 w-4 mr-2" />
              New Quote
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Quote</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Opportunity *</Label>
                  <Select 
                    value={newQuote.opportunity_id} 
                    onValueChange={handleOpportunitySelect}
                  >
                    <SelectTrigger data-testid="quote-opp-select">
                      <SelectValue placeholder="Select opportunity" />
                    </SelectTrigger>
                    <SelectContent>
                      {opportunities.filter(o => !['closed_won', 'closed_lost'].includes(o.stage)).map(opp => (
                        <SelectItem key={opp.opportunity_id} value={opp.opportunity_id}>
                          {opp.name} - {formatCurrency(opp.amount)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quote Name *</Label>
                  <Input 
                    placeholder="Quote name"
                    value={newQuote.quote_name}
                    onChange={(e) => setNewQuote({...newQuote, quote_name: e.target.value})}
                    data-testid="quote-name-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account</Label>
                  <Select value={newQuote.account_id} disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Auto-filled from opportunity" />
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
                <div className="space-y-2">
                  <Label>Contact</Label>
                  <Select 
                    value={newQuote.contact_id} 
                    onValueChange={(v) => setNewQuote({...newQuote, contact_id: v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select contact" />
                    </SelectTrigger>
                    <SelectContent>
                      {contacts.map(con => (
                        <SelectItem key={con.contact_id} value={con.contact_id}>
                          {con.full_name} {con.email ? `(${con.email})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Valid Until</Label>
                <Input 
                  type="date"
                  value={newQuote.valid_until}
                  onChange={(e) => setNewQuote({...newQuote, valid_until: e.target.value})}
                />
              </div>

              {/* Product Search */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Add Products from Shopify Catalog
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search by product name, SKU, or barcode..."
                    className="pl-10"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    data-testid="product-search-input"
                  />
                </div>
                {productResults.length > 0 && (
                  <div className="border rounded-md max-h-48 overflow-y-auto">
                    {productResults.map((product, idx) => (
                      <div 
                        key={`${product.product_id}-${product.variant_id}-${idx}`}
                        className="p-2 hover:bg-muted cursor-pointer flex justify-between items-center"
                        onClick={() => addLineItem(product)}
                      >
                        <div className="flex items-center gap-2">
                          {product.image_url && (
                            <img src={product.image_url} alt="" className="w-8 h-8 object-cover rounded" />
                          )}
                          <div>
                            <div className="font-medium text-sm">{product.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {product.variant_title !== 'Default Title' && `${product.variant_title} • `}
                              SKU: {product.sku || 'N/A'}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatCurrency(product.price)}</div>
                          <div className="text-xs text-muted-foreground">Qty: {product.inventory_quantity}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searchingProducts && <div className="text-sm text-muted-foreground">Searching...</div>}
              </div>

              {/* Line Items */}
              {newQuote.line_items.length > 0 && (
                <div className="space-y-2">
                  <Label>Line Items</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="w-20">Qty</TableHead>
                        <TableHead className="w-24">Unit Price</TableHead>
                        <TableHead className="w-20">Disc %</TableHead>
                        <TableHead className="w-24 text-right">Total</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newQuote.line_items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <div className="font-medium text-sm">{item.product_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.variant_title !== 'Default Title' && item.variant_title}
                              {item.sku && ` • SKU: ${item.sku}`}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateLineItemQuantity(idx, parseInt(e.target.value))}
                              className="w-16 h-8"
                            />
                          </TableCell>
                          <TableCell>{formatCurrency(item.unit_price)}</TableCell>
                          <TableCell>
                            <Input 
                              type="number"
                              min="0"
                              max="100"
                              value={item.discount_percent}
                              onChange={(e) => updateLineItemDiscount(idx, parseFloat(e.target.value))}
                              className="w-16 h-8"
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeLineItem(idx)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Totals */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Order Discount %</Label>
                    <Input 
                      type="number"
                      min="0"
                      max="100"
                      value={newQuote.discount_percent}
                      onChange={(e) => {
                        const disc = parseFloat(e.target.value) || 0;
                        setNewQuote(prev => ({...prev, discount_percent: disc}));
                        updateQuoteWithItems(newQuote.line_items);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tax %</Label>
                    <Input 
                      type="number"
                      min="0"
                      value={newQuote.tax_percent}
                      onChange={(e) => {
                        const tax = parseFloat(e.target.value) || 0;
                        setNewQuote(prev => ({...prev, tax_percent: tax}));
                        updateQuoteWithItems(newQuote.line_items);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Shipping ($)</Label>
                    <Input 
                      type="number"
                      min="0"
                      value={newQuote.shipping_amount}
                      onChange={(e) => {
                        const ship = parseFloat(e.target.value) || 0;
                        setNewQuote(prev => ({...prev, shipping_amount: ship}));
                        updateQuoteWithItems(newQuote.line_items);
                      }}
                    />
                  </div>
                </div>
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(newQuote.subtotal)}</span>
                  </div>
                  {newQuote.discount_amount > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Discount ({newQuote.discount_percent}%):</span>
                      <span>-{formatCurrency(newQuote.discount_amount)}</span>
                    </div>
                  )}
                  {newQuote.tax_amount > 0 && (
                    <div className="flex justify-between">
                      <span>Tax ({newQuote.tax_percent}%):</span>
                      <span>{formatCurrency(newQuote.tax_amount)}</span>
                    </div>
                  )}
                  {newQuote.shipping_amount > 0 && (
                    <div className="flex justify-between">
                      <span>Shipping:</span>
                      <span>{formatCurrency(newQuote.shipping_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span>{formatCurrency(newQuote.total)}</span>
                  </div>
                </div>
              </div>

              {/* Notes & Terms */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea 
                    placeholder="Additional notes..."
                    value={newQuote.notes}
                    onChange={(e) => setNewQuote({...newQuote, notes: e.target.value})}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Terms & Conditions</Label>
                  <Textarea 
                    placeholder="Payment terms..."
                    value={newQuote.terms}
                    onChange={(e) => setNewQuote({...newQuote, terms: e.target.value})}
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsCreateOpen(false); resetForm(); }}>Cancel</Button>
              <Button 
                onClick={handleCreate} 
                disabled={!newQuote.opportunity_id || !newQuote.quote_name || newQuote.line_items.length === 0}
                data-testid="save-quote-btn"
              >
                Create Quote
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
                placeholder="Search quotes..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Quotes List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : quotes.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No quotes found. Create your first quote!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Opportunity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map(quote => (
                  <TableRow 
                    key={quote.quote_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => viewQuote(quote.quote_id)}
                    data-testid={`quote-row-${quote.quote_id}`}
                  >
                    <TableCell className="font-mono">{quote.quote_number}</TableCell>
                    <TableCell className="font-medium">{quote.quote_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        {quote.account_name || '—'}
                      </div>
                    </TableCell>
                    <TableCell>{quote.opportunity_name || '—'}</TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[quote.status]} text-white`}>
                        {statusLabels[quote.status] || quote.status}
                      </Badge>
                      {quote.version > 1 && (
                        <Badge variant="outline" className="ml-1">v{quote.version}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(quote.total)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(quote.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Quote Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedQuote && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {selectedQuote.quote_number} - {selectedQuote.quote_name}
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6 mt-4">
                {/* Status and Actions */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Badge className={`${statusColors[selectedQuote.status]} text-white`}>
                      {statusLabels[selectedQuote.status]}
                    </Badge>
                    {selectedQuote.version > 1 && (
                      <Badge variant="outline">Version {selectedQuote.version}</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedQuote.status === 'draft' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => sendQuote(selectedQuote.quote_id)}>
                          <Send className="h-4 w-4 mr-1" />
                          Send
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteQuote(selectedQuote.quote_id)}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </>
                    )}
                    {selectedQuote.status === 'sent' && (
                      <>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => acceptQuote(selectedQuote.quote_id)}>
                          <Check className="h-4 w-4 mr-1" />
                          Accept
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => rejectQuote(selectedQuote.quote_id)}>
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    {selectedQuote.status === 'accepted' && (
                      <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => convertToOrder(selectedQuote.quote_id)}>
                        <ShoppingCart className="h-4 w-4 mr-1" />
                        Convert to Order
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => cloneQuote(selectedQuote.quote_id)}>
                      <Copy className="h-4 w-4 mr-1" />
                      New Version
                    </Button>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Total
                      </div>
                      <div className="text-2xl font-bold text-green-600">{formatCurrency(selectedQuote.total)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        Account
                      </div>
                      <div className="font-medium truncate">{selectedQuote.account?.name || selectedQuote.account_name || '—'}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Valid Until
                      </div>
                      <div className="font-medium">{selectedQuote.valid_until || '—'}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Created By
                      </div>
                      <div className="font-medium">{selectedQuote.created_by_name}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Line Items */}
                {selectedQuote.line_items?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Line Items ({selectedQuote.line_items.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-center">Qty</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Discount</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedQuote.line_items.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell>
                                <div className="font-medium">{item.product_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {item.variant_title !== 'Default Title' && item.variant_title}
                                  {item.sku && ` • SKU: ${item.sku}`}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">{item.quantity}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                              <TableCell className="text-right">
                                {item.discount_percent > 0 ? `${item.discount_percent}%` : '—'}
                              </TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {/* Totals Summary */}
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(selectedQuote.subtotal)}</span>
                    </div>
                    {selectedQuote.discount_amount > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>Discount ({selectedQuote.discount_percent}%):</span>
                        <span>-{formatCurrency(selectedQuote.discount_amount)}</span>
                      </div>
                    )}
                    {selectedQuote.tax_amount > 0 && (
                      <div className="flex justify-between">
                        <span>Tax ({selectedQuote.tax_percent}%):</span>
                        <span>{formatCurrency(selectedQuote.tax_amount)}</span>
                      </div>
                    )}
                    {selectedQuote.shipping_amount > 0 && (
                      <div className="flex justify-between">
                        <span>Shipping:</span>
                        <span>{formatCurrency(selectedQuote.shipping_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>Total:</span>
                      <span>{formatCurrency(selectedQuote.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Notes & Terms */}
                {(selectedQuote.notes || selectedQuote.terms) && (
                  <div className="grid grid-cols-2 gap-4">
                    {selectedQuote.notes && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Notes</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm whitespace-pre-wrap">{selectedQuote.notes}</p>
                        </CardContent>
                      </Card>
                    )}
                    {selectedQuote.terms && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Terms & Conditions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm whitespace-pre-wrap">{selectedQuote.terms}</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {/* Other Versions */}
                {selectedQuote.other_versions?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Other Versions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedQuote.other_versions.map(v => (
                          <div 
                            key={v.quote_id}
                            className="flex justify-between items-center p-2 rounded hover:bg-muted cursor-pointer"
                            onClick={() => viewQuote(v.quote_id)}
                          >
                            <div>
                              <span className="font-mono">{v.quote_number}</span>
                              <Badge variant="outline" className="ml-2">v{v.version}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={`${statusColors[v.status]} text-white`}>
                                {statusLabels[v.status]}
                              </Badge>
                              <span className="font-medium">{formatCurrency(v.total)}</span>
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
