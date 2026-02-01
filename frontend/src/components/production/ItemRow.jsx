import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const COLOR_LABELS = { B: "Black", W: "White", N: "Natural" };

export function ItemRow({ item, stages, onUpdateQty, onMoveStage }) {
  const [qty, setQty] = useState(item.qty_completed || 0);
  
  const currentIdx = stages.findIndex((s) => s.stage_id === item.current_stage_id);
  const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;
  
  const qtyRequired = item.qty_required || 1;
  const qtyCompleted = item.qty_completed || 0;
  const progress = (qtyCompleted / qtyRequired) * 100;
  const colorLabel = COLOR_LABELS[item.color] || item.color;
  const isComplete = !nextStage && qtyCompleted >= qtyRequired;

  function handleQtyChange(e) {
    const val = parseInt(e.target.value, 10) || 0;
    setQty(Math.max(0, val)); // Allow qty > required (e.g., extras in cutting)
  }

  function handleSave() {
    onUpdateQty(item.item_id, qty);
  }

  function handleMove() {
    if (nextStage) {
      onMoveStage(item.item_id, nextStage.stage_id, qty);
    }
  }

  return (
    <div
      className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg border border-border"
      data-testid={`item-row-${item.item_id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate">{item.name}</span>
          <span className="text-xs text-muted-foreground font-mono">{item.sku}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-500 text-white">
            {colorLabel}
          </span>
          <Badge variant="outline" className="font-mono">
            {item.size}
          </Badge>
        </div>
      </div>

      <div className="w-32">
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground text-center mt-1">
          {qtyCompleted}/{qtyRequired}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          min="0"
          value={qty}
          onChange={handleQtyChange}
          className="w-16 text-center"
          data-testid={`qty-input-${item.item_id}`}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          data-testid={`update-qty-${item.item_id}`}
        >
          Save
        </Button>
      </div>

      {nextStage && (
        <Button
          size="sm"
          onClick={handleMove}
          className="gap-1"
          data-testid={`move-item-${item.item_id}`}
        >
          <ArrowRight className="w-4 h-4" />
          {nextStage.name}
        </Button>
      )}

      {isComplete && (
        <Badge className="bg-green-500">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Done
        </Badge>
      )}
    </div>
  );
}
