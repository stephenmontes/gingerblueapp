import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock,
  Coffee,
  Play,
  Pause,
  Square,
  RefreshCw,
  Plus,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function TimerHistory({ onClose }) {
  const [history, setHistory] = useState([]);
  const [dailySummary, setDailySummary] = useState([]);
  const [workSummary, setWorkSummary] = useState(null);
  const [breaks, setBreaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [breakDuration, setBreakDuration] = useState(15);
  const [breakType, setBreakType] = useState("general");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [historyRes, dailyRes, summaryRes, breaksRes] = await Promise.all([
        fetch(`${API}/timers/history?limit=100`, { credentials: "include" }),
        fetch(`${API}/timers/daily-summary?days=7`, { credentials: "include" }),
        fetch(`${API}/timers/work-summary`, { credentials: "include" }),
        fetch(`${API}/timers/breaks?limit=50`, { credentials: "include" }),
      ]);

      if (historyRes.ok) setHistory(await historyRes.json());
      if (dailyRes.ok) setDailySummary(await dailyRes.json());
      if (summaryRes.ok) setWorkSummary(await summaryRes.json());
      if (breaksRes.ok) setBreaks(await breaksRes.json());
    } catch (err) {
      toast.error("Failed to load timer history");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogBreak() {
    try {
      const res = await fetch(`${API}/timers/log-break?duration_minutes=${breakDuration}&break_type=${breakType}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Break logged");
        setShowBreakDialog(false);
        fetchData();
      } else {
        toast.error("Failed to log break");
      }
    } catch (err) {
      toast.error("Failed to log break");
    }
  }

  function formatDuration(minutes) {
    if (!minutes) return "0m";
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  }

  function formatTime(dateStr) {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const actionIcon = (action) => {
    switch (action) {
      case "started": return <Play className="w-3 h-3 text-green-400" />;
      case "paused": return <Pause className="w-3 h-3 text-yellow-400" />;
      case "resumed": return <Play className="w-3 h-3 text-blue-400" />;
      case "stopped": return <Square className="w-3 h-3 text-red-400" />;
      default: return <Clock className="w-3 h-3" />;
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="timer-history">
      {/* Summary Cards */}
      {workSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Total Work</span>
              </div>
              <p className="text-2xl font-bold">{workSummary.work.total_hours}h</p>
              <p className="text-xs text-muted-foreground">{workSummary.work.total_sessions} sessions</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Coffee className="w-4 h-4 text-orange-400" />
                <span className="text-sm text-muted-foreground">Total Breaks</span>
              </div>
              <p className="text-2xl font-bold">{workSummary.breaks.total_hours}h</p>
              <p className="text-xs text-muted-foreground">{workSummary.breaks.total_count} breaks</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-sm text-muted-foreground">Items/Hour</span>
              </div>
              <p className="text-2xl font-bold">{workSummary.work.avg_items_per_hour}</p>
              <p className="text-xs text-muted-foreground">{workSummary.work.total_items} total</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-muted-foreground">Work Ratio</span>
              </div>
              <p className="text-2xl font-bold">{workSummary.efficiency.work_ratio}%</p>
              <p className="text-xs text-muted-foreground">work vs breaks</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Daily Summary */}
      {dailySummary.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="py-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Daily Summary (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {dailySummary.map((day) => (
                <div key={day.date} className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">{formatDate(day.date)}</p>
                  <p className="text-lg font-bold">{day.total_work_hours}h</p>
                  <p className="text-xs text-muted-foreground">{day.items_processed} items</p>
                </div>
              ))}
              {dailySummary.length === 0 && (
                <p className="col-span-7 text-center text-muted-foreground py-4">No data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Session History</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBreakDialog(true)} data-testid="log-break-btn">
            <Coffee className="w-4 h-4 mr-1" />
            Log Break
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Timer History Table */}
      <Card className="bg-card border-border">
        <ScrollArea className="h-[300px]">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>Date</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No timer history yet
                  </TableCell>
                </TableRow>
              ) : (
                history.map((log) => (
                  <TableRow key={log.log_id} className="border-border">
                    <TableCell>
                      <div>
                        <p className="text-sm">{formatDate(log.created_at)}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(log.started_at)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.stage_name}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatDuration(log.duration_minutes)}
                    </TableCell>
                    <TableCell className="font-mono">
                      {log.items_processed || 0}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {actionIcon(log.action)}
                        <span className="text-xs capitalize">{log.action}</span>
                        {log.had_breaks && (
                          <Badge variant="secondary" className="ml-1 text-xs">had breaks</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Break History */}
      {breaks.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="py-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Coffee className="w-5 h-5 text-orange-400" />
              Break Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {breaks.slice(0, 10).map((b) => (
                <div key={b.log_id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                  <div className="flex items-center gap-2">
                    <Coffee className="w-4 h-4 text-orange-400" />
                    <span className="capitalize">{b.break_type}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono">{b.duration_minutes}m</span>
                    <span className="text-xs text-muted-foreground">{formatDate(b.logged_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Break Dialog */}
      <Dialog open={showBreakDialog} onOpenChange={setShowBreakDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coffee className="w-5 h-5" />
              Log Break
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Break Type</label>
              <Select value={breakType} onValueChange={setBreakType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short Break (5-15 min)</SelectItem>
                  <SelectItem value="lunch">Lunch Break</SelectItem>
                  <SelectItem value="general">General Break</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Duration (minutes)</label>
              <Input
                type="number"
                min="1"
                max="120"
                value={breakDuration}
                onChange={(e) => setBreakDuration(parseInt(e.target.value) || 15)}
                data-testid="break-duration-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBreakDialog(false)}>Cancel</Button>
            <Button onClick={handleLogBreak} data-testid="confirm-log-break-btn">
              <Plus className="w-4 h-4 mr-1" />
              Log Break
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
