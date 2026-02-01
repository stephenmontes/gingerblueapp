import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Printer, ArrowDownAZ } from "lucide-react";
import { toast } from "sonner";
import { SkuLink } from "./SkuLink";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Extract size from SKU (second-to-last group)
function getSizeFromSku(sku) {
  if (!sku) return "—";
  const parts = sku.replace(/_/g, '-').replace(/\./g, '-').split('-').filter(p => p.trim());
  if (parts.length >= 2) return parts[parts.length - 2].toUpperCase();
  return parts[0]?.toUpperCase() || "—";
}

export function PrintListView({ stageId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState({});

  useEffect(() => {
    loadData();
  }, [stageId]);

  async function loadData() {
    try {
      const res = await fetch(`${API}/fulfillment/stages/${stageId}/items-consolidated`, {
        credentials: "include",
      });
      if (res.ok) setData(await res.json());
    } catch (err) {
      toast.error("Failed to load items");
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(sku) {
    setExpandedItems(prev => ({ ...prev, [sku]: !prev[sku] }));
  }

  if (loading) {
    return <Card className="bg-card border-border"><CardContent className="p-8"><div className="h-48 bg-muted/30 animate-pulse rounded-lg" /></CardContent></Card>;
  }

  if (!data) return null;

  return (
    <Card className="bg-card border-border print:border-0">
      <CardHeader className="print:pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-primary" />
            Consolidated Items
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2 print:hidden">
            <Printer className="w-4 h-4" />Print
          </Button>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{data.total_orders} orders</span>
          <span>•</span>
          <span>{data.total_unique_items} unique items</span>
          <span>•</span>
          <span className="font-medium">{data.total_item_count} pieces</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <ArrowDownAZ className="w-3 h-3" />
          <span>Sorted by size: S → L → XL → HS → HX → XX → XXX</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ItemsTable items={data.grouped_items} expandedItems={expandedItems} onToggle={toggleExpand} />
        <TotalFooter total={data.total_item_count} />
      </CardContent>
    </Card>
  );
}

function ItemsTable({ items, expandedItems, onToggle }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead className="w-8 print:hidden"></TableHead>
          <TableHead>Size</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Item Name</TableHead>
          <TableHead className="text-right">Subtotal</TableHead>
          <TableHead className="print:hidden">Orders</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <ItemRow key={item.sku} item={item} isExpanded={expandedItems[item.sku]} onToggle={() => onToggle(item.sku)} />
        ))}
      </TableBody>
    </Table>
  );
}

function ItemRow({ item, isExpanded, onToggle }) {
  const size = getSizeFromSku(item.sku);
  
  return (
    <>
      <TableRow className="border-border hover:bg-muted/50">
        <TableCell className="print:hidden">
          <Button variant="ghost" size="sm" onClick={onToggle} className="h-6 w-6 p-0">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="font-mono font-bold">{size}</Badge>
        </TableCell>
        <TableCell>
          <SkuLink sku={item.sku} imageUrl={item.image_url || item.image} />
        </TableCell>
        <TableCell>{item.name}</TableCell>
        <TableCell className="text-right">
          <Badge variant="secondary" className="text-base font-bold">{item.total_quantity}</Badge>
        </TableCell>
        <TableCell className="print:hidden text-sm text-muted-foreground">
          {item.orders.length} order{item.orders.length !== 1 ? "s" : ""}
        </TableCell>
      </TableRow>
      {isExpanded && <ExpandedRow orders={item.orders} />}
    </>
  );
}

function ExpandedRow({ orders }) {
  return (
    <TableRow className="bg-muted/30 print:hidden">
      <TableCell colSpan={6} className="p-0">
        <div className="px-8 py-3 border-l-4 border-primary/30">
          <p className="text-xs text-muted-foreground mb-2">Order Breakdown:</p>
          <div className="grid grid-cols-3 gap-2">
            {orders.map((o, i) => (
              <div key={i} className="text-sm bg-background/50 px-2 py-1 rounded">
                <span className="font-mono text-xs">{o.order_number}</span> × <span className="font-medium">{o.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function TotalFooter({ total }) {
  return (
    <div className="p-4 border-t border-border bg-muted/30">
      <div className="flex justify-end">
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Grand Total</p>
          <p className="text-2xl font-bold">{total} pieces</p>
        </div>
      </div>
    </div>
  );
}
