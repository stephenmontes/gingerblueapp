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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ChevronRight, 
  MoreVertical, 
  ArrowRight, 
  Package,
  Truck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function FulfillmentStageTab({ stage, stages, onRefresh }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [inventoryDialogOrder, setInventoryDialogOrder] = useState(null);

  useEffect(() => {
    loadOrders();
  }, [stage.stage_id]);

  async function loadOrders() {
    try {
      const res = await fetch(`${API}/fulfillment/stages/${stage.stage_id}/orders?include_inventory_status=true`, {
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
        if (result.inventory_deduction) {
          const { deductions, errors } = result.inventory_deduction;
          if (deductions?.length > 0) {
            toast.info(`Deducted ${deductions.length} items from inventory`);
          }
          if (errors?.length > 0) {
            toast.warning(`${errors.length} items had inventory issues`);
          }
        }
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
        const result = await res.json();
        toast.success("Order marked as shipped");
        if (result.inventory_deduction) {
          toast.info("Inventory has been deducted");
        }
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

  // Count orders with stock issues
  const outOfStockCount = orders.filter(o => 
    o.inventory_status && !o.inventory_status.all_in_stock
  ).length;

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
    <>
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
              {outOfStockCount > 0 && (
                <Badge variant="outline" className="border-orange-500 text-orange-500 gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {outOfStockCount} low stock
                </Badge>
              )}
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
                  <TableHead>Stock Status</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <OrderRow
                    key={order.order_id}
                    order={order}
                    stage={stage}
                    stages={stages}
                    nextStage={nextStage}
                    isLastStage={isLastStage}
                    isSelected={selectedOrders.includes(order.order_id)}
                    onToggleSelect={() => toggleOrderSelection(order.order_id)}
                    onMoveNext={() => moveOrderToNext(order.order_id)}
                    onMoveToStage={(stageId) => moveOrderToStage(order.order_id, stageId)}
                    onMarkShipped={() => markShipped(order.order_id)}
                    onShowInventory={() => setInventoryDialogOrder(order)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Inventory Details Dialog */}
      <InventoryDialog 
        order={inventoryDialogOrder} 
        onClose={() => setInventoryDialogOrder(null)} 
      />
    </>
  );
}

function OrderRow({ 
  order, 
  stage, 
  stages, 
  nextStage, 
  isLastStage, 
  isSelected,
  onToggleSelect,
  onMoveNext,
  onMoveToStage,
  onMarkShipped,
  onShowInventory
}) {
  const invStatus = order.inventory_status;
  
  return (
    <TableRow className="border-border">
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
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
          {order.line_items?.length || order.items?.length || order.item_count || 0} items
        </Badge>
      </TableCell>
      <TableCell>
        <StockStatusBadge 
          status={invStatus} 
          onClick={onShowInventory}
        />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {order.store_name || "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {!isLastStage && nextStage && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onMoveNext}
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
              onClick={onMarkShipped}
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
              <DropdownMenuItem onClick={onShowInventory}>
                <Info className="w-4 h-4 mr-2" />
                View Inventory Status
              </DropdownMenuItem>
              {stages.map((s) => (
                <DropdownMenuItem
                  key={s.stage_id}
                  onClick={() => onMoveToStage(s.stage_id)}
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
  );
}

function StockStatusBadge({ status, onClick }) {
  if (!status) {
    return (
      <Badge variant="outline" className="text-muted-foreground cursor-pointer" onClick={onClick}>
        Unknown
      </Badge>
    );
  }

  if (status.all_in_stock) {
    return (
      <Badge 
        variant="outline" 
        className="border-green-500 text-green-500 gap-1 cursor-pointer hover:bg-green-500/10" 
        onClick={onClick}
      >
        <CheckCircle className="w-3 h-3" />
        In Stock
      </Badge>
    );
  }

  if (status.partial_stock) {
    return (
      <Badge 
        variant="outline" 
        className="border-orange-500 text-orange-500 gap-1 cursor-pointer hover:bg-orange-500/10" 
        onClick={onClick}
      >
        <AlertTriangle className="w-3 h-3" />
        Partial ({status.out_of_stock_count})
      </Badge>
    );
  }

  return (
    <Badge 
      variant="outline" 
      className="border-red-500 text-red-500 gap-1 cursor-pointer hover:bg-red-500/10" 
      onClick={onClick}
    >
      <XCircle className="w-3 h-3" />
      Out of Stock
    </Badge>
  );
}

function InventoryDialog({ order, onClose }) {
  if (!order) return null;

  const invStatus = order.inventory_status;
  const items = invStatus?.items || [];

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Inventory Status - Order #{order.order_number || order.order_id?.slice(-8)}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
            {invStatus?.all_in_stock ? (
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">All items in stock</span>
              </div>
            ) : invStatus?.partial_stock ? (
              <div className="flex items-center gap-2 text-orange-500">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-medium">{invStatus.out_of_stock_count} items have insufficient stock</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-500">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">Items out of stock</span>
              </div>
            )}
          </div>

          {/* Item List */}
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Needed</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={idx} className="border-border">
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                  <TableCell className="text-right">{item.qty_needed}</TableCell>
                  <TableCell className="text-right">
                    <span className={item.qty_available < item.qty_needed ? "text-red-400" : "text-green-400"}>
                      {item.qty_available}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.in_stock ? (
                      <Badge variant="outline" className="border-green-500 text-green-500">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        OK
                      </Badge>
                    ) : item.qty_available > 0 ? (
                      <Badge variant="outline" className="border-orange-500 text-orange-500">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Low
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-red-500 text-red-500">
                        <XCircle className="w-3 h-3 mr-1" />
                        None
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Low Stock Warning */}
          {invStatus?.low_stock_items?.length > 0 && (
            <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <p className="text-sm text-orange-400 font-medium mb-2">Shortage Details:</p>
              <ul className="text-sm text-orange-400/80 space-y-1">
                {invStatus.low_stock_items.map((item, idx) => (
                  <li key={idx}>
                    {item.sku}: Need {item.needed}, have {item.available} (short {item.shortage})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
