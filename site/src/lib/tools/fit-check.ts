/**
 * Fit check.
 *
 * A preference-matching questionnaire over the *verified differences* between
 * FTMO's two evaluation products. It is not advice, it does not score a trader,
 * and it says nothing about whether anyone would pass, profit or should buy.
 * It answers exactly one question: which product's published rules line up more
 * closely with the preferences a reader just expressed.
 *
 * Two rules keep it honest.
 *
 * 1. **Questions are built from the record, not from memory.** A question is
 *    only offered when the facts that make it a real difference are actually
 *    published. Where the difference is numeric — which product allows the
 *    wider daily loss, which starts on the higher reward share — the direction
 *    of the lean is *computed by comparing the verified values*, never asserted
 *    here. If FTMO changed those numbers tomorrow, the questions would follow.
 *
 * 2. **Every question carries its evidence.** `evidenceKeys` names the facts
 *    behind the difference so the result can show the reader the sourced values
 *    that produced its answer, rather than asking for trust.
 */
import { asPercentFact, type ToolFactMap } from './facts';

export type Lean = 'one-step' | 'two-step';

export interface FitOption {
  id: string;
  label: string;
  lean: Lean;
}

export interface FitQuestion {
  id: string;
  legend: string;
  /** Plain-language framing of the underlying difference. */
  help: string;
  options: FitOption[];
  /** Fact keys that evidence this difference, shown with the result. */
  evidenceKeys: string[];
}

/** Every fact key the fit check may consult. */
export const FIT_CHECK_FACT_KEYS = [
  'one-step-profit-target',
  'two-step-challenge-profit-target',
  'two-step-verification-profit-target',
  'one-step-max-loss',
  'two-step-max-loss',
  'one-step-max-daily-loss',
  'two-step-max-daily-loss',
  'one-step-min-trading-days',
  'two-step-min-trading-days',
  'one-step-reward-split',
  'two-step-reward-split',
  'one-step-fee-refund',
  'two-step-fee-refund',
] as const;

/** True when every named fact is present in the payload. */
function hasAll(facts: ToolFactMap, keys: readonly string[]): boolean {
  return keys.every((key) => Boolean(facts[key]));
}

/**
 * Build the questionnaire for the facts currently published.
 *
 * A question whose supporting facts are missing is omitted rather than guessed
 * at, so the tool shrinks honestly instead of inventing a difference.
 */
export function buildFitQuestions(facts: ToolFactMap): FitQuestion[] {
  const questions: FitQuestion[] = [];

  // --- Number of phases -----------------------------------------------------
  const phaseKeys = [
    'one-step-profit-target',
    'two-step-challenge-profit-target',
    'two-step-verification-profit-target',
  ];
  if (hasAll(facts, phaseKeys)) {
    questions.push({
      id: 'phases',
      legend: 'How would you rather the evaluation be structured?',
      help: 'One product completes in a single phase. The other splits the requirement across a first phase and a second, lower one.',
      options: [
        { id: 'single', label: 'A single phase to complete', lean: 'one-step' },
        { id: 'split', label: 'Two phases, with a lower second target', lean: 'two-step' },
      ],
      evidenceKeys: phaseKeys,
    });
  }

  // --- Loss-limit mechanism -------------------------------------------------
  // Both products publish the same percentage; the mechanism differs, and that
  // difference is recorded in each fact's note rather than in its value.
  const lossKeys = ['one-step-max-loss', 'two-step-max-loss'];
  if (hasAll(facts, lossKeys)) {
    questions.push({
      id: 'loss-mechanism',
      legend: 'How would you rather the overall loss limit behave?',
      help: 'On one product the limit is fixed against your starting capital for the whole evaluation. On the other it trails: it is recalculated daily and follows the account upward as your end-of-day balance grows.',
      options: [
        {
          id: 'static',
          label: 'Fixed in one place, so I always know where it is',
          lean: 'two-step',
        },
        {
          id: 'trailing',
          label: 'Trailing upward as the account grows, and never back down',
          lean: 'one-step',
        },
      ],
      evidenceKeys: lossKeys,
    });
  }

  // --- Daily allowance — direction derived from the verified values ---------
  const oneStepDaily = asPercentFact(facts['one-step-max-daily-loss']);
  const twoStepDaily = asPercentFact(facts['two-step-max-daily-loss']);
  if (oneStepDaily && twoStepDaily && oneStepDaily.percent !== twoStepDaily.percent) {
    const widerIsOneStep = oneStepDaily.percent > twoStepDaily.percent;
    questions.push({
      id: 'daily-allowance',
      legend: 'How much room would you want inside a single trading day?',
      help: 'The two products allow different daily losses before the account ends. A wider allowance absorbs a bad session; a tighter one forces smaller risk per trade.',
      options: [
        {
          id: 'wider',
          label: 'A wider daily allowance',
          lean: widerIsOneStep ? 'one-step' : 'two-step',
        },
        {
          id: 'tighter',
          label: 'A tighter daily allowance is fine',
          lean: widerIsOneStep ? 'two-step' : 'one-step',
        },
      ],
      evidenceKeys: ['one-step-max-daily-loss', 'two-step-max-daily-loss'],
    });
  }

  // --- Minimum trading days -------------------------------------------------
  const dayKeys = ['one-step-min-trading-days', 'two-step-min-trading-days'];
  if (hasAll(facts, dayKeys)) {
    questions.push({
      id: 'trading-days',
      legend: 'Does a minimum number of trading days matter to you?',
      help: 'One product sets no minimum trading days objective. The other requires trading on a minimum number of separate days before a phase can complete.',
      options: [
        { id: 'no-minimum', label: 'I would rather have no minimum to satisfy', lean: 'one-step' },
        { id: 'minimum-ok', label: 'A minimum number of days is not a problem', lean: 'two-step' },
      ],
      evidenceKeys: dayKeys,
    });
  }

  // --- Reward share — direction derived from the verified values ------------
  const oneStepReward = asPercentFact(facts['one-step-reward-split']);
  const twoStepReward = asPercentFact(facts['two-step-reward-split']);
  if (oneStepReward && twoStepReward && oneStepReward.percent !== twoStepReward.percent) {
    const higherIsOneStep = oneStepReward.percent > twoStepReward.percent;
    questions.push({
      id: 'reward',
      legend: 'Which reward arrangement would you prefer?',
      help: 'One product starts you on the higher share immediately. The other starts lower, and reaches the higher rate only once Scaling Plan or Premium Programme conditions are met.',
      options: [
        {
          id: 'higher-now',
          label: 'The higher share from the start',
          lean: higherIsOneStep ? 'one-step' : 'two-step',
        },
        {
          id: 'lower-now',
          label: 'A lower starting share, with a route to the higher rate',
          lean: higherIsOneStep ? 'two-step' : 'one-step',
        },
      ],
      evidenceKeys: ['one-step-reward-split', 'two-step-reward-split'],
    });
  }

  // --- Fee refund -----------------------------------------------------------
  const refundKeys = ['one-step-fee-refund', 'two-step-fee-refund'];
  if (hasAll(facts, refundKeys)) {
    questions.push({
      id: 'refund',
      legend: 'How much does the fee coming back matter to you?',
      help: 'On one product the fee is not refunded at all. On the other it may be refunded with your first reward withdrawal, which makes it conditional on reaching a payout rather than on passing.',
      options: [
        {
          id: 'refund-matters',
          label: 'I would want the possibility of the fee being refunded',
          lean: 'two-step',
        },
        {
          id: 'refund-secondary',
          label: 'I treat the fee as spent either way',
          lean: 'one-step',
        },
      ],
      evidenceKeys: refundKeys,
    });
  }

  return questions;
}

export type FitOutcome = 'one-step' | 'two-step' | 'balanced' | 'incomplete';

export interface FitResult {
  outcome: FitOutcome;
  oneStep: number;
  twoStep: number;
  answered: number;
  total: number;
  /** Deduplicated fact keys behind the questions that were answered. */
  evidenceKeys: string[];
}

/**
 * Tally the answers.
 *
 * Every question weighs the same. There is no hidden weighting that would
 * quietly steer the outcome, and a tie is reported as a tie rather than being
 * broken toward one product.
 */
export function scoreFitCheck(
  questions: readonly FitQuestion[],
  answers: Readonly<Record<string, string>>,
): FitResult {
  let oneStep = 0;
  let twoStep = 0;
  let answered = 0;
  const evidence = new Set<string>();

  for (const question of questions) {
    const chosen = answers[question.id];
    if (!chosen) continue;

    const option = question.options.find((candidate) => candidate.id === chosen);
    if (!option) continue;

    answered += 1;
    for (const key of question.evidenceKeys) evidence.add(key);

    if (option.lean === 'one-step') oneStep += 1;
    else twoStep += 1;
  }

  const total = questions.length;

  let outcome: FitOutcome;
  if (total === 0 || answered < total) {
    outcome = 'incomplete';
  } else if (oneStep > twoStep) {
    outcome = 'one-step';
  } else if (twoStep > oneStep) {
    outcome = 'two-step';
  } else {
    outcome = 'balanced';
  }

  return { outcome, oneStep, twoStep, answered, total, evidenceKeys: [...evidence] };
}

/**
 * Which product a fact describes, read from this project's own key convention.
 *
 * The keys are ours, not FTMO's, so reading them is not a second source of
 * truth about the firm — it recovers the product scoping that Phase 2B encoded
 * in the key when it recorded the two products separately. It matters in the
 * result panel, where several facts share a label ("Maximum Loss") and differ
 * only by product.
 */
export function productForKey(key: string): 'one-step' | 'two-step' | null {
  if (key.startsWith('one-step-')) return 'one-step';
  if (key.startsWith('two-step-')) return 'two-step';
  return null;
}

const PRODUCT_LABELS: Record<'one-step' | 'two-step', string> = {
  'one-step': '1-Step',
  'two-step': '2-Step',
};

/** Prefix a fact label with its product, when the key names one. */
export function labelWithProduct(key: string, label: string): string {
  const product = productForKey(key);
  return product ? `${PRODUCT_LABELS[product]} · ${label}` : label;
}

/** Group evidence by product so the two columns read as a comparison. */
export function orderEvidenceKeys(keys: readonly string[]): string[] {
  const rank = (key: string): number => {
    const product = productForKey(key);
    if (product === 'one-step') return 0;
    if (product === 'two-step') return 1;
    return 2;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * The sentence shown for a result.
 *
 * Deliberately phrased as alignment with stated preferences. It never
 * recommends a purchase, promises an outcome, or describes either product as
 * better, safer or easier.
 */
export function describeFitOutcome(result: FitResult): string {
  switch (result.outcome) {
    case 'one-step':
      return 'Based on your answers, FTMO Challenge: 1-Step may align more closely with these preferences.';
    case 'two-step':
      return 'Based on your answers, FTMO Challenge: 2-Step may align more closely with these preferences.';
    case 'balanced':
      return 'Based on your answers, neither product aligns more closely than the other — your preferences are split evenly between them.';
    case 'incomplete':
      return 'Answer every question to see which product aligns more closely with your preferences.';
  }
}
