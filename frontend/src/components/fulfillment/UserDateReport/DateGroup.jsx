import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Clock, Calendar, DollarSign } from "lucide-react";
import { UserRow } from "./UserRow";

export function DateGroup({ dateData, dailyLimit }) {
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
              <p className="text-xs text-muted-foreground">Orders</p>
              <p className="font-bold">{dateData.totalOrders}</p>
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-muted/20">
                <TableHead className="w-8"></TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dateData.users.map((userData) => (
                <UserRow key={userData.user_id} userData={userData} dailyLimit={dailyLimit} />
              ))}
            </TableBody>
          </Table>
          
          {/* Subtotal Row */}
          <div className="flex items-center justify-between p-3 bg-primary/5 border-t border-border">
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
              <span>{dateData.totalOrders} orders</span>
              <span>{dateData.totalItems} items</span>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
