import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  BarChart3, 
  Clock, 
  DollarSign, 
  Users, 
  User, 
  TrendingUp,
  Layers,
  Loader2,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";


export function ProductionBatchReportDialog({ batch, isOpen, onClose, user }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && batch) {
      loadReport();
    }
  }, [isOpen, batch]);

  async function loadReport() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/batches/${batch.batch_id}/report`, {
        credentials: "include"
      });
      if (res.ok) {
        setReport(await res.json());
      } else {
        toast.error("Failed to load report");
      }
    } catch (err) {
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="production-batch-report-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Batch Time & Cost Report
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : report ? (
          <ScrollArea className="flex-1">
            <div className="space-y-6 pr-4">
              {/* Batch Info Header */}
              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{report.batch_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {report.batch_type === "on_demand" ? "On-Demand Batch" : "Order Batch"}
                    </p>
                  </div>
                  <Badge variant={report.status === "archived" ? "secondary" : "default"}>
                    {report.status}
                  </Badge>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-muted/30">
                  <CardContent className="p-4 text-center">
                    <Layers className="w-6 h-6 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{report.production_summary.total_frames}</p>
                    <p className="text-xs text-muted-foreground">Total Frames</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4 text-center">
                    <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-green-400" />
                    <p className="text-2xl font-bold">{report.production_summary.frames_completed}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                    <p className="text-2xl font-bold">{report.metrics.items_per_hour}</p>
                    <p className="text-xs text-muted-foreground">Frames/Hour</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4 text-center">
                    <DollarSign className="w-6 h-6 mx-auto mb-2 text-yellow-400" />
                    <p className="text-2xl font-bold">${report.time_summary.total_cost}</p>
                    <p className="text-xs text-muted-foreground">Total Cost</p>
                  </CardContent>
                </Card>
              </div>

              {/* Production Progress */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Production Progress
                </h3>
                <div className="p-4 bg-muted/20 rounded-lg">
                  <div className="flex justify-between text-sm mb-2">
                    <span>Completion Rate</span>
                    <span className="font-medium">{report.production_summary.completion_rate}%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all"
                      style={{ width: `${report.production_summary.completion_rate}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>{report.production_summary.frames_completed} completed</span>
                    {report.production_summary.frames_rejected > 0 && (
                      <span className="text-red-400 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        {report.production_summary.frames_rejected} rejected
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Time Breakdown by Stage */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Time by Stage
                </h3>
                {report.stage_breakdown.length > 0 ? (
                  <div className="space-y-2">
                    {report.stage_breakdown.map((stage) => (
                      <div key={stage.stage_id} className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">{stage.stage_name}</span>
                          <div className="text-right text-sm">
                            <span className="font-medium">{stage.total_hours} hrs</span>
                            {/* Only show stage cost for admins/managers */}
                            {(user?.role === "admin" || user?.role === "manager") && (
                              <span className="text-muted-foreground ml-2">(${stage.total_cost})</span>
                            )}
                          </div>
                        </div>
                        {stage.workers.length > 0 && (
                          <div className="pl-4 space-y-1">
                            {stage.workers.map((worker) => (
                              <div key={worker.user_id} className="flex justify-between text-xs text-muted-foreground">
                                <span>{worker.user_name}</span>
                                <span>
                                  {(worker.total_minutes / 60).toFixed(1)} hrs
                                  {/* Only show worker cost for self or admins */}
                                  {(user?.user_id === worker.user_id || user?.role === "admin" || user?.role === "manager") && (
                                    <> • ${worker.cost.toFixed(2)}</>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="flex justify-between p-3 bg-primary/20 rounded-lg font-semibold">
                      <span>Total Time</span>
                      <span>{report.time_summary.total_hours} hours</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No time logged yet</p>
                )}
              </div>

              {/* Workers Breakdown */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Worker Performance
                </h3>
                {report.worker_breakdown.length > 0 ? (
                  <div className="space-y-2">
                    {report.worker_breakdown.map((worker) => (
                      <div key={worker.user_id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{worker.user_name}</span>
                          {worker.is_active && (
                            <Badge className="bg-green-500/20 text-green-400 text-xs">Active</Badge>
                          )}
                        </div>
                        <div className="text-right text-sm">
                          <p>{worker.total_hours} hrs • {worker.items_per_hour} frames/hr</p>
                          {/* Only show cost for current user or admins */}
                          {(user?.user_id === worker.user_id || user?.role === "admin" || user?.role === "manager") && (
                            <p className="text-muted-foreground">
                              ${worker.hourly_rate}/hr → ${worker.cost}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No workers have logged time yet</p>
                )}
              </div>

              {/* Cost Summary - Only for admins/managers */}
              {(user?.role === "admin" || user?.role === "manager") && (
                <div className="p-4 bg-primary/10 rounded-lg">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Hourly Rate</p>
                      <p className="text-xl font-bold">${report.metrics.avg_hourly_rate}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Cost per Frame</p>
                      <p className="text-xl font-bold">${report.metrics.cost_per_item}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Cost</p>
                      <p className="text-xl font-bold">${report.time_summary.total_cost}</p>
                    </div>
                  </div>
                  {report.time_summary.active_timers_count > 0 && (
                    <div className="text-center mt-3 text-sm text-muted-foreground">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {report.time_summary.active_timers_count} active timer{report.time_summary.active_timers_count > 1 ? 's' : ''} included
                    </div>
                )}
              </div>
            </div>
          </ScrollArea>
        ) : (
          <p className="text-center text-muted-foreground py-8">No report data available</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
