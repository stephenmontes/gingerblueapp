import { useState, useEffect, useRef, useCallback } from "react";
import { API } from "@/utils/api";
import { toast } from "sonner";
import { 
  ShoppingCart, Search, Barcode, User, Plus, Minus, Trash2, 
  Package, Store, DollarSign, Truck, Tag, X, Check, Loader2,
  ScanLine, UserPlus, RefreshCw, Printer, Percent, Save, FileText,
  Image as ImageIcon, ZoomIn, FolderOpen, Lock, Unlock, Clock, Users,
  Mail, FileDown
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Textarea } from "../components/ui/textarea";

export default function POS({ user }) {
  // Local storage key for this user
  const STORAGE_KEY = `pos_order_${user?.user_id || 'guest'}`;
  
  // Store selection
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [loadingStores, setLoadingStores] = useState(true);

  // Next order number preview
  const [nextOrderNumber, setNextOrderNumber] = useState("");

  // Product search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [storeProductCount, setStoreProductCount] = useState(null);
  const barcodeInputRef = useRef(null);

  // Cart
  const [cart, setCart] = useState([]);
  const [taxExempt, setTaxExempt] = useState(false);
  const [shipAllItems, setShipAllItems] = useState(true);

  // Customer
  const [customer, setCustomer] = useState(null);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    company: "", address1: "", address2: "", city: "",
    state: "", zip: "", country: "US", tax_exempt: false, note: ""
  });

  // Custom item
  const [customItemDialogOpen, setCustomItemDialogOpen] = useState(false);
  const [customItem, setCustomItem] = useState({
    title: "", sku: "", price: 0, quantity: 1, taxable: true
  });

  // Shipping
  const [shipping, setShipping] = useState({ title: "Standard Shipping", price: 0, code: "standard" });
  const [shippingPercent, setShippingPercent] = useState("");

  // Shipping percentage presets
  const shippingPresets = [
    { label: "30% of order total", value: "30" },
    { label: "25% of order total", value: "25" },
    { label: "20% of order total", value: "20" },
    { label: "18% of order total", value: "18" },
    { label: "15% of order total", value: "15" },
    { label: "12% of order total", value: "12" },
    { label: "10% of order total", value: "10" },
    { label: "Free Shipping (0%)", value: "0" },
    { label: "Custom Amount", value: "custom" },
  ];

  // Order
  const [orderNote, setOrderNote] = useState("");
  const [orderTags, setOrderTags] = useState("");
  const [requestedShipDate, setRequestedShipDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Order-level discount
  const [orderDiscount, setOrderDiscount] = useState({ type: "percentage", value: 0, reason: "" });
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [itemDiscountIndex, setItemDiscountIndex] = useState(null);
  const [tempDiscount, setTempDiscount] = useState({ type: "percentage", value: 0 });

  // Image preview
  const [previewImage, setPreviewImage] = useState(null);

  // Last created order for printing
  const [lastOrder, setLastOrder] = useState(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const printRef = useRef(null);

  // Draft management
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [lastAutoSave, setLastAutoSave] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const autoSaveTimerRef = useRef(null);

  // Email dialog
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Quote print ref
  const quoteRef = useRef(null);

  // Drafts dialog
  const [draftsDialogOpen, setDraftsDialogOpen] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftsFilter, setDraftsFilter] = useState("all"); // "all", "mine", "others"
  const [draftsSearch, setDraftsSearch] = useState("");

  // Fetch drafts
  const fetchDrafts = async () => {
    setLoadingDrafts(true);
    try {
      const params = new URLSearchParams();
      if (selectedStore) params.append("store_id", selectedStore);
      if (draftsSearch) params.append("search", draftsSearch);
      
      const res = await fetch(`${API}/pos/drafts?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDrafts(data.drafts || []);
      }
    } catch (err) {
      toast.error("Failed to load drafts");
    } finally {
      setLoadingDrafts(false);
    }
  };

  // Load a draft into the current order
  const loadDraft = async (draft) => {
    // Check if draft is locked by another user
    if (draft.is_locked && !draft.is_mine) {
      toast.error(`This draft is being edited by ${draft.locked_by_name}`);
      return;
    }
    
    // Confirm if current cart has items
    if (cart.length > 0) {
      if (!window.confirm("Loading this draft will replace your current cart. Continue?")) {
        return;
      }
    }
    
    try {
      // Lock the draft
      const res = await fetch(`${API}/pos/drafts/${draft.order_id}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail || "Failed to load draft");
        return;
      }
      
      const data = await res.json();
      const loadedDraft = data.draft;
      
      // Load draft data into state
      setCart(loadedDraft.items?.map(item => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        sku: item.sku || "",
        title: item.name,
        quantity: item.quantity,
        price: item.price,
        taxable: true,
        is_custom: !item.product_id,
        image: item.image,
        discount_type: item.discount_type,
        discount_value: item.discount_value || 0
      })) || []);
      
      setSelectedStore(loadedDraft.store_id);
      setCustomer(loadedDraft.customer_data || null);
      setTaxExempt(loadedDraft.tax_exempt || false);
      setShipAllItems(loadedDraft.ship_all_items !== false);
      setOrderNote(loadedDraft.notes?.replace(/\n?\[.*?\]$/g, '') || ""); // Remove auto-save notes
      setOrderTags(loadedDraft.tags?.filter(t => !t.startsWith("pos-")).join(", ") || "");
      setOrderDiscount(loadedDraft.order_discount || { type: "percentage", value: 0, reason: "" });
      setShipping(loadedDraft.shipping || { title: "Standard Shipping", price: 0, code: "standard" });
      setRequestedShipDate(loadedDraft.requested_ship_date || "");
      setCurrentDraftId(loadedDraft.order_id);
      
      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cart: loadedDraft.items,
        customer: loadedDraft.customer_data,
        selectedStore: loadedDraft.store_id,
        currentDraftId: loadedDraft.order_id,
        requestedShipDate: loadedDraft.requested_ship_date,
        savedAt: new Date().toISOString()
      }));
      
      setDraftsDialogOpen(false);
      toast.success(`Loaded draft: ${loadedDraft.pos_order_number}`);
    } catch (err) {
      toast.error("Failed to load draft");
    }
  };

  // Delete a draft
  const deleteDraft = async (draftId, e) => {
    e?.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this draft?")) return;
    
    try {
      const res = await fetch(`${API}/pos/drafts/${draftId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Draft deleted");
        fetchDrafts();
        if (currentDraftId === draftId) {
          setCurrentDraftId(null);
        }
      }
    } catch (err) {
      toast.error("Failed to delete draft");
    }
  };

  // Release/unlock a draft
  const releaseDraft = async (draftId, e) => {
    e?.stopPropagation();
    try {
      await fetch(`${API}/pos/drafts/${draftId}/release`, {
        method: "POST",
        credentials: "include"
      });
      toast.success("Draft released");
      fetchDrafts();
    } catch (err) {
      toast.error("Failed to release draft");
    }
  };

  // Filter drafts
  const filteredDrafts = drafts.filter(draft => {
    if (draftsFilter === "mine") return draft.is_mine;
    if (draftsFilter === "others") return !draft.is_mine;
    return true;
  });

  // Load persisted order from localStorage on mount
  useEffect(() => {
    const loadPersistedOrder = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const data = JSON.parse(saved);
          if (data.cart && data.cart.length > 0) {
            setCart(data.cart || []);
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
  }, [STORAGE_KEY]);

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
        savedAt: new Date().toISOString(),
        savedBy: user?.name || 'Unknown'
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orderData));
    }
  }, [cart, customer, selectedStore, taxExempt, shipAllItems, shipping, shippingPercent, orderDiscount, orderNote, orderTags, requestedShipDate, currentDraftId, STORAGE_KEY, user]);

  // Auto-save as draft every 60 seconds if cart has items
  useEffect(() => {
    if (cart.length > 0 && selectedStore) {
      autoSaveTimerRef.current = setInterval(() => {
        autoSaveDraft();
      }, 60000); // 60 seconds
    }
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [cart.length, selectedStore]);

  // Auto-save draft function
  const autoSaveDraft = async () => {
    if (!selectedStore || cart.length === 0 || autoSaving) return;
    
    setAutoSaving(true);
    try {
      const createdByNote = `[Auto-saved by ${user?.name || 'Unknown'} on ${new Date().toLocaleString()}]`;
      const fullNote = orderNote ? `${orderNote}\n${createdByNote}` : createdByNote;
      
      const orderData = {
        store_id: selectedStore,
        customer_id: customer?.customer_id || null,
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
        is_draft: true,
        requested_ship_date: requestedShipDate || null
      };

      // If we have an existing draft, update it
      if (currentDraftId) {
        // Delete old draft and create new one (simpler than implementing update)
        await fetch(`${API}/pos/drafts/${currentDraftId}`, {
          method: "DELETE",
          credentials: "include"
        });
      }

      const res = await fetch(`${API}/pos/orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData)
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentDraftId(data.order?.order_id);
        setLastAutoSave(new Date());
      }
    } catch (err) {
      console.error("Auto-save failed:", err);
    } finally {
      setAutoSaving(false);
    }
  };

  // Clear persisted order from localStorage
  const clearPersistedOrder = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCurrentDraftId(null);
  };

  // Fetch stores on mount
  useEffect(() => {
    fetchStores();
    fetchNextOrderNumber();
  }, []);

  // Reset search when store changes
  useEffect(() => {
    setSearchQuery("");
    setSearchResults([]);
    setStoreProductCount(null);
  }, [selectedStore]);

  const fetchStores = async () => {
    try {
      const res = await fetch(`${API}/pos/stores`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores);
        // Don't auto-select store if we have a persisted one
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

  // Product search
  const searchProducts = useCallback(async (query, isBarcode = false) => {
    if (!selectedStore || !query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const params = new URLSearchParams({ store_id: selectedStore });
      if (isBarcode) {
        params.append("barcode", query.trim());
      } else {
        params.append("query", query.trim());
      }

      const res = await fetch(`${API}/pos/products/search?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.products);
        setStoreProductCount(data.total_in_store);

        // Auto-add if barcode scan found exactly one product
        if (isBarcode && data.products.length === 1) {
          addToCart(data.products[0]);
          setSearchQuery("");
          setSearchResults([]);
          toast.success(`Added: ${data.products[0].title}`);
        } else if (isBarcode && data.products.length === 0) {
          toast.error("Product not found");
        }
      }
    } catch (err) {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  }, [selectedStore]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchProducts(searchQuery, false);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchProducts]);

  // Handle barcode scan (Enter key)
  const handleBarcodeKeyDown = (e) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      e.preventDefault();
      searchProducts(searchQuery, true);
    }
  };

  // Add product to cart
  const addToCart = (product, variant = null) => {
    const existingIndex = cart.findIndex(item => 
      item.product_id === product.product_id && 
      (!variant || item.variant_id === variant?.variant_id)
    );

    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      setCart(newCart);
    } else {
      const price = variant?.price || product.variants?.[0]?.price || product.price || 0;
      const sku = variant?.sku || product.variants?.[0]?.sku || product.sku || "";
      
      setCart([...cart, {
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
      }]);
    }
    setSearchQuery("");
    setSearchResults([]);
  };

  // Update cart item quantity
  const updateQuantity = (index, delta) => {
    const newCart = [...cart];
    newCart[index].quantity += delta;
    if (newCart[index].quantity <= 0) {
      newCart.splice(index, 1);
    }
    setCart(newCart);
  };

  // Remove from cart
  const removeFromCart = (index) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  // Add custom item
  const addCustomItem = () => {
    if (!customItem.title || customItem.price <= 0) {
      toast.error("Please enter title and price");
      return;
    }
    
    setCart([...cart, {
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
    
    setCustomItem({ title: "", sku: "", price: 0, quantity: 1, taxable: true });
    setCustomItemDialogOpen(false);
    toast.success("Custom item added");
  };

  // Apply discount to item
  const applyItemDiscount = (index) => {
    const newCart = [...cart];
    newCart[index].discount_type = tempDiscount.value > 0 ? tempDiscount.type : null;
    newCart[index].discount_value = tempDiscount.value;
    setCart(newCart);
    setItemDiscountIndex(null);
    setTempDiscount({ type: "percentage", value: 0 });
  };

  // Calculate item total with discount
  const getItemTotal = (item) => {
    const lineTotal = item.price * item.quantity;
    if (!item.discount_type || item.discount_value <= 0) return lineTotal;
    
    if (item.discount_type === "percentage") {
      return lineTotal * (1 - item.discount_value / 100);
    }
    return Math.max(0, lineTotal - item.discount_value);
  };

  // Customer search with auto-fill
  const searchCustomers = async (searchValue = customerSearch) => {
    if (!selectedStore || !searchValue.trim()) {
      setCustomerResults([]);
      return;
    }

    setSearchingCustomers(true);
    try {
      const res = await fetch(
        `${API}/pos/customers/search?store_id=${selectedStore}&query=${encodeURIComponent(searchValue)}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setCustomerResults(data.customers);
      }
    } catch (err) {
      toast.error("Customer search failed");
    } finally {
      setSearchingCustomers(false);
    }
  };

  // Debounced auto-fill customer search
  useEffect(() => {
    if (!customerDialogOpen) return;
    const timer = setTimeout(() => {
      if (customerSearch.length >= 2) {
        searchCustomers(customerSearch);
      } else {
        setCustomerResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, customerDialogOpen, selectedStore]);

  // Create new customer
  const createCustomer = async () => {
    if (!newCustomer.first_name || !newCustomer.last_name) {
      toast.error("First and last name required");
      return;
    }

    try {
      const res = await fetch(`${API}/pos/customers?store_id=${selectedStore}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCustomer)
      });

      if (res.ok) {
        const data = await res.json();
        setCustomer(data.customer);
        setTaxExempt(newCustomer.tax_exempt);
        setCustomerDialogOpen(false);
        setNewCustomerMode(false);
        setNewCustomer({
          first_name: "", last_name: "", email: "", phone: "",
          company: "", address1: "", address2: "", city: "",
          state: "", zip: "", country: "US", tax_exempt: false, note: ""
        });
        toast.success("Customer created");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to create customer");
      }
    } catch (err) {
      toast.error("Failed to create customer");
    }
  };

  // Select existing customer
  const selectCustomer = (cust) => {
    setCustomer(cust);
    setTaxExempt(cust.tax_exempt || false);
    setCustomerDialogOpen(false);
    toast.success(`Selected: ${cust.name}`);
  };

  // Calculate totals with discounts
  const subtotal = cart.reduce((sum, item) => sum + getItemTotal(item), 0);
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
      // Add created by info to note
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
        requested_ship_date: requestedShipDate || null
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
          
          // Show print dialog
          setPrintDialogOpen(true);
        }
        
        // Reset form
        setCart([]);
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
      setCart([]);
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
            .item-image-placeholder { width: 40px; height: 40px; background: #eee; border-radius: 4px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
            .item-details { flex: 1; min-width: 0; }
            .item-name { font-weight: bold; font-size: 11px; word-wrap: break-word; }
            .item-sku { font-size: 10px; color: #666; }
            .item-meta { display: flex; justify-content: space-between; margin-top: 3px; }
            .item-qty { font-size: 11px; }
            .item-price { font-size: 11px; font-weight: bold; }
            .totals { margin-top: 10px; }
            .total-row { display: flex; justify-content: space-between; margin: 3px 0; }
            .total-row.grand { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px; }
            .customer { margin: 10px 0; padding: 10px 0; border-top: 1px dashed #000; }
            .footer { text-align: center; margin-top: 15px; font-size: 10px; color: #666; }
            .note { margin-top: 10px; padding: 5px; background: #f5f5f5; font-size: 11px; }
            @media print {
              body { padding: 0; }
              .item-image { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // Print current cart as quote/draft
  const printQuote = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    const storeName = stores.find(s => s.store_id === selectedStore)?.name || "Store";
    const quoteDate = new Date().toLocaleDateString();
    const quoteNumber = currentDraftId ? `Draft-${nextOrderNumber}` : `Quote-${Date.now().toString(36).toUpperCase()}`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Quote - ${quoteNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #333; }
            .header h1 { font-size: 28px; margin-bottom: 5px; }
            .header .quote-type { font-size: 18px; color: #666; text-transform: uppercase; letter-spacing: 2px; }
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
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${storeName}</h1>
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
              <span>Shipping (${shipping.title})</span>
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
            <p>This quote is valid for 30 days from the date of issue. Prices are subject to change without notice. Payment terms: Due upon receipt unless otherwise agreed.</p>
          </div>
          
          <div class="footer">
            <p>Generated by ${user?.name || 'Staff'} on ${new Date().toLocaleString()}</p>
            <p>Thank you for your business!</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
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

  return (
    <div className="min-h-screen bg-background p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-6 h-6 md:w-8 md:h-8 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Point of Sale</h1>
            <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">Create orders with Shopify sync</p>
          </div>
        </div>
        
        {/* Next Order Number & Store Selector */}
        <div className="flex flex-wrap items-center justify-end gap-2 md:gap-3">
          {nextOrderNumber && (
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">Next Order</p>
              <p className="font-mono font-bold text-primary text-sm md:text-base" data-testid="next-order-number">{nextOrderNumber}</p>
            </div>
          )}
          
          {/* Print Quote Button */}
          {cart.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={printQuote}
              data-testid="print-quote-btn"
              className="h-9"
            >
              <FileDown className="w-4 h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Quote</span>
            </Button>
          )}
          
          {/* Email Quote Button */}
          {cart.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={openEmailDialog}
              data-testid="email-quote-btn"
              className="h-9"
            >
              <Mail className="w-4 h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Email</span>
            </Button>
          )}
          
          {/* View Drafts Button */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              setDraftsDialogOpen(true);
              fetchDrafts();
            }}
            data-testid="view-drafts-btn"
            className="h-9"
          >
            <FolderOpen className="w-4 h-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Drafts</span>
          </Button>
          
          {lastOrder && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setPrintDialogOpen(true)}
              data-testid="reprint-last-order"
              className="hidden sm:flex"
            >
              <Printer className="w-4 h-4 mr-2" />
              Reprint
            </Button>
          )}
          <Select value={selectedStore} onValueChange={setSelectedStore}>
            <SelectTrigger className="w-[140px] md:w-[200px]" data-testid="store-selector">
              <Store className="w-4 h-4 mr-1 md:mr-2 text-muted-foreground" />
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
        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            {autoSaving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Auto-saving...</span>
              </>
            ) : lastAutoSave ? (
              <>
                <Check className="w-3 h-3 text-green-500" />
                <span>Auto-saved {lastAutoSave.toLocaleTimeString()}</span>
              </>
            ) : cart.length > 0 ? (
              <span>{cart.length} item(s) in cart • Will auto-save in 1 min</span>
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
              Clear Order
            </Button>
          )}
        </div>
      )}

      {/* Mobile-optimized grid: stack on mobile, side-by-side on tablet+ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left: Product Search & Results */}
        <div className="lg:col-span-2 space-y-4 order-1">
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
                    onKeyDown={handleBarcodeKeyDown}
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
                    setCustomItemDialogOpen(true);
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
                                onClick={() => addToCart(product)}
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
                                      onClick={() => addToCart(product, variant)}
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

          {/* Cart */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Cart ({cart.length} items)
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
                      <div key={index} className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg border border-border">
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
                        
                        {/* Actions - stacked on mobile */}
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
                                <Percent className="w-3 h-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56" align="end">
                              <div className="space-y-3">
                                <p className="font-medium text-sm">Item Discount</p>
                                <Select 
                                  value={tempDiscount.type} 
                                  onValueChange={(v) => setTempDiscount({...tempDiscount, type: v})}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                                    <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="number"
                                  min="0"
                                  step={tempDiscount.type === "percentage" ? "1" : "0.01"}
                                  placeholder={tempDiscount.type === "percentage" ? "10" : "5.00"}
                                  value={tempDiscount.value || ""}
                                  onChange={(e) => setTempDiscount({...tempDiscount, value: parseFloat(e.target.value) || 0})}
                                />
                                <div className="flex gap-2">
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="flex-1"
                                    onClick={() => {
                                      setTempDiscount({ type: "percentage", value: 0 });
                                      applyItemDiscount(index);
                                    }}
                                  >
                                    Clear
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    className="flex-1"
                                    onClick={() => applyItemDiscount(index)}
                                  >
                                    Apply
                                  </Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 md:h-8 md:w-8 text-destructive"
                            onClick={() => removeFromCart(index)}
                          >
                            <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Order Summary - Fixed at bottom on mobile */}
        <div className="space-y-3 md:space-y-4 order-2 lg:order-2">
          {/* Customer */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 md:pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Customer
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCustomerDialogOpen(true)}
                  data-testid="add-customer-btn"
                  className="h-8"
                >
                  {customer ? "Change" : "Add"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {customer ? (
                <div className="space-y-1 md:space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm md:text-base">{customer.name}</p>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => { setCustomer(null); setTaxExempt(false); }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  {customer.company && (
                    <p className="text-sm text-primary">{customer.company}</p>
                  )}
                  {customer.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
                  {customer.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
                  {customer.default_address && (customer.default_address.city || customer.default_address.state) && (
                    <p className="text-xs text-muted-foreground">
                      {[customer.default_address.city, customer.default_address.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {customer.tax_exempt && <Badge variant="secondary" className="text-xs">Tax Exempt</Badge>}
                    {customer.orders_count > 0 && (
                      <Badge variant="outline" className="text-xs">{customer.orders_count} orders</Badge>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No customer selected</p>
              )}
            </CardContent>
          </Card>

          {/* Options */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="tax-exempt" className="text-sm">Tax Exempt</Label>
                <Switch
                  id="tax-exempt"
                  checked={taxExempt}
                  onCheckedChange={setTaxExempt}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="ship-all" className="text-sm">Ship All Items</Label>
                <Switch
                  id="ship-all"
                  checked={shipAllItems}
                  onCheckedChange={setShipAllItems}
                />
              </div>
              
              {shipAllItems && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <Label className="text-sm flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Shipping
                  </Label>
                  
                  {/* Shipping Percentage Preset Dropdown */}
                  <Select 
                    value={shippingPercent} 
                    onValueChange={(val) => {
                      setShippingPercent(val);
                      if (val === "custom") {
                        setShipping(prev => ({ ...prev, title: "Custom Shipping", price: 0 }));
                      }
                    }}
                  >
                    <SelectTrigger data-testid="shipping-preset-dropdown">
                      <SelectValue placeholder="Select shipping rate..." />
                    </SelectTrigger>
                    <SelectContent>
                      {shippingPresets.map(preset => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Calculated shipping display */}
                  {shippingPercent && shippingPercent !== "custom" && subtotal > 0 && (
                    <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      {shippingPercent}% of ${subtotal.toFixed(2)} = <span className="font-semibold text-foreground">${shipping.price.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Custom shipping inputs - show when custom selected or no preset */}
                  {(shippingPercent === "custom" || !shippingPercent) && (
                    <>
                      <Input
                        placeholder="Shipping method name"
                        value={shipping.title}
                        onChange={(e) => setShipping({...shipping, title: e.target.value})}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={shipping.price || ""}
                          onChange={(e) => setShipping({...shipping, price: parseFloat(e.target.value) || 0})}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Discount */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Percent className="w-4 h-4" />
                  Order Discount
                </span>
                {orderDiscount.value > 0 && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 text-xs text-destructive"
                    onClick={() => setOrderDiscount({ type: "percentage", value: 0, reason: "" })}
                  >
                    Clear
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Select 
                  value={orderDiscount.type} 
                  onValueChange={(v) => setOrderDiscount({...orderDiscount, type: v})}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percent (%)</SelectItem>
                    <SelectItem value="fixed">Fixed ($)</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step={orderDiscount.type === "percentage" ? "1" : "0.01"}
                  placeholder={orderDiscount.type === "percentage" ? "10" : "5.00"}
                  value={orderDiscount.value || ""}
                  onChange={(e) => setOrderDiscount({...orderDiscount, value: parseFloat(e.target.value) || 0})}
                  data-testid="order-discount-input"
                />
              </div>
              {orderDiscount.value > 0 && subtotal > 0 && (
                <div className="text-sm bg-destructive/10 text-destructive p-2 rounded">
                  Discount: -{orderDiscount.type === "percentage" ? `${orderDiscount.value}%` : `$${orderDiscount.value.toFixed(2)}`} 
                  = <span className="font-semibold">-${orderDiscountAmount.toFixed(2)}</span>
                </div>
              )}
              <Input
                placeholder="Discount reason (optional)"
                value={orderDiscount.reason}
                onChange={(e) => setOrderDiscount({...orderDiscount, reason: e.target.value})}
              />
            </CardContent>
          </Card>

          {/* Notes, Tags & Ship Date */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Requested Ship Date
                </Label>
                <Input
                  type="date"
                  value={requestedShipDate}
                  onChange={(e) => setRequestedShipDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="mt-1"
                  data-testid="ship-date-input"
                />
                {requestedShipDate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Will appear on scheduling calendar
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm">Order Note</Label>
                <Input
                  placeholder="Add a note..."
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-sm flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Tags (comma separated)
                </Label>
                <Input
                  placeholder="tag1, tag2, tag3"
                  value={orderTags}
                  onChange={(e) => setOrderTags(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card className="bg-card border-border">
            <CardContent className="pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal ({cart.length} items)</span>
                <span>${(subtotal + orderDiscountAmount).toFixed(2)}</span>
              </div>
              {orderDiscountAmount > 0 && (
                <div className="flex justify-between text-sm text-destructive">
                  <span>Order Discount</span>
                  <span>-${orderDiscountAmount.toFixed(2)}</span>
                </div>
              )}
              {shipAllItems && shipping.price > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Shipping</span>
                  <span>${shipping.price.toFixed(2)}</span>
                </div>
              )}
              {taxExempt && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Tax</span>
                  <span>Exempt</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-base md:text-lg">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Submit Buttons - Sticky on mobile */}
          <div className="space-y-2 sticky bottom-0 bg-background pt-2 pb-4 -mx-4 px-4 md:relative md:mx-0 md:px-0 md:pt-0 md:pb-0">
            <Button
              className="w-full h-12 md:h-12 text-base md:text-lg touch-manipulation"
              disabled={!selectedStore || cart.length === 0 || submitting || savingDraft}
              onClick={() => submitOrder(false)}
              data-testid="create-order-btn"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5 mr-2" />
                  Create Order
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              className="w-full h-10 touch-manipulation"
              disabled={!selectedStore || cart.length === 0 || submitting || savingDraft}
              onClick={() => submitOrder(true)}
              data-testid="save-draft-btn"
            >
              {savingDraft ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Draft
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Customer Dialog */}
      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {newCustomerMode ? "New Customer" : "Select Customer"}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={newCustomerMode ? "new" : "search"} onValueChange={(v) => setNewCustomerMode(v === "new")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="search">Search Existing</TabsTrigger>
              <TabsTrigger value="new">Create New</TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Type to search by name, email, phone, company, city..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-10"
                  data-testid="customer-search-input"
                />
                {searchingCustomers && (
                  <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>
              
              {customerSearch.length > 0 && customerSearch.length < 2 && (
                <p className="text-xs text-muted-foreground text-center">Type at least 2 characters to search</p>
              )}

              <ScrollArea className="h-[350px]">
                <div className="space-y-2">
                  {customerResults.map(cust => (
                    <div
                      key={cust.customer_id}
                      className="p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => selectCustomer(cust)}
                      data-testid={`customer-result-${cust.customer_id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-base">{cust.name}</p>
                            {cust.tax_exempt && (
                              <Badge variant="secondary" className="text-xs">Tax Exempt</Badge>
                            )}
                          </div>
                          
                          {cust.company && (
                            <p className="text-sm text-primary font-medium mt-0.5">{cust.company}</p>
                          )}
                          
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
                            {cust.email && (
                              <span className="flex items-center gap-1">
                                <span className="truncate max-w-[200px]">{cust.email}</span>
                              </span>
                            )}
                            {cust.phone && (
                              <span>{cust.phone}</span>
                            )}
                          </div>
                          
                          {cust.default_address && (cust.default_address.city || cust.default_address.state) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {[
                                cust.default_address.address1,
                                cust.default_address.city,
                                cust.default_address.state,
                                cust.default_address.zip
                              ].filter(Boolean).join(", ")}
                            </p>
                          )}
                          
                          {(cust.orders_count > 0 || cust.total_spent > 0) && (
                            <div className="flex items-center gap-3 mt-2 text-xs">
                              {cust.orders_count > 0 && (
                                <span className="text-muted-foreground">
                                  {cust.orders_count} order{cust.orders_count !== 1 ? 's' : ''}
                                </span>
                              )}
                              {cust.total_spent > 0 && (
                                <span className="text-green-600 font-medium">
                                  ${parseFloat(cust.total_spent).toFixed(2)} spent
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <Button size="sm" variant="outline" className="shrink-0">
                          Select
                        </Button>
                      </div>
                    </div>
                  ))}
                  {customerResults.length === 0 && customerSearch.length >= 2 && !searchingCustomers && (
                    <div className="text-center py-8 text-muted-foreground">
                      <User className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p>No customers found for "{customerSearch}"</p>
                      <p className="text-sm mt-1">Try a different search or create a new customer</p>
                    </div>
                  )}
                  {customerResults.length === 0 && !customerSearch && !searchingCustomers && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Search className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p>Start typing to search customers</p>
                      <p className="text-sm mt-1">Search by name, email, phone, company, or city</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="new" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name *</Label>
                  <Input
                    value={newCustomer.first_name}
                    onChange={(e) => setNewCustomer({...newCustomer, first_name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Last Name *</Label>
                  <Input
                    value={newCustomer.last_name}
                    onChange={(e) => setNewCustomer({...newCustomer, last_name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Company</Label>
                  <Input
                    value={newCustomer.company}
                    onChange={(e) => setNewCustomer({...newCustomer, company: e.target.value})}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Address 1</Label>
                  <Input
                    value={newCustomer.address1}
                    onChange={(e) => setNewCustomer({...newCustomer, address1: e.target.value})}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Address 2</Label>
                  <Input
                    value={newCustomer.address2}
                    onChange={(e) => setNewCustomer({...newCustomer, address2: e.target.value})}
                  />
                </div>
                <div>
                  <Label>City</Label>
                  <Input
                    value={newCustomer.city}
                    onChange={(e) => setNewCustomer({...newCustomer, city: e.target.value})}
                  />
                </div>
                <div>
                  <Label>State</Label>
                  <Input
                    value={newCustomer.state}
                    onChange={(e) => setNewCustomer({...newCustomer, state: e.target.value})}
                  />
                </div>
                <div>
                  <Label>ZIP</Label>
                  <Input
                    value={newCustomer.zip}
                    onChange={(e) => setNewCustomer({...newCustomer, zip: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input
                    value={newCustomer.country}
                    onChange={(e) => setNewCustomer({...newCustomer, country: e.target.value})}
                  />
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <Label>Tax Exempt</Label>
                  <Switch
                    checked={newCustomer.tax_exempt}
                    onCheckedChange={(v) => setNewCustomer({...newCustomer, tax_exempt: v})}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Note</Label>
                  <Input
                    value={newCustomer.note}
                    onChange={(e) => setNewCustomer({...newCustomer, note: e.target.value})}
                  />
                </div>
              </div>

              <Button onClick={createCustomer} className="w-full">
                <UserPlus className="w-4 h-4 mr-2" />
                Create Customer
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Custom Item Dialog */}
      <Dialog open={customItemDialogOpen} onOpenChange={setCustomItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Item</DialogTitle>
            <DialogDescription>
              Add a custom line item that doesn&apos;t exist in your product catalog
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={customItem.title}
                onChange={(e) => setCustomItem({...customItem, title: e.target.value})}
                placeholder="Custom product name"
              />
            </div>
            <div>
              <Label>SKU</Label>
              <Input
                value={customItem.sku}
                onChange={(e) => setCustomItem({...customItem, sku: e.target.value})}
                placeholder="Optional SKU"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customItem.price || ""}
                  onChange={(e) => setCustomItem({...customItem, price: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={customItem.quantity}
                  onChange={(e) => setCustomItem({...customItem, quantity: parseInt(e.target.value) || 1})}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Taxable</Label>
              <Switch
                checked={customItem.taxable}
                onCheckedChange={(v) => setCustomItem({...customItem, taxable: v})}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomItemDialogOpen(false)}>Cancel</Button>
            <Button onClick={addCustomItem}>Add to Cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Order Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Order Created Successfully
            </DialogTitle>
            <DialogDescription>
              Would you like to print a receipt for this order?
            </DialogDescription>
          </DialogHeader>

          {lastOrder && (
            <div className="border rounded-lg p-4 bg-muted/30 max-h-[400px] overflow-y-auto">
              {/* Hidden print content */}
              <div ref={printRef}>
                <div className="header">
                  <h1>{lastOrder.store_name || "Store"}</h1>
                  <p>Order Receipt</p>
                </div>
                
                <div className="order-info">
                  <p className="order-number">Order: {lastOrder.pos_order_number}</p>
                  <p>Shopify: #{lastOrder.shopify_order_number}</p>
                  <p>Date: {lastOrder.created_at}</p>
                  <p>Staff: {lastOrder.created_by}</p>
                </div>

                {lastOrder.customer && (
                  <div className="customer">
                    <p><strong>Customer:</strong></p>
                    <p>{lastOrder.customer.name}</p>
                    {lastOrder.customer.email && <p>{lastOrder.customer.email}</p>}
                    {lastOrder.customer.phone && <p>{lastOrder.customer.phone}</p>}
                  </div>
                )}

                <div className="items">
                  <p style={{marginBottom: '8px'}}><strong>Items:</strong></p>
                  {lastOrder.items.map((item, idx) => (
                    <div key={idx} className="item">
                      {item.image ? (
                        <img src={item.image} alt="" className="item-image" />
                      ) : (
                        <div className="item-image-placeholder">IMG</div>
                      )}
                      <div className="item-details">
                        <div className="item-name">{item.title}</div>
                        {item.sku && <div className="item-sku">SKU: {item.sku}</div>}
                        <div className="item-meta">
                          <span className="item-qty">Qty: {item.quantity}</span>
                          <span className="item-price">${(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="totals">
                  <div className="total-row">
                    <span>Subtotal:</span>
                    <span>${lastOrder.subtotal.toFixed(2)}</span>
                  </div>
                  {lastOrder.shipping && lastOrder.shipping.price > 0 && (
                    <div className="total-row">
                      <span>Shipping:</span>
                      <span>${lastOrder.shipping.price.toFixed(2)}</span>
                    </div>
                  )}
                  {lastOrder.tax_exempt && (
                    <div className="total-row">
                      <span>Tax:</span>
                      <span>Exempt</span>
                    </div>
                  )}
                  <div className="total-row grand">
                    <span>TOTAL:</span>
                    <span>${lastOrder.total.toFixed(2)}</span>
                  </div>
                </div>

                {lastOrder.note && (
                  <div className="note">
                    <p><strong>Note:</strong> {lastOrder.note}</p>
                  </div>
                )}

                <div className="footer">
                  <p>Thank you for your purchase!</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>
              Skip
            </Button>
            <Button onClick={handlePrint} data-testid="print-receipt-btn">
              <Printer className="w-4 h-4 mr-2" />
              Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-sm font-medium truncate pr-8">
              {previewImage?.title}
            </DialogTitle>
          </DialogHeader>
          {previewImage && (
            <div className="px-4 pb-4">
              <img
                src={previewImage.src}
                alt={previewImage.title}
                className="w-full h-auto max-h-[60vh] object-contain rounded-lg bg-muted"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Drafts Dialog */}
      <Dialog open={draftsDialogOpen} onOpenChange={setDraftsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              Draft Orders
            </DialogTitle>
            <DialogDescription>
              View and load saved draft orders. Drafts are auto-saved every minute.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search drafts..."
                value={draftsSearch}
                onChange={(e) => setDraftsSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchDrafts()}
                className="pl-10"
              />
            </div>
            <Select value={draftsFilter} onValueChange={setDraftsFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <Users className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drafts</SelectItem>
                <SelectItem value="mine">My Drafts</SelectItem>
                <SelectItem value="others">Others' Drafts</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchDrafts} disabled={loadingDrafts}>
              <RefreshCw className={`w-4 h-4 ${loadingDrafts ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <ScrollArea className="flex-1 -mx-6 px-6">
            {loadingDrafts ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDrafts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No draft orders found</p>
                <p className="text-sm mt-1">Drafts are auto-saved when you add items to the cart</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDrafts.map(draft => (
                  <div
                    key={draft.order_id}
                    onClick={() => loadDraft(draft)}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      currentDraftId === draft.order_id 
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30' 
                        : draft.is_locked && !draft.is_mine
                          ? 'border-orange-500/30 bg-orange-500/5 cursor-not-allowed'
                          : draft.is_mine
                            ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15'
                            : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-bold text-primary">{draft.pos_order_number}</span>
                          {currentDraftId === draft.order_id && (
                            <Badge variant="default" className="text-[10px]">Current</Badge>
                          )}
                          {draft.is_mine && currentDraftId !== draft.order_id && (
                            <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-600">
                              My Draft
                            </Badge>
                          )}
                          {draft.is_locked && (
                            <Badge variant={draft.is_mine ? "secondary" : "destructive"} className="text-[10px]">
                              <Lock className="w-3 h-3 mr-1" />
                              {draft.is_mine ? "Editing" : `Locked`}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          {draft.customer_name && <p>Customer: {draft.customer_name}</p>}
                          <p>{draft.items?.length || 0} item(s) • ${(draft.total_price || 0).toFixed(2)}</p>
                          {draft.requested_ship_date && (
                            <p className="flex items-center gap-1 text-blue-500">
                              <Truck className="w-3 h-3" />
                              Ship: {new Date(draft.requested_ship_date).toLocaleDateString()}
                            </p>
                          )}
                          <p className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(draft.created_at).toLocaleString()}
                          </p>
                          <p className="text-xs">
                            Created by: {draft.created_by_name || 'Unknown'}
                            {draft.is_locked && !draft.is_mine && draft.locked_by_name && (
                              <span className="text-orange-500"> • Editing: {draft.locked_by_name}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        {draft.is_mine && draft.is_locked && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => releaseDraft(draft.order_id, e)}
                            title="Release lock"
                          >
                            <Unlock className="w-4 h-4" />
                          </Button>
                        )}
                        {(draft.is_mine || !draft.is_locked) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => deleteDraft(draft.order_id, e)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDraftsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
