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

---

# Phase 2B research notes

The first pass of real FTMO information. Recorded here so that every published
figure is traceable, and so the decisions about what was *not* published are
reviewable rather than invisible.

**Research date: 9 September 2026.** Every fact in `content/firms/ftmo.yaml`
carries that date in `lastVerified`.

## Method

1. FTMO's own pages only. Affiliate sites, forums, video, comparison tables and
   search-result snippets were not used as a factual source at any point. Where
   a search engine was used, it was to locate an FTMO page, which was then read
   directly.
2. Product structure was established before any value was recorded, because the
   1-Step and 2-Step products differ in ways that make a merged figure wrong for
   both.
3. Figures were cross-checked across more than one FTMO page wherever the same
   value appeared on more than one.
4. Nothing was inferred from a worked example, and nothing was carried over from
   the prototypes at the repository root. Those contain placeholder figures and
   are not a source.

## Sources used

| Page | URL |
| --- | --- |
| How it works | `https://ftmo.com/en/how-it-works/` |
| Trading Objectives | `https://ftmo.com/en/trading-objectives/` |
| Reward, Growth and Scaling Plan | `https://ftmo.com/en/reward-growth-and-scaling-plan/` |
| Trade without any time limit | `https://ftmo.com/en/trade-without-any-time-limit-and-take-as-long-as-you-want-to-pass/` |
| Is the entry fee refunded? | `https://ftmo.com/en/faq/is-the-entry-fee-refunded/` |
| How do I withdraw my profits? | `https://ftmo.com/en/faq/how-do-i-withdraw-my-profits/` |
| Can I trade news? | `https://ftmo.com/en/faq/can-i-trade-news/` |
| Do I have to close my positions overnight? | `https://ftmo.com/en/faq/do-i-have-to-close-my-positions-overnight/` |
| Which instruments and strategies are allowed? | `https://ftmo.com/en/faq/which-instruments-can-i-trade-and-what-strategies-am-i-allowed-to-use/` |
| FTMO Challenge: 1-Step | `https://ftmo.com/en/1-step-challenge/` |
| FTMO Challenge: 2-Step | `https://ftmo.com/en/2-step-challenge/` |
| Minimum time to pass 1-Step (regional FAQ, corroborating only) | `https://ftmo.com/au/faq/what-is-the-minimum-time-required-to-pass-ftmo-challenge-1-step/` |

## Findings that shaped the page

**The two products are genuinely different.** 1-Step and 2-Step are not the
same evaluation at a different price. They differ on the daily loss allowance,
the number of phases and their targets, the minimum trading days requirement,
the reward share a trader starts on, and whether the fee is refundable at all.
The homepage therefore renders them as two columns, never merged.

**Identical percentage, different mechanism.** Both products state the same
Maximum Loss percentage. On 1-Step it is an *end-of-day trailing* limit that
recalculates daily and can only move up; on 2-Step it is *static* against the
initial capital. Presenting one number for "maximum loss" would be accurate in
form and misleading in substance, which is why `ResearchFields` renders each
fact's `notes` alongside its value.

**The headline reward share is not the starting one.** FTMO markets "up to 90%".
1-Step traders do receive that from the start. 2-Step traders start lower and
reach it through the Scaling Plan or Premium Programme. Three FTMO pages state
this consistently once read together; taken alone, the marketing figure would
have been recorded as a flat fact and been wrong for 2-Step.

**Restrictions are much narrower than commonly stated.** The news restriction
and the overnight/weekend closing requirement apply only on a funded FTMO
Account, only to the Standard account type, and not at all during the Evaluation
Process. Swing accounts are exempt from both at every stage. Each fact's `notes`
carries those qualifications so they cannot be separated from the figure.

**No calendar deadline**, for accounts purchased after 13 July 2023, with older
accounts keeping their original time-limited terms and an inactivity caveat.

## Not published, and why

**Pricing — deliberately absent.** FTMO's fee table is assembled by a
client-side selector and is not present in the markup the site serves, so it
could not be read the way every other figure was. Separately, a promotional
discount was running on at least one account size at the time of research, so a
captured number would have risked presenting an offer as a standard rate.
Pricing also plausibly varies by currency and region. **No fee is published, in
any form.** Revisit only with a source that shows the standard rate, the
currency, and whether a promotion is active.

**Discrete account sizes.** Only the range is published. The individual
selectable sizes between the endpoints come from the same client-side selector
as the pricing, so they were not readable from the served page.

**Forbidden trading practices.** FTMO maintains a separate page of these. The
rules are qualitative and consequential, and summarising them risks turning
hedged language into a definitive prohibition. The homepage says the rules exist
and directs readers to check them; it does not paraphrase them.

**Anything legal or regulatory.** No claim is made about FTMO's regulatory
status, licensing, or the legal character of what it offers. Nothing in the
material reviewed supports such a characterisation, and none was inferred.

## FTMO Futures — scope decision

**Excluded from the homepage for now.** FTMO Futures is a separate product from
the CFD evaluation this page covers, and at the time of research it was labelled
Beta on FTMO's own site. It uses a different structure entirely — Growth and Pro
plans, sim-funded accounts, payout caps and a different account-size ceiling —
and its specific objectives are not published on its overview page.

Including it would mean adding a product dimension to the quick facts, the
account explorer and every rule panel: a significant information-architecture
change, not a content addition. The brief for this phase directed that such a
case be documented rather than forced in. Revisit when Futures leaves Beta, or
as a separate page with its own facts.

## Open items for review

1. **Human sign-off outstanding.** `reviewer` is deliberately absent on every
   fact. The values were collected and cross-checked against FTMO's own pages
   but have not been signed off by a person against the source, which the
   process above requires before merge. Add `reviewer` at that point.
2. **Resolved in review.** `one-step-min-trading-days` originally cited FTMO's
   Australian regional FAQ. A post-implementation audit located the global
   product pages `/en/1-step-challenge/` and `/en/2-step-challenge/`, which
   enumerate the Trading Objectives for each product: the 1-Step list contains
   no minimum trading days entry, while the 2-Step list states one explicitly.
   The fact now cites the global page, and the regional FAQ is retained in the
   note only as corroboration for the practical floor the Best Day Rule
   produces. Those two global pages also independently confirmed every other
   1-Step and 2-Step figure recorded here.
3. **Premium Programme** is referenced by FTMO as a route to the higher reward
   share but was not researched in this phase. No fact about it is published.
4. **Forbidden trading practices** should be reviewed properly in a later pass,
   with legal input on how much can be summarised without distorting it.
5. **Best Day Rule** applies to 1-Step. Whether any equivalent consistency
   requirement applies to 2-Step was not established either way, so nothing is
   claimed about it.
