import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  User, 
  Users, 
  Timer, 
  Package, 
  Store, 
  Truck, 
  Undo2,
  Archive
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { API } from "@/utils/api";

export function FulfillmentBatchCard({ batch, isSelected, onSelect, onRefresh, canDelete, isHistory }) {
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  
  const orderCount = batch.order_ids?.length || batch.order_count || 0;
  const isRunning = batch.timer_active && !batch.timer_paused;
  const activeWorkers = batch.active_workers || [];
  
  // Determine card background color based on store
  const getStoreColor = () => {
    // If history/completed, use muted color
    if (isHistory || batch.status === "completed") {
      return "bg-muted/50 border-muted-foreground/20";
    }
    
    const storeType = batch.store_type;
    
    // ShipStation orders (Etsy) = yellow
    if (storeType === "shipstation" || batch.is_shipstation_batch) {
      return "bg-yellow-500/10 border-yellow-500/30";
    }
    
    // Antique Farmhouse = orange/amber
    if (storeType === "antique_farmhouse") {
      return "bg-orange-500/10 border-orange-500/30";
    }
    
    // GB Decor (retail) with enhanced workflow = light green
    if (storeType === "gb_decor" || batch.is_gb_decor_batch) {
      return "bg-green-500/10 border-green-500/30";
    }
    
    // GB Home (wholesale) = light blue
    if (storeType === "gb_home" || batch.is_gb_home_batch) {
      return "bg-blue-500/10 border-blue-500/30";
    }
    
    // Mixed stores = yellow
    if (storeType === "mixed") {
      return "bg-yellow-500/10 border-yellow-500/30";
    }
    
    // Fallback checks by store name
    if (batch.store_name?.toLowerCase().includes("antique") || batch.store_name?.toLowerCase().includes("farmhouse")) {
      return "bg-orange-500/10 border-orange-500/30";
    }
    
    if (batch.store_name?.toLowerCase().includes("home")) {
      return "bg-blue-500/10 border-blue-500/30";
    }
    
    if (batch.store_name?.toLowerCase().includes("decor")) {
      return "bg-green-500/10 border-green-500/30";
    }
    
    return "";
  };

  const storeColor = getStoreColor();
  
  // Get store display name
  const getStoreDisplay = () => {
    if (batch.store_type === "shipstation" || batch.is_shipstation_batch) {
      return { name: "ShipStation", icon: Truck };
    }
    if (batch.store_type === "antique_farmhouse") {
      return { name: batch.store_name || "Antique Farmhouse", icon: Truck };
    }
    if (batch.store_type === "gb_decor" || batch.is_gb_decor_batch) {
      return { name: batch.store_name || "GB Decor", icon: Store };
    }
    if (batch.store_type === "gb_home" || batch.is_gb_home_batch) {
      return { name: batch.store_name || "GB Home", icon: Store };
    }
    if (batch.store_type === "mixed") {
      return { name: "Mixed", icon: Store };
    }
    return { name: batch.store_name || "Store", icon: Store };
  };
  
  const storeDisplay = getStoreDisplay();
  const StoreIcon = storeDisplay.icon;

  // Calculate progress if available
  const completedOrders = batch.orders_completed || 0;
  const progress = orderCount > 0 ? (completedOrders / orderCount) * 100 : 0;

  // Handle undo batch - uses the production batch endpoint which handles both
  const handleUndo = async (removeFrames) => {
    // Use production_batch_id to delete (which also removes the fulfillment batch)
    const batchId = batch.production_batch_id;
    
    if (!batchId) {
      toast.error("Cannot undo: No linked production batch found");
      return;
    }
    
    setUndoing(true);
    try {
      const url = `${API}/batches/${batchId}?remove_frames=${removeFrames}`;
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (res.ok) {
        if (removeFrames) {
          toast.success("Batch undone - orders returned and frames removed from all stages");
        } else {
          toast.success("Batch undone - orders returned, frames remain in production queue");
        }
        setUndoDialogOpen(false);
        if (onRefresh) onRefresh();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to undo batch");
      }
    } catch (err) {
      toast.error("Failed to undo batch");
    } finally {
      setUndoing(false);
    }
  };

  const handleUndoClick = (e) => {
    e.stopPropagation();
    setUndoDialogOpen(true);
  };

  const handleArchiveClick = (e) => {
    e.stopPropagation();
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const res = await fetch(
        `${API}/fulfillment-batches/${batch.fulfillment_batch_id}/archive`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      
      if (res.ok) {
        toast.success(`Batch "${batch.name}" archived`);
        setArchiveDialogOpen(false);
        if (onRefresh) onRefresh();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to archive batch");
      }
    } catch (err) {
      toast.error("Failed to archive batch");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <Card
      className={`cursor-pointer transition-all ${storeColor} ${isSelected ? "ring-2 ring-primary" : "hover:border-primary/50"}`}
      onClick={() => onSelect(batch)}
      data-testid={`fulfillment-batch-card-${batch.batch_id || batch.fulfillment_batch_id}`}
    >
      <CardContent className="p-3 sm:p-4">
        {/* Header - Mobile optimized */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold truncate text-sm sm:text-base">{batch.name}</h3>
          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
            <Badge variant="outline" className="text-[10px] sm:text-xs flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2">
              <StoreIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span className="hidden xs:inline">{storeDisplay.name}</span>
            </Badge>
            {(isHistory || batch.status === "completed") && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] sm:text-xs px-1.5">
                Done
              </Badge>
            )}
            {isRunning && !isHistory && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] sm:text-xs px-1.5">
                <Timer className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5" />
                <span className="hidden xs:inline">Running</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Stats Row - Compact on mobile */}
        <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">
          <span className="flex items-center gap-1">
            <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {orderCount}
          </span>
          {/* Shipping Progress - show remaining orders to ship */}
          {batch.orders_remaining > 0 && batch.shipped_count >= 0 && (
            <span className="flex items-center gap-1 text-blue-400" title={`${batch.shipped_count}/${batch.total_orders} shipped`}>
              <Truck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {batch.orders_remaining} left
            </span>
          )}
          {batch.orders_remaining === 0 && batch.total_orders > 0 && (
            <span className="flex items-center gap-1 text-green-400">
              <Truck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              All shipped
            </span>
          )}
          {activeWorkers.length > 0 ? (
            <span className="flex items-center gap-1 text-green-400">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {activeWorkers.length}
            </span>
          ) : batch.assigned_name && (
            <span className="flex items-center gap-1 truncate">
              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="truncate">{batch.assigned_name}</span>
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <Progress value={progress} className="h-1.5 sm:h-2" />
          <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
            <span>{completedOrders}/{orderCount}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Current Stage / Completion Info */}
        {batch.current_stage_name && (
          <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
            <span className="text-[10px] sm:text-xs text-muted-foreground truncate">
              {isHistory || batch.status === "completed" ? (
                <>Done: <strong>{batch.time_completed ? new Date(batch.time_completed).toLocaleDateString() : 'N/A'}</strong></>
              ) : (
                <><span className="hidden sm:inline">Stage: </span><strong>{batch.current_stage_name}</strong></>
              )}
            </span>
            
            {/* Action Buttons - Admin/Manager only, not for history */}
            {canDelete && !isHistory && batch.status !== "completed" && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 sm:h-7 px-1.5 sm:px-2 text-muted-foreground hover:text-orange-400"
                  onClick={handleArchiveClick}
                  data-testid={`archive-batch-${batch.fulfillment_batch_id}`}
                  title="Archive batch"
                >
                  <Archive className="w-3 h-3 mr-0.5 sm:mr-1" />
                  <span className="hidden sm:inline">Archive</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 sm:h-7 px-1.5 sm:px-2 text-muted-foreground hover:text-red-400"
                  onClick={handleUndoClick}
                  data-testid={`undo-batch-${batch.fulfillment_batch_id}`}
                  title="Undo batch"
                >
                  <Undo2 className="w-3 h-3 mr-0.5 sm:mr-1" />
                  <span className="hidden sm:inline">Undo</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Undo Dialog */}
        <Dialog open={undoDialogOpen} onOpenChange={setUndoDialogOpen}>
          <DialogContent onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>Undo Batch: {batch.name}</DialogTitle>
              <DialogDescription>
                This will return all {orderCount} orders back to the Orders page and remove the batch from both Frame Production and Order Fulfillment.
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4 space-y-3">
              <p className="text-sm font-medium">What should happen to frames in production?</p>
              
              <Button
                variant="outline"
                className="w-full justify-start text-left h-auto py-3 px-4"
                onClick={() => handleUndo(true)}
                disabled={undoing}
              >
                <div>
                  <p className="font-medium text-red-400">Remove all frames</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Delete frames from all production stages. Orders return to Orders page.
                  </p>
                </div>
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start text-left h-auto py-3 px-4"
                onClick={() => handleUndo(false)}
                disabled={undoing}
              >
                <div>
                  <p className="font-medium text-blue-400">Keep frames in queue</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Frames remain in their current production stages. Orders return to Orders page.
                  </p>
                </div>
              </Button>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setUndoDialogOpen(false)} disabled={undoing}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
