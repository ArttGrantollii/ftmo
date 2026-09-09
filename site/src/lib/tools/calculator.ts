/**
 * Calculator arithmetic.
 *
 * Pure functions, no DOM, no FTMO figures. Every percentage these functions
 * work with is passed in, having come from the verified firm record — there is
 * deliberately no constant in this file that describes FTMO.
 *
 * What this module does is one narrow thing: convert a verified percentage into
 * the amount it represents for a capital figure the user typed. That is a
 * mathematical transformation of a published rule, not a new claim, and the UI
 * is required to label it as such. It does not model FTMO's mechanisms — most
 * importantly it does not model the 1-Step trailing floor, which moves with the
 * account and cannot be expressed as one multiplication.
 */
import type { PercentFact } from './facts';

/**
 * Bounds for the calculator's own inputs. These exist so the tool stays usable
 * and its output stays readable. **They are not FTMO rules** and must never be
 * presented as such — FTMO's own published account-size range is a separate,
 * verified fact.
 */
export const CALC_LIMITS = {
  minAccount: 1,
  maxAccount: 1_000_000_000,
  minPercent: 0.01,
  maxPercent: 100,
} as const;

export type AmountProblem =
  | 'empty'
  | 'not-a-number'
  | 'zero'
  | 'negative'
  | 'too-small'
  | 'too-large';

export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; problem: AmountProblem };

export interface ParseOptions {
  min: number;
  max: number;
}

/**
 * Turn typed text into a usable positive number, or say precisely why not.
 *
 * Tolerant about presentation — a user may reasonably type `$12,345` or
 * `12 345` — and strict about everything else. `NaN` and `Infinity` can never
 * escape this function, which is what keeps them out of the interface.
 */
export function parseAmount(raw: string, options: ParseOptions): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, problem: 'empty' };

  // Strip only presentation: currency mark, thousands separators, spaces.
  // Anything else left over will fail the numeric check rather than be ignored.
  const cleaned = trimmed.replace(/[$\s ,]/g, '');
  if (cleaned === '') return { ok: false, problem: 'not-a-number' };

  // `Number('')` is 0 and `Number('1e999')` is Infinity, so both are guarded.
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false, problem: 'not-a-number' };

  if (value === 0) return { ok: false, problem: 'zero' };
  if (value < 0) return { ok: false, problem: 'negative' };
  if (value < options.min) return { ok: false, problem: 'too-small' };
  if (value > options.max) return { ok: false, problem: 'too-large' };

  return { ok: true, value };
}

/** Round to cents, avoiding the usual binary-floating-point tail. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** The amount a verified percentage represents for a given capital figure. */
export function percentageAmount(capital: number, percent: number): number {
  return roundMoney((capital * percent) / 100);
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Format an amount in US dollars.
 *
 * USD because the verified account-size range is published by FTMO in USD. No
 * other currency is offered and no conversion is performed: an exchange rate
 * would be an unverified number fetched from somewhere this site does not talk
 * to.
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return usd.format(value);
}

/** One verified rule, together with what it comes to for this capital. */
export interface RuleAmount {
  key: string;
  label: string;
  /** The verified rule, exactly as the record holds it, e.g. "7%". */
  ruleDisplay: string;
  /** The derived amount — this site's arithmetic, never an FTMO figure. */
  amount: number;
  amountDisplay: string;
  notes?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

/**
 * Convert each supplied verified percentage into its amount for `capital`.
 *
 * Facts arrive already filtered to those that are genuinely numeric
 * percentages, so a rule expressed in prose is never given a dollar value.
 */
export function computeRuleAmounts(capital: number, facts: readonly PercentFact[]): RuleAmount[] {
  return facts.map((fact) => {
    const amount = percentageAmount(capital, fact.percent);
    return {
      key: fact.key,
      label: fact.label,
      ruleDisplay: fact.display,
      amount,
      amountDisplay: formatUsd(amount),
      notes: fact.notes,
      sourceUrl: fact.sourceUrl,
      sourceTitle: fact.sourceTitle,
    };
  });
}
