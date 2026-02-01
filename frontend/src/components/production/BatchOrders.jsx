import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag } from "lucide-react";

export function BatchOrders({ orders }) {
  if (!orders || orders.length === 0) return null;

  return (
    <Card className="bg-card/50 border-border">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <ShoppingBag className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Orders in this Batch</span>
          <Badge variant="secondary">{orders.length}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {orders.map((order) => (
            <OrderBadge key={order.order_id} order={order} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function OrderBadge({ order }) {
  const itemCount = order.items ? order.items.length : 0;
  
  return (
    <div className="px-3 py-1.5 bg-muted/50 rounded-md border border-border text-sm">
      <div className="font-medium">{order.external_id || order.order_id}</div>
      <div className="text-xs text-muted-foreground">
        {order.customer_name} • {itemCount} item{itemCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
