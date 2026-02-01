import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock, Zap, TrendingUp, Award } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function FulfillmentUserStats({ stageId, stageName }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!stageId) return;
    fetchStats();
  }, [stageId]);

  async function fetchStats() {
    try {
      const res = await fetch(`${API}/fulfillment/stats/user-kpis?stage_id=${stageId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const stageStats = data.stages?.find(s => s.stage_id === stageId);
        setStats(stageStats || null);
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-3"><div className="h-4 w-20 bg-muted/30 animate-pulse rounded" /></div>;
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
    <div className="flex items-center gap-3 flex-wrap">
      <StatBadge icon={Clock} label="Time" value={formatTime(stats.total_minutes)} color="blue" />
      <StatBadge icon={Zap} label="Orders" value={stats.total_orders} color="green" />
      <StatBadge icon={TrendingUp} label="Avg/hr" value={stats.orders_per_hour} color="purple" highlight={stats.orders_per_hour >= 5} />
    </div>
  );
}

function StatBadge({ icon: Icon, label, value, color, highlight }) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    green: "bg-green-500/10 text-green-400 border-green-500/30",
    purple: highlight ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : "bg-purple-500/10 text-purple-400 border-purple-500/30",
  };

  return (
    <Badge variant="outline" className={`${colorClasses[color]} gap-1 text-xs font-normal`}>
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
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}
