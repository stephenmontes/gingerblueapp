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
    <div className="flex items-center gap-0.5 sm:gap-1">
      <Button
        size="icon"
        variant="outline"
        className="h-7 w-7 sm:h-8 sm:w-8"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value <= 0}
      >
        <Minus className="w-3 h-3" />
      </Button>
      <div className={`w-12 sm:w-16 text-center py-0.5 sm:py-1 rounded font-bold text-xs sm:text-sm ${
        isComplete ? 'bg-green-500/20 text-green-400' : 'bg-muted'
      }`}>
        {value}/{max}
      </div>
      <Button
        size="icon"
        variant="outline"
        className="h-7 w-7 sm:h-8 sm:w-8"
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
  const [movingToPackShip, setMovingToPackShip] = useState(false);

  // Check if batch is at Finish stage (allows moving orders to Pack & Ship independently)
  const isAtFinishStage = batch.current_stage_id === "fulfill_finish";
  const hasSplitOrders = batch.has_split_orders || false;
  
  // GB Home batches use individual order processing - they can move orders to Pack & Ship at any stage
  const isGBHomeBatch = batch.store_type === "gb_home" || batch.is_gb_home_batch;
  // Allow moving to pack/ship for GB Home at any stage, or for other stores only at Finish stage
  const canMoveToPackShip = isGBHomeBatch || isAtFinishStage;

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

  // Move selected orders to Pack and Ship (for Finish stage)
  const moveOrdersToPackShip = async () => {
    if (selectedOrders.size === 0) {
      toast.error("No orders selected");
      return;
    }

    // GB Home can move orders at any stage, others only at Finish
    if (!canMoveToPackShip) {
      toast.error("Orders can only be moved to Pack and Ship from the Finish stage");
      return;
    }

    setMovingToPackShip(true);

    try {
      const res = await fetch(
        `${API}/fulfillment-batches/${batch.fulfillment_batch_id}/orders/move-to-pack-ship`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            order_ids: Array.from(selectedOrders),
            is_gb_home: isGBHomeBatch  // Pass flag so backend knows to allow at any stage
          })
        }
      );

      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        setSelectedOrders(new Set());
        onRefresh?.();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to move orders");
      }
    } catch (err) {
      toast.error("Failed to move orders to Pack and Ship");
    } finally {
      setMovingToPackShip(false);
    }
  };

  // Mark individual order as shipped
  const markOrderShipped = async (orderId) => {
    try {
      const res = await fetch(
        `${API}/fulfillment-batches/${batch.fulfillment_batch_id}/orders/${orderId}/mark-shipped`,
        {
          method: "POST",
          credentials: "include"
        }
      );

      if (res.ok) {
        toast.success("Order marked as shipped");
        onRefresh?.();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to mark order as shipped");
      }
    } catch (err) {
      toast.error("Failed to mark order as shipped");
    }
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
          <div className="flex justify-between text-xs sm:text-sm">
            <span>{completedItems}/{totalItems} items</span>
            <span>{completedOrderCount}/{batch.orders?.length || 0} orders</span>
          </div>
          <Progress value={progressPercent} className="h-2 sm:h-3" />
        </div>
      </div>

      {/* Stage Progress Pills - Horizontal scroll on mobile */}
      <div className="flex items-center gap-1 p-2 sm:p-4 border-b border-border overflow-x-auto scrollbar-hide">
        {stages.map((stage, idx) => (
          <div key={stage.stage_id} className="flex items-center flex-shrink-0">
            <div
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
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
              <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground mx-0.5 sm:mx-1 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Selection Toolbar - Mobile optimized */}
      <div className="flex items-center justify-between p-2 sm:p-3 border-b border-border bg-muted/30 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Checkbox 
            checked={selectedOrders.size === (batch.orders?.length || 0) && batch.orders?.length > 0}
            onCheckedChange={toggleAllOrders}
            data-testid="select-all-orders"
            className="flex-shrink-0"
          />
          <span className="text-xs sm:text-sm truncate">
            {selectedOrders.size > 0 
              ? `${selectedOrders.size} selected`
              : 'Select all'
            }
          </span>
        </div>
        
        {selectedOrders.size > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleMarkSelectedComplete}
              disabled={markingComplete || !isUserActive || isUserPaused}
              className="gap-1.5 bg-green-600 hover:bg-green-700 h-8 text-xs sm:text-sm flex-shrink-0"
              data-testid="mark-selected-complete-btn"
            >
              {markingComplete ? (
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
              ) : (
                <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
              <span className="hidden xs:inline">Mark</span> {selectedOrders.size} Done
            </Button>
            
            {/* Move to Pack & Ship button - for GB Home at any stage, others only at Finish */}
            {canMoveToPackShip && (
              <Button
                size="sm"
                onClick={moveOrdersToPackShip}
                disabled={movingToPackShip}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 h-8 text-xs sm:text-sm flex-shrink-0"
                data-testid="move-to-pack-ship-btn"
              >
                {movingToPackShip ? (
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                ) : (
                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
                <span className="hidden sm:inline">Pack &</span> Ship {selectedOrders.size}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Pack & Ship indicator */}
      {isAtFinishStage && hasSplitOrders && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 mx-3 sm:mx-4 mb-2">
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <Package className="w-4 h-4" />
            <span>Some orders have been moved to Pack & Ship independently</span>
          </div>
        </div>
      )}

      {/* Orders Worksheet - Mobile optimized with proper overflow handling */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="space-y-3 sm:space-y-4 p-3 sm:p-4">
          {batch.orders?.map((order, orderIdx) => {
            const items = order.items || order.line_items || [];
            const orderTotal = items.reduce((sum, item) => sum + (item.qty || item.quantity || 1), 0);
            const orderCompleted = items.reduce((sum, item, idx) => {
              return sum + (itemProgress[order.order_id]?.[`item_${idx}`] || 0);
            }, 0);
            const orderComplete = isOrderComplete(order);
            const isSelected = selectedOrders.has(order.order_id);
            const isAtPackShip = order.individual_stage_override && order.fulfillment_stage_id === "fulfill_pack";
            const isShipped = order.status === "shipped";
            
            return (
              <Card 
                key={order.order_id} 
                className={`transition-all overflow-hidden ${
                  isShipped ? 'bg-green-500/20 border-green-500/50' :
                  isAtPackShip ? 'bg-blue-500/10 border-blue-500/30' :
                  orderComplete ? 'bg-green-500/10 border-green-500/30' : ''
                } ${isSelected ? 'ring-2 ring-primary' : ''}`}
              >
                <CardContent className="p-3 sm:p-4">
                  {/* Order Header - Mobile optimized */}
                  <div className="flex items-start sm:items-center justify-between mb-2 sm:mb-3 pb-2 sm:pb-3 border-b border-border gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      {/* Checkbox - only for orders not yet at Pack & Ship */}
                      {!isAtPackShip && !isShipped && (
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => toggleOrderSelection(order.order_id)}
                          data-testid={`select-order-${order.order_id}`}
                          className="flex-shrink-0"
                        />
                      )}
                      <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm flex-shrink-0 ${
                        isShipped ? 'bg-green-600 text-white' :
                        isAtPackShip ? 'bg-blue-500 text-white' :
                        orderComplete ? 'bg-green-500 text-white' : 'bg-muted'
                      }`}>
                        {isShipped ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /> : 
                         isAtPackShip ? <Package className="w-4 h-4 sm:w-5 sm:h-5" /> :
                         orderComplete ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /> : orderIdx + 1}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm sm:text-base flex items-center gap-1 sm:gap-2 flex-wrap">
                          <span className="truncate">#{order.order_number || order.order_id?.slice(-8)}</span>
                          {isShipped && <Badge className="bg-green-600 text-xs">Shipped</Badge>}
                          {isAtPackShip && !isShipped && <Badge className="bg-blue-500 text-xs">Pack & Ship</Badge>}
                          {orderComplete && !isAtPackShip && !isShipped && <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400 flex-shrink-0" />}
                        </h4>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">{order.customer_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                      {/* Mark Shipped button for orders at Pack & Ship */}
                      {isAtPackShip && !isShipped && (
                        <Button
                          size="sm"
                          onClick={() => markOrderShipped(order.order_id)}
                          className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                          data-testid={`mark-shipped-${order.order_id}`}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Shipped
                        </Button>
                      )}
                      <Badge variant={orderComplete ? "default" : "outline"} className={`text-sm sm:text-lg px-2 sm:px-3 py-0.5 sm:py-1 ${
                        isShipped ? 'bg-green-600' :
                        isAtPackShip ? 'bg-blue-500' :
                        orderComplete ? 'bg-green-500' : ''
                      }`}>
                        {orderCompleted}/{orderTotal}
                      </Badge>
                      {canDelete && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8 p-0">
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
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  {/* Order Items with Qty Tracking - Mobile optimized */}
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
                          className={`flex items-start sm:items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg transition-all ${
                            itemComplete ? 'bg-green-500/10' : 'bg-muted/30'
                          }`}
                        >
                          {/* Item Thumbnail - Smaller on mobile */}
                          {imageUrl ? (
                            <div className="flex-shrink-0 w-10 h-10 sm:w-14 sm:h-14 rounded-md overflow-hidden bg-muted">
                              <img 
                                src={imageUrl} 
                                alt={item.name} 
                                className="w-full h-full object-cover"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            </div>
                          ) : (
                            <div className="flex-shrink-0 w-10 h-10 sm:w-14 sm:h-14 rounded-md bg-muted flex items-center justify-center">
                              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                            </div>
                          )}
                          
                          {/* Item details - takes remaining space */}
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <p className={`font-medium text-xs sm:text-sm leading-snug sm:leading-relaxed line-clamp-2 ${itemComplete ? 'line-through text-muted-foreground' : ''}`}>
                              {item.name}
                            </p>
                            {item.sku && (
                              <p className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-0.5 truncate">SKU: {item.sku}</p>
                            )}
                            {item.variant_title && (
                              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{item.variant_title}</p>
                            )}
                          </div>
                          
                          {/* Qty Input - Compact on mobile */}
                          <div className="flex-shrink-0 flex items-center gap-1 sm:gap-2">
                            {isUpdating && <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />}
                            <QtyInput
                              value={progress}
                              max={qty}
                              onChange={(newQty) => handleUpdateItemProgress(order.order_id, itemIdx, newQty)}
                              disabled={isUpdating || !hasActiveTimer}
                            />
                            {itemComplete && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />}
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
      </div>

      {/* Action Buttons - Mobile optimized */}
      <div className="p-3 sm:p-4 border-t border-border flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-0">
        <div className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
          Stage: <strong>{batch.current_stage_name}</strong>
        </div>
        
        <div className="flex gap-2">
          {!isLastStage && nextStage && (
            <Button 
              onClick={() => handleMoveStage(nextStage.stage_id)}
              disabled={loading}
              className="gap-1.5 sm:gap-2 flex-1 sm:flex-initial h-9 sm:h-10 text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              <span className="truncate">→ {nextStage.name}</span>
            </Button>
          )}
          
          {isLastStage && (
            <Button 
              onClick={handleComplete}
              disabled={loading}
              className="gap-1.5 sm:gap-2 bg-green-600 hover:bg-green-700 flex-1 sm:flex-initial h-9 sm:h-10 text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span className="truncate">Complete</span>
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
        <AlertDialogContent className="max-w-[90vw] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base sm:text-lg">Remove Order?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Remove order <span className="font-semibold text-foreground">{deleteOrderNumber}</span> from fulfillment?
              <span className="block mt-2 text-xs text-muted-foreground">The original order will not be affected.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={deleting} className="sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteOrder}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto"
            >
              {deleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
