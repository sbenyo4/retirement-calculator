import { calculateSimulation } from '../utils/simulation-calculator';
import { calculateRetirementProjection } from '../utils/calculator';
import { WITHDRAWAL_STRATEGIES } from '../constants';

self.onmessage = function (e) {
    const { requestId, type, inputs, simulationType } = e.data;
    try {
        const result = type === 'projection'
            ? runProjectionWithGoalSeek(inputs)
            : calculateSimulation(inputs, simulationType);
        self.postMessage({ requestId, type, result, error: null });
    } catch (error) {
        self.postMessage({ requestId, type, result: null, error: error.message });
    }
};

/**
 * Runs a full projection with an optional goal-seek pass for targetEndBalance.
 * Returns { projection, goalSeekWithdrawal }.
 */
function runProjectionWithGoalSeek(inputs) {
    let projection = calculateRetirementProjection(inputs);
    let goalSeekWithdrawal = null;

    const targetEnd = parseFloat(inputs.targetEndBalance);
    const retirementStart = parseFloat(inputs.retirementStartAge);
    const retirementEnd = parseFloat(inputs.retirementEndAge);
    const isFixedStrategy = !inputs.withdrawalStrategy ||
        inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.FIXED;

    if (isFixedStrategy && !isNaN(targetEnd) && targetEnd >= 0 && inputs.targetEndBalance !== '') {
        let lo = 0;
        let hi = projection.balanceAtRetirement / ((retirementEnd - retirementStart) * 12) * 3;
        for (let iter = 0; iter < 25; iter++) {
            const mid = (lo + hi) / 2;
            const test = calculateRetirementProjection({
                ...inputs,
                monthlyNetIncomeDesired: mid,
                targetEndBalance: ''
            });
            if (test.balanceAtEnd > targetEnd) lo = mid;
            else hi = mid;
        }
        goalSeekWithdrawal = Math.round((lo + hi) / 2);
        projection = calculateRetirementProjection({
            ...inputs,
            monthlyNetIncomeDesired: goalSeekWithdrawal,
            targetEndBalance: ''
        });
    }

    return { projection, goalSeekWithdrawal };
}
