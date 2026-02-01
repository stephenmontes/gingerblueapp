import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, StopCircle, Play, Pause } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function ActiveTimerBanner({ onTimerChange }) {
  const [activeTimer, setActiveTimer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkActiveTimer();
    const interval = setInterval(checkActiveTimer, 30000);
    return () => clearInterval(interval);
  }, []);

  async function checkActiveTimer() {
    try {
      const res = await fetch(API + "/user/active-timers", {
        credentials: "include",
      });
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

  async function handlePauseTimer() {
    if (!activeTimer) return;
    try {
      const res = await fetch(
        API + "/stages/" + activeTimer.stage_id + "/pause-timer",
        { method: "POST", credentials: "include" }
      );
      if (res.ok) {
        toast.info("Timer paused");
        checkActiveTimer();
        if (onTimerChange) onTimerChange();
      }
    } catch (err) {
      toast.error("Failed to pause timer");
    }
  }

  async function handleResumeTimer() {
    if (!activeTimer) return;
    try {
      const res = await fetch(
        API + "/stages/" + activeTimer.stage_id + "/resume-timer",
        { method: "POST", credentials: "include" }
      );
      if (res.ok) {
        toast.success("Timer resumed");
        checkActiveTimer();
        if (onTimerChange) onTimerChange();
      }
    } catch (err) {
      toast.error("Failed to resume timer");
    }
  }

  async function handleStopTimer() {
    if (!activeTimer) return;
    try {
      const res = await fetch(
        API + "/stages/" + activeTimer.stage_id + "/stop-timer?items_processed=0",
        { method: "POST", credentials: "include" }
      );
      if (res.ok) {
        toast.success("Timer stopped");
        setActiveTimer(null);
        if (onTimerChange) onTimerChange();
      }
    } catch (err) {
      toast.error("Failed to stop timer");
    }
  }

  if (loading || !activeTimer) return null;

  const isPaused = activeTimer.is_paused;

  return (
    <div className={`rounded-lg p-3 mb-4 flex items-center justify-between ${isPaused ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-primary/10 border border-primary/30"}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isPaused ? "bg-yellow-500/20" : "bg-primary/20"}`}>
          <Clock className={`w-4 h-4 ${isPaused ? "text-yellow-400" : "text-primary animate-pulse"}`} />
        </div>
        <div>
          <p className="text-sm font-medium">
            Timer {isPaused ? "paused" : "active"}: <span className={isPaused ? "text-yellow-400" : "text-primary"}>{activeTimer.stage_name}</span>
            {isPaused && <Badge variant="outline" className="ml-2 text-xs border-yellow-500 text-yellow-400">PAUSED</Badge>}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LiveTimer 
              startedAt={activeTimer.started_at} 
              isPaused={isPaused}
              accumulatedMinutes={activeTimer.accumulated_minutes || 0}
            />
            <span>•</span>
            <span>{activeTimer.items_processed} items processed</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isPaused ? (
          <Button
            size="sm"
            onClick={handleResumeTimer}
            className="gap-1 bg-green-600 hover:bg-green-700"
            data-testid="resume-active-timer"
          >
            <Play className="w-4 h-4" />
            Resume
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={handlePauseTimer}
            className="gap-1"
            data-testid="pause-active-timer"
          >
            <Pause className="w-4 h-4" />
            Pause
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          onClick={handleStopTimer}
          className="gap-1"
          data-testid="stop-active-timer"
        >
          <StopCircle className="w-4 h-4" />
          Stop
        </Button>
      </div>
    </div>
  );
}

function LiveTimer({ startedAt, isPaused, accumulatedMinutes }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const accumulatedSeconds = Math.floor(accumulatedMinutes * 60);
    
    if (isPaused) {
      setElapsed(accumulatedSeconds);
      return;
    }

    if (!startedAt) return;
    const startTime = new Date(startedAt).getTime();

    function updateElapsed() {
      const now = Date.now();
      const currentSession = Math.floor((now - startTime) / 1000);
      setElapsed(accumulatedSeconds + currentSession);
    }

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isPaused, accumulatedMinutes]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const formatted = [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  
  return <span className="font-mono">{formatted}</span>;
}
