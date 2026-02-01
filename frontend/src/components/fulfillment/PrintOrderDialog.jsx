import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, X, Package, MapPin, Phone, Mail, Calendar, Hash } from "lucide-react";

// Size sort order
const SIZE_ORDER = { 'S': 0, 'L': 1, 'XL': 2, 'HS': 3, 'HX': 4, 'XX': 5, 'XXX': 6 };

function getSizeFromSku(sku) {
  if (!sku) return "—";
  const parts = sku.replace(/_/g, '-').replace(/\./g, '-').split('-').filter(p => p.trim());
  if (parts.length >= 2) return parts[parts.length - 2].toUpperCase();
  return parts[0]?.toUpperCase() || "—";
}

function sortBySize(items) {
  return [...items].sort((a, b) => {
    const sizeA = getSizeFromSku(a.sku);
    const sizeB = getSizeFromSku(b.sku);
    const orderA = SIZE_ORDER[sizeA] ?? 99;
    const orderB = SIZE_ORDER[sizeB] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return sizeA.localeCompare(sizeB);
  });
}

export function PrintOrderDialog({ order, currentStage, onClose }) {
  const printRef = useRef(null);

  if (!order) return null;

  const items = order.items || order.line_items || [];
  const sortedItems = sortBySize(items);
  const orderNumber = order.order_number || order.order_id?.slice(-8);
  const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A';

  function handlePrint() {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Order #${orderNumber} - Print</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 20px;
              color: #1a1a1a;
              font-size: 12px;
              line-height: 1.4;
            }
            .header { 
              display: flex; 
              justify-content: space-between; 
              align-items: flex-start;
              border-bottom: 2px solid #333; 
              padding-bottom: 15px; 
              margin-bottom: 15px; 
            }
            .logo { font-size: 24px; font-weight: bold; }
            .order-info { text-align: right; }
            .order-number { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
            .order-meta { color: #666; font-size: 11px; }
            .section { margin-bottom: 20px; }
            .section-title { 
              font-size: 14px; 
              font-weight: bold; 
              margin-bottom: 10px; 
              padding-bottom: 5px;
              border-bottom: 1px solid #ddd;
            }
            .customer-grid { 
              display: grid; 
              grid-template-columns: 1fr 1fr; 
              gap: 15px; 
            }
            .customer-box { padding: 10px; background: #f5f5f5; border-radius: 4px; }
            .customer-label { font-size: 10px; color: #666; margin-bottom: 3px; }
            .customer-value { font-weight: 500; }
            table { width: 100%; border-collapse: collapse; }
            th, td { 
              padding: 8px 10px; 
              text-align: left; 
              border-bottom: 1px solid #ddd; 
            }
            th { 
              background: #f0f0f0; 
              font-weight: 600; 
              font-size: 11px;
              text-transform: uppercase;
            }
            .size-badge { 
              background: #333; 
              color: white; 
              padding: 2px 8px; 
              border-radius: 3px; 
              font-weight: bold;
              font-size: 11px;
            }
            .qty { text-align: center; font-weight: 500; }
            .checkbox-col { width: 30px; }
            .checkbox { 
              width: 18px; 
              height: 18px; 
              border: 2px solid #333; 
              border-radius: 3px; 
              display: inline-block;
            }
            .sku { font-family: monospace; font-size: 11px; }
            .footer { 
              margin-top: 30px; 
              padding-top: 15px; 
              border-top: 1px solid #ddd;
              display: flex;
              justify-content: space-between;
              font-size: 10px;
              color: #666;
            }
            .stage-badge {
              display: inline-block;
              padding: 4px 12px;
              background: #333;
              color: white;
              border-radius: 4px;
              font-weight: bold;
            }
            .notes-box {
              margin-top: 20px;
              padding: 15px;
              border: 1px dashed #999;
              border-radius: 4px;
              min-height: 80px;
            }
            .notes-title { font-weight: 600; margin-bottom: 10px; }
            @media print {
              body { padding: 10px; }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    // Delay print to ensure styles are loaded
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Printer className="w-5 h-5 text-primary" />
            Print Order
            <Badge variant="outline" className="font-mono">#{orderNumber}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Print Preview */}
        <div 
          ref={printRef}
          className="bg-white text-black p-6 rounded-lg border"
          style={{ minHeight: '400px' }}
        >
          {/* Header */}
          <div className="header">
            <div>
              <div className="logo">ShopFactory</div>
              <div className="order-meta">Manufacturing & Fulfillment</div>
            </div>
            <div className="order-info">
              <div className="order-number">Order #{orderNumber}</div>
              <div className="order-meta">
                <div>Date: {orderDate}</div>
                <div>Stage: <span className="stage-badge">{currentStage?.name || order.fulfillment_stage_name || 'N/A'}</span></div>
                {order.batch_name && <div>Batch: {order.batch_name}</div>}
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="section">
            <div className="section-title">Customer Information</div>
            <div className="customer-grid">
              <div className="customer-box">
                <div className="customer-label">Name</div>
                <div className="customer-value">{order.customer_name || 'N/A'}</div>
              </div>
              <div className="customer-box">
                <div className="customer-label">Email</div>
                <div className="customer-value">{order.customer_email || 'N/A'}</div>
              </div>
              {order.shipping_address && (
                <div className="customer-box" style={{ gridColumn: 'span 2' }}>
                  <div className="customer-label">Shipping Address</div>
                  <div className="customer-value">
                    {order.shipping_address.address1}
                    {order.shipping_address.address2 && `, ${order.shipping_address.address2}`}
                    <br />
                    {order.shipping_address.city}, {order.shipping_address.province} {order.shipping_address.zip}
                    <br />
                    {order.shipping_address.country}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="section">
            <div className="section-title">Order Items ({sortedItems.length} items)</div>
            <table>
              <thead>
                <tr>
                  <th className="checkbox-col">Done</th>
                  <th style={{ width: '60px' }}>Size</th>
                  <th style={{ width: '140px' }}>SKU</th>
                  <th>Item Name</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Qty</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Completed</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item, idx) => {
                  const size = getSizeFromSku(item.sku);
                  const qtyNeeded = item.qty || item.quantity || 1;
                  const qtyDone = item.qty_done || 0;
                  return (
                    <tr key={idx}>
                      <td className="checkbox-col">
                        <span className="checkbox"></span>
                      </td>
                      <td>
                        <span className="size-badge">{size}</span>
                      </td>
                      <td className="sku">{item.sku || 'N/A'}</td>
                      <td>{item.name || item.title || 'Unknown Item'}</td>
                      <td className="qty">{qtyNeeded}</td>
                      <td className="qty">{qtyDone} / {qtyNeeded}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Notes Section */}
          <div className="notes-box">
            <div className="notes-title">Notes:</div>
            {order.note && <p>{order.note}</p>}
          </div>

          {/* Footer */}
          <div className="footer">
            <div>Printed: {new Date().toLocaleString()}</div>
            <div>ShopFactory - Manufacturing & Fulfillment Hub</div>
          </div>
        </div>

        {/* Print Button */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" />
            Close
          </Button>
          <Button onClick={handlePrint} data-testid="print-order-btn">
            <Printer className="w-4 h-4 mr-2" />
            Print Order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
