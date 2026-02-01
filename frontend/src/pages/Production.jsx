import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BatchList } from "../components/production/BatchList";
import { BatchDetailView, NoBatchSelected } from "../components/production/BatchDetailView";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export default function Production() {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchDetails, setBatchDetails] = useState(null);
  const [stageSummary, setStageSummary] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      loadBatchDetails(selectedBatch.batch_id);
    }
  }, [selectedBatch]);

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
          Track time per stage • Each user works on their assigned stage
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <BatchList
            batches={batches}
            selectedBatch={selectedBatch}
            onSelectBatch={setSelectedBatch}
          />
        </div>

        <div className="lg:col-span-3">
          {selectedBatch ? (
            <BatchDetailView
              batch={selectedBatch}
              batchDetails={batchDetails}
              stageSummary={stageSummary}
              stages={stages}
              onUpdateQty={handleUpdateQty}
              onMoveStage={handleMoveStage}
              onRefresh={() => loadBatchDetails(selectedBatch.batch_id)}
            />
          ) : (
            <NoBatchSelected />
          )}
        </div>
      </div>
    </div>
  );
}
