/**
 * consistency.js — the arithmetic/consistency gate (Builder's Manual B3).
 *
 * The cheapest, strongest defense against *confident-but-wrong* extraction:
 * deterministic cross-field math that a high model-confidence can't paper over.
 *   - line items Σ == subtotal
 *   - subtotal + tax == total
 *   - qty × unit == line total
 *
 * Returns { ok, checks } where `ok` is false on any hard (error) mismatch.
 * `checks` is render-ready (each has passed/severity/label/detail).
 */

const tol = (base) => Math.max(0.5, Math.abs(base || 0) * 0.005); // 0.5 abs or 0.5%

export function checkConsistency(inv) {
  const checks = [];
  const li = inv.lineItems || [];

  // 1. Line items sum to subtotal
  if (inv.subtotal != null && li.length) {
    const lineSum = li.reduce((s, x) => s + (x.total || 0), 0);
    const d = Math.abs(lineSum - inv.subtotal);
    const passed = d <= tol(inv.subtotal);
    checks.push({
      id: 'line_sum', passed, severity: 'error', label: 'Line items Σ = subtotal',
      detail: passed
        ? `Σ line totals ${lineSum.toFixed(2)} = subtotal ${inv.subtotal.toFixed(2)}`
        : `Σ line totals ${lineSum.toFixed(2)} ≠ subtotal ${inv.subtotal.toFixed(2)} (Δ ${d.toFixed(2)})`,
    });
  }

  // 2. Subtotal + tax = total
  if (inv.subtotal != null && inv.tax != null && inv.total != null) {
    const expected = inv.subtotal + inv.tax;
    const d = Math.abs(expected - inv.total);
    const passed = d <= tol(inv.total);
    checks.push({
      id: 'total_math', passed, severity: 'error', label: 'Subtotal + tax = total',
      detail: passed
        ? `${inv.subtotal.toFixed(2)} + ${inv.tax.toFixed(2)} = total ${inv.total.toFixed(2)}`
        : `Subtotal + tax = ${expected.toFixed(2)} ≠ total ${inv.total.toFixed(2)} (Δ ${d.toFixed(2)})`,
    });
  }

  // 3. Per-line qty × unit = line total
  li.forEach((x, i) => {
    if (x.qty == null || x.unit == null || x.total == null) return;
    const expected = x.qty * x.unit;
    const d = Math.abs(expected - x.total);
    if (d > tol(x.total)) {
      checks.push({
        id: `line_${i}`, passed: false, severity: 'warn',
        label: `Line ${i + 1} math`,
        detail: `"${x.desc}": ${x.qty} × ${x.unit} = ${expected.toFixed(2)} ≠ ${x.total.toFixed(2)}`,
      });
    }
  });

  const ok = checks.every(c => c.passed || c.severity !== 'error');
  return { ok, checks };
}
