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
      // Include batch_id so timer can track qty changes
      const url = batch?.batch_id 
        ? `${API}/stages/${activeStageId}/start-timer?batch_id=${batch.batch_id}`
        : `${API}/stages/${activeStageId}/start-timer`;
        
      const res = await fetch(url, {
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
      const res = await fetch(API + "/stages/" + activeStageId + "/stop-timer", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
        const items = result.items_processed || 0;
        const mins = Math.round(result.duration_minutes);
        toast.success(
          items > 0 
            ? `Timer stopped: ${mins}m • ${items} frames recorded`
            : `Timer stopped: ${mins} minutes logged`
        );
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
    <Card className="bg-card border-border overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        {/* Mobile: Stack vertically, Desktop: Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          {/* Batch Info */}
          <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold truncate">{batch.name}</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {orderCount} orders • {totalItems} items
              </p>
            </div>
            {/* Report Button - visible on mobile */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReport(true)}
              className="gap-1.5 h-8 px-2 sm:hidden flex-shrink-0"
              data-testid="batch-report-btn-mobile"
            >
              <BarChart3 className="w-4 h-4" />
            </Button>
          </div>

          {/* Timer and Controls Row */}
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap sm:flex-nowrap">
            {/* Report Button - hidden on mobile */}
            <Button
              variant="outline"
              onClick={() => setShowReport(true)}
              className="gap-2 hidden sm:flex"
              data-testid="batch-report-btn"
            >
              <BarChart3 className="w-4 h-4" />
              Report
            </Button>

            {/* Stage indicator */}
            {activeStageId && (
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                <div
                  className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stageColor || "#3B82F6" }}
                />
                <span className="text-xs sm:text-sm truncate max-w-[80px] sm:max-w-none">{stageName || "Select stage"}</span>
              </div>
            )}
            
            {/* Timer display */}
            <div className="text-center flex-shrink-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1 flex items-center gap-1">
                Timer {isPaused && <Badge variant="outline" className="text-[10px] px-1 py-0">PAUSED</Badge>}
              </p>
              <div className={`font-mono text-lg sm:text-2xl font-bold ${isPaused ? "text-yellow-400" : "text-primary"}`}>
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
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {hasTimerForThisStage ? (
                <>
                  {isPaused ? (
                    <Button
                      onClick={handleResumeTimer}
                      size="sm"
                      className="gap-1.5 bg-green-600 hover:bg-green-700 h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm"
                      data-testid="resume-timer-btn"
                    >
                      <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden xs:inline">Resume</span>
                    </Button>
                  ) : (
                    <Button
                      onClick={handlePauseTimer}
                      variant="secondary"
                      size="sm"
                      className="gap-1.5 h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm"
                      data-testid="pause-timer-btn"
                    >
                      <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden xs:inline">Pause</span>
                    </Button>
                  )}
                  <Button
                    onClick={handleStopTimer}
                    variant="destructive"
                    size="sm"
                    className="gap-1.5 h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm"
                    data-testid="stop-timer-btn"
                  >
                    <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden xs:inline">Stop</span>
                  </Button>
                </>
              ) : hasTimerForOtherStage ? (
                <div className="text-[10px] sm:text-sm text-orange-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="truncate max-w-[100px] sm:max-w-none">Active on {activeTimer.stage_name}</span>
                </div>
              ) : (
                <Button
                  onClick={handleStartTimer}
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700 h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm"
                  data-testid="start-timer-btn"
                  disabled={!activeStageId}
                >
                  <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden xs:inline">Start</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>

      {/* Batch Report Dialog */}
      <ProductionBatchReportDialog
        batch={batch}
        isOpen={showReport}
        onClose={() => setShowReport(false)}
      />
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
