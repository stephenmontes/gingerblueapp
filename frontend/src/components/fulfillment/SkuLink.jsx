import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImageIcon, X, Loader2 } from "lucide-react";
import { API } from "@/utils/api";


export function SkuLink({ sku, imageUrl, className = "" }) {
  const [showImage, setShowImage] = useState(false);

  if (!sku) return <span className={className}>—</span>;

  return (
    <>
      <button
        onClick={() => setShowImage(true)}
        className={`font-mono text-sm hover:text-primary hover:underline cursor-pointer ${className}`}
        title="Click to view image"
      >
        {sku}
      </button>
      
      <SkuImageModal 
        sku={sku} 
        imageUrl={imageUrl} 
        open={showImage} 
        onClose={() => setShowImage(false)} 
      />
    </>
  );
}

export function SkuImageModal({ sku, imageUrl, open, onClose }) {
  const [imageError, setImageError] = useState(false);
  const [fetchedImage, setFetchedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [productInfo, setProductInfo] = useState(null);

  // Fetch product image from backend if not provided
  useEffect(() => {
    if (!open || imageUrl || !sku) return;
    
    setLoading(true);
    setImageError(false);
    
    fetch(`${API}/products/image/${encodeURIComponent(sku)}`, { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.image_url) {
          setFetchedImage(data.image_url);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    
    // Also fetch full product info
    fetch(`${API}/products/by-sku/${encodeURIComponent(sku)}`, { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.product) {
          setProductInfo({
            title: data.product.title,
            vendor: data.product.vendor,
            variant: data.variant
          });
        }
      })
      .catch(() => {});
  }, [open, sku, imageUrl]);

  const imgSrc = imageUrl || fetchedImage;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <div className="relative">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-mono text-lg">{sku}</p>
                {productInfo && (
                  <>
                    <p className="text-white text-sm font-medium">{productInfo.title}</p>
                    {productInfo.vendor && (
                      <p className="text-white/70 text-xs">{productInfo.vendor}</p>
                    )}
                  </>
                )}
                {!productInfo && <p className="text-white/70 text-sm">Product Image</p>}
              </div>
              <button 
                onClick={onClose}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
          
          {/* Image */}
          <div className="bg-muted min-h-[400px] flex items-center justify-center">
            {loading ? (
              <div className="text-center p-8">
                <Loader2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-spin" />
                <p className="text-muted-foreground">Loading image...</p>
              </div>
            ) : imgSrc && !imageError ? (
              <img
                src={imgSrc}
                alt={`Product ${sku}`}
                className="max-w-full max-h-[70vh] object-contain"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="text-center p-8">
                <ImageIcon className="w-24 h-24 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground">No image available</p>
                <p className="text-sm text-muted-foreground/70 mt-1">SKU: {sku}</p>
                {productInfo && (
                  <p className="text-sm text-muted-foreground mt-2">{productInfo.title}</p>
                )}
              </div>
            )}
          </div>
          
          {/* Product details footer */}
          {productInfo?.variant && (
            <div className="p-4 bg-muted/30 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <div>
                  {productInfo.variant.option1 && (
                    <span className="text-muted-foreground mr-4">
                      Option: <span className="text-foreground">{productInfo.variant.option1}</span>
                    </span>
                  )}
                  {productInfo.variant.barcode && (
                    <span className="text-muted-foreground">
                      Barcode: <span className="font-mono">{productInfo.variant.barcode}</span>
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="font-medium">${parseFloat(productInfo.variant.price || 0).toFixed(2)}</span>
                  {productInfo.variant.inventory_quantity !== undefined && (
                    <span className="text-muted-foreground ml-4">
                      Stock: {productInfo.variant.inventory_quantity}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
