import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PlusCircle, MinusCircle } from "lucide-react";

export function AdjustmentDialog({ item, amount, reason, onAmountChange, onReasonChange, onConfirm, onClose }) {
  if (!item) return null;

  const newQuantity = Math.max(0, item.quantity + amount);

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Inventory Quantity</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <ItemInfo item={item} />
          <QuantityPreview currentQty={item.quantity} newQty={newQuantity} />
          <AdjustmentControls 
            amount={amount} 
            currentQty={item.quantity} 
            onAmountChange={onAmountChange} 
          />
          <ReasonInput reason={reason} onReasonChange={onReasonChange} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={onConfirm}
            disabled={amount === 0}
            className={amount < 0 ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
            data-testid="confirm-adjust-btn"
          >
            {amount < 0 ? (
              <>
                <MinusCircle className="w-4 h-4 mr-2" />
                Remove {Math.abs(amount)}
              </>
            ) : (
              <>
                <PlusCircle className="w-4 h-4 mr-2" />
                Add {amount}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemInfo({ item }) {
  return (
    <div className="p-3 bg-muted/30 rounded-lg">
      <p className="font-medium">{item.name}</p>
      <p className="text-sm text-muted-foreground font-mono">{item.sku}</p>
    </div>
  );
}

function QuantityPreview({ currentQty, newQty }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Current</p>
        <p className="text-2xl font-bold">{currentQty}</p>
      </div>
      <div className="text-2xl text-muted-foreground">→</div>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">New</p>
        <p className={`text-2xl font-bold ${newQty < currentQty ? "text-red-400" : newQty > currentQty ? "text-green-400" : ""}`}>
          {newQty}
        </p>
      </div>
    </div>
  );
}

function AdjustmentControls({ amount, currentQty, onAmountChange }) {
  return (
    <div>
      <label className="text-sm font-medium mb-2 block">Adjustment Amount</label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAmountChange(amount - 10)}
          disabled={currentQty + amount - 10 < 0}
        >
          -10
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAmountChange(amount - 1)}
          disabled={currentQty + amount - 1 < 0}
        >
          -1
        </Button>
        <Input
          type="number"
          value={amount}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (currentQty + val >= 0) {
              onAmountChange(val);
            }
          }}
          className="w-24 text-center"
          data-testid="adjust-amount-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAmountChange(amount + 1)}
        >
          +1
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAmountChange(amount + 10)}
        >
          +10
        </Button>
      </div>
    </div>
  );
}

function ReasonInput({ reason, onReasonChange }) {
  return (
    <div>
      <label className="text-sm font-medium mb-2 block">Reason (optional)</label>
      <Input
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="e.g., Received shipment, Damaged items, Inventory count..."
        data-testid="adjust-reason-input"
      />
    </div>
  );
}
