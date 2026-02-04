import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users,
  Search,
  RefreshCw,
  Mail,
  Phone,
  MapPin,
  ShoppingBag,
  DollarSign,
  Tag,
  MessageSquare,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Store,
  Clock,
  User,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Building2,
  Globe,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ListTodo
} from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";
import { TaskCreateButton } from "@/components/TaskCreateButton";

const NOTE_TYPES = [
  { value: "general", label: "General Note", icon: FileText },
  { value: "call", label: "Phone Call", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "meeting", label: "Meeting", icon: Users },
  { value: "issue", label: "Issue/Complaint", icon: AlertCircle },
  { value: "task", label: "Task", icon: ListTodo },
];

export default function Customers({ user }) {
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);
  const [segments, setSegments] = useState({ segments: [], tags: [] });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stores, setStores] = useState([]);
  
  // Sorting
  const [sortColumn, setSortColumn] = useState("created_at");
  const [sortDirection, setSortDirection] = useState("desc");
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [showBulkSegment, setShowBulkSegment] = useState(false);
  const [bulkTagValue, setBulkTagValue] = useState("");
  const [bulkSegmentValue, setBulkSegmentValue] = useState("");
  
  // Note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("general");
  
  // Tag form
  const [newTag, setNewTag] = useState("");

  const fetchCustomers = useCallback(async (page = 1, sortBy = sortColumn, sortDir = sortDirection) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("page_size", "50");
      params.append("sort_by", sortBy);
      params.append("sort_order", sortDir);
      if (searchTerm) params.append("search", searchTerm);
      if (storeFilter !== "all") params.append("store_id", storeFilter);
      if (tagFilter !== "all") params.append("tag", tagFilter);
      if (segmentFilter !== "all") params.append("segment", segmentFilter);
      
      const response = await fetch(`${API}/customers?${params.toString()}`, {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers || []);
        setTotalPages(data.pagination?.total_pages || 1);
        setTotalCount(data.pagination?.total_count || 0);
        setCurrentPage(data.pagination?.page || 1);
      }
    } catch (error) {
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, storeFilter, tagFilter, segmentFilter, sortColumn, sortDirection]);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API}/customers/stats`, { credentials: "include" });
      if (response.ok) {
        setStats(await response.json());
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const fetchSegments = async () => {
    try {
      const response = await fetch(`${API}/customers/segments`, { credentials: "include" });
      if (response.ok) {
        setSegments(await response.json());
      }
    } catch (error) {
      console.error("Failed to fetch segments:", error);
    }
  };

  const fetchStores = async () => {
    try {
      const response = await fetch(`${API}/stores`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setStores(data.filter(s => s.platform === "shopify"));
      }
    } catch (error) {
      console.error("Failed to fetch stores:", error);
    }
  };

  const fetchCustomerDetail = async (customerId) => {
    try {
      setDetailLoading(true);
      const response = await fetch(`${API}/customers/${customerId}`, {
        credentials: "include",
      });
      if (response.ok) {
        setCustomerDetail(await response.json());
      }
    } catch (error) {
      toast.error("Failed to load customer details");
    } finally {
      setDetailLoading(false);
    }
  };

  const syncCustomers = async () => {
    try {
      setSyncing(true);
      const response = await fetch(`${API}/customers/sync`, {
        method: "POST",
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success(`Synced ${data.total_synced} customers from ${data.stores?.length || 0} stores`);
        fetchCustomers(1);
        fetchStats();
        fetchSegments();
      } else {
        const error = await response.json();
        toast.error(error.detail || "Sync failed");
      }
    } catch (error) {
      toast.error("Failed to sync customers");
    } finally {
      setSyncing(false);
    }
  };

  const addNote = async () => {
    if (!noteContent.trim() || !selectedCustomer) return;
    
    try {
      const response = await fetch(`${API}/customers/${selectedCustomer}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: noteContent, note_type: noteType }),
      });
      
      if (response.ok) {
        toast.success("Note added");
        setNoteContent("");
        setNoteType("general");
        setShowNoteForm(false);
        fetchCustomerDetail(selectedCustomer);
      }
    } catch (error) {
      toast.error("Failed to add note");
    }
  };

  const addTag = async (customerId, tag) => {
    try {
      const response = await fetch(`${API}/customers/${customerId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tag }),
      });
      
      if (response.ok) {
        toast.success(`Tag "${tag}" added`);
        fetchCustomerDetail(customerId);
        fetchSegments();
      }
    } catch (error) {
      toast.error("Failed to add tag");
    }
  };

  const removeTag = async (customerId, tag) => {
    try {
      const response = await fetch(`${API}/customers/${customerId}/tags/${encodeURIComponent(tag)}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (response.ok) {
        toast.success(`Tag "${tag}" removed`);
        fetchCustomerDetail(customerId);
      }
    } catch (error) {
      toast.error("Failed to remove tag");
    }
  };

  const updateSegment = async (customerId, segment) => {
    try {
      const response = await fetch(`${API}/customers/${customerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ segment }),
      });
      
      if (response.ok) {
        toast.success("Segment updated");
        fetchCustomerDetail(customerId);
        fetchSegments();
      }
    } catch (error) {
      toast.error("Failed to update segment");
    }
  };

  const bulkAddTag = async () => {
    if (!bulkTagValue.trim() || selectedIds.length === 0) return;
    
    try {
      const response = await fetch(`${API}/customers/bulk-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customer_ids: selectedIds, tag: bulkTagValue }),
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        setShowBulkTag(false);
        setBulkTagValue("");
        setSelectedIds([]);
        fetchCustomers(currentPage);
      }
    } catch (error) {
      toast.error("Failed to add tag");
    }
  };

  const bulkSetSegment = async () => {
    if (!bulkSegmentValue.trim() || selectedIds.length === 0) return;
    
    try {
      const response = await fetch(`${API}/customers/bulk-segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customer_ids: selectedIds, segment: bulkSegmentValue }),
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        setShowBulkSegment(false);
        setBulkSegmentValue("");
        setSelectedIds([]);
        fetchCustomers(currentPage, sortColumn, sortDirection);
      }
    } catch (error) {
      toast.error("Failed to set segment");
    }
  };

  const handleSort = (column) => {
    let newDirection = "asc";
    if (column === sortColumn) {
      newDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      // Default sort direction based on column type
      newDirection = ["total_spent", "orders_count", "created_at"].includes(column) ? "desc" : "asc";
    }
    setSortColumn(column);
    setSortDirection(newDirection);
    setCurrentPage(1);
    fetchCustomers(1, column, newDirection);
  };

  const SortableHeader = ({ column, children }) => {
    const isActive = sortColumn === column;
    return (
      <TableHead 
        className="cursor-pointer hover:bg-muted/50 select-none"
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1">
          {children}
          {isActive ? (
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
  };

  useEffect(() => {
    fetchStores();
    fetchStats();
    fetchSegments();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      setCurrentPage(1);
      fetchCustomers(1, sortColumn, sortDirection);
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm, storeFilter, tagFilter, segmentFilter]);

  useEffect(() => {
    if (selectedCustomer) {
      fetchCustomerDetail(selectedCustomer);
    }
  }, [selectedCustomer]);

  const toggleSelect = (customerId) => {
    setSelectedIds(prev => 
      prev.includes(customerId) 
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === customers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(customers.map(c => c.customer_id));
    }
  };

  const formatCurrency = (value, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(value || 0);
  };

  const openGmailCompose = (email, customerName) => {
    // Open Gmail compose in a new tab with pre-filled recipient
    const subject = encodeURIComponent(`Hello from ${customerName ? customerName.split(' ')[0] : 'there'}`);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${subject}`;
    window.open(gmailUrl, '_blank');
  };

  return (
    <div className="space-y-6" data-testid="customers-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold flex items-center gap-2">
            <Users className="w-8 h-8" />
            Customers
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your customer relationships across all stores
          </p>
        </div>
        <Button 
          onClick={syncCustomers} 
          disabled={syncing}
          className="gap-2"
          data-testid="sync-customers-btn"
        >
          {syncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {syncing ? "Syncing..." : "Sync from Shopify"}
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Customers</p>
                  <p className="text-2xl font-bold">{stats.totals?.customers || 0}</p>
                </div>
                <Users className="w-6 h-6 text-primary/60" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">With Orders</p>
                  <p className="text-2xl font-bold">{stats.totals?.with_orders || 0}</p>
                </div>
                <ShoppingBag className="w-6 h-6 text-primary/60" />
              </div>
            </CardContent>
          </Card>
          {/* Hide revenue stats from workers */}
          {user?.role !== "worker" && (
            <>
              <Card className="bg-card/50 border-border/50">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Revenue</p>
                      <p className="text-2xl font-bold">{formatCurrency(stats.totals?.revenue)}</p>
                    </div>
                    <DollarSign className="w-6 h-6 text-primary/60" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Avg LTV</p>
                      <p className="text-2xl font-bold">{formatCurrency(stats.totals?.avg_lifetime_value)}</p>
                    </div>
                    <TrendingUp className="w-6 h-6 text-primary/60" />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
          <Card className="bg-card/50 border-border/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Marketing</p>
                  <p className="text-2xl font-bold">{stats.totals?.accepts_marketing || 0}</p>
                </div>
                <Mail className="w-6 h-6 text-primary/60" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-background"
            data-testid="search-customers"
          />
        </div>
        
        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="w-[180px] bg-background" data-testid="store-filter">
            <Store className="w-4 h-4 mr-2" />
            <SelectValue placeholder="All Stores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stores</SelectItem>
            {stores.map(store => (
              <SelectItem key={store.store_id} value={store.store_id}>
                {store.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-[150px] bg-background" data-testid="tag-filter">
            <Tag className="w-4 h-4 mr-2" />
            <SelectValue placeholder="All Tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {segments.tags?.map(tag => (
              <SelectItem key={tag} value={tag}>{tag}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={segmentFilter} onValueChange={setSegmentFilter}>
          <SelectTrigger className="w-[150px] bg-background" data-testid="segment-filter">
            <Users className="w-4 h-4 mr-2" />
            <SelectValue placeholder="All Segments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Segments</SelectItem>
            {segments.segments?.map(seg => (
              <SelectItem key={seg} value={seg}>{seg}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => setShowBulkTag(true)}>
            <Tag className="w-4 h-4 mr-1" /> Add Tag
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowBulkSegment(true)}>
            <Users className="w-4 h-4 mr-1" /> Set Segment
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
            Clear
          </Button>
        </div>
      )}

      {/* Customer List */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {totalCount} Customers
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No customers found</p>
              <p className="text-sm mt-1">Click &quot;Sync from Shopify&quot; to import customers</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox 
                        checked={selectedIds.length === customers.length && customers.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <SortableHeader column="name">Customer</SortableHeader>
                    <SortableHeader column="email">Contact</SortableHeader>
                    <TableHead>Location</TableHead>
                    <SortableHeader column="orders_count">Orders</SortableHeader>
                    {user?.role !== "worker" && (
                      <SortableHeader column="total_spent">Spent</SortableHeader>
                    )}
                    <TableHead>Tags</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow 
                      key={customer.customer_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedCustomer(customer.customer_id)}
                      data-testid={`customer-row-${customer.customer_id}`}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.includes(customer.customer_id)}
                          onCheckedChange={() => toggleSelect(customer.customer_id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{customer.full_name || "—"}</p>
                          {customer.segment && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {customer.segment}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {customer.email && (
                            <p className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              {customer.email}
                            </p>
                          )}
                          {customer.phone && (
                            <p className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="w-3 h-3" />
                              {customer.phone}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {customer.default_address?.city && (
                          <span className="text-sm text-muted-foreground">
                            {customer.default_address.city}, {customer.default_address.province_code || customer.default_address.country_code}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{customer.orders_count || 0}</span>
                      </TableCell>
                      {user?.role !== "worker" && (
                        <TableCell className="text-right font-medium">
                          {formatCurrency(customer.total_spent, customer.currency)}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {customer.shopify_tags?.slice(0, 2).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {customer.custom_tags?.slice(0, 2).map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs bg-primary/10">
                              {tag}
                            </Badge>
                          ))}
                          {((customer.shopify_tags?.length || 0) + (customer.custom_tags?.length || 0)) > 4 && (
                            <Badge variant="secondary" className="text-xs">
                              +{(customer.shopify_tags?.length || 0) + (customer.custom_tags?.length || 0) - 4}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {customer.store_name}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {customer.email && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openGmailCompose(customer.email, customer.full_name)}
                              title="Send email"
                              data-testid={`email-btn-${customer.customer_id}`}
                            >
                              <Mail className="w-4 h-4" />
                            </Button>
                          )}
                          <TaskCreateButton
                            customerId={customer.customer_id}
                            customerName={customer.full_name}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            data-testid={`task-btn-${customer.customer_id}`}
                          >
                            <ListTodo className="w-4 h-4" />
                          </TaskCreateButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => {
                      setCurrentPage(p => p - 1);
                      fetchCustomers(currentPage - 1, sortColumn, sortDirection);
                    }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => {
                      setCurrentPage(p => p + 1);
                      fetchCustomers(currentPage + 1, sortColumn, sortDirection);
                    }}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                {customerDetail?.full_name || "Customer Details"}
              </DialogTitle>
              {customerDetail && (
                <TaskCreateButton
                  customerId={customerDetail.customer_id}
                  customerName={customerDetail.full_name}
                  variant="outline"
                  size="sm"
                  data-testid="create-task-from-customer"
                >
                  <ListTodo className="w-4 h-4 mr-1" />
                  Create Task
                </TaskCreateButton>
              )}
            </div>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : customerDetail ? (
            <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="orders">Orders ({customerDetail.orders?.length || 0})</TabsTrigger>
                <TabsTrigger value="notes">Notes & Activity</TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 mt-4">
                <TabsContent value="overview" className="space-y-4 mt-0">
                  {/* Contact Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-muted/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Contact Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <span>{customerDetail.email || "—"}</span>
                            {customerDetail.verified_email && (
                              <CheckCircle className="w-3 h-3 text-green-500" />
                            )}
                          </div>
                          {customerDetail.email && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1"
                              onClick={() => openGmailCompose(customerDetail.email, customerDetail.full_name)}
                              data-testid="email-customer-btn"
                            >
                              <Mail className="w-3 h-3" />
                              Email
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span>{customerDetail.phone || "—"}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                          <div>
                            {customerDetail.default_address?.address1 && (
                              <p>{customerDetail.default_address.address1}</p>
                            )}
                            {customerDetail.default_address?.city && (
                              <p>
                                {customerDetail.default_address.city}, {customerDetail.default_address.province_code} {customerDetail.default_address.zip}
                              </p>
                            )}
                            {customerDetail.default_address?.country && (
                              <p>{customerDetail.default_address.country}</p>
                            )}
                          </div>
                        </div>
                        {customerDetail.default_address?.company && (
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <span>{customerDetail.default_address.company}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-muted/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Customer Stats</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Orders</span>
                          <span className="font-medium">{customerDetail.orders_count || 0}</span>
                        </div>
                        {user?.role !== "worker" && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Spent</span>
                              <span className="font-medium">{formatCurrency(customerDetail.total_spent, customerDetail.currency)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Avg Order</span>
                              <span className="font-medium">
                                {formatCurrency(
                                  customerDetail.orders_count > 0 
                                    ? customerDetail.total_spent / customerDetail.orders_count 
                                    : 0,
                                  customerDetail.currency
                                )}
                              </span>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last Order</span>
                          <span className="font-medium">{customerDetail.last_order_name || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Marketing</span>
                          <span className="font-medium">
                            {customerDetail.accepts_marketing ? "Yes" : "No"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Segment */}
                  <div>
                    <Label className="text-sm">Segment</Label>
                    <Select 
                      value={customerDetail.segment || ""} 
                      onValueChange={(val) => updateSegment(customerDetail.customer_id, val)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select segment..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VIP">VIP</SelectItem>
                        <SelectItem value="Wholesale">Wholesale</SelectItem>
                        <SelectItem value="Retail">Retail</SelectItem>
                        <SelectItem value="New">New Customer</SelectItem>
                        <SelectItem value="Returning">Returning</SelectItem>
                        <SelectItem value="At Risk">At Risk</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tags */}
                  <div>
                    <Label className="text-sm">Tags</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {customerDetail.shopify_tags?.map(tag => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                      {customerDetail.custom_tags?.map(tag => (
                        <Badge 
                          key={tag} 
                          variant="outline" 
                          className="bg-primary/10 cursor-pointer group"
                          onClick={() => removeTag(customerDetail.customer_id, tag)}
                        >
                          {tag}
                          <X className="w-3 h-3 ml-1 opacity-50 group-hover:opacity-100" />
                        </Badge>
                      ))}
                      <div className="flex items-center gap-1">
                        <Input
                          placeholder="Add tag..."
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          className="h-7 w-24 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newTag.trim()) {
                              addTag(customerDetail.customer_id, newTag.trim());
                              setNewTag("");
                            }
                          }}
                        />
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            if (newTag.trim()) {
                              addTag(customerDetail.customer_id, newTag.trim());
                              setNewTag("");
                            }
                          }}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="orders" className="mt-0">
                  {customerDetail.orders?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No orders found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customerDetail.orders?.map(order => (
                        <div 
                          key={order.order_id} 
                          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                        >
                          <div>
                            <p className="font-medium">#{order.order_number || order.external_id}</p>
                            <p className="text-xs text-muted-foreground">
                              {order.items?.length || 0} items
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(order.total_price)}</p>
                            <Badge variant="outline" className="text-xs">
                              {order.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="notes" className="mt-0 space-y-4">
                  <Button 
                    variant="outline" 
                    className="w-full gap-2"
                    onClick={() => setShowNoteForm(!showNoteForm)}
                  >
                    <Plus className="w-4 h-4" />
                    Add Note
                  </Button>

                  {showNoteForm && (
                    <Card className="bg-muted/30">
                      <CardContent className="pt-4 space-y-3">
                        <div>
                          <Label className="text-xs">Note Type</Label>
                          <Select value={noteType} onValueChange={setNoteType}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {NOTE_TYPES.map(type => (
                                <SelectItem key={type.value} value={type.value}>
                                  <div className="flex items-center gap-2">
                                    <type.icon className="w-4 h-4" />
                                    {type.label}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Content</Label>
                          <Textarea
                            value={noteContent}
                            onChange={(e) => setNoteContent(e.target.value)}
                            placeholder="Enter note..."
                            rows={3}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setShowNoteForm(false)}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={addNote} disabled={!noteContent.trim()}>
                            Save Note
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Activity Timeline */}
                  <div className="space-y-3">
                    {customerDetail.activities?.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No notes or activities yet</p>
                      </div>
                    ) : (
                      customerDetail.activities?.map(activity => {
                        const noteTypeInfo = NOTE_TYPES.find(t => t.value === activity.note_type) || NOTE_TYPES[0];
                        const Icon = noteTypeInfo.icon;
                        const isTask = activity.note_type === 'task';
                        
                        return (
                          <div 
                            key={activity.activity_id} 
                            className={`flex gap-3 p-3 rounded-lg ${
                              isTask ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-muted/30'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              isTask ? 'bg-blue-500/20' : 'bg-primary/10'
                            }`}>
                              <Icon className={`w-4 h-4 ${isTask ? 'text-blue-400' : ''}`} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                  {activity.user_name} · {noteTypeInfo.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(activity.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-sm mt-1 whitespace-pre-wrap">{activity.content}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Bulk Tag Dialog */}
      <Dialog open={showBulkTag} onOpenChange={setShowBulkTag}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tag to {selectedIds.length} Customers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Tag Name</Label>
              <Input
                value={bulkTagValue}
                onChange={(e) => setBulkTagValue(e.target.value)}
                placeholder="Enter tag..."
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowBulkTag(false)}>Cancel</Button>
            <Button onClick={bulkAddTag} disabled={!bulkTagValue.trim()}>Add Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Segment Dialog */}
      <Dialog open={showBulkSegment} onOpenChange={setShowBulkSegment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Segment for {selectedIds.length} Customers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Segment</Label>
              <Select value={bulkSegmentValue} onValueChange={setBulkSegmentValue}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select segment..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="Wholesale">Wholesale</SelectItem>
                  <SelectItem value="Retail">Retail</SelectItem>
                  <SelectItem value="New">New Customer</SelectItem>
                  <SelectItem value="Returning">Returning</SelectItem>
                  <SelectItem value="At Risk">At Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowBulkSegment(false)}>Cancel</Button>
            <Button onClick={bulkSetSegment} disabled={!bulkSegmentValue}>Set Segment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
