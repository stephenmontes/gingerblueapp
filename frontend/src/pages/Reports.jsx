import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Activity,
  Download,
  FileText,
  FileSpreadsheet,
  Users,
  AlertTriangle,
  RefreshCw,
  Layers,
  Package,
  Calendar as CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import { KpiCards, QualityTab, UsersTab, StagesTab, OverviewTab, StageUserKpis, BatchReports } from "@/components/reports";
import { API } from "@/utils/api";
import { format, subDays, startOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";

export default function Reports() {
  const [dashboardStats, setDashboardStats] = useState(null);
  const [productionKpis, setProductionKpis] = useState(null);
  const [userStats, setUserStats] = useState([]);
  const [stageStats, setStageStats] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Date filter state
  const [dateRange, setDateRange] = useState("week"); // day, week, month, custom
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Calculate date range for API calls
  const getDateParams = () => {
    const now = new Date();
    let startDate, endDate;
    
    switch (dateRange) {
      case "day":
        startDate = format(now, "yyyy-MM-dd");
        endDate = format(now, "yyyy-MM-dd");
        break;
      case "week":
        startDate = format(subDays(now, 7), "yyyy-MM-dd");
        endDate = format(now, "yyyy-MM-dd");
        break;
      case "month":
        startDate = format(startOfMonth(now), "yyyy-MM-dd");
        endDate = format(now, "yyyy-MM-dd");
        break;
      case "last_month":
        const lastMonth = subMonths(now, 1);
        startDate = format(startOfMonth(lastMonth), "yyyy-MM-dd");
        endDate = format(endOfMonth(lastMonth), "yyyy-MM-dd");
        break;
      case "custom":
        startDate = customStartDate ? format(customStartDate, "yyyy-MM-dd") : null;
        endDate = customEndDate ? format(customEndDate, "yyyy-MM-dd") : null;
        break;
      default:
        startDate = format(subDays(now, 7), "yyyy-MM-dd");
        endDate = format(now, "yyyy-MM-dd");
    }
    
    return { startDate, endDate };
  };

  const getDateLabel = () => {
    const { startDate, endDate } = getDateParams();
    if (!startDate || !endDate) return "Select dates";
    if (startDate === endDate) return startDate;
    return `${startDate} to ${endDate}`;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateParams();
      const dateParams = startDate && endDate ? `?start_date=${startDate}&end_date=${endDate}` : "";
      
      const [dashRes, kpisRes, usersRes, stagesRes] = await Promise.all([
        fetch(`${API}/stats/dashboard${dateParams}`, { credentials: "include" }),
        fetch(`${API}/stats/production-kpis${dateParams}`, { credentials: "include" }),
        fetch(`${API}/stats/users${dateParams}`, { credentials: "include" }),
        fetch(`${API}/stats/stages${dateParams}`, { credentials: "include" }),
      ]);

      if (dashRes.ok) setDashboardStats(await dashRes.json());
      if (kpisRes.ok) setProductionKpis(await kpisRes.json());
      if (usersRes.ok) setUserStats(await usersRes.json());
      if (stagesRes.ok) setStageStats(await stagesRes.json());
    } catch (error) {
      console.error("Failed to fetch reports:", error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange, customStartDate, customEndDate]);

  const handleExport = (type) => {
    const urls = {
      "orders-csv": `${API}/export/orders`,
      "time-logs-csv": `${API}/export/time-logs`,
      "user-stats-csv": `${API}/export/user-stats`,
      "production-kpis-csv": `${API}/export/production-kpis`,
      "inventory-csv": `${API}/export/inventory`,
      "report-pdf": `${API}/export/report-pdf`,
    };
    const url = urls[type];
    if (url) {
      window.open(url, "_blank");
      toast.success("Export started");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" data-testid="reports-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="reports-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Production analytics, costs, and quality metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" data-testid="export-dropdown-btn">
                <Download className="w-4 h-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("orders-csv")}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Orders (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("time-logs-csv")}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Time Logs (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("user-stats-csv")}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                User Stats (CSV)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport("production-kpis-csv")}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Production KPIs (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("inventory-csv")}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Inventory (CSV)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport("report-pdf")}>
                <FileText className="w-4 h-4 mr-2" />
                Full Report (PDF)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={fetchData} className="gap-2" data-testid="refresh-reports-btn">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <KpiCards dashboardStats={dashboardStats} productionKpis={productionKpis} />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted/50 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-2" data-testid="tab-overview">
            <BarChart3 className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="batch-reports" className="gap-2" data-testid="tab-batch-reports">
            <Package className="w-4 h-4" />
            Batch Reports
          </TabsTrigger>
          <TabsTrigger value="stage-kpis" className="gap-2" data-testid="tab-stage-kpis">
            <Layers className="w-4 h-4" />
            Stage KPIs
          </TabsTrigger>
          <TabsTrigger value="quality" className="gap-2" data-testid="tab-quality">
            <AlertTriangle className="w-4 h-4" />
            Quality & Costs
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

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab dashboardStats={dashboardStats} />
        </TabsContent>

        <TabsContent value="batch-reports" className="space-y-6">
          <BatchReports />
        </TabsContent>

        <TabsContent value="stage-kpis" className="space-y-6">
          <StageUserKpis />
        </TabsContent>

        <TabsContent value="quality" className="space-y-6">
          <QualityTab productionKpis={productionKpis} />
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <UsersTab userStats={userStats} />
        </TabsContent>

        <TabsContent value="stages" className="space-y-6">
          <StagesTab stageStats={stageStats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
