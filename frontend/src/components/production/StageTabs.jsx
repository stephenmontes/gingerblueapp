import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Users } from "lucide-react";

export function StageTabs({ stages, activeStageId, onStageSelect, activeTimer, stageWorkers }) {
  // Skip the first stage (usually "New" or pending)
  const visibleStages = stages.slice(1);

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {visibleStages.map((stage) => {
        const workers = stageWorkers && stageWorkers[stage.stage_id] ? stageWorkers[stage.stage_id] : [];
        return (
          <StageTabButton
            key={stage.stage_id}
            stage={stage}
            isActive={activeStageId === stage.stage_id}
            hasTimer={activeTimer && activeTimer.stage_id === stage.stage_id}
            workerCount={workers.length}
            onSelect={onStageSelect}
          />
        );
      })}
    </div>
  );
}

function StageTabButton({ stage, isActive, hasTimer, workerCount, onSelect }) {
  return (
    <Button
      variant={isActive ? "default" : "outline"}
      size="sm"
      onClick={() => onSelect(stage.stage_id)}
      className={`flex items-center gap-2 whitespace-nowrap ${hasTimer ? "ring-2 ring-green-500" : ""}`}
      data-testid={`stage-tab-${stage.stage_id}`}
    >
      <div
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: stage.color }}
      />
      {stage.stage_name}
      <Badge variant="secondary">{stage.total_items}</Badge>
      {workerCount > 0 && (
        <Badge variant="outline" className="text-blue-400 border-blue-400/30 gap-1">
          <Users className="w-3 h-3" />
          {workerCount}
        </Badge>
      )}
      {hasTimer && <Clock className="w-3 h-3 text-green-400 animate-pulse" />}
    </Button>
  );
}
