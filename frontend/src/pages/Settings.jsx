import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Store, Plus, Trash2, Settings2, Workflow, ExternalLink, ShoppingBag, RefreshCw, CheckCircle2, Webhook, Copy, Edit, Loader2 } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

function PlatformIcon(props) {
  const { platform } = props;
  if (platform === "shopify") {
    return (
      <div className="w-10 h-10 rounded-lg bg-green-400/10 flex items-center justify-center">
        <ShoppingBag className="w-5 h-5 text-green-400" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg bg-orange-400/10 flex items-center justify-center">
      <Store className="w-5 h-5 text-orange-400" />
    </div>
  );
}

function StoreItem(props) {
  const { store, isManager, isAdmin, syncing, onSync, onEdit, onWebhook, onDelete } = props;
  const platformColor = store.platform === "shopify" ? "text-green-400 bg-green-400/10 border-green-400/20" : "text-orange-400 bg-orange-400/10 border-orange-400/20";
  const statusColor = store.is_active ? "text-green-400 bg-green-400/10 border-green-400/20" : "text-red-400 bg-red-400/10 border-red-400/20";

  return (
    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border" data-testid={"store-item-" + store.store_id}>
      <div className="flex items-center gap-4">
        <PlatformIcon platform={store.platform} />
        <div>
          <p className="font-semibold">{store.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={platformColor}>{store.platform}</Badge>
            {store.shop_url && <span className="text-xs text-muted-foreground font-mono">{store.shop_url}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={statusColor}>{store.is_active ? "Active" : "Inactive"}</Badge>
        {isManager && (
          <>
            <Button variant="ghost" size="sm" onClick={function() { onSync(store.store_id); }} disabled={syncing} data-testid={"sync-store-" + store.store_id}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={function() { onEdit(store); }} data-testid={"edit-store-" + store.store_id}>
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={function() { onWebhook(store); }} data-testid={"webhook-store-" + store.store_id}>
              <Webhook className="w-4 h-4" />
            </Button>
          </>
        )}
        {isAdmin && (
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={function() { onDelete(store.store_id); }} data-testid={"delete-store-" + store.store_id}>
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function StageItem(props) {
  const { stage, index, isLast } = props;
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-border" data-testid={"stage-item-" + stage.stage_id}>
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground font-mono text-sm">{index + 1}</div>
      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: stage.color }} />
      <span className="font-medium flex-1">{stage.name}</span>
      {isLast && (
        <Badge variant="outline" className="text-green-400 bg-green-400/10 border-green-400/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />Final
        </Badge>
      )}
    </div>
  );
}

export default function Settings(props) {
  const { user } = props;
  const [stores, setStores] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addStoreOpen, setAddStoreOpen] = useState(false);
  const [editStoreOpen, setEditStoreOpen] = useState(false);
  const [webhookInfoOpen, setWebhookInfoOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState(null);
  const [syncing, setSyncing] = useState({});
  const [webhookInfo, setWebhookInfo] = useState(null);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStorePlatform, setNewStorePlatform] = useState("shopify");
  const [newStoreUrl, setNewStoreUrl] = useState("");
  const [newStoreApiKey, setNewStoreApiKey] = useState("");
  const [newStoreToken, setNewStoreToken] = useState("");
  const [editStoreUrl, setEditStoreUrl] = useState("");
  const [editStoreApiKey, setEditStoreApiKey] = useState("");
  const [editStoreToken, setEditStoreToken] = useState("");

  async function fetchData() {
    try {
      const storesRes = await fetch(API + "/stores", { credentials: "include" });
      const stagesRes = await fetch(API + "/stages", { credentials: "include" });
      if (storesRes.ok) setStores(await storesRes.json());
      if (stagesRes.ok) setStages(await stagesRes.json());
    } catch (error) {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(function() { fetchData(); }, []);

  async function handleAddStore() {
    if (!newStoreName.trim()) {
      toast.error("Store name is required");
      return;
    }

    try {
      const response = await fetch(API + "/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newStoreName,
          platform: newStorePlatform,
          shop_url: newStoreUrl,
          api_key: newStoreApiKey,
          access_token: newStoreToken,
        }),
      });

      if (response.ok) {
        const store = await response.json();
        setStores(function(prev) { return [...prev, store]; });
        setAddStoreOpen(false);
        setNewStoreName("");
        setNewStoreUrl("");
        setNewStoreApiKey("");
        setNewStoreToken("");
        toast.success("Store added successfully");
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to add store");
      }
    } catch (error) {
      toast.error("Failed to add store");
    }
  }

  async function handleUpdateStore() {
    if (!selectedStore) return;

    try {
      const updateData = {};
      if (editStoreUrl) updateData.shop_url = editStoreUrl;
      if (editStoreApiKey) updateData.api_key = editStoreApiKey;
      if (editStoreToken) updateData.access_token = editStoreToken;

      const response = await fetch(API + "/stores/" + selectedStore.store_id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        toast.success("Store credentials updated");
        setEditStoreOpen(false);
        fetchData();
      } else {
        toast.error("Failed to update store");
      }
    } catch (error) {
      toast.error("Failed to update store");
    }
  }

  async function handleDeleteStore(storeId) {
    if (!window.confirm("Are you sure you want to delete this store?")) return;
    
    try {
      const response = await fetch(API + "/stores/" + storeId, { method: "DELETE", credentials: "include" });
      if (response.ok) {
        setStores(function(prev) { return prev.filter(function(s) { return s.store_id !== storeId; }); });
        toast.success("Store deleted");
      } else {
        toast.error("Failed to delete store");
      }
    } catch (error) {
      toast.error("Failed to delete store");
    }
  }

  async function handleSyncStore(storeId) {
    setSyncing(function(prev) { return { ...prev, [storeId]: true }; });
    try {
      const response = await fetch(API + "/stores/" + storeId + "/sync", { method: "POST", credentials: "include" });
      if (response.ok) {
        const result = await response.json();
        toast.success(result.message);
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.detail || "Sync failed");
      }
    } catch (error) {
      toast.error("Sync failed");
    } finally {
      setSyncing(function(prev) { return { ...prev, [storeId]: false }; });
    }
  }

  async function handleSyncAll() {
    setSyncing(function(prev) { return { ...prev, all: true }; });
    try {
      const response = await fetch(API + "/stores/sync-all", { method: "POST", credentials: "include" });
      if (response.ok) {
        const result = await response.json();
        toast.success(result.message);
        fetchData();
      } else {
        toast.error("Sync failed");
      }
    } catch (error) {
      toast.error("Sync failed");
    } finally {
      setSyncing(function(prev) { return { ...prev, all: false }; });
    }
  }

  async function handleGetWebhookInfo(store) {
    setSelectedStore(store);
    setWebhookInfo(null);
    setWebhookInfoOpen(true);

    try {
      const response = await fetch(API + "/webhooks/info/" + store.store_id, { credentials: "include" });
      if (response.ok) setWebhookInfo(await response.json());
    } catch (error) {
      toast.error("Failed to get webhook info");
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  function openEditStore(store) {
    setSelectedStore(store);
    setEditStoreUrl(store.shop_url || "");
    setEditStoreApiKey("");
    setEditStoreToken("");
    setEditStoreOpen(true);
  }

  if (loading) {
    return (
      <div className="space-y-6" data-testid="settings-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <Card className="bg-card border-border animate-pulse">
          <CardContent className="p-6 h-48" />
        </Card>
      </div>
    );
  }

  const isAdmin = user && user.role === "admin";
  const isManager = user && (user.role === "manager" || user.role === "admin");

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage store connections and production workflow</p>
        </div>
        {isManager && (
          <Button onClick={handleSyncAll} disabled={syncing.all} className="gap-2" data-testid="sync-all-btn">
            {syncing.all ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync All Stores
          </Button>
        )}
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5" />
              Connected Stores
            </CardTitle>
            <CardDescription>Manage your Shopify and Etsy store connections</CardDescription>
          </div>
          {isManager && (
            <Button onClick={function() { setAddStoreOpen(true); }} className="gap-2" data-testid="add-store-btn">
              <Plus className="w-4 h-4" />
              Add Store
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {stores.length === 0 ? (
            <div className="text-center py-8">
              <Store className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-semibold mb-2">No stores connected</p>
              <p className="text-muted-foreground mb-4">Connect your Shopify or Etsy stores to sync orders</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stores.map(function(store) {
                return (
                  <StoreItem
                    key={store.store_id}
                    store={store}
                    isManager={isManager}
                    isAdmin={isAdmin}
                    syncing={syncing[store.store_id]}
                    onSync={handleSyncStore}
                    onEdit={openEditStore}
                    onWebhook={handleGetWebhookInfo}
                    onDelete={handleDeleteStore}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addStoreOpen} onOpenChange={setAddStoreOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Store</DialogTitle>
            <DialogDescription>Connect your Shopify or Etsy store to sync orders</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={newStorePlatform} onValueChange={setNewStorePlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shopify">Shopify</SelectItem>
                  <SelectItem value="etsy">Etsy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Store Name *</Label>
              <Input placeholder="My Store" value={newStoreName} onChange={function(e) { setNewStoreName(e.target.value); }} data-testid="store-name-input" />
            </div>
            <div className="space-y-2">
              <Label>{newStorePlatform === "shopify" ? "Shop URL *" : "Shop ID *"}</Label>
              <Input placeholder={newStorePlatform === "shopify" ? "mystore.myshopify.com" : "12345678"} value={newStoreUrl} onChange={function(e) { setNewStoreUrl(e.target.value); }} data-testid="shop-url-input" />
            </div>
            {newStorePlatform === "etsy" && (
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input type="password" placeholder="Your API key" value={newStoreApiKey} onChange={function(e) { setNewStoreApiKey(e.target.value); }} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Access Token *</Label>
              <Input type="password" placeholder={newStorePlatform === "shopify" ? "shpat_xxxxx..." : "OAuth token"} value={newStoreToken} onChange={function(e) { setNewStoreToken(e.target.value); }} data-testid="access-token-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={function() { setAddStoreOpen(false); }}>Cancel</Button>
            <Button onClick={handleAddStore} data-testid="save-store-btn">Add Store</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editStoreOpen} onOpenChange={setEditStoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Store Credentials</DialogTitle>
            <DialogDescription>Update API credentials for {selectedStore ? selectedStore.name : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{selectedStore && selectedStore.platform === "shopify" ? "Shop URL" : "Shop ID"}</Label>
              <Input placeholder={selectedStore && selectedStore.platform === "shopify" ? "mystore.myshopify.com" : "12345678"} value={editStoreUrl} onChange={function(e) { setEditStoreUrl(e.target.value); }} />
            </div>
            {selectedStore && selectedStore.platform === "etsy" && (
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input type="password" placeholder="Enter new API key" value={editStoreApiKey} onChange={function(e) { setEditStoreApiKey(e.target.value); }} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Access Token</Label>
              <Input type="password" placeholder="Enter new token to update" value={editStoreToken} onChange={function(e) { setEditStoreToken(e.target.value); }} />
              <p className="text-xs text-muted-foreground">Leave empty to keep existing</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={function() { setEditStoreOpen(false); }}>Cancel</Button>
            <Button onClick={handleUpdateStore}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={webhookInfoOpen} onOpenChange={setWebhookInfoOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="w-5 h-5" />
              Webhook Setup
            </DialogTitle>
          </DialogHeader>
          {webhookInfo ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <div className="flex gap-2">
                  <Input readOnly value={webhookInfo.webhook_url} className="font-mono text-sm" />
                  <Button variant="outline" size="icon" onClick={function() { copyToClipboard(webhookInfo.webhook_url); }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {webhookInfo.events_to_subscribe && (
                <div className="space-y-2">
                  <Label>Events</Label>
                  <div className="flex gap-2 flex-wrap">
                    {webhookInfo.events_to_subscribe.map(function(e) { return <Badge key={e} variant="secondary">{e}</Badge>; })}
                  </div>
                </div>
              )}
              <div className="bg-muted/50 rounded-lg p-4">
                <Label className="mb-2 block">Setup Instructions</Label>
                {webhookInfo.setup_instructions && webhookInfo.setup_instructions.map(function(instruction, idx) { return <p key={idx} className="text-sm text-muted-foreground">{instruction}</p>; })}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="w-5 h-5" />
            Production Stages
          </CardTitle>
          <CardDescription>Your manufacturing workflow stages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stages.map(function(stage, index) {
              return <StageItem key={stage.stage_id} stage={stage} index={index} isLast={index === stages.length - 1} />;
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Integration Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-green-400" />
                <h3 className="font-semibold">Shopify</h3>
              </div>
              <p className="text-sm text-muted-foreground">Go to Shopify Admin → Settings → Apps → Develop apps to get your Admin API access token.</p>
              <Button variant="link" className="px-0 text-primary h-auto" asChild>
                <a href="https://help.shopify.com/en/manual/apps/app-types/custom-apps" target="_blank" rel="noopener noreferrer">
                  Documentation <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </Button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-orange-400" />
                <h3 className="font-semibold">Etsy</h3>
              </div>
              <p className="text-sm text-muted-foreground">Create an app at Etsy Developer Portal to get your API key and complete OAuth for access token.</p>
              <Button variant="link" className="px-0 text-primary h-auto" asChild>
                <a href="https://developers.etsy.com/" target="_blank" rel="noopener noreferrer">
                  Developer Portal <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
