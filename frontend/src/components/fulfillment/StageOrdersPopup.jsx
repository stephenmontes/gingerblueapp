import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, User, Calendar, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function StageOrdersPopup({ stage, onClose, onViewOrder }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (stage) loadOrders();
  }, [stage]);

  async function loadOrders() {
    setLoading(true);
    try {
      let url;
      if (stage.stage_id === "unassigned") {
        url = `${API}/fulfillment/orders?unassigned=true`;
      } else {
        url = `${API}/fulfillment/stages/${stage.stage_id}/orders`;
      }
      
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (err) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  if (!stage) return null;

  return (
    <Dialog open={!!stage} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${stage.color}20` }}
            >
              <Package className="w-4 h-4" style={{ color: stage.color }} />
            </div>
            {stage.stage_name} Orders
            <Badge variant="secondary">{orders.length}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="h-32 bg-muted/30 animate-pulse rounded-lg" />
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No orders in this stage</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <OrderPopupRow 
                    key={order.order_id} 
                    order={order} 
                    onView={() => { onViewOrder && onViewOrder(order); onClose(); }}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OrderPopupRow({ order, onView }) {
  const items = order.items || order.line_items || [];
  const completedItems = items.filter(i => i.is_complete).length;
  const totalItems = items.length;
  
  return (
    <TableRow className="border-border">
      <TableCell className="font-mono font-medium">
        {order.order_number || order.order_id?.slice(-8)}
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium">{order.customer_name || "N/A"}</p>
          <p className="text-xs text-muted-foreground">{order.customer_email || ""}</p>
        </div>
      </TableCell>
      <TableCell>
        {totalItems > 0 && completedItems > 0 ? (
          <Badge variant="outline" className={completedItems === totalItems ? "border-green-500 text-green-500" : "border-orange-500 text-orange-500"}>
            {completedItems}/{totalItems}
          </Badge>
        ) : (
          <Badge variant="outline">{totalItems} items</Badge>
        )}
      </TableCell>
      <TableCell>
        {order.batch_name ? (
          <Badge variant="secondary" className="text-xs">{order.batch_name}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {order.created_at ? new Date(order.created_at).toLocaleDateString() : "—"}
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="ghost" onClick={onView} className="gap-1">
          View <ExternalLink className="w-3 h-3" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
