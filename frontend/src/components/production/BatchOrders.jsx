import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ShoppingBag, User, Mail, Calendar, Package, ChevronDown, ChevronRight } from "lucide-react";

export function BatchOrders({ orders }) {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  if (!orders || orders.length === 0) return null;

  return (
    <>
      <Card className="bg-card/50 border-border">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full p-3 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-lg">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Orders in this Batch</span>
                <Badge variant="secondary">{orders.length}</Badge>
              </div>
              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-3 pt-0">
              <div className="flex flex-wrap gap-2">
                {orders.map((order) => (
                  <OrderBadge
                    key={order.order_id}
                    order={order}
                    onClick={() => setSelectedOrder(order)}
                  />
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <OrderDetailDialog
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </>
  );
}

function OrderBadge({ order, onClick }) {
  const itemCount = order.items ? order.items.length : 0;
  // Use order_number with # prefix, fallback to external_id or order_id
  const displayOrderNumber = order.order_number 
    ? `#${order.order_number}` 
    : order.external_id 
      ? `#${order.external_id}` 
      : order.order_id;

  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 bg-muted/50 rounded-md border border-border text-sm text-left hover:bg-muted hover:border-primary/50 transition-colors cursor-pointer"
      data-testid={`view-order-${order.order_id}`}
    >
      <div className="font-medium">{displayOrderNumber}</div>
      <div className="text-xs text-muted-foreground">
        {order.customer_name} • {itemCount} item{itemCount !== 1 ? "s" : ""}
      </div>
    </button>
  );
}

function OrderDetailDialog({ order, open, onClose }) {
  if (!order) return null;

  const items = order.items || [];
  const totalQty = items.reduce((sum, item) => sum + (item.qty || 1), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Order: {order.external_id || order.order_id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Order Info */}
          <div className="grid grid-cols-2 gap-4">
            <InfoCard
              icon={User}
              label="Customer"
              value={order.customer_name || "N/A"}
            />
            <InfoCard
              icon={Mail}
              label="Email"
              value={order.customer_email || "N/A"}
            />
            <InfoCard
              icon={ShoppingBag}
              label="Store"
              value={order.store_name || order.platform || "N/A"}
            />
            <InfoCard
              icon={Calendar}
              label="Created"
              value={formatDate(order.created_at)}
            />
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge variant={getStatusVariant(order.status)}>
              {order.status || "pending"}
            </Badge>
            {order.batch_id && (
              <Badge variant="outline" className="ml-2">
                Batch: {order.batch_id}
              </Badge>
            )}
          </div>

          {/* Order Items */}
          <div>
            <h4 className="text-sm font-medium mb-2">
              Items ({totalQty} total)
            </h4>
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Item</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                        No items in this order
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item, idx) => (
                      <TableRow key={idx} className="border-border">
                        <TableCell className="font-medium">
                          {item.name || "Unknown Item"}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {item.sku || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.qty || 1}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.price ? `$${item.price.toFixed(2)}` : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Order Total */}
          {order.total_price > 0 && (
            <div className="flex justify-end pt-2 border-t border-border">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Order Total</p>
                <p className="text-xl font-bold">
                  ${order.total_price.toFixed(2)} {order.currency || "USD"}
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          {order.notes && (
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{order.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="p-3 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getStatusVariant(status) {
  switch (status) {
    case "completed":
      return "default";
    case "in_production":
      return "secondary";
    case "pending":
    default:
      return "outline";
  }
}
