import { Printer, X } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../lib/format.ts';
import type { BusinessProfile, Sale } from '../types/index.ts';

interface ReceiptModalProps {
  sale: Sale | null;
  business: BusinessProfile;
  onClose: () => void;
}

export function ReceiptModal({ sale, business, onClose }: ReceiptModalProps) {
  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:static print:bg-transparent print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden print:border-none print:shadow-none print:max-w-full">
        {/* Modal Header (Hidden on print) */}
        <div className="no-print flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <h2 id="receipt-modal-title" className="text-sm font-semibold text-slate-900">
            Sales Receipt
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Receipt</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              aria-label="Close receipt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div className="p-6 text-slate-900 print:p-2">
          <div className="text-center border-b border-dashed border-slate-300 pb-4">
            <h3 className="font-display text-lg font-bold tracking-tight text-slate-900">
              {business.name}
            </h3>
            {business.location && (
              <p className="text-xs text-slate-600 mt-0.5">{business.location}</p>
            )}
            {business.phone && (
              <p className="text-xs text-slate-600 tabular-nums">Tel: {business.phone}</p>
            )}
          </div>

          <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Receipt No:</span>
              <span className="font-mono font-semibold text-slate-900">
                {sale.receiptNumber}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date:</span>
              <span className="tabular-nums text-slate-800">
                {formatDateTime(sale.saleDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Customer:</span>
              <span className="font-medium text-slate-900">{sale.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Payment Method:</span>
              <span className="font-medium text-slate-900">{sale.paymentMethod}</span>
            </div>
            {sale.payment?.reference && (
              <div className="flex justify-between">
                <span className="text-slate-500">Reference:</span>
                <span className="font-mono text-slate-800">{sale.payment.reference}</span>
              </div>
            )}
          </div>

          <div className="py-3 border-b border-dashed border-slate-300">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="pb-1.5 text-left font-medium">Item</th>
                  <th className="pb-1.5 text-right font-medium">Qty</th>
                  <th className="pb-1.5 text-right font-medium">Price</th>
                  <th className="pb-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sale.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 pr-2 font-medium text-slate-900">
                      {item.productName}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-700">
                      {item.quantity}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-700">
                      {formatCurrency(item.unitSellingPrice, business.currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-slate-900">
                      {formatCurrency(item.subtotal, business.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-3 space-y-1.5">
            <div className="flex items-center justify-between text-base font-bold text-slate-900">
              <span>Total Paid</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(sale.totalAmount, business.currency)}
              </span>
            </div>
            {sale.notes && (
              <p className="text-xs text-slate-500 pt-1">Note: {sale.notes}</p>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
            <p className="font-medium text-slate-700">Thank you for your business!</p>
            <p className="mt-0.5">Powered by BizPocket Lite</p>
          </div>
        </div>
      </div>
    </div>
  );
}
