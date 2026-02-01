import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { User, Timer } from "lucide-react";

export function BatchCard({ batch, isSelected, onSelect }) {
  const totalItems = batch.total_items || 0;
  const itemsCompleted = batch.items_completed || 0;
  const progress = totalItems > 0 ? (itemsCompleted / totalItems) * 100 : 0;
  const isRunning = batch.time_started && !batch.time_completed;
  const orderCount = batch.order_ids ? batch.order_ids.length : 0;

  return (
    <Card
      className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary" : "hover:border-primary/50"}`}
      onClick={() => onSelect(batch)}
      data-testid={`batch-card-${batch.batch_id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">{batch.name}</h3>
          <Badge variant="secondary">{batch.status}</Badge>
        </div>
        <div className="text-sm text-muted-foreground mb-2">
          {orderCount} orders • {totalItems} items
        </div>
        {batch.assigned_name && (
          <div className="text-sm mb-2 flex items-center gap-1">
            <User className="w-4 h-4 text-primary" />
            {batch.assigned_name}
          </div>
        )}
        {isRunning && (
          <div className="text-sm text-green-400 mb-2 flex items-center gap-1">
            <Timer className="w-4 h-4 animate-pulse" />
            Timer running
          </div>
        )}
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground text-right mt-1">
          {itemsCompleted}/{totalItems}
        </p>
      </CardContent>
    </Card>
  );
}
