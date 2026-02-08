import { ShoppingCart, Plus, Minus, ZoomIn, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export function POSCart({
  cart,
  orderColor,
  updateQuantity,
  removeFromCart,
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
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart 
            className="w-4 h-4" 
            style={orderColor && cart.length > 0 ? { color: orderColor.accent } : undefined}
          />
          Cart ({cart.length})
          {orderColor && cart.length > 0 && (
            <div 
              className="w-2.5 h-2.5 rounded-full ml-1"
              style={{ backgroundColor: orderColor.accent }}
            />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-4 pb-3">
        {cart.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Cart is empty</p>
            <p className="text-xs">Scan or search products</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[200px] sm:max-h-[280px] overflow-y-auto">
            {cart.map((item, index) => (
              <div 
                key={index} 
                className="flex items-center gap-2 p-2 rounded-lg border bg-background/80"
              >
                {/* Thumbnail - smaller on mobile */}
                <button
                  onClick={() => item.image && setPreviewImage({ src: item.image, title: item.title })}
                  className={`relative flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded overflow-hidden border ${item.image ? 'cursor-pointer' : 'cursor-default'}`}
                  disabled={!item.image}
                >
                  {item.image ? (
                    <img src={item.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </button>
                
                {/* Item info - compact layout */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs sm:text-sm truncate leading-tight">{item.title}</p>
                  <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                    <span>${item.price.toFixed(2)}</span>
                    {item.discount_value > 0 && (
                      <Badge variant="destructive" className="text-[8px] sm:text-[10px] px-1 py-0 h-4">
                        -{item.discount_value}{item.discount_type === "percentage" ? "%" : "$"}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Quantity + Price - stacked on mobile */}
                <div className="flex flex-col items-end gap-1">
                  {/* Quantity controls */}
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-6 w-6 sm:h-7 sm:w-7"
                      onClick={() => updateQuantity(index, -1)}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-5 sm:w-6 text-center font-medium text-xs sm:text-sm">{item.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-6 w-6 sm:h-7 sm:w-7"
                      onClick={() => updateQuantity(index, 1)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  {/* Total */}
                  <span className="font-semibold text-xs sm:text-sm">${getItemTotal(item).toFixed(2)}</span>
                </div>
                
                {/* Actions - discount & remove */}
                <div className="flex flex-col gap-0.5">
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
                        variant={item.discount_value > 0 ? "default" : "ghost"}
                        className="h-6 w-6 text-[10px]"
                        data-testid={`item-discount-${index}`}
                      >
                        %
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56" align="end">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Item Discount</Label>
                        <div className="flex gap-1">
                          <Select
                            value={tempDiscount.type}
                            onValueChange={(value) => setTempDiscount(prev => ({ ...prev, type: value }))}
                          >
                            <SelectTrigger className="w-16 h-8 text-xs">
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
                            className="flex-1 h-8 text-xs"
                          />
                        </div>
                        <Button 
                          size="sm" 
                          className="w-full h-7 text-xs"
                          onClick={() => handleApplyDiscount(index)}
                        >
                          Apply
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => removeFromCart(index)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
