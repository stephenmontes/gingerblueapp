import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Play, Pause, Package, CheckCircle2, ArrowRight, User, Layers, Timer } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export default function Production({ user }) {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchDetails, setBatchDetails] = useState(null);
  const [stageSummary, setStageSummary] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState(null);

  useEffect(() => {
    fetchBatches();
    fetchStages();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      fetchBatchDetails(selectedBatch.batch_id);
    }
  }, [selectedBatch]);

  async function fetchBatches() {
    try {
      const res = await fetch(API + "/batches", { credentials: "include" });
      if (res.ok) setBatches(await res.json());
    } catch (err) {
      toast.error("Failed to load batches");
    } finally {
      setLoading(false);
    }
  }

  async function fetchStages() {
    try {
      const res = await fetch(API + "/stages", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStages(data);
        if (data.length > 1) setActiveStage(data[1].stage_id);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchBatchDetails(batchId) {
    try {
      const [detailsRes, summaryRes] = await Promise.all([
        fetch(API + "/batches/" + batchId, { credentials: "include" }),
        fetch(API + "/batches/" + batchId + "/stage-summary", { credentials: "include" }),
      ]);
      
      if (detailsRes.ok) setBatchDetails(await detailsRes.json());
      if (summaryRes.ok) setStageSummary(await summaryRes.json());
    } catch (err) {
      toast.error("Failed to load batch details");
    }
  }

  async function handleStartTimer() {
    if (!selectedBatch) return;
    try {
      const res = await fetch(API + "/batches/" + selectedBatch.batch_id + "/start-timer", { method: "POST", credentials: "include" });
      if (res.ok) {
        toast.success("Timer started - you are now responsible for this batch");
        fetchBatches();
        fetchBatchDetails(selectedBatch.batch_id);
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to start timer");
      }
    } catch (err) {
      toast.error("Failed to start timer");
    }
  }

  async function handleStopTimer() {
    if (!selectedBatch) return;
    try {
      const res = await fetch(API + "/batches/" + selectedBatch.batch_id + "/stop-timer", { method: "POST", credentials: "include" });
      if (res.ok) {
        const result = await res.json();
        toast.success("Timer stopped - " + result.duration_minutes.toFixed(1) + " minutes logged");
        fetchBatches();
        fetchBatchDetails(selectedBatch.batch_id);
      }
    } catch (err) {
      toast.error("Failed to stop timer");
    }
  }

  async function handleUpdateQty(itemId, qtyCompleted) {
    try {
      const res = await fetch(API + "/items/" + itemId + "/update?qty_completed=" + qtyCompleted, { method: "PUT", credentials: "include" });
      if (res.ok) {
        toast.success("Quantity updated");
        fetchBatchDetails(selectedBatch.batch_id);
        fetchBatches();
      }
    } catch (err) {
      toast.error("Failed to update quantity");
    }
  }

  async function handleMoveStage(itemId, newStageId, qtyCompleted) {
    try {
      const res = await fetch(API + "/items/" + itemId + "/move-stage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ item_id: itemId, new_stage_id: newStageId, qty_completed: qtyCompleted }),
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        fetchBatchDetails(selectedBatch.batch_id);
        fetchBatches();
      }
    } catch (err) {
      toast.error("Failed to move item");
    }
  }

  if (loading) {
    return <div className="space-y-6" data-testid="production-loading"><div className="h-8 w-48 bg-muted animate-pulse rounded" /></div>;
  }

  const isTimerRunning = batchDetails?.time_started && !batchDetails?.time_completed;
  const currentStageData = stageSummary.find(s => s.stage_id === activeStage);

  return (
    <div className="space-y-6" data-testid="production-page">
      <div>
        <h1 className="text-3xl font-heading font-bold">Frame Production</h1>
        <p className="text-muted-foreground mt-1">Manage production batches and track items through stages</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Batch List */}
        <div className="lg:col-span-1">
          <Card className="bg-card border-border">
            <CardHeader className="py-3">
              <CardTitle className="text-lg">Production Batches</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <ScrollArea className="h-[calc(100vh-300px)]">
                {batches.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">No batches yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {batches.map((batch) => {
                      const progress = batch.total_items > 0 ? (batch.items_completed / batch.total_items) * 100 : 0;
                      const isRunning = batch.time_started && !batch.time_completed;
                      return (
                        <Card
                          key={batch.batch_id}
                          className={`cursor-pointer transition-all ${selectedBatch?.batch_id === batch.batch_id ? "ring-2 ring-primary" : "hover:border-primary/50"}`}
                          onClick={() => setSelectedBatch(batch)}
                          data-testid={`batch-card-${batch.batch_id}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="font-semibold">{batch.name}</h3>
                              <Badge variant="secondary">{batch.status}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mb-2">
                              {batch.order_ids?.length || 0} orders • {batch.total_items} items
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
                            <p className="text-xs text-muted-foreground text-right mt-1">{batch.items_completed}/{batch.total_items}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Batch Details */}
        <div className="lg:col-span-3">
          {!selectedBatch ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <Layers className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Select a Batch</h2>
                <p className="text-muted-foreground">Choose a production batch from the list</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold">{selectedBatch.name}</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedBatch.order_ids?.length || 0} orders • {batchDetails?.total_items || 0} items
                        {batchDetails?.assigned_name && ` • Assigned: ${batchDetails.assigned_name}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Timer</p>
                        <div className="font-mono text-2xl font-bold text-primary">
                          {isTimerRunning ? (
                            <TimerComponent startedAt={batchDetails?.time_started} />
                          ) : (
                            "00:00:00"
                          )}
                        </div>
                      </div>
                      {isTimerRunning ? (
                        <Button onClick={handleStopTimer} variant="destructive" className="gap-2" data-testid="stop-timer-btn">
                          <Pause className="w-4 h-4" />Stop
                        </Button>
                      ) : (
                        <Button onClick={handleStartTimer} className="gap-2 bg-green-600 hover:bg-green-700" data-testid="start-timer-btn">
                          <Play className="w-4 h-4" />Start
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stage Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {stageSummary.slice(1).map((stage) => (
                  <Button
                    key={stage.stage_id}
                    variant={activeStage === stage.stage_id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveStage(stage.stage_id)}
                    className="flex items-center gap-2 whitespace-nowrap"
                    data-testid={`stage-tab-${stage.stage_id}`}
                  >
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                    {stage.stage_name}
                    <Badge variant="secondary">{stage.total_items}</Badge>
                  </Button>
                ))}
              </div>

              {/* Stage Content */}
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  {currentStageData ? (
                    <div>
                      <div className="mb-4 p-4 bg-muted/30 rounded-lg flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-lg">{currentStageData.stage_name}</h3>
                          <p className="text-sm text-muted-foreground">{currentStageData.total_items} items • {currentStageData.total_completed}/{currentStageData.total_required} completed</p>
                        </div>
                        <Progress value={(currentStageData.total_completed / Math.max(currentStageData.total_required, 1)) * 100} className="w-48" />
                      </div>
                      
                      {currentStageData.items.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>No items at this stage</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {currentStageData.items.map((item) => (
                            <ItemRowComponent 
                              key={item.item_id} 
                              item={item} 
                              stages={stages} 
                              onUpdateQty={handleUpdateQty} 
                              onMoveStage={handleMoveStage} 
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">Select a stage to view items</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimerComponent({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const update = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function ItemRowComponent({ item, stages, onUpdateQty, onMoveStage }) {
  const [qty, setQty] = useState(item.qty_completed || 0);
  const currentIdx = stages.findIndex(s => s.stage_id === item.current_stage_id);
  const nextStage = stages[currentIdx + 1];
  const progress = (item.qty_completed / item.qty_required) * 100;

  const colorLabels = { "B": "Black", "W": "White", "N": "Natural" };

  return (
    <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg border border-border" data-testid={`item-row-${item.item_id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate">{item.name}</span>
          <span className="text-xs text-muted-foreground font-mono">{item.sku}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-500 text-white">{colorLabels[item.color] || item.color}</span>
          <Badge variant="outline" className="font-mono">{item.size}</Badge>
        </div>
      </div>
      
      <div className="w-32">
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground text-center mt-1">{item.qty_completed}/{item.qty_required}</p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          min="0"
          max={item.qty_required}
          value={qty}
          onChange={(e) => setQty(Math.max(0, Math.min(item.qty_required, parseInt(e.target.value) || 0)))}
          className="w-16 text-center"
          data-testid={`qty-input-${item.item_id}`}
        />
        <Button size="sm" variant="outline" onClick={() => onUpdateQty(item.item_id, qty)} data-testid={`update-qty-${item.item_id}`}>Save</Button>
      </div>

      {nextStage && (
        <Button size="sm" onClick={() => onMoveStage(item.item_id, nextStage.stage_id, qty)} className="gap-1" data-testid={`move-item-${item.item_id}`}>
          <ArrowRight className="w-4 h-4" />{nextStage.name}
        </Button>
      )}

      {!nextStage && item.qty_completed >= item.qty_required && (
        <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Done</Badge>
      )}
    </div>
  );
}
