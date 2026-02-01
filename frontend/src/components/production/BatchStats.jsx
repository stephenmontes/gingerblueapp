import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, DollarSign, XCircle, Users } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function BatchStats({ batchId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (batchId) {
      fetchStats();
    }
  }, [batchId]);

  async function fetchStats() {
    try {
      const res = await fetch(API + "/batches/" + batchId + "/stats", {
        credentials: "include",
      });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch batch stats:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <StatsLoading />;
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        icon={Clock}
        iconColor="text-blue-400"
        label="Combined Hours"
        value={stats.time.total_hours + "h"}
        subtitle={stats.user_breakdown.length + " workers"}
      />
      <StatCard
        icon={DollarSign}
        iconColor="text-green-400"
        label="Labor Cost"
        value={"$" + stats.costs.total_labor_cost}
        subtitle={"@ $" + stats.costs.hourly_rate + "/hr"}
      />
      <StatCard
        icon={DollarSign}
        iconColor="text-primary"
        label="Avg Cost/Frame"
        value={"$" + stats.costs.avg_cost_per_frame}
        subtitle={stats.totals.good_frames + " good frames"}
      />
      <StatCard
        icon={XCircle}
        iconColor={stats.quality.rejection_rate > 5 ? "text-red-400" : "text-muted-foreground"}
        label="Rejection Rate"
        value={stats.quality.rejection_rate + "%"}
        subtitle={stats.quality.rejected_count + " rejected"}
        highlight={stats.quality.rejection_rate > 5}
      />
      <WorkerBreakdown workers={stats.user_breakdown} />
    </div>
  );
}

function StatsLoading() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="h-20 bg-muted/30 animate-pulse rounded-lg" />
      <div className="h-20 bg-muted/30 animate-pulse rounded-lg" />
      <div className="h-20 bg-muted/30 animate-pulse rounded-lg" />
      <div className="h-20 bg-muted/30 animate-pulse rounded-lg" />
    </div>
  );
}

function StatCard({ icon: Icon, iconColor, label, value, subtitle, highlight }) {
  const bgClass = highlight ? "bg-red-500/10 border-red-500/30" : "bg-card/50";
  const valueClass = highlight ? "text-red-400" : "";
  
  return (
    <Card className={bgClass + " border-border"}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={"w-4 h-4 " + iconColor} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={"text-xl font-bold " + valueClass}>{value}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function WorkerBreakdown({ workers }) {
  if (!workers || workers.length === 0) return null;
  
  return (
    <Card className="bg-card/50 border-border col-span-2 md:col-span-4">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Hours by Worker</span>
        </div>
        <div className="flex flex-wrap gap-4">
          {workers.map((user, idx) => (
            <WorkerItem key={idx} user={user} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkerItem({ user }) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{user.user_name}:</span>{" "}
      <span className="font-medium">{user.hours}h</span>
      <span className="text-xs text-muted-foreground ml-1">
        ({user.items_processed} items)
      </span>
    </div>
  );
}
