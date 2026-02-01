import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  Clock,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronUp,
  Layers,
  Award,
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function StageUserKpis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openStages, setOpenStages] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const res = await fetch(`${API}/stats/stage-user-kpis`, {
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
        setData(result);
        // Open all stages by default
        const open = {};
        result.stages.forEach(s => { open[s.stage_id] = true; });
        setOpenStages(open);
      }
    } catch (err) {
      toast.error("Failed to load stage KPIs");
    } finally {
      setLoading(false);
    }
  }

  function toggleStage(stageId) {
    setOpenStages(prev => ({ ...prev, [stageId]: !prev[stageId] }));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-muted/30 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || !data.stages || data.stages.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8 text-center text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No stage KPI data available yet</p>
          <p className="text-sm mt-2">Start tracking time on production stages to see metrics</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="stage-user-kpis">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={Layers}
          iconColor="text-primary"
          label="Stages Tracked"
          value={data.summary.total_stages}
        />
        <SummaryCard
          icon={Users}
          iconColor="text-blue-400"
          label="Workers"
          value={data.summary.total_users_tracked}
        />
        <SummaryCard
          icon={Clock}
          iconColor="text-green-400"
          label="Total Hours"
          value={data.summary.total_hours + "h"}
        />
        <SummaryCard
          icon={TrendingUp}
          iconColor="text-purple-400"
          label="Total Items"
          value={data.summary.total_items}
        />
      </div>

      {/* Stage Breakdown */}
      <div className="space-y-3">
        {data.stages.map(stage => (
          <StageCard
            key={stage.stage_id}
            stage={stage}
            isOpen={openStages[stage.stage_id]}
            onToggle={() => toggleStage(stage.stage_id)}
          />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, iconColor, label, value }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function StageCard({ stage, isOpen, onToggle }) {
  const topPerformer = stage.users.length > 0 ? stage.users[0] : null;

  return (
    <Card className="bg-card border-border">
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-4 h-auto hover:bg-muted/30"
            data-testid={`stage-kpi-toggle-${stage.stage_id}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="font-semibold text-lg">{stage.stage_name}</span>
              <Badge variant="secondary" className="text-xs">
                {stage.users.length} worker{stage.users.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-medium">{stage.totals.total_hours}h</span>
                <span className="text-muted-foreground"> • </span>
                <span className="font-medium">{stage.totals.total_items} items</span>
                <span className="text-muted-foreground"> • </span>
                <span className="font-medium text-green-400">{stage.totals.overall_items_per_hour}/hr</span>
              </div>
              {isOpen ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            {/* Stage Averages */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Avg Hours/User</p>
                <p className="text-xl font-bold">{stage.totals.avg_hours_per_user}h</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Avg Items/User</p>
                <p className="text-xl font-bold">{stage.totals.avg_items_per_user}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Sessions</p>
                <p className="text-xl font-bold">{stage.totals.total_sessions}</p>
              </div>
            </div>

            {/* Top Performer */}
            {topPerformer && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <Award className="w-5 h-5 text-yellow-500" />
                <span className="text-sm">
                  <span className="font-medium text-yellow-400">Top Performer:</span>{" "}
                  {topPerformer.user_name} ({topPerformer.total_items} items @ {topPerformer.items_per_hour}/hr)
                </span>
              </div>
            )}

            {/* User Table */}
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Worker</TableHead>
                  <TableHead className="text-right">Time in Stage</TableHead>
                  <TableHead className="text-right">Items Made</TableHead>
                  <TableHead className="text-right">Avg Items/Session</TableHead>
                  <TableHead className="text-right">Items/Hour</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stage.users.map((user, idx) => (
                  <TableRow key={user.user_id} className="border-border">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {idx === 0 && <Award className="w-4 h-4 text-yellow-500" />}
                        {user.user_name}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {user.total_hours}h
                      <span className="text-xs text-muted-foreground ml-1">
                        ({user.total_minutes}m)
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {user.total_items}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {user.avg_items_per_session}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={
                          user.items_per_hour >= 10
                            ? "text-green-400 border-green-400/30"
                            : user.items_per_hour >= 5
                            ? "text-blue-400 border-blue-400/30"
                            : "text-muted-foreground"
                        }
                      >
                        {user.items_per_hour}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {user.session_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
