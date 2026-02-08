import { useState, useEffect, useCallback } from "react";
import { API } from "@/utils/api";
import { toast } from "sonner";

/**
 * Custom hook for managing POS product search
 */
export function usePOSProducts(selectedStore) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [storeProductCount, setStoreProductCount] = useState(null);

  // Reset search when store changes
  useEffect(() => {
    setSearchQuery("");
    setSearchResults([]);
    setStoreProductCount(null);
  }, [selectedStore]);

  // Product search
  const searchProducts = useCallback(async (query, isBarcode = false) => {
    if (!selectedStore || !query.trim()) {
      setSearchResults([]);
      return { products: [], autoAdded: false };
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

        // Return info for barcode handling
        if (isBarcode && data.products.length === 1) {
          return { products: data.products, autoAdded: true, product: data.products[0] };
        } else if (isBarcode && data.products.length === 0) {
          toast.error("Product not found");
          return { products: [], autoAdded: false };
        }
        return { products: data.products, autoAdded: false };
      }
    } catch (err) {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
    return { products: [], autoAdded: false };
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

  // Clear search results
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    searching,
    storeProductCount,
    searchProducts,
    clearSearch
  };
}
