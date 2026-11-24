import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Edit3,
  FolderPlus,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../components/ToastProvider.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { formatCurrency } from '../lib/format.ts';
import type { Category, Product } from '../types/index.ts';

interface ProductFormState {
  name: string;
  categoryId: string;
  sku: string;
  unit: string;
  buyingPrice: string;
  sellingPrice: string;
  quantity: string;
  lowStockThreshold: string;
}

const emptyForm = (defaultThreshold: number): ProductFormState => ({
  name: '',
  categoryId: '',
  sku: '',
  unit: 'pcs',
  buyingPrice: '',
  sellingPrice: '',
  quantity: '0',
  lowStockThreshold: String(defaultThreshold || 5),
});

export function ProductsPage() {
  const { authFetch, business } = useAuth();
  const { notify } = useToast();
  const currency = business?.currency || 'MWK';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(() =>
    emptyForm(business?.lowStockThresholdDefault ?? 5)
  );
  const [saving, setSaving] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRows, catRows] = await Promise.all([
        authFetch<Product[]>('/api/products'),
        authFetch<Category[]>('/api/categories?type=product'),
      ]);
      setProducts(prodRows);
      setCategories(catRows);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load products.', 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        !search.trim() ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        p.categoryName.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        categoryFilter === 'all' || String(p.categoryId ?? '') === categoryFilter;

      const matchesStock =
        stockFilter === 'all' ||
        (stockFilter === 'low' && p.quantity <= p.lowStockThreshold) ||
        (stockFilter === 'out' && p.quantity === 0);

      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [products, search, categoryFilter, stockFilter]);

  const lowStockCount = useMemo(
    () => products.filter((p) => p.quantity <= p.lowStockThreshold).length,
    [products]
  );

  const openAddModal = () => {
    setEditingProduct(null);
    setForm(emptyForm(business?.lowStockThresholdDefault ?? 5));
    setModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      categoryId: product.categoryId ? String(product.categoryId) : '',
      sku: product.sku,
      unit: product.unit,
      buyingPrice: String(product.buyingPrice),
      sellingPrice: String(product.sellingPrice),
      quantity: String(product.quantity),
      lowStockThreshold: String(product.lowStockThreshold),
    });
    setModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        sku: form.sku,
        unit: form.unit || 'pcs',
        buyingPrice: Number(form.buyingPrice),
        sellingPrice: Number(form.sellingPrice),
        quantity: Number(form.quantity),
        lowStockThreshold: Number(form.lowStockThreshold),
      };

      if (editingProduct) {
        await authFetch(`/api/products/${editingProduct.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify(`Updated "${form.name}".`, 'success');
      } else {
        await authFetch('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(`Added "${form.name}" to inventory.`, 'success');
      }

      setModalOpen(false);
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save product.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await authFetch(`/api/products/${deleteTarget.id}`, { method: 'DELETE' });
      notify(`Deleted "${deleteTarget.name}".`, 'success');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete product.', 'error');
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
        body: JSON.stringify({ name: newCategoryName.trim(), type: 'product' }),
      });
      setCategories((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewCategoryName('');
      notify(`Category "${created.name}" created.`, 'success');
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
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to remove category.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Products & Inventory
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {products.length} total items · {lowStockCount} low or out of stock
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setCategoryModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <FolderPlus className="h-4 w-4" />
            <span>Categories</span>
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name, SKU, or category..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-teal-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-600 focus:outline-none"
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {cat.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'All Stock' },
                { id: 'low', label: `Low Stock (${lowStockCount})` },
                { id: 'out', label: 'Out of Stock' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStockFilter(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  stockFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="h-10 w-10 text-slate-300 mx-auto" />
            <h2 className="mt-3 font-display text-base font-semibold text-slate-900">
              {products.length === 0
                ? 'Your inventory is empty'
                : 'No matching products found'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {products.length === 0
                ? 'Add your first product with buying and selling prices to start selling.'
                : 'Try clearing your search or stock filter.'}
            </p>
            {products.length === 0 && (
              <button
                type="button"
                onClick={openAddModal}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                <Plus className="h-4 w-4" />
                <span>Add First Product</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-left font-medium">Product</th>
                  <th className="py-3 px-4 text-left font-medium">Category</th>
                  <th className="py-3 px-4 text-right font-medium">Buying Price</th>
                  <th className="py-3 px-4 text-right font-medium">Selling Price</th>
                  <th className="py-3 px-4 text-right font-medium">Margin / Unit</th>
                  <th className="py-3 px-4 text-right font-medium">In Stock</th>
                  <th className="py-3 px-4 text-left font-medium">Status</th>
                  <th className="py-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const unitMargin = p.sellingPrice - p.buyingPrice;
                  const isOut = p.quantity === 0;
                  const isLow = !isOut && p.quantity <= p.lowStockThreshold;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{p.name}</p>
                        {p.sku && (
                          <p className="text-xs font-mono text-slate-400">{p.sku}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {p.categoryName}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {formatCurrency(p.buyingPrice, currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(p.sellingPrice, currency)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap ${
                          unitMargin >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {formatCurrency(unitMargin, currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {p.quantity} {p.unit}
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 font-medium text-red-600">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Low Stock
                          </span>
                        ) : (
                          <span className="font-medium text-emerald-700">In Stock</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                            title="Edit product"
                            aria-label={`Edit ${p.name}`}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Delete product"
                            aria-label={`Delete ${p.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="font-display text-base font-semibold text-slate-900">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Product Name
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Illovo Brown Sugar 1kg"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
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

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Unit
                    </label>
                    <input
                      type="text"
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      placeholder="pcs, kg, L"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      SKU (Optional)
                    </label>
                    <input
                      type="text"
                      value={form.sku}
                      onChange={(e) => setForm({ ...form, sku: e.target.value })}
                      placeholder="SUG-1KG"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Buying Price ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.buyingPrice}
                    onChange={(e) => setForm({ ...form, buyingPrice: e.target.value })}
                    placeholder="2200"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Selling Price ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={form.sellingPrice}
                    onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                    placeholder="2700"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Available Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Low-Stock Alert Threshold
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={form.lowStockThreshold}
                    onChange={(e) =>
                      setForm({ ...form, lowStockThreshold: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-teal-600 focus:outline-none"
                  />
                </div>
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
                    : editingProduct
                    ? 'Update Product'
                    : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Product Categories Modal */}
      {categoryModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Product Categories
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
                  placeholder="New category name..."
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
                      aria-label={`Delete ${cat.name}`}
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
        title="Delete product?"
        message={`Are you sure you want to remove "${deleteTarget?.name}" from your inventory? Past sales receipts will preserve the item name.`}
        confirmLabel="Delete Product"
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
