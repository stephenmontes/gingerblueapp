import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Scissors, Package } from "lucide-react";

// Size order for sorting
const SIZE_ORDER = ["S", "L", "XL", "HS", "HX", "XX", "XXX"];

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
};

// Extract size and color from SKU
// SKU format: BWF-AD-1225-HS-W (size is second to last, color is last)
function parseSKU(sku) {
  if (!sku) return { size: "Unknown", color: "Unknown" };
  
  const parts = sku.split("-");
  if (parts.length < 2) return { size: "Unknown", color: "Unknown" };
  
  const color = parts[parts.length - 1] || "Unknown";
  const size = parts[parts.length - 2] || "Unknown";
  
  return { size, color };
}

// Get color display name
function getColorName(code) {
  return COLOR_NAMES[code] || code;
}

// Get size sort index
function getSizeIndex(size) {
  const idx = SIZE_ORDER.indexOf(size);
  return idx >= 0 ? idx : SIZE_ORDER.length; // Unknown sizes go last
}

export function CutList({ batchDetails }) {
  // Aggregate items by size and color
  const { aggregatedItems, sizeGroups, grandTotal } = useMemo(() => {
    if (!batchDetails || !batchDetails.orders) {
      return { aggregatedItems: [], sizeGroups: [], grandTotal: 0 };
    }

    // Collect all items from all orders
    const itemMap = new Map(); // key: "size-color", value: { size, color, quantity, items: [] }
    
    batchDetails.orders.forEach(order => {
      const items = order.items || [];
      items.forEach(item => {
        const { size, color } = parseSKU(item.sku);
        const key = `${size}-${color}`;
        const qty = item.quantity || item.qty || 1;
        
        if (itemMap.has(key)) {
          const existing = itemMap.get(key);
          existing.quantity += qty;
          existing.items.push({
            sku: item.sku,
            name: item.name || item.title,
            quantity: qty,
            orderId: order.order_id,
            orderNumber: order.order_number
          });
        } else {
          itemMap.set(key, {
            size,
            color,
            quantity: qty,
            items: [{
              sku: item.sku,
              name: item.name || item.title,
              quantity: qty,
              orderId: order.order_id,
              orderNumber: order.order_number
            }]
          });
        }
      });
    });

    // Convert to array and sort by size order, then by color
    const aggregated = Array.from(itemMap.values()).sort((a, b) => {
      const sizeCompare = getSizeIndex(a.size) - getSizeIndex(b.size);
      if (sizeCompare !== 0) return sizeCompare;
      return a.color.localeCompare(b.color);
    });

    // Group by size for subtotals
    const sizeMap = new Map();
    aggregated.forEach(item => {
      if (sizeMap.has(item.size)) {
        sizeMap.get(item.size).push(item);
      } else {
        sizeMap.set(item.size, [item]);
      }
    });

    // Create size groups array sorted by size order
    const groups = Array.from(sizeMap.entries())
      .sort((a, b) => getSizeIndex(a[0]) - getSizeIndex(b[0]))
      .map(([size, items]) => ({
        size,
        items,
        subtotal: items.reduce((sum, item) => sum + item.quantity, 0)
      }));

    // Calculate grand total
    const total = aggregated.reduce((sum, item) => sum + item.quantity, 0);

    return {
      aggregatedItems: aggregated,
      sizeGroups: groups,
      grandTotal: total
    };
  }, [batchDetails]);

  if (!batchDetails || sizeGroups.length === 0) {
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

  return (
    <Card className="bg-card border-border" data-testid="cut-list">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Scissors className="w-5 h-5" />
            Cut List
          </div>
          <Badge variant="secondary" className="text-base px-3 py-1">
            Total: {grandTotal} items
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="w-24">Size</TableHead>
              <TableHead className="w-24">Color</TableHead>
              <TableHead className="text-right w-24">Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sizeGroups.map((group, groupIndex) => (
              <SizeGroupRows 
                key={group.size}
                group={group}
                groupIndex={groupIndex}
                isLast={groupIndex === sizeGroups.length - 1}
              />
            ))}
            
            {/* Grand Total row */}
            <TableRow className="bg-primary/10 border-t-2 border-primary/30 font-bold">
              <TableCell colSpan={2} className="text-right text-lg">
                Grand Total:
              </TableCell>
              <TableCell className="text-right font-mono text-lg text-primary">
                {grandTotal}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
  };
  
  const bgColor = colorMap[color] || "#6B7280";
  const isWhite = color === "W" || color === "C";
  
  return (
    <span 
      className="w-4 h-4 rounded-full inline-block border"
      style={{ 
        backgroundColor: bgColor,
        borderColor: isWhite ? "#d1d5db" : bgColor
      }}
    />
  );
}
