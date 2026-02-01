import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Users,
  Clock,
  Package,
  RefreshCw,
  BarChart3,
  Activity,
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COLORS = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

export default function Reports({ user }) {
  const [dashboardStats, setDashboardStats] = useState(null);
  const [userStats, setUserStats] = useState([]);
  const [stageStats, setStageStats] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [dashRes, usersRes, stagesRes] = await Promise.all([
        fetch(`${API}/stats/dashboard`, { credentials: "include" }),
        fetch(`${API}/stats/users`, { credentials: "include" }),
        fetch(`${API}/stats/stages`, { credentials: "include" }),
      ]);

      if (dashRes.ok) {
        const data = await dashRes.json();
        setDashboardStats(data);
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUserStats(data);
      }

      if (stagesRes.ok) {
        const data = await stagesRes.json();
        setStageStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch reports:", error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6" data-testid="reports-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card border-border animate-pulse">
              <CardContent className="p-6 h-64" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const storeData = dashboardStats?.orders_by_store || [];
  const dailyData = dashboardStats?.daily_production || [];

  return (
    <div className="space-y-6" data-testid="reports-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Production analytics and performance metrics
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} className="gap-2" data-testid="refresh-reports-btn">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  {dashboardStats?.orders?.total || 0}
                </p>
                <p className="text-xs text-muted-foreground">Total Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/10">
                <TrendingUp className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  {dashboardStats?.avg_items_per_hour || 0}
                </p>
                <p className="text-xs text-muted-foreground">Items/Hour Avg</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Users className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  {userStats.length}
                </p>
                <p className="text-xs text-muted-foreground">Active Workers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-400/10">
                <Clock className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold">
                  {userStats.reduce((sum, s) => sum + (s.total_hours || 0), 0).toFixed(1)}h
                </p>
                <p className="text-xs text-muted-foreground">Total Hours</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="overview" className="gap-2" data-testid="tab-overview">
            <BarChart3 className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2" data-testid="tab-users">
            <Users className="w-4 h-4" />
            User Performance
          </TabsTrigger>
          <TabsTrigger value="stages" className="gap-2" data-testid="tab-stages">
            <Activity className="w-4 h-4" />
            Stage Analysis
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Orders by Store */}
            <Card className="bg-card border-border" data-testid="report-orders-by-store">
              <CardHeader>
                <CardTitle>Orders by Store</CardTitle>
              </CardHeader>
              <CardContent>
                {storeData.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={storeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="count"
                          nameKey="name"
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
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-72 flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Daily Production */}
            <Card className="bg-card border-border" data-testid="report-daily-production">
              <CardHeader>
                <CardTitle>Daily Production</CardTitle>
              </CardHeader>
              <CardContent>
                {dailyData.length > 0 ? (
                  <div className="h-72">
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
                        <Bar dataKey="items" fill="#22C55E" radius={[4, 4, 0, 0]} name="Items Processed" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-72 flex items-center justify-center text-muted-foreground">
                    No production data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* User Performance Tab */}
        <TabsContent value="users" className="space-y-6">
          <Card className="bg-card border-border" data-testid="report-user-performance">
            <CardHeader>
              <CardTitle>User Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {userStats.length > 0 ? (
                <>
                  <div className="h-72 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={userStats} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                        <XAxis type="number" stroke="#A1A1AA" tick={{ fill: "#A1A1AA" }} />
                        <YAxis
                          dataKey="user_name"
                          type="category"
                          stroke="#A1A1AA"
                          tick={{ fill: "#A1A1AA" }}
                          width={120}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#18181B",
                            border: "1px solid #27272A",
                            borderRadius: "8px",
                          }}
                        />
                        <Bar dataKey="items_per_hour" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Items/Hour" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="label-caps">User</TableHead>
                        <TableHead className="label-caps">Items Processed</TableHead>
                        <TableHead className="label-caps">Hours Logged</TableHead>
                        <TableHead className="label-caps">Items/Hour</TableHead>
                        <TableHead className="label-caps">Sessions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userStats.map((stat, index) => (
                        <TableRow key={index} className="border-border">
                          <TableCell className="font-medium">{stat.user_name}</TableCell>
                          <TableCell className="font-mono">{stat.total_items}</TableCell>
                          <TableCell className="font-mono">{stat.total_hours}h</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                stat.items_per_hour >= 10
                                  ? "text-green-400 bg-green-400/10 border-green-400/20"
                                  : stat.items_per_hour >= 5
                                  ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                                  : "text-muted-foreground"
                              }
                            >
                              {stat.items_per_hour}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono">{stat.sessions}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : (
                <div className="h-72 flex items-center justify-center text-muted-foreground">
                  No user performance data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stage Analysis Tab */}
        <TabsContent value="stages" className="space-y-6">
          <Card className="bg-card border-border" data-testid="report-stage-analysis">
            <CardHeader>
              <CardTitle>Stage Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              {stageStats.length > 0 ? (
                <>
                  <div className="h-72 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stageStats}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                        <XAxis
                          dataKey="stage_name"
                          stroke="#A1A1AA"
                          tick={{ fill: "#A1A1AA" }}
                        />
                        <YAxis stroke="#A1A1AA" tick={{ fill: "#A1A1AA" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#18181B",
                            border: "1px solid #27272A",
                            borderRadius: "8px",
                          }}
                        />
                        <Bar dataKey="total_items" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Total Items" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="label-caps">Stage</TableHead>
                        <TableHead className="label-caps">Total Items</TableHead>
                        <TableHead className="label-caps">Total Hours</TableHead>
                        <TableHead className="label-caps">Avg Min/Item</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stageStats.map((stat, index) => (
                        <TableRow key={index} className="border-border">
                          <TableCell className="font-medium">{stat.stage_name}</TableCell>
                          <TableCell className="font-mono">{stat.total_items}</TableCell>
                          <TableCell className="font-mono">{stat.total_hours}h</TableCell>
                          <TableCell className="font-mono">{stat.avg_minutes_per_item} min</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : (
                <div className="h-72 flex items-center justify-center text-muted-foreground">
                  No stage data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
