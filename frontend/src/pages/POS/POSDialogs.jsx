import { User, UserPlus, Search, Loader2, X, Lock, Unlock, Trash2, Clock, Users, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// Customer Dialog Component
export function CustomerDialog({
  open,
  onOpenChange,
  selectedStore,
  customerSearch,
  setCustomerSearch,
  customerResults,
  searchingCustomers,
  onSearchCustomers,
  onSelectCustomer,
  setTaxExempt,
  newCustomerMode,
  setNewCustomerMode,
  newCustomer,
  setNewCustomer,
  onCreateCustomer
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            {newCustomerMode ? "Create Customer" : "Select Customer"}
          </DialogTitle>
        </DialogHeader>

        {!newCustomerMode ? (
          <div className="space-y-4">
            {/* Search */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, phone, company..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-9"
                  data-testid="customer-search-input"
                />
              </div>
              <Button onClick={() => onSearchCustomers(customerSearch)}>
                {searchingCustomers ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </Button>
            </div>

            {/* Search Results */}
            {customerResults.length > 0 && (
              <ScrollArea className="h-[300px] border rounded-lg">
                <div className="p-2 space-y-2">
                  {customerResults.map((cust) => (
                    <div
                      key={cust.customer_id}
                      className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                      data-testid={`customer-result-${cust.customer_id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{cust.name}</p>
                          {cust.company && (
                            <p className="text-sm text-muted-foreground">{cust.company}</p>
                          )}
                          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mt-1">
                            {cust.email && <span>{cust.email}</span>}
                            {cust.phone && <span>• {cust.phone}</span>}
                          </div>
                          {cust.default_address && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {[cust.default_address.city, cust.default_address.province].filter(Boolean).join(", ")}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            {cust.orders_count > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {cust.orders_count} orders
                              </Badge>
                            )}
                            {cust.total_spent > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                ${parseFloat(cust.total_spent).toFixed(2)} spent
                              </Badge>
                            )}
                            {cust.tax_exempt && (
                              <Badge variant="outline" className="text-xs">Tax Exempt</Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            onSelectCustomer(cust);
                            setTaxExempt(cust.tax_exempt || false);
                            onOpenChange(false);
                          }}
                        >
                          Select
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* No Results */}
            {customerSearch.length >= 2 && customerResults.length === 0 && !searchingCustomers && (
              <div className="text-center py-8 text-muted-foreground">
                <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="font-medium">No customers found for "{customerSearch}"</p>
                <p className="text-sm mt-1">Try a different search term or create a new customer</p>
                <p className="text-xs mt-2 text-muted-foreground/60">
                  Tip: Search by name, email, phone, or company
                </p>
                <Button
                  variant="link"
                  onClick={() => setNewCustomerMode(true)}
                >
                  Create new customer
                </Button>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setNewCustomerMode(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                New Customer
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  value={newCustomer.first_name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })}
                  data-testid="new-customer-firstname"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input
                  value={newCustomer.last_name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })}
                  data-testid="new-customer-lastname"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Company</Label>
                <Input
                  value={newCustomer.company}
                  onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Address</Label>
                <Input
                  value={newCustomer.address1}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address1: e.target.value })}
                  placeholder="Address line 1"
                />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={newCustomer.city}
                  onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  value={newCustomer.state}
                  onChange={(e) => setNewCustomer({ ...newCustomer, state: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>ZIP</Label>
                <Input
                  value={newCustomer.zip}
                  onChange={(e) => setNewCustomer({ ...newCustomer, zip: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={newCustomer.tax_exempt}
                  onCheckedChange={(checked) => setNewCustomer({ ...newCustomer, tax_exempt: checked })}
                />
                <Label>Tax Exempt</Label>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Note</Label>
                <Textarea
                  value={newCustomer.note}
                  onChange={(e) => setNewCustomer({ ...newCustomer, note: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setNewCustomerMode(false)}>
                Back to Search
              </Button>
              <Button onClick={() => onCreateCustomer(() => onOpenChange(false))}>
                Create Customer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Custom Item Dialog Component
export function CustomItemDialog({
  open,
  onOpenChange,
  customItem,
  setCustomItem,
  onAddCustomItem
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Item</DialogTitle>
          <DialogDescription>
            Add a product that isn't in your catalog
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              value={customItem.title}
              onChange={(e) => setCustomItem({ ...customItem, title: e.target.value })}
              placeholder="Custom item name"
              data-testid="custom-item-title"
            />
          </div>
          <div className="space-y-2">
            <Label>SKU</Label>
            <Input
              value={customItem.sku}
              onChange={(e) => setCustomItem({ ...customItem, sku: e.target.value })}
              placeholder="Optional SKU"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Price *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={customItem.price}
                onChange={(e) => setCustomItem({ ...customItem, price: parseFloat(e.target.value) || 0 })}
                data-testid="custom-item-price"
              />
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={customItem.quantity}
                onChange={(e) => setCustomItem({ ...customItem, quantity: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={customItem.taxable}
              onCheckedChange={(checked) => setCustomItem({ ...customItem, taxable: checked })}
            />
            <Label>Taxable</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onAddCustomItem} data-testid="add-custom-item-confirm">
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Drafts Dialog Component
export function DraftsDialog({
  open,
  onOpenChange,
  drafts,
  filteredDrafts,
  loadingDrafts,
  draftsFilter,
  setDraftsFilter,
  draftsSearch,
  setDraftsSearch,
  onLoadDraft,
  onDeleteDraft,
  onReleaseDraft
}) {
  // Helper to get customer name from draft
  const getCustomerName = (draft) => {
    if (draft.customer_name) return draft.customer_name;
    if (draft.customer_data?.full_name) return draft.customer_data.full_name;
    if (draft.customer_data?.name) return draft.customer_data.name;
    if (draft.customer?.name) return draft.customer.name;
    return null;
  };

  // Helper to get notes (strip auto-save prefix if present)
  const getNotes = (draft) => {
    const notes = draft.notes || draft.note || "";
    if (!notes) return null;
    // Remove auto-save timestamp line
    const cleanNotes = notes.replace(/\[Auto-saved by .+?\]$/gm, "").trim();
    return cleanNotes || null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Draft Orders ({drafts.length})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Search drafts..."
              value={draftsSearch}
              onChange={(e) => setDraftsSearch(e.target.value)}
              className="flex-1"
            />
            <Tabs value={draftsFilter} onValueChange={setDraftsFilter}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="mine">Mine</TabsTrigger>
                <TabsTrigger value="others">Others</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Drafts List */}
          {loadingDrafts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredDrafts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No draft orders found</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {filteredDrafts.map((draft) => {
                  const customerName = getCustomerName(draft);
                  const notes = getNotes(draft);
                  const itemCount = draft.total_items || draft.items?.length || 0;
                  
                  return (
                    <div
                      key={draft.order_id}
                      className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer relative overflow-hidden"
                      onClick={() => onLoadDraft(draft, window.confirm)}
                      style={draft.order_color ? {
                        borderLeftWidth: '4px',
                        borderLeftColor: draft.order_color.accent
                      } : undefined}
                    >
                      {/* Color indicator strip */}
                      {draft.order_color && (
                        <div 
                          className="absolute top-0 left-0 bottom-0 w-1"
                          style={{ backgroundColor: draft.order_color.accent }}
                        />
                      )}
                      
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 pl-2">
                          {/* Header: Order number + badges */}
                          <div className="flex items-center flex-wrap gap-2 mb-1">
                            <p className="font-mono font-bold text-sm">{draft.pos_order_number}</p>
                            {draft.is_locked && (
                              <Badge variant={draft.is_mine ? "default" : "destructive"} className="text-xs">
                                {draft.is_mine ? <Lock className="w-3 h-3 mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
                                {draft.is_mine ? "Editing" : draft.locked_by_name}
                              </Badge>
                            )}
                            {draft.order_color && (
                              <div 
                                className="w-3 h-3 rounded-full border"
                                style={{ backgroundColor: draft.order_color.accent }}
                                title="Order color"
                              />
                            )}
                          </div>
                          
                          {/* Customer */}
                          <div className="flex items-center gap-2 text-sm">
                            <User className="w-3 h-3 text-muted-foreground" />
                            <span className={customerName ? "font-medium" : "text-muted-foreground italic"}>
                              {customerName || "No customer"}
                            </span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-muted-foreground">{itemCount} item(s)</span>
                            <span className="font-semibold">${(draft.total_price || draft.total || 0).toFixed(2)}</span>
                          </div>
                          
                          {/* Ship Date */}
                          {draft.requested_ship_date && (
                            <div className="flex items-center gap-2 text-xs text-orange-500 mt-1">
                              <Calendar className="w-3 h-3" />
                              <span>Ship: {draft.requested_ship_date}</span>
                            </div>
                          )}
                          
                          {/* Notes preview */}
                          {notes && (
                            <div className="flex items-start gap-2 text-xs text-muted-foreground mt-1">
                              <FileText className="w-3 h-3 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-1">{notes}</span>
                            </div>
                          )}
                          
                          {/* Created info */}
                          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {new Date(draft.created_at).toLocaleString()}
                            {draft.created_by_name && (
                              <span>• by {draft.created_by_name}</span>
                            )}
                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {draft.is_locked && draft.is_mine && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                onReleaseDraft(draft.order_id);
                              }}
                              title="Release lock"
                            >
                              <Unlock className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm("Delete this draft?")) {
                                onDeleteDraft(draft.order_id);
                              }
                            }}
                            title="Delete draft"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Print Receipt Dialog
export function PrintReceiptDialog({
  open,
  onOpenChange,
  lastOrder,
  printRef,
  onPrint
}) {
  if (!lastOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Order Created Successfully</DialogTitle>
          <DialogDescription>
            Order {lastOrder.pos_order_number} has been synced to Shopify
          </DialogDescription>
        </DialogHeader>

        {/* Hidden print content */}
        <div className="hidden">
          <div ref={printRef}>
            <div className="header">
              <h1>{lastOrder.store_name}</h1>
              <p>Order Receipt</p>
            </div>
            <div className="order-info">
              <p className="order-number">{lastOrder.pos_order_number}</p>
              {lastOrder.shopify_order_number && (
                <p>Shopify: #{lastOrder.shopify_order_number}</p>
              )}
              <p>{lastOrder.created_at}</p>
              <p>Served by: {lastOrder.created_by}</p>
            </div>
            {lastOrder.customer && (
              <div className="customer">
                <p><strong>{lastOrder.customer.name}</strong></p>
                {lastOrder.customer.email && <p>{lastOrder.customer.email}</p>}
                {lastOrder.customer.phone && <p>{lastOrder.customer.phone}</p>}
              </div>
            )}
            <div className="items">
              {lastOrder.items.map((item, idx) => {
                const lineTotal = item.price * item.quantity;
                const discountAmt = item.discount_type && item.discount_value > 0 
                  ? (item.discount_type === 'percentage' ? lineTotal * item.discount_value / 100 : item.discount_value)
                  : 0;
                const finalTotal = lineTotal - discountAmt;
                return (
                  <div key={idx} className="item">
                    {item.image && <img src={item.image} className="item-image" alt="" />}
                    {!item.image && <div className="item-image-placeholder">No img</div>}
                    <div className="item-details">
                      <div className="item-name">{item.title}</div>
                      {item.sku && <div className="item-sku">SKU: {item.sku}</div>}
                      <div className="item-meta">
                        <span className="item-qty">{item.quantity} x ${item.price.toFixed(2)}</span>
                        <span className="item-price">${finalTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="totals">
              <div className="total-row">
                <span>Subtotal</span>
                <span>${(lastOrder.subtotal + (lastOrder.order_discount_amount || 0)).toFixed(2)}</span>
              </div>
              {lastOrder.order_discount_amount > 0 && (
                <div className="total-row">
                  <span>Discount</span>
                  <span>-${lastOrder.order_discount_amount.toFixed(2)}</span>
                </div>
              )}
              {lastOrder.shipping?.price > 0 && (
                <div className="total-row">
                  <span>Shipping</span>
                  <span>${lastOrder.shipping.price.toFixed(2)}</span>
                </div>
              )}
              {lastOrder.tax_exempt && (
                <div className="total-row">
                  <span>Tax</span>
                  <span>Exempt</span>
                </div>
              )}
              <div className="total-row grand">
                <span>Total</span>
                <span>${lastOrder.total.toFixed(2)}</span>
              </div>
            </div>
            {lastOrder.note && (
              <div className="note">
                <strong>Note:</strong> {lastOrder.note}
              </div>
            )}
            <div className="footer">
              <p>Thank you for your order!</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">POS Order:</span>
            <span className="font-mono font-bold">{lastOrder.pos_order_number}</span>
          </div>
          {lastOrder.shopify_order_number && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shopify Order:</span>
              <span className="font-mono">#{lastOrder.shopify_order_number}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-bold">${lastOrder.total.toFixed(2)}</span>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onPrint}>
            Print Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Email Dialog Component
export function EmailDialog({
  open,
  onOpenChange,
  emailTo,
  setEmailTo,
  emailSubject,
  setEmailSubject,
  emailMessage,
  setEmailMessage,
  sendingEmail,
  onSendEmail
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email Quote</DialogTitle>
          <DialogDescription>
            Send this quote to the customer
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>To *</Label>
            <Input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="customer@email.com"
              data-testid="email-to"
            />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSendEmail} disabled={sendingEmail}>
            {sendingEmail ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              "Send Email"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Image Preview Dialog
export function ImagePreviewDialog({
  open,
  onOpenChange,
  image
}) {
  if (!image) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{image.title}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center">
          <img 
            src={image.src} 
            alt={image.title}
            className="max-h-[60vh] object-contain rounded-lg"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
