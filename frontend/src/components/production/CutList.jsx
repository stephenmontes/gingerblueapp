import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Scissors, Package, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Color code mappings for display
const COLOR_NAMES = {
  "W": "White",
  "B": "Black",
  "N": "Natural",
  "G": "Gray",
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

// Get color display name
function getColorName(code) {
  return COLOR_NAMES[code] || code;
}

// Custom hook for debouncing
function useDebounce(callback, delay) {
  const timeoutRef = useRef(null);
  
  const debouncedCallback = useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);
  
  return debouncedCallback;
}

export function CutList({ batch }) {
  const [cutListData, setCutListData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});

  const fetchCutList = useCallback(async () => {
    if (!batch?.batch_id) return;
    
    try {
      const res = await fetch(`${API}/batches/${batch.batch_id}/cut-list`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setCutListData(data);
      }
    } catch (err) {
      console.error("Failed to load cut list:", err);
    } finally {
      setLoading(false);
    }
  }, [batch?.batch_id]);

  useEffect(() => {
    fetchCutList();
  }, [fetchCutList]);

  const handleUpdateItem = async (size, color, qtyMade, completed) => {
    const key = `${size}-${color}`;
    setUpdating(prev => ({ ...prev, [key]: true }));
    
    try {
      const params = new URLSearchParams({
        size,
        color,
        qty_made: qtyMade.toString(),
        completed: completed.toString()
      });
      
      const res = await fetch(
        `${API}/batches/${batch.batch_id}/cut-list/item?${params}`,
        {
          method: "PUT",
          credentials: "include"
        }
      );
      
      if (res.ok) {
        // Update local state
        setCutListData(prev => {
          if (!prev) return prev;
          
          const newGroups = prev.size_groups.map(group => ({
            ...group,
            items: group.items.map(item => {
              if (item.size === size && item.color === color) {
                return { ...item, qty_made: qtyMade, completed };
              }
              return item;
            }),
            subtotal_made: group.items.reduce((sum, item) => {
              if (item.size === size && item.color === color) {
                return sum + qtyMade;
              }
              return sum + item.qty_made;
            }, 0)
          }));
          
          return {
            ...prev,
            size_groups: newGroups,
            grand_total_made: newGroups.reduce(
              (sum, g) => sum + g.subtotal_made,
              0
            )
          };
        });
      } else {
        toast.error("Failed to update item");
      }
    } catch (err) {
      toast.error("Failed to update item");
    } finally {
      setUpdating(prev => ({ ...prev, [key]: false }));
    }
  };

  // Debounced qty change handler
  const handleQtyChange = (size, color, value, currentCompleted) => {
    const qty = parseInt(value) || 0;
    handleUpdateItem(size, color, qty, currentCompleted);
  };

  const handleCompletedChange = (size, color, checked, currentQty) => {
    handleUpdateItem(size, color, currentQty, checked);
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Scissors className="w-5 h-5" />
            Cut List
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

  if (!cutListData || cutListData.size_groups.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Scissors className="w-5 h-5" />
            Cut List
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No items in batch</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { size_groups, grand_total_required, grand_total_made } = cutListData;

  return (
    <Card className="bg-card border-border" data-testid="cut-list">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Scissors className="w-5 h-5" />
            Cut List
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-sm px-3 py-1">
              Made: {grand_total_made} / {grand_total_required}
            </Badge>
            <Badge 
              variant={grand_total_made >= grand_total_required ? "default" : "secondary"} 
              className="text-sm px-3 py-1"
            >
              {Math.round((grand_total_made / grand_total_required) * 100) || 0}%
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="w-20">Size</TableHead>
              <TableHead className="w-28">Color</TableHead>
              <TableHead className="text-center w-24">Required</TableHead>
              <TableHead className="text-center w-28">Qty Made</TableHead>
              <TableHead className="text-center w-24">Done</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {size_groups.map((group, groupIndex) => (
              <SizeGroupRows
                key={group.size}
                group={group}
                isLast={groupIndex === size_groups.length - 1}
                updating={updating}
                onQtyChange={handleQtyChange}
                onCompletedChange={handleCompletedChange}
              />
            ))}
            
            {/* Grand Total row */}
            <TableRow className="bg-primary/10 border-t-2 border-primary/30 font-bold">
              <TableCell colSpan={2} className="text-right text-base">
                Grand Total:
              </TableCell>
              <TableCell className="text-center font-mono text-base">
                {grand_total_required}
              </TableCell>
              <TableCell className="text-center font-mono text-base text-primary">
                {grand_total_made}
              </TableCell>
              <TableCell className="text-center">
                {grand_total_made >= grand_total_required && (
                  <Check className="w-5 h-5 text-green-500 mx-auto" />
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Component to render rows for each size group
function SizeGroupRows({ group, isLast, updating, onQtyChange, onCompletedChange }) {
  return (
    <>
      {/* Items in this size group */}
      {group.items.map((item, itemIndex) => {
        const key = `${item.size}-${item.color}`;
        const isUpdating = updating[key];
        const isComplete = item.completed || item.qty_made >= item.qty_required;
        
        return (
          <TableRow
            key={key}
            className={`border-border hover:bg-muted/30 ${isComplete ? "bg-green-500/5" : ""}`}
          >
            <TableCell className="font-medium">
              {itemIndex === 0 ? (
                <Badge variant="outline" className="font-mono">
                  {item.size}
                </Badge>
              ) : null}
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-2">
                <ColorDot color={item.color} />
                {getColorName(item.color)}
              </span>
            </TableCell>
            <TableCell className="text-center font-mono">
              {item.qty_required}
            </TableCell>
            <TableCell className="text-center">
              <Input
                type="number"
                min="0"
                value={item.qty_made}
                onChange={(e) => onQtyChange(item.size, item.color, e.target.value, item.completed)}
                className="w-20 mx-auto text-center font-mono h-8"
                disabled={isUpdating}
                data-testid={`qty-made-${key}`}
              />
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={item.completed}
                  onCheckedChange={(checked) => 
                    onCompletedChange(item.size, item.color, checked, item.qty_made)
                  }
                  disabled={isUpdating}
                  data-testid={`completed-${key}`}
                  className="h-5 w-5"
                />
                {isUpdating && (
                  <Loader2 className="w-4 h-4 ml-2 animate-spin text-muted-foreground" />
                )}
              </div>
            </TableCell>
          </TableRow>
        );
      })}

      {/* Subtotal row for this size group */}
      <TableRow className="bg-muted/50 border-border font-semibold">
        <TableCell colSpan={2} className="text-right">
          {group.size} Subtotal:
        </TableCell>
        <TableCell className="text-center font-mono">
          {group.subtotal_required}
        </TableCell>
        <TableCell className="text-center font-mono text-primary">
          {group.subtotal_made}
        </TableCell>
        <TableCell className="text-center">
          {group.subtotal_made >= group.subtotal_required && (
            <Check className="w-4 h-4 text-green-500 mx-auto" />
          )}
        </TableCell>
      </TableRow>

      {/* Spacer between groups */}
      {!isLast && (
        <TableRow className="h-2 border-0">
          <TableCell colSpan={5} className="p-0"></TableCell>
        </TableRow>
      )}
    </>
  );
}

// Color indicator dot
function ColorDot({ color }) {
  const colorMap = {
    "W": "#FFFFFF",
    "B": "#1a1a1a",
    "N": "#D2B48C",
    "G": "#808080",
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
  const isLight = color === "W" || color === "C" || color === "Y";

  return (
    <span
      className="w-4 h-4 rounded-full inline-block border"
      style={{
        backgroundColor: bgColor,
        borderColor: isLight ? "#d1d5db" : bgColor,
      }}
    />
  );
}
