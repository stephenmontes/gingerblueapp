import { useState, useEffect, useCallback } from "react";
import { API } from "@/utils/api";
import { toast } from "sonner";

/**
 * Custom hook for managing POS customer search and creation
 */
export function usePOSCustomers(selectedStore) {
  const [customer, setCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    company: "", address1: "", address2: "", city: "",
    state: "", zip: "", country: "US", tax_exempt: false, note: ""
  });

  // Customer search with auto-fill
  const searchCustomers = useCallback(async (searchValue = customerSearch) => {
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
  }, [selectedStore, customerSearch]);

  // Create new customer
  const createCustomer = useCallback(async (onSuccess) => {
    if (!newCustomer.first_name || !newCustomer.last_name) {
      toast.error("First and last name required");
      return false;
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
        setNewCustomerMode(false);
        setNewCustomer({
          first_name: "", last_name: "", email: "", phone: "",
          company: "", address1: "", address2: "", city: "",
          state: "", zip: "", country: "US", tax_exempt: false, note: ""
        });
        toast.success("Customer created");
        if (onSuccess) onSuccess(data.customer);
        return true;
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to create customer");
        return false;
      }
    } catch (err) {
      toast.error("Failed to create customer");
      return false;
    }
  }, [selectedStore, newCustomer]);

  // Select existing customer
  const selectCustomer = useCallback((cust) => {
    setCustomer(cust);
    toast.success(`Selected: ${cust.name}`);
  }, []);

  // Clear customer
  const clearCustomer = useCallback(() => {
    setCustomer(null);
  }, []);

  // Reset customer search
  const resetCustomerSearch = useCallback(() => {
    setCustomerSearch("");
    setCustomerResults([]);
    setNewCustomerMode(false);
  }, []);

  return {
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
  };
}
