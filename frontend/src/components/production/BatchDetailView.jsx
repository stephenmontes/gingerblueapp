import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Layers } from "lucide-react";
import { BatchHeader } from "./BatchHeader";
import { StageTabs } from "./StageTabs";
import { BatchStats } from "./BatchStats";
import { BatchOrders } from "./BatchOrders";
import { FrameList } from "./CutList";

export function BatchDetailView({
  batch,
  batchDetails,
  stageSummary,
  stages,
  stageWorkers,
  onUpdateQty,
  onMoveStage,
  onRefresh,
  onTimerChange,
  activeTimer,
  timerVersion,
}) {
  const [activeStageId, setActiveStageId] = useState(null);

  useEffect(() => {
    if (stageSummary && stageSummary.length > 1 && !activeStageId) {
      setActiveStageId(stageSummary[1].stage_id);
    }
  }, [stageSummary, activeStageId]);

  const currentStageData = stageSummary 
    ? stageSummary.find((s) => s.stage_id === activeStageId) 
    : null;

  const orders = batchDetails ? batchDetails.orders : [];

  // Check if current stage has active timer
  const hasActiveTimerForStage = activeTimer && activeTimer.stage_id === activeStageId;

  // Get workers for current stage
  const currentStageWorkers = stageWorkers && activeStageId ? stageWorkers[activeStageId] || [] : [];

  // Check if current stage is the Cutting stage (for showing Cut List)
  const isCuttingStage = activeStageId === "stage_cutting";

  return (
    <div className="space-y-4">
      <BatchHeader
        batch={batch}
        batchDetails={batchDetails}
        activeStageId={activeStageId}
        stageName={currentStageData?.stage_name}
        stageColor={currentStageData?.color}
        onTimerChange={onTimerChange}
        activeTimer={activeTimer}
      />

      {/* Orders in batch */}
      <BatchOrders orders={orders} />

      {/* Stage tabs */}
      <StageTabs
        stages={stageSummary || []}
        activeStageId={activeStageId}
        onStageSelect={setActiveStageId}
        activeTimer={activeTimer}
        stageWorkers={stageWorkers}
      />

      {/* KPIs / Stats */}
      <BatchStats batchId={batch.batch_id} />

      {/* Frame List - shows in ALL stages, filtered by current stage */}
      <FrameList 
        batch={batch} 
        activeTimer={activeTimer} 
        currentStageId={activeStageId}
        stages={stages}
        onRefresh={onRefresh}
      />
    </div>
  );
}

export function NoBatchSelected() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-8 text-center">
        <Layers className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Select a Batch</h2>
        <p className="text-muted-foreground">
          Choose a production batch from the list to view items by stage
        </p>
      </CardContent>
    </Card>
  );
}
