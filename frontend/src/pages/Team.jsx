import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  Clock,
  TrendingUp,
  Award,
  RefreshCw,
  ShieldCheck,
  User,
  History,
  Calendar,
  Filter,
  Download,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { TimerHistory } from "@/components/TimerHistory";
import { API } from "@/utils/api";

const RoleBadge = ({ role }) => {
  const styles = {
    admin: "text-purple-400 bg-purple-400/10 border-purple-400/20",
    manager: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    worker: "text-green-400 bg-green-400/10 border-green-400/20",
  };

  return (
    <Badge variant="outline" className={styles[role] || styles.worker}>
      {role}
    </Badge>
  );
};

export default function Team({ user }) {
  const [users, setUsers] = useState([]);
  const [userStats, setUserStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTimerHistory, setShowTimerHistory] = useState(false);
  
  // Period filter state
  const [period, setPeriod] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  const fetchUsers = async () => {
    try {
      const usersRes = await fetch(`${API}/users`, { credentials: "include" });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  };

  const fetchStats = async (currentPeriod, startDate, endDate) => {
    try {
      let url = `${API}/stats/users`;
      const params = new URLSearchParams();
      
      if (currentPeriod === "custom" && startDate && endDate) {
        params.append("start_date", startDate);
        params.append("end_date", endDate);
      } else if (currentPeriod && currentPeriod !== "all") {
        params.append("period", currentPeriod);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const statsRes = await fetch(url, { credentials: "include" });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setUserStats(statsData);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchUsers(), 
        fetchStats(period, customStartDate, customEndDate)
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch stats when period changes
  useEffect(() => {
    if (!loading) {
      fetchStats(period, customStartDate, customEndDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // Handle period change
  const handlePeriodChange = (value) => {
    if (value === "custom") {
      setShowCustomDatePicker(true);
    } else {
      setPeriod(value);
      setShowCustomDatePicker(false);
    }
  };

  // Apply custom date range
  const applyCustomDateRange = () => {
    if (customStartDate && customEndDate) {
      setPeriod("custom");
      setShowCustomDatePicker(false);
    } else {
      toast.error("Please select both start and end dates");
    }
  };

  // Export team stats
  const handleExportStats = () => {
    let url = `${API}/export/team-stats`;
    const params = new URLSearchParams();
    
    if (period === "custom" && customStartDate && customEndDate) {
      params.append("start_date", customStartDate);
      params.append("end_date", customEndDate);
    } else if (period && period !== "all") {
      params.append("period", period);
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    // Trigger download
    window.open(url, "_blank");
    toast.success("Exporting team stats...");
  };

  // Get period label for display
  const getPeriodLabel = () => {
    switch (period) {
      case "day": return "Today";
      case "week": return "This Week";
      case "month": return "This Month";
      case "custom": return `${customStartDate} - ${customEndDate}`;
      default: return "All Time";
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const response = await fetch(`${API}/users/${userId}/role?role=${newRole}`, {
        method: "PUT",
        credentials: "include",
      });

      if (response.ok) {
        toast.success("Role updated successfully");
        setUsers((prev) =>
          prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u))
        );
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to update role");
      }
    } catch (error) {
      console.error("Failed to update role:", error);
      toast.error("Failed to update role");
    }
  };

  const handleRateChange = async (userId, newRate) => {
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate < 0) {
      toast.error("Please enter a valid hourly rate");
      return;
    }

    try {
      const response = await fetch(`${API}/users/${userId}/hourly-rate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hourly_rate: rate }),
      });

      if (response.ok) {
        toast.success("Hourly rate updated");
        setUsers((prev) =>
          prev.map((u) => (u.user_id === userId ? { ...u, hourly_rate: rate } : u))
        );
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to update hourly rate");
      }
    } catch (error) {
      console.error("Failed to update hourly rate:", error);
      toast.error("Failed to update hourly rate");
    }
  };

  const getInitials = (name) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getUserStats = (userId) => {
    return userStats.find((s) => s.user_id === userId) || {};
  };

  // Calculate team stats
  const totalHours = userStats.reduce((sum, s) => sum + (s.total_hours || 0), 0);
  const totalItems = userStats.reduce((sum, s) => sum + (s.total_items || 0), 0);
  const topPerformer = userStats.reduce(
    (max, s) => ((s.items_per_hour || 0) > (max.items_per_hour || 0) ? s : max),
    {}
  );

  if (loading) {
    return (
      <div className="space-y-6" data-testid="team-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="bg-card border-border animate-pulse">
              <CardContent className="p-6 h-24" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="team-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Team</h1>
          <p className="text-muted-foreground mt-1">
            Manage team members and view performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportStats} className="gap-2" data-testid="export-team-stats-btn">
            <Download className="w-4 h-4" />
            Export Stats
          </Button>
          <Button variant="outline" onClick={() => setShowTimerHistory(true)} className="gap-2" data-testid="my-timer-history-btn">
            <History className="w-4 h-4" />
            My Timer History
          </Button>
          <Button variant="outline" onClick={fetchData} className="gap-2" data-testid="refresh-team-btn">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Period Filter */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">View Stats:</span>
            </div>
            <Select value={period === "custom" ? "custom" : period} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-40" data-testid="period-filter">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="day">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Custom Date Picker */}
            {showCustomDatePicker && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">From:</Label>
                  <Input 
                    type="date" 
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-36"
                    data-testid="custom-start-date"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">To:</Label>
                  <Input 
                    type="date" 
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-36"
                    data-testid="custom-end-date"
                  />
                </div>
                <Button size="sm" onClick={applyCustomDateRange} data-testid="apply-custom-range">
                  Apply
                </Button>
              </div>
            )}
            
            {/* Current filter badge */}
            <Badge variant="secondary" className="gap-1">
              <Calendar className="w-3 h-3" />
              {getPeriodLabel()}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-caps mb-2">Team Members</p>
                <p className="text-4xl font-heading font-bold text-primary">
                  {users.length}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10">
                <Users className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-caps mb-2">Total Items</p>
                <p className="text-4xl font-heading font-bold text-green-400">
                  {totalItems.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{getPeriodLabel()}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-400/10">
                <TrendingUp className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-caps mb-2">Hours Logged</p>
                <p className="text-4xl font-heading font-bold text-secondary">
                  {totalHours.toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{getPeriodLabel()}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/10">
                <Clock className="w-6 h-6 text-secondary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-caps mb-2">Top Performer</p>
                <p className="text-lg font-heading font-bold truncate">
                  {topPerformer.user_name || "N/A"}
                </p>
                {topPerformer.items_per_hour && (
                  <p className="text-sm text-muted-foreground">
                    {topPerformer.items_per_hour} items/hr
                  </p>
                )}
              </div>
              <div className="p-3 rounded-lg bg-accent/10">
                <Award className="w-6 h-6 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Members Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team Members
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="p-8 text-center">
              <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-semibold mb-2">No team members</p>
              <p className="text-muted-foreground">
                Team members will appear here when they sign in
              </p>
            </div>
          ) : (
            <Table data-testid="team-table">
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="label-caps">Member</TableHead>
                  <TableHead className="label-caps">Role</TableHead>
                  <TableHead className="label-caps">Items Processed</TableHead>
                  <TableHead className="label-caps">Hours Logged</TableHead>
                  <TableHead className="label-caps">Items/Hour</TableHead>
                  {user?.role === "admin" && (
                    <TableHead className="label-caps">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((member) => {
                  const stats = getUserStats(member.user_id);
                  return (
                    <TableRow
                      key={member.user_id}
                      className="border-border hover:bg-muted/30"
                      data-testid={`team-member-${member.user_id}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={member.picture} alt={member.name} />
                            <AvatarFallback className="bg-primary/20 text-primary">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{member.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={member.role} />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono">{stats.total_items || 0}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono">
                          {(stats.total_hours || 0).toFixed(1)}h
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-muted-foreground" />
                          <span className="font-mono font-semibold">
                            {stats.items_per_hour || 0}
                          </span>
                        </div>
                      </TableCell>
                      {user?.role === "admin" && (
                        <TableCell>
                          {member.user_id !== user.user_id ? (
                            <Select
                              value={member.role}
                              onValueChange={(value) =>
                                handleRoleChange(member.user_id, value)
                              }
                            >
                              <SelectTrigger className="w-[120px]" data-testid={`role-select-${member.user_id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="worker">Worker</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <ShieldCheck className="w-4 h-4" />
                              You
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Timer History Dialog */}
      <Dialog open={showTimerHistory} onOpenChange={setShowTimerHistory}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              My Timer History & Breaks
            </DialogTitle>
          </DialogHeader>
          <TimerHistory onClose={() => setShowTimerHistory(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
