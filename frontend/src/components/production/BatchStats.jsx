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
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-muted/30 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Combined Hours */}
      <Card className="bg-card/50 border-border">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-muted-foreground">Combined Hours</span>
          </div>
          <p className="text-xl font-bold">{stats.time.total_hours}h</p>
          <p className="text-xs text-muted-foreground">
            {stats.user_breakdown.length} worker{stats.user_breakdown.length !== 1 ? "s" : ""}
          </p>
        </CardContent>
      </Card>

      {/* Total Labor Cost */}
      <Card className="bg-card/50 border-border">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-xs text-muted-foreground">Labor Cost</span>
          </div>
          <p className="text-xl font-bold">${stats.costs.total_labor_cost}</p>
          <p className="text-xs text-muted-foreground">
            @ ${stats.costs.hourly_rate}/hr
          </p>
        </CardContent>
      </Card>

      {/* Avg Cost Per Frame */}
      <Card className="bg-card/50 border-border">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Avg Cost/Frame</span>
          </div>
          <p className="text-xl font-bold">${stats.costs.avg_cost_per_frame}</p>
          <p className="text-xs text-muted-foreground">
            {stats.totals.good_frames} good frames
          </p>
        </CardContent>
      </Card>

      {/* Rejection Rate */}
      <Card className={`border-border ${stats.quality.rejection_rate > 5 ? "bg-red-500/10 border-red-500/30" : "bg-card/50"}`}>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className={`w-4 h-4 ${stats.quality.rejection_rate > 5 ? "text-red-400" : "text-muted-foreground"}`} />
            <span className="text-xs text-muted-foreground">Rejection Rate</span>
          </div>
          <p className={`text-xl font-bold ${stats.quality.rejection_rate > 5 ? "text-red-400" : ""}`}>
            {stats.quality.rejection_rate}%
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.quality.rejected_count} rejected
          </p>
        </CardContent>
      </Card>

      {/* User Breakdown - Full width */}
      {stats.user_breakdown.length > 0 && (
        <Card className="bg-card/50 border-border col-span-2 md:col-span-4">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Hours by Worker</span>
            </div>
            <div className="flex flex-wrap gap-4">
              {stats.user_breakdown.map((user, idx) => (
                <div key={idx} className="text-sm">
                  <span className="text-muted-foreground">{user.user_name}:</span>{" "}
                  <span className="font-medium">{user.hours}h</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    ({user.items_processed} items)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
