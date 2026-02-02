import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
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
    </div>
  );
}
