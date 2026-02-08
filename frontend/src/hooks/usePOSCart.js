import { useState, useEffect, useCallback } from "react";

/**
 * Custom hook for managing POS cart state and operations
 */
export function usePOSCart(userId) {
  const STORAGE_KEY = `pos_order_${userId || 'guest'}`;
  
  const [cart, setCart] = useState([]);
  const [orderColor, setOrderColor] = useState(null);
  
  // Generate random pastel color for order
  const generateOrderColor = useCallback(() => {
    const hue = Math.floor(Math.random() * 360);
    return {
      hue,
      bg: `hsl(${hue}, 70%, 95%)`,
      bgDark: `hsl(${hue}, 40%, 15%)`,
      border: `hsl(${hue}, 60%, 80%)`,
      borderDark: `hsl(${hue}, 40%, 30%)`,
      accent: `hsl(${hue}, 70%, 50%)`
    };
  }, []);

  // Generate new color when cart goes from empty to having items
  useEffect(() => {
    if (cart.length > 0 && !orderColor) {
      setOrderColor(generateOrderColor());
    }
  }, [cart.length, orderColor, generateOrderColor]);

  // Calculate item total with discount
  const getItemTotal = useCallback((item) => {
    const lineTotal = item.price * item.quantity;
    if (!item.discount_type || item.discount_value <= 0) return lineTotal;
    
    if (item.discount_type === "percentage") {
      return lineTotal * (1 - item.discount_value / 100);
    }
    return Math.max(0, lineTotal - item.discount_value);
  }, []);

  // Add product to cart
  const addToCart = useCallback((product, variant = null) => {
    setCart(prevCart => {
      const existingIndex = prevCart.findIndex(item => 
        item.product_id === product.product_id && 
        (!variant || item.variant_id === variant?.variant_id)
      );

      if (existingIndex >= 0) {
        const newCart = [...prevCart];
        newCart[existingIndex].quantity += 1;
        return newCart;
      }
      
      const price = variant?.price || product.variants?.[0]?.price || product.price || 0;
      const sku = variant?.sku || product.variants?.[0]?.sku || product.sku || "";
      
      return [...prevCart, {
        product_id: product.product_id,
        variant_id: variant?.variant_id || product.variants?.[0]?.variant_id,
        sku: sku,
        title: variant ? `${product.title} - ${variant.title}` : product.title,
        quantity: 1,
        price: parseFloat(price),
        taxable: true,
        is_custom: false,
        image: product.images?.[0]?.src || null,
        discount_type: null,
        discount_value: 0
      }];
    });
  }, []);

  // Update cart item quantity
  const updateQuantity = useCallback((index, delta) => {
    setCart(prevCart => {
      const newCart = [...prevCart];
      newCart[index].quantity += delta;
      if (newCart[index].quantity <= 0) {
        newCart.splice(index, 1);
      }
      return newCart;
    });
  }, []);

  // Remove from cart
  const removeFromCart = useCallback((index) => {
    setCart(prevCart => {
      const newCart = [...prevCart];
      newCart.splice(index, 1);
      return newCart;
    });
  }, []);

  // Add custom item
  const addCustomItem = useCallback((customItem) => {
    if (!customItem.title || customItem.price <= 0) {
      return false;
    }
    
    setCart(prevCart => [...prevCart, {
      product_id: null,
      variant_id: null,
      sku: customItem.sku,
      title: customItem.title,
      quantity: customItem.quantity,
      price: parseFloat(customItem.price),
      taxable: customItem.taxable,
      is_custom: true,
      image: null,
      discount_type: null,
      discount_value: 0
    }]);
    
    return true;
  }, []);

  // Apply discount to item
  const applyItemDiscount = useCallback((index, discountType, discountValue) => {
    setCart(prevCart => {
      const newCart = [...prevCart];
      newCart[index].discount_type = discountValue > 0 ? discountType : null;
      newCart[index].discount_value = discountValue;
      return newCart;
    });
  }, []);

  // Clear cart
  const clearCart = useCallback(() => {
    setCart([]);
    setOrderColor(null);
  }, []);

  // Load cart from data (used when loading drafts)
  const loadCart = useCallback((items, color) => {
    setCart(items || []);
    setOrderColor(color || generateOrderColor());
  }, [generateOrderColor]);

  // Calculate subtotal
  const subtotal = cart.reduce((sum, item) => sum + getItemTotal(item), 0);

  return {
    cart,
    setCart,
    orderColor,
    setOrderColor,
    generateOrderColor,
    addToCart,
    updateQuantity,
    removeFromCart,
    addCustomItem,
    applyItemDiscount,
    clearCart,
    loadCart,
    getItemTotal,
    subtotal,
    STORAGE_KEY
  };
}
