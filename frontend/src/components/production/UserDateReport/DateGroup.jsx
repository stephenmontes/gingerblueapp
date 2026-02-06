import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Clock, Calendar, DollarSign, Layers } from "lucide-react";
import { ProductionUserList } from "./UserList";

export function ProductionDateGroup({ dateData, dailyLimit }) {
  const [isOpen, setIsOpen] = useState(true);
  const formattedDate = new Date(dateData.date).toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{formattedDate}</span>
            <Badge variant="secondary">{dateData.users.length} users</Badge>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Hours</p>
              <p className="font-bold">{dateData.totalHours.toFixed(1)}h</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Labor Cost</p>
              <p className="font-bold text-green-400">${dateData.totalCost.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Frames</p>
              <p className="font-bold">{dateData.totalFrames}</p>
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ProductionUserList users={dateData.users} dailyLimit={dailyLimit} />
        
        {/* Subtotal Row */}
        <div className="flex items-center justify-between p-3 bg-primary/5 border-t border-border mt-2 rounded-b-lg">
          <span className="font-medium text-sm">Subtotal for {dateData.date}</span>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span className="font-bold">{dateData.totalHours.toFixed(1)}h</span>
            </div>
            <div className="flex items-center gap-1 text-green-400">
              <DollarSign className="w-3 h-3" />
              <span className="font-bold">{dateData.totalCost.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              <span>{dateData.totalFrames} frames</span>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
