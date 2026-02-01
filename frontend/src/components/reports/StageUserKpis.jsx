import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, TrendingUp, Users, Layers } from "lucide-react";
import { toast } from "sonner";
import { StageKpiCard } from "./StageKpiCard";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function StageUserKpis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openStages, setOpenStages] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const res = await fetch(`${API}/stats/stage-user-kpis`, {
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
        setData(result);
        const open = {};
        result.stages.forEach(s => { open[s.stage_id] = true; });
        setOpenStages(open);
      }
    } catch (err) {
      toast.error("Failed to load stage KPIs");
    } finally {
      setLoading(false);
    }
  }

  function toggleStage(stageId) {
    setOpenStages(prev => ({ ...prev, [stageId]: !prev[stageId] }));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-muted/30 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || !data.stages || data.stages.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8 text-center text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No stage KPI data available yet</p>
          <p className="text-sm mt-2">Start tracking time on stages to see metrics</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="stage-user-kpis">
      <SummaryCards summary={data.summary} />
      <div className="space-y-3">
        {data.stages.map(stage => (
          <StageKpiCard
            key={stage.stage_id}
            stage={stage}
            isOpen={openStages[stage.stage_id]}
            onToggle={() => toggleStage(stage.stage_id)}
          />
        ))}
      </div>
    </div>
  );
}

function SummaryCards({ summary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <SummaryCard icon={Layers} color="text-primary" label="Stages" value={summary.total_stages} />
      <SummaryCard icon={Users} color="text-blue-400" label="Workers" value={summary.total_users_tracked} />
      <SummaryCard icon={Clock} color="text-green-400" label="Total Hours" value={summary.total_hours + "h"} />
      <SummaryCard icon={TrendingUp} color="text-purple-400" label="Total Items" value={summary.total_items} />
    </div>
  );
}

function SummaryCard({ icon: Icon, color, label, value }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
