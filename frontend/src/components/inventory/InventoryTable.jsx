import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Search } from "lucide-react";
import { InventoryRow } from "./InventoryRow";

export function InventorySearch({ searchTerm, setSearchTerm }) {
  return (
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
  );
}

export function InventoryTable({ 
  inventory, 
  searchTerm,
  onQuickAdjust, 
  onOpenAdjust, 
  onOpenReject, 
  onEdit, 
  onDelete 
}) {
  const filteredInventory = inventory.filter(item => {
    const search = searchTerm.toLowerCase();
    return (
      item.sku?.toLowerCase().includes(search) ||
      item.name?.toLowerCase().includes(search) ||
      item.color?.toLowerCase().includes(search) ||
      item.size?.toLowerCase().includes(search)
    );
  });

  return (
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
                  onQuickAdjust={onQuickAdjust}
                  onOpenAdjust={onOpenAdjust}
                  onOpenReject={onOpenReject}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
