
import { WITHDRAWAL_STRATEGIES } from '../constants.js';
import { validateInputs } from './calculators/validators.js';
import { calculateAccumulation } from './calculators/accumulation.js';
import { calculateDecumulation } from './calculators/decumulation.js';
import { calculateStatistics } from './calculators/statistics.js';

/**
 * Calculates the future value and required capital for retirement.
 * This is now an orchestrator that delegates to specific calculator modules.
 * 
 * @param {Object} inputs - User inputs
 * @param {Function} t - Translation function (optional)
 * @returns {Object} result
 * @throws {Error} If inputs are invalid
 */
export function calculateRetirementProjection(inputs, t = null) {
    // 1. Validation
    const validationErrors = validateInputs(inputs, t);
    if (validationErrors.length > 0) {
        const invalidInputsLabel = t ? t('validationInvalidInputs') : 'Invalid inputs:';
        const errorMessage = invalidInputsLabel + '\n' + validationErrors.map(e => `  • ${e}`).join('\n');
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    // Parse Inputs safely
    const parsedInputs = Object.fromEntries(
        Object.entries(inputs).map(([k, v]) => {
            if (k === 'variableRates' || k === 'variableRatesEnabled' || k === 'lifeEvents' || k === 'enableBuckets' || k === 'withdrawalStrategy') return [k, v];
            return [k, parseFloat(v) || 0];
        })
    );
    // Ensure array
    if (!parsedInputs.lifeEvents) parsedInputs.lifeEvents = [];

    const {
        currentAge,
        retirementStartAge,
        retirementEndAge,
        currentSavings,
        monthlyContribution,
        annualReturnRate,
        taxRate,
        monthlyNetIncomeDesired
    } = parsedInputs;

    const startYear = new Date().getFullYear();

    // 2. Accumulation Phase (Phase 1)
    const accumResult = calculateAccumulation({
        currentAge,
        retirementStartAge,
        currentSavings,
        monthlyContribution,
        annualReturnRate,
        variableRates: inputs.variableRates,
        variableRatesEnabled: inputs.variableRatesEnabled,
        lifeEvents: parsedInputs.lifeEvents,
        startYear
    });

    const { balanceAtRetirement, totalPrincipal, history: accumHistory, lastMonthIndex } = accumResult;

    // 3. Decumulation Phase (Phase 2)
    const monthsInRetirement = (retirementEndAge - retirementStartAge) * 12;

    const decumResult = calculateDecumulation({
        startMonthIndex: lastMonthIndex,
        monthsInRetirement,
        balanceAtRetirement,
        totalPrincipal,
        currentAge,
        retirementStartAge,
        inputs: parsedInputs,
        annualReturnRate,
        taxRateDecimal: taxRate / 100,
        startYear
    }, t);

    // 4. Statistics (Phase 3)
    const statsResult = calculateStatistics({
        balanceAtRetirement,
        requiredCapitalAtRetirement: decumResult.requiredCapitalPV,
        monthlyNetIncomeDesired,
        monthlyContribution,
        annualReturnRate,
        taxRateDecimal: taxRate / 100,
        monthsToRetirement: (retirementStartAge - currentAge) * 12,
        monthsInRetirement,
        accumulatedWithdrawals: decumResult.accumulatedWithdrawals,
        totalNetWithdrawal: decumResult.totalNetWithdrawal
    });

    // Merge History
    // Note: Accumulation history ends at retirementStart. Decumulation history starts there.
    // The accum module pushed a record for the very last month of accumulation?
    // Let's check: Yes, it pushes yearly records.
    // We should just concat them.
    const history = [...accumHistory, ...decumResult.history];

    return {
        history,
        balanceAtRetirement,
        balanceAtEnd: decumResult.balanceAtEnd,
        ranOutAtAge: decumResult.ranOutAtAge,
        requiredCapitalAtRetirement: decumResult.requiredCapitalPV,
        requiredCapitalForPerpetuity: statsResult.requiredCapitalForPerpetuity,
        surplus: statsResult.surplus,
        pvOfDeficit: statsResult.pvOfDeficit,
        pvOfCapitalPreservation: statsResult.pvOfCapitalPreservation,
        initialGrossWithdrawal: decumResult.initialGrossWithdrawal,
        initialNetWithdrawal: decumResult.initialNetWithdrawal,
        averageGrossWithdrawal: statsResult.averageGrossWithdrawal,
        averageNetWithdrawal: statsResult.averageNetWithdrawal
    };
}
