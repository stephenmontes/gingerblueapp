import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Users } from "lucide-react";

export function OrderReportRow({ order, onViewDetails }) {
  const [isOpen, setIsOpen] = useState(false);

  const userBadges = order.users.slice(0, 3).map((user, i) => (
    <Badge key={i} variant="outline" className="text-xs" title={`${user.user_name}: ${fmtTime(user.minutes)}`}>
      {user.user_name.split(' ')[0]}
    </Badge>
  ));

  // Determine cost percentage color based on threshold
  const getCostPercentColor = (percent) => {
    if (percent <= 5) return "text-green-400";
    if (percent <= 10) return "text-yellow-400";
    if (percent <= 15) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <>
      <TableRow className="border-border hover:bg-muted/30">
        <TableCell>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </TableCell>
        <TableCell>
          <button onClick={onViewDetails} className="font-mono font-medium hover:text-primary hover:underline">
            #{order.order_number}
          </button>
        </TableCell>
        <TableCell>{order.customer_name || "—"}</TableCell>
        <TableCell className="text-right font-mono">{fmtTime(order.total_minutes)}</TableCell>
        <TableCell className="text-right">{order.total_items}</TableCell>
        <TableCell className="text-right font-mono">
          {order.order_total > 0 ? `$${order.order_total.toFixed(2)}` : "—"}
        </TableCell>
        <TableCell className="text-right font-mono font-medium text-primary">${order.labor_cost.toFixed(2)}</TableCell>
        <TableCell className={`text-right font-mono font-medium ${getCostPercentColor(order.cost_percent)}`}>
          {order.order_total > 0 ? `${order.cost_percent.toFixed(1)}%` : "—"}
        </TableCell>
        <TableCell className="text-center">
          <div className="flex justify-center gap-1">
            {userBadges}
            {order.users.length > 3 && <Badge variant="outline" className="text-xs">+{order.users.length - 3}</Badge>}
          </div>
        </TableCell>
      </TableRow>
      {isOpen && <ExpandedRow order={order} />}
    </>
  );
}

function ExpandedRow({ order }) {
  return (
    <TableRow className="border-border bg-muted/20">
      <TableCell colSpan={9} className="py-3">
        <div className="pl-8 space-y-3">
          <StageBreakdown stages={order.stages} />
          <UserBreakdown users={order.users} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function StageBreakdown({ stages }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">Time by Stage</p>
      <div className="flex gap-4 flex-wrap">
        {stages.map((stage, i) => (
          <div key={i} className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-lg">
            <span className="text-sm">{stage.stage_name}</span>
            <Badge variant="secondary" className="font-mono">{fmtTime(stage.minutes)}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserBreakdown({ users }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2 mt-4">Time by User</p>
      <div className="flex gap-4 flex-wrap">
        {users.map((user, i) => (
          <div key={i} className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-lg">
            <Users className="w-3 h-3 text-muted-foreground" />
            <span className="text-sm">{user.user_name}</span>
            <Badge variant="secondary" className="font-mono">{fmtTime(user.minutes)}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtTime(mins) {
  if (!mins) return "0m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
