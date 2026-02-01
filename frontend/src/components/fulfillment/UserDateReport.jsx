import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { ChevronDown, ChevronRight, Clock, Users, Calendar, AlertTriangle, DollarSign } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function UserDateReport() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("day");
  const [dailyLimit, setDailyLimit] = useState(9);

  useEffect(() => {
    fetchReport(period);
  }, [period]);

  async function fetchReport(selectedPeriod) {
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
  }

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
    return <LoadingState />;
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
          <EmptyState />
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

function LoadingState() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-8">
        <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p>No time entries found for this period</p>
    </div>
  );
}

function DateGroup({ dateData, dailyLimit }) {
  const [isOpen, setIsOpen] = useState(true);
  const formattedDate = new Date(dateData.date).toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{formattedDate}</span>
            <Badge variant="secondary">{dateData.users.length} users</Badge>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Hours</p>
              <p className="font-bold">{dateData.totalHours.toFixed(1)}h</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Labor Cost</p>
              <p className="font-bold text-green-400">${dateData.totalCost.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Orders</p>
              <p className="font-bold">{dateData.totalOrders}</p>
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-muted/20">
                <TableHead className="w-8"></TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dateData.users.map((userData) => (
                <UserRow key={userData.user_id} userData={userData} dailyLimit={dailyLimit} />
              ))}
            </TableBody>
          </Table>
          
          {/* Subtotal Row */}
          <div className="flex items-center justify-between p-3 bg-primary/5 border-t border-border">
            <span className="font-medium text-sm">Subtotal for {dateData.date}</span>
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span className="font-bold">{dateData.totalHours.toFixed(1)}h</span>
              </div>
              <div className="flex items-center gap-1 text-green-400">
                <DollarSign className="w-3 h-3" />
                <span className="font-bold">{dateData.totalCost.toFixed(2)}</span>
              </div>
              <span>{dateData.totalOrders} orders</span>
              <span>{dateData.totalItems} items</span>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function UserRow({ userData, dailyLimit }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const exceeds = userData.total_hours > dailyLimit;

  return (
    <>
      <TableRow className={`border-border ${exceeds ? 'bg-red-500/5' : ''}`}>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </Button>
        </TableCell>
        <TableCell className="font-medium">{userData.user_name}</TableCell>
        <TableCell className={`text-right font-mono ${exceeds ? 'text-red-400 font-bold' : ''}`}>
          {userData.total_hours.toFixed(1)}h
        </TableCell>
        <TableCell className="text-right font-mono text-green-400">
          ${userData.labor_cost.toFixed(2)}
        </TableCell>
        <TableCell className="text-right">{userData.total_orders}</TableCell>
        <TableCell className="text-right">{userData.total_items}</TableCell>
        <TableCell>
          {exceeds && (
            <Badge variant="outline" className="border-red-500 text-red-500 gap-1">
              <AlertTriangle className="w-3 h-3" />
              Over {dailyLimit}h
            </Badge>
          )}
        </TableCell>
      </TableRow>
      
      {isExpanded && userData.entries.length > 0 && (
        <TableRow className="border-border bg-muted/10">
          <TableCell colSpan={7} className="p-0">
            <div className="p-3 pl-10">
              <p className="text-xs font-medium text-muted-foreground mb-2">Time Entries</p>
              <div className="space-y-1">
                {userData.entries.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 px-2 bg-background/50 rounded">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">{entry.stage_name}</Badge>
                      {entry.order_number && (
                        <span className="font-mono text-xs">#{entry.order_number}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{entry.items_processed} items</span>
                      <span className="font-mono">{entry.duration_minutes}m</span>
                      <span className="text-xs">
                        {entry.completed_at ? new Date(entry.completed_at).toLocaleTimeString() : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
