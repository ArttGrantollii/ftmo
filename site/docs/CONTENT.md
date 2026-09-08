# Content and fact architecture

How factual information is stored, validated and published on this site.

> **The rule this architecture exists to enforce:** nothing is published as fact
> unless a named source was checked on a recorded date. Invented, assumed or
> remembered values must never be marked `verified`.

## Where content lives

```
site/src/
├── content.config.ts          Astro collection definitions
├── content/
│   └── firms/
│       └── ftmo.yaml          one file per firm
└── lib/content/
    ├── schemas.ts             Zod schemas — Fact, Source, Firm
    ├── policy.ts              freshness thresholds and environment rules
    └── facts.ts               the sanctioned way to read a fact
```

Facts belong in `content/`, never in components. A component that hard-codes
`"10%"` has bypassed every guarantee described here.

## Anatomy of a Fact

```yaml
- key: max-drawdown # lowercase kebab-case, unique within the firm
  label: Maximum drawdown # shown in the UI
  value: 10 # string or number
  unit: '%' # optional
  status: verified # verified | demo | needs-review | deprecated
  source:
    url: https://example.com/rules # must be a valid absolute URL
    title: Trading rules # page title
    publisher: Example Firm # who published it
  lastVerified: 2026-09-08 # date the value was checked
  reviewer: A. Reviewer # optional, who checked it
  notes: Optional context. # optional
  previousValue: 12 # optional, retains history
```

## What each status means

| Status         | Meaning                                                | Publishable as fact?                |
| -------------- | ------------------------------------------------------ | ----------------------------------- |
| `verified`     | Checked against a named source on a recorded date      | Yes, until it expires               |
| `demo`         | Placeholder for layout. Not a claim about anyone       | Never — dev/staging rendering only  |
| `needs-review` | Was verified; now doubted or awaiting a recheck        | Never — dev/staging rendering only  |
| `deprecated`   | No longer current                                      | Never, in any environment           |

`demo` and `needs-review` render with a visible badge so a reader can always tell
an unverified value from a verified one. `deprecated` facts are retained as
history and are never rendered as current information.

## Validation rules

Enforced by Zod at build time. A violation **fails the build** rather than
producing a page with an unsupported claim on it.

| Rule                                                | Result |
| --------------------------------------------------- | ------ |
| `verified` without a source                          | Fail   |
| `verified` without `lastVerified`                    | Fail   |
| Source missing `url`, `title` or `publisher`         | Fail   |
| Malformed source URL                                 | Fail   |
| `lastVerified` in the future                         | Fail   |
| Duplicate fact keys within one firm                  | Fail   |
| Key not lowercase kebab-case                         | Fail   |

## Freshness

Thresholds live in `policy.ts` — `FRESHNESS_DAYS` — and nowhere else.

| Age of a `verified` fact | Behaviour                                              |
| ------------------------ | ------------------------------------------------------ |
| 0–90 days                | Fresh                                                  |
| Over 90 days             | **Stale** — still publishable, reported for recheck     |
| Over 180 days            | **Expired** — not publishable in production            |

Expiry is enforced in production only. Development and staging report staleness
but never fail on it, so an unrelated change is never blocked by the calendar.

## Demo facts and environments

| Environment   | `PUBLIC_ENV` | Demo facts | Expiry enforced |
| ------------- | ------------ | ---------- | --------------- |
| Development   | `development`| Allowed    | No              |
| Staging       | `staging`    | Allowed    | No              |
| Production    | `production` | **Blocked**| Yes (180 days)  |

**Production blocks demo facts unconditionally.** There is deliberately no
environment variable, missing value or malformed value that can switch them back
on — `PUBLIC_ALLOW_DEMO_FACTS` may only ever *tighten* the policy. Setting it to
`"false"` in development or staging is the supported way to rehearse production
behaviour and see exactly what would be blocked.

Misconfiguration fails loudly rather than degrading:

| Value                                        | Behaviour                                   |
| -------------------------------------------- | ------------------------------------------- |
| `PUBLIC_ENV` unset or empty                   | Development                                 |
| `PUBLIC_ENV=prod` / `Production` / any typo   | **Throws** — never silently becomes development |
| `PUBLIC_ALLOW_DEMO_FACTS=true` in production  | Ignored; demo facts stay blocked            |
| `PUBLIC_ALLOW_DEMO_FACTS=yes` / `1` / `flase` | **Throws** — never silently ignored         |

## Reading a fact from a page

Use `selectFact`. Never read `firm.facts` directly and never inline a value.

```ts
import { getEntry } from 'astro:content';
import { selectFact } from '../lib/content/facts';
import { resolvePolicy } from '../lib/content/policy';

const policy = resolvePolicy(import.meta.env);
const ftmo = await getEntry('firms', 'ftmo');
const drawdown = selectFact(ftmo.data, 'max-drawdown', policy);

// drawdown.display          -> "10%"
// drawdown.requiresDemoBadge -> true when the value is not verified
// drawdown.source            -> for the citation
// drawdown.stale             -> for a "last checked" caveat
```

`selectFact` throws when a fact may not be published under the active policy.
During a static build that turns an unpublishable claim into a failed build
rather than a page that quietly misinforms. Use `auditFirm` when you want a
report instead of an exception.

## Adding a verified fact

1. Open the firm's own page for the value. **Their site is the only acceptable source.**
2. Add or update the entry in `src/content/firms/<firm>.yaml`.
3. Record `source.url`, `source.title`, `source.publisher`, and set
   `lastVerified` to today's date and `reviewer` to your name.
4. Set `status: verified`.
5. Run `npm run check` and `npm test`, then `npm run build`.
6. Open a pull request. The value should be reviewed by a human against its
   source before it is merged.

If you cannot produce a source URL, the value is not verified. Mark it `demo`
or leave it out. There is no third option.

## Extending to other firms

Facts are keyed by firm, so adding one is a data change: a new YAML file in
`content/firms/`. No schema or component changes are required. Only firms the
site is commercially and legally cleared to cover should ever be added.
