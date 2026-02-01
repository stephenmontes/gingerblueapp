import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { SkuLink } from "./SkuLink";

export function InventoryDialog({ order, onClose }) {
  if (!order) return null;

  const invStatus = order.inventory_status;
  const items = invStatus?.items || [];
  const lowStockItems = invStatus?.low_stock_items || [];

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Order #{order.order_number || order.order_id?.slice(-8)}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <StatusSummary invStatus={invStatus} />
          <ItemsTable items={items} />
          {lowStockItems.length > 0 && <ShortageWarning items={lowStockItems} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusSummary({ invStatus }) {
  if (invStatus?.all_in_stock) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 text-green-500">
        <CheckCircle className="w-5 h-5" />
        <span className="font-medium">All items in stock</span>
      </div>
    );
  }
  if (invStatus?.partial_stock) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 text-orange-500">
        <AlertTriangle className="w-5 h-5" />
        <span className="font-medium">{invStatus.out_of_stock_count} items insufficient</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 text-red-500">
      <XCircle className="w-5 h-5" />
      <span className="font-medium">Out of stock</span>
    </div>
  );
}

function ItemsTable({ items }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead>Item</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead className="text-right">Need</TableHead>
          <TableHead className="text-right">Have</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, idx) => (
          <ItemTableRow key={idx} item={item} />
        ))}
      </TableBody>
    </Table>
  );
}

function ItemTableRow({ item }) {
  const qtyClass = item.qty_available < item.qty_needed ? "text-red-400" : "text-green-400";
  
  return (
    <TableRow className="border-border">
      <TableCell className="font-medium">{item.name}</TableCell>
      <TableCell className="font-mono text-sm">{item.sku}</TableCell>
      <TableCell className="text-right">{item.qty_needed}</TableCell>
      <TableCell className={`text-right ${qtyClass}`}>{item.qty_available}</TableCell>
      <TableCell><ItemBadge item={item} /></TableCell>
    </TableRow>
  );
}

function ItemBadge({ item }) {
  if (item.in_stock) {
    return <Badge variant="outline" className="border-green-500 text-green-500">OK</Badge>;
  }
  if (item.qty_available > 0) {
    return <Badge variant="outline" className="border-orange-500 text-orange-500">Low</Badge>;
  }
  return <Badge variant="outline" className="border-red-500 text-red-500">None</Badge>;
}

function ShortageWarning({ items }) {
  return (
    <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
      <p className="text-sm text-orange-400 font-medium mb-2">Shortage:</p>
      <ul className="text-sm text-orange-400/80 space-y-1">
        {items.map((item, idx) => (
          <li key={idx}>{item.sku}: short {item.shortage}</li>
        ))}
      </ul>
    </div>
  );
}
