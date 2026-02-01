import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  ChevronRight, 
  MoreVertical, 
  ArrowRight, 
  Package,
  Truck
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function FulfillmentStageTab({ stage, stages, onRefresh }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState([]);

  useEffect(() => {
    loadOrders();
  }, [stage.stage_id]);

  async function loadOrders() {
    try {
      const res = await fetch(`${API}/fulfillment/stages/${stage.stage_id}/orders`, {
        credentials: "include",
      });
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (err) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  async function moveOrderToNext(orderId) {
    try {
      const res = await fetch(`${API}/fulfillment/orders/${orderId}/move-next`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        loadOrders();
        onRefresh();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to move order");
      }
    } catch (err) {
      toast.error("Failed to move order");
    }
  }

  async function moveOrderToStage(orderId, targetStageId) {
    try {
      const res = await fetch(`${API}/fulfillment/orders/${orderId}/assign-stage?stage_id=${targetStageId}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        loadOrders();
        onRefresh();
      }
    } catch (err) {
      toast.error("Failed to move order");
    }
  }

  async function bulkMoveOrders(targetStageId) {
    if (selectedOrders.length === 0) {
      toast.error("No orders selected");
      return;
    }
    
    try {
      const res = await fetch(`${API}/fulfillment/orders/bulk-move?target_stage_id=${targetStageId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(selectedOrders),
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        setSelectedOrders([]);
        loadOrders();
        onRefresh();
      }
    } catch (err) {
      toast.error("Failed to move orders");
    }
  }

  async function markShipped(orderId) {
    try {
      const res = await fetch(`${API}/fulfillment/orders/${orderId}/mark-shipped`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Order marked as shipped");
        loadOrders();
        onRefresh();
      }
    } catch (err) {
      toast.error("Failed to mark as shipped");
    }
  }

  function toggleOrderSelection(orderId) {
    setSelectedOrders(prev => 
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  }

  function toggleAllOrders() {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map(o => o.order_id));
    }
  }

  const currentStageIndex = stages.findIndex(s => s.stage_id === stage.stage_id);
  const nextStage = stages[currentStageIndex + 1];
  const isLastStage = currentStageIndex === stages.length - 1;

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8">
          <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: stage.color }}
            />
            {stage.name}
            <Badge variant="secondary">{orders.length} orders</Badge>
          </CardTitle>
          
          {selectedOrders.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedOrders.length} selected
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-2">
                    Move to
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {stages.map((s) => (
                    <DropdownMenuItem
                      key={s.stage_id}
                      onClick={() => bulkMoveOrders(s.stage_id)}
                      disabled={s.stage_id === stage.stage_id}
                    >
                      <div 
                        className="w-2 h-2 rounded-full mr-2" 
                        style={{ backgroundColor: s.color }}
                      />
                      {s.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {orders.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No orders in this stage</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedOrders.length === orders.length && orders.length > 0}
                    onCheckedChange={toggleAllOrders}
                    data-testid="select-all-orders"
                  />
                </TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.order_id} className="border-border">
                  <TableCell>
                    <Checkbox
                      checked={selectedOrders.includes(order.order_id)}
                      onCheckedChange={() => toggleOrderSelection(order.order_id)}
                      data-testid={`select-order-${order.order_id}`}
                    />
                  </TableCell>
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
                    <Badge variant="outline">
                      {order.line_items?.length || order.item_count || 0} items
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.store_name || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {order.created_at 
                      ? new Date(order.created_at).toLocaleDateString()
                      : "—"
                    }
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!isLastStage && nextStage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveOrderToNext(order.order_id)}
                          className="gap-1"
                          data-testid={`move-next-${order.order_id}`}
                        >
                          <ArrowRight className="w-4 h-4" />
                          {nextStage.name}
                        </Button>
                      )}
                      {isLastStage && (
                        <Button
                          size="sm"
                          className="gap-1 bg-green-600 hover:bg-green-700"
                          onClick={() => markShipped(order.order_id)}
                          data-testid={`ship-${order.order_id}`}
                        >
                          <Truck className="w-4 h-4" />
                          Ship
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {stages.map((s) => (
                            <DropdownMenuItem
                              key={s.stage_id}
                              onClick={() => moveOrderToStage(order.order_id, s.stage_id)}
                              disabled={s.stage_id === stage.stage_id}
                            >
                              <div 
                                className="w-2 h-2 rounded-full mr-2" 
                                style={{ backgroundColor: s.color }}
                              />
                              Move to {s.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
