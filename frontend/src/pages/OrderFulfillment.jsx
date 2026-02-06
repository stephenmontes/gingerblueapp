import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Truck, Users, Clock, FileText, ChevronDown, ChevronUp, Settings, Package } from "lucide-react";
import { toast } from "sonner";
import { FulfillmentStageTab } from "@/components/fulfillment/FulfillmentStageTab";
import { FulfillmentSummary } from "@/components/fulfillment/FulfillmentSummary";
import { StageOrdersPopup } from "@/components/fulfillment/StageOrdersPopup";
import { FulfillmentTimerBanner } from "@/components/fulfillment/FulfillmentTimerBanner";
import { FulfillmentKpiBanner } from "@/components/fulfillment/FulfillmentKpiBanner";
import { OrderKpiReport } from "@/components/fulfillment/OrderKpiReport";
import { TimeEntryManager } from "@/components/fulfillment/TimeEntryManager";
import { DailyLimitWarning } from "@/components/fulfillment/DailyLimitWarning";
import { UserDateReport } from "@/components/fulfillment/UserDateReport/index";
import { FulfillmentBatchCard } from "@/components/fulfillment/FulfillmentBatchCard";
import { FulfillmentBatchDetail } from "@/components/fulfillment/FulfillmentBatchDetail";
import { API } from "@/utils/api";

export default function OrderFulfillment({ user }) {
  const [stages, setStages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("fulfill_print"); // Default to Print List
  const [popupStage, setPopupStage] = useState(null);
  const [timerVersion, setTimerVersion] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [showTimeManager, setShowTimeManager] = useState(false);
  const [showUserDateReport, setShowUserDateReport] = useState(false);
  const [fulfillmentBatches, setFulfillmentBatches] = useState([]);
  const [historyBatches, setHistoryBatches] = useState([]);
  const [batchTab, setBatchTab] = useState("active"); // "active" or "history"
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchDetail, setBatchDetail] = useState(null);
  
  // Check if user can delete (admin or manager)
  const canDelete = user?.role === "admin" || user?.role === "manager";

  useEffect(() => {
    loadData();
    // Auto-stop inactive timers on page load
    autoStopInactiveTimers();
  }, []);

  async function autoStopInactiveTimers() {
    try {
      await fetch(`${API}/fulfillment/timers/auto-stop-inactive`, {
        method: "POST",
        credentials: "include"
      });
    } catch (err) {
      // Silently fail - this is a background cleanup task
    }
  }

  function handleTimerChange() {
    setTimerVersion(v => v + 1);
    loadData();
  }

  function handleLogout() {
    // Redirect to logout
    window.location.href = `${API}/auth/logout`;
  }

  async function loadData() {
    try {
      const [stagesRes, summaryRes, batchesRes, historyRes] = await Promise.all([
        fetch(`${API}/fulfillment/stages`, { credentials: "include" }),
        fetch(`${API}/fulfillment/summary`, { credentials: "include" }),
        fetch(`${API}/fulfillment-batches?status=active`, { credentials: "include" }),
        fetch(`${API}/fulfillment-batches?status=completed`, { credentials: "include" }),
      ]);

      if (stagesRes.ok) {
        const stagesData = await stagesRes.json();
        // Filter out "In Production" stage - it's not used in Order Fulfillment workflow
        const filteredStages = stagesData.filter(s => s.stage_id !== "fulfill_orders");
        setStages(filteredStages);
        if (filteredStages.length > 0 && !activeTab) {
          setActiveTab(filteredStages[0].stage_id);
        }
      }
      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }
      if (batchesRes.ok) {
        const batchData = await batchesRes.json();
        // Fetch orders for each batch
        const batchesWithOrders = await Promise.all(
          (batchData.batches || []).map(async (batch) => {
            try {
              const detailRes = await fetch(`${API}/fulfillment-batches/${batch.fulfillment_batch_id}`, {
                credentials: "include"
              });
              if (detailRes.ok) {
                return await detailRes.json();
              }
            } catch (e) {
              console.error("Failed to load batch details:", e);
            }
            return batch;
          })
        );
        setFulfillmentBatches(batchesWithOrders);
        
        // Update selected batch if it's still active
        if (selectedBatch) {
          const updatedBatch = batchesWithOrders.find(
            b => b.fulfillment_batch_id === selectedBatch.fulfillment_batch_id
          );
          if (updatedBatch) {
            setBatchDetail(updatedBatch);
          } else {
            // Batch no longer active, clear selection
            setSelectedBatch(null);
            setBatchDetail(null);
          }
        }
      }
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistoryBatches(historyData.batches || []);
      }
    } catch (err) {
      toast.error("Failed to load fulfillment data");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectBatch(batch) {
    setSelectedBatch(batch);
    // Fetch detailed batch info with orders
    try {
      const res = await fetch(`${API}/fulfillment-batches/${batch.fulfillment_batch_id}`, {
        credentials: "include"
      });
      if (res.ok) {
        setBatchDetail(await res.json());
      }
    } catch (e) {
      toast.error("Failed to load batch details");
    }
  }

  function handleCloseBatchDetail() {
    setSelectedBatch(null);
    setBatchDetail(null);
  }

  function getStageCount(stageId) {
    if (!summary?.stages) return 0;
    const stage = summary.stages.find(s => s.stage_id === stageId);
    return stage?.count || 0;
  }

  function handleStageCardClick(stage) {
    setPopupStage(stage);
  }

  function handleViewOrderFromPopup(order) {
    // Switch to the stage tab and the popup will close
    if (order.fulfillment_stage_id) {
      setActiveTab(order.fulfillment_stage_id);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6" data-testid="fulfillment-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="order-fulfillment-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold flex items-center gap-3">
            <Truck className="w-8 h-8 text-primary" />
            Order Fulfillment
          </h1>
          <p className="text-muted-foreground mt-1">
            Track orders through print, mount, finish, and shipping stages
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={loadData} 
          className="gap-2"
          data-testid="refresh-fulfillment-btn"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Active Timer Banner */}
      <FulfillmentTimerBanner 
        onTimerChange={handleTimerChange} 
        onGoToStage={(stageId, batchId) => {
          // If the timer has a batch_id, find and select that batch
          if (batchId) {
            const batch = fulfillmentBatches.find(b => b.fulfillment_batch_id === batchId);
            if (batch) {
              handleSelectBatch(batch);
              return;
            }
          }
          // Otherwise, switch to the stage tab
          setActiveTab(stageId);
          // Also deselect any selected batch to show stage tabs
          setSelectedBatch(null);
          setBatchDetail(null);
        }}
      />

      {/* KPI Banner */}
      <FulfillmentKpiBanner />

      {/* Order KPI Report Toggle */}
      <div className="border border-border rounded-lg">
        <Button
          variant="ghost"
          onClick={() => setShowReport(!showReport)}
          className="w-full justify-between h-12"
          data-testid="toggle-order-report"
        >
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Order Time & Cost Report
          </span>
          {showReport ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        
        {showReport && (
          <div className="p-4 pt-0">
            <OrderKpiReport />
          </div>
        )}
      </div>

      {/* User Date Report Toggle */}
      <div className="border border-border rounded-lg">
        <Button
          variant="ghost"
          onClick={() => setShowUserDateReport(!showUserDateReport)}
          className="w-full justify-between h-12"
          data-testid="toggle-user-date-report"
        >
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Hours by User & Date Report
          </span>
          {showUserDateReport ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        
        {showUserDateReport && (
          <div className="p-4 pt-0">
            <UserDateReport />
          </div>
        )}
      </div>

      {/* Time Entry Manager Toggle (Admin/Manager only) */}
      <div className="border border-border rounded-lg">
        <Button
          variant="ghost"
          onClick={() => setShowTimeManager(!showTimeManager)}
          className="w-full justify-between h-12"
          data-testid="toggle-time-manager"
        >
          <span className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Time Entry Management (Admin)
          </span>
          {showTimeManager ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        
        {showTimeManager && (
          <div className="p-4 pt-0">
            <TimeEntryManager />
          </div>
        )}
      </div>

      {/* Batch-Based Fulfillment Section */}
      {(fulfillmentBatches.length > 0 || historyBatches.length > 0) && (
        <div className="grid grid-cols-12 gap-4">
          {/* Batch List - Left Panel */}
          <div className={`${selectedBatch ? 'col-span-3' : 'col-span-12'}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Fulfillment Batches
              </h2>
              {selectedBatch && (
                <Button variant="ghost" size="sm" onClick={handleCloseBatchDetail}>
                  Close Batch
                </Button>
              )}
            </div>
            
            {/* Active / History Tabs */}
            <div className="flex gap-2 mb-4">
              <Button
                variant={batchTab === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setBatchTab("active")}
                className="gap-1"
              >
                Active
                <Badge variant="secondary" className="ml-1">{fulfillmentBatches.length}</Badge>
              </Button>
              <Button
                variant={batchTab === "history" ? "default" : "outline"}
                size="sm"
                onClick={() => setBatchTab("history")}
                className="gap-1"
              >
                History
                <Badge variant="secondary" className="ml-1">{historyBatches.length}</Badge>
              </Button>
            </div>
            
            {batchTab === "active" ? (
              <div className={`${selectedBatch ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
                {fulfillmentBatches.length > 0 ? (
                  fulfillmentBatches.map((batch) => (
                    <FulfillmentBatchCard
                      key={batch.fulfillment_batch_id}
                      batch={batch}
                      isSelected={selectedBatch?.fulfillment_batch_id === batch.fulfillment_batch_id}
                      onSelect={handleSelectBatch}
                      onRefresh={loadData}
                      canDelete={canDelete}
                    />
                  ))
                ) : (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No active fulfillment batches</p>
                  </div>
                )}
              </div>
            ) : (
              <div className={`${selectedBatch ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
                {historyBatches.length > 0 ? (
                  historyBatches.map((batch) => (
                    <FulfillmentBatchCard
                      key={batch.fulfillment_batch_id}
                      batch={batch}
                      isSelected={selectedBatch?.fulfillment_batch_id === batch.fulfillment_batch_id}
                      onSelect={handleSelectBatch}
                      onRefresh={loadData}
                      canDelete={canDelete}
                      isHistory={true}
                    />
                  ))
                ) : (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No completed batches in history</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Batch Detail - Right Panel */}
          {selectedBatch && batchDetail && (
            <div className="col-span-9">
              {/* For enhanced batches (ShipStation/GB Decor): Show combined worksheet */}
              {batchDetail.is_enhanced_batch ? (
                <FulfillmentBatchDetail
                  batch={batchDetail}
                  stages={stages}
                  onRefresh={loadData}
                  onClose={handleCloseBatchDetail}
                  canDelete={canDelete}
                  user={user}
                />
              ) : (
                /* For GB Home batches: Show individual orders with stage tabs */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{batchDetail.name}</h2>
                    <Badge variant="outline">{batchDetail.order_count} orders</Badge>
                  </div>
                  
                  {/* Stage Tabs for this batch */}
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {stages.map((stage) => (
                      <Button
                        key={stage.stage_id}
                        variant={activeTab === stage.stage_id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActiveTab(stage.stage_id)}
                        className="flex items-center gap-2 whitespace-nowrap"
                        data-testid={`batch-tab-${stage.stage_id}`}
                      >
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                        <Badge variant="secondary">
                          {getStageCount(stage.stage_id)}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                  
                  {/* Stage Content for GB Home batch */}
                  {stages.map((stage) => (
                    activeTab === stage.stage_id && (
                      <FulfillmentStageTab
                        key={stage.stage_id}
                        stage={stage}
                        stages={stages}
                        onRefresh={loadData}
                        onTimerChange={handleTimerChange}
                        canDelete={canDelete}
                        user={user}
                        batchId={selectedBatch.fulfillment_batch_id}
                      />
                    )
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stage Tabs - Only show when NO batch is selected OR no batches exist */}
      {(!selectedBatch || fulfillmentBatches.length === 0) && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {stages.map((stage) => (
              <Button
                key={stage.stage_id}
                variant={activeTab === stage.stage_id ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab(stage.stage_id)}
                className="flex items-center gap-2 whitespace-nowrap"
                data-testid={`tab-${stage.stage_id}`}
              >
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: stage.color }}
                />
                {stage.name}
                <Badge variant="secondary">
                  {getStageCount(stage.stage_id)}
                </Badge>
              </Button>
            ))}
          </div>

          {/* Stage Content */}
          {stages.map((stage) => (
            activeTab === stage.stage_id && (
              <FulfillmentStageTab
                key={stage.stage_id}
                stage={stage}
                stages={stages}
                onRefresh={loadData}
                onTimerChange={handleTimerChange}
                canDelete={canDelete}
                user={user}
              />
            )
          ))}
        </>
      )}

      {/* Stage Orders Popup */}
      <StageOrdersPopup 
        stage={popupStage} 
        onClose={() => setPopupStage(null)}
        onViewOrder={handleViewOrderFromPopup}
      />

      {/* Daily Limit Warning Modal */}
      <DailyLimitWarning onLogout={handleLogout} />
    </div>
  );
}
