import { Card, CardContent } from "@/components/ui/card";
import { Package, AlertTriangle } from "lucide-react";

export function InventoryStats({ inventory }) {
  const lowStockItems = inventory.filter(item => item.quantity <= item.min_stock);
  const totalStock = inventory.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="inventory-stats">
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
              <p className="text-2xl font-bold">{totalStock}</p>
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
  );
}
