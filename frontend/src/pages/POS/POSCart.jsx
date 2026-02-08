import { ShoppingCart, Plus, Minus, ZoomIn, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export function POSCart({
  cart,
  orderColor,
  updateQuantity,
  getItemTotal,
  setPreviewImage,
  applyItemDiscount
}) {
  const [itemDiscountIndex, setItemDiscountIndex] = useState(null);
  const [tempDiscount, setTempDiscount] = useState({ type: "percentage", value: 0 });

  const handleApplyDiscount = (index) => {
    applyItemDiscount(index, tempDiscount.type, tempDiscount.value);
    setItemDiscountIndex(null);
    setTempDiscount({ type: "percentage", value: 0 });
  };

  return (
    <Card 
      className="border-2 transition-colors"
      style={orderColor && cart.length > 0 ? { 
        borderColor: orderColor.border,
        backgroundColor: `${orderColor.bg}` 
      } : undefined}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart 
            className="w-5 h-5" 
            style={orderColor && cart.length > 0 ? { color: orderColor.accent } : undefined}
          />
          Cart ({cart.length} items)
          {orderColor && cart.length > 0 && (
            <div 
              className="w-3 h-3 rounded-full ml-2"
              style={{ backgroundColor: orderColor.accent }}
              title="Order color indicator"
            />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {cart.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Cart is empty</p>
            <p className="text-sm">Scan a barcode or search for products</p>
          </div>
        ) : (
          <ScrollArea className="h-[250px] md:h-[300px]">
            <div className="space-y-2 md:space-y-3">
              {cart.map((item, index) => (
                <div key={index} className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg border bg-background/80">
                  {/* Clickable thumbnail */}
                  <button
                    onClick={() => item.image && setPreviewImage({ src: item.image, title: item.title })}
                    className={`relative flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-md overflow-hidden border border-border ${item.image ? 'cursor-pointer hover:ring-2 hover:ring-primary' : 'cursor-default'}`}
                    disabled={!item.image}
                  >
                    {item.image ? (
                      <>
                        <img src={item.image} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/20 flex items-center justify-center transition-colors">
                          <ZoomIn className="w-4 h-4 text-white opacity-0 hover:opacity-100" />
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                  </button>
                  
                  {/* Item details */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm md:text-base truncate">{item.title}</p>
                    <div className="flex flex-wrap items-center gap-1 md:gap-2 text-xs md:text-sm text-muted-foreground">
                      {item.sku && <span className="hidden sm:inline">SKU: {item.sku}</span>}
                      <span className="font-medium">${item.price.toFixed(2)}</span>
                      {item.is_custom && <Badge variant="secondary" className="text-[10px] md:text-xs">Custom</Badge>}
                      {item.discount_type && item.discount_value > 0 && (
                        <Badge variant="destructive" className="text-[10px] md:text-xs">
                          -{item.discount_value}{item.discount_type === "percentage" ? "%" : "$"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {/* Quantity controls */}
                  <div className="flex items-center gap-1 md:gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 md:h-8 md:w-8"
                      onClick={() => updateQuantity(index, -1)}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-6 md:w-8 text-center font-medium text-sm md:text-base">{item.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 md:h-8 md:w-8"
                      onClick={() => updateQuantity(index, 1)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  
                  {/* Price */}
                  <div className="w-16 md:w-20 text-right">
                    {item.discount_type && item.discount_value > 0 && (
                      <p className="text-[10px] md:text-xs text-muted-foreground line-through">
                        ${(item.price * item.quantity).toFixed(2)}
                      </p>
                    )}
                    <p className="font-semibold text-sm md:text-base">
                      ${getItemTotal(item).toFixed(2)}
                    </p>
                  </div>
                  
                  {/* Discount popover */}
                  <div className="flex flex-col sm:flex-row gap-1">
                    <Popover open={itemDiscountIndex === index} onOpenChange={(open) => {
                      if (open) {
                        setItemDiscountIndex(index);
                        setTempDiscount({ 
                          type: item.discount_type || "percentage", 
                          value: item.discount_value || 0 
                        });
                      } else {
                        setItemDiscountIndex(null);
                      }
                    }}>
                      <PopoverTrigger asChild>
                        <Button
                          size="icon"
                          variant={item.discount_value > 0 ? "default" : "outline"}
                          className="h-7 w-7 md:h-8 md:w-8"
                          data-testid={`item-discount-${index}`}
                        >
                          %
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64" align="end">
                        <div className="space-y-3">
                          <Label className="text-sm font-medium">Item Discount</Label>
                          <div className="flex gap-2">
                            <Select
                              value={tempDiscount.type}
                              onValueChange={(value) => setTempDiscount(prev => ({ ...prev, type: value }))}
                            >
                              <SelectTrigger className="w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percentage">%</SelectItem>
                                <SelectItem value="fixed">$</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min="0"
                              value={tempDiscount.value}
                              onChange={(e) => setTempDiscount(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                              className="flex-1"
                            />
                          </div>
                          <Button 
                            size="sm" 
                            className="w-full"
                            onClick={() => handleApplyDiscount(index)}
                          >
                            Apply
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
