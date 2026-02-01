import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Plus, 
  Minus,
  Search, 
  Package, 
  Edit2, 
  Trash2,
  AlertTriangle,
  PlusCircle,
  MinusCircle,
  XCircle
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

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
  
  // Form state
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    color: "",
    size: "",
    quantity: 0,
    min_stock: 10,
    location: ""
  });

  useEffect(() => {
    fetchInventory();
  }, []);

  async function fetchInventory() {
    try {
      const res = await fetch(API + "/inventory", { credentials: "include" });
      if (res.ok) {
        setInventory(await res.json());
      }
    } catch (err) {
      toast.error("Failed to load inventory");
    } finally {
      setLoading(false);
    }
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

  // Quick adjust (+1 or -1)
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

  // Custom adjustment via dialog
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

  // Rejection functions
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
    setFormData({
      sku: "",
      name: "",
      color: "",
      size: "",
      quantity: 0,
      min_stock: 10,
      location: ""
    });
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

  const filteredInventory = inventory.filter(item => {
    const search = searchTerm.toLowerCase();
    return (
      item.sku?.toLowerCase().includes(search) ||
      item.name?.toLowerCase().includes(search) ||
      item.color?.toLowerCase().includes(search) ||
      item.size?.toLowerCase().includes(search)
    );
  });

  const lowStockItems = inventory.filter(item => item.quantity <= item.min_stock);

  if (loading) {
    return (
      <div className="space-y-6" data-testid="inventory-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="frame-inventory-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Frame Inventory</h1>
          <p className="text-muted-foreground mt-1">
            Manage frame stock and materials
          </p>
        </div>
        <Button 
          onClick={() => setShowAddForm(true)} 
          className="gap-2"
          data-testid="add-inventory-btn"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{inventory.length}</p>
                <p className="text-sm text-muted-foreground">Total Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Package className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {inventory.reduce((sum, item) => sum + (item.quantity || 0), 0)}
                </p>
                <p className="text-sm text-muted-foreground">Total Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className={`border-border ${lowStockItems.length > 0 ? "bg-orange-500/10 border-orange-500/30" : "bg-card"}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${lowStockItems.length > 0 ? "bg-orange-500/20" : "bg-muted"}`}>
                <AlertTriangle className={`w-5 h-5 ${lowStockItems.length > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{lowStockItems.length}</p>
                <p className="text-sm text-muted-foreground">Low Stock Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>{editingItem ? "Edit Item" : "Add New Item"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">SKU</label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData({...formData, sku: e.target.value})}
                  placeholder="e.g., FRM-BLK-SM"
                  required
                  data-testid="inventory-sku-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Frame name"
                  required
                  data-testid="inventory-name-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Color</label>
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({...formData, color: e.target.value})}
                  placeholder="e.g., Black, Natural"
                  data-testid="inventory-color-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Size</label>
                <Input
                  value={formData.size}
                  onChange={(e) => setFormData({...formData, size: e.target.value})}
                  placeholder="e.g., S, L, XL"
                  data-testid="inventory-size-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Quantity</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 0})}
                  data-testid="inventory-quantity-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Min Stock Level</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.min_stock}
                  onChange={(e) => setFormData({...formData, min_stock: parseInt(e.target.value) || 0})}
                  data-testid="inventory-min-stock-input"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium mb-1 block">Location</label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  placeholder="e.g., Shelf A-1"
                  data-testid="inventory-location-input"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" data-testid="inventory-save-btn">
                  {editingItem ? "Update" : "Add Item"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by SKU, name, color, size..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          data-testid="inventory-search"
        />
      </div>

      {/* Inventory Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-center">Quantity</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "No items match your search" : "No inventory items yet"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredInventory.map((item) => (
                  <InventoryRow 
                    key={item.item_id} 
                    item={item}
                    onQuickAdjust={handleQuickAdjust}
                    onOpenAdjust={openAdjustDialog}
                    onOpenReject={openRejectDialog}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
    </div>
  );
}

function InventoryRow({ item, onQuickAdjust, onOpenAdjust, onOpenReject, onEdit, onDelete }) {
  const isLowStock = item.quantity <= item.min_stock;
  const isRejected = item.is_rejected;
  
  return (
    <TableRow 
      className={`border-border ${isRejected ? "bg-red-500/10" : ""}`} 
      data-testid={`inventory-row-${item.item_id}`}
    >
      <TableCell className={`font-mono text-sm ${isRejected ? "text-red-400" : ""}`}>
        {item.sku}
      </TableCell>
      <TableCell className={`font-medium ${isRejected ? "text-red-400" : ""}`}>
        {item.name}
      </TableCell>
      <TableCell className={isRejected ? "text-red-400" : ""}>{item.color || "-"}</TableCell>
      <TableCell className={isRejected ? "text-red-400" : ""}>{item.size || "-"}</TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => onQuickAdjust(item.item_id, -1)}
            disabled={item.quantity <= 0}
            data-testid={`qty-minus-${item.item_id}`}
          >
            <Minus className="w-4 h-4" />
          </Button>
          <button
            onClick={() => onOpenAdjust(item)}
            className={`min-w-[3rem] px-2 py-1 rounded font-medium cursor-pointer hover:bg-muted transition-colors ${isRejected ? "text-red-400" : isLowStock ? "text-orange-500" : ""}`}
            data-testid={`qty-value-${item.item_id}`}
          >
            {item.quantity}
          </button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => onQuickAdjust(item.item_id, 1)}
            data-testid={`qty-plus-${item.item_id}`}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
      <TableCell className={`text-muted-foreground ${isRejected ? "text-red-400/70" : ""}`}>
        {item.location || "-"}
      </TableCell>
      <TableCell>
        {isRejected ? (
          <Badge variant="outline" className="border-red-500 text-red-500 bg-red-500/10">
            Rejected
          </Badge>
        ) : isLowStock ? (
          <Badge variant="outline" className="border-orange-500 text-orange-500">
            Low Stock
          </Badge>
        ) : (
          <Badge variant="outline" className="border-green-500 text-green-500">
            In Stock
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {/* Only show Reject button for good inventory (not rejected items) */}
          {!isRejected && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
              onClick={() => onOpenReject(item)}
              title="Reject frames"
              data-testid={`reject-inventory-${item.item_id}`}
            >
              <XCircle className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenAdjust(item)}
            title="Adjust quantity"
            data-testid={`adjust-inventory-${item.item_id}`}
          >
            <PlusCircle className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(item)}
            data-testid={`edit-inventory-${item.item_id}`}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(item.item_id)}
            data-testid={`delete-inventory-${item.item_id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function AdjustmentDialog({ item, amount, reason, onAmountChange, onReasonChange, onConfirm, onClose }) {
  if (!item) return null;

  const newQuantity = Math.max(0, item.quantity + amount);

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Inventory Quantity</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="font-medium">{item.name}</p>
            <p className="text-sm text-muted-foreground font-mono">{item.sku}</p>
          </div>
          
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Current</p>
              <p className="text-2xl font-bold">{item.quantity}</p>
            </div>
            <div className="text-2xl text-muted-foreground">→</div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">New</p>
              <p className={`text-2xl font-bold ${newQuantity < item.quantity ? "text-red-400" : newQuantity > item.quantity ? "text-green-400" : ""}`}>
                {newQuantity}
              </p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Adjustment Amount</label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAmountChange(amount - 10)}
                disabled={item.quantity + amount - 10 < 0}
              >
                -10
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAmountChange(amount - 1)}
                disabled={item.quantity + amount - 1 < 0}
              >
                -1
              </Button>
              <Input
                type="number"
                value={amount}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  if (item.quantity + val >= 0) {
                    onAmountChange(val);
                  }
                }}
                className="w-24 text-center"
                data-testid="adjust-amount-input"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAmountChange(amount + 1)}
              >
                +1
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAmountChange(amount + 10)}
              >
                +10
              </Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Reason (optional)</label>
            <Input
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="e.g., Received shipment, Damaged items, Inventory count..."
              data-testid="adjust-reason-input"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={onConfirm}
            disabled={amount === 0}
            className={amount < 0 ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
            data-testid="confirm-adjust-btn"
          >
            {amount < 0 ? (
              <>
                <MinusCircle className="w-4 h-4 mr-2" />
                Remove {Math.abs(amount)}
              </>
            ) : (
              <>
                <PlusCircle className="w-4 h-4 mr-2" />
                Add {amount}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
