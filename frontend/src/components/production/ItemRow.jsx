import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, CheckCircle2, PackagePlus, XCircle } from "lucide-react";
import { toast } from "sonner";

const COLOR_LABELS = { B: "Black", W: "White", N: "Natural" };
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function ItemRow({ item, stages, currentStageId, onUpdateQty, onMoveStage, onRefresh }) {
  const [qty, setQty] = useState(item.qty_completed || 0);
  const [rejectedQty, setRejectedQty] = useState(item.qty_rejected || 0);
  const [addingToInventory, setAddingToInventory] = useState(false);
  
  const currentIdx = stages.findIndex((s) => s.stage_id === item.current_stage_id);
  const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;
  
  const qtyRequired = item.qty_required || 1;
  const qtyCompleted = item.qty_completed || 0;
  const qtyRejected = item.qty_rejected || 0;
  const progress = Math.min((qtyCompleted / qtyRequired) * 100, 100);
  const hasExtras = qtyCompleted > qtyRequired;
  const colorLabel = COLOR_LABELS[item.color] || item.color;
  const isComplete = !nextStage && qtyCompleted >= qtyRequired;
  
  // Check if this is the Quality Check (final) stage
  const isQualityCheckStage = item.current_stage_id === "stage_ready";
  const canAddToInventory = isQualityCheckStage && qtyCompleted > 0 && !item.added_to_inventory;
  const goodFrames = Math.max(0, qtyCompleted - qtyRejected);

  function handleQtyChange(e) {
    const val = parseInt(e.target.value, 10) || 0;
    setQty(Math.max(0, val));
  }

  function handleRejectedChange(e) {
    const val = parseInt(e.target.value, 10) || 0;
    setRejectedQty(Math.max(0, val));
  }

  function handleSave() {
    onUpdateQty(item.item_id, qty);
  }

  async function handleSaveRejected() {
    try {
      const res = await fetch(API + "/items/" + item.item_id + "/reject?qty_rejected=" + rejectedQty, {
        method: "PUT",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Rejected quantity updated");
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      toast.error("Failed to update rejected quantity");
    }
  }

  async function handleAddToInventory() {
    setAddingToInventory(true);
    try {
      const res = await fetch(API + "/items/" + item.item_id + "/add-to-inventory", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        if (onRefresh) onRefresh();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to add to inventory");
      }
    } catch (err) {
      toast.error("Failed to add to inventory");
    } finally {
      setAddingToInventory(false);
    }
  }

  function handleMove() {
    if (nextStage) {
      onMoveStage(item.item_id, nextStage.stage_id, qty);
    }
  }

  return (
    <div
      className="flex flex-col gap-3 p-4 bg-muted/30 rounded-lg border border-border"
      data-testid={`item-row-${item.item_id}`}
    >
      {/* Top row - Item info and progress */}
      <div className="flex items-center gap-4">
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
          <p className={`text-xs text-center mt-1 ${hasExtras ? "text-green-400" : "text-muted-foreground"}`}>
            {qtyCompleted}/{qtyRequired} {hasExtras && "(+" + (qtyCompleted - qtyRequired) + ")"}
          </p>
        </div>

        {/* Qty Completed Input */}
        <div className="flex items-center gap-2">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Made</p>
            <Input
              type="number"
              min="0"
              value={qty}
              onChange={handleQtyChange}
              className="w-16 text-center"
              data-testid={`qty-input-${item.item_id}`}
            />
          </div>
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

        {isComplete && !isQualityCheckStage && (
          <Badge className="bg-green-500">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Done
          </Badge>
        )}
      </div>

      {/* Quality Check Stage - Rejected frames and Add to Inventory */}
      {isQualityCheckStage && (
        <div className="flex items-center gap-4 pt-2 border-t border-border/50">
          {/* Rejected Frames Input */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-red-400">
              <XCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Rejected:</span>
            </div>
            <Input
              type="number"
              min="0"
              max={qtyCompleted}
              value={rejectedQty}
              onChange={handleRejectedChange}
              className="w-16 text-center"
              data-testid={`rejected-input-${item.item_id}`}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveRejected}
              data-testid={`save-rejected-${item.item_id}`}
            >
              Save
            </Button>
          </div>

          {/* Good Frames Count */}
          <div className="text-sm">
            <span className="text-muted-foreground">Good frames: </span>
            <span className="font-medium text-green-400">{goodFrames}</span>
          </div>

          {/* Add to Inventory Button */}
          {canAddToInventory && (
            <Button
              size="sm"
              onClick={handleAddToInventory}
              disabled={addingToInventory || goodFrames <= 0}
              className="gap-1 bg-green-600 hover:bg-green-700 ml-auto"
              data-testid={`add-inventory-${item.item_id}`}
            >
              <PackagePlus className="w-4 h-4" />
              Add to Frame Inventory
            </Button>
          )}

          {item.added_to_inventory && (
            <Badge className="bg-blue-500 ml-auto">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Added to Inventory
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
