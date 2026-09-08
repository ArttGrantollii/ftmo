/**
 * Sanctioned fact access.
 *
 * Page and component code must obtain factual values through these helpers
 * rather than writing literals like "10%" or "$10,000" inline. A value that
 * reaches the page this way always arrives with its status and provenance
 * attached, so it cannot be rendered as bare, unattributed fact.
 */
import type { Fact, FactStatus, Firm, Source } from './schemas';
import type { ContentPolicy } from './policy';

const MS_PER_DAY = 86_400_000;

/** Whole days between `lastVerified` and now. `null` when never verified. */
export function factAgeInDays(fact: Fact, now: Date = new Date()): number | null {
  if (!fact.lastVerified) return null;
  return Math.floor((now.getTime() - fact.lastVerified.getTime()) / MS_PER_DAY);
}

export interface FactAssessment {
  /** May this fact be rendered under the given policy? */
  usable: boolean;
  /** Why not, when `usable` is false. */
  reason?: string;
  ageDays: number | null;
  /** Verified but older than the stale threshold: renderable, but should be rechecked. */
  stale: boolean;
}

/**
 * Decide whether a fact may be published under a policy.
 *
 * - `deprecated` is never usable, in any environment. It is history, not current information.
 * - `demo` and `needs-review` are usable only where demo facts are allowed
 *   (development and staging), never in production.
 * - `verified` is usable until it exceeds the policy's expiry age.
 */
export function assessFact(
  fact: Fact,
  policy: ContentPolicy,
  now: Date = new Date(),
): FactAssessment {
  const ageDays = factAgeInDays(fact, now);
  const stale =
    fact.status === 'verified' && ageDays !== null && ageDays > policy.staleAfterDays;

  if (fact.status === 'deprecated') {
    return {
      usable: false,
      reason: `Fact "${fact.key}" is deprecated and must not be presented as current information.`,
      ageDays,
      stale,
    };
  }

  if (fact.status === 'demo' || fact.status === 'needs-review') {
    if (!policy.allowDemoFacts) {
      return {
        usable: false,
        reason: `Fact "${fact.key}" has status "${fact.status}" and cannot be published in ${policy.environment}. Verify it with a source, or remove it from the page.`,
        ageDays,
        stale,
      };
    }
    return { usable: true, ageDays, stale };
  }

  // verified
  if (policy.expireAfterDays !== null && ageDays !== null && ageDays > policy.expireAfterDays) {
    return {
      usable: false,
      reason: `Fact "${fact.key}" was last verified ${ageDays} days ago, beyond the ${policy.expireAfterDays}-day limit for ${policy.environment}. Re-check it against its source and update lastVerified.`,
      ageDays,
      stale,
    };
  }

  return { usable: true, ageDays, stale };
}

/** A fact prepared for rendering. Presentation is decided by the UI, not here. */
export interface DisplayFact {
  key: string;
  label: string;
  /** Value and unit combined, e.g. "10%" or "14 days". */
  display: string;
  value: string | number;
  unit?: string;
  status: FactStatus;
  /** True when the value is not independently verified and must be badged as such. */
  requiresDemoBadge: boolean;
  stale: boolean;
  ageDays: number | null;
  lastVerified?: Date;
  source?: Source;
  notes?: string;
}

/** Join a value and its unit. `%` binds tight; everything else takes a space. */
export function formatFactValue(value: string | number, unit?: string): string {
  if (!unit) return String(value);
  return unit === '%' ? `${value}${unit}` : `${value} ${unit}`;
}

/**
 * Prepare a fact for rendering, or throw if the policy forbids publishing it.
 *
 * Throwing is deliberate: during a static build it turns an unpublishable
 * claim into a failed build rather than a page that quietly misinforms.
 */
export function toDisplayFact(
  fact: Fact,
  policy: ContentPolicy,
  now: Date = new Date(),
): DisplayFact {
  const assessment = assessFact(fact, policy, now);
  if (!assessment.usable) {
    throw new Error(assessment.reason);
  }

  return {
    key: fact.key,
    label: fact.label,
    display: formatFactValue(fact.value, fact.unit),
    value: fact.value,
    unit: fact.unit,
    status: fact.status,
    requiresDemoBadge: fact.status !== 'verified',
    stale: assessment.stale,
    ageDays: assessment.ageDays,
    lastVerified: fact.lastVerified,
    source: fact.source,
    notes: fact.notes,
  };
}

/** Look up one fact on a firm by key. Throws if absent or unpublishable. */
export function selectFact(
  firm: Firm,
  key: string,
  policy: ContentPolicy,
  now: Date = new Date(),
): DisplayFact {
  const fact = firm.facts.find((candidate) => candidate.key === key);
  if (!fact) {
    throw new Error(`Firm "${firm.slug}" has no fact with key "${key}".`);
  }
  return toDisplayFact(fact, policy, now);
}

export interface FirmAudit {
  publishable: DisplayFact[];
  blocked: { key: string; status: FactStatus; reason: string }[];
  stale: { key: string; ageDays: number }[];
}

/**
 * Assess every fact on a firm without throwing. Intended for reporting —
 * a pre-release check or the scheduled staleness report — rather than rendering.
 */
export function auditFirm(
  firm: Firm,
  policy: ContentPolicy,
  now: Date = new Date(),
): FirmAudit {
  const audit: FirmAudit = { publishable: [], blocked: [], stale: [] };

  for (const fact of firm.facts) {
    const assessment = assessFact(fact, policy, now);
    if (assessment.usable) {
      audit.publishable.push(toDisplayFact(fact, policy, now));
      if (assessment.stale && assessment.ageDays !== null) {
        audit.stale.push({ key: fact.key, ageDays: assessment.ageDays });
      }
    } else {
      audit.blocked.push({
        key: fact.key,
        status: fact.status,
        reason: assessment.reason ?? 'unknown',
      });
    }
  }

  return audit;
}
