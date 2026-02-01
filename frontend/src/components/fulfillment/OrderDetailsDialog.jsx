import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
        <OrderSummaryGrid order={order} />
        <TimeEntriesTable entries={order.time_entries} />
      </DialogContent>
    </Dialog>
  );
}

function OrderSummaryGrid({ order }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
      <SummaryItem label="Total Time" value={fmtTime(order.total_minutes)} />
      <SummaryItem label="Items" value={order.total_items} />
      <SummaryItem label="Cost/Frame" value={`$${order.cost_per_item.toFixed(2)}`} className="text-green-400" />
      <SummaryItem label="Total Cost" value={`$${order.labor_cost.toFixed(2)}`} className="text-primary" />
    </div>
  );
}

function SummaryItem({ label, value, className = "" }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${className}`}>{value}</p>
    </div>
  );
}

function TimeEntriesTable({ entries }) {
  return (
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
          {entries.map((entry, i) => (
            <TimeEntryRow key={i} entry={entry} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TimeEntryRow({ entry }) {
  const dateStr = entry.completed_at ? new Date(entry.completed_at).toLocaleDateString() : '—';
  return (
    <TableRow className="border-border">
      <TableCell>
        <div className="flex items-center gap-2">
          <Users className="w-3 h-3 text-muted-foreground" />
          {entry.user_name}
        </div>
      </TableCell>
      <TableCell><Badge variant="outline">{entry.stage_name}</Badge></TableCell>
      <TableCell className="text-right font-mono">{fmtTime(entry.duration_minutes)}</TableCell>
      <TableCell className="text-right">{entry.items_processed}</TableCell>
      <TableCell className="text-right text-sm text-muted-foreground">{dateStr}</TableCell>
    </TableRow>
  );
}

function fmtTime(mins) {
  if (!mins) return "0m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
