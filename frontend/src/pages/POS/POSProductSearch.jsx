import { Search, Plus, Loader2, Package, Store, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

export function POSProductSearch({
  selectedStore,
  searchQuery,
  setSearchQuery,
  searchResults,
  searching,
  storeProductCount,
  barcodeInputRef,
  onBarcodeKeyDown,
  onAddToCart,
  onOpenCustomItem
}) {
  return (
    <>
      {/* Search Bar */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                ref={barcodeInputRef}
                placeholder={selectedStore ? "Scan or search..." : "Select store first..."}
                value={searchQuery}
                onChange={(e) => {
                  if (!selectedStore) {
                    toast.error("Please select a store first");
                    return;
                  }
                  setSearchQuery(e.target.value);
                }}
                onKeyDown={onBarcodeKeyDown}
                onClick={() => {
                  if (!selectedStore) {
                    toast.error("Please select a store first");
                  }
                }}
                className={`pl-10 h-12 text-base ${!selectedStore ? 'cursor-not-allowed opacity-60' : ''}`}
                data-testid="product-search"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                if (!selectedStore) {
                  toast.error("Please select a store first");
                  return;
                }
                onOpenCustomItem();
              }}
              data-testid="add-custom-item"
            >
              <Plus className="w-4 h-4 mr-2" />
              Custom Item
            </Button>
          </div>
          
          {!selectedStore && (
            <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Store className="w-5 h-5 text-amber-500" />
              <p className="text-sm text-amber-600 dark:text-amber-400">Please select a store from the dropdown above to search products</p>
            </div>
          )}
          
          {searching && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Searching...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Search Results ({searchResults.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {searchResults.map(product => (
                  <div
                    key={product.product_id}
                    className="p-3 rounded-lg border border-border hover:bg-muted/50"
                    data-testid={`product-${product.product_id}`}
                  >
                    <div className="flex items-center gap-3">
                      {product.images?.[0]?.src ? (
                        <img src={product.images[0].src} alt="" className="w-12 h-12 object-cover rounded" />
                      ) : (
                        <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                          <Package className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{product.title}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {product.sku && <span>SKU: {product.sku}</span>}
                          {product.barcode && <span>• {product.barcode}</span>}
                        </div>
                      </div>
                      {(!product.variants || product.variants.length <= 1) && (
                        <>
                          <div className="text-right">
                            <p className="font-semibold">${(product.variants?.[0]?.price || product.price || 0).toFixed(2)}</p>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => onAddToCart(product)}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Add
                          </Button>
                        </>
                      )}
                    </div>
                    
                    {/* Variants Dropdown */}
                    {product.variants && product.variants.length > 1 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">{product.variants.length} variants available:</p>
                        <div className="grid gap-2">
                          {product.variants.map((variant, vIdx) => (
                            <div 
                              key={variant.variant_id || vIdx}
                              className="flex items-center justify-between p-2 rounded bg-muted/30 hover:bg-muted/50"
                            >
                              <div className="flex-1">
                                <p className="text-sm font-medium">{variant.title || `Variant ${vIdx + 1}`}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {variant.sku && <span>SKU: {variant.sku}</span>}
                                  {variant.barcode && <span>• {variant.barcode}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-semibold">${parseFloat(variant.price || 0).toFixed(2)}</span>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => onAddToCart(product, variant)}
                                >
                                  <Plus className="w-4 h-4 mr-1" />
                                  Add
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* No Results Message */}
      {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
        <Card className="bg-card border-border">
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              {storeProductCount === 0 ? (
                <>
                  <p className="font-medium text-foreground">No products in this store</p>
                  <p className="text-sm mt-1">This store has no synced products. Please sync products from Shopify first.</p>
                </>
              ) : (
                <>
                  <p className="font-medium text-foreground">No products found for "{searchQuery}"</p>
                  <p className="text-sm mt-1">Try a different search term, SKU, or barcode</p>
                  {storeProductCount && (
                    <p className="text-xs mt-2">{storeProductCount.toLocaleString()} products available in this store</p>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
