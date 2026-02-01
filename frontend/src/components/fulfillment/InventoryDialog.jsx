import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Package,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";

export function InventoryDialog({ order, onClose }) {
  if (!order) return null;

  const invStatus = order.inventory_status;
  const items = invStatus?.items || [];

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Inventory Status - Order #{order.order_number || order.order_id?.slice(-8)}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <InventorySummaryBanner invStatus={invStatus} />
          <InventoryItemsTable items={items} />
          <LowStockWarning invStatus={invStatus} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InventorySummaryBanner({ invStatus }) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
      {invStatus?.all_in_stock ? (
        <div className="flex items-center gap-2 text-green-500">
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">All items in stock</span>
        </div>
      ) : invStatus?.partial_stock ? (
        <div className="flex items-center gap-2 text-orange-500">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-medium">{invStatus.out_of_stock_count} items have insufficient stock</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-red-500">
          <XCircle className="w-5 h-5" />
          <span className="font-medium">Items out of stock</span>
        </div>
      )}
    </div>
  );
}

function InventoryItemsTable({ items }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead>Item</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead className="text-right">Needed</TableHead>
          <TableHead className="text-right">Available</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, idx) => (
          <TableRow key={idx} className="border-border">
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell className="font-mono text-sm">{item.sku}</TableCell>
            <TableCell className="text-right">{item.qty_needed}</TableCell>
            <TableCell className="text-right">
              <span className={item.qty_available < item.qty_needed ? "text-red-400" : "text-green-400"}>
                {item.qty_available}
              </span>
            </TableCell>
            <TableCell>
              <ItemStatusBadge item={item} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ItemStatusBadge({ item }) {
  if (item.in_stock) {
    return (
      <Badge variant="outline" className="border-green-500 text-green-500">
        <CheckCircle className="w-3 h-3 mr-1" />
        OK
      </Badge>
    );
  }
  if (item.qty_available > 0) {
    return (
      <Badge variant="outline" className="border-orange-500 text-orange-500">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Low
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-red-500 text-red-500">
      <XCircle className="w-3 h-3 mr-1" />
      None
    </Badge>
  );
}

function LowStockWarning({ invStatus }) {
  if (!invStatus?.low_stock_items?.length) return null;

  return (
    <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
      <p className="text-sm text-orange-400 font-medium mb-2">Shortage Details:</p>
      <ul className="text-sm text-orange-400/80 space-y-1">
        {invStatus.low_stock_items.map((item, idx) => (
          <li key={idx}>
            {item.sku}: Need {item.needed}, have {item.available} (short {item.shortage})
          </li>
        ))}
      </ul>
    </div>
  );
}
