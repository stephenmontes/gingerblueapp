import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  User,
  Clock,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Calendar,
  Layers,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";

export function UserProductionReport() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState("week");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [expandedUsers, setExpandedUsers] = useState({});
  const [selectedUser, setSelectedUser] = useState("all");
  const [selectedStage, setSelectedStage] = useState("all");

  useEffect(() => {
    fetchReport();
  }, [period]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      let url = `${API}/production/reports/user-stage-summary?period=${period}`;
      if (period === "custom" && customStartDate && customEndDate) {
        url += `&start_date=${customStartDate}&end_date=${customEndDate}`;
      }

      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const result = await res.json();
        setData(result);
        // Auto-expand first user
        if (result.users && result.users.length > 0) {
          setExpandedUsers({ [result.users[0].user_id]: true });
        }
      } else {
        // Fallback to existing endpoint if new one doesn't exist
        const fallbackRes = await fetch(`${API}/production/reports/hours-by-user-date?period=${period}`, {
          credentials: "include"
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          // Transform data to expected format
          setData(transformFallbackData(fallbackData));
        } else {
          toast.error("Failed to load production report");
        }
      }
    } catch (err) {
      console.error("Error fetching report:", err);
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  // Transform fallback data to expected format
  const transformFallbackData = (fallbackData) => {
    const userMap = {};
    
    for (const entry of fallbackData.data || []) {
      if (!userMap[entry.user_id]) {
        userMap[entry.user_id] = {
          user_id: entry.user_id,
          user_name: entry.user_name,
          total_hours: 0,
          total_items: 0,
          items_per_hour: 0,
          stages: {},
          daily_entries: []
        };
      }
      
      userMap[entry.user_id].total_hours += entry.total_hours || 0;
      userMap[entry.user_id].total_items += entry.total_items || 0;
      
      // Group by stage from entries
      for (const e of entry.entries || []) {
        const stageName = e.stage_name || "Unknown";
        if (!userMap[entry.user_id].stages[stageName]) {
          userMap[entry.user_id].stages[stageName] = {
            stage_name: stageName,
            total_hours: 0,
            total_items: 0,
            items_per_hour: 0
          };
        }
        userMap[entry.user_id].stages[stageName].total_hours += (e.duration_minutes || 0) / 60;
        userMap[entry.user_id].stages[stageName].total_items += e.items_processed || 0;
      }
      
      userMap[entry.user_id].daily_entries.push({
        date: entry.date,
        hours: entry.total_hours,
        items: entry.total_items
      });
    }
    
    // Calculate items per hour
    const users = Object.values(userMap).map(user => {
      user.items_per_hour = user.total_hours > 0 
        ? Math.round((user.total_items / user.total_hours) * 10) / 10 
        : 0;
      
      // Convert stages object to array and calculate items_per_hour
      user.stages = Object.values(user.stages).map(stage => ({
        ...stage,
        total_hours: Math.round(stage.total_hours * 100) / 100,
        items_per_hour: stage.total_hours > 0 
          ? Math.round((stage.total_items / stage.total_hours) * 10) / 10 
          : 0
      }));
      
      return user;
    });
    
    // Calculate summary
    const totalHours = users.reduce((sum, u) => sum + u.total_hours, 0);
    const totalItems = users.reduce((sum, u) => sum + u.total_items, 0);
    
    return {
      period: fallbackData.period,
      period_label: getPeriodLabel(fallbackData.period),
      users,
      summary: {
        total_users: users.length,
        total_hours: Math.round(totalHours * 100) / 100,
        total_items: totalItems,
        overall_items_per_hour: totalHours > 0 ? Math.round((totalItems / totalHours) * 10) / 10 : 0
      }
    };
  };

  const getPeriodLabel = (p) => {
    switch (p) {
      case "day": return "Today";
      case "week": return "This Week";
      case "month": return "This Month";
      case "custom": return "Custom Range";
      default: return "This Week";
    }
  };

  const toggleUser = (userId) => {
    setExpandedUsers(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const handleCustomDateSearch = () => {
    if (!customStartDate || !customEndDate) {
      toast.error("Please select both start and end dates");
      return;
    }
    fetchReport();
  };

  // Filter users based on selection
  const filteredUsers = data?.users?.filter(user => {
    if (selectedUser !== "all" && user.user_id !== selectedUser) return false;
    if (selectedStage !== "all") {
      return user.stages?.some(s => s.stage_name === selectedStage);
    }
    return true;
  }) || [];

  // Get unique stages for filter
  const allStages = [...new Set(
    data?.users?.flatMap(u => u.stages?.map(s => s.stage_name) || []) || []
  )].sort();

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              User Production Report
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Time tracked and items per hour by user and stage
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32 h-8" data-testid="user-report-period-select">
                <Calendar className="w-4 h-4 mr-1" />
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

        {/* Filters */}
        {data && (
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">User:</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {data.users?.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.user_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Stage:</Label>
              <Select value={selectedStage} onValueChange={setSelectedStage}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  {allStages.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                icon={User}
                label="Active Workers"
                value={data.summary?.total_users || 0}
                color="blue"
              />
              <SummaryCard
                icon={Clock}
                label="Total Hours"
                value={`${data.summary?.total_hours || 0}h`}
                color="green"
              />
              <SummaryCard
                icon={Layers}
                label="Total Items"
                value={data.summary?.total_items || 0}
                color="purple"
              />
              <SummaryCard
                icon={TrendingUp}
                label="Avg Items/Hour"
                value={data.summary?.overall_items_per_hour || 0}
                color="orange"
              />
            </div>

            {/* Period Info */}
            <div className="mb-4 p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Period:</span> {data.period_label || getPeriodLabel(period)}
              </p>
            </div>

            {/* User List */}
            {filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No production data for this period</p>
                <p className="text-sm mt-1">Start tracking time to see metrics</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map(user => (
                  <UserCard
                    key={user.user_id}
                    user={user}
                    isExpanded={expandedUsers[user.user_id]}
                    onToggle={() => toggleUser(user.user_id)}
                    selectedStage={selectedStage}
                  />
                ))}
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

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold mt-1">{value}</p>
        </div>
        <Icon className="w-5 h-5 opacity-70" />
      </div>
    </div>
  );
}

function UserCard({ user, isExpanded, onToggle, selectedStage }) {
  // Filter stages if a specific stage is selected
  const filteredStages = selectedStage === "all" 
    ? user.stages 
    : user.stages?.filter(s => s.stage_name === selectedStage);

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="border border-border rounded-lg overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-medium">{user.user_name}</p>
                <p className="text-sm text-muted-foreground">
                  {user.stages?.length || 0} stages tracked
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {/* Quick Stats */}
              <div className="hidden sm:flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Hours</p>
                  <p className="font-bold text-green-400">{user.total_hours}h</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Items</p>
                  <p className="font-bold text-purple-400">{user.total_items}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Items/Hour</p>
                  <p className="font-bold text-orange-400">{user.items_per_hour}</p>
                </div>
              </div>

              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border p-4 bg-muted/10">
            {/* Mobile Stats */}
            <div className="sm:hidden grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-2 bg-green-500/10 rounded">
                <p className="text-xs text-muted-foreground">Hours</p>
                <p className="font-bold text-green-400">{user.total_hours}h</p>
              </div>
              <div className="text-center p-2 bg-purple-500/10 rounded">
                <p className="text-xs text-muted-foreground">Items</p>
                <p className="font-bold text-purple-400">{user.total_items}</p>
              </div>
              <div className="text-center p-2 bg-orange-500/10 rounded">
                <p className="text-xs text-muted-foreground">Items/Hr</p>
                <p className="font-bold text-orange-400">{user.items_per_hour}</p>
              </div>
            </div>

            {/* Stage Breakdown Table */}
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Stage Breakdown
            </h4>
            {filteredStages && filteredStages.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stage</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Items/Hour</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStages.map((stage, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge variant="outline">{stage.stage_name}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {stage.total_hours}h
                        </TableCell>
                        <TableCell className="text-right">
                          {stage.total_items}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={getItemsPerHourColor(stage.items_per_hour)}>
                            {stage.items_per_hour}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No stage data available
              </p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function getItemsPerHourColor(value) {
  if (value >= 10) return "text-green-400 font-bold";
  if (value >= 5) return "text-yellow-400 font-medium";
  if (value > 0) return "text-orange-400";
  return "text-muted-foreground";
}
