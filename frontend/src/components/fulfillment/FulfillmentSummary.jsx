import { Card, CardContent } from "@/components/ui/card";
import { Package, Printer, Frame, CheckCircle, Truck } from "lucide-react";

const stageIcons = {
  fulfill_orders: Package,
  fulfill_print: Printer,
  fulfill_mount: Frame,
  fulfill_finish: CheckCircle,
  fulfill_pack: Truck,
};

export function FulfillmentSummary({ summary }) {
  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="fulfillment-summary">
      {/* Unassigned Orders */}
      <Card className="bg-card border-border">
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
        return (
          <Card 
            key={stage.stage_id} 
            className="bg-card border-border"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${stage.color}20` }}
                >
                  <Icon className="w-4 h-4" style={{ color: stage.color }} />
                </div>
              </div>
              <p className="text-2xl font-bold">{stage.count}</p>
              <p className="text-xs text-muted-foreground truncate">{stage.stage_name}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
