import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Layers, ArrowRight } from "lucide-react";
import { ItemRow } from "./ItemRow";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function StageContent({ stageData, stages, onUpdateQty, onMoveStage, onRefresh }) {
  if (!stageData) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="text-center py-8 text-muted-foreground">
            Select a stage to view items
          </div>
        </CardContent>
      </Card>
    );
  }

  // Find next stage
  const currentIdx = stages.findIndex((s) => s.stage_id === stageData.stage_id);
  const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;

  // Count completed items
  const items = stageData.items || [];
  const completedCount = items.filter((item) => {
    const qtyCompleted = item.qty_completed || 0;
    const qtyRequired = item.qty_required || 1;
    return qtyCompleted >= qtyRequired;
  }).length;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <StageHeader 
          stageData={stageData} 
          nextStage={nextStage}
          completedCount={completedCount}
          onRefresh={onRefresh}
        />
        <StageItems
          items={items}
          stages={stages}
          currentStageId={stageData.stage_id}
          onUpdateQty={onUpdateQty}
          onMoveStage={onMoveStage}
          onRefresh={onRefresh}
        />
      </CardContent>
    </Card>
  );
}

function StageHeader({ stageData, nextStage, completedCount, onRefresh }) {
  const totalRequired = stageData.total_required || 1;
  const totalCompleted = stageData.total_completed || 0;
  const progress = (totalCompleted / totalRequired) * 100;
  const totalItems = stageData.total_items || 0;

  async function handleBulkMove() {
    if (!nextStage) return;
    
    try {
      const res = await fetch(API + "/items/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          stage_id: stageData.stage_id,
          next_stage_id: nextStage.stage_id
        })
      });
      
      if (res.ok) {
        const result = await res.json();
        if (result.moved_count > 0) {
          toast.success(result.message);
          if (onRefresh) onRefresh();
        } else {
          toast.info("No completed items to move");
        }
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to move items");
      }
    } catch (err) {
      toast.error("Failed to move items");
    }
  }

  return (
    <div className="mb-4 p-4 bg-muted/30 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-lg">{stageData.stage_name}</h3>
          <p className="text-sm text-muted-foreground">
            {totalItems} items • {totalCompleted}/{totalRequired} completed
          </p>
        </div>
        <Progress value={progress} className="w-48" />
      </div>
      
      {/* Bulk Move Button */}
      {nextStage && completedCount > 0 && (
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-green-400">{completedCount}</span> item{completedCount !== 1 ? "s" : ""} ready to move
          </p>
          <Button
            onClick={handleBulkMove}
            className="gap-2"
            data-testid="bulk-move-btn"
          >
            <ArrowRight className="w-4 h-4" />
            Move All to {nextStage.name}
          </Button>
        </div>
      )}
    </div>
  );
}

function StageItems({ items, stages, currentStageId, onUpdateQty, onMoveStage, onRefresh }) {
  const isEmpty = !items || items.length === 0;

  if (isEmpty) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No items at this stage</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <ItemRow
          key={item.item_id}
          item={item}
          stages={stages}
          currentStageId={currentStageId}
          onUpdateQty={onUpdateQty}
          onMoveStage={onMoveStage}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}
