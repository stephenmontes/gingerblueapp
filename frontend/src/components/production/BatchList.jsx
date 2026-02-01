import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package } from "lucide-react";
import { BatchCard } from "./BatchCard";

export function BatchList({ batches, selectedBatch, onSelectBatch }) {
  const isEmpty = !batches || batches.length === 0;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="py-3">
        <CardTitle className="text-lg">Production Batches</CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <ScrollArea className="h-[calc(100vh-300px)]">
          {isEmpty ? (
            <EmptyBatchList />
          ) : (
            <BatchListItems 
              batches={batches} 
              selectedBatch={selectedBatch} 
              onSelectBatch={onSelectBatch} 
            />
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function EmptyBatchList() {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p className="text-sm">No batches yet</p>
    </div>
  );
}

function BatchListItems({ batches, selectedBatch, onSelectBatch }) {
  const selectedId = selectedBatch ? selectedBatch.batch_id : null;

  return (
    <div className="space-y-2">
      {batches.map((batch) => (
        <BatchCard
          key={batch.batch_id}
          batch={batch}
          isSelected={selectedId === batch.batch_id}
          onSelect={onSelectBatch}
        />
      ))}
    </div>
  );
}
