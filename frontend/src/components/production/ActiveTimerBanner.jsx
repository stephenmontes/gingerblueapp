import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock, StopCircle } from "lucide-react";
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

  return (
    <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Clock className="w-4 h-4 text-primary animate-pulse" />
        </div>
        <div>
          <p className="text-sm font-medium">
            Timer active: <span className="text-primary">{activeTimer.stage_name}</span>
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LiveTimer startedAt={activeTimer.started_at} />
            <span>•</span>
            <span>{activeTimer.items_processed} items processed</span>
          </div>
        </div>
      </div>
      <Button
        size="sm"
        variant="destructive"
        onClick={handleStopTimer}
        className="gap-1"
        data-testid="stop-active-timer"
      >
        <StopCircle className="w-4 h-4" />
        Stop Timer
      </Button>
    </div>
  );
}

function LiveTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const startTime = new Date(startedAt).getTime();

    function updateElapsed() {
      const now = Date.now();
      setElapsed(Math.floor((now - startTime) / 1000));
    }

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const formatted = [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  
  return <span className="font-mono">{formatted}</span>;
}
