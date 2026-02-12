import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Package, Truck, User, X, Loader2 } from "lucide-react";
import { API } from "@/utils/api";

export function OrderSearchBox({ onSelectOrder, stages }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  // Debounced search function
  const searchOrders = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${API}/fulfillment-batches/search-orders?q=${encodeURIComponent(searchQuery)}&limit=10`,
        { credentials: "include" }
      );
      
      if (res.ok) {
        const data = await res.json();
        setResults(data.orders || []);
        setIsOpen(data.orders?.length > 0);
        setSelectedIndex(-1);
      }
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce input changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchOrders(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, searchOrders]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target) &&
        !inputRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelectOrder(results[selectedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setQuery("");
        break;
    }
  };

  const handleSelectOrder = (order) => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    onSelectOrder?.(order);
  };

  const getStageColor = (stageId) => {
    const stage = stages?.find(s => s.stage_id === stageId);
    return stage?.color || "#6b7280";
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full max-w-md" data-testid="order-search-box">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search orders by number, name, or customer..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query && results.length > 0 && setIsOpen(true)}
          className="pl-9 pr-8 h-9"
          data-testid="order-search-input"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
        {!loading && query && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-80 overflow-y-auto"
          data-testid="order-search-results"
        >
          {results.map((order, index) => (
            <button
              key={order.order_id}
              onClick={() => handleSelectOrder(order)}
              className={`w-full px-3 py-2 text-left hover:bg-accent transition-colors ${
                index === selectedIndex ? "bg-accent" : ""
              } ${index !== results.length - 1 ? "border-b border-border" : ""}`}
              data-testid={`search-result-${order.order_id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {/* Order Number & Name */}
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      #{order.order_number || order.order_id?.slice(-8)}
                    </span>
                    {order.name && (
                      <span className="text-sm text-muted-foreground truncate">
                        {order.name}
                      </span>
                    )}
                  </div>
                  
                  {/* Customer Name */}
                  {order.customer_name && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <User className="w-3 h-3" />
                      <span className="truncate">{order.customer_name}</span>
                    </div>
                  )}
                  
                  {/* Batch Info */}
                  {order.batch_name && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Package className="w-3 h-3" />
                      <span className="truncate">{order.batch_name}</span>
                    </div>
                  )}
                </div>
                
                {/* Status Badges */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {/* Current Stage */}
                  {order.current_stage_name && (
                    <Badge 
                      variant="outline" 
                      className="text-xs whitespace-nowrap"
                      style={{ borderColor: getStageColor(order.current_stage_id) }}
                    >
                      <div 
                        className="w-2 h-2 rounded-full mr-1"
                        style={{ backgroundColor: getStageColor(order.current_stage_id) }}
                      />
                      {order.current_stage_name}
                    </Badge>
                  )}
                  
                  {/* Shipped Status */}
                  {order.is_shipped && (
                    <Badge className="bg-green-600 text-xs">
                      <Truck className="w-3 h-3 mr-1" />
                      Shipped
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No Results Message */}
      {isOpen && query && results.length === 0 && !loading && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg p-4 text-center text-sm text-muted-foreground"
        >
          No orders found matching "{query}"
        </div>
      )}
    </div>
  );
}
