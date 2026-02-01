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
import { ChevronDown, ChevronUp, Award } from "lucide-react";

export function StageKpiCard({ stage, isOpen, onToggle }) {
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
            <StageAverages totals={stage.totals} />
            {topPerformer && <TopPerformer user={topPerformer} />}
            <UserTable users={stage.users} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function StageAverages({ totals }) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <div className="bg-muted/30 rounded-lg p-3 text-center">
        <p className="text-xs text-muted-foreground mb-1">Avg Hours/User</p>
        <p className="text-xl font-bold">{totals.avg_hours_per_user}h</p>
      </div>
      <div className="bg-muted/30 rounded-lg p-3 text-center">
        <p className="text-xs text-muted-foreground mb-1">Avg Items/User</p>
        <p className="text-xl font-bold">{totals.avg_items_per_user}</p>
      </div>
      <div className="bg-muted/30 rounded-lg p-3 text-center">
        <p className="text-xs text-muted-foreground mb-1">Total Sessions</p>
        <p className="text-xl font-bold">{totals.total_sessions}</p>
      </div>
    </div>
  );
}

function TopPerformer({ user }) {
  return (
    <div className="flex items-center gap-2 mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
      <Award className="w-5 h-5 text-yellow-500" />
      <span className="text-sm">
        <span className="font-medium text-yellow-400">Top Performer:</span>{" "}
        {user.user_name} ({user.total_items} items @ {user.items_per_hour}/hr)
      </span>
    </div>
  );
}

function UserTable({ users }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead>Worker</TableHead>
          <TableHead className="text-right">Time</TableHead>
          <TableHead className="text-right">Items</TableHead>
          <TableHead className="text-right">Avg/Session</TableHead>
          <TableHead className="text-right">Items/Hr</TableHead>
          <TableHead className="text-right">Sessions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user, idx) => (
          <UserRow key={user.user_id} user={user} isTop={idx === 0} />
        ))}
      </TableBody>
    </Table>
  );
}

function UserRow({ user, isTop }) {
  return (
    <TableRow className="border-border">
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {isTop && <Award className="w-4 h-4 text-yellow-500" />}
          {user.user_name}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono">{user.total_hours}h</TableCell>
      <TableCell className="text-right font-mono font-bold">{user.total_items}</TableCell>
      <TableCell className="text-right font-mono">{user.avg_items_per_session}</TableCell>
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
      <TableCell className="text-right font-mono">{user.session_count}</TableCell>
    </TableRow>
  );
}
