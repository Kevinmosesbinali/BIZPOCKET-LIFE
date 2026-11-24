import { useCallback, useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../components/ToastProvider.tsx';
import {
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  formatShortNumber,
  getTodayIsoDate,
} from '../lib/format.ts';
import type { ReportsData } from '../types/index.ts';

type ReportTab = 'sales' | 'expenses' | 'profit' | 'inventory';
type PeriodPreset = 'daily' | 'weekly' | 'monthly' | 'custom';

const CHART_COLORS = ['#0f172a', '#0d9488', '#334155', '#14b8a6', '#64748b', '#0f766e'];

export function ReportsPage() {
  const { authFetch, business } = useAuth();
  const { notify } = useToast();
  const currency = business?.currency || 'MWK';

  const today = getTodayIsoDate();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [period, setPeriod] = useState<PeriodPreset>('monthly');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  const applyPreset = (next: PeriodPreset) => {
    setPeriod(next);
    const now = new Date();
    const todayStr = getTodayIsoDate();
    if (next === 'daily') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (next === 'weekly') {
      const weekAgo = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Blantyre',
      }).format(new Date(now.getTime() - 6 * 86400000));
      setStartDate(weekAgo);
      setEndDate(todayStr);
    } else if (next === 'monthly') {
      setStartDate(`${todayStr.slice(0, 7)}-01`);
      setEndDate(todayStr);
    }
  };

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        period,
        startDate,
        endDate,
      });
      const data = await authFetch<ReportsData>(`/api/reports?${params.toString()}`);
      setReport(data);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to generate report.', 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch, period, startDate, endDate, notify]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    if (!report) return;
    let csvContent = '';
    let filename = `bizpocket-${activeTab}-report-${startDate}-to-${endDate}.csv`;

    if (activeTab === 'sales') {
      const rows = [
        ['Receipt Number', 'Date', 'Customer', 'Payment Method', 'Total', 'Cost', 'Profit'],
        ...report.salesList.map((s) => [
          s.receiptNumber,
          formatDateTime(s.saleDate),
          `"${s.customerName.replace(/"/g, '""')}"`,
          s.paymentMethod,
          String(s.totalAmount),
          String(s.totalCost),
          String(s.profit),
        ]),
      ];
      csvContent = rows.map((r) => r.join(',')).join('\n');
    } else if (activeTab === 'expenses') {
      const rows = [
        ['Date', 'Category', 'Description', 'Payment Method', 'Amount'],
        ...report.expenseList.map((e) => [
          e.expenseDate,
          `"${e.categoryName.replace(/"/g, '""')}"`,
          `"${e.description.replace(/"/g, '""')}"`,
          e.paymentMethod,
          String(e.amount),
        ]),
      ];
      csvContent = rows.map((r) => r.join(',')).join('\n');
    } else if (activeTab === 'profit') {
      const rows = [
        ['Date', 'Sales Revenue', 'Cost of Goods', 'Gross Profit', 'Expenses', 'Net Profit'],
        ...report.timeSeries.map((d) => [
          d.date,
          String(d.sales),
          String(d.cogs),
          String(d.grossProfit),
          String(d.expenses),
          String(d.netProfit),
        ]),
      ];
      csvContent = rows.map((r) => r.join(',')).join('\n');
    } else {
      filename = `bizpocket-inventory-report-${today}.csv`;
      const rows = [
        ['Product', 'SKU', 'Category', 'Quantity', 'Unit', 'Buying Price', 'Selling Price', 'Stock Cost Value', 'Retail Value'],
        ...report.inventorySummary.products.map((p) => [
          `"${p.name.replace(/"/g, '""')}"`,
          p.sku,
          `"${p.categoryName.replace(/"/g, '""')}"`,
          String(p.quantity),
          p.unit,
          String(p.buyingPrice),
          String(p.sellingPrice),
          String(p.buyingPrice * p.quantity),
          String(p.sellingPrice * p.quantity),
        ]),
      ];
      csvContent = rows.map((r) => r.join(',')).join('\n');
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify('CSV report downloaded.', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Business Reports
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {business?.name} · {formatDateOnly(startDate)} to {formatDateOnly(endDate)}
          </p>
        </div>

        <div className="no-print flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <Printer className="h-4 w-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Controls: Report Tabs + Date Filters */}
      <div className="no-print rounded-xl border border-slate-200 bg-white p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              { id: 'sales', label: 'Sales Report' },
              { id: 'expenses', label: 'Expense Report' },
              { id: 'profit', label: 'Profit & Loss' },
              { id: 'inventory', label: 'Inventory Report' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab !== 'inventory' && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(
                [
                  { id: 'daily', label: 'Daily' },
                  { id: 'weekly', label: 'Weekly' },
                  { id: 'monthly', label: 'Monthly' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    period === p.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setPeriod('custom');
                  setStartDate(e.target.value);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setPeriod('custom');
                  setEndDate(e.target.value);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
              />
            </div>
          </div>
        )}
      </div>

      {loading || !report ? (
        <div className="h-80 rounded-xl border border-slate-200 bg-white animate-pulse" />
      ) : (
        <>
          {/* SALES REPORT TAB */}
          {activeTab === 'sales' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Total Sales Revenue</span>
                  <p className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {formatCurrency(report.salesSummary.totalRevenue, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Transactions</span>
                  <p className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {report.salesSummary.count}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Cost of Goods Sold</span>
                  <p className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {formatCurrency(report.salesSummary.totalCOGS, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Gross Profit on Sales</span>
                  <p className="mt-2 font-mono text-xl font-bold text-emerald-700 tabular-nums">
                    {formatCurrency(report.salesSummary.grossProfit, currency)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
                    Sales Trend ({currency})
                  </h2>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report.timeSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis
                          tickFormatter={formatShortNumber}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          width={48}
                        />
                        <Tooltip
                          formatter={(val) => formatCurrency(Number(val), currency)}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar dataKey="sales" name="Sales" fill="#0f172a" radius={[4, 4, 0, 0]} />
                        <Bar
                          dataKey="grossProfit"
                          name="Gross Profit"
                          fill="#0d9488"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
                    Payment Methods
                  </h2>
                  {report.salesSummary.paymentBreakdown.length === 0 ? (
                    <p className="text-sm text-slate-500 py-8 text-center">
                      No sales in selected range
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {report.salesSummary.paymentBreakdown.map((pm) => (
                        <div
                          key={pm.method}
                          className="flex items-center justify-between border-b border-slate-100 pb-2.5 text-sm"
                        >
                          <div>
                            <p className="font-medium text-slate-900">{pm.method}</p>
                            <p className="text-xs text-slate-500">
                              {pm.count} {pm.count === 1 ? 'sale' : 'sales'}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                            {formatCurrency(pm.amount, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Top Products Sold */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Top Selling Products in Period
                  </h2>
                </div>
                {report.salesSummary.topProducts.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No product sales recorded in this date range.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4 text-left font-medium">Product</th>
                          <th className="py-2.5 px-4 text-right font-medium">Units Sold</th>
                          <th className="py-2.5 px-4 text-right font-medium">Revenue</th>
                          <th className="py-2.5 px-4 text-right font-medium">Gross Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.salesSummary.topProducts.map((tp) => (
                          <tr key={tp.name}>
                            <td className="py-2.5 px-4 font-medium text-slate-900">
                              {tp.name}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                              {tp.unitsSold}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold tabular-nums">
                              {formatCurrency(tp.revenue, currency)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-xs text-emerald-700 tabular-nums">
                              {formatCurrency(tp.profit, currency)}
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

          {/* EXPENSE REPORT TAB */}
          {activeTab === 'expenses' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Total Period Expenses</span>
                  <p className="mt-2 font-mono text-2xl font-bold text-red-600 tabular-nums">
                    {formatCurrency(report.expenseSummary.totalExpenses, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Expense Entries</span>
                  <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    {report.expenseSummary.count}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
                    Expenses by Category
                  </h2>
                  {report.expenseSummary.byCategory.length === 0 ? (
                    <p className="py-12 text-center text-sm text-slate-500">
                      No expenses in selected date range.
                    </p>
                  ) : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={report.expenseSummary.byCategory}
                            dataKey="amount"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            outerRadius={85}
                          >
                            {report.expenseSummary.byCategory.map((entry, idx) => (
                              <Cell
                                key={entry.category}
                                fill={CHART_COLORS[idx % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(val) => formatCurrency(Number(val), currency)}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Category Breakdown
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4 text-left font-medium">Category</th>
                          <th className="py-2.5 px-4 text-right font-medium">Entries</th>
                          <th className="py-2.5 px-4 text-right font-medium">Total Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.expenseSummary.byCategory.map((c) => (
                          <tr key={c.category}>
                            <td className="py-2.5 px-4 font-medium text-slate-900">
                              {c.category}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                              {c.count}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-red-600 tabular-nums">
                              {formatCurrency(c.amount, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PROFIT & LOSS REPORT TAB */}
          {activeTab === 'profit' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Total Revenue</span>
                  <p className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {formatCurrency(report.profitSummary.revenue, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Gross Profit (after COGS)</span>
                  <p className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {formatCurrency(report.profitSummary.grossProfit, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Operating Expenses</span>
                  <p className="mt-2 font-mono text-xl font-bold text-red-600 tabular-nums">
                    {formatCurrency(report.profitSummary.operatingExpenses, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">
                    Net Profit ({report.profitSummary.marginPercent.toFixed(1)}% margin)
                  </span>
                  <p
                    className={`mt-2 font-mono text-xl font-bold tabular-nums ${
                      report.profitSummary.netProfit >= 0
                        ? 'text-emerald-700'
                        : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(report.profitSummary.netProfit, currency)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
                  Revenue vs Expenses & Net Profit ({currency})
                </h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis
                        tickFormatter={formatShortNumber}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        width={48}
                      />
                      <Tooltip
                        formatter={(val) => formatCurrency(Number(val), currency)}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="sales" name="Revenue" fill="#0f172a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" name="Expenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="netProfit" name="Net Profit" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* INVENTORY REPORT TAB */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Total Products / Units</span>
                  <p className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {report.inventorySummary.totalSkus} SKUs · {report.inventorySummary.totalUnits} units
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Stock Value (Cost)</span>
                  <p className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {formatCurrency(report.inventorySummary.inventoryCostValue, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Stock Value (Retail)</span>
                  <p className="mt-2 font-mono text-xl font-bold text-teal-700 tabular-nums">
                    {formatCurrency(report.inventorySummary.inventoryRetailValue, currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="text-xs text-slate-500">Projected Gross Profit</span>
                  <p className="mt-2 font-mono text-xl font-bold text-emerald-700 tabular-nums">
                    {formatCurrency(report.inventorySummary.potentialGrossProfit, currency)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Complete Inventory Valuation
                  </h2>
                  <span className="text-xs text-slate-500">
                    {report.inventorySummary.lowStockCount} low stock ·{' '}
                    {report.inventorySummary.outOfStockCount} out of stock
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4 text-left font-medium">Product</th>
                        <th className="py-2.5 px-4 text-left font-medium">Category</th>
                        <th className="py-2.5 px-4 text-right font-medium">Stock Qty</th>
                        <th className="py-2.5 px-4 text-right font-medium">Cost Price</th>
                        <th className="py-2.5 px-4 text-right font-medium">Selling Price</th>
                        <th className="py-2.5 px-4 text-right font-medium">Total Cost Value</th>
                        <th className="py-2.5 px-4 text-right font-medium">Total Retail Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.inventorySummary.products.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2.5 px-4 font-medium text-slate-900">{p.name}</td>
                          <td className="py-2.5 px-4 text-xs text-slate-600">{p.categoryName}</td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                            {p.quantity} {p.unit}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                            {formatCurrency(p.buyingPrice, currency)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                            {formatCurrency(p.sellingPrice, currency)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                            {formatCurrency(p.buyingPrice * p.quantity, currency)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold tabular-nums">
                            {formatCurrency(p.sellingPrice * p.quantity, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
