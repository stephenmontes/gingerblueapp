import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { XCircle } from "lucide-react";

export function RejectionDialog({ item, amount, onAmountChange, onConfirm, onClose }) {
  if (!item) return null;

  const maxReject = item.quantity || 0;
  const newGoodQty = Math.max(0, item.quantity - amount);

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-500">
            <XCircle className="w-5 h-5" />
            Reject Frames
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <ItemInfo item={item} />
          <WarningMessage />
          <QuantityPreview currentQty={item.quantity} newGoodQty={newGoodQty} />
          <RejectControls 
            amount={amount} 
            maxReject={maxReject} 
            onAmountChange={onAmountChange} 
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={onConfirm}
            disabled={amount <= 0 || amount > maxReject}
            className="bg-red-600 hover:bg-red-700"
            data-testid="confirm-reject-btn"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Reject {amount} Frame{amount !== 1 ? 's' : ''}
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

function WarningMessage() {
  return (
    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
      Rejecting frames will reduce good inventory and add them to rejected inventory.
    </div>
  );
}

function QuantityPreview({ currentQty, newGoodQty }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Current Stock</p>
        <p className="text-2xl font-bold">{currentQty}</p>
      </div>
      <div className="text-2xl text-muted-foreground">→</div>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">After Reject</p>
        <p className="text-2xl font-bold text-green-400">{newGoodQty}</p>
      </div>
    </div>
  );
}

function RejectControls({ amount, maxReject, onAmountChange }) {
  return (
    <div>
      <label className="text-sm font-medium mb-2 block">Quantity to Reject</label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAmountChange(Math.max(1, amount - 10))}
          disabled={amount <= 1}
        >
          -10
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAmountChange(Math.max(1, amount - 1))}
          disabled={amount <= 1}
        >
          -1
        </Button>
        <Input
          type="number"
          min="1"
          max={maxReject}
          value={amount}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 1;
            onAmountChange(Math.min(Math.max(1, val), maxReject));
          }}
          className="w-24 text-center"
          data-testid="reject-amount-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAmountChange(Math.min(maxReject, amount + 1))}
          disabled={amount >= maxReject}
        >
          +1
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAmountChange(Math.min(maxReject, amount + 10))}
          disabled={amount >= maxReject}
        >
          +10
        </Button>
      </div>
    </div>
  );
}
