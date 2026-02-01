import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, StopCircle, Play, Pause } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
            <p className="text-sm font-medium">
              Fulfillment Timer {isPaused ? "paused" : "active"}: 
              <span className={`ml-1 ${isPaused ? "text-yellow-400" : "text-primary"}`}>{activeTimer.stage_name}</span>
              {isPaused && <Badge variant="outline" className="ml-2 text-xs border-yellow-500 text-yellow-400">PAUSED</Badge>}
            </p>
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
            <Button size="sm" onClick={handleResume} className="gap-1 bg-green-600 hover:bg-green-700">
              <Play className="w-4 h-4" /> Resume
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={handlePause} className="gap-1">
              <Pause className="w-4 h-4" /> Pause
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={handleStop} className="gap-1">
            <StopCircle className="w-4 h-4" /> Stop
          </Button>
        </div>
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
