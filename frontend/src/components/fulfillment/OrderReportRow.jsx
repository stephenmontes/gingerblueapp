import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Users } from "lucide-react";

export function OrderReportRow({ order, onViewDetails }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <TableRow className="border-border hover:bg-muted/30">
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        </TableCell>
        <TableCell>
          <button
            onClick={onViewDetails}
            className="font-mono font-medium hover:text-primary hover:underline"
          >
            #{order.order_number}
          </button>
        </TableCell>
        <TableCell>{order.customer_name}</TableCell>
        <TableCell className="text-right font-mono">
          {formatTime(order.total_minutes)}
        </TableCell>
        <TableCell className="text-right">{order.total_items}</TableCell>
        <TableCell className="text-right font-mono text-green-400">
          ${order.cost_per_item.toFixed(2)}
        </TableCell>
        <TableCell className="text-right font-mono font-medium text-primary">
          ${order.labor_cost.toFixed(2)}
        </TableCell>
        <TableCell className="text-center">
          <div className="flex justify-center gap-1">
            {order.users.slice(0, 3).map((user, i) => (
              <Badge 
                key={i} 
                variant="outline" 
                className="text-xs"
                title={`${user.user_name}: ${formatTime(user.minutes)}`}
              >
                {user.user_name.split(' ')[0]}
              </Badge>
            ))}
            {order.users.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{order.users.length - 3}
              </Badge>
            )}
          </div>
        </TableCell>
      </TableRow>
      
      {isOpen && (
        <TableRow className="border-border bg-muted/20">
          <TableCell colSpan={8} className="py-3">
            <div className="pl-8 space-y-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Time by Stage</p>
              <div className="flex gap-4 flex-wrap">
                {order.stages.map((stage, i) => (
                  <div key={i} className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-lg">
                    <span className="text-sm">{stage.stage_name}</span>
                    <Badge variant="secondary" className="font-mono">
                      {formatTime(stage.minutes)}
                    </Badge>
                  </div>
                ))}
              </div>
              
              <p className="text-xs font-medium text-muted-foreground mb-2 mt-4">Time by User</p>
              <div className="flex gap-4 flex-wrap">
                {order.users.map((user, i) => (
                  <div key={i} className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-lg">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm">{user.user_name}</span>
                    <Badge variant="secondary" className="font-mono">
                      {formatTime(user.minutes)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function formatTime(minutes) {
  if (!minutes || minutes === 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
