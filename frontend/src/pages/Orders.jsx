import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Package,
  Search,
  Filter,
  ExternalLink,
  Eye,
  Store,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const StatusBadge = ({ status }) => {
  const styles = {
    pending: "status-pending",
    in_production: "status-in-production",
    completed: "status-completed",
    shipped: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  };

  return (
    <Badge
      variant="outline"
      className={`${styles[status] || styles.pending} capitalize`}
    >
      {status?.replace("_", " ")}
    </Badge>
  );
};

const PlatformBadge = ({ platform }) => {
  const colors = {
    shopify: "text-green-400 bg-green-400/10 border-green-400/20",
    etsy: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  };

  return (
    <Badge variant="outline" className={colors[platform] || colors.shopify}>
      {platform}
    </Badge>
  );
};

export default function Orders({ user }) {
  const [orders, setOrders] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = async () => {
    try {
      let url = `${API}/orders`;
      const params = new URLSearchParams();
      if (storeFilter !== "all") params.append("store_id", storeFilter);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const response = await fetch(`${API}/stores`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setStores(data);
      }
    } catch (error) {
      console.error("Failed to fetch stores:", error);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchStores();
  }, [storeFilter, statusFilter]);

  const filteredOrders = orders.filter((order) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      order.order_id?.toLowerCase().includes(term) ||
      order.external_id?.toLowerCase().includes(term) ||
      order.customer_name?.toLowerCase().includes(term) ||
      order.customer_email?.toLowerCase().includes(term)
    );
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6" data-testid="orders-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Orders</h1>
          <p className="text-muted-foreground mt-1">
            Manage orders from all connected stores
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search orders, customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background"
                data-testid="search-orders-input"
              />
            </div>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-full md:w-[200px] bg-background" data-testid="store-filter">
                <Store className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {stores.map((store) => (
                  <SelectItem key={store.store_id} value={store.store_id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-background" data-testid="status-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_production">In Production</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center" data-testid="orders-loading">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading orders...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-8 text-center" data-testid="no-orders">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-semibold mb-2">No orders found</p>
              <p className="text-muted-foreground">
                {searchTerm || storeFilter !== "all" || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Orders will appear here when synced from your stores"}
              </p>
            </div>
          ) : (
            <Table data-testid="orders-table">
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="label-caps">Order ID</TableHead>
                  <TableHead className="label-caps">Store</TableHead>
                  <TableHead className="label-caps">Customer</TableHead>
                  <TableHead className="label-caps">Items</TableHead>
                  <TableHead className="label-caps">Total</TableHead>
                  <TableHead className="label-caps">Status</TableHead>
                  <TableHead className="label-caps">Date</TableHead>
                  <TableHead className="label-caps">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow
                    key={order.order_id}
                    className="border-border hover:bg-muted/30"
                    data-testid={`order-row-${order.order_id}`}
                  >
                    <TableCell>
                      <div>
                        <p className="font-mono text-sm">{order.order_id}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {order.external_id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <PlatformBadge platform={order.platform} />
                        <span className="text-sm">{order.store_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{order.customer_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.customer_email}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">
                        {order.items?.length || 0} items
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">
                        ${order.total_price?.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {formatDate(order.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedOrder(order)}
                            data-testid={`view-order-${order.order_id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <Package className="w-5 h-5" />
                              Order Details
                            </DialogTitle>
                          </DialogHeader>
                          {selectedOrder && (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="label-caps mb-1">Order ID</p>
                                  <p className="font-mono">
                                    {selectedOrder.order_id}
                                  </p>
                                </div>
                                <div>
                                  <p className="label-caps mb-1">External ID</p>
                                  <p className="font-mono">
                                    {selectedOrder.external_id}
                                  </p>
                                </div>
                                <div>
                                  <p className="label-caps mb-1">Store</p>
                                  <p>{selectedOrder.store_name}</p>
                                </div>
                                <div>
                                  <p className="label-caps mb-1">Platform</p>
                                  <PlatformBadge
                                    platform={selectedOrder.platform}
                                  />
                                </div>
                              </div>
                              <div className="border-t border-border pt-4">
                                <p className="label-caps mb-2">Customer</p>
                                <p className="font-medium">
                                  {selectedOrder.customer_name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {selectedOrder.customer_email}
                                </p>
                              </div>
                              <div className="border-t border-border pt-4">
                                <p className="label-caps mb-2">Items</p>
                                <div className="space-y-2">
                                  {selectedOrder.items?.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex justify-between items-center p-2 bg-muted/30 rounded"
                                    >
                                      <div>
                                        <p className="font-medium">
                                          {item.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground font-mono">
                                          SKU: {item.sku}
                                        </p>
                                      </div>
                                      <Badge variant="outline">
                                        x{item.qty}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="border-t border-border pt-4 flex justify-between items-center">
                                <div>
                                  <p className="label-caps mb-1">Total</p>
                                  <p className="text-2xl font-heading font-bold">
                                    ${selectedOrder.total_price?.toFixed(2)}
                                  </p>
                                </div>
                                <StatusBadge status={selectedOrder.status} />
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {filteredOrders.length > 0 && (
        <div className="text-sm text-muted-foreground text-center">
          Showing {filteredOrders.length} of {orders.length} orders
        </div>
      )}
    </div>
  );
}
