export function formatCurrency(amount: number, currency = 'MWK'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safe);
  return `${currency} ${formatted}`;
}

export function formatShortNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}k`;
  }
  return String(Math.round(value));
}

export function getTodayIsoDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Blantyre',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Blantyre',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDateOnly(dateString: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [y, m, d] = dateString.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(dt);
  }
  const dt = new Date(dateString);
  if (Number.isNaN(dt.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Blantyre',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dt);
}
