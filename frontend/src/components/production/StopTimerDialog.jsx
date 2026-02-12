import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";

export function StopTimerDialog({ isOpen, onClose, activeTimer, onTimerStopped }) {
  const [itemsProcessed, setItemsProcessed] = useState("");
  const [loading, setLoading] = useState(false);

  const handleStop = async () => {
    const qty = parseInt(itemsProcessed) || 0;
    
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/stages/${activeTimer.stage_id}/stop-timer?items_processed=${qty}`,
        { method: "POST", credentials: "include" }
      );
      
      if (res.ok) {
        const result = await res.json();
        const durationMins = result.duration_minutes || 0;
        const hours = Math.floor(durationMins / 60);
        const mins = Math.round(durationMins % 60);
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        
        toast.success(
          qty > 0 
            ? `Timer stopped: ${timeStr} • ${qty} frames recorded`
            : `Timer stopped: ${timeStr}`
        );
        
        setItemsProcessed("");
        onClose();
        if (onTimerStopped) onTimerStopped();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to stop timer");
      }
    } catch (err) {
      toast.error("Failed to stop timer");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleStop();
    }
  };

  if (!activeTimer) return null;

  const stageName = activeTimer.stage_name || "this stage";
  
  // Generate appropriate label based on stage
  const getItemLabel = () => {
    const name = stageName.toLowerCase();
    if (name.includes("cut")) return "frames cut";
    if (name.includes("sand")) return "frames sanded";
    if (name.includes("assembl")) return "frames assembled";
    if (name.includes("paint")) return "frames painted";
    if (name.includes("quality") || name.includes("qc")) return "frames inspected";
    return "items completed";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Square className="w-5 h-5 text-destructive" />
            Stop Timer - {stageName}
          </DialogTitle>
          <DialogDescription>
            Enter the number of {getItemLabel()} during this session for productivity tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="items-processed">
              How many {getItemLabel()}?
            </Label>
            <Input
              id="items-processed"
              type="number"
              min="0"
              value={itemsProcessed}
              onChange={(e) => setItemsProcessed(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter quantity (0 if none)"
              className="text-lg"
              autoFocus
              data-testid="stop-timer-items-input"
            />
            <p className="text-xs text-muted-foreground">
              This helps track your productivity (items per hour) in reports.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleStop} 
            disabled={loading}
            className="gap-2"
            data-testid="confirm-stop-timer-btn"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Stop Timer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
