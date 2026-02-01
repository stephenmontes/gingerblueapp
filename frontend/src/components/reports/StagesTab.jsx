import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "recharts";

export function StagesTab({ stageStats }) {
  if (!stageStats || stageStats.length === 0) {
    return (
      <Card className="bg-card border-border" data-testid="report-stage-analysis">
        <CardHeader>
          <CardTitle>Stage Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 flex items-center justify-center text-muted-foreground">
            No stage data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border" data-testid="report-stage-analysis">
      <CardHeader>
        <CardTitle>Stage Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stageStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
              <XAxis dataKey="stage_name" stroke="#A1A1AA" tick={{ fill: "#A1A1AA" }} />
              <YAxis stroke="#A1A1AA" tick={{ fill: "#A1A1AA" }} />
              <Tooltip contentStyle={{ backgroundColor: "#18181B", border: "1px solid #27272A", borderRadius: "8px" }} />
              <Bar dataKey="total_items" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Total Items" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead>Stage</TableHead>
              <TableHead>Total Items</TableHead>
              <TableHead>Total Hours</TableHead>
              <TableHead>Avg Min/Item</TableHead>
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
      </CardContent>
    </Card>
  );
}
