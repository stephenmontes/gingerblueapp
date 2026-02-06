import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Play, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";


export function TimerRecoveryDialog({ onTimerRestored }) {
  const [savedTimers, setSavedTimers] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkSavedTimers();
  }, []);

  async function checkSavedTimers() {
    try {
      const res = await fetch(`${API}/timer-recovery/check`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        if (data.has_saved_timers) {
          setSavedTimers(data);
          setIsOpen(true);
        }
      }
    } catch (err) {
      console.error("Failed to check saved timers:", err);
    }
  }

  async function handleRestore(saveId, workflowType) {
    setLoading(true);
    try {
      const res = await fetch(`${API}/timer-recovery/restore/${saveId}`, {
        method: "POST",
        credentials: "include"
      });
      
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        
        // Remove the restored timer from state
        setSavedTimers(prev => {
          if (!prev) return null;
          const updated = { ...prev };
          if (workflowType === "production") {
            updated.production_timer = null;
          } else {
            updated.fulfillment_timer = null;
          }
          updated.has_saved_timers = !!(updated.production_timer || updated.fulfillment_timer);
          return updated;
        });
        
        onTimerRestored?.(workflowType);
        
        // Close dialog if no more timers
        if (!savedTimers?.production_timer && !savedTimers?.fulfillment_timer) {
          setIsOpen(false);
        }
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to restore timer");
      }
    } catch (err) {
      toast.error("Failed to restore timer");
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscard(saveId, workflowType) {
    setLoading(true);
    try {
      const res = await fetch(`${API}/timer-recovery/discard/${saveId}`, {
        method: "POST",
        credentials: "include"
      });
      
      if (res.ok) {
        toast.info("Saved timer discarded");
        
        setSavedTimers(prev => {
          if (!prev) return null;
          const updated = { ...prev };
          if (workflowType === "production") {
            updated.production_timer = null;
          } else {
            updated.fulfillment_timer = null;
          }
          updated.has_saved_timers = !!(updated.production_timer || updated.fulfillment_timer);
          return updated;
        });
        
        if (!savedTimers?.production_timer && !savedTimers?.fulfillment_timer) {
          setIsOpen(false);
        }
      }
    } catch (err) {
      toast.error("Failed to discard timer");
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscardAll() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/timer-recovery/discard-all`, {
        method: "POST",
        credentials: "include"
      });
      
      if (res.ok) {
        toast.info("All saved timers discarded");
        setSavedTimers(null);
        setIsOpen(false);
      }
    } catch (err) {
      toast.error("Failed to discard timers");
    } finally {
      setLoading(false);
    }
  }

  function formatTime(minutes) {
    if (!minutes) return "0m";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function formatDate(isoStr) {
    if (!isoStr) return "";
    try {
      return new Date(isoStr).toLocaleString();
    } catch {
      return isoStr;
    }
  }

  if (!savedTimers?.has_saved_timers) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent className="max-w-lg" data-testid="timer-recovery-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            Resume Your Timers?
          </AlertDialogTitle>
          <AlertDialogDescription>
            You have saved timer sessions from before. Would you like to resume them?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 my-4">
          {savedTimers.production_timer && (
            <TimerCard
              title="Production Timer"
              timer={savedTimers.production_timer}
              workflowType="production"
              onRestore={handleRestore}
              onDiscard={handleDiscard}
              loading={loading}
              formatTime={formatTime}
              formatDate={formatDate}
            />
          )}
          
          {savedTimers.fulfillment_timer && (
            <TimerCard
              title="Fulfillment Timer"
              timer={savedTimers.fulfillment_timer}
              workflowType="fulfillment"
              onRestore={handleRestore}
              onDiscard={handleDiscard}
              loading={loading}
              formatTime={formatTime}
              formatDate={formatDate}
            />
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDiscardAll} disabled={loading}>
            Discard All
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


function TimerCard({ title, timer, workflowType, onRestore, onDiscard, loading, formatTime, formatDate }) {
  return (
    <div className="p-4 bg-muted/30 rounded-lg border border-border">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold">{title}</h4>
        <Badge variant="outline">{timer.stage_name}</Badge>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Time Accumulated:</span>
          <span className="font-mono font-bold text-primary">{formatTime(timer.elapsed_minutes)}</span>
        </div>
        {timer.batch_name && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Batch:</span>
            <span>{timer.batch_name}</span>
          </div>
        )}
        {timer.items_processed > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Items Processed:</span>
            <span>{timer.items_processed}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Saved:</span>
          <span className="text-xs">{formatDate(timer.saved_at)}</span>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Button
          onClick={() => onRestore(timer.save_id, workflowType)}
          disabled={loading}
          className="flex-1 gap-2"
          data-testid={`restore-${workflowType}-timer`}
        >
          <Play className="w-4 h-4" />
          Resume Timer
        </Button>
        <Button
          variant="outline"
          onClick={() => onDiscard(timer.save_id, workflowType)}
          disabled={loading}
          data-testid={`discard-${workflowType}-timer`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
