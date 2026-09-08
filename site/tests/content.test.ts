import { describe, it, expect } from 'vitest';
import { factSchema, firmSchema } from '../src/lib/content/schemas';
import {
  assessFact,
  auditFirm,
  formatFactValue,
  selectFact,
  toDisplayFact,
} from '../src/lib/content/facts';
import {
  DEVELOPMENT_POLICY,
  PRODUCTION_POLICY,
  FRESHNESS_DAYS,
  resolvePolicy,
  type EnvRecord,
} from '../src/lib/content/policy';

const NOW = new Date('2026-09-08T12:00:00.000Z');

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

const validSource = {
  url: 'https://example.com/terms',
  title: 'Example terms page',
  publisher: 'Example Publisher',
};

/** A fact that satisfies every rule, used as the base for negative cases. */
function verifiedFact(overrides: Record<string, unknown> = {}) {
  return {
    key: 'max-drawdown',
    label: 'Maximum drawdown',
    value: 10,
    unit: '%',
    status: 'verified',
    source: validSource,
    lastVerified: daysBefore(10),
    reviewer: 'A. Reviewer',
    ...overrides,
  };
}

describe('fact schema', () => {
  it('1. accepts a valid verified fact', () => {
    const result = factSchema.safeParse(verifiedFact());
    expect(result.success).toBe(true);
  });

  it('2. rejects a verified fact with no source', () => {
    const { source: _omitted, ...withoutSource } = verifiedFact();
    const result = factSchema.safeParse(withoutSource);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('no source');
  });

  it('3. rejects a verified fact with no lastVerified date', () => {
    const { lastVerified: _omitted, ...withoutDate } = verifiedFact();
    const result = factSchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('lastVerified');
  });

  it('4. rejects a malformed source URL', () => {
    const result = factSchema.safeParse(
      verifiedFact({ source: { ...validSource, url: 'not-a-url' } }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('valid absolute URL');
  });

  it('4b. rejects a source missing its publisher', () => {
    const result = factSchema.safeParse(
      verifiedFact({ source: { url: validSource.url, title: validSource.title } }),
    );
    expect(result.success).toBe(false);
  });

  it('5. rejects a lastVerified date in the future', () => {
    const future = new Date(Date.now() + 7 * 86_400_000);
    const result = factSchema.safeParse(verifiedFact({ lastVerified: future }));
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('future');
  });

  it('accepts demo facts with no source or date', () => {
    const result = factSchema.safeParse({
      key: 'placeholder',
      label: 'Placeholder',
      value: 'PLACEHOLDER',
      status: 'demo',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-kebab-case key', () => {
    expect(factSchema.safeParse(verifiedFact({ key: 'Max Drawdown' })).success).toBe(false);
  });
});

describe('demo fact policy', () => {
  const demoFact = factSchema.parse({
    key: 'placeholder',
    label: 'Placeholder',
    value: 'PLACEHOLDER',
    status: 'demo',
  });

  it('6. accepts a demo fact when demo facts are allowed', () => {
    const assessment = assessFact(demoFact, DEVELOPMENT_POLICY, NOW);
    expect(assessment.usable).toBe(true);
    expect(toDisplayFact(demoFact, DEVELOPMENT_POLICY, NOW).requiresDemoBadge).toBe(true);
  });

  it('7. rejects a demo fact when demo facts are disallowed', () => {
    const assessment = assessFact(demoFact, PRODUCTION_POLICY, NOW);
    expect(assessment.usable).toBe(false);
    expect(assessment.reason).toContain('production');
    expect(() => toDisplayFact(demoFact, PRODUCTION_POLICY, NOW)).toThrow();
  });

  it('treats needs-review like demo: blocked in production', () => {
    const needsReview = factSchema.parse({ ...verifiedFact(), status: 'needs-review' });
    expect(assessFact(needsReview, DEVELOPMENT_POLICY, NOW).usable).toBe(true);
    expect(assessFact(needsReview, PRODUCTION_POLICY, NOW).usable).toBe(false);
  });
});

describe('deprecated facts', () => {
  const deprecated = factSchema.parse({ ...verifiedFact(), status: 'deprecated' });

  it('8. are never usable as current information, in any environment', () => {
    for (const policy of [DEVELOPMENT_POLICY, PRODUCTION_POLICY]) {
      const assessment = assessFact(deprecated, policy, NOW);
      expect(assessment.usable).toBe(false);
      expect(assessment.reason).toContain('deprecated');
    }
    expect(() => toDisplayFact(deprecated, DEVELOPMENT_POLICY, NOW)).toThrow();
  });
});

describe('staleness', () => {
  it('9. reports a verified fact older than the stale threshold', () => {
    const old = factSchema.parse(
      verifiedFact({ lastVerified: daysBefore(FRESHNESS_DAYS.stale + 5) }),
    );
    const assessment = assessFact(old, PRODUCTION_POLICY, NOW);
    expect(assessment.stale).toBe(true);
    expect(assessment.usable).toBe(true); // stale is a warning, not a block
    expect(assessment.ageDays).toBe(FRESHNESS_DAYS.stale + 5);
  });

  it('does not report a fresh fact as stale', () => {
    const fresh = factSchema.parse(verifiedFact({ lastVerified: daysBefore(5) }));
    expect(assessFact(fresh, PRODUCTION_POLICY, NOW).stale).toBe(false);
  });

  it('10. fails production validation beyond the expiry threshold', () => {
    const expired = factSchema.parse(
      verifiedFact({ lastVerified: daysBefore(FRESHNESS_DAYS.expired + 1) }),
    );
    const assessment = assessFact(expired, PRODUCTION_POLICY, NOW);
    expect(assessment.usable).toBe(false);
    expect(assessment.reason).toContain('180-day limit');
    expect(() => toDisplayFact(expired, PRODUCTION_POLICY, NOW)).toThrow();
  });

  it('10b. the same expired fact remains usable outside production', () => {
    const expired = factSchema.parse(
      verifiedFact({ lastVerified: daysBefore(FRESHNESS_DAYS.expired + 1) }),
    );
    expect(assessFact(expired, DEVELOPMENT_POLICY, NOW).usable).toBe(true);
  });
});

describe('policy resolution', () => {
  it('defaults demo facts on outside production and off in production', () => {
    expect(resolvePolicy({ PUBLIC_ENV: 'development' }).allowDemoFacts).toBe(true);
    expect(resolvePolicy({ PUBLIC_ENV: 'staging' }).allowDemoFacts).toBe(true);
    expect(resolvePolicy({ PUBLIC_ENV: 'production' }).allowDemoFacts).toBe(false);
  });

  it('lets staging be tightened to production behaviour', () => {
    const policy = resolvePolicy({ PUBLIC_ENV: 'staging', PUBLIC_ALLOW_DEMO_FACTS: 'false' });
    expect(policy.allowDemoFacts).toBe(false);
  });

  it('treats unset PUBLIC_ENV as development', () => {
    expect(resolvePolicy({}).environment).toBe('development');
    expect(resolvePolicy({ PUBLIC_ENV: '' }).environment).toBe('development');
    expect(resolvePolicy({ PUBLIC_ENV: '   ' }).environment).toBe('development');
  });

  it('only enforces expiry in production', () => {
    expect(PRODUCTION_POLICY.expireAfterDays).toBe(FRESHNESS_DAYS.expired);
    expect(DEVELOPMENT_POLICY.expireAfterDays).toBeNull();
  });
});

/**
 * The safety property: no configuration, however wrong, may switch demo facts
 * back on in production.
 */
describe('production demo-fact safety', () => {
  const attempts: EnvRecord[] = [
    { PUBLIC_ENV: 'production' }, // unset override
    { PUBLIC_ENV: 'production', PUBLIC_ALLOW_DEMO_FACTS: 'true' }, // explicit attempt to loosen
    { PUBLIC_ENV: 'production', PUBLIC_ALLOW_DEMO_FACTS: 'TRUE' }, // wrong case -> throws, never allows
    { PUBLIC_ENV: 'production', PUBLIC_ALLOW_DEMO_FACTS: '' }, // empty
    { PUBLIC_ENV: 'production', PUBLIC_ALLOW_DEMO_FACTS: '1' }, // truthy-looking
    { PUBLIC_ENV: 'production', PUBLIC_ALLOW_DEMO_FACTS: 'yes' },
    { PUBLIC_ENV: 'production', PUBLIC_ALLOW_DEMO_FACTS: ' false ' }, // padded
    { PUBLIC_ENV: ' production ', PUBLIC_ALLOW_DEMO_FACTS: 'true' }, // padded env
  ];

  it('never allows demo facts in production, whatever the override says', () => {
    for (const env of attempts) {
      let allowed: boolean;
      try {
        allowed = resolvePolicy(env).allowDemoFacts;
      } catch {
        continue; // a throw is a safe outcome: nothing gets published
      }
      expect(allowed, `env ${JSON.stringify(env)} must not allow demo facts`).toBe(false);
    }
  });

  it('rejects a malformed PUBLIC_ENV instead of silently using development', () => {
    for (const value of ['prod', 'Production', 'PRODUCTION', 'prodution', 'live']) {
      expect(() => resolvePolicy({ PUBLIC_ENV: value }), value).toThrow(/Invalid PUBLIC_ENV/);
    }
  });

  it('rejects a malformed PUBLIC_ALLOW_DEMO_FACTS instead of silently ignoring it', () => {
    for (const value of ['flase', 'no', '0', 'TRUE', 'False']) {
      expect(() =>
        resolvePolicy({ PUBLIC_ENV: 'staging', PUBLIC_ALLOW_DEMO_FACTS: value }),
      ).toThrow(/Invalid PUBLIC_ALLOW_DEMO_FACTS/);
    }
  });

  it('blocks a demo fact end-to-end under a production policy', () => {
    const demo = factSchema.parse({
      key: 'placeholder',
      label: 'Placeholder',
      value: 'PLACEHOLDER',
      status: 'demo',
    });
    const policy = resolvePolicy({ PUBLIC_ENV: 'production', PUBLIC_ALLOW_DEMO_FACTS: 'true' });
    expect(policy.allowDemoFacts).toBe(false);
    expect(() => toDisplayFact(demo, policy, NOW)).toThrow();
  });
});

describe('firm schema and fact access', () => {
  const firm = firmSchema.parse({
    slug: 'example-firm',
    name: 'Example Firm',
    status: 'active',
    facts: [verifiedFact(), { key: 'note', label: 'Note', value: 'PLACEHOLDER', status: 'demo' }],
  });

  it('rejects duplicate fact keys within a firm', () => {
    const result = firmSchema.safeParse({
      slug: 'example-firm',
      name: 'Example Firm',
      status: 'active',
      facts: [verifiedFact(), verifiedFact()],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('Duplicate fact key');
  });

  it('defaults facts to an empty list', () => {
    const bare = firmSchema.parse({ slug: 'bare', name: 'Bare', status: 'active' });
    expect(bare.facts).toEqual([]);
  });

  it('selects a fact by key and formats value with unit', () => {
    const fact = selectFact(firm, 'max-drawdown', DEVELOPMENT_POLICY, NOW);
    expect(fact.display).toBe('10%');
    expect(fact.requiresDemoBadge).toBe(false);
  });

  it('throws for an unknown fact key', () => {
    expect(() => selectFact(firm, 'does-not-exist', DEVELOPMENT_POLICY, NOW)).toThrow(
      /no fact with key/,
    );
  });

  it('audits a firm without throwing, separating publishable from blocked', () => {
    const audit = auditFirm(firm, PRODUCTION_POLICY, NOW);
    expect(audit.publishable.map((f) => f.key)).toEqual(['max-drawdown']);
    expect(audit.blocked.map((f) => f.key)).toEqual(['note']);
  });
});

describe('value formatting', () => {
  it('binds % tight and spaces other units', () => {
    expect(formatFactValue(10, '%')).toBe('10%');
    expect(formatFactValue(14, 'days')).toBe('14 days');
    expect(formatFactValue('2-Step')).toBe('2-Step');
  });
});
