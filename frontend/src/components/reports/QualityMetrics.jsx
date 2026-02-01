import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export function QualityMetrics({ productionKpis }) {
  const kpis = productionKpis || {};

  return (
    <Card className="bg-card border-border" data-testid="report-quality-summary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Quality Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Yield Rate</p>
              <p className="text-3xl font-bold text-green-400">{kpis?.quality?.yield_rate || 100}%</p>
            </div>
            <CheckCircle className="w-10 h-10 text-green-500/50" />
          </div>
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Rejection Rate</p>
              <p className={`text-3xl font-bold ${(kpis?.quality?.rejection_rate || 0) > 5 ? "text-red-400" : "text-orange-400"}`}>
                {kpis?.quality?.rejection_rate || 0}%
              </p>
            </div>
            <XCircle className="w-10 h-10 text-red-500/50" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-green-400">{kpis?.production?.good_frames || 0}</p>
              <p className="text-xs text-muted-foreground">Good Frames</p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-red-400">{kpis?.production?.total_rejected || 0}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
