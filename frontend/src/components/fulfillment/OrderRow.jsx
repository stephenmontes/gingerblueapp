import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MoreVertical, 
  ArrowRight, 
  Truck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info
} from "lucide-react";

export function OrderRow({ 
  order, 
  stage, 
  stages, 
  nextStage, 
  isLastStage, 
  isSelected,
  onToggleSelect,
  onMoveNext,
  onMoveToStage,
  onMarkShipped,
  onShowInventory
}) {
  const invStatus = order.inventory_status;
  
  return (
    <TableRow className="border-border">
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          data-testid={`select-order-${order.order_id}`}
        />
      </TableCell>
      <TableCell className="font-mono font-medium">
        {order.order_number || order.order_id?.slice(-8)}
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium">{order.customer_name || "N/A"}</p>
          <p className="text-xs text-muted-foreground">{order.customer_email || ""}</p>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {order.line_items?.length || order.items?.length || order.item_count || 0} items
        </Badge>
      </TableCell>
      <TableCell>
        <StockStatusBadge status={invStatus} onClick={onShowInventory} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {order.store_name || "—"}
      </TableCell>
      <TableCell className="text-right">
        <OrderActions
          order={order}
          stage={stage}
          stages={stages}
          nextStage={nextStage}
          isLastStage={isLastStage}
          onMoveNext={onMoveNext}
          onMoveToStage={onMoveToStage}
          onMarkShipped={onMarkShipped}
          onShowInventory={onShowInventory}
        />
      </TableCell>
    </TableRow>
  );
}

function StockStatusBadge({ status, onClick }) {
  if (!status) {
    return (
      <Badge variant="outline" className="text-muted-foreground cursor-pointer" onClick={onClick}>
        Unknown
      </Badge>
    );
  }

  if (status.all_in_stock) {
    return (
      <Badge 
        variant="outline" 
        className="border-green-500 text-green-500 gap-1 cursor-pointer hover:bg-green-500/10" 
        onClick={onClick}
      >
        <CheckCircle className="w-3 h-3" />
        In Stock
      </Badge>
    );
  }

  if (status.partial_stock) {
    return (
      <Badge 
        variant="outline" 
        className="border-orange-500 text-orange-500 gap-1 cursor-pointer hover:bg-orange-500/10" 
        onClick={onClick}
      >
        <AlertTriangle className="w-3 h-3" />
        Partial ({status.out_of_stock_count})
      </Badge>
    );
  }

  return (
    <Badge 
      variant="outline" 
      className="border-red-500 text-red-500 gap-1 cursor-pointer hover:bg-red-500/10" 
      onClick={onClick}
    >
      <XCircle className="w-3 h-3" />
      Out of Stock
    </Badge>
  );
}

function OrderActions({
  order,
  stage,
  stages,
  nextStage,
  isLastStage,
  onMoveNext,
  onMoveToStage,
  onMarkShipped,
  onShowInventory
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {!isLastStage && nextStage && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onMoveNext}
          className="gap-1"
          data-testid={`move-next-${order.order_id}`}
        >
          <ArrowRight className="w-4 h-4" />
          {nextStage.name}
        </Button>
      )}
      {isLastStage && (
        <Button
          size="sm"
          className="gap-1 bg-green-600 hover:bg-green-700"
          onClick={onMarkShipped}
          data-testid={`ship-${order.order_id}`}
        >
          <Truck className="w-4 h-4" />
          Ship
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onShowInventory}>
            <Info className="w-4 h-4 mr-2" />
            View Inventory Status
          </DropdownMenuItem>
          {stages.map((s) => (
            <DropdownMenuItem
              key={s.stage_id}
              onClick={() => onMoveToStage(s.stage_id)}
              disabled={s.stage_id === stage.stage_id}
            >
              <div 
                className="w-2 h-2 rounded-full mr-2" 
                style={{ backgroundColor: s.color }}
              />
              Move to {s.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
