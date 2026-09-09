import { describe, it, expect } from 'vitest';

import {
  asPercentFact,
  parseAccountSizeRange,
  toToolFacts,
  type ToolFact,
  type ToolFactMap,
} from '../src/lib/tools/facts';
import {
  CALC_LIMITS,
  computeRuleAmounts,
  formatUsd,
  parseAmount,
  percentageAmount,
  roundMoney,
} from '../src/lib/tools/calculator';
import {
  buildFitQuestions,
  describeFitOutcome,
  labelWithProduct,
  orderEvidenceKeys,
  productForKey,
  scoreFitCheck,
  type FitQuestion,
} from '../src/lib/tools/fit-check';
import type { DisplayFact } from '../src/lib/content/facts';

const ACCOUNT_BOUNDS = { min: CALC_LIMITS.minAccount, max: CALC_LIMITS.maxAccount };

function toolFact(overrides: Partial<ToolFact> & Pick<ToolFact, 'key'>): ToolFact {
  return {
    label: 'Label',
    display: '10%',
    value: 10,
    unit: '%',
    ...overrides,
  };
}

function displayFact(overrides: Partial<DisplayFact> & Pick<DisplayFact, 'key'>): DisplayFact {
  return {
    label: 'Maximum Loss',
    display: '10%',
    value: 10,
    unit: '%',
    status: 'verified',
    requiresDemoBadge: false,
    stale: false,
    ageDays: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The bridge from validated content to the browser
// ---------------------------------------------------------------------------
describe('toToolFacts', () => {
  it('carries value, unit, notes and provenance across', () => {
    const source = { url: 'https://ftmo.com/en/trading-objectives/', title: 'Trading Objectives', publisher: 'FTMO' };
    const facts = new Map<string, DisplayFact>([
      ['max-loss', displayFact({ key: 'max-loss', notes: 'Trails daily.', source })],
    ]);

    const payload = toToolFacts(facts, ['max-loss']);

    expect(payload['max-loss']).toEqual({
      key: 'max-loss',
      label: 'Maximum Loss',
      display: '10%',
      value: 10,
      unit: '%',
      notes: 'Trails daily.',
      sourceUrl: source.url,
      sourceTitle: source.title,
    });
  });

  it('omits keys that are absent rather than emitting a hollow entry', () => {
    const facts = new Map<string, DisplayFact>([['present', displayFact({ key: 'present' })]]);

    const payload = toToolFacts(facts, ['present', 'missing']);

    expect(Object.keys(payload)).toEqual(['present']);
    expect(payload['missing']).toBeUndefined();
    // The distinction that matters: absent, not zero.
    expect('missing' in payload).toBe(false);
  });

  it('returns an empty payload when no facts are published at all', () => {
    expect(toToolFacts(new Map(), ['a', 'b'])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Only genuinely numeric percentages may be used for arithmetic
// ---------------------------------------------------------------------------
describe('asPercentFact', () => {
  it('accepts a numeric fact carrying a percent unit', () => {
    const result = asPercentFact(toolFact({ key: 'max-loss', value: 10, unit: '%' }));
    expect(result?.percent).toBe(10);
    expect(result?.display).toBe('10%');
  });

  it('accepts a decimal percentage', () => {
    const result = asPercentFact(toolFact({ key: 'x', value: 2.5, unit: '%', display: '2.5%' }));
    expect(result?.percent).toBe(2.5);
  });

  it('refuses prose values, so "No minimum" never becomes a number', () => {
    expect(asPercentFact(toolFact({ key: 'days', value: 'No minimum', unit: undefined }))).toBeNull();
    expect(asPercentFact(toolFact({ key: 'refund', value: 'Not refunded', unit: undefined }))).toBeNull();
    expect(asPercentFact(toolFact({ key: 'period', value: 'Unlimited', unit: undefined }))).toBeNull();
  });

  it('refuses a numeric fact whose unit is not a percentage', () => {
    expect(asPercentFact(toolFact({ key: 'days', value: 4, unit: 'trading days' }))).toBeNull();
    expect(asPercentFact(toolFact({ key: 'hours', value: 2, unit: 'hours' }))).toBeNull();
  });

  it('refuses a percent-united fact whose value is not parseable', () => {
    expect(asPercentFact(toolFact({ key: 'x', value: 'lots', unit: '%' }))).toBeNull();
  });

  it('refuses a missing fact', () => {
    expect(asPercentFact(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Account-size range parsing
// ---------------------------------------------------------------------------
describe('parseAccountSizeRange', () => {
  it('reads both endpoints out of the published wording', () => {
    expect(parseAccountSizeRange('$10,000 – $200,000')).toEqual({ min: 10000, max: 200000 });
  });

  it('tolerates hyphen and em dash separators', () => {
    expect(parseAccountSizeRange('$10,000 - $200,000')).toEqual({ min: 10000, max: 200000 });
    expect(parseAccountSizeRange('$10,000 — $200,000')).toEqual({ min: 10000, max: 200000 });
  });

  it('returns null rather than guessing when the wording does not parse', () => {
    expect(parseAccountSizeRange('Up to $200,000')).toBeNull();
    expect(parseAccountSizeRange('varies by region')).toBeNull();
    expect(parseAccountSizeRange(undefined)).toBeNull();
    expect(parseAccountSizeRange('')).toBeNull();
  });

  it('rejects an inverted or non-positive range', () => {
    expect(parseAccountSizeRange('$200,000 – $10,000')).toBeNull();
    expect(parseAccountSizeRange('$0 – $0')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
describe('parseAmount', () => {
  it('accepts a plain number', () => {
    expect(parseAmount('100000', ACCOUNT_BOUNDS)).toEqual({ ok: true, value: 100000 });
  });

  it('accepts presentation characters a person would actually type', () => {
    expect(parseAmount('$100,000', ACCOUNT_BOUNDS)).toEqual({ ok: true, value: 100000 });
    expect(parseAmount(' 100 000 ', ACCOUNT_BOUNDS)).toEqual({ ok: true, value: 100000 });
  });

  it('accepts decimals within the bounds', () => {
    expect(parseAmount('1234.56', ACCOUNT_BOUNDS)).toEqual({ ok: true, value: 1234.56 });
    expect(parseAmount('2.5', { min: 1, max: 100 })).toEqual({ ok: true, value: 2.5 });
    // A decimal below the minimum is rejected as too small, not as non-numeric.
    expect(parseAmount('0.5', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'too-small' });
  });

  it('reports an empty or whitespace-only value', () => {
    expect(parseAmount('', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'empty' });
    expect(parseAmount('   ', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'empty' });
  });

  it('reports non-numeric text', () => {
    expect(parseAmount('abc', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'not-a-number' });
    expect(parseAmount('10k', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'not-a-number' });
    expect(parseAmount('1,2,3.4.5', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'not-a-number' });
    expect(parseAmount('$', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'not-a-number' });
  });

  it('reports zero separately from negative', () => {
    expect(parseAmount('0', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'zero' });
    expect(parseAmount('0.00', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'zero' });
    expect(parseAmount('-5000', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'negative' });
  });

  it('never lets NaN or Infinity through', () => {
    expect(parseAmount('NaN', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'not-a-number' });
    expect(parseAmount('Infinity', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'not-a-number' });
    expect(parseAmount('-Infinity', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'not-a-number' });
    expect(parseAmount('1e999', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'not-a-number' });
  });

  it('applies the calculator usability bounds', () => {
    expect(parseAmount('2000000000', ACCOUNT_BOUNDS)).toEqual({ ok: false, problem: 'too-large' });
    expect(parseAmount('0.5', { min: 1, max: 100 })).toEqual({ ok: false, problem: 'too-small' });
  });

  it('treats the bounds as inclusive', () => {
    expect(parseAmount('1', { min: 1, max: 100 })).toEqual({ ok: true, value: 1 });
    expect(parseAmount('100', { min: 1, max: 100 })).toEqual({ ok: true, value: 100 });
  });
});

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------
describe('percentageAmount', () => {
  it('converts a percentage of capital into an amount', () => {
    expect(percentageAmount(100000, 10)).toBe(10000);
    expect(percentageAmount(100000, 3)).toBe(3000);
    expect(percentageAmount(100000, 5)).toBe(5000);
  });

  it('handles decimal percentages and capital', () => {
    expect(percentageAmount(10000, 2.5)).toBe(250);
    expect(percentageAmount(1234.56, 10)).toBe(123.46);
  });

  it('rounds to cents without floating-point tails', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(percentageAmount(8250, 1)).toBe(82.5);
  });

  it('returns zero for a zero percentage', () => {
    expect(percentageAmount(100000, 0)).toBe(0);
  });
});

describe('formatUsd', () => {
  it('formats whole amounts without stray decimals', () => {
    expect(formatUsd(10000)).toBe('$10,000');
    expect(formatUsd(0)).toBe('$0');
  });

  it('keeps cents when they exist', () => {
    expect(formatUsd(123.46)).toBe('$123.46');
    expect(formatUsd(82.5)).toBe('$82.5');
  });

  it('never renders NaN or Infinity into the interface', () => {
    expect(formatUsd(Number.NaN)).toBe('—');
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('computeRuleAmounts', () => {
  it('pairs each verified rule with its derived amount and keeps provenance', () => {
    const facts = [
      {
        key: 'one-step-max-loss',
        label: 'Maximum Loss',
        percent: 10,
        display: '10%',
        notes: 'Trailing.',
        sourceUrl: 'https://ftmo.com/en/trading-objectives/',
        sourceTitle: 'Trading Objectives',
      },
    ];

    const [row] = computeRuleAmounts(100000, facts);

    expect(row).toMatchObject({
      key: 'one-step-max-loss',
      ruleDisplay: '10%',
      amount: 10000,
      amountDisplay: '$10,000',
      notes: 'Trailing.',
      sourceTitle: 'Trading Objectives',
    });
  });

  it('produces nothing when no usable percentage facts were supplied', () => {
    expect(computeRuleAmounts(100000, [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Product separation — the two products must never share a figure
// ---------------------------------------------------------------------------
describe('1-Step and 2-Step separation', () => {
  const oneStep = { key: 'one-step-max-daily-loss', label: 'Maximum Daily Loss', percent: 3, display: '3%' };
  const twoStep = { key: 'two-step-max-daily-loss', label: 'Maximum Daily Loss', percent: 5, display: '5%' };

  it('derives different amounts from the two products at the same capital', () => {
    const [one] = computeRuleAmounts(100000, [oneStep]);
    const [two] = computeRuleAmounts(100000, [twoStep]);

    expect(one!.amount).toBe(3000);
    expect(two!.amount).toBe(5000);
    expect(one!.amount).not.toBe(two!.amount);
  });

  it('keeps each amount tied to the key of the product it came from', () => {
    const rows = computeRuleAmounts(50000, [oneStep, twoStep]);
    expect(rows.map((row) => row.key)).toEqual([
      'one-step-max-daily-loss',
      'two-step-max-daily-loss',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Fit check
// ---------------------------------------------------------------------------
const FULL_FACTS: ToolFactMap = {
  'one-step-profit-target': toolFact({ key: 'one-step-profit-target' }),
  'two-step-challenge-profit-target': toolFact({ key: 'two-step-challenge-profit-target' }),
  'two-step-verification-profit-target': toolFact({ key: 'two-step-verification-profit-target', value: 5, display: '5%' }),
  'one-step-max-loss': toolFact({ key: 'one-step-max-loss' }),
  'two-step-max-loss': toolFact({ key: 'two-step-max-loss' }),
  'one-step-max-daily-loss': toolFact({ key: 'one-step-max-daily-loss', value: 3, display: '3%' }),
  'two-step-max-daily-loss': toolFact({ key: 'two-step-max-daily-loss', value: 5, display: '5%' }),
  'one-step-min-trading-days': toolFact({ key: 'one-step-min-trading-days', value: 'No minimum', unit: undefined, display: 'No minimum' }),
  'two-step-min-trading-days': toolFact({ key: 'two-step-min-trading-days', value: 4, unit: 'trading days', display: '4 trading days' }),
  'one-step-reward-split': toolFact({ key: 'one-step-reward-split', value: 90, display: '90%' }),
  'two-step-reward-split': toolFact({ key: 'two-step-reward-split', value: 80, display: '80%' }),
  'one-step-fee-refund': toolFact({ key: 'one-step-fee-refund', value: 'Not refunded', unit: undefined, display: 'Not refunded' }),
  'two-step-fee-refund': toolFact({ key: 'two-step-fee-refund', value: 'With first Reward withdrawal', unit: undefined, display: 'With first Reward withdrawal' }),
};

describe('buildFitQuestions', () => {
  it('builds the full questionnaire when every supporting fact is published', () => {
    const questions = buildFitQuestions(FULL_FACTS);
    expect(questions.map((question) => question.id)).toEqual([
      'phases',
      'loss-mechanism',
      'daily-allowance',
      'trading-days',
      'reward',
      'refund',
    ]);
  });

  it('gives every question exactly one option per product', () => {
    for (const question of buildFitQuestions(FULL_FACTS)) {
      const leans = question.options.map((option) => option.lean).sort();
      expect(leans).toEqual(['one-step', 'two-step']);
    }
  });

  it('derives the daily-allowance lean from the verified values, not a hard-coded assumption', () => {
    const questions = buildFitQuestions(FULL_FACTS);
    const wider = questions.find((q) => q.id === 'daily-allowance')!.options.find((o) => o.id === 'wider')!;
    // 2-Step allows the wider daily loss in the real record.
    expect(wider.lean).toBe('two-step');

    // Swap the two values and the lean must follow the data.
    const swapped = buildFitQuestions({
      ...FULL_FACTS,
      'one-step-max-daily-loss': toolFact({ key: 'one-step-max-daily-loss', value: 9, display: '9%' }),
    });
    const swappedWider = swapped.find((q) => q.id === 'daily-allowance')!.options.find((o) => o.id === 'wider')!;
    expect(swappedWider.lean).toBe('one-step');
  });

  it('derives the reward lean from the verified values too', () => {
    const swapped = buildFitQuestions({
      ...FULL_FACTS,
      'one-step-reward-split': toolFact({ key: 'one-step-reward-split', value: 70, display: '70%' }),
    });
    const higher = swapped.find((q) => q.id === 'reward')!.options.find((o) => o.id === 'higher-now')!;
    expect(higher.lean).toBe('two-step');
  });

  it('omits a question whose supporting facts are missing', () => {
    const { 'one-step-fee-refund': _omitted, ...withoutRefund } = FULL_FACTS;
    const ids = buildFitQuestions(withoutRefund).map((question) => question.id);
    expect(ids).not.toContain('refund');
    expect(ids).toContain('phases');
  });

  it('omits a numeric question when the two products do not actually differ', () => {
    const ids = buildFitQuestions({
      ...FULL_FACTS,
      'two-step-max-daily-loss': toolFact({ key: 'two-step-max-daily-loss', value: 3, display: '3%' }),
    }).map((question) => question.id);
    expect(ids).not.toContain('daily-allowance');
  });

  it('produces no questions at all when nothing is published', () => {
    expect(buildFitQuestions({})).toEqual([]);
  });
});

describe('scoreFitCheck', () => {
  const questions = buildFitQuestions(FULL_FACTS);

  function answerAll(pick: (question: FitQuestion) => string): Record<string, string> {
    return Object.fromEntries(questions.map((question) => [question.id, pick(question)]));
  }

  it('reports incomplete until every question is answered', () => {
    const result = scoreFitCheck(questions, { phases: 'single' });
    expect(result.outcome).toBe('incomplete');
    expect(result.answered).toBe(1);
    expect(result.total).toBe(questions.length);
  });

  it('leans 1-Step when every answer does', () => {
    const answers = answerAll((q) => q.options.find((o) => o.lean === 'one-step')!.id);
    const result = scoreFitCheck(questions, answers);
    expect(result.outcome).toBe('one-step');
    expect(result.oneStep).toBe(questions.length);
    expect(result.twoStep).toBe(0);
  });

  it('leans 2-Step when every answer does', () => {
    const answers = answerAll((q) => q.options.find((o) => o.lean === 'two-step')!.id);
    expect(scoreFitCheck(questions, answers).outcome).toBe('two-step');
  });

  it('reports a tie as balanced rather than breaking it', () => {
    const answers = answerAll((q, i = questions.indexOf(q)) =>
      q.options.find((o) => o.lean === (i % 2 === 0 ? 'one-step' : 'two-step'))!.id,
    );
    const result = scoreFitCheck(questions, answers);
    expect(result.oneStep).toBe(result.twoStep);
    expect(result.outcome).toBe('balanced');
  });

  it('ignores an answer id that does not belong to the question', () => {
    const answers = { ...answerAll((q) => q.options[0]!.id), phases: 'not-an-option' };
    const result = scoreFitCheck(questions, answers);
    expect(result.answered).toBe(questions.length - 1);
    expect(result.outcome).toBe('incomplete');
  });

  it('collects the evidence keys behind the answered questions', () => {
    const result = scoreFitCheck(questions, answerAll((q) => q.options[0]!.id));
    expect(result.evidenceKeys).toContain('one-step-max-daily-loss');
    expect(result.evidenceKeys).toContain('two-step-max-daily-loss');
    expect(new Set(result.evidenceKeys).size).toBe(result.evidenceKeys.length);
  });

  it('handles an empty questionnaire without claiming an outcome', () => {
    expect(scoreFitCheck([], {}).outcome).toBe('incomplete');
  });
});

describe('describeFitOutcome', () => {
  const base = { oneStep: 0, twoStep: 0, answered: 0, total: 6, evidenceKeys: [] };

  it('phrases every outcome as preference alignment, never as advice', () => {
    const sentences = (['one-step', 'two-step', 'balanced', 'incomplete'] as const).map((outcome) =>
      describeFitOutcome({ ...base, outcome }),
    );

    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/should|best|recommend|guarantee|will pass|safest|cheapest|easiest/i);
    }
    expect(sentences[0]).toMatch(/1-Step may align more closely/);
    expect(sentences[1]).toMatch(/2-Step may align more closely/);
  });
});

describe('evidence labelling', () => {
  it('recovers the product from the key convention', () => {
    expect(productForKey('one-step-max-loss')).toBe('one-step');
    expect(productForKey('two-step-max-loss')).toBe('two-step');
    expect(productForKey('account-size-range')).toBeNull();
  });

  it('disambiguates labels that two products share', () => {
    // Both products publish a fact labelled "Maximum Loss"; without the product
    // prefix the result panel would show the same label twice.
    expect(labelWithProduct('one-step-max-loss', 'Maximum Loss')).toBe('1-Step · Maximum Loss');
    expect(labelWithProduct('two-step-max-loss', 'Maximum Loss')).toBe('2-Step · Maximum Loss');
  });

  it('leaves a product-neutral label alone', () => {
    expect(labelWithProduct('account-types', 'Account types')).toBe('Account types');
  });

  it('groups evidence by product so the panel reads as a comparison', () => {
    const ordered = orderEvidenceKeys([
      'two-step-max-loss',
      'one-step-reward-split',
      'account-types',
      'one-step-max-loss',
    ]);
    expect(ordered).toEqual([
      'one-step-max-loss',
      'one-step-reward-split',
      'two-step-max-loss',
      'account-types',
    ]);
  });

  it('does not mutate the input', () => {
    const input = ['two-step-max-loss', 'one-step-max-loss'];
    orderEvidenceKeys(input);
    expect(input).toEqual(['two-step-max-loss', 'one-step-max-loss']);
  });
});
