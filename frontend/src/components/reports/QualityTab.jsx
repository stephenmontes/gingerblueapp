import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Boxes,
} from "lucide-react";

export function QualityTab({ productionKpis }) {
  const kpis = productionKpis || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quality Summary */}
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

        {/* Cost Summary */}
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
      </div>

      {/* Batch KPIs Table */}
      <Card className="bg-card border-border" data-testid="report-batch-kpis">
        <CardHeader>
          <CardTitle>Batch Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {kpis?.batches?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Good</TableHead>
                  <TableHead className="text-right">Rejection %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kpis.batches.map((batch) => (
                  <TableRow key={batch.batch_id} className="border-border">
                    <TableCell className="font-medium">{batch.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={batch.status === "active" ? "text-green-400 border-green-400/30" : "text-muted-foreground"}>
                        {batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{batch.completed}</TableCell>
                    <TableCell className="text-right font-mono text-red-400">{batch.rejected}</TableCell>
                    <TableCell className="text-right font-mono text-green-400">{batch.good_frames}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={batch.rejection_rate > 5 ? "text-red-400 border-red-400/30 bg-red-500/10" : "text-muted-foreground"}>
                        {batch.rejection_rate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No batch data available</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
