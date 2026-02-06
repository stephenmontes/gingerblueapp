import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Clock,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  RefreshCw,
  Zap,
  Store,
  User,
  ChevronDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API } from "@/utils/api";

const KPICard = ({ title, value, subtitle, icon: Icon, color, trend }) => (
  <Card className="bg-card border-border card-hover" data-testid={`kpi-${title.toLowerCase().replace(/\s/g, '-')}`}>
    <CardContent className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="label-caps mb-2">{title}</p>
          <p className={`kpi-value ${color}`}>{value}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color.replace("text-", "bg-")}/10`}>
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-3 text-sm text-green-400">
          <TrendingUp className="w-4 h-4" />
          <span>{trend}</span>
        </div>
      )}
    </CardContent>
  </Card>
);

export default function Dashboard({ user }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  
  // Frame production rate modal state
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [ratesData, setRatesData] = useState(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratePeriod, setRatePeriod] = useState("week");
  const [rateStage, setRateStage] = useState("all");

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API}/stats/dashboard`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
      toast.error("Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  };
  
  const fetchFrameRates = async (period = ratePeriod, stageId = rateStage) => {
    setRatesLoading(true);
    try {
      let url = `${API}/stats/frame-production-rates?period=${period}`;
      if (stageId && stageId !== "all") {
        url += `&stage_id=${stageId}`;
      }
      const response = await fetch(url, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setRatesData(data);
      }
    } catch (error) {
      console.error("Failed to fetch frame rates:", error);
      toast.error("Failed to load frame production rates");
    } finally {
      setRatesLoading(false);
    }
  };
  
  const handleOpenRatesModal = () => {
    setShowRatesModal(true);
    fetchFrameRates();
  };
  
  const handlePeriodChange = (newPeriod) => {
    setRatePeriod(newPeriod);
    fetchFrameRates(newPeriod, rateStage);
  };
  
  const handleStageChange = (newStage) => {
    setRateStage(newStage);
    fetchFrameRates(ratePeriod, newStage);
  };

  const seedDemoData = async () => {
    setSeeding(true);
    try {
      const response = await fetch(`${API}/demo/seed`, {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        toast.success("Demo data created successfully!");
        fetchStats();
      } else {
        const err = await response.json();
        toast.error(err.detail || "Failed to seed demo data");
      }
    } catch (error) {
      toast.error("Failed to seed demo data");
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const COLORS = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6"];

  if (loading) {
    return (
      <div className="space-y-6" data-testid="dashboard-loading">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card border-border animate-pulse">
              <CardContent className="p-6 h-32" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const storeData = stats?.orders_by_store || [];
  const dailyData = stats?.daily_production || [];

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">
            Welcome back, {user?.name?.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening in your manufacturing hub
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={fetchStats}
            className="gap-2"
            data-testid="refresh-stats-btn"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          {user?.role === "admin" && (
            <Button
              onClick={seedDemoData}
              disabled={seeding}
              className="gap-2 bg-primary hover:bg-primary/90"
              data-testid="seed-demo-btn"
            >
              <Zap className="w-4 h-4" />
              {seeding ? "Seeding..." : "Load Demo Data"}
            </Button>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Orders"
          value={stats?.orders?.total || 0}
          subtitle="Sent to production"
          icon={Package}
          color="text-primary"
        />
        <KPICard
          title="Pending"
          value={stats?.orders?.pending || 0}
          subtitle="Awaiting production"
          icon={Clock}
          color="text-amber-400"
        />
        <KPICard
          title="In Production"
          value={stats?.orders?.in_production || 0}
          subtitle="Currently processing"
          icon={RefreshCw}
          color="text-blue-400"
        />
        <KPICard
          title="Completed"
          value={stats?.orders?.completed || 0}
          subtitle="Shipped"
          icon={CheckCircle2}
          color="text-green-400"
        />
      </div>

      {/* Avg Frame Production Rate Card - Clickable */}
      <Card 
        className="bg-card border-border cursor-pointer hover:border-primary/50 transition-colors" 
        data-testid="frame-production-rate-card"
        onClick={handleOpenRatesModal}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="label-caps mb-2">Avg Frame Production Rate</p>
              <p className="text-5xl font-heading font-bold text-primary">
                {stats?.avg_frames_per_hour || 0}
              </p>
              <p className="text-muted-foreground mt-1">frames per hour</p>
            </div>
            <div className="p-4 rounded-xl bg-primary/10">
              <TrendingUp className="w-8 h-8 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders by Store */}
        <Card className="bg-card border-border" data-testid="orders-by-store-chart">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Store className="w-5 h-5 text-primary" />
              Orders by Store
            </CardTitle>
          </CardHeader>
          <CardContent>
            {storeData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={storeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="count"
                      nameKey="name"
                      label={({ name, percent }) =>
                        `${name} (${(percent * 100).toFixed(0)}%)`
                      }
                    >
                      {storeData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181B",
                        border: "1px solid #27272A",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No store data available. Load demo data to see charts.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Production */}
        <Card className="bg-card border-border" data-testid="daily-production-chart">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="w-5 h-5 text-secondary" />
              Daily Production (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis
                      dataKey="_id"
                      stroke="#A1A1AA"
                      tick={{ fill: "#A1A1AA" }}
                      tickFormatter={(val) => val.split("-").slice(1).join("/")}
                    />
                    <YAxis stroke="#A1A1AA" tick={{ fill: "#A1A1AA" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181B",
                        border: "1px solid #27272A",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="items" fill="#22C55E" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No production data available. Complete some orders to see stats.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-card border-border" data-testid="quick-actions">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-auto py-4 justify-start gap-3 hover:bg-primary/10 hover:border-primary/50"
              onClick={() => (window.location.href = "/production")}
              data-testid="quick-action-production"
            >
              <div className="p-2 rounded-lg bg-primary/10">
                <RefreshCw className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold">Production Queue</p>
                <p className="text-sm text-muted-foreground">
                  Move orders through stages
                </p>
              </div>
              <ArrowRight className="w-4 h-4 ml-auto" />
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 justify-start gap-3 hover:bg-secondary/10 hover:border-secondary/50"
              onClick={() => (window.location.href = "/orders")}
              data-testid="quick-action-orders"
            >
              <div className="p-2 rounded-lg bg-secondary/10">
                <Package className="w-5 h-5 text-secondary" />
              </div>
              <div className="text-left">
                <p className="font-semibold">View Orders</p>
                <p className="text-sm text-muted-foreground">
                  See all orders from stores
                </p>
              </div>
              <ArrowRight className="w-4 h-4 ml-auto" />
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 justify-start gap-3 hover:bg-accent/10 hover:border-accent/50"
              onClick={() => (window.location.href = "/reports")}
              data-testid="quick-action-reports"
            >
              <div className="p-2 rounded-lg bg-accent/10">
                <TrendingUp className="w-5 h-5 text-accent" />
              </div>
              <div className="text-left">
                <p className="font-semibold">View Reports</p>
                <p className="text-sm text-muted-foreground">
                  Production analytics
                </p>
              </div>
              <ArrowRight className="w-4 h-4 ml-auto" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
