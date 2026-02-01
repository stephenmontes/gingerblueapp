import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Layers, ArrowRight, Clock, Users, User, Pause } from "lucide-react";
import { ItemRow } from "./ItemRow";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function StageContent({ stageData, stages, stageWorkers, onUpdateQty, onMoveStage, onRefresh, hasActiveTimer, timerVersion }) {
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
          hasActiveTimer={hasActiveTimer}
        />
        
        {/* Active Workers Display */}
        {stageWorkers && stageWorkers.length > 0 && (
          <ActiveWorkers workers={stageWorkers} />
        )}
        
        {/* Timer warning if not active */}
        {!hasActiveTimer && items.length > 0 && (
          <div className="flex items-center gap-2 text-orange-400 text-sm bg-orange-500/10 px-4 py-3 rounded-lg mb-4">
            <Clock className="w-5 h-5" />
            <span className="font-medium">Start your timer above to update item quantities</span>
          </div>
        )}
        
        <StageItems
          items={items}
          stages={stages}
          currentStageId={stageData.stage_id}
          onUpdateQty={onUpdateQty}
          onMoveStage={onMoveStage}
          onRefresh={onRefresh}
          hasActiveTimer={hasActiveTimer}
          timerVersion={timerVersion}
        />
      </CardContent>
    </Card>
  );
}

function ActiveWorkers({ workers }) {
  if (!workers || workers.length === 0) return null;

  return (
    <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-blue-400">
          {workers.length} worker{workers.length !== 1 ? "s" : ""} active on this stage
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {workers.map((worker, index) => (
          <Badge 
            key={worker.user_id || index} 
            variant="outline" 
            className={`gap-1 ${worker.is_paused ? "text-yellow-400 border-yellow-400/30" : "text-green-400 border-green-400/30"}`}
          >
            <User className="w-3 h-3" />
            {worker.user_name}
            {worker.is_paused ? (
              <Pause className="w-3 h-3 text-yellow-400" />
            ) : (
              <Clock className="w-3 h-3 animate-pulse" />
            )}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function StageHeader({ stageData, nextStage, completedCount, onRefresh, hasActiveTimer }) {
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

function StageItems({ items, stages, currentStageId, onUpdateQty, onMoveStage, onRefresh, hasActiveTimer, timerVersion }) {
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
          key={item.item_id + "-" + timerVersion}
          item={item}
          stages={stages}
          currentStageId={currentStageId}
          onUpdateQty={onUpdateQty}
          onMoveStage={onMoveStage}
          onRefresh={onRefresh}
          hasActiveTimer={hasActiveTimer}
        />
      ))}
    </div>
  );
}
