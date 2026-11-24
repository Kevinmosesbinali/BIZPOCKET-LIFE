import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, FolderPlus, Plus, Search, Trash2, Wallet, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../components/ToastProvider.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { formatCurrency, formatDateOnly, getTodayIsoDate } from '../lib/format.ts';
import type { Category, Expense } from '../types/index.ts';

interface ExpenseFormState {
  categoryId: string;
  description: string;
  amount: string;
  paymentMethod: string;
  expenseDate: string;
}

const emptyExpenseForm = (): ExpenseFormState => ({
  categoryId: '',
  description: '',
  amount: '',
  paymentMethod: 'Cash',
  expenseDate: getTodayIsoDate(),
});

export function ExpensesPage() {
  const { authFetch, business } = useAuth();
  const { notify } = useToast();
  const currency = business?.currency || 'MWK';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseFormState>(emptyExpenseForm);
  const [saving, setSaving] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [expRows, catRows] = await Promise.all([
        authFetch<Expense[]>('/api/expenses'),
        authFetch<Category[]>('/api/categories?type=expense'),
      ]);
      setExpenses(expRows);
      setCategories(catRows);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load expenses.', 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      const matchesSearch =
        !q ||
        e.description.toLowerCase().includes(q) ||
        e.categoryName.toLowerCase().includes(q);
      const matchesCat =
        categoryFilter === 'all' || String(e.categoryId ?? '') === categoryFilter;
      const matchesStart = !startDate || e.expenseDate >= startDate;
      const matchesEnd = !endDate || e.expenseDate <= endDate;
      return matchesSearch && matchesCat && matchesStart && matchesEnd;
    });
  }, [expenses, search, categoryFilter, startDate, endDate]);

  const totalFiltered = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );

  const todayExpenses = useMemo(() => {
    const today = getTodayIsoDate();
    return expenses
      .filter((e) => e.expenseDate === today)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const monthExpenses = useMemo(() => {
    const prefix = getTodayIsoDate().slice(0, 7);
    return expenses
      .filter((e) => e.expenseDate.startsWith(prefix))
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const openAddModal = () => {
    setEditingExpense(null);
    const defaultForm = emptyExpenseForm();
    if (categories.length > 0) {
      defaultForm.categoryId = String(categories[0].id);
    }
    setForm(defaultForm);
    setModalOpen(true);
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setForm({
      categoryId: expense.categoryId ? String(expense.categoryId) : '',
      description: expense.description,
      amount: String(expense.amount),
      paymentMethod: expense.paymentMethod,
      expenseDate: expense.expenseDate,
    });
    setModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const selectedCat = categories.find((c) => String(c.id) === form.categoryId);
      const payload = {
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        categoryName: selectedCat?.name || 'General',
        description: form.description,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        expenseDate: form.expenseDate,
      };

      if (editingExpense) {
        await authFetch(`/api/expenses/${editingExpense.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('Expense updated.', 'success');
      } else {
        await authFetch('/api/expenses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('Expense recorded.', 'success');
      }

      setModalOpen(false);
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save expense.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await authFetch(`/api/expenses/${deleteTarget.id}`, { method: 'DELETE' });
      notify('Expense record deleted.', 'success');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete expense.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setAddingCategory(true);
    try {
      const created = await authFetch<Category>('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCategoryName.trim(), type: 'expense' }),
      });
      setCategories((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewCategoryName('');
      notify(`Expense category "${created.name}" created.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to add category.', 'error');
    } finally {
      setAddingCategory(false);
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    try {
      await authFetch(`/api/categories/${cat.id}`, { method: 'DELETE' });
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      notify(`Removed category "${cat.name}".`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete category.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Expense Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track rent, ESCOM electricity, transport, stock purchases, and operating costs
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setCategoryModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <FolderPlus className="h-4 w-4" />
            <span>Categories</span>
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <span className="text-xs font-medium text-slate-500">Today&apos;s Expenses</span>
          <p className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(todayExpenses, currency)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <span className="text-xs font-medium text-slate-500">This Month</span>
          <p className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(monthExpenses, currency)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <span className="text-xs font-medium text-slate-500">
            Filtered Total ({filteredExpenses.length})
          </span>
          <p className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(totalFiltered, currency)}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expense description or category..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm focus:bg-white focus:border-teal-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {cat.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
            aria-label="Filter from date"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
            aria-label="Filter to date"
          />
        </div>
      </div>

      {/* Expense Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet className="h-10 w-10 text-slate-300 mx-auto" />
            <h2 className="mt-3 font-display text-base font-semibold text-slate-900">
              {expenses.length === 0
                ? 'No expenses recorded yet'
                : 'No expenses match your filters'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {expenses.length === 0
                ? 'Log your shop rent, utilities, transport, or restocking expenses.'
                : 'Adjust your date range or category filter.'}
            </p>
            {expenses.length === 0 && (
              <button
                type="button"
                onClick={openAddModal}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                <Plus className="h-4 w-4" />
                <span>Record First Expense</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-left font-medium">Date</th>
                  <th className="py-3 px-4 text-left font-medium">Category</th>
                  <th className="py-3 px-4 text-left font-medium">Description</th>
                  <th className="py-3 px-4 text-left font-medium">Paid Via</th>
                  <th className="py-3 px-4 text-right font-medium">Amount</th>
                  <th className="py-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {formatDateOnly(exp.expenseDate)}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-800 whitespace-nowrap">
                      {exp.categoryName}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-900">
                      {exp.description}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {exp.paymentMethod}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-red-600 tabular-nums whitespace-nowrap">
                      {formatCurrency(exp.amount, currency)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(exp)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          aria-label={`Edit ${exp.description}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(exp)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${exp.description}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Expense Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="font-display text-base font-semibold text-slate-900">
                {editingExpense ? 'Edit Expense' : 'Record New Expense'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expense Category
                </label>
                <select
                  required
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                >
                  <option value="">Select category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g., ESCOM prepaid electricity units"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Amount ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="15000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Transaction Date
                  </label>
                  <input
                    type="date"
                    required
                    value={form.expenseDate}
                    onChange={(e) =>
                      setForm({ ...form, expenseDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={form.paymentMethod}
                  onChange={(e) =>
                    setForm({ ...form, paymentMethod: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                >
                  <option value="Cash">Cash</option>
                  <option value="Mobile Money">Mobile Money</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  {saving
                    ? 'Saving...'
                    : editingExpense
                    ? 'Update Expense'
                    : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Categories Modal */}
      {categoryModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Expense Categories
              </h2>
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New expense category..."
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={addingCategory}
                  className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                >
                  {addingCategory ? 'Adding...' : 'Add'}
                </button>
              </form>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between px-3.5 py-2.5 text-sm"
                  >
                    <span className="text-slate-800">{cat.name}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat)}
                      className="text-slate-400 hover:text-red-600 p-1 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete expense record?"
        message={`Are you sure you want to delete "${deleteTarget?.description}"? This will update your profit reports.`}
        confirmLabel="Delete Expense"
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
