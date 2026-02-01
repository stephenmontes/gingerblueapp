import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause } from "lucide-react";

export function BatchHeader({ batch, batchDetails, onStartTimer, onStopTimer }) {
  const isTimerRunning = batchDetails && batchDetails.time_started && !batchDetails.time_completed;
  const totalItems = batchDetails ? batchDetails.total_items : 0;
  const orderCount = batch.order_ids ? batch.order_ids.length : 0;
  const assignedName = batchDetails ? batchDetails.assigned_name : null;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{batch.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {orderCount} orders • {totalItems} items
              {assignedName && ` • Assigned: ${assignedName}`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <TimerDisplay isRunning={isTimerRunning} startedAt={batchDetails?.time_started} />
            <TimerControls
              isRunning={isTimerRunning}
              onStart={onStartTimer}
              onStop={onStopTimer}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimerDisplay({ isRunning, startedAt }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground mb-1">Timer</p>
      <div className="font-mono text-2xl font-bold text-primary">
        {isRunning ? <LiveTimer startedAt={startedAt} /> : "00:00:00"}
      </div>
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
  return <span>{formatted}</span>;
}

function TimerControls({ isRunning, onStart, onStop }) {
  if (isRunning) {
    return (
      <Button
        onClick={onStop}
        variant="destructive"
        className="gap-2"
        data-testid="stop-timer-btn"
      >
        <Pause className="w-4 h-4" />
        Stop
      </Button>
    );
  }

  return (
    <Button
      onClick={onStart}
      className="gap-2 bg-green-600 hover:bg-green-700"
      data-testid="start-timer-btn"
    >
      <Play className="w-4 h-4" />
      Start
    </Button>
  );
}
