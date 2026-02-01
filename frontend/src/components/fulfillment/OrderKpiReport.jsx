import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock, DollarSign, Search, FileText, Package } from "lucide-react";
import { OrderReportRow } from "./OrderReportRow";
import { OrderDetailsDialog } from "./OrderDetailsDialog";

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

  const totals = filteredOrders.reduce((acc, order) => ({
    totalMinutes: acc.totalMinutes + order.total_minutes,
    totalCost: acc.totalCost + order.labor_cost,
    totalItems: acc.totalItems + order.total_items,
    orderCount: acc.orderCount + 1
  }), { totalMinutes: 0, totalCost: 0, totalItems: 0, orderCount: 0 });

  if (loading) {
    return <LoadingState />;
  }

  return (
    <Card className="bg-card border-border" data-testid="order-kpi-report">
      <ReportHeader searchTerm={searchTerm} onSearchChange={setSearchTerm} />
      <CardContent>
        <ReportSummary totals={totals} />
        <ReportContent 
          orders={filteredOrders} 
          onSelectOrder={setSelectedOrder} 
        />
      </CardContent>
      <OrderDetailsDialog order={selectedOrder} onClose={() => setSelectedOrder(null)} />
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

function ReportHeader({ searchTerm, onSearchChange }) {
  return (
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
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
    </CardHeader>
  );
}

function ReportSummary({ totals }) {
  const avgCostPerFrame = totals.totalItems > 0 
    ? (totals.totalCost / totals.totalItems).toFixed(2) 
    : '0.00';
    
  return (
    <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
      <SummaryItem icon={Package} label="Orders Tracked" value={totals.orderCount} />
      <SummaryItem icon={Clock} label="Total Time" value={formatTime(totals.totalMinutes)} />
      <SummaryItem icon={DollarSign} label="Total Labor Cost" value={`$${totals.totalCost.toFixed(2)}`} />
      <SummaryItem icon={DollarSign} label="Avg Cost/Frame" value={`$${avgCostPerFrame}`} />
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value }) {
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

function ReportContent({ orders, onSelectOrder }) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No order time data available yet</p>
        <p className="text-sm mt-1">Start tracking time on orders in the worksheet</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead className="w-10" />
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
        {orders.map((order) => (
          <OrderReportRow 
            key={order.order_id} 
            order={order}
            onViewDetails={() => onSelectOrder(order)}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function formatTime(minutes) {
  if (!minutes || minutes === 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
