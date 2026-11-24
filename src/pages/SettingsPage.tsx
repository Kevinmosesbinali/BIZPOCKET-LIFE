import React, { useState } from 'react';
import { Building2, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../components/ToastProvider.tsx';
import type { BusinessProfile } from '../types/index.ts';

export function SettingsPage() {
  const { authFetch, business, user, updateBusinessState } = useAuth();
  const { notify } = useToast();

  const [name, setName] = useState(business?.name || '');
  const [ownerName, setOwnerName] = useState(business?.ownerName || '');
  const [phone, setPhone] = useState(business?.phone || '');
  const [location, setLocation] = useState(business?.location || '');
  const [currency, setCurrency] = useState(business?.currency || 'MWK');
  const [lowStockThresholdDefault, setLowStockThresholdDefault] = useState(
    String(business?.lowStockThresholdDefault ?? 5)
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await authFetch<BusinessProfile>('/api/business', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          ownerName,
          phone,
          location,
          currency,
          lowStockThresholdDefault: Number(lowStockThresholdDefault) || 5,
        }),
      });
      updateBusinessState(updated);
      notify('Business settings updated.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
          Business Settings
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage the business profile details shown on printed receipts and reports
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
      >
        <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
          <div className="h-10 w-10 rounded-lg bg-slate-900 text-white flex items-center justify-center">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              {business?.name}
            </h2>
            <p className="text-xs text-slate-500">Account: {user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Business Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Owner Name
            </label>
            <input
              type="text"
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+265 999 000 000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Location / City
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
            >
              <option value="MWK">MWK — Malawi Kwacha</option>
              <option value="USD">USD — US Dollar</option>
              <option value="ZAR">ZAR — South African Rand</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Default Low-Stock Threshold
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={lowStockThresholdDefault}
              onChange={(e) => setLowStockThresholdDefault(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-teal-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save Business Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
