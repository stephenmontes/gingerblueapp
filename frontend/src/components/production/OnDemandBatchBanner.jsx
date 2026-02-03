import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Package, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";

const SIZES = [
  { value: "HS", label: "Half Sheet (HS)" },
  { value: "S", label: "Small (S)" },
  { value: "L", label: "Large (L)" },
  { value: "XL", label: "Extra Large (XL)" },
  { value: "HX", label: "Half XL (HX)" },
  { value: "XX", label: "Double XL (XX)" },
  { value: "XXX", label: "Triple XL (XXX)" },
];

const COLORS = [
  { value: "W", label: "White", color: "#FFFFFF" },
  { value: "B", label: "Black", color: "#1a1a1a" },
  { value: "N", label: "Natural", color: "#D2B48C" },
  { value: "G", label: "Gold", color: "#FFD700" },
  { value: "R", label: "Red", color: "#DC2626" },
  { value: "BL", label: "Blue", color: "#2563EB" },
  { value: "GR", label: "Green", color: "#16A34A" },
  { value: "P", label: "Pink", color: "#EC4899" },
  { value: "Y", label: "Yellow", color: "#EAB308" },
  { value: "O", label: "Orange", color: "#EA580C" },
  { value: "T", label: "Tan", color: "#A8896C" },
  { value: "C", label: "Cream", color: "#FFFDD0" },
];

export function OnDemandBatchBanner({ onBatchCreated }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [frames, setFrames] = useState([{ size: "", color: "", qty: 1 }]);
  const [creating, setCreating] = useState(false);

  const addFrame = () => {
    setFrames([...frames, { size: "", color: "", qty: 1 }]);
  };

  const removeFrame = (index) => {
    if (frames.length > 1) {
      setFrames(frames.filter((_, i) => i !== index));
    }
  };

  const updateFrame = (index, field, value) => {
    const updated = [...frames];
    updated[index] = { ...updated[index], [field]: value };
    setFrames(updated);
  };

  const getTotalQty = () => {
    return frames.reduce((sum, f) => sum + (parseInt(f.qty) || 0), 0);
  };

  const isValid = () => {
    return frames.every(f => f.size && f.color && f.qty > 0);
  };

  const handleCreateBatch = async () => {
    if (!isValid()) {
      toast.error("Please fill in all frame details");
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`${API}/batches/on-demand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: batchName || null,
          frames: frames.map(f => ({
            size: f.size,
            color: f.color,
            qty: parseInt(f.qty)
          }))
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Created batch: ${result.batch_name} with ${result.frame_count} frame(s)`);
        
        // Reset form
        setBatchName("");
        setFrames([{ size: "", color: "", qty: 1 }]);
        setIsExpanded(false);
        
        // Notify parent to refresh
        if (onBatchCreated) {
          onBatchCreated(result);
        }
      } else {
        const error = await response.json();
        console.error("On-demand batch error:", error);
        toast.error(error.detail || "Failed to create batch");
      }
    } catch (err) {
      console.error("On-demand batch network error:", err);
      toast.error("Failed to create batch - check console for details");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border-orange-500/30">
      <CardHeader className="pb-2">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="w-5 h-5 text-orange-500" />
            On-Demand Batch
            <Badge variant="outline" className="ml-2 text-orange-400 border-orange-400/30">
              Manual
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="sm">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
        {!isExpanded && (
          <p className="text-sm text-muted-foreground">
            Create a batch with custom frame sizes, colors, and quantities
          </p>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Batch Name */}
          <div className="space-y-2">
            <Label>Batch Name (optional)</Label>
            <Input
              placeholder="Auto-generated if empty"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              className="max-w-md"
            />
          </div>

          {/* Frames */}
          <div className="space-y-3">
            <Label>Frames</Label>
            {frames.map((frame, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border border-border">
                <div className="flex-1 grid grid-cols-3 gap-3">
                  {/* Size */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Size</Label>
                    <Select
                      value={frame.size}
                      onValueChange={(value) => updateFrame(index, "size", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        {SIZES.map(size => (
                          <SelectItem key={size.value} value={size.value}>
                            {size.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Color */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Color</Label>
                    <Select
                      value={frame.color}
                      onValueChange={(value) => updateFrame(index, "color", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select color" />
                      </SelectTrigger>
                      <SelectContent>
                        {COLORS.map(color => (
                          <SelectItem key={color.value} value={color.value}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-4 h-4 rounded-full border border-border" 
                                style={{ backgroundColor: color.color }}
                              />
                              {color.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quantity */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={frame.qty}
                      onChange={(e) => updateFrame(index, "qty", e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Remove button */}
                {frames.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFrame(index)}
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}

            {/* Add Frame Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={addFrame}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Another Frame
            </Button>
          </div>

          {/* Summary and Create Button */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{frames.length}</span> frame type(s) • 
              <span className="font-medium text-foreground ml-1">{getTotalQty()}</span> total quantity
            </div>
            <Button
              onClick={handleCreateBatch}
              disabled={creating || !isValid()}
              className="gap-2 bg-orange-500 hover:bg-orange-600"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Package className="w-4 h-4" />
              )}
              Create Batch
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
