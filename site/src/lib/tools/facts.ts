/**
 * The bridge between validated content and the browser.
 *
 * The interactive tools need FTMO's verified percentages at runtime. They must
 * not carry their own copies of those numbers — the firm record is the single
 * source of truth, and a figure typed into a script would drift away from it
 * silently. So the page serialises the facts it has already read through
 * `auditFirm()` into a data attribute, and the client parses that back.
 *
 * Nothing here invents, defaults or infers a value. A fact that is absent, or
 * that the active policy will not publish, arrives as `undefined` and every
 * consumer is required to render an explicit unavailable state rather than a
 * zero, a guess or a prototype leftover.
 */
import type { DisplayFact } from '../content/facts';

/**
 * A fact as the browser sees it. A structural subset of `DisplayFact`:
 * provenance is kept so the tools can keep citing their sources, but nothing
 * is added that the record did not already carry.
 */
export interface ToolFact {
  key: string;
  label: string;
  /** Value and unit already joined, e.g. "7%". */
  display: string;
  value: string | number;
  unit?: string;
  notes?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export type ToolFactMap = Record<string, ToolFact>;

/** Narrow published facts to the keys a tool needs, ready for serialisation. */
export function toToolFacts(
  facts: ReadonlyMap<string, DisplayFact>,
  keys: readonly string[],
): ToolFactMap {
  const payload: ToolFactMap = {};

  for (const key of keys) {
    const fact = facts.get(key);
    // Absent or unpublishable: deliberately left out, so the consumer must
    // handle its absence rather than receiving a hollow placeholder.
    if (!fact) continue;

    payload[key] = {
      key: fact.key,
      label: fact.label,
      display: fact.display,
      value: fact.value,
      unit: fact.unit,
      notes: fact.notes,
      sourceUrl: fact.source?.url,
      sourceTitle: fact.source?.title,
    };
  }

  return payload;
}

/** A fact that is safe to do arithmetic with: a real number carrying `%`. */
export interface PercentFact {
  key: string;
  label: string;
  /** The verified percentage as a number, e.g. 7 for "7%". */
  percent: number;
  /** The verified rule exactly as published, e.g. "7%". */
  display: string;
  notes?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

/**
 * Interpret a fact as a percentage, or refuse.
 *
 * Refusing is the point. Several facts in the record are prose — "No minimum",
 * "Not refunded", "Unlimited" — and a tool that coerced those to a number would
 * publish arithmetic on a value FTMO never expressed numerically. Only a fact
 * that is genuinely numeric and genuinely carries a percent unit qualifies.
 */
export function asPercentFact(fact: ToolFact | undefined): PercentFact | null {
  if (!fact) return null;
  if (fact.unit !== '%') return null;

  const percent = typeof fact.value === 'number' ? fact.value : Number(fact.value);
  if (!Number.isFinite(percent)) return null;

  return {
    key: fact.key,
    label: fact.label,
    percent,
    display: fact.display,
    notes: fact.notes,
    sourceUrl: fact.sourceUrl,
    sourceTitle: fact.sourceTitle,
  };
}

export interface AccountSizeRange {
  min: number;
  max: number;
}

/**
 * Read the endpoints out of the verified account-size range.
 *
 * Phase 2B recorded the range as published prose, shaped "$LOW – $HIGH",
 * because FTMO's discrete sizes are produced by a client-side selector and were
 * never readable from the served page. Parsing the two endpoints back out lets
 * the calculator tell a user when their figure sits outside FTMO's published
 * range, without anyone re-typing those numbers into code.
 *
 * If the wording ever changes so this cannot parse, it returns `null` and the
 * range hint simply disappears. It must never guess.
 */
export function parseAccountSizeRange(text: string | undefined): AccountSizeRange | null {
  if (!text) return null;

  // Two currency amounts separated by a dash of any flavour.
  const match = /\$\s*([\d,]+)\s*[–—-]\s*\$\s*([\d,]+)/.exec(text);
  if (!match) return null;

  const min = Number(match[1]!.replace(/,/g, ''));
  const max = Number(match[2]!.replace(/,/g, ''));

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min <= 0 || max <= 0 || min > max) return null;

  return { min, max };
}
