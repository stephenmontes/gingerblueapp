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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function UsersTab({ userStats }) {
  if (!userStats || userStats.length === 0) {
    return (
      <Card className="bg-card border-border" data-testid="report-user-performance">
        <CardHeader>
          <CardTitle>User Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 flex items-center justify-center text-muted-foreground">
            No user performance data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border" data-testid="report-user-performance">
      <CardHeader>
        <CardTitle>User Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={userStats} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
              <XAxis type="number" stroke="#A1A1AA" tick={{ fill: "#A1A1AA" }} />
              <YAxis dataKey="user_name" type="category" stroke="#A1A1AA" tick={{ fill: "#A1A1AA" }} width={120} />
              <Tooltip contentStyle={{ backgroundColor: "#18181B", border: "1px solid #27272A", borderRadius: "8px" }} />
              <Bar dataKey="items_per_hour" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Items/Hour" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead>User</TableHead>
              <TableHead>Items Processed</TableHead>
              <TableHead>Hours Logged</TableHead>
              <TableHead>Items/Hour</TableHead>
              <TableHead>Sessions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {userStats.map((stat, index) => (
              <TableRow key={index} className="border-border">
                <TableCell className="font-medium">{stat.user_name}</TableCell>
                <TableCell className="font-mono">{stat.total_items}</TableCell>
                <TableCell className="font-mono">{stat.total_hours}h</TableCell>
                <TableCell>
                  <Badge variant="outline" className={stat.items_per_hour >= 10 ? "text-green-400 bg-green-400/10 border-green-400/20" : stat.items_per_hour >= 5 ? "text-amber-400 bg-amber-400/10 border-amber-400/20" : "text-muted-foreground"}>
                    {stat.items_per_hour}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono">{stat.sessions}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
