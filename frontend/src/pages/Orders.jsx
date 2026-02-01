import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Package, Search, Filter, Eye, Store, Calendar, Layers, ArrowRight, CheckSquare, RefreshCw, CloudDownload, Loader2, ShoppingBag, ArrowUpDown, ArrowUp, ArrowDown, Upload, FileSpreadsheet, Download, Archive } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

function StatusBadge({ status }) {
  const statusConfig = {
    awaiting_shipment: { label: "Awaiting Shipment", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
    pending: { label: "Pending Payment", color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
    shipped: { label: "Shipped", color: "text-green-400 bg-green-400/10 border-green-400/20" },
    in_production: { label: "In Production", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
    completed: { label: "Completed", color: "text-green-400 bg-green-400/10 border-green-400/20" },
    cancelled: { label: "Cancelled", color: "text-red-400 bg-red-400/10 border-red-400/20" },
    on_hold: { label: "On Hold", color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  };
  
  const config = statusConfig[status] || { label: status?.replace("_", " ") || "Unknown", color: "text-gray-400 bg-gray-400/10 border-gray-400/20" };
  
  return (
    <Badge variant="outline" className={config.color}>
      {config.label}
    </Badge>
  );
}

function PlatformBadge({ platform }) {
  const colors = {
    shopify: "text-green-400 bg-green-400/10 border-green-400/20",
    etsy: "text-orange-400 bg-orange-400/10 border-orange-400/20",
    dropship: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
    csv: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  };

  return (
    <Badge variant="outline" className={colors[platform] || colors.shopify}>
      {platform}
    </Badge>
  );
}

export default function Orders({ user }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active"); // Default to active orders
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [createBatchOpen, setCreateBatchOpen] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [showOnlyUnbatched, setShowOnlyUnbatched] = useState(false); // Show all orders by default
  const [syncing, setSyncing] = useState(null);
  const [syncStatus, setSyncStatus] = useState([]);
  const [shipstationSyncing, setShipstationSyncing] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 100;
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState("created_at");
  const [sortDirection, setSortDirection] = useState("desc");

  // CSV Upload state
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvStoreId, setCsvStoreId] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fetchOrders = async (page = currentPage) => {
    try {
      let url = API + "/orders";
      const params = new URLSearchParams();
      if (storeFilter !== "all") params.append("store_id", storeFilter);
      // Send status filter to backend - backend now handles "active" filtering
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (showOnlyUnbatched) params.append("unbatched", "true");
      // Add pagination params
      params.append("page", page.toString());
      params.append("page_size", pageSize.toString());
      url += "?" + params.toString();

      const response = await fetch(url, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        // Handle paginated response
        if (data.orders) {
          setOrders(data.orders);
          setTotalPages(data.pagination?.total_pages || 1);
          setTotalCount(data.pagination?.total_count || data.orders.length);
          setCurrentPage(data.pagination?.page || 1);
        } else {
          // Fallback for non-paginated response
          setOrders(Array.isArray(data) ? data : []);
          setTotalCount(Array.isArray(data) ? data.length : 0);
        }
      }
    } catch (error) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const response = await fetch(API + "/stores", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setStores(data);
      }
    } catch (error) {
      console.error("Failed to fetch stores:", error);
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const response = await fetch(API + "/orders/sync/status", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setSyncStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch sync status:", error);
    }
  };

  useEffect(() => {
    // Reset to page 1 when filters change
    setCurrentPage(1);
    fetchOrders(1);
    fetchStores();
    fetchSyncStatus();
  }, [storeFilter, statusFilter, showOnlyUnbatched]);

  // Fetch orders when page changes (but not when filters change - that's handled above)
  useEffect(() => {
    if (currentPage > 1) {
      fetchOrders(currentPage);
    }
  }, [currentPage]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      setLoading(true);
    }
  };

  const handleSyncOrders = async (storeId) => {
    setSyncing(storeId);
    try {
      const response = await fetch(`${API}/orders/sync/${storeId}?days_back=365`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(
          `Synced ${result.synced} orders (${result.created} new, ${result.updated} updated, ${result.skipped} skipped)`
        );
        fetchOrders();
        fetchSyncStatus();
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to sync orders");
      }
    } catch (error) {
      toast.error("Failed to sync orders");
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAllStores = async () => {
    const activeStores = stores.filter(s => (s.platform === "shopify" || s.platform === "etsy") && s.is_active);
    if (activeStores.length === 0) {
      toast.error("No active Shopify or Etsy stores to sync");
      return;
    }

    setSyncing("all");
    let totalSynced = 0;
    let totalCreated = 0;

    for (const store of activeStores) {
      try {
        const response = await fetch(`${API}/orders/sync/${store.store_id}?days_back=365`, {
          method: "POST",
          credentials: "include",
        });
        if (response.ok) {
          const result = await response.json();
          totalSynced += result.synced;
          totalCreated += result.created;
        }
      } catch (error) {
        console.error(`Failed to sync ${store.name}:`, error);
      }
    }

    toast.success(`Synced ${totalSynced} orders from ${activeStores.length} stores (${totalCreated} new)`);
    fetchOrders();
    fetchSyncStatus();
    setSyncing(null);
  };

  // ShipStation sync handler
  const handleShipStationSync = async (storeId = null) => {
    setShipstationSyncing(true);
    try {
      // Sync orders from GingerBlueCo (Etsy) by default, or specific store
      const endpoint = storeId 
        ? `${API}/shipstation/sync/orders/${storeId}?days_back=365`
        : `${API}/shipstation/sync/gingerblueco?days_back=365`;
      
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(
          `ShipStation: Synced ${result.total_fetched || 0} orders (${result.created || 0} new, ${result.updated || 0} updated)`
        );
        
        // Also sync shipment tracking
        await fetch(`${API}/shipstation/sync/shipments?days_back=30`, {
          method: "POST",
          credentials: "include",
        });
        
        fetchOrders();
      } else {
        const error = await response.json();
        toast.error(error.detail || "ShipStation sync failed");
      }
    } catch (error) {
      toast.error("ShipStation sync failed");
    } finally {
      setShipstationSyncing(false);
    }
  };

  // CSV Upload handlers
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast.error("Please select a CSV file");
        return;
      }
      setCsvFile(file);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile || !csvStoreId) {
      toast.error("Please select a store and CSV file");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);

      const response = await fetch(`${API}/orders/upload-csv/${csvStoreId}`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(
          `Uploaded ${result.total_orders} orders (${result.created} new, ${result.updated} updated)`
        );
        setCsvUploadOpen(false);
        setCsvFile(null);
        setCsvStoreId("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        fetchOrders();
        fetchSyncStatus();
      } else {
        const error = await response.json();
        toast.error(error.detail || "Upload failed");
      }
    } catch (error) {
      toast.error("Failed to upload CSV");
    } finally {
      setUploading(false);
    }
  };

  const downloadCsvTemplate = () => {
    // Template matches Antique Farmhouse CSV format
    const csv = `Order Number,Full Name,Address 1,City,State,Zip,Item Number,Price,Qty,Order Comments,Order Date
PO-12345,John Smith,123 Main St,New York,NY,10001,FRAME-8X10-OAK,29.99,2,Gift wrap,2025-02-15
PO-12345,John Smith,123 Main St,New York,NY,10001,FRAME-11X14-WAL,39.99,1,Gift wrap,2025-02-15
PO-12346,Jane Doe,456 Oak Ave,Los Angeles,CA,90001,FRAME-5X7-BLK,19.99,3,,2025-02-15`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'antique_farmhouse_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  };

  const handleArchiveOrder = async (orderId) => {
    try {
      const response = await fetch(`${API}/orders/${orderId}/archive`, {
        method: "PUT",
        credentials: "include",
      });

      if (response.ok) {
        toast.success("Order archived");
        fetchOrders();
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to archive order");
      }
    } catch (error) {
      toast.error("Failed to archive order");
    }
  };

  const dropshipStores = stores.filter(s => s.platform === "dropship" || s.platform === "csv");

  // Statuses that are considered "inactive" (excluded from active view)
  // Note: Backend now handles "active" filtering, so frontend only filters for search
  const inactiveStatuses = ["shipped", "cancelled", "completed"];

  const filteredOrders = orders.filter((order) => {
    // Search filter only - status filtering is done by backend
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      order.order_id?.toLowerCase().includes(term) ||
      order.external_id?.toLowerCase().includes(term) ||
      order.order_number?.toLowerCase().includes(term) ||
      order.customer_name?.toLowerCase().includes(term) ||
      order.customer_email?.toLowerCase().includes(term)
    );
  });

  // Sort orders
  const sortedOrders = useMemo(() => {
    const sorted = [...filteredOrders].sort((a, b) => {
      let aVal, bVal;
      
      switch (sortColumn) {
        case "order_number":
          aVal = a.order_number || a.order_id || "";
          bVal = b.order_number || b.order_id || "";
          break;
        case "store_name":
          aVal = a.store_name || "";
          bVal = b.store_name || "";
          break;
        case "customer_name":
          aVal = a.customer_name || "";
          bVal = b.customer_name || "";
          break;
        case "items":
          aVal = a.items?.length || 0;
          bVal = b.items?.length || 0;
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        case "total_price":
          aVal = a.total_price || a.order_total || 0;
          bVal = b.total_price || b.order_total || 0;
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        case "status":
          aVal = a.status || "";
          bVal = b.status || "";
          break;
        case "created_at":
        default:
          // Use order_date if available (actual order date), fallback to created_at (import date)
          // Convert to timestamps for proper date comparison
          const aDate = a.order_date || a.created_at || "";
          const bDate = b.order_date || b.created_at || "";
          aVal = aDate ? new Date(aDate).getTime() : 0;
          bVal = bDate ? new Date(bDate).getTime() : 0;
          // Numeric comparison for dates - newest first when desc
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      
      if (typeof aVal === "string") {
        const comparison = aVal.localeCompare(bVal);
        return sortDirection === "asc" ? comparison : -comparison;
      }
      return 0;
    });
    return sorted;
  }, [filteredOrders, sortColumn, sortDirection]);

  // Handle column sort
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Sortable header component
  const SortableHeader = ({ column, children }) => (
    <TableHead 
      className="label-caps cursor-pointer hover:bg-muted/50 transition-colors select-none"
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortColumn === column ? (
          sortDirection === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );

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

  const handleSelectOrder = (orderId, checked) => {
    if (checked) {
      setSelectedOrders([...selectedOrders, orderId]);
    } else {
      setSelectedOrders(selectedOrders.filter((id) => id !== orderId));
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedOrders(sortedOrders.map((o) => o.order_id));
    } else {
      setSelectedOrders([]);
    }
  };

  const handleCreateBatch = async () => {
    if (selectedOrders.length === 0) {
      toast.error("No orders selected");
      return;
    }
    if (!batchName.trim()) {
      toast.error("Please enter a batch name");
      return;
    }

    try {
      const response = await fetch(API + "/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: batchName,
          order_ids: selectedOrders,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Batch created with ${result.items_count} items`);
        setCreateBatchOpen(false);
        setBatchName("");
        setSelectedOrders([]);
        fetchOrders();
        // Navigate to production page
        navigate("/production");
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to create batch");
      }
    } catch (error) {
      toast.error("Failed to create batch");
    }
  };

  const isAllSelected = sortedOrders.length > 0 && selectedOrders.length === sortedOrders.length;
  const syncableStores = stores.filter(s => s.platform === "shopify" || s.platform === "etsy");

  return (
    <div className="space-y-6" data-testid="orders-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Orders</h1>
          <p className="text-muted-foreground mt-1">
            Sync from Shopify & Etsy, or upload CSV for dropship orders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => setCsvUploadOpen(true)}
            className="gap-2"
            data-testid="upload-csv-btn"
          >
            <Upload className="w-4 h-4" />
            Upload CSV
          </Button>
          <Button 
            variant="outline" 
            onClick={handleSyncAllStores}
            disabled={syncing !== null}
            className="gap-2"
            data-testid="sync-all-btn"
          >
            {syncing === "all" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CloudDownload className="w-4 h-4" />
            )}
            Sync All Stores
          </Button>
          {selectedOrders.length > 0 && (
            <Button onClick={() => setCreateBatchOpen(true)} className="gap-2" data-testid="create-batch-btn">
              <Layers className="w-4 h-4" />
              Send {selectedOrders.length} to Production
            </Button>
          )}
        </div>
      </div>

      {/* Store Cards - All Stores */}
      {stores.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stores.map((store) => {
            const status = syncStatus.find(s => s.store_id === store.store_id);
            const isDropship = store.platform === "dropship";
            const isShipstation = store.platform === "shipstation";
            const platformStyles = {
              shopify: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', badgeClass: 'text-green-400 bg-green-400/10 border-green-400/20' },
              etsy: { bg: 'rgba(249, 115, 22, 0.1)', color: '#f97316', badgeClass: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
              dropship: { bg: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', badgeClass: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
              shipstation: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', badgeClass: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
            };
            const style = platformStyles[store.platform] || platformStyles.shopify;
            const platformLabel = isShipstation ? (store.shipstation_marketplace || 'ShipStation') : (isDropship ? 'CSV' : store.platform);
            
            return (
              <Card key={store.store_id} className={`bg-card border-border ${isDropship ? 'border-purple-500/30' : ''} ${isShipstation ? 'border-blue-500/30' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                           style={{ backgroundColor: style.bg }}>
                        {isDropship ? (
                          <FileSpreadsheet className="w-5 h-5" style={{ color: style.color }} />
                        ) : isShipstation ? (
                          <CloudDownload className="w-5 h-5" style={{ color: style.color }} />
                        ) : (
                          <ShoppingBag className="w-5 h-5" style={{ color: style.color }} />
                        )}
                      </div>
                      <div>
                        <h3 className="font-medium">{store.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {isDropship ? 'CSV Upload' : isShipstation ? 'ShipStation Sync' : `${status?.order_count || 0} orders`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-xs ${style.badgeClass}`}>
                      {platformLabel}
                    </Badge>
                  </div>
                  
                  {!isDropship && !isShipstation && status?.last_order_sync && (
                    <p className="text-xs text-muted-foreground mb-3">
                      Last sync: {new Date(status.last_order_sync).toLocaleString()}
                    </p>
                  )}
                  
                  {isDropship ? (
                    <Button
                      size="sm"
                      className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
                      onClick={() => setCsvUploadOpen(true)}
                      data-testid={`upload-${store.store_id}`}
                    >
                      <Upload className="w-4 h-4" />
                      Upload CSV
                    </Button>
                  ) : isShipstation ? (
                    <Button
                      size="sm"
                      className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                      onClick={() => handleShipStationSync(store.shipstation_store_id)}
                      disabled={shipstationSyncing}
                      data-testid={`sync-${store.store_id}`}
                    >
                      {shipstationSyncing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Sync from ShipStation
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => handleSyncOrders(store.store_id)}
                      disabled={syncing !== null}
                      data-testid={`sync-${store.store_id}`}
                    >
                      {syncing === store.store_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Sync Orders
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
                {stores.map((store) => {
                  const platformColors = {
                    shopify: "text-green-400",
                    etsy: "text-orange-400",
                    dropship: "text-purple-400",
                    shipstation: "text-blue-400",
                  };
                  const platformLabel = store.platform === "dropship" ? "CSV" : 
                    store.platform === "shipstation" ? (store.shipstation_marketplace || "ShipStation") : 
                    store.platform;
                  return (
                    <SelectItem key={store.store_id} value={store.store_id}>
                      <span className="flex items-center gap-2">
                        {store.name}
                        <span className={`text-xs ${platformColors[store.platform] || "text-muted-foreground"}`}>
                          ({platformLabel})
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-background" data-testid="status-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Active Orders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">All Active Orders</SelectItem>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="awaiting_shipment">Awaiting Shipment</SelectItem>
                <SelectItem value="pending">Pending Payment</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="in_production">In Production</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Checkbox
                id="unbatched"
                checked={showOnlyUnbatched}
                onCheckedChange={setShowOnlyUnbatched}
                data-testid="unbatched-checkbox"
              />
              <label htmlFor="unbatched" className="text-sm text-muted-foreground cursor-pointer">
                Show only unbatched
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selection Info Bar */}
      {selectedOrders.length > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-5 h-5 text-primary" />
            <span className="font-medium">{selectedOrders.length} orders selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedOrders([])}>
              Clear Selection
            </Button>
            <Button size="sm" onClick={() => setCreateBatchOpen(true)} className="gap-2" data-testid="send-to-production-btn">
              <ArrowRight className="w-4 h-4" />
              Send to Production
            </Button>
          </div>
        </div>
      )}

      {/* Orders Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center" data-testid="orders-loading">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading orders...</p>
            </div>
          ) : sortedOrders.length === 0 ? (
            <div className="p-8 text-center" data-testid="no-orders">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-semibold mb-2">No orders found</p>
              <p className="text-muted-foreground">
                {searchTerm || storeFilter !== "all" || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : showOnlyUnbatched
                  ? "All orders are already in production batches"
                  : "Orders will appear here when synced from your stores"}
              </p>
            </div>
          ) : (
            <Table data-testid="orders-table">
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={handleSelectAll}
                      data-testid="select-all-checkbox"
                    />
                  </TableHead>
                  <SortableHeader column="order_number">Order #</SortableHeader>
                  <SortableHeader column="store_name">Store</SortableHeader>
                  <SortableHeader column="customer_name">Customer</SortableHeader>
                  <SortableHeader column="items">Items</SortableHeader>
                  <SortableHeader column="total_price">Total</SortableHeader>
                  <SortableHeader column="status">Status</SortableHeader>
                  <SortableHeader column="created_at">Date</SortableHeader>
                  <TableHead className="label-caps">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedOrders.map((order) => (
                  <TableRow
                    key={order.order_id}
                    className={`border-border hover:bg-muted/30 ${selectedOrders.includes(order.order_id) ? "bg-primary/5" : ""}`}
                    data-testid={`order-row-${order.order_id}`}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedOrders.includes(order.order_id)}
                        onCheckedChange={(checked) => handleSelectOrder(order.order_id, checked)}
                        data-testid={`select-order-${order.order_id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-mono text-sm font-medium">#{order.order_number || order.order_id}</p>
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
                        {formatDate(order.order_date || order.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedOrder(order)}
                          data-testid={`view-order-${order.order_id}`}
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleArchiveOrder(order.order_id)}
                          data-testid={`archive-order-${order.order_id}`}
                          title="Archive order"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Archive className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
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
                  <p className="font-mono">{selectedOrder.order_id}</p>
                </div>
                <div>
                  <p className="label-caps mb-1">External ID</p>
                  <p className="font-mono">{selectedOrder.external_id}</p>
                </div>
                <div>
                  <p className="label-caps mb-1">Store</p>
                  <p>{selectedOrder.store_name}</p>
                </div>
                <div>
                  <p className="label-caps mb-1">Platform</p>
                  <PlatformBadge platform={selectedOrder.platform} />
                </div>
              </div>
              <div className="border-t border-border pt-4">
                <p className="label-caps mb-2">Customer</p>
                <p className="font-medium">{selectedOrder.customer_name}</p>
                <p className="text-sm text-muted-foreground">{selectedOrder.customer_email}</p>
              </div>
              <div className="border-t border-border pt-4">
                <p className="label-caps mb-2">Items</p>
                <div className="space-y-2">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 bg-muted/30 rounded">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">SKU: {item.sku}</p>
                      </div>
                      <Badge variant="outline">x{item.qty}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-border pt-4 flex justify-between items-center">
                <div>
                  <p className="label-caps mb-1">Total</p>
                  <p className="text-2xl font-heading font-bold">${selectedOrder.total_price?.toFixed(2)}</p>
                </div>
                <StatusBadge status={selectedOrder.status} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Batch Dialog */}
      <Dialog open={createBatchOpen} onOpenChange={setCreateBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Create Production Batch
            </DialogTitle>
            <DialogDescription>
              Send {selectedOrders.length} orders to Frame Production
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Batch Name *</label>
              <Input
                placeholder="e.g., Morning Batch - Jan 15"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                data-testid="batch-name-input"
              />
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-2">Selected Orders:</p>
              <div className="flex flex-wrap gap-2">
                {selectedOrders.slice(0, 5).map((id) => (
                  <Badge key={id} variant="secondary" className="font-mono text-xs">
                    {id}
                  </Badge>
                ))}
                {selectedOrders.length > 5 && (
                  <Badge variant="secondary">+{selectedOrders.length - 5} more</Badge>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateBatchOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBatch} data-testid="confirm-create-batch-btn">
              Create Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagination & Summary */}
      {sortedOrders.length > 0 && (
        <div className="flex flex-col items-center gap-4">
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                data-testid="first-page-btn"
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                data-testid="prev-page-btn"
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-4">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                data-testid="next-page-btn"
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                data-testid="last-page-btn"
              >
                Last
              </Button>
            </div>
          )}
          
          {/* Summary */}
          <div className="text-sm text-muted-foreground text-center">
            Showing {sortedOrders.length} of {totalCount} orders
            {totalPages > 1 && (
              <span className="ml-2">• Page {currentPage} of {totalPages}</span>
            )}
            {sortColumn !== "created_at" && (
              <span className="ml-2">
                • Sorted by {sortColumn.replace("_", " ")} ({sortDirection === "asc" ? "ascending" : "descending"})
              </span>
            )}
          </div>
        </div>
      )}

      {/* CSV Upload Dialog */}
      <Dialog open={csvUploadOpen} onOpenChange={setCsvUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-purple-400" />
              Upload Orders from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to import dropship orders. Multiple items per order are supported.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Store Selection */}
            <div>
              <Label>Select Dropship Store <span className="text-destructive">*</span></Label>
              <Select value={csvStoreId} onValueChange={setCsvStoreId}>
                <SelectTrigger data-testid="csv-store-select">
                  <SelectValue placeholder="Select a dropship store" />
                </SelectTrigger>
                <SelectContent>
                  {dropshipStores.length > 0 ? (
                    dropshipStores.map((store) => (
                      <SelectItem key={store.store_id} value={store.store_id}>
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-purple-400" />
                          <span className="font-medium">{store.name}</span>
                          <Badge variant="outline" className="text-xs text-purple-400 bg-purple-400/10 border-purple-400/20">CSV</Badge>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="_none" disabled>
                      No dropship stores found - add one in Settings
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {dropshipStores.length === 0 && (
                <p className="text-xs text-amber-400 mt-1">
                  No dropship stores configured. Go to Settings → Add Store → Select Dropship (CSV Upload)
                </p>
              )}
              {dropshipStores.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Choose the store these orders belong to
                </p>
              )}
            </div>

            {/* File Upload */}
            <div>
              <Label>CSV File <span className="text-destructive">*</span></Label>
              <div className="mt-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="cursor-pointer"
                  data-testid="csv-file-input"
                />
              </div>
              {csvFile && (
                <p className="text-sm text-green-500 mt-2 flex items-center gap-1">
                  <FileSpreadsheet className="w-4 h-4" />
                  {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {/* Expected Format */}
            <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
              <p className="text-sm font-medium text-purple-100 mb-2">Antique Farmhouse Format</p>
              <p className="text-xs text-purple-300 font-mono">
                Order Number, Full Name, Address 1, City, State, Zip, Item Number, Price, Qty, Order Comments, Order Date
              </p>
            </div>

            {/* Template Download */}
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">Need a template?</p>
              <p className="text-xs text-muted-foreground mb-3">
                Download our CSV template with sample data and all supported columns.
              </p>
              <Button variant="outline" size="sm" onClick={downloadCsvTemplate} className="gap-2">
                <Download className="w-4 h-4" />
                Download Template
              </Button>
            </div>

            {/* Column Info */}
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">Required columns:</p>
              <p>order_number, customer_name, sku</p>
              <p className="font-medium mt-2 mb-1">Optional columns:</p>
              <p>customer_email, quantity, item_name, price, shipping_address1, shipping_city, shipping_state, shipping_zip, shipping_country, notes</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCsvUploadOpen(false); setCsvFile(null); setCsvStoreId(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleCsvUpload} 
              disabled={!csvFile || !csvStoreId || uploading}
              data-testid="upload-csv-submit"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Orders
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
