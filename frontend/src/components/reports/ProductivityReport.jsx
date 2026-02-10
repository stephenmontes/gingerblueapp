import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Activity, TrendingUp, Users, Calendar, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";

export function ProductivityReport() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState("week");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  useEffect(() => {
    fetchReport();
  }, [period]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      let url = `${API}/activity/productivity-report?period=${period}`;
      if (period === "custom" && customStartDate && customEndDate) {
        url += `&start_date=${customStartDate}&end_date=${customEndDate}`;
      }
      
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        toast.error("Failed to load productivity report");
      }
    } catch (err) {
      console.error("Error fetching report:", err);
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const handleCustomDateSearch = () => {
    if (!customStartDate || !customEndDate) {
      toast.error("Please select both start and end dates");
      return;
    }
    setPeriod("custom");
    fetchReport();
  };

  const getProductivityColor = (percent) => {
    if (percent >= 80) return "text-green-500";
    if (percent >= 60) return "text-yellow-500";
    if (percent >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getProductivityBadge = (percent) => {
    if (percent >= 80) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (percent >= 60) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    if (percent >= 40) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Team Productivity Report
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Compare logged-in time vs. tracked work time
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32 h-8" data-testid="productivity-period-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="sm" onClick={fetchReport} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        {/* Custom Date Range */}
        {period === "custom" && (
          <div className="flex items-end gap-2 mt-4 flex-wrap">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-36 h-8"
              />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-36 h-8"
              />
            </div>
            <Button size="sm" onClick={handleCustomDateSearch}>
              Apply
            </Button>
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {loading && !data ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <SummaryCard
                icon={Clock}
                label="Total Logged In"
                value={`${data.summary.total_logged_in_hours}h`}
                color="blue"
              />
              <SummaryCard
                icon={Activity}
                label="Total Tracked"
                value={`${data.summary.total_tracked_hours}h`}
                color="green"
              />
              <SummaryCard
                icon={TrendingUp}
                label="Overall Productivity"
                value={`${data.summary.overall_productivity_percent}%`}
                color={data.summary.overall_productivity_percent >= 60 ? "green" : "orange"}
              />
              <SummaryCard
                icon={Users}
                label="Total Entries"
                value={data.summary.total_entries}
                color="purple"
              />
            </div>

            {/* Averages */}
            <div className="mb-4 p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Period:</span> {data.period_label}
                {" • "}
                <span className="font-medium text-foreground">Avg Logged In:</span> {data.summary.avg_logged_in_hours_per_entry}h/entry
                {" • "}
                <span className="font-medium text-foreground">Avg Tracked:</span> {data.summary.avg_tracked_hours_per_entry}h/entry
              </p>
            </div>

            {/* Data Table */}
            {data.data.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No activity data for this period</p>
                <p className="text-sm mt-1">Activity tracking starts when users are logged in</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Logged In</TableHead>
                      <TableHead className="text-right">Tracked</TableHead>
                      <TableHead className="text-right">Productivity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{row.date}</TableCell>
                        <TableCell>{row.user_name}</TableCell>
                        <TableCell className="text-right">
                          {row.logged_in_hours > 0 ? `${row.logged_in_hours}h` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {row.tracked_hours}h
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={getProductivityBadge(row.productivity_percent)}>
                            {row.productivity_percent}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>Failed to load data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ icon: Icon, label, value, color }) {
  const colorClasses = {
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    green: "bg-green-500/10 border-green-500/30 text-green-400",
    orange: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-400",
  };

  const iconColors = {
    blue: "text-blue-400",
    green: "text-green-400",
    orange: "text-orange-400",
    purple: "text-purple-400",
  };

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold mt-1">{value}</p>
        </div>
        <Icon className={`w-5 h-5 ${iconColors[color]}`} />
      </div>
    </div>
  );
}
