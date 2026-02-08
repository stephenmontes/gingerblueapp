import { User, UserPlus, DollarSign, Truck, Tag, X, Percent, Loader2, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";

const shippingPresets = [
  { label: "30% of order total", value: "30" },
  { label: "25% of order total", value: "25" },
  { label: "20% of order total", value: "20" },
  { label: "18% of order total", value: "18" },
  { label: "15% of order total", value: "15" },
  { label: "12% of order total", value: "12" },
  { label: "10% of order total", value: "10" },
  { label: "Free Shipping (0%)", value: "0" },
  { label: "Custom Amount", value: "custom" },
];

export function POSOrderSummary({
  cart,
  customer,
  onOpenCustomerDialog,
  onClearCustomer,
  taxExempt,
  setTaxExempt,
  shipAllItems,
  setShipAllItems,
  shipping,
  setShipping,
  shippingPercent,
  setShippingPercent,
  orderDiscount,
  setOrderDiscount,
  discountDialogOpen,
  setDiscountDialogOpen,
  tempDiscount,
  setTempDiscount,
  orderNote,
  setOrderNote,
  orderTags,
  setOrderTags,
  requestedShipDate,
  setRequestedShipDate,
  subtotal,
  orderDiscountAmount,
  subtotalAfterDiscount,
  shippingTotal,
  total,
  submitting,
  savingDraft,
  onSubmitOrder,
  onSubmitDraft,
  isMobile = false
}) {
  return (
    <div className={`space-y-4 ${isMobile ? '' : 'order-2 lg:order-2'}`}>
      {/* Customer */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4" />
            Customer
          </CardTitle>
        </CardHeader>
        <CardContent>
          {customer ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-muted-foreground">{customer.email}</p>
                  {customer.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
                  {customer.company && <p className="text-sm text-muted-foreground">{customer.company}</p>}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onClearCustomer}
                  data-testid="clear-customer"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              {customer.tax_exempt && (
                <Badge variant="secondary" className="mt-2">Tax Exempt</Badge>
              )}
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={onOpenCustomerDialog}
              data-testid="add-customer-btn"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Order Options */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Order Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tax Exempt */}
          <div className="flex items-center justify-between">
            <Label htmlFor="tax-exempt" className="text-sm">Tax Exempt</Label>
            <Switch
              id="tax-exempt"
              checked={taxExempt}
              onCheckedChange={setTaxExempt}
              data-testid="tax-exempt-switch"
            />
          </div>

          {/* Ship All Items */}
          <div className="flex items-center justify-between">
            <Label htmlFor="ship-all" className="text-sm">Ship All Items</Label>
            <Switch
              id="ship-all"
              checked={shipAllItems}
              onCheckedChange={setShipAllItems}
              data-testid="ship-all-switch"
            />
          </div>

          {/* Requested Ship Date */}
          <div className="space-y-1.5">
            <Label className="text-sm">Requested Ship Date</Label>
            <Input
              type="date"
              value={requestedShipDate}
              onChange={(e) => setRequestedShipDate(e.target.value)}
              data-testid="ship-date-input"
            />
          </div>

          {/* Shipping */}
          {shipAllItems && (
            <div className="space-y-2">
              <Label className="text-sm">Shipping</Label>
              <Select value={shippingPercent} onValueChange={setShippingPercent}>
                <SelectTrigger data-testid="shipping-preset-select">
                  <Truck className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Select shipping" />
                </SelectTrigger>
                <SelectContent>
                  {shippingPresets.map(preset => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shippingPercent === "custom" && (
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Custom amount"
                  value={shipping.price}
                  onChange={(e) => setShipping({ ...shipping, price: parseFloat(e.target.value) || 0 })}
                  data-testid="custom-shipping-input"
                />
              )}
            </div>
          )}

          <Separator />

          {/* Order Discount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Order Discount</Label>
              <Popover open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={orderDiscount.value > 0 ? "default" : "outline"}
                    size="sm"
                    data-testid="order-discount-btn"
                  >
                    <Percent className="w-4 h-4 mr-1" />
                    {orderDiscount.value > 0 
                      ? `${orderDiscount.value}${orderDiscount.type === "percentage" ? "%" : "$"}` 
                      : "Add"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Order Discount</Label>
                    <div className="flex gap-2">
                      <Select
                        value={tempDiscount.type}
                        onValueChange={(value) => setTempDiscount(prev => ({ ...prev, type: value }))}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">%</SelectItem>
                          <SelectItem value="fixed">$</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="0"
                        value={tempDiscount.value}
                        onChange={(e) => setTempDiscount(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                        className="flex-1"
                      />
                    </div>
                    <Input
                      placeholder="Reason (optional)"
                      value={tempDiscount.reason || ""}
                      onChange={(e) => setTempDiscount(prev => ({ ...prev, reason: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setOrderDiscount({ type: "percentage", value: 0, reason: "" });
                          setDiscountDialogOpen(false);
                        }}
                      >
                        Clear
                      </Button>
                      <Button 
                        size="sm" 
                        className="flex-1"
                        onClick={() => {
                          setOrderDiscount(tempDiscount);
                          setDiscountDialogOpen(false);
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {orderDiscount.value > 0 && orderDiscount.reason && (
              <p className="text-xs text-muted-foreground">Reason: {orderDiscount.reason}</p>
            )}
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm">Order Notes</Label>
            <Textarea
              placeholder="Add notes..."
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              rows={2}
              data-testid="order-note"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Tags
            </Label>
            <Input
              placeholder="tag1, tag2, ..."
              value={orderTags}
              onChange={(e) => setOrderTags(e.target.value)}
              data-testid="order-tags"
            />
          </div>
        </CardContent>
      </Card>

      {/* Order Total */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Order Total
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>${(subtotal + orderDiscountAmount).toFixed(2)}</span>
          </div>
          {orderDiscountAmount > 0 && (
            <div className="flex justify-between text-sm text-destructive">
              <span>Discount</span>
              <span>-${orderDiscountAmount.toFixed(2)}</span>
            </div>
          )}
          {shipAllItems && shippingTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span>Shipping</span>
              <span>${shippingTotal.toFixed(2)}</span>
            </div>
          )}
          {taxExempt && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Tax</span>
              <span>Exempt</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 space-y-2">
            <Button
              className="w-full"
              size="lg"
              onClick={() => onSubmitOrder(false)}
              disabled={cart.length === 0 || submitting}
              data-testid="create-order-btn"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>Create Order</>
              )}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => onSubmitDraft(true)}
              disabled={cart.length === 0 || savingDraft}
              data-testid="save-draft-btn"
            >
              {savingDraft ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>Save as Draft</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
