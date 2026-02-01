import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

export function UserRow({ userData, dailyLimit }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const exceeds = userData.total_hours > dailyLimit;

  return (
    <>
      <TableRow className={`border-border ${exceeds ? 'bg-red-500/5' : ''}`}>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </Button>
        </TableCell>
        <TableCell className="font-medium">{userData.user_name}</TableCell>
        <TableCell className={`text-right font-mono ${exceeds ? 'text-red-400 font-bold' : ''}`}>
          {userData.total_hours.toFixed(1)}h
        </TableCell>
        <TableCell className="text-right font-mono text-green-400">
          ${userData.labor_cost.toFixed(2)}
        </TableCell>
        <TableCell className="text-right">{userData.total_orders}</TableCell>
        <TableCell className="text-right">{userData.total_items}</TableCell>
        <TableCell>
          {exceeds && (
            <Badge variant="outline" className="border-red-500 text-red-500 gap-1">
              <AlertTriangle className="w-3 h-3" />
              Over {dailyLimit}h
            </Badge>
          )}
        </TableCell>
      </TableRow>
      
      {isExpanded && userData.entries && userData.entries.length > 0 && (
        <TableRow className="border-border bg-muted/10">
          <TableCell colSpan={7} className="p-0">
            <div className="p-3 pl-10">
              <p className="text-xs font-medium text-muted-foreground mb-2">Time Entries</p>
              <div className="space-y-1">
                {userData.entries.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 px-2 bg-background/50 rounded">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">{entry.stage_name}</Badge>
                      {entry.order_number && (
                        <span className="font-mono text-xs">#{entry.order_number}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{entry.items_processed} items</span>
                      <span className="font-mono">{entry.duration_minutes}m</span>
                      <span className="text-xs">
                        {entry.completed_at ? new Date(entry.completed_at).toLocaleTimeString() : ''}
                      </span>
                    </div>
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
