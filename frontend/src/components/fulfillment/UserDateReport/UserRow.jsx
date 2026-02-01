import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

export function UserRow({ userData, dailyLimit }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const exceeds = userData.total_hours > dailyLimit;

  return (
    <div className={exceeds ? 'bg-red-500/5' : ''}>
      <div className="grid grid-cols-7 gap-2 p-2 items-center text-sm">
        <div className="w-8">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </Button>
        </div>
        <div className="font-medium">{userData.user_name}</div>
        <div className={`text-right font-mono ${exceeds ? 'text-red-400 font-bold' : ''}`}>
          {userData.total_hours.toFixed(1)}h
        </div>
        <div className="text-right font-mono text-green-400">
          ${userData.labor_cost.toFixed(2)}
        </div>
        <div className="text-right">{userData.total_orders}</div>
        <div className="text-right">{userData.total_items}</div>
        <div>
          {exceeds && (
            <Badge variant="outline" className="border-red-500 text-red-500 gap-1 text-xs">
              <AlertTriangle className="w-3 h-3" />
              Over {dailyLimit}h
            </Badge>
          )}
        </div>
      </div>
      
      {isExpanded && userData.entries && userData.entries.length > 0 && (
        <div className="p-3 pl-10 bg-muted/10 border-t border-border">
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
      )}
    </div>
  );
}
