import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function StageTabs({ stages, activeStageId, onStageSelect }) {
  // Skip the first stage (usually "New" or pending)
  const visibleStages = stages.slice(1);

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {visibleStages.map((stage) => (
        <StageTabButton
          key={stage.stage_id}
          stage={stage}
          isActive={activeStageId === stage.stage_id}
          onSelect={onStageSelect}
        />
      ))}
    </div>
  );
}

function StageTabButton({ stage, isActive, onSelect }) {
  return (
    <Button
      variant={isActive ? "default" : "outline"}
      size="sm"
      onClick={() => onSelect(stage.stage_id)}
      className="flex items-center gap-2 whitespace-nowrap"
      data-testid={`stage-tab-${stage.stage_id}`}
    >
      <div
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: stage.color }}
      />
      {stage.stage_name}
      <Badge variant="secondary">{stage.total_items}</Badge>
    </Button>
  );
}
