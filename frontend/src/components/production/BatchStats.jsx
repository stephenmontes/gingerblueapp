import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Clock, DollarSign, XCircle, Users, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function BatchStats({ batchId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const fetchStats = useCallback(async () => {
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
  }, [batchId]);

  useEffect(() => {
    if (batchId) {
      fetchStats();
    }
  }, [batchId, fetchStats]);

  if (loading) {
    return <StatsLoading />;
  }

  if (!stats) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card/50 border-border">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-4 h-auto"
            data-testid="batch-kpi-toggle"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="font-medium">Batch KPIs</span>
              <span className="text-sm text-muted-foreground">
                ({stats.time.total_hours}h • ${stats.costs.avg_cost_per_frame}/frame • {stats.quality.rejection_rate}% reject)
              </span>
            </div>
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
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
            </div>
            <WorkerBreakdown workers={stats.user_breakdown} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function StatsLoading() {
  return (
    <Card className="bg-card/50 border-border">
      <div className="p-4 flex items-center gap-2">
        <div className="w-4 h-4 bg-muted animate-pulse rounded" />
        <div className="w-24 h-4 bg-muted animate-pulse rounded" />
      </div>
    </Card>
  );
}

function StatCard({ icon: Icon, iconColor, label, value, subtitle, highlight }) {
  const bgClass = highlight ? "bg-red-500/10 border-red-500/30" : "bg-muted/30";
  const valueClass = highlight ? "text-red-400" : "";
  
  return (
    <div className={bgClass + " rounded-lg p-3"}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={"w-4 h-4 " + iconColor} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={"text-xl font-bold " + valueClass}>{value}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function WorkerBreakdown({ workers }) {
  if (!workers || workers.length === 0) return null;
  
  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Hours by Worker</span>
      </div>
      <div className="flex flex-wrap gap-4">
        {workers.map((user, idx) => (
          <WorkerItem key={idx} user={user} />
        ))}
      </div>
    </div>
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
