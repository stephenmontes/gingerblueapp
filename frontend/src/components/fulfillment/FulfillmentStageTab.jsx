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
import { ChevronRight, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { OrderRow } from "./OrderRow";
import { InventoryDialog } from "./InventoryDialog";
import { OrderWorksheet } from "./OrderWorksheet";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function FulfillmentStageTab({ stage, stages, onRefresh }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [inventoryDialogOrder, setInventoryDialogOrder] = useState(null);
  const [worksheetOrder, setWorksheetOrder] = useState(null);

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

  // For stages with consolidated view, show tabs to switch between views
  if (showConsolidatedView) {
    return (
      <div className="space-y-4">
        <Tabs value={viewMode} onValueChange={setViewMode}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="orders" className="gap-2">
              <List className="w-4 h-4" />
              Orders View
            </TabsTrigger>
            <TabsTrigger value="items" className="gap-2">
              <Printer className="w-4 h-4" />
              Items List (Sorted)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <OrdersView
              orders={orders}
              stage={stage}
              stages={stages}
              selectedOrders={selectedOrders}
              outOfStockCount={outOfStockCount}
              nextStage={nextStage}
              isLastStage={isLastStage}
              onToggleOrderSelection={toggleOrderSelection}
              onToggleAllOrders={toggleAllOrders}
              onMoveOrderToNext={moveOrderToNext}
              onMoveOrderToStage={moveOrderToStage}
              onBulkMoveOrders={bulkMoveOrders}
              onMarkShipped={markShipped}
              onShowInventory={setInventoryDialogOrder}
            />
          </TabsContent>

          <TabsContent value="items">
            <PrintListView stageId={stage.stage_id} />
          </TabsContent>
        </Tabs>

        <InventoryDialog order={inventoryDialogOrder} onClose={() => setInventoryDialogOrder(null)} />
      </div>
    );
  }

  // Default view for Orders and Pack stages
  return (
    <>
      <OrdersView
        orders={orders}
        stage={stage}
        stages={stages}
        selectedOrders={selectedOrders}
        outOfStockCount={outOfStockCount}
        nextStage={nextStage}
        isLastStage={isLastStage}
        onToggleOrderSelection={toggleOrderSelection}
        onToggleAllOrders={toggleAllOrders}
        onMoveOrderToNext={moveOrderToNext}
        onMoveOrderToStage={moveOrderToStage}
        onBulkMoveOrders={bulkMoveOrders}
        onMarkShipped={markShipped}
        onShowInventory={setInventoryDialogOrder}
      />
      <InventoryDialog order={inventoryDialogOrder} onClose={() => setInventoryDialogOrder(null)} />
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
  onToggleOrderSelection,
  onToggleAllOrders,
  onMoveOrderToNext,
  onMoveOrderToStage,
  onBulkMoveOrders,
  onMarkShipped,
  onShowInventory
}) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
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
          
          {selectedOrders.length > 0 && (
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
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedOrders.length === orders.length && orders.length > 0}
                    onCheckedChange={onToggleAllOrders}
                  />
                </TableHead>
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
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
