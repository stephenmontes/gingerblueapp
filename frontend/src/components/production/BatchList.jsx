import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Archive, Layers } from "lucide-react";
import { BatchCard } from "./BatchCard";

export function BatchList({ batches, selectedBatch, onSelectBatch, onRefresh }) {
  const activeBatches = batches.filter(b => b.status === "active");
  const archivedBatches = batches.filter(b => b.status === "archived");

  return (
    <Card className="bg-card border-border">
      <CardHeader className="py-3">
        <CardTitle className="text-lg">Production Batches</CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-2">
            <TabsTrigger value="active" className="gap-1 text-xs" data-testid="active-batches-tab">
              <Layers className="w-3 h-3" />
              Active ({activeBatches.length})
            </TabsTrigger>
            <TabsTrigger value="archived" className="gap-1 text-xs" data-testid="archived-batches-tab">
              <Archive className="w-3 h-3" />
              History ({archivedBatches.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="active" className="mt-0">
            <ScrollArea className="h-[calc(100vh-350px)]">
              {activeBatches.length === 0 ? (
                <EmptyState message="No active batches" />
              ) : (
                <BatchListItems 
                  batches={activeBatches} 
                  selectedBatch={selectedBatch} 
                  onSelectBatch={onSelectBatch}
                  onRefresh={onRefresh}
                />
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="archived" className="mt-0">
            <ScrollArea className="h-[calc(100vh-350px)]">
              {archivedBatches.length === 0 ? (
                <EmptyState message="No archived batches" />
              ) : (
                <BatchListItems 
                  batches={archivedBatches} 
                  selectedBatch={selectedBatch} 
                  onSelectBatch={onSelectBatch}
                  onRefresh={onRefresh}
                  isArchived
                />
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function BatchListItems({ batches, selectedBatch, onSelectBatch, onRefresh, isArchived }) {
  const selectedId = selectedBatch ? selectedBatch.batch_id : null;

  return (
    <div className="space-y-2">
      {batches.map((batch) => (
        <BatchCard
          key={batch.batch_id}
          batch={batch}
          isSelected={selectedId === batch.batch_id}
          onSelect={onSelectBatch}
          onRefresh={onRefresh}
          isArchived={isArchived}
        />
      ))}
    </div>
  );
}
