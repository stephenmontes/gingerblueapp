import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { BatchList } from "../components/production/BatchList";
import { BatchDetailView, NoBatchSelected } from "../components/production/BatchDetailView";
import { ActiveTimerBanner } from "../components/production/ActiveTimerBanner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export default function Production() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchDetails, setBatchDetails] = useState(null);
  const [stageSummary, setStageSummary] = useState([]);
  const [stages, setStages] = useState([]);
  const [stageWorkers, setStageWorkers] = useState({});
  const [loading, setLoading] = useState(true);
  
  // Track active timer at page level - this is the source of truth
  const [activeTimer, setActiveTimer] = useState(null);
  const [timerVersion, setTimerVersion] = useState(0); // Used to force child re-renders

  useEffect(() => {
    loadInitialData();
    checkActiveTimer();
    loadStageWorkers();
    
    // Poll for active workers every 30 seconds
    const interval = setInterval(loadStageWorkers, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-select batch from URL parameter
  useEffect(() => {
    const batchId = searchParams.get("batch");
    if (batchId && batches.length > 0 && !selectedBatch) {
      const batch = batches.find(b => b.batch_id === batchId);
      if (batch) {
        setSelectedBatch(batch);
        toast.info(`Viewing batch: ${batch.name}`);
      }
    }
  }, [searchParams, batches, selectedBatch]);

  // Update URL when batch is selected
  function handleBatchSelect(batch) {
    setSelectedBatch(batch);
    if (batch) {
      setSearchParams({ batch: batch.batch_id });
    } else {
      setSearchParams({});
    }
  }

  useEffect(() => {
    if (selectedBatch) {
      loadBatchDetails(selectedBatch.batch_id);
    }
  }, [selectedBatch]);

  // Load active workers per stage
  async function loadStageWorkers() {
    try {
      const res = await fetch(API + "/stages/active-workers", {
        credentials: "include",
      });
      if (res.ok) {
        setStageWorkers(await res.json());
      }
    } catch (err) {
      console.error("Failed to load stage workers:", err);
    }
  }

  // Check for active timer
  const checkActiveTimer = useCallback(async () => {
    try {
      const res = await fetch(API + "/user/active-timers", {
        credentials: "include",
      });
      if (res.ok) {
        const timers = await res.json();
        setActiveTimer(timers.length > 0 ? timers[0] : null);
      }
    } catch (err) {
      console.error("Failed to check active timer:", err);
    }
  }, []);

  // Called when timer is started or stopped
  const handleTimerChange = useCallback(() => {
    checkActiveTimer();
    loadStageWorkers();
    setTimerVersion(v => v + 1); // Force child components to re-check
    loadInitialData();
  }, [checkActiveTimer]);

  async function loadInitialData() {
    try {
      const [batchRes, stageRes] = await Promise.all([
        fetch(API + "/batches", { credentials: "include" }),
        fetch(API + "/stages", { credentials: "include" }),
      ]);

      if (batchRes.ok) {
        setBatches(await batchRes.json());
      }
      if (stageRes.ok) {
        setStages(await stageRes.json());
      }
    } catch (err) {
      toast.error("Failed to load production data");
    } finally {
      setLoading(false);
    }
  }

  async function loadBatchDetails(batchId) {
    try {
      const [detailsRes, summaryRes] = await Promise.all([
        fetch(API + "/batches/" + batchId, { credentials: "include" }),
        fetch(API + "/batches/" + batchId + "/stage-summary", { credentials: "include" }),
      ]);

      if (detailsRes.ok) {
        setBatchDetails(await detailsRes.json());
      }
      if (summaryRes.ok) {
        setStageSummary(await summaryRes.json());
      }
    } catch (err) {
      toast.error("Failed to load batch details");
    }
  }

  async function handleUpdateQty(itemId, qtyCompleted) {
    try {
      const res = await fetch(API + "/items/" + itemId + "/update?qty_completed=" + qtyCompleted, {
        method: "PUT",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Quantity updated");
        loadBatchDetails(selectedBatch.batch_id);
        loadInitialData();
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
        body: JSON.stringify({
          item_id: itemId,
          new_stage_id: newStageId,
          qty_completed: qtyCompleted,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message || "Item moved to next stage");
        loadBatchDetails(selectedBatch.batch_id);
        loadInitialData();
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

  return (
    <div className="space-y-6" data-testid="production-page">
      <div>
        <h1 className="text-3xl font-heading font-bold">Frame Production</h1>
        <p className="text-muted-foreground mt-1">
          Track time per stage • One timer per user at a time
        </p>
      </div>

      {/* Active Timer Banner - shows which stage user is tracking */}
      <ActiveTimerBanner activeTimer={activeTimer} onTimerChange={handleTimerChange} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <BatchList
            batches={batches}
            selectedBatch={selectedBatch}
            onSelectBatch={handleBatchSelect}
            onRefresh={loadInitialData}
          />
        </div>

        <div className="lg:col-span-3">
          {selectedBatch ? (
            <BatchDetailView
              batch={selectedBatch}
              batchDetails={batchDetails}
              stageSummary={stageSummary}
              stages={stages}
              stageWorkers={stageWorkers}
              onUpdateQty={handleUpdateQty}
              onMoveStage={handleMoveStage}
              onRefresh={() => loadBatchDetails(selectedBatch.batch_id)}
              onTimerChange={handleTimerChange}
              activeTimer={activeTimer}
              timerVersion={timerVersion}
            />
          ) : (
            <NoBatchSelected />
          )}
        </div>
      </div>
    </div>
  );
}
