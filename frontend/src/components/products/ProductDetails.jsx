import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Package, 
  Image as ImageIcon,
  Barcode,
  Tag,
  DollarSign,
  Layers,
  ExternalLink
} from "lucide-react";

export function ProductDetails({ product, onClose }) {
  if (!product) return null;

  return (
    <Dialog open={!!product} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Package className="w-5 h-5 text-primary" />
            {product.title}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="variants">Variants ({product.variants?.length || 0})</TabsTrigger>
            <TabsTrigger value="images">Images ({product.images?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <ProductOverview product={product} />
          </TabsContent>

          <TabsContent value="variants" className="mt-4">
            <VariantsTable variants={product.variants || []} />
          </TabsContent>

          <TabsContent value="images" className="mt-4">
            <ImagesGallery images={product.images || []} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ProductOverview({ product }) {
  const firstImage = product.images?.[0]?.src;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Main Image */}
      <div className="md:col-span-1">
        {firstImage ? (
          <img 
            src={firstImage}
            alt={product.title}
            className="w-full aspect-square object-cover rounded-lg border border-border"
          />
        ) : (
          <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center">
            <ImageIcon className="w-16 h-16 text-muted-foreground opacity-50" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="md:col-span-2 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <InfoItem label="Vendor" value={product.vendor} />
          <InfoItem label="Product Type" value={product.product_type} />
          <InfoItem label="Status">
            <Badge className={product.status === "active" ? "bg-green-600" : ""}>
              {product.status}
            </Badge>
          </InfoItem>
          <InfoItem label="Platform">
            <Badge variant="outline" className="capitalize">{product.platform}</Badge>
          </InfoItem>
        </div>

        {product.tags?.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Tags</p>
            <div className="flex flex-wrap gap-1">
              {product.tags.map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
        )}

        {product.options?.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Options</p>
            <div className="space-y-2">
              {product.options.map((opt, i) => (
                <div key={i}>
                  <span className="font-medium text-sm">{opt.name}: </span>
                  <span className="text-sm text-muted-foreground">
                    {opt.values?.join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {product.description && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Description</p>
            <div 
              className="text-sm prose prose-sm dark:prose-invert max-h-40 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          </div>
        )}

        <div className="pt-4 border-t border-border text-xs text-muted-foreground">
          <p>External ID: {product.external_id}</p>
          <p>Last Synced: {product.last_synced_at ? new Date(product.last_synced_at).toLocaleString() : "Never"}</p>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value, children }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {children || <p className="font-medium">{value || "—"}</p>}
    </div>
  );
}

function VariantsTable({ variants }) {
  if (variants.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No variants available
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-16">Image</TableHead>
            <TableHead>Title / Options</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Barcode</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Inventory</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((variant) => (
            <TableRow key={variant.variant_id} className="border-border">
              <TableCell>
                {variant.image_url ? (
                  <img 
                    src={variant.image_url}
                    alt={variant.title}
                    className="w-10 h-10 object-cover rounded border border-border"
                  />
                ) : (
                  <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </TableCell>
              <TableCell>
                <div className="font-medium">{variant.title}</div>
                <div className="text-xs text-muted-foreground">
                  {[variant.option1, variant.option2, variant.option3].filter(Boolean).join(" / ")}
                </div>
              </TableCell>
              <TableCell>
                {variant.sku ? (
                  <code className="text-xs bg-muted px-2 py-1 rounded">{variant.sku}</code>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {variant.barcode ? (
                  <div className="flex items-center gap-1">
                    <Barcode className="w-3 h-3 text-muted-foreground" />
                    <code className="text-xs">{variant.barcode}</code>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <span className="font-mono">${parseFloat(variant.price).toFixed(2)}</span>
                {variant.compare_at_price && (
                  <span className="text-xs text-muted-foreground line-through ml-2">
                    ${parseFloat(variant.compare_at_price).toFixed(2)}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Badge 
                  variant={variant.inventory_quantity > 0 ? "secondary" : "destructive"}
                >
                  {variant.inventory_quantity}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ImagesGallery({ images }) {
  if (images.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
        No images available
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {images.map((image) => (
        <div key={image.image_id} className="group relative">
          <img
            src={image.src}
            alt={image.alt || "Product image"}
            className="w-full aspect-square object-cover rounded-lg border border-border"
          />
          <a
            href={image.src}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 p-1.5 rounded"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 rounded-b-lg">
            <p className="text-xs text-white">Position: {image.position}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
