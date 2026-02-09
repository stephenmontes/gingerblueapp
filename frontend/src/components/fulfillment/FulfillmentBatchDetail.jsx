import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Play, 
  Square, 
  Clock, 
  ChevronRight,
  ChevronLeft,
  User,
  Users,
  Package,
  CheckCircle2,
  Loader2,
  Printer,
  X,
  BarChart3,
  DollarSign,
  TrendingUp,
  Minus,
  Plus,
  Trash2,
  MoreVertical,
  Pause,
  CheckSquare
} from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Report Dialog Component
function BatchReportDialog({ batch, isOpen, onClose }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && batch) {
      loadReport();
    }
  }, [isOpen, batch]);

  async function loadReport() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/fulfillment-batches/${batch.fulfillment_batch_id}/report`, {
        credentials: "include"
      });
      if (res.ok) {
        setReport(await res.json());
      }
    } catch (err) {
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Batch Performance Report
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : report ? (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-muted/30">
                <CardContent className="p-4 text-center">
                  <Package className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">{report.total_items}</p>
                  <p className="text-xs text-muted-foreground">Total Items</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="p-4 text-center">
                  <TrendingUp className="w-6 h-6 mx-auto mb-2 text-green-400" />
                  <p className="text-2xl font-bold">{report.combined_metrics.items_per_hour}</p>
                  <p className="text-xs text-muted-foreground">Items/Hour</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="p-4 text-center">
                  <DollarSign className="w-6 h-6 mx-auto mb-2 text-yellow-400" />
                  <p className="text-2xl font-bold">${report.combined_metrics.total_cost}</p>
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                </CardContent>
              </Card>
            </div>

            {/* Time Breakdown */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Time Breakdown
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 bg-muted/30 rounded">
                  <span>Fulfillment Time:</span>
                  <span className="font-medium">{report.fulfillment_time.total_hours} hours</span>
                </div>
                {report.production_time && (
                  <div className="flex justify-between p-2 bg-muted/30 rounded">
                    <span>Production Time ({report.production_time.batch_name}):</span>
                    <span className="font-medium">{(report.production_time.total_minutes / 60).toFixed(2)} hours</span>
                  </div>
                )}
                <div className="flex justify-between p-2 bg-primary/20 rounded font-semibold">
                  <span>Combined Total:</span>
                  <span>{report.combined_metrics.total_hours} hours</span>
                </div>
              </div>
            </div>

            {/* Workers Breakdown */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Fulfillment Workers
              </h3>
              {report.fulfillment_time.workers.length > 0 ? (
                <div className="space-y-2">
                  {report.fulfillment_time.workers.map((worker, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{worker.user_name}</span>
                        {worker.is_active && (
                          <Badge className="bg-green-500/20 text-green-400 text-xs">Active</Badge>
                        )}
                      </div>
                      <div className="text-right text-sm">
                        <p>{worker.total_hours} hrs • {worker.items_per_hour} items/hr</p>
                        <p className="text-muted-foreground">
                          ${worker.hourly_rate}/hr → ${worker.cost}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No time logged yet</p>
              )}
            </div>

            {/* Production Workers */}
            {report.production_time && Object.keys(report.production_time.workers).length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Production Workers
                </h3>
                <div className="space-y-2">
                  {Object.entries(report.production_time.workers).map(([userId, worker]) => (
                    <div key={userId} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{worker.user_name}</span>
                      </div>
                      <div className="text-right text-sm">
                        <p>{(worker.total_minutes / 60).toFixed(2)} hrs</p>
                        <p className="text-muted-foreground">
                          ${worker.hourly_rate}/hr → ${worker.cost?.toFixed(2) || '0.00'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost Summary */}
            <div className="p-4 bg-primary/10 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-semibold">
                  Total Cost (Avg ${report.combined_metrics.avg_hourly_rate}/hr)
                </span>
                <span className="text-xl font-bold">${report.combined_metrics.total_cost}</span>
              </div>
              {report.production_time && (
                <div className="text-sm text-muted-foreground mt-2">
                  Production: ${report.production_time.total_cost} + 
                  Fulfillment: ${report.fulfillment_time.total_cost}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">No report data available</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Qty Input Component with + / - buttons
function QtyInput({ value, max, onChange, disabled }) {
  const isComplete = value >= max;
  
  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value <= 0}
      >
        <Minus className="w-3 h-3" />
      </Button>
      <div className={`w-16 text-center py-1 rounded font-bold ${
        isComplete ? 'bg-green-500/20 text-green-400' : 'bg-muted'
      }`}>
        {value} / {max}
      </div>
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
      >
        <Plus className="w-3 h-3" />
      </Button>
    </div>
  );
}

// Main Batch Detail Component
export function FulfillmentBatchDetail({ batch, stages, onRefresh, onClose, canDelete, user }) {
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [itemProgress, setItemProgress] = useState({});
  const [updatingItem, setUpdatingItem] = useState(null);
  const [deleteOrderId, setDeleteOrderId] = useState(null);
  const [deleteOrderNumber, setDeleteOrderNumber] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [markingComplete, setMarkingComplete] = useState(false);

  // Check if current user is in active workers (timer must be running to work)
  const activeWorkers = batch.active_workers || [];
  
  // Find the current user's worker entry
  const currentUserWorker = user ? activeWorkers.find(w => w.user_id === user.user_id) : null;
  const isUserActive = !!currentUserWorker;
  const isUserPaused = currentUserWorker?.is_paused || false;
  
  const hasActiveTimer = batch.timer_active && !batch.timer_paused && activeWorkers.length > 0;
  
  // Helper to check if timer is required before action
  const requiresTimer = () => {
    if (!isUserActive) {
      toast.error("Start your timer before updating items", {
        icon: <Clock className="w-4 h-4" />,
        description: "Click 'Start Timer' or 'Join Work' to begin tracking your work"
      });
      return true;
    }
    if (isUserPaused) {
      toast.error("Resume your timer before updating items", {
        icon: <Clock className="w-4 h-4" />,
        description: "Click 'Resume' to continue tracking your work"
      });
      return true;
    }
    return false;
  };
  
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

  // Initialize item progress from batch data
  useEffect(() => {
    const progress = {};
    batch.orders?.forEach(order => {
      progress[order.order_id] = {};
      const items = order.items || order.line_items || [];
      items.forEach((item, idx) => {
        progress[order.order_id][`item_${idx}`] = item.qty_completed || 0;
      });
    });
    setItemProgress(progress);
  }, [batch.orders]);

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
        const result = await res.json();
        toast.success(result.message);
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
        const result = await res.json();
        toast.success(result.message);
        onRefresh?.();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to stop timer");
      }
    } catch (err) {
      console.error("Stop timer error:", err);
      toast.error("Failed to stop timer");
    }
  };

  const handlePauseTimer = async () => {
    try {
      const res = await fetch(`${API}/fulfillment-batches/${batch.fulfillment_batch_id}/pause-timer`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        toast.info("Timer paused");
        onRefresh?.();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to pause timer");
      }
    } catch (err) {
      toast.error("Failed to pause timer");
    }
  };

  const handleResumeTimer = async () => {
    try {
      const res = await fetch(`${API}/fulfillment-batches/${batch.fulfillment_batch_id}/resume-timer`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Timer resumed");
        onRefresh?.();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to resume timer");
      }
    } catch (err) {
      toast.error("Failed to resume timer");
    }
  };

  const handleMoveStage = async (targetStageId) => {
    if (requiresTimer()) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API}/fulfillment-batches/${batch.fulfillment_batch_id}/move-stage?target_stage_id=${targetStageId}`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        if (result.timer_preserved) {
          toast.info("Timer continues running", { icon: <Clock className="w-4 h-4" /> });
        }
        onRefresh?.();
      }
    } catch (err) {
      toast.error("Failed to move batch");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (requiresTimer()) return;
    
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

  const handleUpdateItemProgress = async (orderId, itemIndex, newQty) => {
    if (requiresTimer()) return;
    
    const itemKey = `item_${itemIndex}`;
    
    // Optimistic update
    setItemProgress(prev => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        [itemKey]: newQty
      }
    }));
    
    setUpdatingItem(`${orderId}-${itemIndex}`);
    
    try {
      const res = await fetch(
        `${API}/fulfillment-batches/${batch.fulfillment_batch_id}/items/progress?order_id=${orderId}&item_index=${itemIndex}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ qty_completed: newQty })
        }
      );
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Failed to update progress:", res.status, errorData);
        // Revert on error
        onRefresh?.();
        toast.error(errorData.detail || "Failed to update progress");
      }
    } catch (err) {
      console.error("Failed to update progress:", err);
      onRefresh?.();
      toast.error("Failed to update progress");
    } finally {
      setUpdatingItem(null);
    }
  };

  // Order selection handlers
  const toggleOrderSelection = (orderId) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const toggleAllOrders = () => {
    const orders = batch.orders || [];
    if (selectedOrders.size === orders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(orders.map(o => o.order_id)));
    }
  };

  // Mark selected orders complete (set all items to max qty)
  const handleMarkSelectedComplete = async () => {
    if (requiresTimer()) return;
    if (selectedOrders.size === 0) {
      toast.error("No orders selected");
      return;
    }

    setMarkingComplete(true);
    const orders = batch.orders || [];
    let successCount = 0;
    let errorCount = 0;

    for (const orderId of selectedOrders) {
      const order = orders.find(o => o.order_id === orderId);
      if (!order) continue;

      const items = order.items || order.line_items || [];
      
      for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx];
        const qty = item.qty || item.quantity || 1;
        const currentProgress = itemProgress[orderId]?.[`item_${itemIdx}`] || 0;
        
        // Only update if not already complete
        if (currentProgress < qty) {
          try {
            const res = await fetch(
              `${API}/fulfillment-batches/${batch.fulfillment_batch_id}/items/progress?order_id=${orderId}&item_index=${itemIdx}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ qty_completed: qty })
              }
            );
            
            if (res.ok) {
              successCount++;
            } else {
              errorCount++;
            }
          } catch (err) {
            errorCount++;
          }
        }
      }
    }

    setMarkingComplete(false);
    setSelectedOrders(new Set());
    
    if (successCount > 0) {
      toast.success(`Marked ${successCount} items complete`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to update ${errorCount} items`);
    }
    
    onRefresh?.();
  };

  // Delete order handler
  const handleDeleteOrder = async () => {
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
        onRefresh?.();
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
  };

  const confirmDeleteOrder = (orderId, orderNumber) => {
    setDeleteOrderId(orderId);
    setDeleteOrderNumber(orderNumber);
  };

  // Calculate progress
  const totalItems = batch.orders?.reduce((sum, order) => {
    const items = order.items || order.line_items || [];
    return sum + items.reduce((itemSum, item) => itemSum + (item.qty || item.quantity || 1), 0);
  }, 0) || 0;

  const completedItems = batch.orders?.reduce((sum, order) => {
    const items = order.items || order.line_items || [];
    return sum + items.reduce((itemSum, item, idx) => {
      const progress = itemProgress[order.order_id]?.[`item_${idx}`] || 0;
      return itemSum + progress;
    }, 0);
  }, 0) || 0;

  const progressPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  // Check if order is complete
  const isOrderComplete = (order) => {
    const items = order.items || order.line_items || [];
    return items.every((item, idx) => {
      const qty = item.qty || item.quantity || 1;
      const progress = itemProgress[order.order_id]?.[`item_${idx}`] || 0;
      return progress >= qty;
    });
  };

  const completedOrderCount = batch.orders?.filter(isOrderComplete).length || 0;

  // Find current and next stage
  const currentStageIndex = stages.findIndex(s => s.stage_id === batch.current_stage_id);
  const nextStage = stages[currentStageIndex + 1];
  const isLastStage = currentStageIndex === stages.length - 1;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border overflow-hidden">
      {/* Header - Mobile Optimized */}
      <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9">
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold truncate">{batch.name}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {batch.orders?.length || 0} orders • {totalItems} items
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {/* Active Workers Badge - hidden on mobile */}
          {activeWorkers.length > 0 && (
            <Badge variant="outline" className="gap-1 hidden sm:flex">
              <Users className="w-3 h-3" />
              {activeWorkers.length} working
            </Badge>
          )}
          
          {/* Report Button - icon only on mobile */}
          <Button variant="outline" size="sm" onClick={() => setShowReport(true)} className="h-8 px-2 sm:px-3">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Report</span>
          </Button>
          
          {/* Print Button - icon only on mobile */}
          <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 px-2 sm:px-3">
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Print</span>
          </Button>
          
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 sm:h-9 sm:w-9">
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </div>
      </div>

      {/* Timer and Progress Bar - Mobile Optimized */}
      <div className="p-3 sm:p-4 border-b border-border space-y-2 sm:space-y-3">
        {/* Timer Required Warning */}
        {!isUserActive && (
          <div className="flex items-center gap-2 p-2 sm:p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-medium">Start timer to update items</span>
          </div>
        )}
        
        {/* Paused Warning */}
        {isUserPaused && (
          <div className="flex items-center gap-2 p-2 sm:p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400">
            <Pause className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-medium">Timer paused. Resume to continue.</span>
          </div>
        )}
        
        {/* Timer Controls - Stack on mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`text-lg sm:text-2xl font-mono font-bold px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg ${
              isUserPaused ? 'bg-yellow-500/20 text-yellow-400' : timerRunning && isUserActive ? 'bg-green-500/20 text-green-400' : 'bg-muted'
            }`}>
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 inline mr-1 sm:mr-2" />
              {formatTime(elapsedSeconds)}
              {isUserPaused && <Badge variant="outline" className="ml-1 sm:ml-2 text-[10px] sm:text-xs border-yellow-500 text-yellow-400">PAUSED</Badge>}
            </div>
            
            {/* Timer Action Buttons */}
            {!isUserActive ? (
              <Button onClick={handleStartTimer} className="gap-1.5 sm:gap-2 h-8 sm:h-9 text-sm" data-testid="start-batch-timer">
                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">{activeWorkers.length > 0 ? "Join" : "Start"}</span>
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Pause/Resume Button */}
                {isUserPaused ? (
                  <Button 
                    onClick={handleResumeTimer} 
                    className="gap-1.5 bg-green-600 hover:bg-green-700 h-8 sm:h-9 text-sm"
                    data-testid="resume-batch-timer"
                  >
                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden xs:inline">Resume</span>
                  </Button>
                ) : (
                  <Button 
                    onClick={handlePauseTimer} 
                    variant="secondary" 
                    className="gap-1.5 h-8 sm:h-9 text-sm"
                    data-testid="pause-batch-timer"
                  >
                    <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden xs:inline">Pause</span>
                  </Button>
                )}
                
                {/* Stop Button */}
                <Button 
                  onClick={handleStopTimer} 
                  variant="destructive" 
                  className="gap-1.5 h-8 sm:h-9 text-sm"
                  data-testid="stop-batch-timer"
                >
                  <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden xs:inline">Stop</span>
                </Button>
              </div>
            )}
          </div>
          
          {/* Workers Info - show on larger screens or wrap on mobile */}
          {activeWorkers.length > 0 && (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {activeWorkers.slice(0, 2).map((w, i) => (
                <Badge 
                  key={i} 
                  variant="secondary" 
                  className={`gap-1 text-xs ${w.is_paused ? 'border-yellow-500/50 text-yellow-400' : ''}`}
                >
                  <User className="w-3 h-3" />
                  <span className="truncate max-w-[60px] sm:max-w-none">{w.user_name}</span>
                  {w.is_paused && <span className="text-[10px]">(p)</span>}
                </Badge>
              ))}
              {activeWorkers.length > 2 && (
                <Badge variant="secondary" className="text-xs">+{activeWorkers.length - 2}</Badge>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>Progress: {completedItems} / {totalItems} items</span>
            <span>{completedOrderCount} / {batch.orders?.length || 0} orders complete</span>
          </div>
          <Progress value={progressPercent} className="h-3" />
        </div>
      </div>

      {/* Stage Progress Pills */}
      <div className="flex items-center gap-1 p-4 border-b border-border overflow-x-auto">
        {stages.map((stage, idx) => (
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

      {/* Selection Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <Checkbox 
            checked={selectedOrders.size === (batch.orders?.length || 0) && batch.orders?.length > 0}
            onCheckedChange={toggleAllOrders}
            data-testid="select-all-orders"
          />
          <span className="text-sm">
            {selectedOrders.size > 0 
              ? `${selectedOrders.size} order${selectedOrders.size > 1 ? 's' : ''} selected`
              : 'Select orders'
            }
          </span>
        </div>
        
        {selectedOrders.size > 0 && (
          <Button
            size="sm"
            onClick={handleMarkSelectedComplete}
            disabled={markingComplete || !isUserActive || isUserPaused}
            className="gap-2 bg-green-600 hover:bg-green-700"
            data-testid="mark-selected-complete-btn"
          >
            {markingComplete ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckSquare className="w-4 h-4" />
            )}
            Mark {selectedOrders.size} Complete
          </Button>
        )}
      </div>

      {/* Orders Worksheet */}
      <ScrollArea className="flex-1 h-[calc(100vh-450px)] min-h-[300px]">
        <div className="space-y-4 p-4 pr-6">
          {batch.orders?.map((order, orderIdx) => {
            const items = order.items || order.line_items || [];
            const orderTotal = items.reduce((sum, item) => sum + (item.qty || item.quantity || 1), 0);
            const orderCompleted = items.reduce((sum, item, idx) => {
              return sum + (itemProgress[order.order_id]?.[`item_${idx}`] || 0);
            }, 0);
            const orderComplete = isOrderComplete(order);
            const isSelected = selectedOrders.has(order.order_id);
            
            return (
              <Card 
                key={order.order_id} 
                className={`transition-all ${orderComplete ? 'bg-green-500/10 border-green-500/30' : ''} ${isSelected ? 'ring-2 ring-primary' : ''}`}
              >
                <CardContent className="p-4">
                  {/* Order Header */}
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      {/* Checkbox */}
                      <Checkbox 
                        checked={isSelected}
                        onCheckedChange={() => toggleOrderSelection(order.order_id)}
                        data-testid={`select-order-${order.order_id}`}
                      />
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        orderComplete ? 'bg-green-500 text-white' : 'bg-muted'
                      }`}>
                        {orderComplete ? <CheckCircle2 className="w-5 h-5" /> : orderIdx + 1}
                      </div>
                      <div>
                        <h4 className="font-semibold flex items-center gap-2">
                          Order #{order.order_number || order.order_id?.slice(-8)}
                          {orderComplete && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                        </h4>
                        <p className="text-sm text-muted-foreground">{order.customer_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={orderComplete ? "default" : "outline"} className={`text-lg px-3 py-1 ${orderComplete ? 'bg-green-500' : ''}`}>
                        {orderCompleted} / {orderTotal}
                      </Badge>
                      {canDelete && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => confirmDeleteOrder(order.order_id, order.order_number || order.order_id?.slice(-8))}
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              data-testid={`delete-order-${order.order_id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remove from Fulfillment
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  {/* Order Items with Qty Tracking */}
                  <div className="space-y-2">
                    {items.map((item, itemIdx) => {
                      const qty = item.qty || item.quantity || 1;
                      const progress = itemProgress[order.order_id]?.[`item_${itemIdx}`] || 0;
                      const itemComplete = progress >= qty;
                      const imageUrl = item.image_url || item.image;
                      const isUpdating = updatingItem === `${order.order_id}-${itemIdx}`;
                      
                      return (
                        <div 
                          key={itemIdx} 
                          className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                            itemComplete ? 'bg-green-500/10' : 'bg-muted/30'
                          }`}
                        >
                          {/* Item Thumbnail */}
                          {imageUrl ? (
                            <div className="flex-shrink-0 w-14 h-14 rounded-md overflow-hidden bg-muted">
                              <img 
                                src={imageUrl} 
                                alt={item.name} 
                                className="w-full h-full object-cover"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            </div>
                          ) : (
                            <div className="flex-shrink-0 w-14 h-14 rounded-md bg-muted flex items-center justify-center">
                              <Package className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium text-sm leading-relaxed break-words ${itemComplete ? 'line-through text-muted-foreground' : ''}`}>
                              {item.name}
                            </p>
                            {item.sku && (
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">SKU: {item.sku}</p>
                            )}
                            {item.variant_title && (
                              <p className="text-xs text-muted-foreground">{item.variant_title}</p>
                            )}
                          </div>
                          
                          {/* Qty Input */}
                          <div className="flex-shrink-0 flex items-center gap-2">
                            {isUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
                            <QtyInput
                              value={progress}
                              max={qty}
                              onChange={(newQty) => handleUpdateItemProgress(order.order_id, itemIdx, newQty)}
                              disabled={isUpdating || !hasActiveTimer}
                            />
                            {itemComplete && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* Action Buttons */}
      <div className="p-4 border-t border-border flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          Stage: <strong>{batch.current_stage_name}</strong>
        </div>
        
        <div className="flex gap-2">
          {!isLastStage && nextStage && (
            <Button 
              onClick={() => handleMoveStage(nextStage.stage_id)}
              disabled={loading}
              className="gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              Move to {nextStage.name}
            </Button>
          )}
          
          {isLastStage && (
            <Button 
              onClick={handleComplete}
              disabled={loading}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Complete Batch
            </Button>
          )}
        </div>
      </div>

      {/* Report Dialog */}
      <BatchReportDialog 
        batch={batch}
        isOpen={showReport}
        onClose={() => setShowReport(false)}
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
    </div>
  );
}
