import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, CheckCircle2, PackagePlus, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

const COLOR_LABELS = { B: "Black", W: "White", N: "Natural" };
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function ItemRow({ item, stages, currentStageId, onUpdateQty, onMoveStage, onRefresh, hasActiveTimer }) {
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
  const isComplete = qtyCompleted >= qtyRequired;
  const isFinalStage = !nextStage;
  
  // Check if this is the Quality Check (final) stage
  const isQualityCheckStage = item.current_stage_id === "stage_ready";
  const canAddToInventory = isQualityCheckStage && qtyCompleted > 0 && !item.added_to_inventory;
  const goodFrames = Math.max(0, qtyCompleted - qtyRejected);

  function showTimerWarning() {
    toast.error(
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5" />
        <div>
          <p className="font-medium">Start your timer first!</p>
          <p className="text-sm opacity-80">Click Start at the top to begin tracking time for this stage.</p>
        </div>
      </div>,
      { duration: 4000 }
    );
  }

  function handleQtyChange(e) {
    if (!hasActiveTimer) {
      showTimerWarning();
      return;
    }
    const val = parseInt(e.target.value, 10) || 0;
    setQty(Math.max(0, val));
  }

  function handleRejectedChange(e) {
    if (!hasActiveTimer) {
      showTimerWarning();
      return;
    }
    const val = parseInt(e.target.value, 10) || 0;
    setRejectedQty(Math.max(0, val));
  }

  function handleSave() {
    if (!hasActiveTimer) {
      showTimerWarning();
      return;
    }
    onUpdateQty(item.item_id, qty);
  }

  // Quick complete - sets qty to required amount
  function handleQuickComplete(checked) {
    if (!hasActiveTimer) {
      showTimerWarning();
      return;
    }
    if (checked) {
      setQty(qtyRequired);
      onUpdateQty(item.item_id, qtyRequired);
    } else {
      setQty(0);
      onUpdateQty(item.item_id, 0);
    }
  }

  async function handleSaveRejected() {
    if (!hasActiveTimer) {
      showTimerWarning();
      return;
    }
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
      className={`flex flex-col gap-3 p-4 bg-muted/30 rounded-lg border ${hasActiveTimer ? "border-border" : "border-orange-500/30"}`}
      data-testid={`item-row-${item.item_id}`}
    >
      {/* Top row - Item info and progress */}
      <div className="flex items-center gap-4">
        {/* Completed Checkbox - Quick way to mark as done */}
        <div className="flex flex-col items-center gap-1">
          <Checkbox
            checked={qtyCompleted >= qtyRequired}
            onCheckedChange={handleQuickComplete}
            disabled={!hasActiveTimer}
            className={`h-6 w-6 border-2 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 ${!hasActiveTimer ? "opacity-50 cursor-not-allowed" : ""}`}
            data-testid={`complete-checkbox-${item.item_id}`}
          />
          <span className="text-[10px] text-muted-foreground">Done</span>
        </div>

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
              disabled={!hasActiveTimer}
              className={`w-16 text-center ${!hasActiveTimer ? "opacity-50 cursor-not-allowed" : ""}`}
              data-testid={`qty-input-${item.item_id}`}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={!hasActiveTimer}
            data-testid={`update-qty-${item.item_id}`}
          >
            Save
          </Button>
        </div>

        {/* Move to Next Stage Button */}
        {nextStage && (
          <Button
            size="sm"
            onClick={handleMove}
            className="gap-1"
            disabled={qtyCompleted < qtyRequired}
            data-testid={`move-item-${item.item_id}`}
          >
            <ArrowRight className="w-4 h-4" />
            {nextStage.name}
          </Button>
        )}

        {isFinalStage && isComplete && !isQualityCheckStage && (
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
              disabled={!hasActiveTimer}
              className={`w-16 text-center ${!hasActiveTimer ? "opacity-50 cursor-not-allowed" : ""}`}
              data-testid={`rejected-input-${item.item_id}`}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveRejected}
              disabled={!hasActiveTimer}
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
