import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, Edit2, Trash2, PlusCircle, XCircle } from "lucide-react";

export function InventoryRow({ item, onQuickAdjust, onOpenAdjust, onOpenReject, onEdit, onDelete }) {
  const isLowStock = item.quantity <= item.min_stock;
  const isRejected = item.is_rejected;
  
  return (
    <TableRow 
      className={`border-border ${isRejected ? "bg-red-500/10" : ""}`} 
      data-testid={`inventory-row-${item.item_id}`}
    >
      <TableCell className={`font-mono text-sm ${isRejected ? "text-red-400" : ""}`}>
        {item.sku}
      </TableCell>
      <TableCell className={`font-medium ${isRejected ? "text-red-400" : ""}`}>
        {item.name}
      </TableCell>
      <TableCell className={isRejected ? "text-red-400" : ""}>{item.color || "-"}</TableCell>
      <TableCell className={isRejected ? "text-red-400" : ""}>{item.size || "-"}</TableCell>
      <TableCell>
        <QuantityControls
          item={item}
          isRejected={isRejected}
          isLowStock={isLowStock}
          onQuickAdjust={onQuickAdjust}
          onOpenAdjust={onOpenAdjust}
        />
      </TableCell>
      <TableCell className={`text-muted-foreground ${isRejected ? "text-red-400/70" : ""}`}>
        {item.location || "-"}
      </TableCell>
      <TableCell>
        <StatusBadge isRejected={isRejected} isLowStock={isLowStock} />
      </TableCell>
      <TableCell className="text-right">
        <ActionButtons
          item={item}
          isRejected={isRejected}
          onOpenReject={onOpenReject}
          onOpenAdjust={onOpenAdjust}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </TableCell>
    </TableRow>
  );
}

function QuantityControls({ item, isRejected, isLowStock, onQuickAdjust, onOpenAdjust }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0"
        onClick={() => onQuickAdjust(item.item_id, -1)}
        disabled={item.quantity <= 0}
        data-testid={`qty-minus-${item.item_id}`}
      >
        <Minus className="w-4 h-4" />
      </Button>
      <button
        onClick={() => onOpenAdjust(item)}
        className={`min-w-[3rem] px-2 py-1 rounded font-medium cursor-pointer hover:bg-muted transition-colors ${isRejected ? "text-red-400" : isLowStock ? "text-orange-500" : ""}`}
        data-testid={`qty-value-${item.item_id}`}
      >
        {item.quantity}
      </button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0"
        onClick={() => onQuickAdjust(item.item_id, 1)}
        data-testid={`qty-plus-${item.item_id}`}
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}

function StatusBadge({ isRejected, isLowStock }) {
  if (isRejected) {
    return (
      <Badge variant="outline" className="border-red-500 text-red-500 bg-red-500/10">
        Rejected
      </Badge>
    );
  }
  if (isLowStock) {
    return (
      <Badge variant="outline" className="border-orange-500 text-orange-500">
        Low Stock
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-green-500 text-green-500">
      In Stock
    </Badge>
  );
}

function ActionButtons({ item, isRejected, onOpenReject, onOpenAdjust, onEdit, onDelete }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {!isRejected && (
        <Button
          size="sm"
          variant="ghost"
          className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
          onClick={() => onOpenReject(item)}
          title="Reject frames"
          data-testid={`reject-inventory-${item.item_id}`}
        >
          <XCircle className="w-4 h-4" />
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onOpenAdjust(item)}
        title="Adjust quantity"
        data-testid={`adjust-inventory-${item.item_id}`}
      >
        <PlusCircle className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onEdit(item)}
        data-testid={`edit-inventory-${item.item_id}`}
      >
        <Edit2 className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => onDelete(item.item_id)}
        data-testid={`delete-inventory-${item.item_id}`}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
