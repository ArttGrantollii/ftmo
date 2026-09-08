/**
 * Content schemas.
 *
 * Every factual claim published by this site is a `Fact`: a value carried
 * together with its provenance. Values are never stored as bare strings in
 * components — see `facts.ts` for the sanctioned way to read one.
 */
import { z } from 'zod';

/**
 * verified     — checked against a named source on a recorded date. Publishable as fact.
 * demo         — placeholder for layout. Never publishable as fact.
 * needs-review — was verified, now doubted or awaiting recheck. Not publishable as fact.
 * deprecated   — no longer current. Never usable as current information, in any environment.
 */
export const FACT_STATUSES = ['verified', 'demo', 'needs-review', 'deprecated'] as const;

export const factStatusSchema = z.enum(FACT_STATUSES);
export type FactStatus = z.infer<typeof factStatusSchema>;

/** Where a verified fact came from. All three fields are mandatory when present. */
export const sourceSchema = z.object({
  url: z.url({ error: 'source.url must be a valid absolute URL' }),
  title: z.string().min(1, { error: 'source.title is required' }),
  publisher: z.string().min(1, { error: 'source.publisher is required' }),
});
export type Source = z.infer<typeof sourceSchema>;

/** Values may be numeric or textual (e.g. "2-Step", "On request"). */
const factValueSchema = z.union([z.string().min(1), z.number()]);

const factShape = z.object({
  /** Stable machine identifier, unique within a firm. */
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      error: 'key must be lowercase kebab-case',
    }),
  /** Human-readable label used in UI. */
  label: z.string().min(1),
  value: factValueSchema,
  /** Rendered after the value, e.g. "%" or "days". */
  unit: z.string().min(1).optional(),
  status: factStatusSchema,
  source: sourceSchema.optional(),
  /** Date the value was last checked against the source. */
  lastVerified: z.coerce.date().optional(),
  /** Person who performed the verification. */
  reviewer: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
  /** Prior value, kept so changes over time remain visible. */
  previousValue: factValueSchema.optional(),
});

/**
 * Semantic rules that a plain object shape cannot express.
 *
 * These are the guardrails that stop an unverified figure being published as
 * fact. They run at build time: a violation fails the build rather than
 * producing a page with an unsupported claim on it.
 */
export const factSchema = factShape.superRefine((fact, ctx) => {
  if (fact.status === 'verified') {
    if (!fact.source) {
      ctx.addIssue({
        code: 'custom',
        path: ['source'],
        message: `Fact "${fact.key}" is marked verified but has no source. Add source.url, source.title and source.publisher, or change the status.`,
      });
    }
    if (!fact.lastVerified) {
      ctx.addIssue({
        code: 'custom',
        path: ['lastVerified'],
        message: `Fact "${fact.key}" is marked verified but has no lastVerified date.`,
      });
    }
  }

  // A verification cannot have happened in the future, whatever the status.
  if (fact.lastVerified && fact.lastVerified.getTime() > Date.now()) {
    ctx.addIssue({
      code: 'custom',
      path: ['lastVerified'],
      message: `Fact "${fact.key}" has a lastVerified date in the future.`,
    });
  }
});

export type Fact = z.infer<typeof factSchema>;

/**
 * A firm. Facts hang off the firm rather than living in page code, so that
 * additional firms can be added later without touching any component.
 */
export const firmSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'slug must be lowercase kebab-case' }),
    name: z.string().min(1),
    /** Whether this firm is currently covered by the site. */
    status: z.enum(['active', 'inactive']),
    facts: z.array(factSchema).default([]),
  })
  .superRefine((firm, ctx) => {
    const seen = new Set<string>();
    for (const fact of firm.facts) {
      if (seen.has(fact.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['facts'],
          message: `Duplicate fact key "${fact.key}" for firm "${firm.slug}".`,
        });
      }
      seen.add(fact.key);
    }
  });

export type Firm = z.infer<typeof firmSchema>;
