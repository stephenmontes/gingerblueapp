import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Store, Plus, Trash2, Settings2, Workflow, ExternalLink, ShoppingBag, RefreshCw, CheckCircle2, Webhook, Copy, Edit, Loader2, Bell, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";

export default function Settings({ user }) {
  const [stores, setStores] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addStoreOpen, setAddStoreOpen] = useState(false);
  const [editStore, setEditStore] = useState(null);
  const [syncing, setSyncing] = useState({});
  const [testingConnection, setTestingConnection] = useState(null);
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formPlatform, setFormPlatform] = useState("shopify");
  const [formUrl, setFormUrl] = useState("");
  const [formShopId, setFormShopId] = useState("");
  const [formToken, setFormToken] = useState("");
  const [formApiKey, setFormApiKey] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [storesRes, stagesRes] = await Promise.all([
          fetch(API + "/stores", { credentials: "include" }),
          fetch(API + "/stages", { credentials: "include" }),
        ]);
        if (storesRes.ok) setStores(await storesRes.json());
        if (stagesRes.ok) setStages(await stagesRes.json());
      } catch (err) {
        toast.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const resetForm = () => {
    setFormName("");
    setFormPlatform("shopify");
    setFormUrl("");
    setFormShopId("");
    setFormToken("");
    setFormApiKey("");
  };

  const openAddStore = () => {
    resetForm();
    setEditStore(null);
    setAddStoreOpen(true);
  };

  const openEditStore = (store) => {
    setFormName(store.name || "");
    setFormPlatform(store.platform || "shopify");
    setFormUrl(store.shop_url || "");
    setFormShopId(store.shop_id || "");
    setFormToken(""); // Token is not returned from API for security - leave blank to keep existing
    setFormApiKey(store.api_key || "");
    setEditStore(store);
    setAddStoreOpen(true);
  };

  const handleAddStore = async () => {
    if (!formName.trim()) return toast.error("Store name required");
    
    const storeData = {
      name: formName,
      platform: formPlatform,
    };

    if (formPlatform === "shopify") {
      if (!formUrl.trim()) return toast.error("Shop URL is required");
      if (!formToken.trim() && !editStore) return toast.error("Access Token is required");
      storeData.shop_url = formUrl;
      if (formToken.trim()) storeData.access_token = formToken;
    } else if (formPlatform === "etsy") {
      if (!formShopId.trim()) return toast.error("Shop ID is required");
      if (!formApiKey.trim()) return toast.error("API Key is required");
      if (!formToken.trim() && !editStore) return toast.error("Access Token is required");
      storeData.shop_id = formShopId;
      storeData.api_key = formApiKey;
      if (formToken.trim()) storeData.access_token = formToken;
    }
    // For dropship stores, no additional fields needed - just name and platform

    try {
      let res;
      if (editStore) {
        // Update existing store
        res = await fetch(API + "/stores/" + editStore.store_id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(storeData),
        });
      } else {
        // Create new store
        res = await fetch(API + "/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(storeData),
        });
      }

      if (res.ok) {
        const store = await res.json();
        if (editStore) {
          setStores(stores.map(s => s.store_id === store.store_id ? store : s));
          toast.success("Store updated");
        } else {
          setStores([...stores, store]);
          toast.success("Store added");
        }
        setAddStoreOpen(false);
        setEditStore(null);
        resetForm();
      } else {
        const error = await res.json();
        toast.error(error.detail || "Failed to save store");
      }
    } catch (err) {
      toast.error("Failed to save store");
    }
  };

  const handleTestConnection = async () => {
    // When editing, token can be empty (use existing)
    const needsToken = !editStore; // Only require token for new stores
    
    if (formPlatform === "shopify") {
      if (!formUrl) {
        toast.error("Please enter Shop URL to test");
        return;
      }
      if (needsToken && !formToken) {
        toast.error("Please enter Access Token to test");
        return;
      }
    }
    if (formPlatform === "etsy") {
      if (!formShopId || !formApiKey) {
        toast.error("Please enter Shop ID and API Key to test");
        return;
      }
      if (needsToken && !formToken) {
        toast.error("Please enter Access Token to test");
        return;
      }
    }

    setTestingConnection(true);
    try {
      const testData = {
        platform: formPlatform,
        shop_url: formUrl,
        shop_id: formShopId,
        api_key: formApiKey,
      };
      
      // If editing and no new token provided, tell backend to use existing
      if (editStore && !formToken) {
        testData.store_id = editStore.store_id;
        testData.use_existing_token = true;
      } else {
        testData.access_token = formToken;
      }

      const res = await fetch(API + "/stores/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(testData),
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(`Connected to ${result.shop_name || "store"} successfully!`);
      } else {
        const error = await res.json();
        toast.error(error.detail || "Connection failed");
      }
    } catch (err) {
      toast.error("Connection test failed");
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSync = async (storeId) => {
    setSyncing({ ...syncing, [storeId]: true });
    try {
      const res = await fetch(API + "/stores/" + storeId + "/sync", { method: "POST", credentials: "include" });
      if (res.ok) toast.success("Synced successfully");
      else toast.error("Sync failed");
    } catch (err) {
      toast.error("Sync failed");
    } finally {
      setSyncing({ ...syncing, [storeId]: false });
    }
  };

  const handleSyncAll = async () => {
    setSyncing({ ...syncing, all: true });
    try {
      const res = await fetch(API + "/stores/sync-all", { method: "POST", credentials: "include" });
      if (res.ok) toast.success("All stores synced");
    } catch (err) {
      toast.error("Sync failed");
    } finally {
      setSyncing({ ...syncing, all: false });
    }
  };

  const handleDelete = async (storeId) => {
    if (!window.confirm("Delete this store?")) return;
    try {
      const res = await fetch(API + "/stores/" + storeId, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setStores(stores.filter(s => s.store_id !== storeId));
        toast.success("Deleted");
      }
    } catch (err) {
      toast.error("Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" data-testid="settings-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager" || isAdmin;

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage store connections</p>
        </div>
        {isManager && (
          <Button onClick={handleSyncAll} disabled={syncing.all} className="gap-2" data-testid="sync-all-btn">
            {syncing.all ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync All
          </Button>
        )}
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Store className="w-5 h-5" />Connected Stores</CardTitle>
            <CardDescription>Manage your store connections</CardDescription>
          </div>
          {isManager && (
            <Button onClick={openAddStore} className="gap-2" data-testid="add-store-btn">
              <Plus className="w-4 h-4" />Add Store
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {stores.length === 0 ? (
            <div className="text-center py-8">
              <Store className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-semibold mb-2">No stores connected</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stores.map((store) => {
                const platformStyles = {
                  shopify: { bg: "bg-green-400/10", text: "text-green-400", border: "border-green-400/20" },
                  etsy: { bg: "bg-orange-400/10", text: "text-orange-400", border: "border-orange-400/20" },
                  dropship: { bg: "bg-purple-400/10", text: "text-purple-400", border: "border-purple-400/20" },
                  shipstation: { bg: "bg-blue-400/10", text: "text-blue-400", border: "border-blue-400/20" },
                };
                const style = platformStyles[store.platform] || platformStyles.dropship;
                const platformLabel = {
                  shopify: "Shopify",
                  etsy: "Etsy",
                  dropship: "CSV Upload",
                  shipstation: store.shipstation_marketplace || "ShipStation"
                };
                return (
                <div key={store.store_id} className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border" data-testid={`store-item-${store.store_id}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${style.bg}`}>
                      {store.platform === "shopify" ? <ShoppingBag className={`w-5 h-5 ${style.text}`} /> : <Store className={`w-5 h-5 ${style.text}`} />}
                    </div>
                    <div>
                      <p className="font-semibold">{store.name}</p>
                      <Badge variant="outline" className={`${style.text} ${style.bg} ${style.border}`}>
                        {platformLabel[store.platform] || store.platform}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isManager && (
                      <>
                        {store.platform !== "shipstation" && (
                          <Button variant="ghost" size="sm" onClick={() => openEditStore(store)} data-testid={`edit-store-${store.store_id}`}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {store.platform !== "dropship" && store.platform !== "shipstation" && (
                          <Button variant="ghost" size="sm" onClick={() => handleSync(store.store_id)} disabled={syncing[store.store_id]} data-testid={`sync-store-${store.store_id}`}>
                            {syncing[store.store_id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          </Button>
                        )}
                        {store.platform === "shipstation" && (
                          <Badge variant="outline" className="text-xs text-blue-400">
                            Sync via Orders page
                          </Badge>
                        )}
                      </>
                    )}
                    {isAdmin && store.platform !== "shipstation" && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(store.store_id)} data-testid={`delete-store-${store.store_id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addStoreOpen} onOpenChange={(open) => { setAddStoreOpen(open); if (!open) { setEditStore(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editStore ? "Edit Store" : "Add Store"}</DialogTitle>
            <DialogDescription>
              {editStore ? "Update your store credentials" : "Connect your Shopify or Etsy store"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Platform</Label>
              <Select value={formPlatform} onValueChange={setFormPlatform} disabled={!!editStore}>
                <SelectTrigger data-testid="platform-select"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" className="z-[9999]">
                  <SelectItem value="shopify">Shopify</SelectItem>
                  <SelectItem value="etsy">Etsy</SelectItem>
                  <SelectItem value="dropship">Dropship (CSV Upload)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Store Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="My Store" data-testid="store-name-input" />
            </div>

            {formPlatform === "shopify" ? (
              <>
                <div>
                  <Label>Shop URL <span className="text-destructive">*</span></Label>
                  <Input 
                    value={formUrl} 
                    onChange={(e) => setFormUrl(e.target.value)} 
                    placeholder="mystore.myshopify.com" 
                    data-testid="shop-url-input" 
                  />
                  <p className="text-xs text-muted-foreground mt-1">Your Shopify store URL (without https://)</p>
                </div>
                <div>
                  <Label>Admin API Access Token {!editStore && <span className="text-destructive">*</span>}</Label>
                  <Input 
                    type="password" 
                    value={formToken} 
                    onChange={(e) => setFormToken(e.target.value)} 
                    placeholder={editStore ? "••••••••••••••••  (leave blank to keep current)" : "shpat_xxxxx..."} 
                    data-testid="access-token-input" 
                  />
                  {editStore ? (
                    <p className="text-xs text-green-500 mt-1">
                      ✓ Token saved. Enter a new token only if you want to change it.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      Get from Shopify Admin → Settings → Apps → Develop apps
                    </p>
                  )}
                </div>
              </>
            ) : formPlatform === "etsy" ? (
              <>
                <div>
                  <Label>Shop ID <span className="text-destructive">*</span></Label>
                  <Input 
                    value={formShopId} 
                    onChange={(e) => setFormShopId(e.target.value)} 
                    placeholder="12345678" 
                    data-testid="shop-id-input" 
                  />
                  <p className="text-xs text-muted-foreground mt-1">Your Etsy Shop ID (numeric)</p>
                </div>
                <div>
                  <Label>API Key (Client ID) <span className="text-destructive">*</span></Label>
                  <Input 
                    value={formApiKey} 
                    onChange={(e) => setFormApiKey(e.target.value)} 
                    placeholder="xxxxxxxxxxxxxxxx" 
                    data-testid="api-key-input" 
                  />
                  <p className="text-xs text-muted-foreground mt-1">From Etsy Developer Portal</p>
                </div>
                <div>
                  <Label>Access Token {!editStore && <span className="text-destructive">*</span>}</Label>
                  <Input 
                    type="password" 
                    value={formToken} 
                    onChange={(e) => setFormToken(e.target.value)} 
                    placeholder={editStore ? "••••••••••••••••  (leave blank to keep current)" : "OAuth access token"} 
                    data-testid="access-token-input" 
                  />
                  {editStore ? (
                    <p className="text-xs text-green-500 mt-1">
                      ✓ Token saved. Enter a new token only if you want to change it.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      OAuth 2.0 access token from Etsy
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-purple-400/10 border border-purple-400/20">
                <p className="text-sm text-purple-400">
                  Dropship stores do not require API credentials. Orders are imported via CSV upload on the Orders page.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {formPlatform !== "dropship" && (
              <Button 
                variant="outline" 
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="gap-2"
                data-testid="test-connection-btn"
              >
                {testingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Test Connection
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAddStoreOpen(false)}>Cancel</Button>
              <Button onClick={handleAddStore} data-testid="save-store-btn">
                {editStore ? "Update" : "Add"} Store
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Workflow className="w-5 h-5" />Production Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stages.map((stage, index) => (
              <div key={stage.stage_id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-border" data-testid={`stage-item-${stage.stage_id}`}>
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm">{index + 1}</div>
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="flex-1">{stage.name}</span>
                {index === stages.length - 1 && <Badge variant="outline" className="text-green-400 bg-green-400/10 border-green-400/20"><CheckCircle2 className="w-3 h-3 mr-1" />Final</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Webhooks Section */}
      <WebhooksSettings API={API} stores={stores} isManager={isManager} />

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5" />Integration Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShoppingBag className="w-5 h-5 text-green-400" />
                <h3 className="font-semibold">Shopify</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">Get your Admin API token from Shopify Admin → Settings → Apps → Develop apps</p>
              <a href="https://help.shopify.com/en/manual/apps/app-types/custom-apps" target="_blank" rel="noopener noreferrer" className="text-primary text-sm flex items-center gap-1">
                Documentation <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Store className="w-5 h-5 text-orange-400" />
                <h3 className="font-semibold">Etsy</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">Create an app at Etsy Developer Portal to get API credentials</p>
              <a href="https://developers.etsy.com/" target="_blank" rel="noopener noreferrer" className="text-primary text-sm flex items-center gap-1">
                Developer Portal <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ShipStation Integration */}
      <ShipStationSettings API={API} isManager={isManager} />
    </div>
  );
}

function ShipStationSettings({ API, isManager }) {
  const [connected, setConnected] = useState(null);
  const [testing, setTesting] = useState(false);
  const [carriers, setCarriers] = useState([]);
  const [stores, setStores] = useState([]);
  const [loadingCarriers, setLoadingCarriers] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch(`${API}/shipstation/test-connection`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConnected(true);
        toast.success(data.message || "Connected to ShipStation!");
        // Load carriers and stores
        loadCarriersAndStores();
      } else {
        setConnected(false);
        const error = await res.json();
        toast.error(error.detail || "Connection failed");
      }
    } catch (err) {
      setConnected(false);
      toast.error("Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const loadCarriersAndStores = async () => {
    setLoadingCarriers(true);
    try {
      const [carriersRes, storesRes] = await Promise.all([
        fetch(`${API}/shipstation/carriers`, { credentials: "include" }),
        fetch(`${API}/shipstation/stores`, { credentials: "include" })
      ]);
      
      if (carriersRes.ok) {
        const data = await carriersRes.json();
        setCarriers(data.carriers || []);
      }
      if (storesRes.ok) {
        const data = await storesRes.json();
        setStores(data.stores || []);
      }
    } catch (err) {
      console.error("Failed to load ShipStation data:", err);
    } finally {
      setLoadingCarriers(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-blue-400" />
            <CardTitle>ShipStation Integration</CardTitle>
          </div>
          {connected === true && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Connected</Badge>
          )}
          {connected === false && (
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Not Connected</Badge>
          )}
        </div>
        <CardDescription>
          Connect to ShipStation for shipping rates, labels, and fulfillment tracking
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Button 
            onClick={testConnection} 
            disabled={testing}
            variant={connected ? "outline" : "default"}
            className="gap-2"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {connected ? "Re-test Connection" : "Test Connection"}
          </Button>
          
          {connected && (
            <Button variant="outline" onClick={loadCarriersAndStores} disabled={loadingCarriers} className="gap-2">
              {loadingCarriers ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh Data
            </Button>
          )}
        </div>

        {connected && (
          <div className="grid md:grid-cols-2 gap-6 mt-4">
            {/* ShipStation Stores */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Store className="w-4 h-4" />
                ShipStation Stores ({stores.length})
              </h3>
              {stores.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {stores.map((store) => (
                    <div key={store.storeId} className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border text-sm">
                      <span>{store.storeName}</span>
                      <Badge variant="outline" className="text-xs">{store.marketplaceName || "Manual"}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No stores found</p>
              )}
            </div>

            {/* Carriers */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                Available Carriers ({carriers.length})
              </h3>
              {carriers.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {carriers.slice(0, 10).map((carrier, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border text-sm">
                      <span>{carrier.name}</span>
                      <Badge variant="outline" className="text-xs">{carrier.code}</Badge>
                    </div>
                  ))}
                  {carriers.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">+{carriers.length - 10} more carriers</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No carriers found</p>
              )}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            ShipStation credentials are configured server-side. Contact your administrator to update API keys.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
