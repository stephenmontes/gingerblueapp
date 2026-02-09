import { useState } from "react";
import { Search, Plus, Loader2, Package, Store, ScanLine, Check, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  // Track selected variants for multi-add
  const [selectedVariants, setSelectedVariants] = useState([]);

  // Toggle variant selection
  const toggleVariantSelection = (product, variant = null) => {
    const key = variant 
      ? `${product.product_id}-${variant.variant_id}` 
      : `${product.product_id}-default`;
    
    setSelectedVariants(prev => {
      const exists = prev.find(v => v.key === key);
      if (exists) {
        return prev.filter(v => v.key !== key);
      } else {
        return [...prev, { 
          key, 
          product, 
          variant,
          title: variant?.title || product.title,
          price: variant?.price || product.variants?.[0]?.price || product.price || 0
        }];
      }
    });
  };

  // Check if a variant is selected
  const isSelected = (product, variant = null) => {
    const key = variant 
      ? `${product.product_id}-${variant.variant_id}` 
      : `${product.product_id}-default`;
    return selectedVariants.some(v => v.key === key);
  };

  // Add all selected variants to cart
  const addSelectedToCart = () => {
    if (selectedVariants.length === 0) {
      toast.error("No items selected");
      return;
    }
    
    selectedVariants.forEach(({ product, variant }) => {
      onAddToCart(product, variant);
    });
    
    toast.success(`Added ${selectedVariants.length} item${selectedVariants.length > 1 ? 's' : ''} to cart`);
    setSelectedVariants([]);
  };

  // Clear selections when search changes
  const handleSearchChange = (e) => {
    if (!selectedStore) {
      toast.error("Please select a store first");
      return;
    }
    setSearchQuery(e.target.value);
    setSelectedVariants([]);
  };

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
                onChange={handleSearchChange}
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Search Results ({searchResults.length})</CardTitle>
              
              {/* Multi-select action button */}
              {selectedVariants.length > 0 && (
                <Button 
                  size="sm" 
                  onClick={addSelectedToCart}
                  className="gap-1.5 bg-green-600 hover:bg-green-700"
                  data-testid="add-selected-to-cart"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Add {selectedVariants.length} to Cart
                </Button>
              )}
            </div>
            
            {/* Selection hint */}
            {selectedVariants.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Tip: Click checkboxes to select multiple items, then add all at once
              </p>
            )}
          </CardHeader>
          <CardContent className="p-2 sm:p-6">
            <div className="h-[300px] overflow-y-auto overflow-x-hidden">
              <div className="space-y-2">
                {searchResults.map(product => (
                  <div
                    key={product.product_id}
                    className={`p-2 rounded-lg border transition-all ${
                      isSelected(product) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                    data-testid={`product-${product.product_id}`}
                  >
                    <div className="flex items-center gap-2">
                      {/* Checkbox for single-variant products */}
                      {(!product.variants || product.variants.length <= 1) && (
                        <Checkbox
                          checked={isSelected(product)}
                          onCheckedChange={() => toggleVariantSelection(product)}
                          className="flex-shrink-0"
                          data-testid={`select-product-${product.product_id}`}
                        />
                      )}
                      
                      {product.images?.[0]?.src ? (
                        <img src={product.images[0].src} alt="" className="w-10 h-10 object-cover rounded flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 bg-muted rounded flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p className="font-medium text-sm truncate">{product.title}</p>
                        {product.sku && <p className="text-xs text-muted-foreground truncate">SKU: {product.sku}</p>}
                      </div>
                      {(!product.variants || product.variants.length <= 1) && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-sm font-semibold">${(product.variants?.[0]?.price || product.price || 0).toFixed(2)}</span>
                          <Button 
                            size="sm" 
                            className="h-7 w-7 p-0"
                            onClick={() => onAddToCart(product)}
                            title="Add directly to cart"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {/* Variants with Multi-select */}
                    {product.variants && product.variants.length > 1 && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">{product.variants.length} variants:</p>
                          {/* Select all variants button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => {
                              const allSelected = product.variants.every(v => isSelected(product, v));
                              product.variants.forEach(variant => {
                                const key = `${product.product_id}-${variant.variant_id}`;
                                if (allSelected) {
                                  // Deselect all
                                  setSelectedVariants(prev => prev.filter(v => !v.key.startsWith(product.product_id)));
                                } else if (!isSelected(product, variant)) {
                                  // Select this one
                                  toggleVariantSelection(product, variant);
                                }
                              });
                            }}
                            data-testid={`select-all-variants-${product.product_id}`}
                          >
                            {product.variants.every(v => isSelected(product, v)) ? 'Deselect All' : 'Select All'}
                          </Button>
                        </div>
                        <div className="space-y-1">
                          {product.variants.map((variant, vIdx) => {
                            const variantSelected = isSelected(product, variant);
                            return (
                              <div 
                                key={variant.variant_id || vIdx}
                                className={`flex items-center gap-2 py-1 px-1 rounded transition-all ${
                                  variantSelected ? 'bg-primary/10' : ''
                                }`}
                              >
                                <Checkbox
                                  checked={variantSelected}
                                  onCheckedChange={() => toggleVariantSelection(product, variant)}
                                  className="flex-shrink-0"
                                  data-testid={`select-variant-${product.product_id}-${vIdx}`}
                                />
                                <span className="flex-1 text-xs truncate min-w-0">{variant.title || `Variant ${vIdx + 1}`}</span>
                                <span className="text-xs font-semibold whitespace-nowrap">${parseFloat(variant.price || 0).toFixed(2)}</span>
                                <Button 
                                  size="sm" 
                                  className="h-6 w-6 p-0 flex-shrink-0"
                                  onClick={() => onAddToCart(product, variant)}
                                  title="Add directly to cart"
                                  data-testid={`add-variant-${vIdx}`}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Floating selection summary */}
            {selectedVariants.length > 0 && (
              <div className="mt-3 p-2 bg-primary/10 rounded-lg border border-primary/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{selectedVariants.length} selected</span>
                    <span className="text-xs text-muted-foreground">
                      (Total: ${selectedVariants.reduce((sum, v) => sum + parseFloat(v.price || 0), 0).toFixed(2)})
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedVariants([])}
                      className="h-7 text-xs"
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={addSelectedToCart}
                      className="h-7 gap-1 bg-green-600 hover:bg-green-700"
                    >
                      <ShoppingCart className="w-3 h-3" />
                      Add All
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
