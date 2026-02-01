import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Pause, Play, StopCircle, FileText } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function MyTimerControls({ activeTimer, onTimerChange, onOpenWorksheet }) {
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeTimer || activeTimer.is_paused) {
      setElapsed(Math.floor((activeTimer?.accumulated_minutes || 0) * 60));
      return;
    }

    const start = new Date(activeTimer.started_at).getTime();
    const accSec = Math.floor((activeTimer.accumulated_minutes || 0) * 60);

    function tick() {
      const now = Date.now();
      const secs = Math.floor((now - start) / 1000) + accSec;
      setElapsed(secs);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  if (!activeTimer) return null;

  const isPaused = activeTimer.is_paused;
  const hrs = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  const timeStr = hrs > 0 
    ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${mins}:${String(secs).padStart(2, '0')}`;

  async function handlePause() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/fulfillment/stages/${activeTimer.stage_id}/pause-timer`, {
        method: "POST", credentials: "include"
      });
      if (res.ok) {
        toast.info("Timer paused");
        onTimerChange?.();
      }
    } catch (err) {
      toast.error("Failed to pause timer");
    } finally {
      setLoading(false);
    }
  }

  async function handleResume() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/fulfillment/stages/${activeTimer.stage_id}/resume-timer`, {
        method: "POST", credentials: "include"
      });
      if (res.ok) {
        toast.success("Timer resumed");
        onTimerChange?.();
      }
    } catch (err) {
      toast.error("Failed to resume timer");
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/fulfillment/stages/${activeTimer.stage_id}/stop-timer?orders_processed=1&items_processed=0`, {
        method: "POST", credentials: "include"
      });
      if (res.ok) {
        toast.success("Timer stopped");
        onTimerChange?.();
      }
    } catch (err) {
      toast.error("Failed to stop timer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`p-4 rounded-lg mb-4 ${isPaused ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-primary/10 border border-primary/30"}`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isPaused ? "bg-yellow-500/20" : "bg-primary/20"}`}>
            <Clock className={`w-5 h-5 ${isPaused ? "text-yellow-400" : "text-primary animate-pulse"}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Your Active Timer</span>
              {isPaused && <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-400">PAUSED</Badge>}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{activeTimer.stage_name}</span>
              {activeTimer.order_number && (
                <>
                  <span>•</span>
                  <Badge variant="secondary" className="text-xs font-mono">#{activeTimer.order_number}</Badge>
                </>
              )}
              <span>•</span>
              <span className="font-mono text-primary font-medium">{timeStr}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {activeTimer.order_id && onOpenWorksheet && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onOpenWorksheet(activeTimer.order_id)}
              className="gap-1"
              data-testid="open-worksheet-btn"
            >
              <FileText className="w-4 h-4" /> Open Worksheet
            </Button>
          )}
          {isPaused ? (
            <Button 
              size="sm" 
              onClick={handleResume} 
              disabled={loading}
              className="gap-1 bg-green-600 hover:bg-green-700"
              data-testid="resume-timer-btn"
            >
              <Play className="w-4 h-4" /> Resume
            </Button>
          ) : (
            <Button 
              size="sm" 
              variant="secondary" 
              onClick={handlePause}
              disabled={loading}
              className="gap-1"
              data-testid="pause-timer-btn"
            >
              <Pause className="w-4 h-4" /> Pause
            </Button>
          )}
          <Button 
            size="sm" 
            variant="destructive" 
            onClick={handleStop}
            disabled={loading}
            className="gap-1"
            data-testid="stop-timer-btn"
          >
            <StopCircle className="w-4 h-4" /> Stop
          </Button>
        </div>
      </div>
    </div>
  );
}
