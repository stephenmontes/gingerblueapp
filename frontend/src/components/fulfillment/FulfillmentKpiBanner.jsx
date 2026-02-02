import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, DollarSign, Package, TrendingUp, Calendar } from "lucide-react";
import { API } from "@/utils/api";


const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "all_time", label: "All Time" },
];

export function FulfillmentKpiBanner() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("this_week");

  useEffect(() => {
    fetchKpis(period);
  }, [period]);

  async function fetchKpis(selectedPeriod) {
    setLoading(true);
    try {
      const res = await fetch(`${API}/fulfillment/stats/overall-kpis?period=${selectedPeriod}`, {
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

  if (loading && !kpis) {
    return <LoadingState />;
  }

  if (!kpis) return null;

  return (
    <div data-testid="fulfillment-kpi-banner">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Summary:</span>
          <span className="text-sm font-medium">{kpis.date_range}</span>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40 h-8" data-testid="kpi-period-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${loading ? 'opacity-50' : ''}`}>
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

function LoadingState() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 bg-muted/30 animate-pulse rounded-lg" />
      ))}
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
        <div className="p-2 rounded-lg bg-background/50">
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
