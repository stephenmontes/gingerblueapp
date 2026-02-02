import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { User, Timer, Archive, RotateCcw, CheckCircle, Undo2 } from "lucide-react";
import { toast } from "sonner";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function BatchCard({ batch, isSelected, onSelect, onRefresh, isArchived }) {
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const totalItems = batch.total_items || 0;
  const itemsCompleted = batch.items_completed || 0;
  const progress = totalItems > 0 ? (itemsCompleted / totalItems) * 100 : 0;
  const isRunning = batch.time_started && !batch.time_completed;
  const orderCount = batch.order_ids ? batch.order_ids.length : 0;
  
  // Check if production has started (any items completed)
  const productionStarted = itemsCompleted > 0;

  const handleArchive = async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API}/batches/${batch.batch_id}/archive`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Batch archived successfully");
        if (onRefresh) onRefresh();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to archive batch");
      }
    } catch (err) {
      toast.error("Failed to archive batch");
    }
  };

  const handleRestore = async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API}/batches/${batch.batch_id}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Batch restored successfully");
        if (onRefresh) onRefresh();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to restore batch");
      }
    } catch (err) {
      toast.error("Failed to restore batch");
    }
  };

  const handleUndo = async (removeFrames) => {
    try {
      const url = `${API}/batches/${batch.batch_id}?remove_frames=${removeFrames}`;
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
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
    }
  };
        setUndoDialogOpen(false);
        if (onRefresh) onRefresh();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to undo batch");
      }
    } catch (err) {
      toast.error("Failed to undo batch");
    }
  };

  // Show final stats for archived batches
  const finalStats = batch.final_stats;

  return (
    <Card
      className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary" : "hover:border-primary/50"} ${isArchived ? "opacity-80" : ""}`}
      onClick={() => onSelect(batch)}
      data-testid={`batch-card-${batch.batch_id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">{batch.name}</h3>
          <Badge 
            variant="outline" 
            className={isArchived ? "text-muted-foreground border-muted-foreground" : "text-green-400 border-green-400/30"}
          >
            {isArchived ? "Archived" : "Active"}
          </Badge>
        </div>
        
        <div className="text-sm text-muted-foreground mb-2">
          {orderCount} orders • {totalItems} items
        </div>
        
        {batch.assigned_name && (
          <div className="text-sm mb-2 flex items-center gap-1">
            <User className="w-4 h-4 text-primary" />
            {batch.assigned_name}
          </div>
        )}
        
        {isRunning && !isArchived && (
          <div className="text-sm text-green-400 mb-2 flex items-center gap-1">
            <Timer className="w-4 h-4 animate-pulse" />
            Timer running
          </div>
        )}

        {/* Show final stats for archived batches */}
        {isArchived && finalStats && (
          <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
            <div className="bg-muted/30 rounded p-1.5 text-center">
              <p className="font-bold text-green-400">{finalStats.good_frames}</p>
              <p className="text-muted-foreground">Good</p>
            </div>
            <div className="bg-muted/30 rounded p-1.5 text-center">
              <p className="font-bold text-red-400">{finalStats.total_rejected}</p>
              <p className="text-muted-foreground">Rejected</p>
            </div>
            <div className="bg-muted/30 rounded p-1.5 text-center">
              <p className="font-bold">{finalStats.total_completed}</p>
              <p className="text-muted-foreground">Total</p>
            </div>
          </div>
        )}

        {!isArchived && (
          <>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right mt-1">
              {itemsCompleted}/{totalItems}
            </p>
          </>
        )}

        {/* Archive date */}
        {isArchived && batch.archived_at && (
          <p className="text-xs text-muted-foreground mt-2">
            Archived: {new Date(batch.archived_at).toLocaleDateString()}
          </p>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          {isArchived ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              onClick={handleRestore}
              data-testid={`restore-batch-${batch.batch_id}`}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Restore
            </Button>
          ) : (
            <>
              {/* Undo button - only show if production hasn't started */}
              {!productionStarted && (
                <AlertDialog open={undoDialogOpen} onOpenChange={setUndoDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs text-orange-400 border-orange-400/30 hover:bg-orange-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUndoDialogOpen(true);
                      }}
                      data-testid={`undo-batch-${batch.batch_id}`}
                    >
                      <Undo2 className="w-3 h-3 mr-1" />
                      Undo
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Undo Batch</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will return all {orderCount} orders back to the Orders page and delete this batch. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleUndo}
                        className="bg-orange-600 hover:bg-orange-700"
                      >
                        Undo Batch
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button
                size="sm"
                variant="outline"
                className={`${productionStarted ? 'w-full' : 'flex-1'} text-xs`}
                onClick={handleArchive}
                data-testid={`archive-batch-${batch.batch_id}`}
              >
                <Archive className="w-3 h-3 mr-1" />
                Archive
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
