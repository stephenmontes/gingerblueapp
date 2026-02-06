import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Clock, Users, ChevronDown, ChevronRight } from "lucide-react";
import { ProductionDateGroup } from "./DateGroup";
import { API } from "@/utils/api";


export function ProductionUserDateReport() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("day");
  const [dailyLimit, setDailyLimit] = useState(9);
  const [isOpen, setIsOpen] = useState(false);

  const fetchReport = useCallback(async (selectedPeriod) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/production/reports/hours-by-user-date?period=${selectedPeriod}`, {
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
        totalFrames: 0
      };
    }
    acc[item.date].users.push(item);
    acc[item.date].totalHours += item.total_hours;
    acc[item.date].totalCost += item.labor_cost;
    acc[item.date].totalFrames += item.total_items;
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort().reverse();
  
  // Calculate totals for header
  const totalHours = data.reduce((sum, item) => sum + item.total_hours, 0);
  const totalCost = data.reduce((sum, item) => sum + item.labor_cost, 0);
  const totalFrames = data.reduce((sum, item) => sum + item.total_items, 0);
  const uniqueUsers = new Set(data.map(item => item.user_id)).size;

  if (loading && data.length === 0) {
    return (
      <Card className="bg-card border-border">
        <div className="p-4">
          <div className="h-12 bg-muted/30 animate-pulse rounded-lg" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border" data-testid="production-user-date-report">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors rounded-lg">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
              <Users className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-semibold">Hours by User & Date</h3>
                <p className="text-sm text-muted-foreground">
                  {uniqueUsers} users • {totalHours.toFixed(1)}h • ${totalCost.toFixed(2)} • {totalFrames} frames
                </p>
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-36" data-testid="production-period-selector">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {sortedDates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No time entries found for this period</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedDates.map(date => (
                  <ProductionDateGroup 
                    key={date} 
                    dateData={groupedByDate[date]} 
                    dailyLimit={dailyLimit}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
