import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Users, Clock, Pause, Activity, ChevronDown, ChevronRight } from "lucide-react";
import { API } from "@/utils/api";


export function ProductionWorkersBanner() {
  const [workers, setWorkers] = useState([]);
  const [stageWorkers, setStageWorkers] = useState({});
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [workersRes, stagesRes] = await Promise.all([
        fetch(`${API}/stages/active-workers`, { credentials: "include" }),
        fetch(`${API}/stages`, { credentials: "include" })
      ]);
      
      if (workersRes.ok) {
        const data = await workersRes.json();
        setStageWorkers(data);
        
        // Flatten workers list with stage info
        const allWorkers = [];
        Object.entries(data).forEach(([stageId, stageWorkersList]) => {
          stageWorkersList.forEach(worker => {
            allWorkers.push({ ...worker, stage_id: stageId });
          });
        });
        setWorkers(allWorkers);
      }
      
      if (stagesRes.ok) {
        setStages(await stagesRes.json());
      }
    } catch (err) {
      console.error("Failed to fetch workers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  // Get stage info helper
  const getStageInfo = (stageId) => {
    const stage = stages.find(s => s.stage_id === stageId);
    return stage || { name: stageId, color: "#6366F1" };
  };

  if (loading) {
    return (
      <Card className="p-4 bg-muted/20 animate-pulse">
        <div className="h-12" />
      </Card>
    );
  }

  const totalWorkers = workers.length;
  const activeWorkers = workers.filter(w => !w.is_paused).length;
  const pausedWorkers = workers.filter(w => w.is_paused).length;

  return (
    <Card className="bg-card border-border" data-testid="production-workers-banner">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors rounded-lg">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold">Production Team Activity</h3>
                <p className="text-sm text-muted-foreground">
                  {totalWorkers === 0 ? (
                    "No active timers"
                  ) : (
                    <>
                      {totalWorkers} {totalWorkers === 1 ? 'person' : 'people'} tracking time
                      {pausedWorkers > 0 && (
                        <span className="text-yellow-400 ml-1">
                          ({pausedWorkers} paused)
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
            
            {/* Summary badges */}
            <div className="flex items-center gap-2">
              {activeWorkers > 0 && (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  <Activity className="w-3 h-3 mr-1" />
                  {activeWorkers} Active
                </Badge>
              )}
              {pausedWorkers > 0 && (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                  <Pause className="w-3 h-3 mr-1" />
                  {pausedWorkers} Paused
                </Badge>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4">
            {totalWorkers > 0 ? (
              <div className="space-y-3">
                {/* Group workers by stage */}
                {Object.entries(stageWorkers).map(([stageId, stageWorkersList]) => {
                  const stageInfo = getStageInfo(stageId);
                  if (stageWorkersList.length === 0) return null;
                  
                  return (
                    <div key={stageId} className="p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: stageInfo.color }}
                        />
                        <span className="text-sm font-medium">{stageInfo.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {stageWorkersList.length} {stageWorkersList.length === 1 ? 'worker' : 'workers'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {stageWorkersList.map((worker) => (
                          <WorkerCard key={worker.user_id} worker={worker} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No one is currently tracking time</p>
                <p className="text-xs">Start a timer to begin tracking production</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function WorkerCard({ worker }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!worker.started_at) return;
    
    const accumulatedSeconds = Math.floor((worker.accumulated_minutes || 0) * 60);
    
    if (worker.is_paused) {
      setElapsed(accumulatedSeconds);
      return;
    }

    const startTime = new Date(worker.started_at).getTime();

    function updateElapsed() {
      const now = Date.now();
      const currentSession = Math.floor((now - startTime) / 1000);
      setElapsed(accumulatedSeconds + currentSession);
    }

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [worker.started_at, worker.is_paused, worker.accumulated_minutes]);

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}h ${m}m`;
    }
    return `${m}m ${s}s`;
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-full ${
      worker.is_paused 
        ? "bg-yellow-500/10 border border-yellow-500/30" 
        : "bg-green-500/10 border border-green-500/30"
    }`}>
      <div className={`w-2 h-2 rounded-full ${
        worker.is_paused ? "bg-yellow-400" : "bg-green-400 animate-pulse"
      }`} />
      <span className="text-sm font-medium">{worker.user_name}</span>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {worker.is_paused ? (
          <Pause className="w-3 h-3 text-yellow-400" />
        ) : (
          <Clock className="w-3 h-3 text-green-400" />
        )}
        <span className="font-mono">{formatTime(elapsed)}</span>
      </div>
    </div>
  );
}
