import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, StopCircle, Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { FulfillmentUserStats } from "./FulfillmentUserStats";
import { API } from "@/utils/api";


export function FulfillmentTimerBanner({ onTimerChange }) {
  const [activeTimer, setActiveTimer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkActiveTimer();
    const interval = setInterval(checkActiveTimer, 30000);
    return () => clearInterval(interval);
  }, []);

  async function checkActiveTimer() {
    try {
      const res = await fetch(`${API}/fulfillment/user/active-timer`, { credentials: "include" });
      if (res.ok) {
        const timers = await res.json();
        setActiveTimer(timers.length > 0 ? timers[0] : null);
      }
    } catch (err) {
      console.error("Failed to check timer:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePause() {
    if (!activeTimer) return;
    try {
      const res = await fetch(`${API}/fulfillment/stages/${activeTimer.stage_id}/pause-timer`, {
        method: "POST", credentials: "include"
      });
      if (res.ok) {
        toast.info("Timer paused");
        checkActiveTimer();
        onTimerChange?.();
      }
    } catch (err) {
      toast.error("Failed to pause timer");
    }
  }

  async function handleResume() {
    if (!activeTimer) return;
    try {
      const res = await fetch(`${API}/fulfillment/stages/${activeTimer.stage_id}/resume-timer`, {
        method: "POST", credentials: "include"
      });
      if (res.ok) {
        toast.success("Timer resumed");
        checkActiveTimer();
        onTimerChange?.();
      }
    } catch (err) {
      toast.error("Failed to resume timer");
    }
  }

  async function handleStop() {
    if (!activeTimer) return;
    try {
      const res = await fetch(`${API}/fulfillment/stages/${activeTimer.stage_id}/stop-timer`, {
        method: "POST", credentials: "include"
      });
      if (res.ok) {
        toast.success("Timer stopped");
        setActiveTimer(null);
        onTimerChange?.();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to stop timer");
      }
    } catch (err) {
      toast.error("Failed to stop timer");
    }
  }

  if (loading || !activeTimer) return null;

  const isPaused = activeTimer.is_paused;

  return (
    <div className={`rounded-lg p-4 mb-4 ${isPaused ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-primary/10 border border-primary/30"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isPaused ? "bg-yellow-500/20" : "bg-primary/20"}`}>
            <Clock className={`w-5 h-5 ${isPaused ? "text-yellow-400" : "text-primary animate-pulse"}`} />
          </div>
          <div>
            <div className="text-sm font-medium flex items-center gap-1">
              <span>Fulfillment Timer {isPaused ? "paused" : "active"}:</span>
              <span className={`${isPaused ? "text-yellow-400" : "text-primary"}`}>{activeTimer.stage_name}</span>
              {isPaused && <Badge variant="outline" className="ml-1 text-xs border-yellow-500 text-yellow-400">PAUSED</Badge>}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LiveTimer 
                startedAt={activeTimer.started_at} 
                isPaused={isPaused}
                accumulatedMinutes={activeTimer.accumulated_minutes || 0}
              />
              <span>•</span>
              <span>{activeTimer.orders_processed || 0} orders processed</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPaused ? (
            <Button size="sm" onClick={handleResume} className="gap-1 bg-green-600 hover:bg-green-700" data-testid="resume-fulfillment-timer">
              <Play className="w-4 h-4" /> Resume
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={handlePause} className="gap-1" data-testid="pause-fulfillment-timer">
              <Pause className="w-4 h-4" /> Pause
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={handleStop} className="gap-1" data-testid="stop-fulfillment-timer">
            <StopCircle className="w-4 h-4" /> Stop
          </Button>
        </div>
      </div>
      
      {/* User's Stage KPIs */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground mb-2">Your stats for this stage:</p>
        </div>
        <FulfillmentUserStats stageId={activeTimer.stage_id} stageName={activeTimer.stage_name} />
      </div>
    </div>
  );
}

function LiveTimer({ startedAt, isPaused, accumulatedMinutes }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isPaused) {
      setElapsed(accumulatedMinutes * 60);
      return;
    }

    const start = new Date(startedAt).getTime();
    const accSec = accumulatedMinutes * 60;

    function tick() {
      const now = Date.now();
      const secs = Math.floor((now - start) / 1000) + accSec;
      setElapsed(secs);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isPaused, accumulatedMinutes]);

  const hrs = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;

  const formatted = hrs > 0 
    ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${mins}:${String(secs).padStart(2, '0')}`;

  return <span className="font-mono text-sm text-primary">{formatted}</span>;
}
