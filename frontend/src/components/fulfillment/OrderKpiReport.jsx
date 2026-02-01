import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  Clock, 
  DollarSign, 
  ChevronDown, 
  ChevronRight,
  Search,
  Users,
  FileText,
  Package
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function OrderKpiReport() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    fetchReport();
  }, []);

  async function fetchReport() {
    try {
      const res = await fetch(`${API}/fulfillment/reports/order-kpis`, {
        credentials: "include"
      });
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch report:", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredOrders = orders.filter(order => 
    order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate totals
  const totals = filteredOrders.reduce((acc, order) => ({
    totalMinutes: acc.totalMinutes + order.total_minutes,
    totalCost: acc.totalCost + order.labor_cost,
    totalItems: acc.totalItems + order.total_items,
    orderCount: acc.orderCount + 1
  }), { totalMinutes: 0, totalCost: 0, totalItems: 0, orderCount: 0 });

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
    <Card className="bg-card border-border" data-testid="order-kpi-report">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Order Time & Cost Report
          </CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Row */}
        <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
          <SummaryCard 
            label="Orders Tracked" 
            value={totals.orderCount} 
            icon={Package}
          />
          <SummaryCard 
            label="Total Time" 
            value={formatTime(totals.totalMinutes)} 
            icon={Clock}
          />
          <SummaryCard 
            label="Total Labor Cost" 
            value={`$${totals.totalCost.toFixed(2)}`} 
            icon={DollarSign}
          />
          <SummaryCard 
            label="Avg Cost/Frame" 
            value={`$${totals.totalItems > 0 ? (totals.totalCost / totals.totalItems).toFixed(2) : '0.00'}`} 
            icon={DollarSign}
          />
        </div>

        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No order time data available yet</p>
            <p className="text-sm mt-1">Start tracking time on orders in the worksheet</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="w-10"></TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Time</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Cost/Frame</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-center">Contributors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => (
                <OrderReportRow 
                  key={order.order_id} 
                  order={order}
                  onViewDetails={() => setSelectedOrder(order)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Order Details Dialog */}
      <OrderDetailsDialog 
        order={selectedOrder} 
        onClose={() => setSelectedOrder(null)} 
      />
    </Card>
  );
}

function SummaryCard({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

function OrderReportRow({ order, onViewDetails }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <TableRow className="border-border hover:bg-muted/30">
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        </TableCell>
        <TableCell>
          <button
            onClick={onViewDetails}
            className="font-mono font-medium hover:text-primary hover:underline"
          >
            #{order.order_number}
          </button>
        </TableCell>
        <TableCell>{order.customer_name}</TableCell>
        <TableCell className="text-right font-mono">
          {formatTime(order.total_minutes)}
        </TableCell>
        <TableCell className="text-right">{order.total_items}</TableCell>
        <TableCell className="text-right font-mono text-green-400">
          ${order.cost_per_item.toFixed(2)}
        </TableCell>
        <TableCell className="text-right font-mono font-medium text-primary">
          ${order.labor_cost.toFixed(2)}
        </TableCell>
        <TableCell className="text-center">
          <div className="flex justify-center gap-1">
            {order.users.slice(0, 3).map((user, i) => (
              <Badge 
                key={i} 
                variant="outline" 
                className="text-xs"
                title={`${user.user_name}: ${formatTime(user.minutes)}`}
              >
                {user.user_name.split(' ')[0]}
              </Badge>
            ))}
            {order.users.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{order.users.length - 3}
              </Badge>
            )}
          </div>
        </TableCell>
      </TableRow>
      
      {/* Expanded Row - Stage Breakdown */}
      {isOpen && (
        <TableRow className="border-border bg-muted/20">
          <TableCell colSpan={8} className="py-3">
            <div className="pl-8 space-y-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Time by Stage</p>
              <div className="flex gap-4 flex-wrap">
                {order.stages.map((stage, i) => (
                  <div key={i} className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-lg">
                    <span className="text-sm">{stage.stage_name}</span>
                    <Badge variant="secondary" className="font-mono">
                      {formatTime(stage.minutes)}
                    </Badge>
                  </div>
                ))}
              </div>
              
              <p className="text-xs font-medium text-muted-foreground mb-2 mt-4">Time by User</p>
              <div className="flex gap-4 flex-wrap">
                {order.users.map((user, i) => (
                  <div key={i} className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-lg">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm">{user.user_name}</span>
                    <Badge variant="secondary" className="font-mono">
                      {formatTime(user.minutes)}
                    </Badge>
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

function OrderDetailsDialog({ order, onClose }) {
  if (!order) return null;

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            Order #{order.order_number} - Time Report
          </DialogTitle>
        </DialogHeader>

        {/* Order Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Total Time</p>
            <p className="text-xl font-bold">{formatTime(order.total_minutes)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Items</p>
            <p className="text-xl font-bold">{order.total_items}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cost/Frame</p>
            <p className="text-xl font-bold text-green-400">${order.cost_per_item.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Cost</p>
            <p className="text-xl font-bold text-primary">${order.labor_cost.toFixed(2)}</p>
          </div>
        </div>

        {/* Time Entries */}
        <div className="mt-4">
          <p className="text-sm font-medium mb-3">Time Entries</p>
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>User</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.time_entries.map((entry, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="w-3 h-3 text-muted-foreground" />
                      {entry.user_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{entry.stage_name}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatTime(entry.duration_minutes)}
                  </TableCell>
                  <TableCell className="text-right">{entry.items_processed}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {entry.completed_at ? new Date(entry.completed_at).toLocaleDateString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatTime(minutes) {
  if (!minutes || minutes === 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
