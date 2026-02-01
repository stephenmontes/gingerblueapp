import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Store,
  Plus,
  Trash2,
  Settings2,
  Workflow,
  ExternalLink,
  ShoppingBag,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PlatformIcon = ({ platform }) => {
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
};

export default function Settings({ user }) {
  const [stores, setStores] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addStoreOpen, setAddStoreOpen] = useState(false);
  const [newStore, setNewStore] = useState({
    name: "",
    platform: "shopify",
    shop_url: "",
    api_key: "",
    access_token: "",
  });

  const fetchData = async () => {
    try {
      const [storesRes, stagesRes] = await Promise.all([
        fetch(`${API}/stores`, { credentials: "include" }),
        fetch(`${API}/stages`, { credentials: "include" }),
      ]);

      if (storesRes.ok) {
        const data = await storesRes.json();
        setStores(data);
      }

      if (stagesRes.ok) {
        const data = await stagesRes.json();
        setStages(data);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddStore = async () => {
    if (!newStore.name.trim()) {
      toast.error("Store name is required");
      return;
    }

    try {
      const response = await fetch(`${API}/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newStore),
      });

      if (response.ok) {
        const store = await response.json();
        setStores((prev) => [...prev, store]);
        setAddStoreOpen(false);
        setNewStore({
          name: "",
          platform: "shopify",
          shop_url: "",
          api_key: "",
          access_token: "",
        });
        toast.success("Store added successfully");
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to add store");
      }
    } catch (error) {
      console.error("Failed to add store:", error);
      toast.error("Failed to add store");
    }
  };

  const handleDeleteStore = async (storeId) => {
    try {
      const response = await fetch(`${API}/stores/${storeId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        setStores((prev) => prev.filter((s) => s.store_id !== storeId));
        toast.success("Store deleted");
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to delete store");
      }
    } catch (error) {
      console.error("Failed to delete store:", error);
      toast.error("Failed to delete store");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" data-testid="settings-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-6">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="bg-card border-border animate-pulse">
              <CardContent className="p-6 h-48" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager" || isAdmin;

  return (
    <div className="space-y-6" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-heading font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage store connections and production workflow
        </p>
      </div>

      {/* Connected Stores */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5" />
              Connected Stores
            </CardTitle>
            <CardDescription>
              Manage your Shopify and Etsy store connections
            </CardDescription>
          </div>
          {isManager && (
            <Dialog open={addStoreOpen} onOpenChange={setAddStoreOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" data-testid="add-store-btn">
                  <Plus className="w-4 h-4" />
                  Add Store
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Store</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="store-name">Store Name *</Label>
                    <Input
                      id="store-name"
                      placeholder="My Shopify Store"
                      value={newStore.name}
                      onChange={(e) =>
                        setNewStore({ ...newStore, name: e.target.value })
                      }
                      data-testid="store-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="platform">Platform</Label>
                    <Select
                      value={newStore.platform}
                      onValueChange={(value) =>
                        setNewStore({ ...newStore, platform: value })
                      }
                    >
                      <SelectTrigger data-testid="platform-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shopify">Shopify</SelectItem>
                        <SelectItem value="etsy">Etsy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shop-url">Shop URL</Label>
                    <Input
                      id="shop-url"
                      placeholder="mystore.myshopify.com"
                      value={newStore.shop_url}
                      onChange={(e) =>
                        setNewStore({ ...newStore, shop_url: e.target.value })
                      }
                      data-testid="shop-url-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-key">API Key</Label>
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="Your API key"
                      value={newStore.api_key}
                      onChange={(e) =>
                        setNewStore({ ...newStore, api_key: e.target.value })
                      }
                      data-testid="api-key-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="access-token">Access Token</Label>
                    <Input
                      id="access-token"
                      type="password"
                      placeholder="Your access token"
                      value={newStore.access_token}
                      onChange={(e) =>
                        setNewStore({ ...newStore, access_token: e.target.value })
                      }
                      data-testid="access-token-input"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddStoreOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddStore} data-testid="save-store-btn">
                    Add Store
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {stores.length === 0 ? (
            <div className="text-center py-8">
              <Store className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-semibold mb-2">No stores connected</p>
              <p className="text-muted-foreground mb-4">
                Connect your Shopify or Etsy stores to sync orders
              </p>
              {isManager && (
                <Button onClick={() => setAddStoreOpen(true)} data-testid="add-first-store-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Store
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {stores.map((store) => (
                <div
                  key={store.store_id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border"
                  data-testid={`store-item-${store.store_id}`}
                >
                  <div className="flex items-center gap-4">
                    <PlatformIcon platform={store.platform} />
                    <div>
                      <p className="font-semibold">{store.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className={
                            store.platform === "shopify"
                              ? "text-green-400 bg-green-400/10 border-green-400/20"
                              : "text-orange-400 bg-orange-400/10 border-orange-400/20"
                          }
                        >
                          {store.platform}
                        </Badge>
                        {store.shop_url && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {store.shop_url}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        store.is_active
                          ? "text-green-400 bg-green-400/10 border-green-400/20"
                          : "text-red-400 bg-red-400/10 border-red-400/20"
                      }
                    >
                      {store.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {isAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            data-testid={`delete-store-${store.store_id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Store</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{store.name}"? This
                              action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteStore(store.store_id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Production Stages */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="w-5 h-5" />
            Production Stages
          </CardTitle>
          <CardDescription>
            Your manufacturing workflow stages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stages.map((stage, index) => (
              <div
                key={stage.stage_id}
                className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-border"
                data-testid={`stage-item-${stage.stage_id}`}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground font-mono text-sm">
                  {index + 1}
                </div>
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="font-medium flex-1">{stage.name}</span>
                {index === stages.length - 1 && (
                  <Badge variant="outline" className="text-green-400 bg-green-400/10 border-green-400/20">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Final
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Production stages are configured by default. Contact support to customize stages.
          </p>
        </CardContent>
      </Card>

      {/* API Info */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Integration Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p className="label-caps mb-2">Shopify Integration</p>
              <p className="text-sm text-muted-foreground">
                To connect your Shopify store, you'll need your Admin API access token.
                Get it from your Shopify admin → Settings → Apps → Develop apps.
              </p>
              <Button variant="link" className="px-0 text-primary" asChild>
                <a
                  href="https://help.shopify.com/en/manual/apps/app-types/custom-apps"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Learn more about Shopify API
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </Button>
            </div>
            <div>
              <p className="label-caps mb-2">Etsy Integration</p>
              <p className="text-sm text-muted-foreground">
                To connect your Etsy store, you'll need an API key from Etsy's developer portal.
              </p>
              <Button variant="link" className="px-0 text-primary" asChild>
                <a
                  href="https://developers.etsy.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Learn more about Etsy API
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
