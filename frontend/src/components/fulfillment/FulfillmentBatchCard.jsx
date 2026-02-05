import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { User, Users, Timer, Package, Store, Truck } from "lucide-react";

export function FulfillmentBatchCard({ batch, isSelected, onSelect }) {
  const orderCount = batch.order_ids?.length || batch.order_count || 0;
  const isRunning = batch.timer_active && !batch.timer_paused;
  const activeWorkers = batch.active_workers || [];
  
  // Determine card background color based on store
  const getStoreColor = () => {
    const storeId = batch.store_id;
    const storeType = batch.store_type;
    
    // ShipStation orders (Etsy, Antique Farmhouse) = yellow
    if (storeType === "shipstation" || batch.is_shipstation_batch) {
      return "bg-yellow-500/10 border-yellow-500/30";
    }
    
    // Mixed stores = yellow
    if (storeType === "mixed") {
      return "bg-yellow-500/10 border-yellow-500/30";
    }
    
    // GB Home (wholesale) = light blue
    if (storeId === "store_gb_wholesale" || batch.store_name?.toLowerCase().includes("home")) {
      return "bg-blue-500/10 border-blue-500/30";
    }
    
    // GB Decor (retail) = light green
    if (storeId === "store_gb_retail" || batch.store_name?.toLowerCase().includes("decor")) {
      return "bg-green-500/10 border-green-500/30";
    }
    
    return "";
  };

  const storeColor = getStoreColor();
  
  // Get store display name
  const getStoreDisplay = () => {
    if (batch.store_type === "shipstation" || batch.is_shipstation_batch) {
      return { name: "ShipStation", icon: Truck };
    }
    if (batch.store_type === "mixed") {
      return { name: "Mixed", icon: Store };
    }
    return { name: batch.store_name || "Store", icon: Store };
  };
  
  const storeDisplay = getStoreDisplay();
  const StoreIcon = storeDisplay.icon;

  // Calculate progress if available
  const completedOrders = batch.orders_completed || 0;
  const progress = orderCount > 0 ? (completedOrders / orderCount) * 100 : 0;

  return (
    <Card
      className={`cursor-pointer transition-all ${storeColor} ${isSelected ? "ring-2 ring-primary" : "hover:border-primary/50"}`}
      onClick={() => onSelect(batch)}
      data-testid={`fulfillment-batch-card-${batch.batch_id || batch.fulfillment_batch_id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold truncate">{batch.name}</h3>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <StoreIcon className="w-3 h-3" />
              {storeDisplay.name}
            </Badge>
            {isRunning && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                <Timer className="w-3 h-3 mr-1" />
                Running
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Package className="w-4 h-4" />
            {orderCount} orders
          </span>
          {activeWorkers.length > 0 ? (
            <span className="flex items-center gap-1 text-green-400">
              <Users className="w-4 h-4" />
              {activeWorkers.length} working
            </span>
          ) : batch.assigned_name && (
            <span className="flex items-center gap-1">
              <User className="w-4 h-4" />
              {batch.assigned_name}
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{completedOrders} / {orderCount} completed</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Current Stage */}
        {batch.current_stage_name && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <span className="text-xs text-muted-foreground">
              Stage: <strong>{batch.current_stage_name}</strong>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
