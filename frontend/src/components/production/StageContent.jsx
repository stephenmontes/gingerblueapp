import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Layers } from "lucide-react";
import { ItemRow } from "./ItemRow";

export function StageContent({ stageData, stages, onUpdateQty, onMoveStage }) {
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

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <StageHeader stageData={stageData} />
        <StageItems
          items={stageData.items}
          stages={stages}
          onUpdateQty={onUpdateQty}
          onMoveStage={onMoveStage}
        />
      </CardContent>
    </Card>
  );
}

function StageHeader({ stageData }) {
  const totalRequired = stageData.total_required || 1;
  const totalCompleted = stageData.total_completed || 0;
  const progress = (totalCompleted / totalRequired) * 100;

  return (
    <div className="mb-4 p-4 bg-muted/30 rounded-lg flex items-center justify-between">
      <div>
        <h3 className="font-semibold text-lg">{stageData.stage_name}</h3>
        <p className="text-sm text-muted-foreground">
          {stageData.total_items} items • {totalCompleted}/{totalRequired} completed
        </p>
      </div>
      <Progress value={progress} className="w-48" />
    </div>
  );
}

function StageItems({ items, stages, onUpdateQty, onMoveStage }) {
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
          onUpdateQty={onUpdateQty}
          onMoveStage={onMoveStage}
        />
      ))}
    </div>
  );
}
