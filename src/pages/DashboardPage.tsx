import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Package,
  Plus,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext.tsx';
import { formatCurrency, formatDateOnly, formatShortNumber } from '../lib/format.ts';
import type { DashboardData, Sale } from '../types/index.ts';
import type { NavSection } from '../components/AppLayout.tsx';
import { ReceiptModal } from '../components/ReceiptModal.tsx';

interface DashboardPageProps {
  onNavigate: (section: NavSection) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { authFetch, business } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<Sale | null>(null);

  const currency = business?.currency || 'MWK';

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authFetch<DashboardData>('/api/dashboard');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleOpenReceipt = async (saleId: number) => {
    try {
      const sale = await authFetch<Sale>(`/api/sales/${saleId}`);
      setActiveReceipt(sale);
    } catch {
      // Ignore if sale no longer exists
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 rounded-lg bg-slate-200 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-slate-200 bg-white p-5 animate-pulse"
            >
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="mt-4 h-7 w-32 rounded bg-slate-200" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 rounded-xl border border-slate-200 bg-white animate-pulse" />
          <div className="h-80 rounded-xl border border-slate-200 bg-white animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Could not load dashboard metrics
        </h2>
        <p className="mt-1 text-sm text-slate-600">{error}</p>
        <button
          type="button"
          onClick={loadDashboard}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Business Overview
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Live figures from your PostgreSQL sales, expense, and stock records
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Add Product</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('expenses')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Wallet className="h-4 w-4" />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

      {/* 5 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Today&apos;s Sales</span>
            <Receipt className="h-4 w-4 text-teal-600" />
          </div>
          <p className="mt-2.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(data.todaySalesTotal, currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {data.todaySalesCount} {data.todaySalesCount === 1 ? 'transaction' : 'transactions'} today
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Expenses</span>
            <Wallet className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-2.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(data.totalExpenses, currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Today: {formatCurrency(data.todayExpensesTotal, currency)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Today&apos;s Profit</span>
            <TrendingUp
              className={`h-4 w-4 ${
                data.todayNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            />
          </div>
          <p
            className={`mt-2.5 font-mono text-xl font-bold tabular-nums ${
              data.todayNetProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {formatCurrency(data.todayNetProfit, currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Gross margin: {formatCurrency(data.todayGrossProfit, currency)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Products</span>
            <Package className="h-4 w-4 text-slate-700" />
          </div>
          <p className="mt-2.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {data.totalProducts}
          </p>
          <p className="mt-1 text-xs text-slate-500">Active inventory SKUs</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Low-Stock Alerts</span>
            <AlertTriangle
              className={`h-4 w-4 ${
                data.lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            />
          </div>
          <p
            className={`mt-2.5 font-mono text-xl font-bold tabular-nums ${
              data.lowStockCount > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {data.lowStockCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {data.lowStockCount > 0 ? 'Needs restocking soon' : 'All items healthy'}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Sales Chart */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Weekly Sales & Profit
              </h2>
              <p className="text-xs text-slate-500">Last 7 days performance ({currency})</p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weeklySales} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatShortNumber}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value), currency)}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="sales" name="Sales" fill="#0f172a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="Gross Profit" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Monthly Revenue Chart */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Monthly Revenue vs Expenses
              </h2>
              <p className="text-xs text-slate-500">6-month cashflow trend ({currency})</p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.monthlyRevenue}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatShortNumber}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value), currency)}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="revenue" name="Revenue" fill="#0d9488" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#64748b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Bottom Panels: Recent Transactions & Low-Stock Products */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Transactions */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Recent Transactions
              </h2>
              <p className="text-xs text-slate-500">Latest sales and recorded expenses</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('sales')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap"
            >
              View All Sales
            </button>
          </div>

          {data.recentTransactions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">No transactions recorded yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Add products to your inventory and record your first sale or expense.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('sales')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Record First Sale</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-medium">Reference</th>
                    <th className="py-2.5 px-4 text-left font-medium">Type / Method</th>
                    <th className="py-2.5 px-4 text-left font-medium">Date</th>
                    <th className="py-2.5 px-4 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentTransactions.map((tx) => (
                    <tr
                      key={tx.id}
                      onClick={() => {
                        if (tx.type === 'sale') handleOpenReceipt(tx.rawId);
                      }}
                      className={`hover:bg-slate-50 transition-colors ${
                        tx.type === 'sale' ? 'cursor-pointer' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 truncate max-w-[180px]">
                          {tx.title}
                        </p>
                        <p className="text-xs text-slate-500 truncate max-w-[180px]">
                          {tx.subtitle}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1 font-medium">
                          {tx.type === 'sale' ? (
                            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />
                          )}
                          {tx.type === 'sale' ? 'Sale' : 'Expense'} · {tx.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {formatDateOnly(tx.displayDate)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                          tx.type === 'sale' ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {tx.type === 'sale' ? '+' : '-'}
                        {formatCurrency(tx.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Low-Stock Products */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Low-Stock Products
              </h2>
              <p className="text-xs text-slate-500">Items at or below reorder threshold</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('products')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap"
            >
              Manage Stock
            </button>
          </div>

          {data.lowStockProducts.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                {data.totalProducts === 0
                  ? 'No products added yet'
                  : 'All stock levels are healthy'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {data.totalProducts === 0
                  ? 'Add your shop inventory to monitor low stock automatically.'
                  : 'No items are currently below their low-stock threshold.'}
              </p>
              {data.totalProducts === 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('products')}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add First Product</span>
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.lowStockProducts.map((item) => (
                <div
                  key={item.id}
                  className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.categoryName} · Threshold: {item.lowStockThreshold} {item.unit}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`font-mono text-sm font-bold tabular-nums ${
                        item.quantity === 0 ? 'text-red-600' : 'text-amber-700'
                      }`}
                    >
                      {item.quantity} {item.unit}
                    </p>
                    <p
                      className={`text-[11px] font-medium ${
                        item.quantity === 0 ? 'text-red-600' : 'text-amber-700'
                      }`}
                    >
                      {item.quantity === 0 ? 'Out of Stock' : 'Low Stock'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

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
