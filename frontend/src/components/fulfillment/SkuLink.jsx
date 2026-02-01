import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImageIcon, X } from "lucide-react";

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

  // Try to construct image URL from SKU if not provided
  const getImageUrl = () => {
    if (imageUrl) return imageUrl;
    // Common patterns for product image URLs - adjust based on your image storage
    return null;
  };

  const imgSrc = getImageUrl();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <div className="relative">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-mono text-lg">{sku}</p>
                <p className="text-white/70 text-sm">Product Image</p>
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
            {imgSrc && !imageError ? (
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
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
