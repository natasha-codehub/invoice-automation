/**
 * correctionsStore.js — the learning flywheel's memory (Builder's Manual Phase E).
 *
 * The §9 critique of the prototype was that "a correction dies on reload" — the
 * stated moat (corrections → data → fewer touches) didn't actually exist. This is
 * that store, made real. It is deliberately client-only and zero-dep, persisted to
 * localStorage so a learned alias survives a refresh and the flywheel is provable
 * without a backend (decision logged in §6: localStorage over in-memory).
 *
 * It holds three things, all append-only from the UI's point of view:
 *   - aliases    the learned vendor→token→material map (the moat growing)
 *   - corrections every mapping resolution (original → corrected, actor, reason, when)
 *   - decisions   every terminal Approve / Reject (with reason + time-in-review)
 *
 * mapping.js merges getLearnedAliases() over the seeded VENDOR_PART_ALIASES, so a
 * line a human resolved once auto-resolves for every matching line thereafter.
 * App subscribes via subscribe() and re-maps the batch when the store changes.
 */

const LS_KEY = 'invoice-automation.learning.v1';

const EMPTY = { aliases: {}, corrections: [], decisions: [] };

function read() {
  try {
    if (typeof localStorage === 'undefined') return structuredClone(EMPTY);
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(EMPTY), ...parsed };
  } catch {
    return structuredClone(EMPTY);
  }
}

// In-memory cache so mapping.js (called per-invoice, per-render) doesn't hit
// localStorage on every line; write-through keeps it authoritative.
let state = read();

function write() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch { /* private mode / quota — stay in-memory, flywheel still works this session */ }
}

// ─── pub/sub (React bumps a version on notify) ───────────────────────────────
const listeners = new Set();
function notify() { for (const fn of listeners) fn(); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ─── reads ───────────────────────────────────────────────────────────────────
export function getState() { return state; }

/** Flattened { [vendor]: { [token]: materialId } } for the mapping merge. */
export function getLearnedAliases() {
  const out = {};
  for (const [vendor, tokens] of Object.entries(state.aliases)) {
    out[vendor] = {};
    for (const [token, rec] of Object.entries(tokens)) out[vendor][token] = rec.materialId;
  }
  return out;
}

/** The provenance behind a learned alias (who taught it, why, when) — for the trace. */
export function getLearnedMeta(vendor, token) {
  return state.aliases[vendor]?.[token] || null;
}

export function counts() {
  const aliases = Object.values(state.aliases).reduce((n, t) => n + Object.keys(t).length, 0);
  return { aliases, corrections: state.corrections.length, decisions: state.decisions.length };
}

// ─── writes ────────────────────────────────────────────────────────────────────
/**
 * learnAlias — the core flywheel write. A human resolved a line to a material;
 * remember it (vendor + token → material) and log the correction. The token must
 * mirror what mapping.js looks up: a vendor part number, else the upper-cased
 * full description.
 */
export function learnAlias({ vendor, token, materialId, fromDesc, invoiceId, actor = 'human:natasha', reason = '' }) {
  if (!vendor || !token || !materialId) return;
  const ts = Date.now();
  if (!state.aliases[vendor]) state.aliases[vendor] = {};
  state.aliases[vendor][token] = { materialId, actor, reason, ts, fromDesc: fromDesc || null };
  state.corrections.unshift({
    ts, kind: 'mapping', vendor, token, fromDesc: fromDesc || null,
    from: fromDesc || token, to: materialId, actor, reason, invoiceId: invoiceId || null,
  });
  write();
  notify();
}

/** logDecision — a terminal Approve/Reject, with reason + seconds-in-review. */
export function logDecision({ invoiceId, vendor, decision, reason = '', actor = 'human:natasha', secondsInReview = null }) {
  state.decisions.unshift({ ts: Date.now(), invoiceId: invoiceId || null, vendor: vendor || null, decision, reason, actor, secondsInReview });
  write();
  notify();
}

/** reset — wipe learned state (demo control: show STP fall back, then teach again). */
export function reset() {
  state = structuredClone(EMPTY);
  write();
  notify();
}
