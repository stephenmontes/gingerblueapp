import { ShoppingCart, Plus, Minus, Image as ImageIcon, X, Percent, Trash2 } from "lucide-react";
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
      data-testid="pos-cart"
    >
      <CardHeader className="py-2 sm:py-3 px-3 sm:px-4">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
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
      <CardContent className="px-2 sm:px-4 pb-2 sm:pb-3">
        {cart.length === 0 ? (
          <div className="text-center py-4 sm:py-6 text-muted-foreground">
            <ShoppingCart className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 opacity-50" />
            <p className="text-xs sm:text-sm">Cart is empty</p>
            <p className="text-[10px] sm:text-xs">Scan or search products</p>
          </div>
        ) : (
          /* 
           * Mobile: No max-height, let items flow naturally for full page scroll
           * Desktop (lg+): Use max-height with internal scroll
           */
          <div className="space-y-1.5 sm:space-y-2 lg:max-h-[400px] lg:overflow-y-auto">
            {cart.map((item, index) => (
              <div 
                key={index} 
                className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg border bg-background/80"
                data-testid={`cart-item-${index}`}
              >
                {/* Thumbnail - very compact on mobile */}
                <button
                  onClick={() => item.image && setPreviewImage({ src: item.image, title: item.title })}
                  className={`relative flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded overflow-hidden border ${item.image ? 'cursor-pointer' : 'cursor-default'}`}
                  disabled={!item.image}
                  data-testid={`cart-item-image-${index}`}
                >
                  {item.image ? (
                    <img src={item.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <ImageIcon className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
                    </div>
                  )}
                </button>
                
                {/* Item info - ultra compact on mobile */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[11px] sm:text-xs lg:text-sm truncate leading-tight">{item.title}</p>
                  <div className="flex items-center gap-1 text-[9px] sm:text-[10px] lg:text-xs text-muted-foreground">
                    <span>${item.price.toFixed(2)}</span>
                    {item.discount_value > 0 && (
                      <Badge variant="destructive" className="text-[7px] sm:text-[8px] lg:text-[10px] px-0.5 sm:px-1 py-0 h-3 sm:h-4">
                        -{item.discount_value}{item.discount_type === "percentage" ? "%" : "$"}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Quantity controls - inline on mobile */}
                <div className="flex items-center gap-0.5">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7"
                    onClick={() => updateQuantity(index, -1)}
                    data-testid={`cart-item-decrease-${index}`}
                  >
                    <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </Button>
                  <span className="w-4 sm:w-5 lg:w-6 text-center font-medium text-[10px] sm:text-xs lg:text-sm">{item.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7"
                    onClick={() => updateQuantity(index, 1)}
                    data-testid={`cart-item-increase-${index}`}
                  >
                    <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </Button>
                </div>
                
                {/* Total price */}
                <span className="font-semibold text-[10px] sm:text-xs lg:text-sm w-12 sm:w-14 lg:w-16 text-right" data-testid={`cart-item-total-${index}`}>
                  ${getItemTotal(item).toFixed(2)}
                </span>
                
                {/* Actions - compact inline */}
                <div className="flex items-center gap-0.5">
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
                        className="h-5 w-5 sm:h-6 sm:w-6"
                        data-testid={`item-discount-${index}`}
                      >
                        <Percent className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 sm:w-56" align="end">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Item Discount</Label>
                        <div className="flex gap-1">
                          <Select
                            value={tempDiscount.type}
                            onValueChange={(value) => setTempDiscount(prev => ({ ...prev, type: value }))}
                          >
                            <SelectTrigger className="w-14 sm:w-16 h-8 text-xs">
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
                    className="h-5 w-5 sm:h-6 sm:w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeFromCart(index)}
                    data-testid={`cart-item-remove-${index}`}
                  >
                    <Trash2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
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
