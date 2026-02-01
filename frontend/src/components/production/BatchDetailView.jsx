import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Layers } from "lucide-react";
import { BatchHeader } from "./BatchHeader";
import { StageTabs } from "./StageTabs";
import { StageContent } from "./StageContent";
import { BatchStats } from "./BatchStats";
import { BatchOrders } from "./BatchOrders";

export function BatchDetailView({
  batch,
  batchDetails,
  stageSummary,
  stages,
  onUpdateQty,
  onMoveStage,
  onRefresh,
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

  return (
    <div className="space-y-4">
      <BatchHeader
        batch={batch}
        batchDetails={batchDetails}
        activeStageId={activeStageId}
        stageName={currentStageData?.stage_name}
        stageColor={currentStageData?.color}
      />

      <BatchOrders orders={orders} />

      <BatchStats batchId={batch.batch_id} />

      <StageTabs
        stages={stageSummary || []}
        activeStageId={activeStageId}
        onStageSelect={setActiveStageId}
      />

      <StageContent
        stageData={currentStageData}
        stages={stages}
        onUpdateQty={onUpdateQty}
        onMoveStage={onMoveStage}
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
