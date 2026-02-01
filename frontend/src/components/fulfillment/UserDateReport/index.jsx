import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Users } from "lucide-react";
import { DateGroup } from "./DateGroup";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function UserDateReport() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("day");
  const [dailyLimit, setDailyLimit] = useState(9);

  const fetchReport = useCallback(async (selectedPeriod) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/fulfillment/reports/hours-by-user-date?period=${selectedPeriod}`, {
        credentials: "include"
      });
      if (res.ok) {
        const result = await res.json();
        setData(result.data || []);
        setDailyLimit(result.daily_limit_hours || 9);
      }
    } catch (err) {
      console.error("Failed to fetch report:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(period);
  }, [period, fetchReport]);

  // Group data by date for subtotals
  const groupedByDate = data.reduce((acc, item) => {
    if (!acc[item.date]) {
      acc[item.date] = {
        date: item.date,
        users: [],
        totalHours: 0,
        totalCost: 0,
        totalOrders: 0,
        totalItems: 0
      };
    }
    acc[item.date].users.push(item);
    acc[item.date].totalHours += item.total_hours;
    acc[item.date].totalCost += item.labor_cost;
    acc[item.date].totalOrders += item.total_orders;
    acc[item.date].totalItems += item.total_items;
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort().reverse();

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8">
          <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Hours by User & Date
          </CardTitle>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {sortedDates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No time entries found for this period</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedDates.map(date => (
              <DateGroup 
                key={date} 
                dateData={groupedByDate[date]} 
                dailyLimit={dailyLimit}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
