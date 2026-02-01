import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

export function OverviewTab({ dashboardStats }) {
  const storeData = dashboardStats?.orders_by_store || [];
  const dailyData = dashboardStats?.daily_production || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="bg-card border-border" data-testid="report-orders-by-store">
        <CardHeader>
          <CardTitle>Orders by Store</CardTitle>
        </CardHeader>
        <CardContent>
          {storeData.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={storeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="name"
                  >
                    {storeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#18181B", border: "1px solid #27272A", borderRadius: "8px" }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-muted-foreground">No data available</div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border" data-testid="report-daily-production">
        <CardHeader>
          <CardTitle>Daily Production</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyData.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis dataKey="_id" stroke="#A1A1AA" tick={{ fill: "#A1A1AA" }} tickFormatter={(val) => val.split("-").slice(1).join("/")} />
                  <YAxis stroke="#A1A1AA" tick={{ fill: "#A1A1AA" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#18181B", border: "1px solid #27272A", borderRadius: "8px" }} />
                  <Bar dataKey="items" fill="#22C55E" radius={[4, 4, 0, 0]} name="Items Processed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-muted-foreground">No production data available</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
