import { calculateRetirementProjection } from '../calculator';
import { WITHDRAWAL_STRATEGIES } from '../../constants';
import { getMonthsBetweenAges } from '../dateUtils';

const GOAL_SEEK_MAX_WITHDRAWAL = 10_000_000;
const GOAL_SEEK_ITERATIONS = 45;
const GOAL_SEEK_MIN_WITHDRAWAL = 1;

const getEndBalanceForWithdrawal = (inputs, monthlyWithdrawal) => {
    return calculateRetirementProjection({
        ...inputs,
        monthlyNetIncomeDesired: monthlyWithdrawal,
        targetEndBalance: '',
    }).balanceAtEnd;
};

const pickBestWholeCurrencyWithdrawal = (inputs, exactWithdrawal, targetEnd) => {
    const rounded = Math.max(GOAL_SEEK_MIN_WITHDRAWAL, Math.round(exactWithdrawal));
    const candidates = new Set([
        Math.max(GOAL_SEEK_MIN_WITHDRAWAL, Math.floor(exactWithdrawal)),
        rounded,
        Math.max(GOAL_SEEK_MIN_WITHDRAWAL, Math.ceil(exactWithdrawal)),
    ]);

    let best = rounded;
    let bestDiff = Infinity;

    candidates.forEach(candidate => {
        const endBalance = getEndBalanceForWithdrawal(inputs, candidate);
        const diff = Math.abs(endBalance - targetEnd);
        if (diff < bestDiff || (diff === bestDiff && candidate > best)) {
            best = candidate;
            bestDiff = diff;
        }
    });

    return best;
};

/**
 * Finds the fixed monthly net withdrawal that leaves `targetEndBalance`.
 *
 * The UI displays and accepts whole currency units, so the returned value is the
 * integer that reproduces the target most closely when entered back as income.
 */
export function findMonthlyWithdrawalForTargetEndBalance(inputs, targetEndBalance) {
    const targetEnd = parseFloat(targetEndBalance);
    const retirementStart = parseFloat(inputs.retirementStartAge);
    const retirementEnd = parseFloat(inputs.retirementEndAge);
    const retirementMonths = getMonthsBetweenAges(retirementStart, retirementEnd);

    if (isNaN(targetEnd) || targetEnd < 0 || retirementMonths <= 0) return null;

    const minWithdrawalEnd = getEndBalanceForWithdrawal(inputs, GOAL_SEEK_MIN_WITHDRAWAL);
    if (minWithdrawalEnd <= targetEnd) return GOAL_SEEK_MIN_WITHDRAWAL;

    let lo = GOAL_SEEK_MIN_WITHDRAWAL;
    let hi = Math.max(1, parseFloat(inputs.monthlyNetIncomeDesired) || 0);

    while (hi < GOAL_SEEK_MAX_WITHDRAWAL && getEndBalanceForWithdrawal(inputs, hi) > targetEnd) {
        hi *= 2;
    }

    hi = Math.min(hi, GOAL_SEEK_MAX_WITHDRAWAL);

    for (let iter = 0; iter < GOAL_SEEK_ITERATIONS; iter++) {
        const mid = (lo + hi) / 2;
        if (getEndBalanceForWithdrawal(inputs, mid) > targetEnd) lo = mid;
        else hi = mid;
    }

    return pickBestWholeCurrencyWithdrawal(inputs, (lo + hi) / 2, targetEnd);
}

export function findGoalSeekResultForTargetEndBalance(inputs, targetEndBalance) {
    const baseWithdrawal = findMonthlyWithdrawalForTargetEndBalance(inputs, targetEndBalance);
    if (baseWithdrawal === null) return null;

    const projection = calculateRetirementProjection({
        ...inputs,
        monthlyNetIncomeDesired: baseWithdrawal,
        targetEndBalance: '',
    });

    return {
        baseWithdrawal,
        effectiveWithdrawal: Math.round(projection.averageNetWithdrawal ?? baseWithdrawal),
        projection,
    };
}

/**
 * Runs a full projection with an optional goal-seek pass for targetEndBalance.
 *
 * Goal-seek finds the monthly withdrawal that leaves `targetEndBalance`
 * at the end of retirement as closely as possible after whole-currency rounding.
 *
 * Edge cases:
 * - Skipped when balanceAtRetirement === 0 (nothing to withdraw).
 * - Skipped for non-FIXED withdrawal strategies (goal-seek is only meaningful
 *   for fixed withdrawals; dynamic/percentage strategies self-adjust already).
 *
 * @param {Object} inputs - Full retirement inputs passed to calculateRetirementProjection
 * @returns {{ projection: Object, goalSeekWithdrawal: number|null }}
 */
export function runProjectionWithGoalSeek(inputs) {
    let projection = calculateRetirementProjection(inputs);
    let goalSeekWithdrawal = null;

    const targetEnd = parseFloat(inputs.targetEndBalance);
    const retirementStart = parseFloat(inputs.retirementStartAge);
    const retirementEnd = parseFloat(inputs.retirementEndAge);
    const isFixedStrategy = !inputs.withdrawalStrategy ||
        inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.FIXED;

    const retirementMonths = getMonthsBetweenAges(retirementStart, retirementEnd);

    const shouldGoalSeek =
        isFixedStrategy &&
        !isNaN(targetEnd) &&
        targetEnd >= 0 &&
        inputs.targetEndBalance !== '' &&
        projection.balanceAtRetirement > 0 &&
        retirementMonths > 0;

    if (shouldGoalSeek) {
        const seekResult = findGoalSeekResultForTargetEndBalance(inputs, targetEnd);
        goalSeekWithdrawal = seekResult?.baseWithdrawal ?? null;
        projection = {
            ...(seekResult?.projection ?? projection),
            goalSeekBaseWithdrawal: seekResult?.baseWithdrawal ?? null,
            goalSeekEffectiveWithdrawal: seekResult?.effectiveWithdrawal ?? null,
        };
    }

    return { projection, goalSeekWithdrawal };
}
