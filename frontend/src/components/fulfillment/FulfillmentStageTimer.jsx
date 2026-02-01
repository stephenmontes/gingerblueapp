import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Users } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function FulfillmentStageTimer({ stage, onTimerChange }) {
  const [workers, setWorkers] = useState([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    loadWorkers();
    const interval = setInterval(loadWorkers, 30000);
    return () => clearInterval(interval);
  }, [stage.stage_id]);

  async function loadWorkers() {
    try {
      const res = await fetch(`${API}/fulfillment/stages/${stage.stage_id}/active-workers`, {
        credentials: "include"
      });
      if (res.ok) {
        setWorkers(await res.json());
      }
    } catch (err) {
      console.error("Failed to load workers:", err);
    }
  }

  async function handleStartTimer() {
    setStarting(true);
    try {
      const res = await fetch(`${API}/fulfillment/stages/${stage.stage_id}/start-timer`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        toast.success(`Timer started for ${stage.name}`);
        loadWorkers();
        onTimerChange?.();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to start timer");
      }
    } catch (err) {
      toast.error("Failed to start timer");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button 
        size="sm" 
        variant="outline" 
        onClick={handleStartTimer}
        disabled={starting}
        className="gap-1"
      >
        <Play className="w-4 h-4" />
        Start Timer
      </Button>
      
      {workers.length > 0 && (
        <ActiveWorkersDisplay workers={workers} />
      )}
    </div>
  );
}

export function ActiveWorkersDisplay({ workers }) {
  if (!workers || workers.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Users className="w-4 h-4 text-muted-foreground" />
      <div className="flex gap-1 flex-wrap">
        {workers.map((w, i) => (
          <Badge 
            key={i} 
            variant="outline" 
            className={`text-xs ${w.is_paused ? 'border-yellow-500 text-yellow-500' : 'border-green-500 text-green-500'}`}
          >
            {w.user_name?.split(' ')[0]}
            {w.is_paused && ' ⏸'}
          </Badge>
        ))}
      </div>
    </div>
  );
}
