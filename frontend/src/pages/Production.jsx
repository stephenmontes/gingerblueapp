import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Play, Pause, Package, CheckCircle2, ArrowRight, User, Layers, Timer } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

function ColorBadge(props) {
  const colorMap = {
    "B": { bg: "bg-gray-800", text: "text-white", label: "Black" },
    "W": { bg: "bg-white border border-gray-300", text: "text-gray-900", label: "White" },
    "N": { bg: "bg-amber-100", text: "text-amber-900", label: "Natural" },
  };
  const c = colorMap[props.color] || { bg: "bg-gray-500", text: "text-white", label: props.color };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
}

function SizeBadge(props) {
  return <Badge variant="outline" className="font-mono">{props.size}</Badge>;
}

function TimerDisplay(props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(function() {
    if (!props.startedAt || !props.isRunning) return;
    
    const start = new Date(props.startedAt).getTime();
    const updateTimer = function() {
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return function() { clearInterval(interval); };
  }, [props.startedAt, props.isRunning]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  return (
    <div className="font-mono text-2xl font-bold text-primary">
      {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </div>
  );
}

function ItemRow(props) {
  const { item, stages, onUpdateQty, onMoveStage } = props;
  const [qtyInput, setQtyInput] = useState(item.qty_completed || 0);
  const currentStageIndex = stages.findIndex(function(s) { return s.stage_id === item.current_stage_id; });
  const nextStage = stages[currentStageIndex + 1];
  const progress = (item.qty_completed / item.qty_required) * 100;

  function handleQtyChange(value) {
    const newQty = Math.max(0, Math.min(item.qty_required, parseInt(value) || 0));
    setQtyInput(newQty);
  }

  function handleUpdateQty() {
    onUpdateQty(item.item_id, qtyInput);
  }

  function handleMoveToNext() {
    if (nextStage) {
      onMoveStage(item.item_id, nextStage.stage_id, qtyInput);
    }
  }

  return (
    <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg border border-border" data-testid={`item-row-${item.item_id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate">{item.name}</span>
          <span className="text-xs text-muted-foreground font-mono">{item.sku}</span>
        </div>
        <div className="flex items-center gap-2">
          <ColorBadge color={item.color} />
          <SizeBadge size={item.size} />
        </div>
      </div>
      
      <div className="flex items-center gap-2 w-48">
        <div className="flex-1">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1 text-center">{item.qty_completed} / {item.qty_required}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          min="0"
          max={item.qty_required}
          value={qtyInput}
          onChange={function(e) { handleQtyChange(e.target.value); }}
          className="w-20 text-center"
          data-testid={`qty-input-${item.item_id}`}
        />
        <Button size="sm" variant="outline" onClick={handleUpdateQty} data-testid={`update-qty-${item.item_id}`}>Save</Button>
      </div>

      {nextStage && (
        <Button size="sm" onClick={handleMoveToNext} className="gap-1" data-testid={`move-item-${item.item_id}`}>
          <ArrowRight className="w-4 h-4" />
          {nextStage.name}
        </Button>
      )}

      {!nextStage && item.qty_completed >= item.qty_required && (
        <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Complete</Badge>
      )}
    </div>
  );
}

function BatchCard(props) {
  const { batch, onSelect, isSelected } = props;
  const progress = batch.total_items > 0 ? (batch.items_completed / batch.total_items) * 100 : 0;
  const isTimerRunning = batch.time_started && !batch.time_completed;

  return (
    <Card
      className={`bg-card border-border cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary" : "hover:border-primary/50"}`}
      onClick={function() { onSelect(batch); }}
      data-testid={`batch-card-${batch.batch_id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{batch.name}</h3>
          <Badge variant={batch.status === "completed" ? "default" : "secondary"}>{batch.status}</Badge>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="w-4 h-4" />
            <span>{batch.order_ids?.length || 0} orders</span>
            <span>•</span>
            <span>{batch.total_items} items</span>
          </div>
          
          {batch.assigned_name && (
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-primary" />
              <span>{batch.assigned_name}</span>
            </div>
          )}
          
          {isTimerRunning && (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <Timer className="w-4 h-4 animate-pulse" />
              <span>Timer running</span>
            </div>
          )}
          
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">{batch.items_completed} / {batch.total_items} completed</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Production(props) {
  const { user } = props;
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchDetails, setBatchDetails] = useState(null);
  const [groupedItems, setGroupedItems] = useState([]);
  const [stageSummary, setStageSummary] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("stages");
  const [activeStageTab, setActiveStageTab] = useState(null);

  const fetchBatches = useCallback(async function() {
    try {
      const batchesRes = await fetch(API + "/batches", { credentials: "include" });
      const stagesRes = await fetch(API + "/stages", { credentials: "include" });
      
      if (batchesRes.ok) setBatches(await batchesRes.json());
      if (stagesRes.ok) {
        const stagesData = await stagesRes.json();
        setStages(stagesData);
        if (stagesData.length > 1) setActiveStageTab(stagesData[1].stage_id);
      }
    } catch (err) {
      toast.error("Failed to load batches");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBatchDetails = useCallback(async function(batchId) {
    try {
      const detailsRes = await fetch(API + "/batches/" + batchId, { credentials: "include" });
      const groupedRes = await fetch(API + "/batches/" + batchId + "/items-grouped", { credentials: "include" });
      const summaryRes = await fetch(API + "/batches/" + batchId + "/stage-summary", { credentials: "include" });
      
      if (detailsRes.ok) setBatchDetails(await detailsRes.json());
      if (groupedRes.ok) setGroupedItems(await groupedRes.json());
      if (summaryRes.ok) setStageSummary(await summaryRes.json());
    } catch (err) {
      toast.error("Failed to load batch details");
    }
  }, []);

  useEffect(function() { fetchBatches(); }, [fetchBatches]);

  useEffect(function() {
    if (selectedBatch) fetchBatchDetails(selectedBatch.batch_id);
  }, [selectedBatch, fetchBatchDetails]);

  function handleSelectBatch(batch) { setSelectedBatch(batch); }

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
    return (
      <div className="space-y-6" data-testid="production-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  const isTimerRunning = batchDetails?.time_started && !batchDetails?.time_completed;

  return (
    <div className="space-y-6" data-testid="production-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Frame Production</h1>
          <p className="text-muted-foreground mt-1">Manage production batches and track items through stages</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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
                    <p className="text-xs mt-1">Select orders to create a batch</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {batches.map(function(batch) {
                      return <BatchCard key={batch.batch_id} batch={batch} onSelect={handleSelectBatch} isSelected={selectedBatch?.batch_id === batch.batch_id} />;
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          {!selectedBatch ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <Layers className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Select a Batch</h2>
                <p className="text-muted-foreground">Choose a production batch from the list to view and manage items</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-heading font-bold">{selectedBatch.name}</h2>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span>{selectedBatch.order_ids?.length || 0} orders</span>
                        <span>•</span>
                        <span>{batchDetails?.total_items || 0} total items</span>
                        {batchDetails?.assigned_name && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1"><User className="w-4 h-4" />{batchDetails.assigned_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Timer</p>
                        {isTimerRunning ? (
                          <TimerDisplay startedAt={batchDetails?.time_started} isRunning={true} />
                        ) : (
                          <div className="font-mono text-2xl text-muted-foreground">00:00:00</div>
                        )}
                      </div>
                      
                      {isTimerRunning ? (
                        <Button onClick={handleStopTimer} variant="destructive" className="gap-2" data-testid="stop-timer-btn">
                          <Pause className="w-4 h-4" />Stop Timer
                        </Button>
                      ) : (
                        <Button onClick={handleStartTimer} className="gap-2 bg-green-600 hover:bg-green-700" data-testid="start-timer-btn">
                          <Play className="w-4 h-4" />Start Timer
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center gap-2">
                <Button variant={viewMode === "stages" ? "default" : "outline"} size="sm" onClick={function() { setViewMode("stages"); }} data-testid="view-stages-btn">By Stage</Button>
                <Button variant={viewMode === "grouped" ? "default" : "outline"} size="sm" onClick={function() { setViewMode("grouped"); }} data-testid="view-grouped-btn">By Color/Size</Button>
              </div>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  {viewMode === "stages" ? (
                    stageSummary.length > 1 ? (
                      <Tabs value={activeStageTab} onValueChange={setActiveStageTab} className="w-full">
                        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-muted/50 p-1">
                          {stageSummary.slice(1).map(function(stage) {
                            return (
                              <TabsTrigger key={stage.stage_id} value={stage.stage_id} className="flex items-center gap-2 whitespace-nowrap" data-testid={`stage-tab-${stage.stage_id}`}>
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                                {stage.stage_name}
                                <Badge variant="secondary" className="ml-1">{stage.total_items}</Badge>
                              </TabsTrigger>
                            );
                          })}
                        </TabsList>
                        
                        {stageSummary.slice(1).map(function(stage) {
                          return (
                            <TabsContent key={stage.stage_id} value={stage.stage_id} className="mt-4">
                              <div className="mb-4 p-4 bg-muted/30 rounded-lg">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h3 className="font-semibold text-lg">{stage.stage_name}</h3>
                                    <p className="text-sm text-muted-foreground">{stage.total_items} items • {stage.total_completed} / {stage.total_required} completed</p>
                                  </div>
                                  <Progress value={(stage.total_completed / Math.max(stage.total_required, 1)) * 100} className="w-48" />
                                </div>
                              </div>
                              
                              {stage.items.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                  <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                  <p>No items at this stage</p>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {stage.items.map(function(item) {
                                    return <ItemRow key={item.item_id} item={item} stages={stages} onUpdateQty={handleUpdateQty} onMoveStage={handleMoveStage} />;
                                  })}
                                </div>
                              )}
                            </TabsContent>
                          );
                        })}
                      </Tabs>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">Loading stages...</div>
                    )
                  ) : (
                    groupedItems.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No items in this batch</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {groupedItems.map(function(group) {
                          return (
                            <Card key={group.color + "-" + group.size} className="bg-card border-border">
                              <CardHeader className="py-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <ColorBadge color={group.color} />
                                    <SizeBadge size={group.size} />
                                    <span className="text-muted-foreground">•</span>
                                    <span className="font-medium">{group.items.length} items</span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="text-right">
                                      <p className="text-sm text-muted-foreground">Total Required</p>
                                      <p className="text-xl font-bold">{group.total_required}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm text-muted-foreground">Completed</p>
                                      <p className="text-xl font-bold text-green-400">{group.total_completed}</p>
                                    </div>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <div className="space-y-2">
                                  {group.items.map(function(item) {
                                    return <ItemRow key={item.item_id} item={item} stages={stages} onUpdateQty={handleUpdateQty} onMoveStage={handleMoveStage} />;
                                  })}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )
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
