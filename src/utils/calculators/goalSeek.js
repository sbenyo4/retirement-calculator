import { calculateRetirementProjection } from '../calculator';
import { WITHDRAWAL_STRATEGIES } from '../../constants';
import { getMonthsBetweenAges } from '../dateUtils';

/**
 * Runs a full projection with an optional goal-seek pass for targetEndBalance.
 *
 * Goal-seek finds the monthly withdrawal that leaves exactly `targetEndBalance`
 * at the end of retirement, using a 25-iteration binary search.
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
        projection.balanceAtRetirement > 0 && // skip when there is nothing to seek against
        retirementMonths > 0; // skip when retirement duration is zero (avoids division by zero)

    if (shouldGoalSeek) {
        let lo = 0;
        // Upper bound: 3× the simple equal-division withdrawal; clamped to at least 1
        let hi = Math.max(1, (projection.balanceAtRetirement / retirementMonths) * 3);

        for (let iter = 0; iter < 25; iter++) {
            const mid = (lo + hi) / 2;
            const test = calculateRetirementProjection({
                ...inputs,
                monthlyNetIncomeDesired: mid,
                targetEndBalance: '',
            });
            if (test.balanceAtEnd > targetEnd) lo = mid;
            else hi = mid;
        }

        goalSeekWithdrawal = Math.round((lo + hi) / 2);
        projection = calculateRetirementProjection({
            ...inputs,
            monthlyNetIncomeDesired: goalSeekWithdrawal,
            targetEndBalance: '',
        });
    }

    return { projection, goalSeekWithdrawal };
}
