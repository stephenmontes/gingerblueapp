import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Users } from "lucide-react";

export function OrderDetailsDialog({ order, onClose }) {
  if (!order) return null;

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            Order #{order.order_number} - Time Report
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Total Time</p>
            <p className="text-xl font-bold">{formatTime(order.total_minutes)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Items</p>
            <p className="text-xl font-bold">{order.total_items}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cost/Frame</p>
            <p className="text-xl font-bold text-green-400">${order.cost_per_item.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Cost</p>
            <p className="text-xl font-bold text-primary">${order.labor_cost.toFixed(2)}</p>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium mb-3">Time Entries</p>
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>User</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.time_entries.map((entry, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="w-3 h-3 text-muted-foreground" />
                      {entry.user_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{entry.stage_name}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatTime(entry.duration_minutes)}
                  </TableCell>
                  <TableCell className="text-right">{entry.items_processed}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {entry.completed_at ? new Date(entry.completed_at).toLocaleDateString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatTime(minutes) {
  if (!minutes || minutes === 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
