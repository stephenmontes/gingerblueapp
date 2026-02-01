import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock, Zap, TrendingUp, Award } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function UserStageStats({ stageId, stageName }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!stageId) return;
    fetchStats();
  }, [stageId]);

  async function fetchStats() {
    try {
      const res = await fetch(`${API}/stats/my-stage-kpis?stage_id=${stageId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        // Find the stats for this specific stage
        const stageStats = data.stages?.find(s => s.stage_id === stageId);
        setStats(stageStats || null);
      }
    } catch (err) {
      console.error("Failed to load user stage stats:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-4 w-20 bg-muted/30 animate-pulse rounded" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Award className="w-3 h-3" />
        <span>First session in {stageName}!</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 flex-wrap" data-testid="user-stage-stats">
      <StatBadge 
        icon={Clock} 
        label="Time" 
        value={formatTime(stats.total_minutes)} 
        color="blue"
      />
      <StatBadge 
        icon={Zap} 
        label="Made" 
        value={stats.total_items} 
        color="green"
      />
      <StatBadge 
        icon={TrendingUp} 
        label="Avg/hr" 
        value={stats.items_per_hour} 
        color="purple"
        highlight={stats.items_per_hour >= 10}
      />
    </div>
  );
}

function StatBadge({ icon: Icon, label, value, color, highlight }) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    green: "bg-green-500/10 text-green-400 border-green-500/30",
    purple: highlight 
      ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" 
      : "bg-purple-500/10 text-purple-400 border-purple-500/30",
  };

  return (
    <Badge 
      variant="outline" 
      className={`${colorClasses[color]} gap-1 text-xs font-normal`}
    >
      <Icon className="w-3 h-3" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </Badge>
  );
}

function formatTime(minutes) {
  if (!minutes) return "0m";
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
}
