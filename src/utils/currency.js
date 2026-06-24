/**
 * currency.js — one place that decides how money renders.
 *
 * The prototype is a USD shop: every document is in dollars, so the UI shows `$`.
 * Centralising it here (rather than hardcoding the symbol across a dozen
 * components) is the Phase G currency-helper the manual called for.
 */

export const CURRENCY_SYMBOL = '$';

/** money(1234.5) → "$1,234.5" · money(-1888) → "-$1,888" · money(null) → "—" */
export function money(n) {
  if (n == null) return '—';
  const v = Number(n);
  const s = Math.abs(v).toLocaleString('en-US');
  return (v < 0 ? '-' : '') + CURRENCY_SYMBOL + s;
}
