import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, Pause } from "lucide-react";
import { API } from "@/utils/api";


export function ActiveWorkersBanner({ stageId, stageName }) {
  const [workers, setWorkers] = useState([]);

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch(`${API}/fulfillment/stages/${stageId}/active-workers`, {
        credentials: "include"
      });
      if (res.ok) {
        setWorkers(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch active workers:", err);
    }
  }, [stageId]);

  useEffect(() => {
    fetchWorkers();
    const interval = setInterval(fetchWorkers, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchWorkers]);

  if (workers.length === 0) return null;

  return (
    <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-green-400" />
        <span className="text-sm font-medium text-green-400">
          {workers.length} {workers.length === 1 ? 'person' : 'people'} working on {stageName}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {workers.map((worker) => (
          <WorkerBadge key={worker.user_id} worker={worker} />
        ))}
      </div>
    </div>
  );
}

function WorkerBadge({ worker }) {
  const timeStr = formatTime(worker.elapsed_minutes);
  
  return (
    <div className="flex items-center gap-2 bg-background/50 px-3 py-1.5 rounded-full">
      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      <span className="text-sm font-medium">{worker.user_name}</span>
      {worker.order_number && (
        <Badge variant="outline" className="text-xs font-mono">
          #{worker.order_number}
        </Badge>
      )}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {worker.is_paused ? (
          <Pause className="w-3 h-3 text-yellow-400" />
        ) : (
          <Clock className="w-3 h-3" />
        )}
        {timeStr}
      </div>
    </div>
  );
}

function formatTime(mins) {
  if (!mins || mins < 1) return "0m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
