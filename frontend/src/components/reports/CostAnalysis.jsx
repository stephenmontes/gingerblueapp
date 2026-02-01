import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, DollarSign, Boxes } from "lucide-react";

export function CostAnalysis({ productionKpis }) {
  const kpis = productionKpis || {};

  return (
    <Card className="bg-card border-border" data-testid="report-cost-summary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Cost Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Hourly Rate</p>
              <p className="text-3xl font-bold">${kpis?.costs?.hourly_rate || 22}/hr</p>
            </div>
            <Clock className="w-10 h-10 text-blue-500/50" />
          </div>
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Total Labor Cost</p>
              <p className="text-3xl font-bold text-emerald-400">${kpis?.costs?.total_labor_cost || 0}</p>
            </div>
            <DollarSign className="w-10 h-10 text-emerald-500/50" />
          </div>
          <div className="flex items-center justify-between p-4 bg-purple-500/10 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Avg Cost Per Frame</p>
              <p className="text-3xl font-bold text-purple-400">${kpis?.costs?.avg_cost_per_frame || 0}</p>
            </div>
            <Boxes className="w-10 h-10 text-purple-500/50" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
