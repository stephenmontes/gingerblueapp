import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause } from "lucide-react";
import { API } from "@/utils/api";


export function StageTimer({ stageId, stageName, stageColor }) {
  const [timerActive, setTimerActive] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [itemsProcessed, setItemsProcessed] = useState(0);
  const [loading, setLoading] = useState(true);

  const checkActiveTimer = useCallback(async () => {
    try {
      const res = await fetch(API + "/stages/" + stageId + "/active-timer", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setTimerActive(data.active);
        if (data.active) {
          setStartedAt(data.started_at);
        }
      }
    } catch (err) {
      console.error("Failed to check timer:", err);
    } finally {
      setLoading(false);
    }
  }, [stageId]);

  useEffect(() => {
    checkActiveTimer();
  }, [checkActiveTimer]);

  async function handleStartTimer() {
    try {
      const res = await fetch(API + "/stages/" + stageId + "/start-timer", {
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
    try {
      const res = await fetch(
        API + "/stages/" + stageId + "/stop-timer?items_processed=" + itemsProcessed,
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

  if (loading) {
    return <div className="h-10 w-32 bg-muted animate-pulse rounded" />;
  }

  return (
    <Card className="bg-card/50 border-border">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: stageColor }}
          />
          <div className="flex-1">
            <p className="text-sm font-medium">{stageName}</p>
            {timerActive && (
              <div className="flex items-center gap-2 mt-1">
                <LiveTimer startedAt={startedAt} />
                <Badge variant="secondary" className="text-xs">
                  {itemsProcessed} items
                </Badge>
              </div>
            )}
          </div>
          {timerActive ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleStopTimer}
              data-testid={`stop-timer-${stageId}`}
            >
              <Pause className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={handleStartTimer}
              data-testid={`start-timer-${stageId}`}
            >
              <Play className="w-4 h-4" />
            </Button>
          )}
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
  return <span className="font-mono text-sm text-primary">{formatted}</span>;
}
