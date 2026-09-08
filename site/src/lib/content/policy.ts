/**
 * Content policy: the single place where freshness thresholds and
 * environment rules are defined. No other module may hard-code these numbers.
 */

/** Freshness thresholds, in days, for facts marked `verified`. */
export const FRESHNESS_DAYS = {
  /** Older than this: report as stale (warn, still usable). */
  stale: 90,
  /** Older than this: not usable in production. */
  expired: 180,
} as const;

export type Environment = 'development' | 'staging' | 'production';

export interface ContentPolicy {
  environment: Environment;
  /** Whether `demo` and `needs-review` facts may be rendered. */
  allowDemoFacts: boolean;
  /** Age at which a verified fact is reported stale. */
  staleAfterDays: number;
  /** Age at which a verified fact stops being usable. `null` disables the check. */
  expireAfterDays: number | null;
}

const ENVIRONMENTS: readonly Environment[] = ['development', 'staging', 'production'];

/**
 * Parse `PUBLIC_ENV`.
 *
 * Unset or empty means local development, which is the common case when running
 * `npm run dev`. A value that is *set but unrecognised* is a configuration
 * mistake — `prod`, `Production`, `prodution` — and throws rather than silently
 * degrading to development, because degrading is precisely how a production
 * deploy would end up allowing demo facts.
 */
function parseEnvironment(value: string | undefined): Environment {
  const trimmed = value?.trim();
  if (!trimmed) return 'development';
  if ((ENVIRONMENTS as readonly string[]).includes(trimmed)) return trimmed as Environment;

  throw new Error(
    `Invalid PUBLIC_ENV: "${value}". Expected one of ${ENVIRONMENTS.join(', ')}, or unset for local development.`,
  );
}

/**
 * Parse `PUBLIC_ALLOW_DEMO_FACTS`.
 *
 * Unset means "use the environment default". A value that is set but is not
 * exactly `"true"` or `"false"` throws, so a typo such as `"flase"` cannot
 * silently leave demo facts enabled when the operator meant to block them.
 */
function parseBoolean(value: string | undefined): boolean | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === '') return undefined;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  throw new Error(
    `Invalid PUBLIC_ALLOW_DEMO_FACTS: "${value}". Expected exactly "true" or "false", or unset.`,
  );
}

export type EnvRecord = Record<string, string | undefined>;

/**
 * Resolve the active content policy.
 *
 * Defaults by environment:
 *   development / staging -> demo facts allowed, age never fails the build
 *   production            -> demo facts blocked, verified facts expire at 180 days
 *
 * `PUBLIC_ALLOW_DEMO_FACTS` may only ever *tighten* the policy. Production
 * blocks demo facts unconditionally: there is deliberately no environment
 * variable, missing value or malformed value that can switch them back on.
 * Setting it to `"false"` in development or staging is the supported way to
 * rehearse production behaviour before a release.
 */
export function resolvePolicy(env: EnvRecord = {}): ContentPolicy {
  const environment = parseEnvironment(env.PUBLIC_ENV);
  const isProduction = environment === 'production';
  const override = parseBoolean(env.PUBLIC_ALLOW_DEMO_FACTS);

  // Production is hard-blocked; elsewhere the default is "allowed" and the
  // override can only turn it off. `override === true` is therefore a no-op.
  const allowDemoFacts = isProduction ? false : (override ?? true);

  return {
    environment,
    allowDemoFacts,
    staleAfterDays: FRESHNESS_DAYS.stale,
    expireAfterDays: isProduction ? FRESHNESS_DAYS.expired : null,
  };
}

/** Convenience policies for tests and for callers that need an explicit stance. */
export const DEVELOPMENT_POLICY: ContentPolicy = resolvePolicy({ PUBLIC_ENV: 'development' });
export const PRODUCTION_POLICY: ContentPolicy = resolvePolicy({ PUBLIC_ENV: 'production' });
