import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  RefreshCw, 
  Search, 
  Package, 
  Image as ImageIcon,
  Barcode,
  Tag,
  Store,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Printer
} from "lucide-react";
import { toast } from "sonner";
import { ProductDetails } from "@/components/products/ProductDetails";
import { SyncStatus } from "@/components/products/SyncStatus";
import { ProductStats } from "@/components/products/ProductStats";
import { API } from "@/utils/api";
import JsBarcode from "jsbarcode";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [stats, setStats] = useState(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState("all");
  const [selectedVendor, setSelectedVendor] = useState("all");
  const [pagination, setPagination] = useState({ skip: 0, limit: 50, total: 0 });
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState("updated_at");
  const [sortDirection, setSortDirection] = useState("desc");

  // Barcode label printing state
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [selectedProductForLabel, setSelectedProductForLabel] = useState(null);
  const [labelQuantity, setLabelQuantity] = useState(1);

  // Print barcode labels
  const printBarcodeLabels = (product, variant, quantity = 1) => {
    const barcodeValue = variant?.barcode || variant?.sku || product.product_id;
    const title = variant?.title && variant.title !== "Default Title" 
      ? `${product.title} - ${variant.title}` 
      : product.title;
    const sku = variant?.sku || "N/A";
    
    // Truncate title if too long
    const displayTitle = title.length > 30 ? title.substring(0, 27) + "..." : title;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow pop-ups to print labels");
      return;
    }
    
    // Generate labels HTML
    let labelsHtml = '';
    for (let i = 0; i < quantity; i++) {
      labelsHtml += `
        <div class="label">
          <div class="title">${displayTitle}</div>
          <svg class="barcode" id="barcode-${i}"></svg>
          <div class="barcode-number">${barcodeValue}</div>
          <div class="sku">SKU: ${sku}</div>
        </div>
      `;
    }
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Barcode Labels - ${product.title}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page {
              size: 2in 1in;
              margin: 0;
            }
            body {
              font-family: Arial, sans-serif;
            }
            .label {
              width: 2in;
              height: 1in;
              padding: 0.05in;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              page-break-after: always;
              overflow: hidden;
            }
            .label:last-child {
              page-break-after: auto;
            }
            .title {
              font-size: 8pt;
              font-weight: bold;
              text-align: center;
              line-height: 1.1;
              max-height: 0.22in;
              overflow: hidden;
              width: 100%;
            }
            .barcode {
              max-width: 1.8in;
              height: 0.4in;
            }
            .barcode-number {
              font-size: 7pt;
              font-family: monospace;
              letter-spacing: 0.5px;
            }
            .sku {
              font-size: 6pt;
              color: #333;
            }
            .print-actions {
              position: fixed;
              top: 10px;
              right: 10px;
              display: flex;
              gap: 8px;
              z-index: 1000;
            }
            .print-actions button {
              padding: 10px 20px;
              font-size: 14px;
              cursor: pointer;
              border: none;
              border-radius: 6px;
              font-weight: 500;
            }
            .btn-print { background: #2563eb; color: white; }
            .btn-close { background: #e5e7eb; color: #374151; }
            @media print {
              .print-actions { display: none; }
            }
            @media screen {
              body { padding: 20px; background: #f5f5f5; }
              .label { 
                background: white; 
                border: 1px solid #ddd; 
                margin-bottom: 10px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              }
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        </head>
        <body>
          <div class="print-actions">
            <button class="btn-print" id="printBtn">Print Labels</button>
            <button class="btn-close" id="closeBtn">Close</button>
          </div>
          ${labelsHtml}
          <script>
            // Generate barcodes
            document.querySelectorAll('.barcode').forEach((svg, index) => {
              try {
                JsBarcode(svg, "${barcodeValue}", {
                  format: "CODE128",
                  width: 1.5,
                  height: 35,
                  displayValue: false,
                  margin: 0
                });
              } catch (e) {
                console.error("Barcode error:", e);
                svg.outerHTML = '<div style="font-size:10px;color:red;">Invalid barcode</div>';
              }
            });
            
            document.getElementById('printBtn').addEventListener('click', function() {
              window.print();
            });
            document.getElementById('closeBtn').addEventListener('click', function() {
              window.close();
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const openLabelDialog = (product, e) => {
    e?.stopPropagation();
    setSelectedProductForLabel(product);
    setLabelQuantity(1);
    setLabelDialogOpen(true);
  };

  const loadStores = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stores`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStores(data);
      }
    } catch (err) {
      console.error("Failed to load stores:", err);
    }
  }, []);

  const loadProducts = useCallback(async (sortCol = sortColumn, sortDir = sortDirection) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (selectedStore && selectedStore !== "all") params.append("store_id", selectedStore);
      if (selectedVendor && selectedVendor !== "all") params.append("vendor", selectedVendor);
      params.append("skip", pagination.skip.toString());
      params.append("limit", pagination.limit.toString());
      params.append("sort_by", sortCol);
      params.append("sort_order", sortDir);

      const res = await fetch(`${API}/products?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        setPagination(prev => ({ ...prev, total: data.total || 0 }));
      }
    } catch (err) {
      console.error("Failed to load products:", err);
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedStore, selectedVendor, pagination.skip, pagination.limit, sortColumn, sortDirection]);

  const loadStats = useCallback(async () => {
    try {
      const params = selectedStore && selectedStore !== "all" ? `?store_id=${selectedStore}` : "";
      const res = await fetch(`${API}/products/stats${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, [selectedStore]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    loadProducts();
    loadStats();
  }, [loadProducts, loadStats]);

  async function handleSync(storeId) {
    setSyncing(storeId);
    try {
      const res = await fetch(`${API}/products/sync/${storeId}`, {
        method: "POST",
        credentials: "include"
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(
          `Synced ${result.synced} products (${result.created} new, ${result.updated} updated)`
        );
        loadProducts();
        loadStats();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Sync failed");
      }
    } catch (err) {
      toast.error("Failed to sync products");
    } finally {
      setSyncing(null);
    }
  }

  async function handleTestConnection(storeId) {
    try {
      const res = await fetch(`${API}/products/sync/${storeId}/test`, {
        method: "POST",
        credentials: "include"
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(`Connected to ${result.shop_name}`);
      } else {
        const err = await res.json();
        toast.error(err.detail || "Connection test failed");
      }
    } catch (err) {
      toast.error("Failed to test connection");
    }
  }

  // Handle column sort
  const handleSort = (column) => {
    let newDirection;
    if (sortColumn === column) {
      newDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      // Default to desc for date columns, asc for text columns
      newDirection = column === "updated_at" ? "desc" : "asc";
    }
    setSortColumn(column);
    setSortDirection(newDirection);
    setPagination(prev => ({ ...prev, skip: 0 })); // Reset to first page
    loadProducts(column, newDirection);
  };

  // Sortable header component
  const SortableHeader = ({ column, children, className = "" }) => (
    <TableHead 
      className={`cursor-pointer hover:bg-muted/50 transition-colors select-none ${className}`}
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

  const shopifyStores = stores.filter(s => s.platform === "shopify");

  return (
    <div className="space-y-6" data-testid="products-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            Products
          </h1>
          <p className="text-muted-foreground mt-1">
            Sync and manage products from your connected stores
          </p>
        </div>
        <Button onClick={loadProducts} variant="outline" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Sync Status Cards */}
      <SyncStatus 
        stores={shopifyStores}
        syncing={syncing}
        onSync={handleSync}
        onTestConnection={handleTestConnection}
      />

      {/* Stats */}
      {stats && <ProductStats stats={stats} />}

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, SKU, or barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="product-search"
                />
              </div>
            </div>
            <Select value={selectedStore} onValueChange={setSelectedStore}>
              <SelectTrigger className="w-48" data-testid="store-filter">
                <SelectValue placeholder="All Stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {stores.map((store) => (
                  <SelectItem key={store.store_id} value={store.store_id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedVendor} onValueChange={setSelectedVendor}>
              <SelectTrigger className="w-48" data-testid="vendor-filter">
                <SelectValue placeholder="All Vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {stats?.top_vendors?.map((v) => (
                  <SelectItem key={v.vendor} value={v.vendor}>
                    {v.vendor} ({v.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Products ({pagination.total})</span>
            <div className="flex items-center gap-2 text-sm font-normal">
              <span className="text-muted-foreground">
                Showing {pagination.skip + 1}-{Math.min(pagination.skip + pagination.limit, pagination.total)} of {pagination.total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.skip === 0}
                onClick={() => setPagination(p => ({ ...p, skip: Math.max(0, p.skip - p.limit) }))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.skip + pagination.limit >= pagination.total}
                onClick={() => setPagination(p => ({ ...p, skip: p.skip + p.limit }))}
              >
                Next
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No products found</p>
              <p className="text-sm mt-2">
                {shopifyStores.length > 0 
                  ? "Click 'Sync Products' on a store to import products"
                  : "Add a Shopify store first to sync products"}
              </p>
            </div>
          ) : (
            <Table data-testid="products-table">
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="w-16">Image</TableHead>
                  <SortableHeader column="title">Product</SortableHeader>
                  <TableHead>Variants</TableHead>
                  <SortableHeader column="vendor">Vendor</SortableHeader>
                  <SortableHeader column="product_type">Type</SortableHeader>
                  <SortableHeader column="status">Status</SortableHeader>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <ProductTableRow 
                    key={product.product_id}
                    product={product}
                    stores={stores}
                    onViewDetails={() => setSelectedProduct(product)}
                    onPrintLabel={(e) => openLabelDialog(product, e)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Product Details Modal */}
      <ProductDetails 
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      {/* Barcode Label Print Dialog */}
      <Dialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Barcode className="w-5 h-5" />
              Print Barcode Labels
            </DialogTitle>
            <DialogDescription>
              Print 2" x 1" barcode labels for this product
            </DialogDescription>
          </DialogHeader>
          
          {selectedProductForLabel && (
            <div className="space-y-4 py-4">
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="font-medium text-sm">{selectedProductForLabel.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedProductForLabel.variants?.length || 0} variant(s)
                </p>
              </div>
              
              <div>
                <Label>Select Variant</Label>
                <Select 
                  defaultValue="0"
                  onValueChange={(val) => {
                    // Store selected variant index
                    selectedProductForLabel._selectedVariantIndex = parseInt(val);
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select variant" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedProductForLabel.variants?.map((variant, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        <div className="flex items-center gap-2">
                          <span>{variant.title || "Default"}</span>
                          {variant.sku && (
                            <span className="text-xs text-muted-foreground">({variant.sku})</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Number of Labels</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={labelQuantity}
                  onChange={(e) => setLabelQuantity(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Print up to 100 labels at a time
                </p>
              </div>
              
              {/* Preview */}
              <div className="border rounded-lg p-3 bg-white">
                <p className="text-xs text-muted-foreground mb-2">Label Preview (2" x 1")</p>
                <div className="border-2 border-dashed rounded p-2 text-center" style={{ width: '192px', height: '96px' }}>
                  <p className="text-[8px] font-bold truncate">{selectedProductForLabel.title}</p>
                  <div className="my-1 flex justify-center">
                    <Barcode className="w-24 h-8 text-gray-800" />
                  </div>
                  <p className="text-[7px] font-mono">
                    {selectedProductForLabel.variants?.[0]?.barcode || selectedProductForLabel.variants?.[0]?.sku || "BARCODE"}
                  </p>
                  <p className="text-[6px] text-gray-600">
                    SKU: {selectedProductForLabel.variants?.[0]?.sku || "N/A"}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                const variantIndex = selectedProductForLabel._selectedVariantIndex || 0;
                const variant = selectedProductForLabel.variants?.[variantIndex];
                printBarcodeLabels(selectedProductForLabel, variant, labelQuantity);
                setLabelDialogOpen(false);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print {labelQuantity} Label{labelQuantity > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductTableRow({ product, stores, onViewDetails }) {
  const store = stores.find(s => s.store_id === product.store_id);
  const firstImage = product.images?.[0]?.src;
  const variantCount = product.variants?.length || 0;
  const totalInventory = product.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0) || 0;
  const hasBarcode = product.variants?.some(v => v.barcode);
  const hasSku = product.variants?.some(v => v.sku);

  return (
    <TableRow className="border-border hover:bg-muted/30 cursor-pointer" onClick={onViewDetails}>
      <TableCell>
        {firstImage ? (
          <img 
            src={firstImage} 
            alt={product.title}
            className="w-12 h-12 object-cover rounded-md border border-border"
          />
        ) : (
          <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="font-medium">{product.title}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
          <Store className="w-3 h-3" />
          {store?.name || "Unknown Store"}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{variantCount} variants</Badge>
          <span className="text-sm text-muted-foreground">{totalInventory} in stock</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {hasSku && (
            <Badge variant="outline" className="text-xs gap-1">
              <Tag className="w-3 h-3" /> SKU
            </Badge>
          )}
          {hasBarcode && (
            <Badge variant="outline" className="text-xs gap-1">
              <Barcode className="w-3 h-3" /> Barcode
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm">{product.vendor || "—"}</span>
      </TableCell>
      <TableCell>
        <span className="text-sm">{product.product_type || "—"}</span>
      </TableCell>
      <TableCell>
        <Badge 
          variant={product.status === "active" ? "default" : "secondary"}
          className={product.status === "active" ? "bg-green-600" : ""}
        >
          {product.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm">View</Button>
      </TableCell>
    </TableRow>
  );
}
