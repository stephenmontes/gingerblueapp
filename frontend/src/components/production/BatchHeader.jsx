import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Square, Clock, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";
import { ProductionBatchReportDialog } from "./ProductionBatchReportDialog";


export function BatchHeader({ batch, batchDetails, activeStageId, stageName, stageColor, onTimerChange, activeTimer }) {
  const [showReport, setShowReport] = useState(false);
  const totalItems = batchDetails ? batchDetails.total_items : 0;
  const orderCount = batch.order_ids ? batch.order_ids.length : 0;

  // Check if user has active timer for THIS stage
  const hasTimerForThisStage = activeTimer && activeTimer.stage_id === activeStageId;
  const hasTimerForOtherStage = activeTimer && activeTimer.stage_id !== activeStageId;
  const isPaused = activeTimer && activeTimer.is_paused;

  async function handleStartTimer() {
    if (!activeStageId) return;
    
    try {
      const res = await fetch(API + "/stages/" + activeStageId + "/start-timer", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Timer started for " + stageName);
        if (onTimerChange) onTimerChange();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to start timer");
      }
    } catch (err) {
      toast.error("Failed to start timer");
    }
  }

  async function handlePauseTimer() {
    if (!activeStageId) return;
    
    try {
      const res = await fetch(API + "/stages/" + activeStageId + "/pause-timer", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.info("Timer paused");
        if (onTimerChange) onTimerChange();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to pause timer");
      }
    } catch (err) {
      toast.error("Failed to pause timer");
    }
  }

  async function handleResumeTimer() {
    if (!activeStageId) return;
    
    try {
      const res = await fetch(API + "/stages/" + activeStageId + "/resume-timer", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Timer resumed");
        if (onTimerChange) onTimerChange();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to resume timer");
      }
    } catch (err) {
      toast.error("Failed to resume timer");
    }
  }

  async function handleStopTimer() {
    if (!activeStageId) return;
    
    try {
      const res = await fetch(API + "/stages/" + activeStageId + "/stop-timer?items_processed=0", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(`Timer stopped - ${result.duration_minutes} minutes logged`);
        if (onTimerChange) onTimerChange();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to stop timer");
      }
    } catch (err) {
      toast.error("Failed to stop timer");
    }
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
            {/* Report Button */}
            <Button
              variant="outline"
              onClick={() => setShowReport(true)}
              className="gap-2"
              data-testid="batch-report-btn"
            >
              <BarChart3 className="w-4 h-4" />
              Report
            </Button>

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
              <p className="text-xs text-muted-foreground mb-1">
                Your Timer {isPaused && <Badge variant="outline" className="ml-1 text-xs">PAUSED</Badge>}
              </p>
              <div className={`font-mono text-2xl font-bold ${isPaused ? "text-yellow-400" : "text-primary"}`}>
                {hasTimerForThisStage ? (
                  <LiveTimer 
                    startedAt={activeTimer.started_at} 
                    isPaused={isPaused}
                    accumulatedMinutes={activeTimer.accumulated_minutes || 0}
                  />
                ) : (
                  "00:00:00"
                )}
              </div>
            </div>
            
            {/* Timer controls */}
            {hasTimerForThisStage ? (
              <div className="flex items-center gap-2">
                {isPaused ? (
                  <Button
                    onClick={handleResumeTimer}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                    data-testid="resume-timer-btn"
                  >
                    <Play className="w-4 h-4" />
                    Resume
                  </Button>
                ) : (
                  <Button
                    onClick={handlePauseTimer}
                    variant="secondary"
                    className="gap-2"
                    data-testid="pause-timer-btn"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </Button>
                )}
                <Button
                  onClick={handleStopTimer}
                  variant="destructive"
                  className="gap-2"
                  data-testid="stop-timer-btn"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </Button>
              </div>
            ) : hasTimerForOtherStage ? (
              <div className="text-sm text-orange-400 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Timer active on {activeTimer.stage_name}
              </div>
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

function LiveTimer({ startedAt, isPaused, accumulatedMinutes }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Convert accumulated minutes to seconds
    const accumulatedSeconds = Math.floor(accumulatedMinutes * 60);
    
    if (isPaused) {
      // If paused, just show accumulated time
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
  return <span>{formatted}</span>;
}
