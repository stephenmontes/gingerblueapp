import { Card, CardContent } from "@/components/ui/card";
import { Package, Printer, Frame, CheckCircle, Truck, AlertTriangle } from "lucide-react";

const stageIcons = {
  fulfill_orders: Package,
  fulfill_print: Printer,
  fulfill_mount: Frame,
  fulfill_finish: CheckCircle,
  fulfill_pack: Truck,
};

export function FulfillmentSummary({ summary, onStageClick }) {
  if (!summary) return null;

  return (
    <div className="space-y-4" data-testid="fulfillment-summary">
      {/* Low Stock Alert Banner */}
      {summary.total_out_of_stock > 0 && (
        <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <div>
            <p className="text-sm font-medium text-orange-400">
              {summary.total_out_of_stock} orders have insufficient inventory
            </p>
            <p className="text-xs text-orange-400/70">
              Check stock levels before moving orders to Pack and Ship
            </p>
          </div>
        </div>
      )}

      {/* Stage Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Unassigned Orders */}
        <Card 
          className="bg-card border-border cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => onStageClick && onStageClick({ stage_id: "unassigned", stage_name: "Unassigned", color: "#6B7280" })}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <Package className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-2xl font-bold">{summary.unassigned_count}</p>
            <p className="text-xs text-muted-foreground">Unassigned</p>
          </CardContent>
        </Card>

        {/* Stage Cards */}
        {summary.stages?.map((stage) => {
          const Icon = stageIcons[stage.stage_id] || Package;
          const hasStockIssues = stage.out_of_stock_count > 0;
          
          return (
            <Card 
              key={stage.stage_id} 
              className={`bg-card border-border cursor-pointer hover:border-primary/50 transition-colors ${hasStockIssues ? 'border-orange-500/30' : ''}`}
              onClick={() => onStageClick && onStageClick(stage)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${stage.color}20` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: stage.color }} />
                  </div>
                  {hasStockIssues && (
                    <div className="flex items-center gap-1 text-orange-500">
                      <AlertTriangle className="w-3 h-3" />
                      <span className="text-xs">{stage.out_of_stock_count}</span>
                    </div>
                  )}
                </div>
                <p className="text-2xl font-bold">{stage.count}</p>
                <p className="text-xs text-muted-foreground truncate">{stage.stage_name}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
