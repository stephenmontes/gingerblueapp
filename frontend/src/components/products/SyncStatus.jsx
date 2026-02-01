import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Store, RefreshCw, CheckCircle, AlertCircle, Loader2, ShoppingBag } from "lucide-react";

export function SyncStatus({ stores, syncing, onSync, onTestConnection }) {
  if (stores.length === 0) {
    return (
      <Card className="bg-card border-border border-dashed">
        <CardContent className="p-6 text-center">
          <Store className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-2">No Shopify Stores Connected</h3>
          <p className="text-sm text-muted-foreground">
            Add a Shopify store in the Stores settings to sync products.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {stores.map((store) => (
        <Card key={store.store_id} className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">{store.name}</h3>
                  <p className="text-xs text-muted-foreground">{store.shop_url}</p>
                </div>
              </div>
              <Badge 
                variant={store.is_active ? "default" : "secondary"}
                className={store.is_active ? "bg-green-600" : ""}
              >
                {store.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>

            {store.last_product_sync && (
              <p className="text-xs text-muted-foreground mt-3">
                Last synced: {new Date(store.last_product_sync).toLocaleString()}
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onTestConnection(store.store_id)}
                className="flex-1"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Test
              </Button>
              <Button
                size="sm"
                onClick={() => onSync(store.store_id)}
                disabled={syncing === store.store_id}
                className="flex-1"
              >
                {syncing === store.store_id ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1" />
                )}
                Sync Products
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
