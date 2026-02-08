import { useState, useEffect, useRef, useCallback } from "react";
import { API } from "@/utils/api";
import { toast } from "sonner";
import { 
  ShoppingCart, Store, Printer, Save, FileDown, Mail, FolderOpen,
  X, Check, Loader2, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Custom hooks
import { usePOSCart } from "@/hooks/usePOSCart";
import { usePOSProducts } from "@/hooks/usePOSProducts";
import { usePOSCustomers } from "@/hooks/usePOSCustomers";
import { usePOSDrafts } from "@/hooks/usePOSDrafts";

// Components
import { POSCart } from "./POS/POSCart";
import { POSProductSearch } from "./POS/POSProductSearch";
import { POSOrderSummary } from "./POS/POSOrderSummary";
import { 
  CustomerDialog, 
  CustomItemDialog, 
  DraftsDialog, 
  PrintReceiptDialog, 
  EmailDialog,
  ImagePreviewDialog 
} from "./POS/POSDialogs";

export default function POS({ user }) {
  // Stores
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [loadingStores, setLoadingStores] = useState(true);
  const [nextOrderNumber, setNextOrderNumber] = useState("");

  // Refs
  const barcodeInputRef = useRef(null);
  const printRef = useRef(null);

  // Use custom hooks
  const {
    cart,
    setCart,
    orderColor,
    setOrderColor,
    generateOrderColor,
    addToCart,
    updateQuantity,
    removeFromCart,
    addCustomItem: addCustomItemToCart,
    applyItemDiscount,
    clearCart,
    loadCart,
    getItemTotal,
    subtotal,
    STORAGE_KEY
  } = usePOSCart(user?.user_id);

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searching,
    storeProductCount,
    searchProducts,
    clearSearch
  } = usePOSProducts(selectedStore);

  const {
    customer,
    setCustomer,
    customerSearch,
    setCustomerSearch,
    customerResults,
    searchingCustomers,
    newCustomerMode,
    setNewCustomerMode,
    newCustomer,
    setNewCustomer,
    searchCustomers,
    createCustomer,
    selectCustomer,
    clearCustomer,
    resetCustomerSearch
  } = usePOSCustomers(selectedStore);

  // Order state
  const [taxExempt, setTaxExempt] = useState(false);
  const [shipAllItems, setShipAllItems] = useState(true);
  const [shipping, setShipping] = useState({ title: "Standard Shipping", price: 0, code: "standard" });
  const [shippingPercent, setShippingPercent] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [orderTags, setOrderTags] = useState("");
  const [requestedShipDate, setRequestedShipDate] = useState("");
  const [orderDiscount, setOrderDiscount] = useState({ type: "percentage", value: 0, reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Discount dialog state
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [tempDiscount, setTempDiscount] = useState({ type: "percentage", value: 0 });

  // UI state
  const [previewImage, setPreviewImage] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customItemDialogOpen, setCustomItemDialogOpen] = useState(false);
  const [draftsDialogOpen, setDraftsDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  // Custom item state
  const [customItem, setCustomItem] = useState({
    title: "", sku: "", price: 0, quantity: 1, taxable: true
  });

  // Email state
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Draft management hook
  const {
    currentDraftId,
    setCurrentDraftId,
    lastAutoSave,
    autoSaving,
    drafts,
    loadingDrafts,
    draftsFilter,
    setDraftsFilter,
    draftsSearch,
    setDraftsSearch,
    filteredDrafts,
    fetchDrafts,
    loadDraft,
    deleteDraft,
    releaseDraft,
    clearPersistedOrder
  } = usePOSDrafts({
    user,
    selectedStore,
    cart,
    customer,
    taxExempt,
    shipAllItems,
    shipping,
    orderNote,
    orderTags,
    orderDiscount,
    requestedShipDate,
    orderColor,
    STORAGE_KEY,
    loadCart,
    setCustomer,
    setSelectedStore,
    setTaxExempt,
    setShipAllItems,
    setShipping,
    setOrderNote,
    setOrderTags,
    setOrderDiscount,
    setRequestedShipDate,
    generateOrderColor
  });

  // Load persisted order from localStorage on mount
  useEffect(() => {
    const loadPersistedOrder = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const data = JSON.parse(saved);
          if (data.cart && data.cart.length > 0) {
            loadCart(data.cart, data.orderColor);
            setCustomer(data.customer || null);
            setSelectedStore(data.selectedStore || "");
            setTaxExempt(data.taxExempt || false);
            setShipAllItems(data.shipAllItems !== false);
            setShipping(data.shipping || { title: "Standard Shipping", price: 0, code: "standard" });
            setShippingPercent(data.shippingPercent || "");
            setOrderDiscount(data.orderDiscount || { type: "percentage", value: 0, reason: "" });
            setOrderNote(data.orderNote || "");
            setOrderTags(data.orderTags || "");
            setCurrentDraftId(data.currentDraftId || null);
            setRequestedShipDate(data.requestedShipDate || "");
            toast.info(`Restored ${data.cart.length} item(s) from previous session`);
          }
        }
      } catch (err) {
        console.error("Failed to load persisted order:", err);
      }
    };
    loadPersistedOrder();
  }, [STORAGE_KEY, loadCart, setCustomer, setCurrentDraftId]);

  // Save to localStorage whenever cart or order details change
  useEffect(() => {
    if (cart.length > 0 || customer || orderNote) {
      const orderData = {
        cart,
        customer,
        selectedStore,
        taxExempt,
        shipAllItems,
        shipping,
        shippingPercent,
        orderDiscount,
        orderNote,
        orderTags,
        requestedShipDate,
        currentDraftId,
        orderColor,
        savedAt: new Date().toISOString(),
        savedBy: user?.name || 'Unknown'
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orderData));
    }
  }, [cart, customer, selectedStore, taxExempt, shipAllItems, shipping, shippingPercent, orderDiscount, orderNote, orderTags, requestedShipDate, currentDraftId, orderColor, STORAGE_KEY, user]);

  // Fetch stores on mount
  useEffect(() => {
    fetchStores();
    fetchNextOrderNumber();
  }, []);

  const fetchStores = async () => {
    try {
      const res = await fetch(`${API}/pos/stores`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores);
        if (data.stores.length === 1 && !selectedStore) {
          setSelectedStore(data.stores[0].store_id);
        }
      }
    } catch (err) {
      toast.error("Failed to load stores");
    } finally {
      setLoadingStores(false);
    }
  };

  const fetchNextOrderNumber = async () => {
    try {
      const res = await fetch(`${API}/pos/next-order-number`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNextOrderNumber(data.next_order_number);
      }
    } catch (err) {
      console.error("Failed to fetch next order number");
    }
  };

  // Handle barcode scan (Enter key)
  const handleBarcodeKeyDown = async (e) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      e.preventDefault();
      const result = await searchProducts(searchQuery, true);
      if (result.autoAdded && result.product) {
        addToCart(result.product);
        clearSearch();
        toast.success(`Added: ${result.product.title}`);
      }
    }
  };

  // Handle adding product to cart
  const handleAddToCart = (product, variant = null) => {
    addToCart(product, variant);
    clearSearch();
  };

  // Handle adding custom item
  const handleAddCustomItem = () => {
    if (addCustomItemToCart(customItem)) {
      setCustomItem({ title: "", sku: "", price: 0, quantity: 1, taxable: true });
      setCustomItemDialogOpen(false);
      toast.success("Custom item added");
    } else {
      toast.error("Please enter title and price");
    }
  };

  // Calculate totals with discounts
  const orderDiscountAmount = orderDiscount.value > 0 
    ? (orderDiscount.type === "percentage" 
        ? subtotal * (orderDiscount.value / 100) 
        : Math.min(orderDiscount.value, subtotal))
    : 0;
  const subtotalAfterDiscount = subtotal - orderDiscountAmount;
  const shippingTotal = shipAllItems ? shipping.price : 0;
  const total = subtotalAfterDiscount + shippingTotal;

  // Update shipping price when percentage or subtotal changes
  useEffect(() => {
    if (shippingPercent && shippingPercent !== "custom") {
      const percent = parseFloat(shippingPercent);
      const calculatedPrice = (subtotalAfterDiscount * percent) / 100;
      setShipping(prev => ({
        ...prev,
        price: Math.round(calculatedPrice * 100) / 100,
        title: percent === 0 ? "Free Shipping" : `Shipping (${percent}%)`
      }));
    }
  }, [shippingPercent, subtotalAfterDiscount]);

  // Submit order (live or draft)
  const submitOrder = async (isDraft = false) => {
    if (!selectedStore) {
      toast.error("Please select a store");
      return;
    }
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    if (isDraft) {
      setSavingDraft(true);
    } else {
      setSubmitting(true);
    }
    
    try {
      const createdByNote = `[Created by ${user?.name || 'Unknown'} on ${new Date().toLocaleString()}]`;
      const fullNote = orderNote ? `${orderNote}\n${createdByNote}` : createdByNote;
      
      // Delete existing auto-saved draft if creating final order
      if (!isDraft && currentDraftId) {
        try {
          await fetch(`${API}/pos/drafts/${currentDraftId}`, {
            method: "DELETE",
            credentials: "include"
          });
        } catch (e) {
          console.log("Could not delete previous draft:", e);
        }
      }
      
      const orderData = {
        store_id: selectedStore,
        customer_id: customer?.customer_id || null,
        customer: customer ? null : (newCustomer.first_name ? newCustomer : null),
        line_items: cart.map(item => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          sku: item.sku,
          title: item.title,
          quantity: item.quantity,
          price: item.price,
          taxable: item.taxable,
          is_custom: item.is_custom,
          image: item.image,
          discount_type: item.discount_type,
          discount_value: item.discount_value || 0
        })),
        shipping: shipAllItems ? shipping : null,
        ship_all_items: shipAllItems,
        tax_exempt: taxExempt,
        note: fullNote,
        tags: orderTags.split(",").map(t => t.trim()).filter(Boolean),
        financial_status: "pending",
        order_discount: orderDiscount.value > 0 ? orderDiscount : null,
        is_draft: isDraft,
        requested_ship_date: requestedShipDate || null,
        order_color: orderColor
      };

      const res = await fetch(`${API}/pos/orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData)
      });

      if (res.ok) {
        const data = await res.json();
        
        if (isDraft) {
          setCurrentDraftId(data.order?.order_id);
          toast.success(
            <div>
              <p className="font-semibold">Draft Saved!</p>
              <p className="text-sm">Order: {data.pos_order_number}</p>
            </div>,
            { duration: 3000 }
          );
        } else {
          // Save order details for printing
          const selectedStoreName = stores.find(s => s.store_id === selectedStore)?.name || "";
          setLastOrder({
            pos_order_number: data.pos_order_number,
            shopify_order_number: data.shopify_order_number,
            store_name: selectedStoreName,
            customer: customer,
            items: cart,
            subtotal: subtotal,
            order_discount: orderDiscount,
            order_discount_amount: orderDiscountAmount,
            shipping: shipAllItems ? shipping : null,
            tax_exempt: taxExempt,
            total: total,
            note: orderNote,
            created_at: new Date().toLocaleString(),
            created_by: user?.name || "Staff"
          });
          
          toast.success(
            <div>
              <p className="font-semibold">Order Created!</p>
              <p className="text-sm">POS: {data.pos_order_number}</p>
              <p className="text-sm">Shopify: #{data.shopify_order_number}</p>
            </div>,
            { duration: 5000 }
          );
          
          setPrintDialogOpen(true);
        }
        
        // Reset form
        clearCart();
        setCustomer(null);
        setTaxExempt(false);
        setOrderNote("");
        setOrderTags("");
        setOrderDiscount({ type: "percentage", value: 0, reason: "" });
        setShippingPercent("");
        setRequestedShipDate("");
        
        // Clear persisted order from localStorage
        clearPersistedOrder();
        
        // Refresh next order number
        fetchNextOrderNumber();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to create order");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to create order");
    } finally {
      setSubmitting(false);
      setSavingDraft(false);
    }
  };

  // Clear current order (with confirmation)
  const clearCurrentOrder = () => {
    if (cart.length === 0) return;
    
    if (window.confirm("Are you sure you want to clear the current order? This will remove all items and unsaved changes.")) {
      clearCart();
      setCustomer(null);
      setTaxExempt(false);
      setOrderNote("");
      setOrderTags("");
      setOrderDiscount({ type: "percentage", value: 0, reason: "" });
      setShippingPercent("");
      setRequestedShipDate("");
      clearPersistedOrder();
      toast.success("Order cleared");
    }
  };

  // Print order receipt
  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow pop-ups to print receipts");
      return;
    }
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Order Receipt - ${lastOrder?.pos_order_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              padding: 20px; 
              max-width: 350px; 
              margin: 0 auto;
              font-size: 12px;
            }
            .header { text-align: center; margin-bottom: 15px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
            .header h1 { font-size: 18px; margin-bottom: 5px; }
            .header p { font-size: 11px; color: #666; }
            .order-info { margin-bottom: 15px; }
            .order-info p { margin: 3px 0; }
            .order-number { font-size: 16px; font-weight: bold; }
            .items { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 10px 0; margin: 10px 0; }
            .item { display: flex; align-items: flex-start; gap: 8px; margin: 8px 0; padding-bottom: 8px; border-bottom: 1px dotted #ddd; }
            .item:last-child { border-bottom: none; padding-bottom: 0; }
            .item-image { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
            .item-details { flex: 1; min-width: 0; }
            .item-name { font-weight: bold; font-size: 11px; word-wrap: break-word; }
            .item-sku { font-size: 10px; color: #666; }
            .item-meta { display: flex; justify-content: space-between; margin-top: 3px; }
            .totals { margin-top: 10px; }
            .total-row { display: flex; justify-content: space-between; margin: 3px 0; }
            .total-row.grand { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px; }
            .customer { margin: 10px 0; padding: 10px 0; border-top: 1px dashed #000; }
            .footer { text-align: center; margin-top: 15px; font-size: 10px; color: #666; }
            .note { margin-top: 10px; padding: 5px; background: #f5f5f5; font-size: 11px; }
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
            .btn-print {
              background: #2563eb;
              color: white;
            }
            .btn-print:hover {
              background: #1d4ed8;
            }
            .btn-close {
              background: #e5e7eb;
              color: #374151;
            }
            .btn-close:hover {
              background: #d1d5db;
            }
            @media print { 
              body { padding: 0; }
              .print-actions { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-actions">
            <button class="btn-print" id="printBtn">Print</button>
            <button class="btn-close" id="closeBtn">Close</button>
          </div>
          ${printContent.innerHTML}
          <script>
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
    printWindow.focus();
  };

  // Print current cart as quote/draft
  const printQuote = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    const storeData = stores.find(s => s.store_id === selectedStore);
    const storeName = storeData?.name || "Store";
    const quoteDate = new Date().toLocaleDateString();
    const quoteNumber = currentDraftId ? `Draft-${nextOrderNumber}` : `Quote-${Date.now().toString(36).toUpperCase()}`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow pop-ups to print quotes");
      return;
    }
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Quote - ${quoteNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #333; }
            .header .logo { max-height: 80px; max-width: 250px; margin-bottom: 10px; object-fit: contain; }
            .header h1 { font-size: 28px; margin-bottom: 5px; }
            .header .phone { font-size: 16px; color: #333; margin: 5px 0; font-weight: 500; }
            .header .store-email { font-size: 14px; color: #666; margin: 3px 0; }
            .header .store-address { font-size: 13px; color: #666; margin: 3px 0; }
            .header .quote-type { font-size: 18px; color: #666; text-transform: uppercase; letter-spacing: 2px; margin-top: 10px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .info-box { flex: 1; }
            .info-box h3 { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
            .info-box p { font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #f5f5f5; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #333; }
            td { padding: 12px; border-bottom: 1px solid #ddd; vertical-align: top; }
            .item-image { width: 50px; height: 50px; object-fit: cover; border-radius: 4px; }
            .item-title { font-weight: 600; }
            .item-sku { font-size: 12px; color: #666; }
            .text-right { text-align: right; }
            .totals { margin-top: 20px; margin-left: auto; width: 300px; }
            .totals .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            .totals .row.grand { font-weight: bold; font-size: 18px; border-bottom: 2px solid #333; border-top: 2px solid #333; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px; }
            .terms { margin-top: 30px; padding: 15px; background: #f9f9f9; border-radius: 4px; font-size: 12px; }
            .terms h4 { margin-bottom: 10px; }
            .discount { color: #dc2626; }
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
            .btn-print {
              background: #2563eb;
              color: white;
            }
            .btn-print:hover {
              background: #1d4ed8;
            }
            .btn-close {
              background: #e5e7eb;
              color: #374151;
            }
            .btn-close:hover {
              background: #d1d5db;
            }
            @media print { 
              body { padding: 20px; }
              .print-actions { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-actions">
            <button class="btn-print" id="printBtn">Print</button>
            <button class="btn-close" id="closeBtn">Close</button>
          </div>
          
          <div class="header">
            ${storeData?.logo ? `<img src="${storeData.logo}" alt="${storeName}" class="logo" />` : `<h1>${storeName}</h1>`}
            ${storeData?.phone ? `<p class="phone">${storeData.phone}</p>` : ''}
            ${storeData?.email ? `<p class="store-email">${storeData.email}</p>` : ''}
            ${storeData?.address ? `<p class="store-address">${storeData.address}</p>` : ''}
            <div class="quote-type">${currentDraftId ? 'Draft Order' : 'Quote'}</div>
          </div>
          
          <div class="info-row">
            <div class="info-box">
              <h3>Quote Number</h3>
              <p><strong>${quoteNumber}</strong></p>
            </div>
            <div class="info-box">
              <h3>Date</h3>
              <p>${quoteDate}</p>
            </div>
            <div class="info-box">
              <h3>Valid Until</h3>
              <p>${new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString()}</p>
            </div>
          </div>
          
          ${customer ? `
          <div class="info-row">
            <div class="info-box">
              <h3>Customer</h3>
              <p><strong>${customer.name}</strong></p>
              ${customer.email ? `<p>${customer.email}</p>` : ''}
              ${customer.phone ? `<p>${customer.phone}</p>` : ''}
              ${customer.company ? `<p>${customer.company}</p>` : ''}
            </div>
          </div>
          ` : ''}
          
          <table>
            <thead>
              <tr>
                <th style="width: 60px;"></th>
                <th>Item</th>
                <th class="text-right" style="width: 80px;">Price</th>
                <th class="text-right" style="width: 60px;">Qty</th>
                <th class="text-right" style="width: 100px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${cart.map(item => {
                const lineTotal = item.price * item.quantity;
                const discountAmt = item.discount_type && item.discount_value > 0 
                  ? (item.discount_type === 'percentage' ? lineTotal * item.discount_value / 100 : item.discount_value)
                  : 0;
                const finalTotal = lineTotal - discountAmt;
                return `
                <tr>
                  <td>${item.image ? `<img src="${item.image}" class="item-image" />` : ''}</td>
                  <td>
                    <div class="item-title">${item.title}</div>
                    ${item.sku ? `<div class="item-sku">SKU: ${item.sku}</div>` : ''}
                    ${discountAmt > 0 ? `<div class="item-sku discount">Discount: -$${discountAmt.toFixed(2)}</div>` : ''}
                  </td>
                  <td class="text-right">$${item.price.toFixed(2)}</td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">$${finalTotal.toFixed(2)}</td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
          
          <div class="totals">
            <div class="row">
              <span>Subtotal</span>
              <span>$${(subtotal + orderDiscountAmount).toFixed(2)}</span>
            </div>
            ${orderDiscountAmount > 0 ? `
            <div class="row discount">
              <span>Discount</span>
              <span>-$${orderDiscountAmount.toFixed(2)}</span>
            </div>
            ` : ''}
            ${shipAllItems && shipping.price > 0 ? `
            <div class="row">
              <span>Shipping</span>
              <span>$${shipping.price.toFixed(2)}</span>
            </div>
            ` : ''}
            ${taxExempt ? `
            <div class="row">
              <span>Tax</span>
              <span>Exempt</span>
            </div>
            ` : ''}
            <div class="row grand">
              <span>Total</span>
              <span>$${total.toFixed(2)}</span>
            </div>
          </div>
          
          ${requestedShipDate ? `
          <div class="terms">
            <h4>Requested Ship Date</h4>
            <p>${new Date(requestedShipDate).toLocaleDateString()}</p>
          </div>
          ` : ''}
          
          ${orderNote ? `
          <div class="terms">
            <h4>Notes</h4>
            <p>${orderNote}</p>
          </div>
          ` : ''}
          
          <div class="terms">
            <h4>Terms & Conditions</h4>
            <p>This quote is valid for 30 days from the date of issue. Prices are subject to change without notice.</p>
          </div>
          
          <div class="footer">
            <p>Generated by ${user?.name || 'Staff'} on ${new Date().toLocaleString()}</p>
            <p>Thank you for your business!</p>
          </div>
          <script>
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
    printWindow.focus();
  };

  // Open email dialog
  const openEmailDialog = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    
    setEmailTo(customer?.email || "");
    setEmailSubject(`Quote from ${stores.find(s => s.store_id === selectedStore)?.name || 'Store'}`);
    setEmailMessage(`Dear ${customer?.name || 'Customer'},\n\nPlease find attached your quote for ${cart.length} item(s) totaling $${total.toFixed(2)}.\n\nThank you for your business!\n\nBest regards,\n${user?.name || 'Staff'}`);
    setEmailDialogOpen(true);
  };

  // Send email
  const sendEmail = async () => {
    if (!emailTo) {
      toast.error("Please enter an email address");
      return;
    }
    
    setSendingEmail(true);
    try {
      const res = await fetch(`${API}/pos/send-quote-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          message: emailMessage,
          store_id: selectedStore,
          customer_name: customer?.name,
          items: cart.map(item => ({
            title: item.title,
            sku: item.sku,
            quantity: item.quantity,
            price: item.price,
            discount_type: item.discount_type,
            discount_value: item.discount_value
          })),
          subtotal: subtotal,
          order_discount: orderDiscount,
          shipping: shipAllItems ? shipping : null,
          tax_exempt: taxExempt,
          total: total,
          requested_ship_date: requestedShipDate,
          note: orderNote
        })
      });
      
      if (res.ok) {
        toast.success(`Quote sent to ${emailTo}`);
        setEmailDialogOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to send email");
      }
    } catch (err) {
      toast.error("Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  // Customer dialog handlers with debounced search
  useEffect(() => {
    if (!customerDialogOpen) return;
    const timer = setTimeout(() => {
      if (customerSearch.length >= 2) {
        searchCustomers(customerSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, customerDialogOpen, searchCustomers]);

  // Mobile order summary panel state
  const [mobileOrderOpen, setMobileOrderOpen] = useState(false);

  return (
    <div 
      className="min-h-screen p-2 sm:p-4 lg:p-6 pb-32 lg:pb-6 transition-colors duration-300"
      style={orderColor && cart.length > 0 ? {
        backgroundColor: `var(--order-bg, ${orderColor.bg})`,
        '--order-bg-dark': orderColor.bgDark
      } : undefined}
    >
      {/* Order color indicator bar */}
      {orderColor && cart.length > 0 && (
        <div 
          className="fixed top-0 left-0 right-0 h-1 z-50"
          style={{ backgroundColor: orderColor.accent }}
        />
      )}
      
      {/* Header - Optimized for iPhone */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6">
        {/* Left: Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div 
            className="p-1.5 sm:p-2 rounded-lg flex-shrink-0"
            style={orderColor && cart.length > 0 ? { backgroundColor: `${orderColor.accent}20` } : undefined}
          >
            <ShoppingCart 
              className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" 
              style={orderColor && cart.length > 0 ? { color: orderColor.accent } : undefined}
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl md:text-2xl font-bold truncate">POS</h1>
            <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground hidden sm:block truncate">
              {currentDraftId ? `Editing Draft` : 'Shopify sync'}
            </p>
          </div>
        </div>
        
        {/* Right: Actions - Compact on mobile */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
          {/* Next Order Number - Desktop only */}
          {nextOrderNumber && (
            <div className="text-right hidden md:block">
              <p className="text-xs text-muted-foreground">Next Order</p>
              <p className="font-mono font-bold text-primary text-sm md:text-base" data-testid="next-order-number">{nextOrderNumber}</p>
            </div>
          )}
          
          {/* Mobile: Show order number badge */}
          {nextOrderNumber && (
            <Badge variant="outline" className="font-mono text-[10px] sm:hidden" data-testid="next-order-number-mobile">
              {nextOrderNumber}
            </Badge>
          )}
          
          {/* Quote/Email buttons - Always visible when cart has items */}
          {cart.length > 0 && (
            <>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={printQuote} 
                data-testid="print-quote-btn" 
                className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950"
              >
                <FileDown className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Quote</span>
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={openEmailDialog} 
                data-testid="email-quote-btn" 
                className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700 dark:border-green-400 dark:text-green-400 dark:hover:bg-green-950"
              >
                <Mail className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Email</span>
              </Button>
            </>
          )}
          
          {/* Drafts button - Always visible */}
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => {
              setDraftsDialogOpen(true);
              fetchDrafts();
            }}
            data-testid="view-drafts-btn"
            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-400 dark:text-amber-400 dark:hover:bg-amber-950"
          >
            <FolderOpen className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Drafts</span>
          </Button>
          
          {/* Reprint button - Visible when last order exists */}
          {lastOrder && (
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setPrintDialogOpen(true)}
              data-testid="reprint-last-order"
              className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 border-purple-500 text-purple-600 hover:bg-purple-50 hover:text-purple-700 dark:border-purple-400 dark:text-purple-400 dark:hover:bg-purple-950"
            >
              <Printer className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Reprint</span>
            </Button>
          )}
          
          {/* Store Selector - Responsive width */}
          <Select value={selectedStore} onValueChange={setSelectedStore}>
            <SelectTrigger className="w-[100px] sm:w-[140px] md:w-[200px] h-8 sm:h-9 text-xs sm:text-sm" data-testid="store-selector">
              <Store className="w-3 h-3 sm:w-4 sm:h-4 mr-1 text-muted-foreground flex-shrink-0" />
              <SelectValue placeholder="Store" />
            </SelectTrigger>
            <SelectContent>
              {stores.map(store => (
                <SelectItem key={store.store_id} value={store.store_id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Auto-save indicator and Clear button */}
      {(cart.length > 0 || lastAutoSave) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 mb-4">
          <div className="flex items-center gap-2">
            {autoSaving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Auto-saving...</span>
              </>
            ) : lastAutoSave ? (
              <>
                <Check className="w-3 h-3 text-green-500" />
                <span className="hidden xs:inline">Auto-saved {lastAutoSave.toLocaleTimeString()}</span>
                <span className="xs:hidden">Saved</span>
              </>
            ) : cart.length > 0 ? (
              <span className="hidden xs:inline">{cart.length} item(s) in cart • Will auto-save in 1 min</span>
            ) : null}
            {currentDraftId && (
              <Badge variant="outline" className="text-[10px]">Draft</Badge>
            )}
          </div>
          {cart.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-destructive hover:text-destructive"
              onClick={clearCurrentOrder}
              data-testid="clear-order-btn"
            >
              <X className="w-3 h-3 mr-1" />
              <span className="hidden xs:inline">Clear</span>
            </Button>
          )}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
        {/* Left: Product Search & Cart */}
        <div className="lg:col-span-2 space-y-3 sm:space-y-4 order-1">
          <POSProductSearch
            selectedStore={selectedStore}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchResults={searchResults}
            searching={searching}
            storeProductCount={storeProductCount}
            barcodeInputRef={barcodeInputRef}
            onBarcodeKeyDown={handleBarcodeKeyDown}
            onAddToCart={handleAddToCart}
            onOpenCustomItem={() => setCustomItemDialogOpen(true)}
          />

          <POSCart
            cart={cart}
            orderColor={orderColor}
            updateQuantity={updateQuantity}
            getItemTotal={getItemTotal}
            setPreviewImage={setPreviewImage}
            applyItemDiscount={applyItemDiscount}
          />
        </div>

        {/* Right: Order Summary - Hidden on mobile, shown via floating panel */}
        <div className="hidden lg:block">
          <POSOrderSummary
            cart={cart}
            customer={customer}
            onOpenCustomerDialog={() => setCustomerDialogOpen(true)}
            onClearCustomer={clearCustomer}
            taxExempt={taxExempt}
            setTaxExempt={setTaxExempt}
            shipAllItems={shipAllItems}
            setShipAllItems={setShipAllItems}
            shipping={shipping}
            setShipping={setShipping}
            shippingPercent={shippingPercent}
            setShippingPercent={setShippingPercent}
            orderDiscount={orderDiscount}
            setOrderDiscount={setOrderDiscount}
            discountDialogOpen={discountDialogOpen}
            setDiscountDialogOpen={setDiscountDialogOpen}
            tempDiscount={tempDiscount}
            setTempDiscount={setTempDiscount}
            orderNote={orderNote}
            setOrderNote={setOrderNote}
            orderTags={orderTags}
            setOrderTags={setOrderTags}
            requestedShipDate={requestedShipDate}
            setRequestedShipDate={setRequestedShipDate}
            subtotal={subtotal}
            orderDiscountAmount={orderDiscountAmount}
            subtotalAfterDiscount={subtotalAfterDiscount}
            shippingTotal={shippingTotal}
            total={total}
            submitting={submitting}
            savingDraft={savingDraft}
            onSubmitOrder={submitOrder}
            onSubmitDraft={submitOrder}
          />
        </div>
      </div>

      {/* Mobile Floating Action Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border p-2 sm:p-3 z-40 shadow-lg safe-area-pb">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Total & Customer Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {customer ? (
                <span className="text-xs text-muted-foreground truncate">{customer.name}</span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setCustomerDialogOpen(true)}
                >
                  + Customer
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">${total.toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">({cart.length} items)</span>
            </div>
          </div>
          
          {/* Right: Action Buttons */}
          <div className="flex gap-1.5 sm:gap-2">
            {/* More Options Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-10 px-2 sm:px-3"
              onClick={() => setMobileOrderOpen(true)}
            >
              <Settings className="w-4 h-4" />
            </Button>
            
            {/* Save Draft */}
            <Button
              variant="outline"
              size="sm"
              className="h-10 px-2 sm:px-3"
              onClick={() => submitOrder(true)}
              disabled={cart.length === 0 || savingDraft}
              data-testid="mobile-save-draft-btn"
            >
              {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </Button>
            
            {/* Create Order */}
            <Button
              size="sm"
              className="h-10 px-3 sm:px-4"
              onClick={() => submitOrder(false)}
              disabled={cart.length === 0 || submitting}
              data-testid="mobile-create-order-btn"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  <span className="hidden xs:inline">Order</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Order Options Sheet */}
      <Dialog open={mobileOrderOpen} onOpenChange={setMobileOrderOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Options</DialogTitle>
          </DialogHeader>
          <POSOrderSummary
            cart={cart}
            customer={customer}
            onOpenCustomerDialog={() => {
              setMobileOrderOpen(false);
              setCustomerDialogOpen(true);
            }}
            onClearCustomer={clearCustomer}
            taxExempt={taxExempt}
            setTaxExempt={setTaxExempt}
            shipAllItems={shipAllItems}
            setShipAllItems={setShipAllItems}
            shipping={shipping}
            setShipping={setShipping}
            shippingPercent={shippingPercent}
            setShippingPercent={setShippingPercent}
            orderDiscount={orderDiscount}
            setOrderDiscount={setOrderDiscount}
            discountDialogOpen={discountDialogOpen}
            setDiscountDialogOpen={setDiscountDialogOpen}
            tempDiscount={tempDiscount}
            setTempDiscount={setTempDiscount}
            orderNote={orderNote}
            setOrderNote={setOrderNote}
            orderTags={orderTags}
            setOrderTags={setOrderTags}
            requestedShipDate={requestedShipDate}
            setRequestedShipDate={setRequestedShipDate}
            subtotal={subtotal}
            orderDiscountAmount={orderDiscountAmount}
            subtotalAfterDiscount={subtotalAfterDiscount}
            shippingTotal={shippingTotal}
            total={total}
            submitting={submitting}
            savingDraft={savingDraft}
            onSubmitOrder={(isDraft) => {
              setMobileOrderOpen(false);
              submitOrder(isDraft);
            }}
            onSubmitDraft={(isDraft) => {
              setMobileOrderOpen(false);
              submitOrder(isDraft);
            }}
            isMobile={true}
          />
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <CustomerDialog
        open={customerDialogOpen}
        onOpenChange={(open) => {
          setCustomerDialogOpen(open);
          if (!open) resetCustomerSearch();
        }}
        selectedStore={selectedStore}
        customerSearch={customerSearch}
        setCustomerSearch={setCustomerSearch}
        customerResults={customerResults}
        searchingCustomers={searchingCustomers}
        onSearchCustomers={searchCustomers}
        onSelectCustomer={selectCustomer}
        setTaxExempt={setTaxExempt}
        newCustomerMode={newCustomerMode}
        setNewCustomerMode={setNewCustomerMode}
        newCustomer={newCustomer}
        setNewCustomer={setNewCustomer}
        onCreateCustomer={(onSuccess) => createCustomer(onSuccess)}
      />

      <CustomItemDialog
        open={customItemDialogOpen}
        onOpenChange={setCustomItemDialogOpen}
        customItem={customItem}
        setCustomItem={setCustomItem}
        onAddCustomItem={handleAddCustomItem}
      />

      <DraftsDialog
        open={draftsDialogOpen}
        onOpenChange={setDraftsDialogOpen}
        drafts={drafts}
        filteredDrafts={filteredDrafts}
        loadingDrafts={loadingDrafts}
        draftsFilter={draftsFilter}
        setDraftsFilter={setDraftsFilter}
        draftsSearch={draftsSearch}
        setDraftsSearch={setDraftsSearch}
        onLoadDraft={(draft) => {
          loadDraft(draft, window.confirm);
          setDraftsDialogOpen(false);
        }}
        onDeleteDraft={deleteDraft}
        onReleaseDraft={releaseDraft}
      />

      <PrintReceiptDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        lastOrder={lastOrder}
        printRef={printRef}
        onPrint={handlePrint}
      />

      <EmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        emailTo={emailTo}
        setEmailTo={setEmailTo}
        emailSubject={emailSubject}
        setEmailSubject={setEmailSubject}
        emailMessage={emailMessage}
        setEmailMessage={setEmailMessage}
        sendingEmail={sendingEmail}
        onSendEmail={sendEmail}
      />

      <ImagePreviewDialog
        open={!!previewImage}
        onOpenChange={(open) => !open && setPreviewImage(null)}
        image={previewImage}
      />
    </div>
  );
}
