import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
  Package, 
  Clock, 
  DollarSign, 
  Layers,
  ChevronRight,
  Factory,
  Truck,
  RefreshCw,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";

export function BatchReports() {
  const [batchesSummary, setBatchesSummary] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchDetail, setBatchDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchBatchesSummary = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/stats/batches-summary?limit=50`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setBatchesSummary(data);
      } else {
        toast.error("Failed to load batch reports");
      }
    } catch (error) {
      console.error("Error fetching batch summary:", error);
      toast.error("Failed to load batch reports");
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchDetail = async (batchId) => {
    try {
      setDetailLoading(true);
      const response = await fetch(`${API}/stats/batch/${batchId}`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setBatchDetail(data);
      } else {
        toast.error("Failed to load batch details");
      }
    } catch (error) {
      console.error("Error fetching batch detail:", error);
      toast.error("Failed to load batch details");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchBatchesSummary();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      fetchBatchDetail(selectedBatch);
    }
  }, [selectedBatch]);

  const formatCurrency = (value) => `$${(value || 0).toFixed(2)}`;
  const formatHours = (value) => `${(value || 0).toFixed(1)}h`;

  const getStatusColor = (status) => {
    const colors = {
      active: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      completed: "bg-green-500/20 text-green-400 border-green-500/30",
      archived: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    };
    return colors[status] || colors.active;
  };

  if (loading) {
    return (
      <div className="space-y-4" data-testid="batch-reports-loading">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  const totals = batchesSummary?.totals || {};
  const batches = batchesSummary?.batches || [];

  return (
    <div className="space-y-6" data-testid="batch-reports">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Batches</p>
                <p className="text-2xl font-bold">{totals.batch_count || 0}</p>
              </div>
              <Package className="w-8 h-8 text-primary/60" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-2xl font-bold">{formatHours(totals.total_hours)}</p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span className="text-amber-400">
                    <Factory className="w-3 h-3 inline mr-1" />
                    {formatHours(totals.production_hours)}
                  </span>
                  <span className="text-blue-400">
                    <Truck className="w-3 h-3 inline mr-1" />
                    {formatHours(totals.fulfillment_hours)}
                  </span>
                </div>
              </div>
              <Clock className="w-8 h-8 text-primary/60" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <p className="text-2xl font-bold">{formatCurrency(totals.total_cost)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-primary/60" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Cost/Frame</p>
                <p className="text-2xl font-bold">{formatCurrency(totals.avg_cost_per_frame)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totals.total_good_frames || 0} good frames
                </p>
              </div>
              <Layers className="w-8 h-8 text-primary/60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time Breakdown Chart */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Production vs Fulfillment Time</CardTitle>
              <CardDescription>Time breakdown across all batches</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchBatchesSummary}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 min-w-[140px]">
                <Factory className="w-4 h-4 text-amber-400" />
                <span className="text-sm">Production</span>
              </div>
              <div className="flex-1">
                <Progress 
                  value={totals.total_hours > 0 ? (totals.production_hours / totals.total_hours) * 100 : 0} 
                  className="h-3 bg-muted"
                />
              </div>
              <span className="text-sm font-medium min-w-[60px] text-right">
                {formatHours(totals.production_hours)}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 min-w-[140px]">
                <Truck className="w-4 h-4 text-blue-400" />
                <span className="text-sm">Fulfillment</span>
              </div>
              <div className="flex-1">
                <Progress 
                  value={totals.total_hours > 0 ? (totals.fulfillment_hours / totals.total_hours) * 100 : 0} 
                  className="h-3 bg-muted [&>div]:bg-blue-500"
                />
              </div>
              <span className="text-sm font-medium min-w-[60px] text-right">
                {formatHours(totals.fulfillment_hours)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Batch List */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Batch Cost Breakdown</CardTitle>
          <CardDescription>Click a batch to view detailed time tracking</CardDescription>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No batches found. Create batches from the Orders page to see reports.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Frames</TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      <Factory className="w-3 h-3 text-amber-400" />
                      Production
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      <Truck className="w-3 h-3 text-blue-400" />
                      Fulfillment
                    </span>
                  </TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">$/Frame</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow 
                    key={batch.batch_id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedBatch(batch.batch_id)}
                    data-testid={`batch-row-${batch.batch_id}`}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{batch.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {batch.order_count} orders
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(batch.status)}>
                        {batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-medium">{batch.frames?.good || 0}</span>
                      <span className="text-muted-foreground">/{batch.frames?.total || 0}</span>
                    </TableCell>
                    <TableCell className="text-right text-amber-400">
                      {formatHours(batch.time?.production_hours)}
                    </TableCell>
                    <TableCell className="text-right text-blue-400">
                      {formatHours(batch.time?.fulfillment_hours)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(batch.cost?.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(batch.cost?.per_frame)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Batch Detail Dialog */}
      <Dialog open={!!selectedBatch} onOpenChange={() => setSelectedBatch(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {batchDetail?.batch?.name || "Batch Details"}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-4 py-4">
              <div className="h-20 bg-muted animate-pulse rounded" />
              <div className="h-40 bg-muted animate-pulse rounded" />
            </div>
          ) : batchDetail ? (
            <div className="space-y-6" data-testid="batch-detail-content">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Orders</p>
                  <p className="text-lg font-bold">{batchDetail.batch?.order_count || 0}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Good Frames</p>
                  <p className="text-lg font-bold">{batchDetail.frames?.good || 0}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Total Hours</p>
                  <p className="text-lg font-bold">{formatHours(batchDetail.time?.total_hours)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                  <p className="text-lg font-bold">{formatCurrency(batchDetail.costs?.total_cost)}</p>
                </div>
              </div>

              {/* Time Breakdown */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Time Breakdown
                </h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Factory className="w-4 h-4 text-amber-400" />
                      <span className="font-medium">Production</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-400">
                      {formatHours(batchDetail.time?.production_hours)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(batchDetail.costs?.production_cost)}
                    </p>
                  </div>
                  
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Truck className="w-4 h-4 text-blue-400" />
                      <span className="font-medium">Fulfillment</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-400">
                      {formatHours(batchDetail.time?.fulfillment_hours)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(batchDetail.costs?.fulfillment_cost)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stage Breakdown */}
              {(batchDetail.stages?.production?.length > 0 || batchDetail.stages?.fulfillment?.length > 0) && (
                <div className="space-y-4">
                  <h4 className="font-medium">Stage Breakdown</h4>
                  
                  {batchDetail.stages?.production?.length > 0 && (
                    <div>
                      <p className="text-sm text-amber-400 mb-2 flex items-center gap-1">
                        <Factory className="w-3 h-3" />
                        Production Stages
                      </p>
                      <div className="space-y-2">
                        {batchDetail.stages.production.map((stage) => (
                          <div 
                            key={stage.stage_id} 
                            className="flex items-center justify-between bg-muted/30 rounded px-3 py-2"
                          >
                            <span className="text-sm">{stage.stage_name}</span>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-muted-foreground">{stage.sessions} sessions</span>
                              <span className="text-amber-400 font-medium">{formatHours(stage.total_hours)}</span>
                              <span className="text-muted-foreground">{formatCurrency(stage.cost)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {batchDetail.stages?.fulfillment?.length > 0 && (
                    <div>
                      <p className="text-sm text-blue-400 mb-2 flex items-center gap-1">
                        <Truck className="w-3 h-3" />
                        Fulfillment Stages
                      </p>
                      <div className="space-y-2">
                        {batchDetail.stages.fulfillment.map((stage) => (
                          <div 
                            key={stage.stage_id} 
                            className="flex items-center justify-between bg-muted/30 rounded px-3 py-2"
                          >
                            <span className="text-sm">{stage.stage_name}</span>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-muted-foreground">{stage.orders_processed} orders</span>
                              <span className="text-blue-400 font-medium">{formatHours(stage.total_hours)}</span>
                              <span className="text-muted-foreground">{formatCurrency(stage.cost)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Cost Per Frame */}
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Cost Per Good Frame</p>
                    <p className="text-3xl font-bold text-green-400">
                      {formatCurrency(batchDetail.costs?.cost_per_frame)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Hourly Rate</p>
                    <p className="text-lg font-medium">
                      {formatCurrency(batchDetail.costs?.hourly_rate)}/hr
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Failed to load batch details
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
