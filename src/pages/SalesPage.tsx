import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Building,
  Minus,
  Plus,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../components/ToastProvider.tsx';
import { ReceiptModal } from '../components/ReceiptModal.tsx';
import { formatCurrency, formatDateTime } from '../lib/format.ts';
import type { Product, Sale } from '../types/index.ts';

interface CartItem {
  product: Product;
  quantity: number;
}

const PAYMENT_METHODS = [
  { id: 'Cash', label: 'Cash', icon: Banknote },
  { id: 'Mobile Money', label: 'Mobile Money', icon: Smartphone },
  { id: 'Bank Transfer', label: 'Bank Transfer', icon: Building },
] as const;

export function SalesPage() {
  const { authFetch, business } = useAuth();
  const { notify } = useToast();
  const currency = business?.currency || 'MWK';

  const [tab, setTab] = useState<'pos' | 'history'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // POS State
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [paymentMethod, setPaymentMethod] =
    useState<'Cash' | 'Mobile Money' | 'Bank Transfer'>('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submittingSale, setSubmittingSale] = useState(false);

  // History Filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Receipt Modal
  const [activeReceipt, setActiveReceipt] = useState<Sale | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRows, saleRows] = await Promise.all([
        authFetch<Product[]>('/api/products'),
        authFetch<Sale[]>('/api/sales'),
      ]);
      setProducts(prodRows);
      setSales(saleRows);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load sales data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + item.product.sellingPrice * item.quantity,
        0
      ),
    [cart]
  );

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const addToCart = (product: Product) => {
    if (product.quantity <= 0) {
      notify(`"${product.name}" is currently out of stock.`, 'error');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) {
          notify(
            `Maximum available stock reached for "${product.name}" (${product.quantity}).`,
            'info'
          );
          return prev;
        }
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateCartQty = (productId: number, nextQty: number) => {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((c) => c.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((c) => {
        if (c.product.id !== productId) return c;
        const clamped = Math.min(nextQty, c.product.quantity);
        if (nextQty > c.product.quantity) {
          notify(
            `Only ${c.product.quantity} ${c.product.unit} available in stock.`,
            'info'
          );
        }
        return { ...c, quantity: clamped };
      })
    );
  };

  const handleCompleteSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      notify('Select at least one product before completing the sale.', 'error');
      return;
    }

    setSubmittingSale(true);
    try {
      const createdSale = await authFetch<Sale>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim() || 'Walk-in Customer',
          paymentMethod,
          paymentReference: paymentReference.trim(),
          notes: notes.trim(),
          items: cart.map((c) => ({
            productId: c.product.id,
            quantity: c.quantity,
          })),
        }),
      });

      notify(
        `Sale ${createdSale.receiptNumber} recorded and inventory updated.`,
        'success'
      );
      setCart([]);
      setCustomerName('Walk-in Customer');
      setPaymentReference('');
      setNotes('');
      setActiveReceipt(createdSale);
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to record sale.', 'error');
    } finally {
      setSubmittingSale(false);
    }
  };

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const q = historySearch.trim().toLowerCase();
      const matchesQuery =
        !q ||
        s.receiptNumber.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.items.some((it) => it.productName.toLowerCase().includes(q));

      const matchesMethod =
        historyPaymentFilter === 'all' || s.paymentMethod === historyPaymentFilter;

      const saleDay = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Blantyre',
      }).format(new Date(s.saleDate));

      const matchesStart = !startDate || saleDay >= startDate;
      const matchesEnd = !endDate || saleDay <= endDate;

      return matchesQuery && matchesMethod && matchesStart && matchesEnd;
    });
  }, [sales, historySearch, historyPaymentFilter, startDate, endDate]);

  return (
    <div className="space-y-6">
      {/* Header + Segmented View Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Sales & Point of Sale
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Record sales, deduct stock automatically, and print customer receipts
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 self-start">
          <button
            type="button"
            onClick={() => setTab('pos')}
            className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'pos'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            New Sale
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'history'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sales History ({sales.length})
          </button>
        </div>
      </div>

      {tab === 'pos' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Product Picker */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products to add to sale..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-medium text-slate-700">
                  {products.length === 0
                    ? 'No products available in inventory'
                    : 'No products match your search'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Add products in the Products & Stock section before recording a sale.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 max-h-[560px] overflow-y-auto">
                {filteredProducts.map((p) => {
                  const outOfStock = p.quantity <= 0;
                  const inCart = cart.find((c) => c.product.id === p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addToCart(p)}
                      className={`text-left rounded-lg border p-3.5 transition-colors ${
                        outOfStock
                          ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                          : inCart
                          ? 'border-teal-600 bg-teal-50/40 hover:bg-teal-50'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {p.name}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {p.categoryName}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(p.sellingPrice, currency)}
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between text-xs">
                        <span
                          className={`font-mono tabular-nums ${
                            outOfStock
                              ? 'text-red-600 font-medium'
                              : p.quantity <= p.lowStockThreshold
                              ? 'text-amber-700 font-medium'
                              : 'text-slate-500'
                          }`}
                        >
                          {outOfStock
                            ? 'Out of stock'
                            : `${p.quantity} ${p.unit} left`}
                        </span>
                        {inCart && (
                          <span className="font-semibold text-teal-700">
                            In cart: {inCart.quantity}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Active Checkout Cart */}
          <form
            onSubmit={handleCompleteSale}
            className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-teal-700" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Current Sale
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {cartItemCount} {cartItemCount === 1 ? 'item' : 'items'}
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-200 rounded-lg">
                <p className="text-sm text-slate-500">
                  Select products on the left to build this sale
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {item.product.name}
                      </p>
                      <p className="text-xs font-mono text-slate-500 tabular-nums">
                        {formatCurrency(item.product.sellingPrice, currency)} each
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateCartQty(item.product.id, item.quantity - 1)
                        }
                        className="h-7 w-7 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={item.product.quantity}
                        value={item.quantity}
                        onChange={(e) =>
                          updateCartQty(
                            item.product.id,
                            Number(e.target.value) || 1
                          )
                        }
                        className="w-12 text-center font-mono text-xs font-semibold border border-slate-200 rounded py-1 tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateCartQty(item.product.id, item.quantity + 1)
                        }
                        className="h-7 w-7 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product.id, 0)}
                        className="ml-1 p-1 text-slate-400 hover:text-red-600"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums w-24 text-right">
                      {formatCurrency(
                        item.product.sellingPrice * item.quantity,
                        currency
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Customer & Payment Method */}
            <div className="space-y-3.5 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in Customer"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((pm) => {
                    const Icon = pm.icon;
                    const active = paymentMethod === pm.id;
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setPaymentMethod(pm.id)}
                        className={`flex flex-col items-center justify-center gap-1 rounded-lg border py-2.5 px-2 text-xs font-medium transition-colors ${
                          active
                            ? 'border-teal-600 bg-teal-50 text-teal-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="truncate max-w-full">{pm.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {paymentMethod !== 'Cash' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {paymentMethod === 'Mobile Money'
                      ? 'Transaction ID (Airtel Money / Mpamba)'
                      : 'Bank Transfer Reference'}
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="Optional transaction reference"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Receipt note..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Grand Total & Checkout Button */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  Total Amount
                </span>
                <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {formatCurrency(cartTotal, currency)}
                </span>
              </div>

              <button
                type="submit"
                disabled={submittingSale || cart.length === 0}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                <Receipt className="h-4 w-4" />
                <span>
                  {submittingSale
                    ? 'Recording Sale...'
                    : 'Complete Sale & Generate Receipt'}
                </span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Sales History View */
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search receipt number, customer, or item..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm focus:bg-white focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={historyPaymentFilter}
                onChange={(e) => setHistoryPaymentFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
              >
                <option value="all">All Payment Methods</option>
                <option value="Cash">Cash</option>
                <option value="Mobile Money">Mobile Money</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>

              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                aria-label="Start date"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                aria-label="End date"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {filteredSales.length === 0 ? (
              <div className="p-10 text-center">
                <Receipt className="h-10 w-10 text-slate-300 mx-auto" />
                <p className="mt-3 text-sm font-medium text-slate-700">
                  No sales transactions found
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Recorded sales will appear here with printable receipts.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 text-left font-medium">Receipt No</th>
                      <th className="py-3 px-4 text-left font-medium">Date & Time</th>
                      <th className="py-3 px-4 text-left font-medium">Customer</th>
                      <th className="py-3 px-4 text-left font-medium">Items</th>
                      <th className="py-3 px-4 text-left font-medium">Payment</th>
                      <th className="py-3 px-4 text-right font-medium">Total</th>
                      <th className="py-3 px-4 text-right font-medium">Profit</th>
                      <th className="py-3 px-4 text-right font-medium">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                          {sale.receiptNumber}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {formatDateTime(sale.saleDate)}
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-800">
                          {sale.customerName}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 max-w-[220px] truncate">
                          {sale.items
                            .map((i) => `${i.productName} ×${i.quantity}`)
                            .join(', ')}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                          {sale.paymentMethod}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(sale.totalAmount, currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-medium text-emerald-700 tabular-nums whitespace-nowrap">
                          {formatCurrency(sale.profit, currency)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setActiveReceipt(sale)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            <span>Receipt</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {business && (
        <ReceiptModal
          sale={activeReceipt}
          business={business}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  );
}
