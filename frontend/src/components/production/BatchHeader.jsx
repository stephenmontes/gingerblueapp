import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, User } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function BatchHeader({ batch, batchDetails, activeStageId, stageName, stageColor }) {
  const [timerActive, setTimerActive] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [itemsProcessed, setItemsProcessed] = useState(0);

  const totalItems = batchDetails ? batchDetails.total_items : 0;
  const orderCount = batch.order_ids ? batch.order_ids.length : 0;

  useEffect(() => {
    if (activeStageId) {
      checkActiveTimer();
    }
  }, [activeStageId]);

  async function checkActiveTimer() {
    try {
      const res = await fetch(API + "/stages/" + activeStageId + "/active-timer", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setTimerActive(data.active);
        if (data.active) {
          setStartedAt(data.started_at);
        } else {
          setStartedAt(null);
        }
      }
    } catch (err) {
      console.error("Failed to check timer:", err);
    }
  }

  async function handleStartTimer() {
    if (!activeStageId) return;
    try {
      const res = await fetch(API + "/stages/" + activeStageId + "/start-timer", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setTimerActive(true);
        setStartedAt(data.started_at);
        setItemsProcessed(0);
      }
    } catch (err) {
      console.error("Failed to start timer:", err);
    }
  }

  async function handleStopTimer() {
    if (!activeStageId) return;
    try {
      const res = await fetch(
        API + "/stages/" + activeStageId + "/stop-timer?items_processed=" + itemsProcessed,
        {
          method: "POST",
          credentials: "include",
        }
      );
      if (res.ok) {
        setTimerActive(false);
        setStartedAt(null);
      }
    } catch (err) {
      console.error("Failed to stop timer:", err);
    }
  }

  // Update items processed when items are moved
  function incrementItemsProcessed() {
    setItemsProcessed((prev) => prev + 1);
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{batch.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {orderCount} orders • {totalItems} items
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Stage indicator */}
            {activeStageId && (
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: stageColor || "#3B82F6" }}
                />
                <span className="text-sm">{stageName || "Select stage"}</span>
              </div>
            )}
            
            {/* Timer display */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Your Timer</p>
              <div className="font-mono text-2xl font-bold text-primary">
                {timerActive ? <LiveTimer startedAt={startedAt} /> : "00:00:00"}
              </div>
              {timerActive && (
                <Badge variant="secondary" className="text-xs mt-1">
                  {itemsProcessed} items
                </Badge>
              )}
            </div>
            
            {/* Timer controls */}
            {timerActive ? (
              <Button
                onClick={handleStopTimer}
                variant="destructive"
                className="gap-2"
                data-testid="stop-timer-btn"
              >
                <Pause className="w-4 h-4" />
                Stop
              </Button>
            ) : (
              <Button
                onClick={handleStartTimer}
                className="gap-2 bg-green-600 hover:bg-green-700"
                data-testid="start-timer-btn"
                disabled={!activeStageId}
              >
                <Play className="w-4 h-4" />
                Start
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
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
