import { useEffect, useState, useMemo, useRef, useCallback } from "react";
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
import { Package, Search, Filter, Eye, Store, Calendar, Layers, ArrowRight, CheckSquare, RefreshCw, CloudDownload, Loader2, ShoppingBag, ArrowUpDown, ArrowUp, ArrowDown, Upload, FileSpreadsheet, Download, Archive, ArchiveRestore, Pencil, Check, X, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";
import { TaskCreateButton } from "@/components/TaskCreateButton";

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
  
  // Editable ship date state
  const [editingShipDate, setEditingShipDate] = useState(null);
  const [shipDateValue, setShipDateValue] = useState("");
  
  // Order activities state
  const [orderActivities, setOrderActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  
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
  
  // CSV Export state
  const [exporting, setExporting] = useState(false);

  const handleExportToCSV = async () => {
    if (selectedOrders.length === 0) {
      toast.error("Please select orders to export");
      return;
    }

    setExporting(true);
    try {
      const response = await fetch(API + "/orders/export-csv", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: selectedOrders }),
      });

      if (response.ok) {
        // Get the CSV blob
        const blob = await response.blob();
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 10);
        a.download = `orders_export_${timestamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        toast.success(`Exported ${selectedOrders.length} orders to CSV`);
        setSelectedOrders([]);
      } else {
        const error = await response.json();
        toast.error(error.detail || "Export failed");
      }
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export orders");
    } finally {
      setExporting(false);
    }
  };

  const fetchOrders = async (page = currentPage, sortCol = sortColumn, sortDir = sortDirection, search = searchTerm) => {
    try {
      let url = API + "/orders";
      const params = new URLSearchParams();
      if (storeFilter !== "all") params.append("store_id", storeFilter);
      // Send status filter to backend - backend now handles "active" filtering
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (showOnlyUnbatched) params.append("unbatched", "true");
      // Add search param - when searching, backend includes archived orders automatically
      if (search && search.trim()) params.append("search", search.trim());
      // Add pagination params
      params.append("page", page.toString());
      params.append("page_size", pageSize.toString());
      // Add sort params - always sort newest first by default
      params.append("sort_by", sortCol);
      params.append("sort_order", sortDir);
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

  const fetchOrderActivities = async (orderId) => {
    try {
      setActivitiesLoading(true);
      const response = await fetch(`${API}/orders/${orderId}/activities`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setOrderActivities(data.activities || []);
      }
    } catch (error) {
      console.error("Failed to fetch order activities:", error);
      setOrderActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const enrichOrderImages = async (order) => {
    // Check if any items are missing images
    const needsEnrichment = order.items?.some(item => !item.image_url);
    if (!needsEnrichment) return;
    
    try {
      const response = await fetch(`${API}/orders/${order.order_id}/enrich-images`, {
        method: "POST",
        credentials: "include"
      });
      if (response.ok) {
        const data = await response.json();
        if (data.items_updated) {
          // Refresh the order data
          const orderResponse = await fetch(`${API}/orders/${order.order_id}`, { credentials: "include" });
          if (orderResponse.ok) {
            const updatedOrder = await orderResponse.json();
            setSelectedOrder(updatedOrder);
          }
        }
      }
    } catch (error) {
      console.error("Failed to enrich order images:", error);
    }
  };

  // Fetch activities and enrich images when order is selected
  useEffect(() => {
    if (selectedOrder?.order_id) {
      fetchOrderActivities(selectedOrder.order_id);
      enrichOrderImages(selectedOrder);
    } else {
      setOrderActivities([]);
    }
  }, [selectedOrder?.order_id]);

  useEffect(() => {
    // Reset to page 1 and default sort (newest first) when filters change
    setCurrentPage(1);
    setSortColumn("created_at");
    setSortDirection("desc");
    fetchOrders(1, "created_at", "desc", "");
    fetchStores();
    fetchSyncStatus();
  }, [storeFilter, statusFilter, showOnlyUnbatched]);

  // Debounced search - triggers server-side search including archived orders
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchTerm !== undefined) {
        setCurrentPage(1);
        setLoading(true);
        fetchOrders(1, sortColumn, sortDirection, searchTerm);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  // Fetch orders when page changes (but not when filters change - that's handled above)
  useEffect(() => {
    if (currentPage > 1) {
      fetchOrders(currentPage, sortColumn, sortDirection, searchTerm);
    }
  }, [currentPage]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      setLoading(true);
    }
  };

  const handleUpdateShipDate = async (orderId, newDate) => {
    try {
      const response = await fetch(`${API}/orders/${orderId}/ship-date?requested_ship_date=${encodeURIComponent(newDate || "")}`, {
        method: "PUT",
        credentials: "include",
      });

      if (response.ok) {
        // Update local state
        setOrders(prev => prev.map(o => 
          o.order_id === orderId 
            ? { ...o, requested_ship_date: newDate || null }
            : o
        ));
        toast.success(newDate ? "Ship date updated" : "Ship date cleared");
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to update ship date");
      }
    } catch (error) {
      toast.error("Failed to update ship date");
    } finally {
      setEditingShipDate(null);
      setShipDateValue("");
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
        
        // Show detailed results
        if (result.created > 0 || result.updated > 0) {
          toast.success(
            `CSV Import Complete: ${result.total_orders} orders processed`,
            { duration: 5000 }
          );
          
          if (result.created > 0) {
            toast.info(`✓ ${result.created} new order(s) created`, { duration: 4000 });
          }
          if (result.updated > 0) {
            toast.info(`↻ ${result.updated} existing order(s) updated (duplicates)`, { duration: 4000 });
          }
        } else if (result.skipped > 0) {
          toast.warning(`No orders imported. ${result.skipped} skipped.`);
        }
        
        // Show errors if any
        if (result.errors && result.errors.length > 0) {
          result.errors.slice(0, 3).forEach(err => {
            toast.error(err, { duration: 6000 });
          });
          if (result.errors.length > 3) {
            toast.error(`...and ${result.errors.length - 3} more errors`);
          }
        }
        
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
        fetchOrders(currentPage, sortColumn, sortDirection, searchTerm);
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to archive order");
      }
    } catch (error) {
      toast.error("Failed to archive order");
    }
  };

  const handleUnarchiveOrder = async (orderId) => {
    try {
      const response = await fetch(`${API}/orders/${orderId}/unarchive`, {
        method: "PUT",
        credentials: "include",
      });

      if (response.ok) {
        toast.success("Order restored");
        fetchOrders(currentPage, sortColumn, sortDirection, searchTerm);
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to restore order");
      }
    } catch (error) {
      toast.error("Failed to restore order");
    }
  };

  const dropshipStores = stores.filter(s => s.platform === "dropship" || s.platform === "csv");

  // Orders are fetched from backend with search applied server-side
  // No need for local filtering - server includes archived orders when searching
  const sortedOrders = orders;

  // Handle column sort
  // Handle column sort - fetch from backend with new sort order
  const handleSort = (column) => {
    let newDirection;
    if (sortColumn === column) {
      newDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      // Default to desc (newest first) for date column, asc for others
      newDirection = column === "created_at" ? "desc" : "asc";
    }
    setSortColumn(column);
    setSortDirection(newDirection);
    setCurrentPage(1);
    setLoading(true);
    fetchOrders(1, column, newDirection);
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
                placeholder="Search all orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background"
                data-testid="search-orders-input"
              />
              {searchTerm && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  searching all
                </span>
              )}
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
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportToDrive}
              disabled={exporting}
              className="gap-2"
              data-testid="export-to-drive-btn"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CloudDownload className="w-4 h-4" />
              )}
              {driveStatus.connected ? "Export to Drive" : "Connect Drive & Export"}
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
                  <SortableHeader column="requested_ship_date">Ship Date</SortableHeader>
                  <SortableHeader column="created_at">Order Date</SortableHeader>
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
                      <button 
                        onClick={() => setSelectedOrder(order)}
                        className="font-mono text-sm font-medium hover:text-primary hover:underline cursor-pointer"
                      >
                        #{order.order_number || order.order_id}
                      </button>
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
                      <div className="flex items-center gap-1">
                        <StatusBadge status={order.status} />
                        {order.archived && (
                          <Badge variant="outline" className="text-gray-400 bg-gray-400/10 border-gray-400/20 text-xs">
                            Archived
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {editingShipDate === order.order_id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="date"
                            value={shipDateValue}
                            onChange={(e) => setShipDateValue(e.target.value)}
                            className="h-7 w-32 text-xs"
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-green-500 hover:text-green-600"
                            onClick={() => handleUpdateShipDate(order.order_id, shipDateValue)}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                            onClick={() => {
                              setEditingShipDate(null);
                              setShipDateValue("");
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div 
                          className="flex items-center gap-1 cursor-pointer group"
                          onClick={() => {
                            setEditingShipDate(order.order_id);
                            setShipDateValue(order.requested_ship_date || "");
                          }}
                        >
                          {order.requested_ship_date ? (
                            <span className="text-sm font-medium text-orange-400">
                              {order.requested_ship_date}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                          <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {formatDate(order.external_created_at || order.created_at)}
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
                        {order.archived ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnarchiveOrder(order.order_id)}
                            data-testid={`unarchive-order-${order.order_id}`}
                            title="Restore order"
                            className="text-muted-foreground hover:text-green-500"
                          >
                            <ArchiveRestore className="w-4 h-4" />
                          </Button>
                        ) : (
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
                        )}
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Order #{selectedOrder?.order_number || selectedOrder?.order_id?.slice(-8)}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="label-caps mb-1">Store</p>
                  <p className="font-medium">{selectedOrder.store_name}</p>
                </div>
                <div>
                  <p className="label-caps mb-1">Platform</p>
                  <PlatformBadge platform={selectedOrder.platform} />
                </div>
                <div>
                  <p className="label-caps mb-1">Status</p>
                  <StatusBadge status={selectedOrder.status} />
                </div>
                <div>
                  <p className="label-caps mb-1">Order Date</p>
                  <p className="text-sm">
                    {selectedOrder.external_created_at 
                      ? new Date(selectedOrder.external_created_at).toLocaleString() 
                      : selectedOrder.created_at 
                        ? new Date(selectedOrder.created_at).toLocaleString()
                        : "N/A"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="label-caps mb-1">Requested Ship Date</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={selectedOrder.requested_ship_date || ""}
                      onChange={async (e) => {
                        const newDate = e.target.value;
                        await handleUpdateShipDate(selectedOrder.order_id, newDate);
                        setSelectedOrder(prev => prev ? { ...prev, requested_ship_date: newDate || null } : null);
                      }}
                      className="h-8 w-40"
                    />
                    {selectedOrder.requested_ship_date && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          await handleUpdateShipDate(selectedOrder.order_id, "");
                          setSelectedOrder(prev => prev ? { ...prev, requested_ship_date: null } : null);
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Order Note */}
              {selectedOrder.note && (
                <div className="border-t border-border pt-4">
                  <p className="label-caps mb-2">Order Note</p>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                    <p className="text-sm whitespace-pre-wrap">{selectedOrder.note}</p>
                  </div>
                </div>
              )}

              {/* Customer Info */}
              <div className="border-t border-border pt-4">
                <p className="label-caps mb-2">Customer</p>
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <p className="font-medium">{selectedOrder.customer_name || "N/A"}</p>
                  {selectedOrder.customer_email && (
                    <p className="text-sm text-muted-foreground">{selectedOrder.customer_email}</p>
                  )}
                  {(selectedOrder.customer_phone || selectedOrder.shipping_address?.phone) && (
                    <p className="text-sm text-muted-foreground">📞 {selectedOrder.customer_phone || selectedOrder.shipping_address?.phone}</p>
                  )}
                  {(selectedOrder.shipping_address || selectedOrder.ship_to) && (
                    <div className="text-sm text-muted-foreground pt-2 border-t border-border mt-2">
                      <p className="label-caps mb-1 text-xs">Shipping Address</p>
                      {(() => {
                        const addr = selectedOrder.shipping_address || selectedOrder.ship_to || {};
                        return (
                          <>
                            {addr.name && addr.name !== selectedOrder.customer_name && <p>{addr.name}</p>}
                            {addr.street && <p>{addr.street}</p>}
                            {addr.address1 && <p>{addr.address1}</p>}
                            {addr.address2 && <p>{addr.address2}</p>}
                            <p>
                              {[addr.city, addr.state || addr.province, addr.zip || addr.postal_code].filter(Boolean).join(", ")}
                            </p>
                            {addr.country && <p>{addr.country}</p>}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Items - Scrollable */}
              <div className="border-t border-border pt-4">
                <p className="label-caps mb-2">Items ({selectedOrder.items?.length || 0})</p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2 bg-muted/30 rounded">
                      {/* Thumbnail */}
                      <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        {item.image_url ? (
                          <img 
                            src={item.image_url} 
                            alt={item.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div 
                          className={`w-full h-full items-center justify-center text-muted-foreground ${item.image_url ? 'hidden' : 'flex'}`}
                        >
                          <Package className="w-5 h-5" />
                        </div>
                      </div>
                      {/* Item Details */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">{item.name}</p>
                        {item.variant_title && (
                          <p className="text-xs text-muted-foreground">{item.variant_title}</p>
                        )}
                        <p className="text-xs text-muted-foreground font-mono">SKU: {item.sku || 'N/A'}</p>
                      </div>
                      {/* Quantity & Price */}
                      <div className="text-right flex-shrink-0">
                        <Badge variant="outline">x{item.qty}</Badge>
                        {item.price > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">${item.price?.toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="border-t border-border pt-4 flex justify-between items-center">
                <div>
                  <p className="label-caps mb-1">Total</p>
                  <p className="text-2xl font-heading font-bold">${selectedOrder.total_price?.toFixed(2) || "0.00"}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-border pt-4 flex items-center gap-2">
                <TaskCreateButton 
                  orderId={selectedOrder.order_id}
                  orderNumber={selectedOrder.order_number || selectedOrder.order_id?.slice(-8)}
                  variant="outline"
                  size="sm"
                  data-testid="create-task-from-order"
                  onTaskCreated={() => fetchOrderActivities(selectedOrder.order_id)}
                >
                  <ListTodo className="w-4 h-4 mr-1" />
                  Create Task
                </TaskCreateButton>
              </div>

              {/* Activities/Notes */}
              <div className="border-t border-border pt-4">
                <p className="label-caps mb-2">Activity & Tasks</p>
                {activitiesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : orderActivities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No activities yet</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {orderActivities.map((activity) => (
                      <div 
                        key={activity.activity_id} 
                        className={`p-2 rounded-lg text-sm ${
                          activity.note_type === 'task' 
                            ? 'bg-blue-500/10 border border-blue-500/20' 
                            : 'bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {activity.note_type === 'task' && <ListTodo className="w-3 h-3 text-blue-400" />}
                          <span className="text-xs text-muted-foreground">
                            {activity.user_name} · {new Date(activity.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{activity.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reference IDs - Collapsed */}
              <details className="border-t border-border pt-4">
                <summary className="label-caps cursor-pointer hover:text-primary">Reference IDs</summary>
                <div className="mt-2 text-xs font-mono text-muted-foreground space-y-1">
                  <p>Order ID: {selectedOrder.order_id}</p>
                  <p>External ID: {selectedOrder.external_id}</p>
                </div>
              </details>
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
              <span className="block mt-1 text-primary font-medium">
                Duplicate orders (same Order Number) will be automatically updated.
              </span>
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
