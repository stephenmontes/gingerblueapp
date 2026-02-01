import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Scissors, Package, Check, Loader2, Clock, ArrowRight, AlertTriangle, PackagePlus } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Color code mappings for display
const COLOR_NAMES = {
  "W": "White",
  "B": "Black",
  "N": "Natural",
  "G": "Gold",
  "R": "Red",
  "BL": "Blue",
  "GR": "Green",
  "P": "Pink",
  "Y": "Yellow",
  "O": "Orange",
  "T": "Tan",
  "C": "Cream",
  "UNK": "Unknown",
};

function getColorName(code) {
  return COLOR_NAMES[code] || code;
}

export function FrameList({ batch, activeTimer, currentStageId, stages, onRefresh }) {
  const [framesData, setFramesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [localValues, setLocalValues] = useState({});
  const [localRejected, setLocalRejected] = useState({});
  const debounceTimers = useRef({});
  const rejectedTimers = useRef({});

  // Check if user has an active timer running FOR THIS SPECIFIC STAGE
  const hasActiveTimer = activeTimer && 
    !activeTimer.is_paused && 
    activeTimer.stage_id === currentStageId;

  // Get current stage info
  const currentStage = stages?.find(s => s.stage_id === currentStageId);
  const currentStageOrder = currentStage?.order ?? 0;
  const nextStage = stages?.find(s => s.order === currentStageOrder + 1);
  
  // Check if this is the Quality Check stage (last stage, usually "stage_ready" or contains "quality")
  const isQualityCheckStage = currentStageId === "stage_ready" || 
    currentStage?.name?.toLowerCase().includes("quality");

  const fetchFrames = useCallback(async () => {
    if (!batch?.batch_id) return;
    
    setLoading(true);
    
    try {
      // Fetch frames for current stage
      const url = currentStageId 
        ? `${API}/batches/${batch.batch_id}/frames?stage_id=${currentStageId}`
        : `${API}/batches/${batch.batch_id}/frames`;
      
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setFramesData(data);
        // Initialize local values
        const values = {};
        const rejected = {};
        (data.frames || []).forEach(frame => {
          values[frame.frame_id] = frame.qty_completed || 0;
          rejected[frame.frame_id] = frame.qty_rejected || 0;
        });
        setLocalValues(values);
        setLocalRejected(rejected);
      }
    } catch (err) {
      console.error("Failed to load frames:", err);
    } finally {
      setLoading(false);
    }
  }, [batch?.batch_id, currentStageId]);

  // Reset state when stage changes
  useEffect(() => {
    setLocalValues({});
    setLocalRejected({});
    setFramesData(null);
  }, [currentStageId]);

  useEffect(() => {
    fetchFrames();
  }, [fetchFrames]);

  const saveToServer = async (frameId, qtyCompleted, qtyRejected = null) => {
    setUpdating(prev => ({ ...prev, [frameId]: true }));
    
    try {
      let url = `${API}/batches/${batch.batch_id}/frames/${frameId}?qty_completed=${qtyCompleted}`;
      if (qtyRejected !== null) {
        url += `&qty_rejected=${qtyRejected}`;
      }
      
      const res = await fetch(url, { method: "PUT", credentials: "include" });
      
      if (res.ok) {
        // Update local state
        setFramesData(prev => {
          if (!prev) return prev;
          const newFrames = prev.frames.map(f => {
            if (f.frame_id === frameId) {
              const updated = { ...f, qty_completed: qtyCompleted };
              if (qtyRejected !== null) updated.qty_rejected = qtyRejected;
              return updated;
            }
            return f;
          });
          return { ...prev, frames: newFrames };
        });
      } else {
        toast.error("Failed to save");
      }
    } catch (err) {
      toast.error("Failed to save");
    } finally {
      setUpdating(prev => ({ ...prev, [frameId]: false }));
    }
  };

  const handleQtyChange = (frameId, value) => {
    const qty = parseInt(value) || 0;
    
    // Update local value immediately
    setLocalValues(prev => ({ ...prev, [frameId]: qty }));
    
    // Clear existing timer
    if (debounceTimers.current[frameId]) {
      clearTimeout(debounceTimers.current[frameId]);
    }
    
    // Debounce server save (500ms)
    debounceTimers.current[frameId] = setTimeout(() => {
      const currentRejected = localRejected[frameId] || 0;
      saveToServer(frameId, qty, currentRejected);
    }, 500);
  };

  const handleRejectedChange = (frameId, value) => {
    const qty = parseInt(value) || 0;
    
    // Update local value immediately
    setLocalRejected(prev => ({ ...prev, [frameId]: qty }));
    
    // Clear existing timer
    if (rejectedTimers.current[frameId]) {
      clearTimeout(rejectedTimers.current[frameId]);
    }
    
    // Debounce server save (500ms)
    rejectedTimers.current[frameId] = setTimeout(() => {
      const currentCompleted = localValues[frameId] || 0;
      saveToServer(frameId, currentCompleted, qty);
    }, 500);
  };

  const handleCompletedChange = (frame, checked) => {
    const newQty = checked ? frame.qty_required : 0;
    setLocalValues(prev => ({ ...prev, [frame.frame_id]: newQty }));
    saveToServer(frame.frame_id, newQty);
  };

  const handleMoveToNextStage = async (frameId) => {
    if (!nextStage) return;
    
    setUpdating(prev => ({ ...prev, [frameId]: true }));
    
    try {
      const res = await fetch(
        `${API}/batches/${batch.batch_id}/frames/${frameId}/move?target_stage_id=${nextStage.stage_id}`,
        { method: "POST", credentials: "include" }
      );
      
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        fetchFrames(); // Refresh the list
        onRefresh?.(); // Refresh parent to update stage counts
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to move frame");
      }
    } catch (err) {
      toast.error("Failed to move frame");
    } finally {
      setUpdating(prev => ({ ...prev, [frameId]: false }));
    }
  };

  const handleMoveAllCompleted = async () => {
    if (!nextStage || !currentStageId) return;
    
    try {
      const res = await fetch(
        `${API}/batches/${batch.batch_id}/frames/move-all?from_stage_id=${currentStageId}`,
        { method: "POST", credentials: "include" }
      );
      
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        fetchFrames();
        onRefresh?.(); // Refresh parent to update stage counts
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to move frames");
      }
    } catch (err) {
      toast.error("Failed to move frames");
    }
  };

  const handleMoveToInventory = async (frameId) => {
    setUpdating(prev => ({ ...prev, [frameId]: true }));
    
    try {
      const res = await fetch(
        `${API}/batches/${batch.batch_id}/frames/${frameId}/to-inventory`,
        { method: "POST", credentials: "include" }
      );
      
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        fetchFrames(); // Refresh the list
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to move to inventory");
      }
    } catch (err) {
      toast.error("Failed to move to inventory");
    } finally {
      setUpdating(prev => ({ ...prev, [frameId]: false }));
    }
  };

  const handleMoveAllToInventory = async () => {
    try {
      const res = await fetch(
        `${API}/batches/${batch.batch_id}/frames/all-to-inventory`,
        { method: "POST", credentials: "include" }
      );
      
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        fetchFrames();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to move to inventory");
      }
    } catch (err) {
      toast.error("Failed to move to inventory");
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Scissors className="w-5 h-5" />
            Frame List
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const frames = framesData?.frames || [];
  const sizeGroups = framesData?.size_groups || [];

  if (frames.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Scissors className="w-5 h-5" />
            Frame List - {currentStage?.name || "All Stages"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No frames in this stage</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const grandTotalRequired = framesData?.grand_total_required || 0;
  const grandTotalCompleted = framesData?.grand_total_completed || 0;
  const progressPercent = grandTotalRequired > 0 
    ? Math.round((grandTotalCompleted / grandTotalRequired) * 100) 
    : 0;

  return (
    <Card className="bg-card border-border" data-testid="frame-list">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Scissors className="w-5 h-5" />
            Frame List - {currentStage?.name || "All"}
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-sm px-3 py-1">
              Done: {grandTotalCompleted} / {grandTotalRequired}
            </Badge>
            <Badge 
              variant={progressPercent >= 100 ? "default" : "secondary"} 
              className={`text-sm px-3 py-1 ${progressPercent >= 100 ? "bg-green-600" : ""}`}
            >
              {progressPercent}%
            </Badge>
          </div>
        </CardTitle>
        
        {/* Progress Bar */}
        <div className="mt-3">
          <Progress value={progressPercent} className="h-3" />
        </div>

        {/* Action Buttons */}
        <div className="mt-3 flex justify-end gap-2">
          {/* Move All to Next Stage - for non-final stages */}
          {nextStage && grandTotalCompleted > 0 && !isQualityCheckStage && (
            <Button
              onClick={handleMoveAllCompleted}
              disabled={!hasActiveTimer}
              className="gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              Move All Completed to {nextStage.name}
            </Button>
          )}
          
          {/* Move All to Inventory - for Quality Check stage */}
          {isQualityCheckStage && grandTotalCompleted > 0 && (
            <Button
              onClick={handleMoveAllToInventory}
              disabled={!hasActiveTimer}
              className="gap-2 bg-green-600 hover:bg-green-700"
              data-testid="move-all-to-inventory-btn"
            >
              <PackagePlus className="w-4 h-4" />
              Move All to Inventory
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Timer warning if not active for this stage */}
        {!hasActiveTimer && (
          <div className="flex items-center gap-2 text-orange-400 text-sm bg-orange-500/10 px-4 py-3 rounded-lg mb-4">
            <Clock className="w-5 h-5" />
            <span className="font-medium">
              Start your timer for {currentStage?.name || "this stage"} to update quantities
            </span>
          </div>
        )}
        
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="w-20">Size</TableHead>
              <TableHead className="w-28">Color</TableHead>
              <TableHead className="text-center w-24">Required</TableHead>
              <TableHead className="text-center w-28">Completed</TableHead>
              {isQualityCheckStage && (
                <TableHead className="text-center w-28">
                  <span className="flex items-center justify-center gap-1 text-orange-400">
                    <AlertTriangle className="w-4 h-4" />
                    Rejected
                  </span>
                </TableHead>
              )}
              <TableHead className="text-center w-24">Done</TableHead>
              {nextStage && !isQualityCheckStage && <TableHead className="text-center w-36">Action</TableHead>}
              {isQualityCheckStage && <TableHead className="text-center w-36">To Inventory</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sizeGroups.map((group, groupIndex) => (
              <SizeGroupRows
                key={group.size}
                group={group}
                isLast={groupIndex === sizeGroups.length - 1}
                updating={updating}
                localValues={localValues}
                localRejected={localRejected}
                onQtyChange={handleQtyChange}
                onRejectedChange={handleRejectedChange}
                onCompletedChange={handleCompletedChange}
                onMoveToNextStage={handleMoveToNextStage}
                onMoveToInventory={handleMoveToInventory}
                hasActiveTimer={hasActiveTimer}
                nextStage={nextStage}
                isQualityCheckStage={isQualityCheckStage}
              />
            ))}
            
            {/* Grand Total row */}
            <TableRow className="bg-primary/10 border-t-2 border-primary/30 font-bold">
              <TableCell colSpan={2} className="text-right text-base">
                Grand Total:
              </TableCell>
              <TableCell className="text-center font-mono text-base">
                {grandTotalRequired}
              </TableCell>
              <TableCell className="text-center font-mono text-base text-primary">
                {grandTotalCompleted}
              </TableCell>
              {isQualityCheckStage && (
                <TableCell className="text-center font-mono text-base text-orange-400">
                  {frames.reduce((sum, f) => sum + (localRejected[f.frame_id] || f.qty_rejected || 0), 0)}
                </TableCell>
              )}
              <TableCell className="text-center">
                {grandTotalCompleted >= grandTotalRequired && (
                  <Check className="w-5 h-5 text-green-500 mx-auto" />
                )}
              </TableCell>
              {(nextStage || isQualityCheckStage) && <TableCell></TableCell>}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SizeGroupRows({ group, isLast, updating, localValues, localRejected, onQtyChange, onRejectedChange, onCompletedChange, onMoveToNextStage, onMoveToInventory, hasActiveTimer, nextStage, isQualityCheckStage }) {
  return (
    <>
      {group.frames.map((frame, frameIndex) => {
        const isUpdating = updating[frame.frame_id];
        const displayQty = localValues[frame.frame_id] ?? frame.qty_completed ?? 0;
        const displayRejected = localRejected[frame.frame_id] ?? frame.qty_rejected ?? 0;
        const isComplete = displayQty >= frame.qty_required;
        const isDisabled = isUpdating || !hasActiveTimer;
        
        return (
          <TableRow
            key={frame.frame_id}
            className={`border-border hover:bg-muted/30 ${isComplete ? "bg-green-500/5" : ""}`}
          >
            <TableCell className="font-medium">
              {frameIndex === 0 && (
                <Badge variant="outline" className="font-mono">
                  {frame.size}
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-2">
                <ColorDot color={frame.color} />
                {getColorName(frame.color)}
              </span>
            </TableCell>
            <TableCell className="text-center font-mono">
              {frame.qty_required}
            </TableCell>
            <TableCell className="text-center">
              <Input
                type="number"
                min="0"
                max={frame.qty_required}
                value={displayQty}
                onChange={(e) => onQtyChange(frame.frame_id, e.target.value)}
                className={`w-20 mx-auto text-center font-mono h-8 ${!hasActiveTimer ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={isDisabled}
                data-testid={`qty-${frame.frame_id}`}
              />
            </TableCell>
            {isQualityCheckStage && (
              <TableCell className="text-center">
                <Input
                  type="number"
                  min="0"
                  max={displayQty}
                  value={displayRejected}
                  onChange={(e) => onRejectedChange(frame.frame_id, e.target.value)}
                  className={`w-20 mx-auto text-center font-mono h-8 border-orange-500/30 ${!hasActiveTimer ? "opacity-50 cursor-not-allowed" : ""} ${displayRejected > 0 ? "bg-orange-500/10 text-orange-400" : ""}`}
                  disabled={isDisabled}
                  data-testid={`rejected-${frame.frame_id}`}
                />
              </TableCell>
            )}
            <TableCell className="text-center">
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={isComplete}
                  onCheckedChange={(checked) => onCompletedChange(frame, checked)}
                  disabled={isDisabled}
                  data-testid={`done-${frame.frame_id}`}
                  className={`h-5 w-5 ${!hasActiveTimer ? "opacity-50 cursor-not-allowed" : ""}`}
                />
                {isUpdating && (
                  <Loader2 className="w-4 h-4 ml-2 animate-spin text-muted-foreground" />
                )}
              </div>
            </TableCell>
            {nextStage && !isQualityCheckStage && (
              <TableCell className="text-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onMoveToNextStage(frame.frame_id)}
                  disabled={isDisabled || !isComplete}
                  className="gap-1 text-xs h-7"
                  data-testid={`move-${frame.frame_id}`}
                >
                  <ArrowRight className="w-3 h-3" />
                  {nextStage.name}
                </Button>
              </TableCell>
            )}
            {isQualityCheckStage && (
              <TableCell className="text-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onMoveToInventory(frame.frame_id)}
                  disabled={isDisabled || displayQty === 0}
                  className="gap-1 text-xs h-7 border-green-500/30 text-green-400 hover:bg-green-500/10"
                  data-testid={`to-inventory-${frame.frame_id}`}
                >
                  <PackagePlus className="w-3 h-3" />
                  Inventory
                </Button>
              </TableCell>
            )}
          </TableRow>
        );
      })}

      {/* Subtotal row */}
      <TableRow className="bg-muted/50 border-border font-semibold">
        <TableCell colSpan={2} className="text-right">
          {group.size} Subtotal:
        </TableCell>
        <TableCell className="text-center font-mono">
          {group.subtotal_required}
        </TableCell>
        <TableCell className="text-center font-mono text-primary">
          {group.subtotal_completed}
        </TableCell>
        {isQualityCheckStage && (
          <TableCell className="text-center font-mono text-orange-400">
            {group.frames.reduce((sum, f) => sum + (localRejected[f.frame_id] || f.qty_rejected || 0), 0)}
          </TableCell>
        )}
        <TableCell className="text-center">
          {group.subtotal_completed >= group.subtotal_required && (
            <Check className="w-4 h-4 text-green-500 mx-auto" />
          )}
        </TableCell>
        {(nextStage || isQualityCheckStage) && <TableCell></TableCell>}
      </TableRow>

      {!isLast && (
        <TableRow className="h-2 border-0">
          <TableCell colSpan={isQualityCheckStage ? 7 : (nextStage ? 6 : 5)} className="p-0" />
        </TableRow>
      )}
    </>
  );
}

function ColorDot({ color }) {
  const colorMap = {
    "W": "#FFFFFF",
    "B": "#1a1a1a",
    "N": "#D2B48C",
    "G": "#FFD700",
    "R": "#DC2626",
    "BL": "#3B82F6",
    "GR": "#22C55E",
    "P": "#EC4899",
    "Y": "#EAB308",
    "O": "#F97316",
    "T": "#A3826E",
    "C": "#FFFDD0",
    "UNK": "#6B7280",
  };

  const bgColor = colorMap[color] || "#6B7280";
  const needsRing = ["W", "C", "Y", "B"].includes(color);

  return (
    <span
      className="w-4 h-4 rounded-full inline-block border-2"
      style={{
        backgroundColor: bgColor,
        borderColor: needsRing ? "#9ca3af" : bgColor,
      }}
    />
  );
}

// Export old name for compatibility
export { FrameList as CutList };
