import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Package, 
  Play, 
  Pause, 
  Square, 
  Clock, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  User,
  Truck,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";

export function FulfillmentBatchWorksheet({ batch, stages, onRefresh, onTimerChange }) {
  const [expanded, setExpanded] = useState(true);
  const [timerRunning, setTimerRunning] = useState(batch?.timer_active && !batch?.timer_paused);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);

  // Calculate elapsed time
  useEffect(() => {
    const accumulatedSeconds = Math.floor((batch?.accumulated_minutes || 0) * 60);
    
    if (!batch?.timer_active || batch?.timer_paused) {
      setElapsedSeconds(accumulatedSeconds);
      setTimerRunning(false);
      return;
    }

    setTimerRunning(true);
    const startTime = new Date(batch.timer_started_at).getTime();

    function updateElapsed() {
      const now = Date.now();
      const currentSession = Math.floor((now - startTime) / 1000);
      setElapsedSeconds(accumulatedSeconds + currentSession);
    }

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [batch?.timer_active, batch?.timer_paused, batch?.timer_started_at, batch?.accumulated_minutes]);

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
        onTimerChange?.();
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
        onTimerChange?.();
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
        const data = await res.json();
        toast.success(data.message);
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
      }
    } catch (err) {
      toast.error("Failed to complete batch");
    } finally {
      setLoading(false);
    }
  };

  // Find current stage index and next stage
  const currentStageIndex = stages?.findIndex(s => s.stage_id === batch?.current_stage_id) ?? -1;
  const nextStage = currentStageIndex >= 0 && currentStageIndex < (stages?.length || 0) - 1 
    ? stages[currentStageIndex + 1] 
    : null;
  const isLastStage = currentStageIndex === (stages?.length || 0) - 1;

  if (!batch) return null;

  return (
    <Card className="bg-yellow-500/10 border-yellow-500/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="p-0 h-auto"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </Button>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-yellow-500" />
              {batch.name}
              <Badge variant="outline" className="text-yellow-400 border-yellow-400/30">
                Etsy Batch
              </Badge>
            </CardTitle>
          </div>
          
          {/* Timer Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-background/50 px-3 py-1.5 rounded-lg">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className={`font-mono text-lg ${timerRunning ? 'text-green-400' : ''}`}>
                {formatTime(elapsedSeconds)}
              </span>
            </div>
            
            {timerRunning ? (
              <Button 
                onClick={handleStopTimer}
                variant="destructive"
                size="sm"
                className="gap-1"
              >
                <Square className="w-4 h-4" />
                Stop
              </Button>
            ) : (
              <Button 
                onClick={handleStartTimer}
                className="gap-1 bg-green-600 hover:bg-green-700"
                size="sm"
              >
                <Play className="w-4 h-4" />
                Start
              </Button>
            )}
          </div>
        </div>
        
        {/* Stage Progress */}
        <div className="flex items-center gap-2 mt-3">
          {stages?.map((stage, idx) => (
            <div key={stage.stage_id} className="flex items-center">
              <div 
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  stage.stage_id === batch.current_stage_id 
                    ? 'bg-primary text-primary-foreground' 
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
      </CardHeader>
      
      {expanded && (
        <CardContent>
          {/* Order Summary */}
          <div className="mb-4 p-3 bg-background/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <strong>{batch.order_count}</strong> orders
                </span>
                {batch.assigned_name && (
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4 text-muted-foreground" />
                    {batch.assigned_name}
                  </span>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {nextStage && (
                  <Button
                    onClick={() => handleMoveStage(nextStage.stage_id)}
                    disabled={loading}
                    size="sm"
                    className="gap-1"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                    Move to {nextStage.name}
                  </Button>
                )}
                {isLastStage && (
                  <Button
                    onClick={handleComplete}
                    disabled={loading}
                    size="sm"
                    className="gap-1 bg-green-600 hover:bg-green-700"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Complete Batch
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          {/* Orders Table */}
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Ship Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.orders?.map((order) => (
                  <TableRow key={order.order_id} className="border-border">
                    <TableCell className="font-mono font-medium">
                      {order.order_number || order.order_id?.slice(-8)}
                    </TableCell>
                    <TableCell>{order.customer_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.items?.length || 0} items</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.requested_ship_date 
                        ? new Date(order.requested_ship_date).toLocaleDateString()
                        : "—"
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}
