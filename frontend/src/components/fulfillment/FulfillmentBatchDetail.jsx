import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Play, 
  Square, 
  Clock, 
  ChevronRight,
  ChevronLeft,
  User,
  Package,
  CheckCircle2,
  Loader2,
  Printer,
  X
} from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";

// Individual Order Worksheet (for GB Home)
function IndividualOrderWorksheet({ order, stages, currentStageId, onRefresh }) {
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);

  // Timer logic for individual order
  useEffect(() => {
    const accumulated = Math.floor((order.timer_accumulated_minutes || 0) * 60);
    
    if (!order.timer_active) {
      setElapsedSeconds(accumulated);
      setTimerRunning(false);
      return;
    }

    setTimerRunning(true);
    const startTime = new Date(order.timer_started_at).getTime();

    function updateElapsed() {
      const now = Date.now();
      const currentSession = Math.floor((now - startTime) / 1000);
      setElapsedSeconds(accumulated + currentSession);
    }

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [order.timer_active, order.timer_started_at, order.timer_accumulated_minutes]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartTimer = async () => {
    try {
      const res = await fetch(`${API}/fulfillment/orders/${order.order_id}/start-timer`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Timer started");
        onRefresh?.();
      }
    } catch (err) {
      toast.error("Failed to start timer");
    }
  };

  const handleStopTimer = async () => {
    try {
      const res = await fetch(`${API}/fulfillment/orders/${order.order_id}/stop-timer`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Timer stopped");
        onRefresh?.();
      }
    } catch (err) {
      toast.error("Failed to stop timer");
    }
  };

  const handleMoveStage = async (targetStageId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/fulfillment/orders/${order.order_id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ target_stage_id: targetStageId })
      });
      if (res.ok) {
        toast.success("Order moved to next stage");
        onRefresh?.();
      }
    } catch (err) {
      toast.error("Failed to move order");
    } finally {
      setLoading(false);
    }
  };

  const currentStageIndex = stages?.findIndex(s => s.stage_id === currentStageId) ?? -1;
  const nextStage = currentStageIndex >= 0 && currentStageIndex < (stages?.length || 0) - 1 
    ? stages[currentStageIndex + 1] 
    : null;

  return (
    <Card className="bg-blue-500/5 border-blue-500/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-semibold">Order #{order.order_number || order.order_id?.slice(-8)}</h4>
            <p className="text-sm text-muted-foreground">{order.customer_name}</p>
          </div>
          
          {/* Timer */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-background/50 px-2 py-1 rounded">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className={`font-mono ${timerRunning ? 'text-green-400' : ''}`}>
                {formatTime(elapsedSeconds)}
              </span>
            </div>
            {timerRunning ? (
              <Button size="sm" variant="destructive" onClick={handleStopTimer}>
                <Square className="w-4 h-4" />
              </Button>
            ) : (
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleStartTimer}>
                <Play className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="space-y-1 mb-3">
          {order.items?.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm p-2 bg-background/30 rounded">
              <span className="truncate flex-1">{item.name}</span>
              <Badge variant="outline">x{item.qty || item.quantity}</Badge>
            </div>
          ))}
        </div>

        {/* Move to Next Stage */}
        {nextStage && (
          <Button 
            className="w-full gap-1" 
            onClick={() => handleMoveStage(nextStage.stage_id)}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            Move to {nextStage.name}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Grouped Batch Worksheet (for GB Decor, ShipStation)
function GroupedBatchWorksheet({ batch, stages, onRefresh, onClose }) {
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [completedOrders, setCompletedOrders] = useState(new Set());

  // Timer logic for batch
  useEffect(() => {
    const accumulated = Math.floor((batch.accumulated_minutes || 0) * 60);
    
    if (!batch.timer_active || batch.timer_paused) {
      setElapsedSeconds(accumulated);
      setTimerRunning(false);
      return;
    }

    setTimerRunning(true);
    const startTime = new Date(batch.timer_started_at).getTime();

    function updateElapsed() {
      const now = Date.now();
      const currentSession = Math.floor((now - startTime) / 1000);
      setElapsedSeconds(accumulated + currentSession);
    }

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [batch.timer_active, batch.timer_paused, batch.timer_started_at, batch.accumulated_minutes]);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartTimer = async () => {
    try {
      const res = await fetch(`${API}/fulfillment-batches/${batch.fulfillment_batch_id}/start-timer`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Timer started");
        onRefresh?.();
      }
    } catch (err) {
      toast.error("Failed to start timer");
    }
  };

  const handleStopTimer = async () => {
    try {
      const res = await fetch(`${API}/fulfillment-batches/${batch.fulfillment_batch_id}/stop-timer`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Timer stopped");
        onRefresh?.();
      }
    } catch (err) {
      toast.error("Failed to stop timer");
    }
  };

  const handleMoveStage = async (targetStageId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/fulfillment-batches/${batch.fulfillment_batch_id}/move-stage?target_stage_id=${targetStageId}`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Batch moved to next stage");
        onRefresh?.();
      }
    } catch (err) {
      toast.error("Failed to move batch");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/fulfillment-batches/${batch.fulfillment_batch_id}/complete`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Batch completed!");
        onRefresh?.();
        onClose?.();
      }
    } catch (err) {
      toast.error("Failed to complete batch");
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderComplete = (orderId) => {
    setCompletedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const currentStageIndex = stages?.findIndex(s => s.stage_id === batch.current_stage_id) ?? -1;
  const nextStage = currentStageIndex >= 0 && currentStageIndex < (stages?.length || 0) - 1 
    ? stages[currentStageIndex + 1] 
    : null;
  const isLastStage = currentStageIndex === (stages?.length || 0) - 1;

  // Calculate total items across all orders
  const totalItems = batch.orders?.reduce((sum, order) => {
    return sum + (order.items?.reduce((itemSum, item) => itemSum + (item.qty || item.quantity || 1), 0) || 0);
  }, 0) || 0;

  return (
    <div className="flex flex-col h-full space-y-4 overflow-hidden">
      {/* Header with Timer */}
      <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border flex-shrink-0">
        <div>
          <h3 className="text-lg font-semibold">{batch.name}</h3>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            <span>{batch.orders?.length || 0} orders</span>
            <span>•</span>
            <span>{totalItems} total items</span>
            <span>•</span>
            <span>Stage: {batch.current_stage_name}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Timer Display */}
          <div className="flex items-center gap-2 bg-background px-4 py-2 rounded-lg">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <span className={`font-mono text-xl ${timerRunning ? 'text-green-400' : ''}`}>
              {formatTime(elapsedSeconds)}
            </span>
          </div>
          
          {/* Timer Controls */}
          {timerRunning ? (
            <Button onClick={handleStopTimer} variant="destructive" className="gap-1">
              <Square className="w-4 h-4" />
              Stop
            </Button>
          ) : (
            <Button onClick={handleStartTimer} className="gap-1 bg-green-600 hover:bg-green-700">
              <Play className="w-4 h-4" />
              Start
            </Button>
          )}
          
          {/* Close button */}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Stage Progress */}
      <div className="flex items-center gap-2 px-4">
        {stages?.map((stage, idx) => (
          <div key={stage.stage_id} className="flex items-center">
            <div 
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                stage.stage_id === batch.current_stage_id 
                  ? 'bg-primary text-primary-foreground scale-105' 
                  : idx < currentStageIndex 
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {stage.name}
            </div>
            {idx < stages.length - 1 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />
            )}
          </div>
        ))}
      </div>

      {/* Orders Worksheet */}
      <ScrollArea className="flex-1 h-[calc(100vh-320px)] min-h-[300px]">
        <div className="space-y-4 p-4 pr-6">
          {batch.orders?.map((order, orderIdx) => {
            const orderTotal = order.items?.reduce((sum, item) => sum + (item.qty || item.quantity || 1), 0) || 0;
            const isCompleted = completedOrders.has(order.order_id);
            
            return (
              <Card 
                key={order.order_id} 
                className={`transition-all ${isCompleted ? 'bg-green-500/10 border-green-500/30' : ''}`}
              >
                <CardContent className="p-4">
                  {/* Order Header */}
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={isCompleted}
                        onCheckedChange={() => toggleOrderComplete(order.order_id)}
                        className="w-5 h-5"
                      />
                      <div>
                        <h4 className="font-semibold flex items-center gap-2">
                          Order #{order.order_number || order.order_id?.slice(-8)}
                          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                        </h4>
                        <p className="text-sm text-muted-foreground">{order.customer_name}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-lg px-3 py-1">
                      {orderTotal} items
                    </Badge>
                  </div>

                  {/* Order Items */}
                  <div className="space-y-2">
                    {order.items?.map((item, itemIdx) => {
                      const qty = item.qty || item.quantity || 1;
                      const isMultiple = qty > 1;
                      
                      return (
                        <div 
                          key={itemIdx} 
                          className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm leading-relaxed break-words">{item.name}</p>
                            {item.sku && (
                              <p className="text-xs text-muted-foreground font-mono mt-1">SKU: {item.sku}</p>
                            )}
                            {item.variant_title && (
                              <p className="text-xs text-muted-foreground mt-0.5">{item.variant_title}</p>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            <span 
                              className={`text-lg font-bold px-3 py-1 rounded inline-block ${
                                isMultiple 
                                  ? 'text-red-400 bg-red-500/20 animate-pulse' 
                                  : 'text-foreground bg-muted'
                              }`}
                            >
                              x{qty}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Order Subtotal */}
                  <div className="mt-3 pt-3 border-t border-border flex justify-end">
                    <span className="text-sm text-muted-foreground">
                      Subtotal: <strong className="text-foreground">{orderTotal} items</strong>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* Action Buttons */}
      <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border">
        <div className="text-sm text-muted-foreground">
          {completedOrders.size} of {batch.orders?.length || 0} orders checked
        </div>
        <div className="flex items-center gap-2">
          {nextStage && (
            <Button
              onClick={() => handleMoveStage(nextStage.stage_id)}
              disabled={loading}
              className="gap-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              Move All to {nextStage.name}
            </Button>
          )}
          {isLastStage && (
            <Button
              onClick={handleComplete}
              disabled={loading}
              className="gap-1 bg-green-600 hover:bg-green-700"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Complete Batch
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Main Batch Detail View - decides which worksheet to show
export function FulfillmentBatchDetail({ batch, stages, onRefresh, onClose }) {
  // Determine if this is GB Home (individual worksheets) or other (grouped worksheet)
  const isGBHome = batch.store_id === "store_gb_wholesale" || 
                   batch.store_name?.toLowerCase().includes("home");
  
  const isGroupedBatch = !isGBHome; // GB Decor, ShipStation, etc.

  if (isGroupedBatch) {
    return (
      <GroupedBatchWorksheet 
        batch={batch} 
        stages={stages} 
        onRefresh={onRefresh}
        onClose={onClose}
      />
    );
  }

  // GB Home - Show individual order worksheets
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border">
        <div>
          <h3 className="text-lg font-semibold">{batch.name}</h3>
          <p className="text-sm text-muted-foreground">
            {batch.orders?.length || 0} orders • Individual processing
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Stage Progress */}
      <div className="flex items-center gap-2 px-4">
        {stages?.map((stage, idx) => (
          <div key={stage.stage_id} className="flex items-center">
            <div className={`px-3 py-1.5 rounded-full text-sm font-medium bg-muted text-muted-foreground`}>
              {stage.name}
            </div>
            {idx < stages.length - 1 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />
            )}
          </div>
        ))}
      </div>

      {/* Individual Order Worksheets */}
      <ScrollArea className="h-[calc(100vh-300px)] min-h-[400px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
          {batch.orders?.map((order) => (
            <IndividualOrderWorksheet
              key={order.order_id}
              order={order}
              stages={stages}
              currentStageId={order.fulfillment_stage_id}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
