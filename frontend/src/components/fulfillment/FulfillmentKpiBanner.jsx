import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, DollarSign, Package, TrendingUp, Calendar } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function FulfillmentKpiBanner() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKpis();
  }, []);

  async function fetchKpis() {
    try {
      const res = await fetch(`${API}/fulfillment/stats/overall-kpis`, {
        credentials: "include"
      });
      if (res.ok) {
        setKpis(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch KPIs:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-muted/30 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!kpis) return null;

  const weekLabel = kpis.week_start && kpis.week_end 
    ? `${kpis.week_start} - ${kpis.week_end}` 
    : "This Week";

  return (
    <div data-testid="fulfillment-kpi-banner">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Weekly Summary:</span>
        <Badge variant="outline" className="text-xs">{weekLabel}</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={Clock}
          label="Total Time"
          value={formatTime(kpis.total_hours)}
          subValue={`${kpis.avg_time_per_order} min/order avg`}
          color="blue"
        />
        <KpiCard
          icon={Package}
          label="Orders Completed"
          value={kpis.total_orders}
          subValue={`${kpis.total_items} items total`}
          color="green"
        />
        <KpiCard
          icon={DollarSign}
          label="Total Labor Cost"
          value={`$${kpis.labor_cost.toLocaleString()}`}
          subValue={`${kpis.session_count} work sessions`}
          color="purple"
        />
        <KpiCard
          icon={TrendingUp}
          label="Cost Analysis"
          value={`$${kpis.cost_per_order.toFixed(2)}/order`}
          subValue={`$${kpis.cost_per_item.toFixed(2)}/frame`}
          color="orange"
        />
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, subValue, color }) {
  const colorClasses = {
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    green: "bg-green-500/10 border-green-500/30 text-green-400",
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-400",
    orange: "bg-orange-500/10 border-orange-500/30 text-orange-400",
  };

  const iconColors = {
    blue: "text-blue-400",
    green: "text-green-400",
    purple: "text-purple-400",
    orange: "text-orange-400",
  };

  return (
    <Card className={`p-4 border ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
        </div>
        <div className={`p-2 rounded-lg bg-background/50`}>
          <Icon className={`w-5 h-5 ${iconColors[color]}`} />
        </div>
      </div>
    </Card>
  );
}

function formatTime(hours) {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
