import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Printer, Package } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function PrintListView({ stageId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState({});

  useEffect(() => {
    loadConsolidatedItems();
  }, [stageId]);

  async function loadConsolidatedItems() {
    try {
      const res = await fetch(`${API}/fulfillment/stages/${stageId}/items-consolidated`, {
        credentials: "include",
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      toast.error("Failed to load items");
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(sku) {
    setExpandedItems(prev => ({ ...prev, [sku]: !prev[sku] }));
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8">
          <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card className="bg-card border-border print:border-0 print:shadow-none">
      <CardHeader className="print:pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-primary" />
            Print List - Consolidated Items
          </CardTitle>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" />
              Print
            </Button>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground print:text-black">
          <span>{data.total_orders} orders</span>
          <span>•</span>
          <span>{data.total_unique_items} unique items</span>
          <span>•</span>
          <span className="font-medium">{data.total_item_count} total pieces</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border print:border-black">
              <TableHead className="w-8 print:hidden"></TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Item Name</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="print:hidden">Orders</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.grouped_items.map((item) => (
              <GroupedItemRow
                key={item.sku}
                item={item}
                isExpanded={expandedItems[item.sku]}
                onToggle={() => toggleExpand(item.sku)}
              />
            ))}
          </TableBody>
        </Table>

        <div className="p-4 border-t border-border bg-muted/30 print:bg-gray-100">
          <div className="flex justify-end">
            <div className="text-right">
              <p className="text-sm text-muted-foreground print:text-gray-600">Grand Total</p>
              <p className="text-2xl font-bold">{data.total_item_count} pieces</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupedItemRow({ item, isExpanded, onToggle }) {
  return (
    <>
      <TableRow className="border-border print:border-gray-300 hover:bg-muted/50">
        <TableCell className="print:hidden">
          <Button variant="ghost" size="sm" onClick={onToggle} className="h-6 w-6 p-0">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </TableCell>
        <TableCell className="font-mono font-medium">{item.sku}</TableCell>
        <TableCell>{item.name}</TableCell>
        <TableCell className="text-right">
          <Badge variant="secondary" className="text-base font-bold print:bg-gray-200">
            {item.total_quantity}
          </Badge>
        </TableCell>
        <TableCell className="print:hidden">
          <span className="text-sm text-muted-foreground">
            {item.orders.length} order{item.orders.length !== 1 ? 's' : ''}
          </span>
        </TableCell>
      </TableRow>
      
      {isExpanded && (
        <TableRow className="bg-muted/30 print:hidden">
          <TableCell colSpan={5} className="p-0">
            <OrderBreakdown orders={item.orders} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function OrderBreakdown({ orders }) {
  return (
    <div className="px-8 py-3 border-l-4 border-primary/30">
      <p className="text-xs text-muted-foreground mb-2 font-medium">Order Breakdown:</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {orders.map((order, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm bg-background/50 px-2 py-1 rounded">
            <Package className="w-3 h-3 text-muted-foreground" />
            <span className="font-mono text-xs">{order.order_number}</span>
            <span className="text-muted-foreground">×</span>
            <span className="font-medium">{order.quantity}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
