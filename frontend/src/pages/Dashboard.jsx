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

const KPICard = ({ title, value, subtitle, icon: Icon, color, trend, onClick, clickable }) => (
  <Card 
    className={`bg-card border-border card-hover ${clickable ? 'cursor-pointer hover:border-primary/50 transition-colors' : ''}`} 
    data-testid={`kpi-${title.toLowerCase().replace(/\s/g, '-')}`}
    onClick={onClick}
  >
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
      {clickable && (
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          <ArrowRight className="w-3 h-3" />
          Click to view details
        </p>
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
  
  // In Production orders modal state
  const [showInProductionModal, setShowInProductionModal] = useState(false);
  const [inProductionOrders, setInProductionOrders] = useState([]);
  const [inProductionLoading, setInProductionLoading] = useState(false);
  
  // Total Orders (unfulfilled) modal state
  const [showTotalOrdersModal, setShowTotalOrdersModal] = useState(false);
  const [totalOrdersData, setTotalOrdersData] = useState(null);
  const [totalOrdersLoading, setTotalOrdersLoading] = useState(false);
  const [expandedStore, setExpandedStore] = useState(null);

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
  
  const fetchInProductionOrders = async () => {
    setInProductionLoading(true);
    try {
      const response = await fetch(`${API}/stats/orders-in-production`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setInProductionOrders(data.orders || []);
      }
    } catch (error) {
      console.error("Failed to fetch in-production orders:", error);
      toast.error("Failed to load orders in production");
    } finally {
      setInProductionLoading(false);
    }
  };
  
  const handleOpenInProductionModal = () => {
    setShowInProductionModal(true);
    fetchInProductionOrders();
  };
  
  const fetchTotalOrdersByStore = async () => {
    setTotalOrdersLoading(true);
    try {
      const response = await fetch(`${API}/stats/unfulfilled-orders-by-store`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setTotalOrdersData(data);
      }
    } catch (error) {
      console.error("Failed to fetch orders by store:", error);
      toast.error("Failed to load orders by store");
    } finally {
      setTotalOrdersLoading(false);
    }
  };
  
  const handleOpenTotalOrdersModal = () => {
    setShowTotalOrdersModal(true);
    setExpandedStore(null);
    fetchTotalOrdersByStore();
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
      console.error("Failed to fetch frame rates:");
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
            Here&apos;s what&apos;s happening in your manufacturing hub
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
          subtitle="Unfulfilled orders"
          icon={Package}
          color="text-primary"
          clickable={true}
          onClick={handleOpenTotalOrdersModal}
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
          clickable={true}
          onClick={handleOpenInProductionModal}
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
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <ArrowRight className="w-3 h-3" />
            Click to view per-user rates
          </p>
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

      {/* Frame Production Rates Modal */}
      <Dialog open={showRatesModal} onOpenChange={setShowRatesModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Frame Production Rates by User
            </DialogTitle>
          </DialogHeader>
          
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Time Period</label>
              <Select value={ratePeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-[140px]" data-testid="rate-period-select">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Last 24 Hours</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Stage</label>
              <Select value={rateStage} onValueChange={handleStageChange}>
                <SelectTrigger className="w-[160px]" data-testid="rate-stage-select">
                  <SelectValue placeholder="All stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  {ratesData?.available_stages?.map(stage => (
                    <SelectItem key={stage.stage_id} value={stage.stage_id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Summary Stats */}
          {ratesData && !ratesLoading && (
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Card className="bg-muted/50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-primary">{ratesData.overall_average}</p>
                  <p className="text-xs text-muted-foreground">Avg Frames/Hour</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{ratesData.total_frames}</p>
                  <p className="text-xs text-muted-foreground">Total Frames</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{ratesData.total_hours}</p>
                  <p className="text-xs text-muted-foreground">Total Hours</p>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* User Rates Table */}
          {ratesLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : ratesData?.user_rates?.length > 0 ? (
            <div className="space-y-3">
              {ratesData.user_rates.map((userData, idx) => (
                <Card key={userData.user_id} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          idx === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                          idx === 1 ? 'bg-gray-400/20 text-gray-400' :
                          idx === 2 ? 'bg-amber-600/20 text-amber-600' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold">{userData.user_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {userData.total_frames} frames in {userData.total_hours}h
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary">{userData.overall_rate}</p>
                        <p className="text-xs text-muted-foreground">frames/hour</p>
                      </div>
                    </div>
                    
                    {/* Stage breakdown */}
                    {userData.stages?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">By Stage:</p>
                        <div className="flex flex-wrap gap-2">
                          {userData.stages.map(stage => (
                            <Badge 
                              key={stage.stage_id} 
                              variant="outline"
                              className="text-xs"
                            >
                              {stage.stage_name}: {stage.rate}/hr ({stage.frames} frames)
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No production data available for the selected period.</p>
              <p className="text-sm mt-1">Complete some frames to see rates.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* In Production Orders Modal */}
      <Dialog open={showInProductionModal} onOpenChange={setShowInProductionModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-400" />
              Orders In Production ({inProductionOrders.length})
            </DialogTitle>
          </DialogHeader>
          
          {inProductionLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : inProductionOrders.length > 0 ? (
            <div className="flex-1 overflow-y-auto max-h-[50vh] pr-2">
              <div className="space-y-2">
                {inProductionOrders.map((order) => (
                  <Card key={order.order_id} className="bg-card border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold">#{order.order_number}</p>
                            <Badge variant="outline" className="text-xs">
                              {order.store_name}
                            </Badge>
                            {order.batch_name && (
                              <Badge className="text-xs bg-blue-500/20 text-blue-400">
                                {order.batch_name}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{order.customer_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{order.total_qty} items</p>
                          <p className="text-xs text-muted-foreground">
                            {order.total_price ? `$${order.total_price.toFixed(2)}` : ''}
                          </p>
                        </div>
                      </div>
                      {order.created_at && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Ordered: {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No orders currently in production.</p>
              <p className="text-sm mt-1">Send orders to production to see them here.</p>
            </div>
          )}
          
          <div className="pt-4 border-t border-border mt-auto">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => window.location.href = "/production"}
            >
              Go to Production Page
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Total Orders by Store Modal */}
      <Dialog open={showTotalOrdersModal} onOpenChange={setShowTotalOrdersModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Unfulfilled Orders by Store
            </DialogTitle>
          </DialogHeader>
          
          {totalOrdersLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : totalOrdersData ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Card className="bg-muted/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-primary">{totalOrdersData.total_orders}</p>
                    <p className="text-sm text-muted-foreground">Total Orders</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-green-500">${totalOrdersData.total_value?.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Combined Value</p>
                  </CardContent>
                </Card>
              </div>
              
              {/* Stores List */}
              <div className="flex-1 overflow-y-auto max-h-[45vh] pr-2 space-y-3">
                {totalOrdersData.stores?.map((store) => (
                  <Card key={store.store_name} className="bg-card border-border">
                    <CardContent className="p-0">
                      {/* Store Header - Clickable */}
                      <div 
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setExpandedStore(expandedStore === store.store_name ? null : store.store_name)}
                      >
                        <div className="flex items-center gap-3">
                          <Store className="w-5 h-5 text-primary" />
                          <div>
                            <p className="font-semibold">{store.store_name}</p>
                            <p className="text-sm text-muted-foreground">{store.order_count} orders</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xl font-bold text-green-500">${store.total_value?.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">subtotal</p>
                          </div>
                          <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedStore === store.store_name ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                      
                      {/* Expanded Orders List */}
                      {expandedStore === store.store_name && (
                        <div className="border-t border-border p-4 bg-muted/30 max-h-60 overflow-y-auto">
                          <div className="space-y-2">
                            {store.orders?.map((order) => (
                              <div 
                                key={order.order_id} 
                                className="flex items-center justify-between p-2 bg-background rounded-lg"
                              >
                                <div>
                                  <p className="font-medium">#{order.order_number}</p>
                                  <p className="text-xs text-muted-foreground">{order.customer_name}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold">${order.total_price?.toFixed(2) || '0.00'}</p>
                                  <Badge variant="outline" className="text-xs">
                                    {order.batch_id ? 'In Batch' : order.status}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No unfulfilled orders found.</p>
            </div>
          )}
          
          <div className="pt-4 border-t border-border mt-auto">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => window.location.href = "/orders"}
            >
              Go to Orders Page
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
