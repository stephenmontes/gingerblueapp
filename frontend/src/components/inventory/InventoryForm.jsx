import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InventoryForm({ formData, setFormData, onSubmit, onCancel, isEditing }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Item" : "Add New Item"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              {isEditing ? "Update" : "Add Item"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
