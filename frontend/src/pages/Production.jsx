import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowRight,
  Package,
  Clock,
  User,
  GripVertical,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const OrderCard = ({ order, onMoveToStage, stages, currentStageIndex }) => {
  const [moving, setMoving] = useState(false);

  const handleMove = async (newStageId) => {
    setMoving(true);
    await onMoveToStage(order.order_id, newStageId);
    setMoving(false);
  };

  const nextStage = stages[currentStageIndex + 1];

  return (
    <Card
      className="bg-[#18181B] border-border mb-3 card-hover cursor-grab active:cursor-grabbing"
      data-testid={`production-order-${order.order_id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-mono text-sm text-primary">{order.order_id}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {order.external_id}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              order.platform === "shopify"
                ? "text-green-400 bg-green-400/10 border-green-400/20"
                : "text-orange-400 bg-orange-400/10 border-orange-400/20"
            }
          >
            {order.platform}
          </Badge>
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="truncate">{order.customer_name}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span>{order.items?.length || 0} items</span>
            <span className="text-muted-foreground">•</span>
            <span className="font-semibold">${order.total_price?.toFixed(2)}</span>
          </div>
        </div>

        {nextStage && (
          <Button
            onClick={() => handleMove(nextStage.stage_id)}
            disabled={moving}
            className="w-full gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
            variant="outline"
            size="sm"
            data-testid={`move-order-${order.order_id}`}
          >
            {moving ? (
              <>
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Moving...
              </>
            ) : (
              <>
                Move to {nextStage.name}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        )}

        {!nextStage && (
          <div className="flex items-center justify-center gap-2 text-green-400 text-sm py-2">
            <CheckCircle2 className="w-4 h-4" />
            Ready to Ship
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const KanbanColumn = ({ stage, orders, onMoveToStage, stages, stageIndex }) => {
  const columnOrders = orders.filter(
    (order) => order.current_stage_id === stage.stage_id
  );

  return (
    <div className="kanban-column flex-shrink-0" data-testid={`stage-column-${stage.stage_id}`}>
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: stage.color }}
            />
            <CardTitle className="text-base">{stage.name}</CardTitle>
          </div>
          <Badge variant="secondary" className="bg-muted">
            {columnOrders.length}
          </Badge>
        </div>
      </CardHeader>
      <ScrollArea className="h-[calc(100vh-280px)]">
        <CardContent className="p-3">
          {columnOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No orders</p>
            </div>
          ) : (
            columnOrders.map((order) => (
              <OrderCard
                key={order.order_id}
                order={order}
                onMoveToStage={onMoveToStage}
                stages={stages}
                currentStageIndex={stageIndex}
              />
            ))
          )}
        </CardContent>
      </ScrollArea>
    </div>
  );
};

export default function Production({ user }) {
  const [orders, setOrders] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [ordersRes, stagesRes] = await Promise.all([
        fetch(`${API}/orders`, { credentials: "include" }),
        fetch(`${API}/stages`, { credentials: "include" }),
      ]);

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(ordersData);
      }

      if (stagesRes.ok) {
        const stagesData = await stagesRes.json();
        setStages(stagesData);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load production data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMoveToStage = async (orderId, newStageId) => {
    try {
      const response = await fetch(`${API}/orders/${orderId}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          order_id: orderId,
          new_stage_id: newStageId,
          items_processed: 1,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Order moved to ${result.new_stage}`);
        
        // Update local state
        setOrders((prev) =>
          prev.map((order) =>
            order.order_id === orderId
              ? { ...order, current_stage_id: newStageId, status: result.status }
              : order
          )
        );
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to move order");
      }
    } catch (error) {
      console.error("Failed to move order:", error);
      toast.error("Failed to move order");
    }
  };

  // Calculate stats
  const totalInProduction = orders.filter(
    (o) => o.status === "in_production"
  ).length;
  const totalPending = orders.filter((o) => o.status === "pending").length;
  const totalCompleted = orders.filter((o) => o.status === "completed").length;

  if (loading) {
    return (
      <div className="space-y-6" data-testid="production-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="min-w-[300px] h-[400px] bg-card border border-border rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="production-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Production Queue</h1>
          <p className="text-muted-foreground mt-1">
            Move orders through manufacturing stages
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/10 rounded-lg border border-amber-400/20">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">
              {totalPending} Pending
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-400/10 rounded-lg border border-blue-400/20">
            <Package className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-blue-400">
              {totalInProduction} In Production
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-green-400/10 rounded-lg border border-green-400/20">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium text-green-400">
              {totalCompleted} Completed
            </span>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max" data-testid="kanban-board">
          {stages.map((stage, index) => (
            <KanbanColumn
              key={stage.stage_id}
              stage={stage}
              orders={orders}
              onMoveToStage={handleMoveToStage}
              stages={stages}
              stageIndex={index}
            />
          ))}
        </div>
      </div>

      {/* Help text */}
      <div className="text-center text-sm text-muted-foreground">
        <p>Click "Move to [Stage]" button on each order card to advance it through production</p>
      </div>
    </div>
  );
}
