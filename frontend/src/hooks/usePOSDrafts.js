import { useState, useEffect, useRef, useCallback } from "react";
import { API } from "@/utils/api";
import { toast } from "sonner";

/**
 * Custom hook for managing POS draft orders
 */
export function usePOSDrafts({
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
}) {
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [lastAutoSave, setLastAutoSave] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftsFilter, setDraftsFilter] = useState("all");
  const [draftsSearch, setDraftsSearch] = useState("");
  const autoSaveTimerRef = useRef(null);

  // Fetch drafts
  const fetchDrafts = useCallback(async () => {
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
  }, [selectedStore, draftsSearch]);

  // Load a draft into the current order
  const loadDraft = useCallback(async (draft, confirmCallback) => {
    // Check if draft is locked by another user
    if (draft.is_locked && !draft.is_mine) {
      toast.error(`This draft is being edited by ${draft.locked_by_name}`);
      return false;
    }
    
    // Confirm if current cart has items
    if (cart.length > 0) {
      if (!confirmCallback || !confirmCallback("Loading this draft will replace your current cart. Continue?")) {
        return false;
      }
    }
    
    try {
      // Lock the draft
      const res = await fetch(`${API}/pos/drafts/${draft.order_id}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail || "Failed to load draft");
        return false;
      }
      
      const data = await res.json();
      const loadedDraft = data.draft;
      
      // Load draft data into state
      const items = loadedDraft.items?.map(item => ({
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
      })) || [];
      
      const newColor = loadedDraft.order_color || generateOrderColor();
      loadCart(items, newColor);
      
      setSelectedStore(loadedDraft.store_id);
      setCustomer(loadedDraft.customer_data || null);
      setTaxExempt(loadedDraft.tax_exempt || false);
      setShipAllItems(loadedDraft.ship_all_items !== false);
      setOrderNote(loadedDraft.notes?.replace(/\n?\[.*?\]$/g, '') || "");
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
        orderColor: newColor,
        savedAt: new Date().toISOString()
      }));
      
      toast.success(`Loaded draft: ${loadedDraft.pos_order_number}`);
      return true;
    } catch (err) {
      toast.error("Failed to load draft");
      return false;
    }
  }, [cart.length, generateOrderColor, loadCart, setCustomer, setSelectedStore, setTaxExempt, setShipAllItems, setShipping, setOrderNote, setOrderTags, setOrderDiscount, setRequestedShipDate, STORAGE_KEY]);

  // Delete a draft
  const deleteDraft = useCallback(async (draftId) => {
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
        return true;
      }
    } catch (err) {
      toast.error("Failed to delete draft");
    }
    return false;
  }, [currentDraftId, fetchDrafts]);

  // Release/unlock a draft
  const releaseDraft = useCallback(async (draftId) => {
    try {
      await fetch(`${API}/pos/drafts/${draftId}/release`, {
        method: "POST",
        credentials: "include"
      });
      toast.success("Draft released");
      fetchDrafts();
      return true;
    } catch (err) {
      toast.error("Failed to release draft");
      return false;
    }
  }, [fetchDrafts]);

  // Auto-save draft function
  const autoSaveDraft = useCallback(async () => {
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
        requested_ship_date: requestedShipDate || null,
        order_color: orderColor
      };

      // If we have an existing draft, update it
      if (currentDraftId) {
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
  }, [selectedStore, cart, customer, taxExempt, shipAllItems, shipping, orderNote, orderTags, orderDiscount, requestedShipDate, orderColor, currentDraftId, user, autoSaving]);

  // Auto-save as draft every 60 seconds if cart has items
  useEffect(() => {
    if (cart.length > 0 && selectedStore) {
      autoSaveTimerRef.current = setInterval(() => {
        autoSaveDraft();
      }, 60000);
    }
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [cart.length, selectedStore, autoSaveDraft]);

  // Clear persisted order from localStorage
  const clearPersistedOrder = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCurrentDraftId(null);
  }, [STORAGE_KEY]);

  // Filter drafts
  const filteredDrafts = drafts.filter(draft => {
    if (draftsFilter === "mine") return draft.is_mine;
    if (draftsFilter === "others") return !draft.is_mine;
    return true;
  });

  return {
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
    autoSaveDraft,
    clearPersistedOrder
  };
}
