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
import { ChevronRight, Package, AlertTriangle, Clock, Trash2, Play } from "lucide-react";
import { toast } from "sonner";
import { OrderRow } from "./OrderRow";
import { InventoryDialog } from "./InventoryDialog";
import { OrderWorksheet } from "./OrderWorksheet";
import { ActiveWorkersBanner } from "./ActiveWorkersBanner";
import { MyTimerControls } from "./MyTimerControls";
import { PrintOrderDialog } from "./PrintOrderDialog";
import { API } from "@/utils/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export function FulfillmentStageTab({ stage, stages, onRefresh, onTimerChange, canDelete, user, batchId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [inventoryDialogOrder, setInventoryDialogOrder] = useState(null);
  const [worksheetOrder, setWorksheetOrder] = useState(null);
  const [printOrder, setPrintOrder] = useState(null);
  const [activeTimer, setActiveTimer] = useState(null);
  const [deleteOrderId, setDeleteOrderId] = useState(null);
  const [deleteOrderNumber, setDeleteOrderNumber] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadOrders();
    checkActiveTimer();
  }, [stage.stage_id, batchId]);

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

  async function startTimer() {
    try {
      const res = await fetch(`${API}/fulfillment/stages/${stage.stage_id}/start-timer`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success(`Timer started for ${stage.name}`);
        handleTimerChangeInternal();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to start timer");
      }
    } catch (err) {
      toast.error("Failed to start timer");
    }
  }

  async function loadOrders() {
    try {
      // Build URL with optional batch filter
      let url = `${API}/fulfillment/stages/${stage.stage_id}/orders?include_inventory_status=false&page_size=100`;
      if (batchId) {
        url += `&fulfillment_batch_id=${batchId}`;
      }
      
      const res = await fetch(url, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        // Handle both paginated and non-paginated response
        setOrders(data.orders || data);
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

  async function handleDeleteOrder() {
    if (!deleteOrderId) return;
    setDeleting(true);
    
    try {
      const res = await fetch(`${API}/fulfillment/orders/${deleteOrderId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        loadOrders();
        onRefresh();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to remove order");
      }
    } catch (err) {
      toast.error("Failed to remove order from fulfillment");
    } finally {
      setDeleting(false);
      setDeleteOrderId(null);
      setDeleteOrderNumber(null);
    }
  }

  function confirmDeleteOrder(orderId, orderNumber) {
    setDeleteOrderId(orderId);
    setDeleteOrderNumber(orderNumber);
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
  const prevStage = currentStageIndex > 0 ? stages[currentStageIndex - 1] : null;
  const isLastStage = currentStageIndex === stages.length - 1;
  const outOfStockCount = orders.filter(o => o.inventory_status && !o.inventory_status.all_in_stock).length;

  async function onReturnOrderToPrevious(orderId) {
    if (!prevStage) {
      toast.error("Already at the first stage");
      return;
    }
    
    try {
      const res = await fetch(`${API}/fulfillment/orders/${orderId}/return-stage`, {
        method: "POST",
        credentials: "include",
      });
      
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message || `Returned to ${prevStage.name}`);
        loadOrders();
        onRefresh();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to return to previous stage");
      }
    } catch (err) {
      toast.error("Failed to return order to previous stage");
    }
  }

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
        prevStage={prevStage}
        isLastStage={isLastStage}
        hasActiveTimerForStage={hasActiveTimerForStage}
        timerRequired={timerRequired}
        onToggleOrderSelection={toggleOrderSelection}
        onToggleAllOrders={toggleAllOrders}
        onMoveOrderToNext={moveOrderToNext}
        onMoveOrderToStage={moveOrderToStage}
        onReturnOrderToPrevious={onReturnOrderToPrevious}
        onBulkMoveOrders={bulkMoveOrders}
        onMarkShipped={markShipped}
        onShowInventory={setInventoryDialogOrder}
        onOpenWorksheet={setWorksheetOrder}
        onPrintOrder={setPrintOrder}
        onTimerChange={handleTimerChangeInternal}
        canDelete={canDelete}
        onDeleteOrder={confirmDeleteOrder}
        onStartTimer={startTimer}
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
      <PrintOrderDialog
        order={printOrder}
        currentStage={stage}
        onClose={() => setPrintOrder(null)}
      />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteOrderId} onOpenChange={(open) => !open && setDeleteOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Order from Fulfillment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove order <span className="font-semibold text-foreground">{deleteOrderNumber}</span> from the fulfillment workflow. 
              <br /><br />
              <span className="text-muted-foreground">Note: This only removes the order from fulfillment stages. The original order will not be affected.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteOrder}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Removing..." : "Remove Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    
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
  prevStage,
  isLastStage,
  hasActiveTimerForStage,
  timerRequired,
  onToggleOrderSelection,
  onToggleAllOrders,
  onMoveOrderToNext,
  onMoveOrderToStage,
  onReturnOrderToPrevious,
  onBulkMoveOrders,
  onMarkShipped,
  onShowInventory,
  onOpenWorksheet,
  onPrintOrder,
  onTimerChange,
  canDelete,
  onDeleteOrder,
  onStartTimer
}) {
  const stageColor = stage.color || "#6366F1";
  
  return (
    <Card 
      className="bg-card border-border overflow-hidden"
      style={{ borderTop: `4px solid ${stageColor}` }}
    >
      {/* Active Workers Banner */}
      {stage.stage_id !== "fulfill_orders" && (
        <div className="px-3 sm:px-4 pt-3 sm:pt-4">
          <ActiveWorkersBanner stageId={stage.stage_id} stageName={stage.name} />
        </div>
      )}
      {/* Timer Required Warning Banner - Mobile Optimized */}
      {timerRequired && !hasActiveTimerForStage && (
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-yellow-500/10 border-b border-yellow-500/30 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm font-medium text-yellow-400">Timer Required</p>
              <p className="text-xs text-muted-foreground hidden sm:block">Start a timer to complete tasks in this stage</p>
            </div>
          </div>
          <Button 
            size="sm" 
            onClick={onStartTimer}
            className="gap-1.5 sm:gap-2 h-8 text-xs sm:text-sm w-full sm:w-auto"
            data-testid="start-stage-timer-btn"
          >
            <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Start Timer
          </Button>
        </div>
      )}
      <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
              <span className="truncate">{stage.name}</span>
              <Badge variant="secondary" className="text-xs">{orders.length}</Badge>
              {outOfStockCount > 0 && (
                <Badge variant="outline" className="border-orange-500 text-orange-500 gap-1 text-xs px-1.5">
                  <AlertTriangle className="w-3 h-3" />
                  {outOfStockCount}
                </Badge>
              )}
            </CardTitle>
          </div>
          
          {stage.stage_id === "fulfill_orders" && selectedOrders.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm text-muted-foreground">{selectedOrders.length} selected</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1 sm:gap-2 h-7 sm:h-8 text-xs sm:text-sm">
                    Move <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
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
          <div className="p-6 sm:p-8 text-center text-muted-foreground">
            <Package className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
            <p className="text-sm">No orders in this stage</p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="block sm:hidden divide-y divide-border">
              {orders.map((order) => (
                <MobileOrderCard
                  key={order.order_id}
                  order={order}
                  stage={stage}
                  stages={stages}
                  nextStage={nextStage}
                  prevStage={prevStage}
                  isLastStage={isLastStage}
                  isSelected={selectedOrders.includes(order.order_id)}
                  onToggleSelect={() => onToggleOrderSelection(order.order_id)}
                  onMoveNext={() => onMoveOrderToNext(order.order_id)}
                  onMoveToStage={(stageId) => onMoveOrderToStage(order.order_id, stageId)}
                  onReturnToPrevious={() => onReturnOrderToPrevious(order.order_id)}
                  onMarkShipped={() => onMarkShipped(order.order_id)}
                  onShowInventory={() => onShowInventory(order)}
                  onOpenWorksheet={() => onOpenWorksheet(order)}
                  onPrintOrder={() => onPrintOrder(order)}
                  canDelete={canDelete}
                  onDeleteOrder={() => onDeleteOrder(order.order_id, order.order_number)}
                />
              ))}
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden sm:block">
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
                    <TableHead>Items</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Qty</TableHead>
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
                      prevStage={prevStage}
                      isLastStage={isLastStage}
                      isSelected={selectedOrders.includes(order.order_id)}
                      onToggleSelect={() => onToggleOrderSelection(order.order_id)}
                      onMoveNext={() => onMoveOrderToNext(order.order_id)}
                      onMoveToStage={(stageId) => onMoveOrderToStage(order.order_id, stageId)}
                      onReturnToPrevious={() => onReturnOrderToPrevious(order.order_id)}
                      onMarkShipped={() => onMarkShipped(order.order_id)}
                      onShowInventory={() => onShowInventory(order)}
                      onOpenWorksheet={() => onOpenWorksheet(order)}
                      onPrintOrder={() => onPrintOrder(order)}
                      canDelete={canDelete}
                      onDeleteOrder={() => onDeleteOrder(order.order_id, order.order_number)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Mobile-optimized order card for small screens
function MobileOrderCard({
  order,
  stage,
  stages,
  nextStage,
  prevStage,
  isLastStage,
  isSelected,
  onToggleSelect,
  onMoveNext,
  onMoveToStage,
  onReturnToPrevious,
  onMarkShipped,
  onShowInventory,
  onOpenWorksheet,
  onPrintOrder,
  canDelete,
  onDeleteOrder
}) {
  const totalQty = order.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 1;
  const itemNames = order.items?.map(item => item.title || item.name).slice(0, 2).join(", ") || "Order items";
  const hasLowStock = order.inventory_status && !order.inventory_status.all_in_stock;
  
  return (
    <div className="p-3 space-y-2.5">
      {/* Header row with order number and checkbox */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {stage.stage_id === "fulfill_orders" && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              className="flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <button 
              onClick={onOpenWorksheet}
              className="font-medium text-sm text-primary hover:underline truncate block"
            >
              #{order.order_number}
            </button>
            {order.customer_name && (
              <p className="text-xs text-muted-foreground truncate">{order.customer_name}</p>
            )}
          </div>
        </div>
        
        {/* Stock status badge */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasLowStock ? (
            <Badge variant="outline" className="border-orange-500 text-orange-500 text-xs px-1.5 py-0.5">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Low
            </Badge>
          ) : (
            <Badge variant="outline" className="border-green-500 text-green-500 text-xs px-1.5 py-0.5">
              OK
            </Badge>
          )}
        </div>
      </div>
      
      {/* Items preview */}
      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{totalQty} items</span>
        <span className="mx-1.5">·</span>
        <span className="truncate">{itemNames}{order.items?.length > 2 && "..."}</span>
      </div>
      
      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenWorksheet}
          className="flex-1 h-8 text-xs gap-1"
        >
          View
        </Button>
        
        {isLastStage ? (
          <Button
            size="sm"
            onClick={onMarkShipped}
            className="flex-1 h-8 text-xs gap-1 bg-green-600 hover:bg-green-700"
          >
            Ship
          </Button>
        ) : nextStage && (
          <Button
            size="sm"
            onClick={onMoveNext}
            className="flex-1 h-8 text-xs gap-1"
          >
            → {nextStage.name}
          </Button>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onShowInventory}>
              Check Inventory
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPrintOrder}>
              Print Order
            </DropdownMenuItem>
            {prevStage && (
              <DropdownMenuItem onClick={onReturnToPrevious}>
                Return to {prevStage.name}
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem onClick={onDeleteOrder} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Remove
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
