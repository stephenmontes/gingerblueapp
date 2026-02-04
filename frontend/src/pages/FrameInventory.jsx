import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, History, Loader2, Package, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  InventoryStats,
  InventoryForm,
  InventoryTable,
  InventorySearch,
  AdjustmentDialog,
  RejectionDialog
} from "@/components/inventory";
import { API } from "@/utils/api";

const INITIAL_FORM_DATA = {
  sku: "",
  name: "",
  color: "",
  size: "",
  quantity: 0,
  min_stock: 10,
  location: ""
};

export default function FrameInventory() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  // Adjustment dialog state
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  
  // Rejection dialog state
  const [rejectItem, setRejectItem] = useState(null);
  const [rejectAmount, setRejectAmount] = useState(1);
  
  // Deduction log state
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logSummary, setLogSummary] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [logDateFilter, setLogDateFilter] = useState("");
  
  // Form state
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  useEffect(() => {
    fetchInventory();
  }, []);

  async function fetchInventory() {
    try {
      const res = await fetch(API + "/inventory", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        // Handle paginated response
        setInventory(data.items || data);
      }
    } catch (err) {
      toast.error("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }

  async function fetchDeductionLogs(page = 1) {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("page_size", "20");
      if (logDateFilter) {
        params.append("start_date", logDateFilter);
        params.append("end_date", logDateFilter);
      }
      
      const res = await fetch(`${API}/inventory/frame-inventory-log?${params.toString()}`, {
        credentials: "include"
      });
      
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setLogSummary(data.summary || null);
        setLogPage(data.pagination?.page || 1);
        setLogTotalPages(data.pagination?.total_pages || 1);
      }
    } catch (err) {
      toast.error("Failed to load deduction logs");
    } finally {
      setLogsLoading(false);
    }
  }

  function openLogDialog() {
    setShowLogDialog(true);
    fetchDeductionLogs(1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const url = editingItem 
        ? API + "/inventory/" + editingItem.item_id 
        : API + "/inventory";
      const method = editingItem ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        toast.success(editingItem ? "Item updated" : "Item added");
        fetchInventory();
        resetForm();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to save item");
      }
    } catch (err) {
      toast.error("Failed to save item");
    }
  }

  async function handleDelete(itemId) {
    if (!confirm("Delete this inventory item?")) return;
    try {
      const res = await fetch(API + "/inventory/" + itemId, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Item deleted");
        fetchInventory();
      }
    } catch (err) {
      toast.error("Failed to delete item");
    }
  }

  async function handleQuickAdjust(itemId, amount) {
    try {
      const res = await fetch(API + "/inventory/" + itemId + "/adjust?adjustment=" + amount, {
        method: "PUT",
        credentials: "include"
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(`Quantity ${amount > 0 ? "increased" : "decreased"} to ${result.new_quantity}`);
        fetchInventory();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to adjust quantity");
      }
    } catch (err) {
      toast.error("Failed to adjust quantity");
    }
  }

  async function handleCustomAdjust() {
    if (!adjustItem || adjustAmount === 0) return;
    
    try {
      const res = await fetch(API + "/inventory/" + adjustItem.item_id + "/adjust?adjustment=" + adjustAmount, {
        method: "PUT",
        credentials: "include"
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(`Quantity adjusted to ${result.new_quantity}`);
        fetchInventory();
        closeAdjustDialog();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to adjust quantity");
      }
    } catch (err) {
      toast.error("Failed to adjust quantity");
    }
  }

  function openAdjustDialog(item) {
    setAdjustItem(item);
    setAdjustAmount(0);
    setAdjustReason("");
  }

  function closeAdjustDialog() {
    setAdjustItem(null);
    setAdjustAmount(0);
    setAdjustReason("");
  }

  function openRejectDialog(item) {
    setRejectItem(item);
    setRejectAmount(1);
  }

  function closeRejectDialog() {
    setRejectItem(null);
    setRejectAmount(1);
  }

  async function handleReject() {
    if (!rejectItem || rejectAmount <= 0) return;
    
    try {
      const res = await fetch(API + "/inventory/" + rejectItem.item_id + "/reject?quantity=" + rejectAmount, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(result.message);
        fetchInventory();
        closeRejectDialog();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to reject items");
      }
    } catch (err) {
      toast.error("Failed to reject items");
    }
  }

  function resetForm() {
    setFormData(INITIAL_FORM_DATA);
    setShowAddForm(false);
    setEditingItem(null);
  }

  function handleEdit(item) {
    setFormData({
      sku: item.sku || "",
      name: item.name || "",
      color: item.color || "",
      size: item.size || "",
      quantity: item.quantity || 0,
      min_stock: item.min_stock || 10,
      location: item.location || ""
    });
    setEditingItem(item);
    setShowAddForm(true);
  }

  if (loading) {
    return (
      <div className="space-y-6" data-testid="inventory-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="frame-inventory-page">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Frame Inventory</h1>
          <p className="text-muted-foreground mt-1">
            Manage frame stock and materials
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={openLogDialog} 
            className="gap-2"
            data-testid="view-logs-btn"
          >
            <History className="w-4 h-4" />
            Deduction Logs
          </Button>
          <Button 
            onClick={() => setShowAddForm(true)} 
            className="gap-2"
            data-testid="add-inventory-btn"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <InventoryStats inventory={inventory} />

      {/* Add/Edit Form */}
      {showAddForm && (
        <InventoryForm
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          onCancel={resetForm}
          isEditing={!!editingItem}
        />
      )}

      {/* Search */}
      <InventorySearch searchTerm={searchTerm} setSearchTerm={setSearchTerm} />

      {/* Inventory Table */}
      <InventoryTable
        inventory={inventory}
        searchTerm={searchTerm}
        onQuickAdjust={handleQuickAdjust}
        onOpenAdjust={openAdjustDialog}
        onOpenReject={openRejectDialog}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Adjustment Dialog */}
      <AdjustmentDialog
        item={adjustItem}
        amount={adjustAmount}
        reason={adjustReason}
        onAmountChange={setAdjustAmount}
        onReasonChange={setAdjustReason}
        onConfirm={handleCustomAdjust}
        onClose={closeAdjustDialog}
      />

      {/* Rejection Dialog */}
      <RejectionDialog
        item={rejectItem}
        amount={rejectAmount}
        onAmountChange={setRejectAmount}
        onConfirm={handleReject}
        onClose={closeRejectDialog}
      />

      {/* Deduction Logs Dialog */}
      <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Frame Inventory Deduction Logs
            </DialogTitle>
          </DialogHeader>
          
          {/* Summary Stats */}
          {logSummary && (
            <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  <strong>{logSummary.total_frames_deducted}</strong> frames deducted
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                across <strong>{logSummary.total_orders}</strong> orders
              </div>
            </div>
          )}
          
          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={logDateFilter}
              onChange={(e) => {
                setLogDateFilter(e.target.value);
                setTimeout(() => fetchDeductionLogs(1), 100);
              }}
              className="w-48"
              placeholder="Filter by date"
            />
            {logDateFilter && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setLogDateFilter("");
                  fetchDeductionLogs(1);
                }}
              >
                Clear
              </Button>
            )}
          </div>
          
          {/* Logs Table */}
          <ScrollArea className="flex-1 min-h-[300px]">
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No deduction logs found</p>
                <p className="text-sm mt-1">Logs are created when orders are shipped</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Date</TableHead>
                    <TableHead>Order #</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-center">Qty Deducted</TableHead>
                    <TableHead>Before → After</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.log_id} className="border-border">
                      <TableCell className="text-sm">
                        {new Date(log.deducted_at).toLocaleDateString()}
                        <br />
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.deducted_at).toLocaleTimeString()}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {log.order_number || log.order_id?.slice(-8)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.color || "—"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.size || "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                          -{log.quantity_deducted}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.quantity_before} → {log.quantity_after}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.deducted_by_name}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
          
          {/* Pagination */}
          {logTotalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Page {logPage} of {logTotalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logPage <= 1 || logsLoading}
                  onClick={() => fetchDeductionLogs(logPage - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logPage >= logTotalPages || logsLoading}
                  onClick={() => fetchDeductionLogs(logPage + 1)}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
