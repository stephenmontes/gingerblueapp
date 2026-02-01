import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function BatchPerformance({ batches }) {
  return (
    <Card className="bg-card border-border" data-testid="report-batch-kpis">
      <CardHeader>
        <CardTitle>Batch Performance</CardTitle>
      </CardHeader>
      <CardContent>
        {batches && batches.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>Batch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead className="text-right">Good</TableHead>
                <TableHead className="text-right">Rejection %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.batch_id} className="border-border">
                  <TableCell className="font-medium">{batch.name}</TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={batch.status === "active" ? "text-green-400 border-green-400/30" : "text-muted-foreground"}
                    >
                      {batch.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{batch.completed}</TableCell>
                  <TableCell className="text-right font-mono text-red-400">{batch.rejected}</TableCell>
                  <TableCell className="text-right font-mono text-green-400">{batch.good_frames}</TableCell>
                  <TableCell className="text-right">
                    <Badge 
                      variant="outline" 
                      className={batch.rejection_rate > 5 ? "text-red-400 border-red-400/30 bg-red-500/10" : "text-muted-foreground"}
                    >
                      {batch.rejection_rate}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-8 text-center text-muted-foreground">No batch data available</div>
        )}
      </CardContent>
    </Card>
  );
}
