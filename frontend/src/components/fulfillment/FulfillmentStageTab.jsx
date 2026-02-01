import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
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
import { ChevronRight, Package, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { OrderRow } from "./OrderRow";
import { InventoryDialog } from "./InventoryDialog";
import { OrderWorksheet } from "./OrderWorksheet";
import { ActiveWorkersBanner } from "./ActiveWorkersBanner";
import { MyTimerControls } from "./MyTimerControls";
import { PrintOrderDialog } from "./PrintOrderDialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function FulfillmentStageTab({ stage, stages, onRefresh, onTimerChange }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [inventoryDialogOrder, setInventoryDialogOrder] = useState(null);
  const [worksheetOrder, setWorksheetOrder] = useState(null);
  const [activeTimer, setActiveTimer] = useState(null);

  useEffect(() => {
    loadOrders();
    checkActiveTimer();
  }, [stage.stage_id]);

  async function checkActiveTimer() {
    try {
      const res = await fetch(`${API}/fulfillment/user/active-timer`, { credentials: "include" });
      if (res.ok) {
        const timers = await res.json();
        setActiveTimer(timers.length > 0 ? timers[0] : null);
      }
    } catch (err) {
      console.error("Failed to check timer:", err);
    }
  }

  function handleTimerChangeInternal() {
    checkActiveTimer();
    onTimerChange?.();
  }

  // Check if timer is required and active for this stage
  const isOrdersStage = stage.stage_id === "fulfill_orders";
  const hasActiveTimerForStage = activeTimer && activeTimer.stage_id === stage.stage_id;
  const timerRequired = !isOrdersStage; // Timer required for all stages except Orders

  function requiresTimer() {
    if (!timerRequired) return false;
    if (!hasActiveTimerForStage) {
      toast.error("Start a timer before completing tasks in this stage", {
        icon: <Clock className="w-4 h-4" />,
        description: "Click 'Start Timer' to begin tracking your work"
      });
      return true;
    }
    return false;
  }

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
    if (requiresTimer()) return;
    try {
      const res = await fetch(`${API}/fulfillment/orders/${orderId}/move-next`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        if (result.inventory_deduction?.deductions?.length > 0) {
          toast.info(`Deducted ${result.inventory_deduction.deductions.length} items from inventory`);
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
    if (requiresTimer()) return;
    try {
      const res = await fetch(`${API}/fulfillment/orders/${orderId}/assign-stage?stage_id=${targetStageId}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Order moved");
        loadOrders();
        onRefresh();
      }
    } catch (err) {
      toast.error("Failed to move order");
    }
  }

  async function bulkMoveOrders(targetStageId) {
    if (selectedOrders.length === 0) return;
    if (requiresTimer()) return;
    
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
    if (requiresTimer()) return;
    try {
      const res = await fetch(`${API}/fulfillment/orders/${orderId}/mark-shipped`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Order shipped and archived");
        loadOrders();
        onRefresh();
      }
    } catch (err) {
      toast.error("Failed to mark as shipped");
    }
  }

  function toggleOrderSelection(orderId) {
    setSelectedOrders(prev => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  }

  function toggleAllOrders() {
    setSelectedOrders(selectedOrders.length === orders.length ? [] : orders.map(o => o.order_id));
  }

  const currentStageIndex = stages.findIndex(s => s.stage_id === stage.stage_id);
  const nextStage = stages[currentStageIndex + 1];
  const isLastStage = currentStageIndex === stages.length - 1;
  const outOfStockCount = orders.filter(o => o.inventory_status && !o.inventory_status.all_in_stock).length;

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8">
          <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  // Function to open worksheet for a specific order
  async function openWorksheetForOrder(orderId) {
    // Find the order in current orders list
    let order = orders.find(o => o.order_id === orderId);
    
    // If not in current stage, fetch it
    if (!order) {
      try {
        const res = await fetch(`${API}/orders/${orderId}`, { credentials: "include" });
        if (res.ok) {
          order = await res.json();
        }
      } catch (err) {
        toast.error("Failed to load order");
        return;
      }
    }
    
    if (order) {
      setWorksheetOrder(order);
    } else {
      toast.error("Order not found");
    }
  }

  return (
    <>
      {/* My Timer Controls - Show if user has any active timer */}
      {activeTimer && (
        <MyTimerControls 
          activeTimer={activeTimer} 
          onTimerChange={handleTimerChangeInternal}
          onOpenWorksheet={openWorksheetForOrder}
        />
      )}
      
      <OrdersView
        orders={orders}
        stage={stage}
        stages={stages}
        selectedOrders={selectedOrders}
        outOfStockCount={outOfStockCount}
        nextStage={nextStage}
        isLastStage={isLastStage}
        hasActiveTimerForStage={hasActiveTimerForStage}
        timerRequired={timerRequired}
        onToggleOrderSelection={toggleOrderSelection}
        onToggleAllOrders={toggleAllOrders}
        onMoveOrderToNext={moveOrderToNext}
        onMoveOrderToStage={moveOrderToStage}
        onBulkMoveOrders={bulkMoveOrders}
        onMarkShipped={markShipped}
        onShowInventory={setInventoryDialogOrder}
        onOpenWorksheet={setWorksheetOrder}
        onTimerChange={handleTimerChangeInternal}
      />
      <InventoryDialog order={inventoryDialogOrder} onClose={() => setInventoryDialogOrder(null)} />
      <OrderWorksheet
        order={worksheetOrder}
        stages={stages}
        currentStage={stage}
        onClose={() => setWorksheetOrder(null)}
        onMoveToNextStage={moveOrderToNext}
        onRefresh={() => { loadOrders(); onRefresh(); }}
        onTimerChange={handleTimerChangeInternal}
      />
    
    </>
  );
}

function OrdersView({
  orders,
  stage,
  stages,
  selectedOrders,
  outOfStockCount,
  nextStage,
  isLastStage,
  hasActiveTimerForStage,
  timerRequired,
  onToggleOrderSelection,
  onToggleAllOrders,
  onMoveOrderToNext,
  onMoveOrderToStage,
  onBulkMoveOrders,
  onMarkShipped,
  onShowInventory,
  onOpenWorksheet,
  onTimerChange
}) {
  const stageColor = stage.color || "#6366F1";
  
  return (
    <Card 
      className="bg-card border-border overflow-hidden"
      style={{ borderTop: `4px solid ${stageColor}` }}
    >
      {/* Active Workers Banner */}
      {stage.stage_id !== "fulfill_orders" && (
        <div className="px-4 pt-4">
          <ActiveWorkersBanner stageId={stage.stage_id} stageName={stage.name} />
        </div>
      )}
      {/* Timer Required Warning Banner */}
      {timerRequired && !hasActiveTimerForStage && (
        <div className="px-4 py-3 bg-yellow-500/10 border-b border-yellow-500/30 flex items-center gap-3">
          <Clock className="w-5 h-5 text-yellow-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-400">Timer Required</p>
            <p className="text-xs text-muted-foreground">Start a timer to complete tasks in this stage</p>
          </div>
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
              {stage.name}
              <Badge variant="secondary">{orders.length} orders</Badge>
              {outOfStockCount > 0 && (
                <Badge variant="outline" className="border-orange-500 text-orange-500 gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {outOfStockCount} low stock
                </Badge>
              )}
            </CardTitle>
          </div>
          
          {stage.stage_id === "fulfill_orders" && selectedOrders.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedOrders.length} selected</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-2">
                    Move to <ChevronRight className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {stages.map((s) => (
                    <DropdownMenuItem
                      key={s.stage_id}
                      onClick={() => onBulkMoveOrders(s.stage_id)}
                      disabled={s.stage_id === stage.stage_id}
                    >
                      <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: s.color }} />
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
                {stage.stage_id === "fulfill_orders" && (
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedOrders.length === orders.length && orders.length > 0}
                      onCheckedChange={onToggleAllOrders}
                    />
                  </TableHead>
                )}
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Stock Status</TableHead>
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
                  onToggleSelect={() => onToggleOrderSelection(order.order_id)}
                  onMoveNext={() => onMoveOrderToNext(order.order_id)}
                  onMoveToStage={(stageId) => onMoveOrderToStage(order.order_id, stageId)}
                  onMarkShipped={() => onMarkShipped(order.order_id)}
                  onShowInventory={() => onShowInventory(order)}
                  onOpenWorksheet={() => onOpenWorksheet(order)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
