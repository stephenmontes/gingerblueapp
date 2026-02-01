import { Card, CardContent } from "@/components/ui/card";
import {
  Package,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  DollarSign,
} from "lucide-react";

export function KpiCards({ dashboardStats, productionKpis }) {
  const kpis = productionKpis || {};

  return (
    <>
      {/* Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  {dashboardStats?.orders?.total || 0}
                </p>
                <p className="text-xs text-muted-foreground">Total Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  {kpis?.production?.good_frames || 0}
                </p>
                <p className="text-xs text-muted-foreground">Good Frames</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-red-400">
                  {kpis?.production?.total_rejected || 0}
                </p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-border ${(kpis?.quality?.rejection_rate || 0) > 5 ? "bg-red-500/10 border-red-500/30" : "bg-card"}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${(kpis?.quality?.rejection_rate || 0) > 5 ? "bg-red-500/20" : "bg-orange-500/10"}`}>
                <AlertTriangle className={`w-5 h-5 ${(kpis?.quality?.rejection_rate || 0) > 5 ? "text-red-500" : "text-orange-500"}`} />
              </div>
              <div>
                <p className={`text-2xl font-heading font-bold ${(kpis?.quality?.rejection_rate || 0) > 5 ? "text-red-400" : ""}`}>
                  {kpis?.quality?.rejection_rate || 0}%
                </p>
                <p className="text-xs text-muted-foreground">Rejection Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  {kpis?.time?.total_hours || 0}h
                </p>
                <p className="text-xs text-muted-foreground">Total Hours</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/10">
                <TrendingUp className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  {kpis?.time?.avg_items_per_hour || 0}
                </p>
                <p className="text-xs text-muted-foreground">Items/Hour</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <DollarSign className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  ${kpis?.costs?.total_labor_cost || 0}
                </p>
                <p className="text-xs text-muted-foreground">Labor Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <DollarSign className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  ${kpis?.costs?.avg_cost_per_frame || 0}
                </p>
                <p className="text-xs text-muted-foreground">Avg Cost/Frame</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
