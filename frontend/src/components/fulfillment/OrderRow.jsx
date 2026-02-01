import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { 
  MoreVertical, 
  ArrowRight, 
  Truck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Layers,
  ExternalLink,
  FileText,
  Printer
} from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  onShowInventory,
  onOpenWorksheet,
  onPrintOrder
}) {
  const navigate = useNavigate();
  const invStatus = order.inventory_status;

  function handleBatchClick() {
    if (order.batch_id) {
      navigate(`/production?batch=${order.batch_id}`);
    }
  }

  // Calculate completion status
  const items = order.items || order.line_items || [];
  const completedItems = items.filter(i => i.is_complete).length;
  const totalItems = items.length;
  const isAllComplete = totalItems > 0 && completedItems === totalItems;
  
  const isOrdersStage = stage.stage_id === "fulfill_orders";
  
  return (
    <TableRow className={`border-border ${isAllComplete ? 'bg-green-500/5' : ''}`}>
      {isOrdersStage && (
        <TableCell>
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            data-testid={`select-order-${order.order_id}`}
          />
        </TableCell>
      )}
      <TableCell className="font-mono font-medium">
        {stage.stage_id !== "fulfill_orders" ? (
          <button 
            onClick={onOpenWorksheet}
            className="hover:text-primary hover:underline cursor-pointer"
          >
            {order.order_number || order.order_id?.slice(-8)}
          </button>
        ) : (
          <span>{order.order_number || order.order_id?.slice(-8)}</span>
        )}
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium">{order.customer_name || "N/A"}</p>
          <p className="text-xs text-muted-foreground">{order.customer_email || ""}</p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {isAllComplete ? (
            <Badge variant="outline" className="border-green-500 text-green-500 gap-1">
              <CheckCircle className="w-3 h-3" />
              {totalItems} done
            </Badge>
          ) : totalItems > 0 && completedItems > 0 ? (
            <Badge variant="outline" className="border-orange-500 text-orange-500">
              {completedItems}/{totalItems}
            </Badge>
          ) : (
            <Badge variant="outline">
              {totalItems} items
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {order.batch_name ? (
          <Badge 
            variant="secondary" 
            className="gap-1 text-xs cursor-pointer hover:bg-primary/20 transition-colors"
            onClick={handleBatchClick}
            title="View batch in Frame Production"
          >
            <Layers className="w-3 h-3" />
            {order.batch_name}
            <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell>
        <StockStatusBadge status={invStatus} onClick={onShowInventory} />
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
          onOpenWorksheet={onOpenWorksheet}
          onPrintOrder={onPrintOrder}
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
  onShowInventory,
  onOpenWorksheet,
  onPrintOrder
}) {
  const isOrdersStage = stage.stage_id === "fulfill_orders";
  
  return (
    <div className="flex items-center justify-end gap-1">
      {isOrdersStage && !isLastStage && nextStage && (
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
      {!isOrdersStage && !isLastStage && (
        <Button
          size="sm"
          variant="outline"
          onClick={onOpenWorksheet}
          className="gap-1"
          data-testid={`open-worksheet-${order.order_id}`}
        >
          <FileText className="w-4 h-4" />
          Open Worksheet
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
          <DropdownMenuItem onClick={onPrintOrder} data-testid={`print-order-${order.order_id}`}>
            <Printer className="w-4 h-4 mr-2" />
            Print Order
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onShowInventory}>
            <Info className="w-4 h-4 mr-2" />
            View Inventory Status
          </DropdownMenuItem>
          {isOrdersStage && (
            <>
              <DropdownMenuSeparator />
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
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
