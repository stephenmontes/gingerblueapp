import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Clock, 
  History, 
  RefreshCw, 
  Play, 
  Pause,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { API } from "@/utils/api";


export function MyTimerHistory() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("today");
  const [expanded, setExpanded] = useState({});

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/fulfillment/user/timer-history?period=${period}`, {
        credentials: "include"
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch timer history:", err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchHistory();
    // Refresh every 60 seconds to keep active timer updated
    const interval = setInterval(fetchHistory, 60000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  function formatDuration(minutes) {
    if (!minutes || minutes < 1) return "< 1 min";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function formatTime(isoString) {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "";
    }
  }

  function toggleStageExpanded(stageId) {
    setExpanded(prev => ({
      ...prev,
      [stageId]: !prev[stageId]
    }));
  }

  if (loading && !data) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="h-24 bg-muted/30 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { totals, sessions, active_timer, by_stage, period_label } = data;

  return (
    <Card className="bg-card border-border" data-testid="my-timer-history">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <span className="font-semibold">My Timer History</span>
            <Badge variant="secondary">{period_label}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32 h-8" data-testid="history-period-selector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={fetchHistory}
              className="h-8 w-8"
              data-testid="refresh-history-btn"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-primary">{totals.total_hours}h</p>
            <p className="text-xs text-muted-foreground">Total Time</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{totals.session_count}</p>
            <p className="text-xs text-muted-foreground">Sessions</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{totals.total_orders}</p>
            <p className="text-xs text-muted-foreground">Orders</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{totals.total_items}</p>
            <p className="text-xs text-muted-foreground">Items</p>
          </div>
        </div>

        {/* Active Timer Indicator */}
        {active_timer && (
          <div className={`mb-4 p-3 rounded-lg flex items-center justify-between ${
            active_timer.is_paused 
              ? 'bg-yellow-500/10 border border-yellow-500/30' 
              : 'bg-green-500/10 border border-green-500/30'
          }`}>
            <div className="flex items-center gap-2">
              {active_timer.is_paused ? (
                <Pause className="w-4 h-4 text-yellow-400" />
              ) : (
                <Play className="w-4 h-4 text-green-400 animate-pulse" />
              )}
              <span className="text-sm font-medium">
                {active_timer.is_paused ? 'Timer paused' : 'Timer running'}: {active_timer.stage_name}
              </span>
            </div>
            <Badge variant={active_timer.is_paused ? "outline" : "secondary"} className={
              active_timer.is_paused ? "border-yellow-500 text-yellow-400" : ""
            }>
              +{formatDuration(active_timer.current_minutes)}
            </Badge>
          </div>
        )}

        {/* By Stage Breakdown */}
        {by_stage.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium mb-2">Time by Stage</p>
            {by_stage.map(stage => {
              const stageSessions = sessions.filter(s => s.stage_id === stage.stage_id);
              const isExpanded = expanded[stage.stage_id];
              
              return (
                <div key={stage.stage_id} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleStageExpanded(stage.stage_id)}
                    className="w-full p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{stage.stage_name}</span>
                      <Badge variant="outline" className="text-xs">
                        {stage.session_count} session{stage.session_count !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <span className="font-mono text-sm text-primary">
                      {formatDuration(stage.total_minutes)}
                    </span>
                  </button>
                  
                  {/* Expanded Session List */}
                  {isExpanded && stageSessions.length > 0 && (
                    <div className="border-t border-border bg-muted/20">
                      {stageSessions.map(session => (
                        <div 
                          key={session.log_id}
                          className="px-4 py-2 flex items-center justify-between text-sm border-b border-border last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {formatTime(session.started_at)} - {formatTime(session.completed_at)}
                            </span>
                            {session.order_number && (
                              <Badge variant="secondary" className="text-xs font-mono">
                                #{session.order_number}
                              </Badge>
                            )}
                            {session.is_manual && (
                              <Badge variant="outline" className="text-xs">Manual</Badge>
                            )}
                          </div>
                          <span className="font-mono">{formatDuration(session.duration_minutes)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {sessions.length === 0 && !active_timer && (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No timer sessions {period_label.toLowerCase()}</p>
            <p className="text-xs mt-1">Start a timer to track your work</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
