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

export default function Settings({ user }) {
  const [stores, setStores] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addStoreOpen, setAddStoreOpen] = useState(false);
  const [syncing, setSyncing] = useState({});
  const [formName, setFormName] = useState("");
  const [formPlatform, setFormPlatform] = useState("shopify");
  const [formUrl, setFormUrl] = useState("");
  const [formToken, setFormToken] = useState("");

  const API = BACKEND_URL + "/api";

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
  }, [API]);

  const handleAddStore = async () => {
    if (!formName.trim()) return toast.error("Store name required");
    try {
      const res = await fetch(API + "/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: formName, platform: formPlatform, shop_url: formUrl, access_token: formToken }),
      });
      if (res.ok) {
        const store = await res.json();
        setStores([...stores, store]);
        setAddStoreOpen(false);
        setFormName(""); setFormUrl(""); setFormToken("");
        toast.success("Store added");
      }
    } catch (err) {
      toast.error("Failed to add store");
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
            <Button onClick={() => setAddStoreOpen(true)} className="gap-2" data-testid="add-store-btn">
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
              {stores.map((store) => (
                <div key={store.store_id} className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border" data-testid={`store-item-${store.store_id}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${store.platform === "shopify" ? "bg-green-400/10" : "bg-orange-400/10"}`}>
                      {store.platform === "shopify" ? <ShoppingBag className="w-5 h-5 text-green-400" /> : <Store className="w-5 h-5 text-orange-400" />}
                    </div>
                    <div>
                      <p className="font-semibold">{store.name}</p>
                      <Badge variant="outline" className={store.platform === "shopify" ? "text-green-400 bg-green-400/10 border-green-400/20" : "text-orange-400 bg-orange-400/10 border-orange-400/20"}>
                        {store.platform}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isManager && (
                      <Button variant="ghost" size="sm" onClick={() => handleSync(store.store_id)} disabled={syncing[store.store_id]} data-testid={`sync-store-${store.store_id}`}>
                        {syncing[store.store_id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(store.store_id)} data-testid={`delete-store-${store.store_id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addStoreOpen} onOpenChange={setAddStoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Store</DialogTitle>
            <DialogDescription>Connect your store to sync orders</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Platform</Label>
              <Select value={formPlatform} onValueChange={setFormPlatform}>
                <SelectTrigger data-testid="platform-select"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" className="z-[9999]">
                  <SelectItem value="shopify">Shopify</SelectItem>
                  <SelectItem value="etsy">Etsy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Store Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="My Store" data-testid="store-name-input" />
            </div>
            <div>
              <Label>{formPlatform === "shopify" ? "Shop URL" : "Shop ID"}</Label>
              <Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder={formPlatform === "shopify" ? "mystore.myshopify.com" : "12345678"} data-testid="shop-url-input" />
            </div>
            <div>
              <Label>Access Token</Label>
              <Input type="password" value={formToken} onChange={(e) => setFormToken(e.target.value)} placeholder="shpat_xxx..." data-testid="access-token-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStoreOpen(false)}>Cancel</Button>
            <Button onClick={handleAddStore} data-testid="save-store-btn">Add</Button>
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
    </div>
  );
}
