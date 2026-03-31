

import { validateInputs } from './calculators/validators.js';
import { calculateAccumulation } from './calculators/accumulation.js';
import { calculateDecumulation } from './calculators/decumulation.js';
import { calculateStatistics } from './calculators/statistics.js';
import { calculateIncomeAtAge, calculateNationalInsurance } from './pensionCalculator.js';
import { mergeScenarioIntoRates } from './scenarioUtils.js';
import { translations } from './translations.js';

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
        const lang = inputs.language || 'en';
    const dict = translations[lang] || translations['en'];
    const invalidInputsLabel = t ? t('validationInvalidInputs') : (dict['validationInvalidInputs'] || 'Invalid inputs:');
        const errorMessage = invalidInputsLabel + '\n' + validationErrors.map(e => `  • ${e}`).join('\n');
        // Don't log here - callers handle errors via try-catch and display to user as appropriate
        throw new Error(errorMessage);
    }

    // Parse Inputs safely
    const parsedInputs = Object.fromEntries(
        Object.entries(inputs).map(([k, v]) => {
            if (k === 'variableRates' || k === 'variableRatesEnabled' || k === 'lifeEvents' || k === 'enableBuckets' || k === 'withdrawalStrategy' || k === 'safeVariableRates' || k === 'surplusVariableRates' || k === 'targetEndBalance') return [k, v];
            return [k, parseFloat(v) || 0];
        })
    );
    // Ensure array and filter only active events (LifeEventsManager uses 'enabled' property)
    parsedInputs.lifeEvents = (parsedInputs.lifeEvents || []).filter(event => event.enabled !== false);

    const {
        currentAge,
        retirementStartAge,
        retirementEndAge,
        currentSavings,
        monthlyContribution,
        annualReturnRate,
        taxRate,
        monthlyNetIncomeDesired,
        inflationRate = 0
    } = parsedInputs;

    // Adjust all return rates for inflation (real return = nominal - inflation)
    // This makes all results expressed in today's purchasing power
    const realReturnRate = annualReturnRate - inflationRate;
    const realBucketSafeRate = (parsedInputs.bucketSafeRate || 0) - inflationRate;
    const realBucketSurplusRate = (parsedInputs.bucketSurplusRate || 0) - inflationRate;

    // Adjust variable rates for inflation
    const adjustVariableRates = (rates) => {
        if (!rates || typeof rates !== 'object') return rates;
        const adjusted = {};
        for (const [year, rate] of Object.entries(rates)) {
            const parsed = parseFloat(rate);
            // Non-numeric entries are left out; downstream NaN guards fall back to the default rate
            if (!isNaN(parsed)) adjusted[year] = parsed - inflationRate;
        }
        return adjusted;
    };

    // Merge scenario rates on top of variable rates (both nominal, before inflation adjustment).
    // Scenario years override whatever the user set in variableRates for those years.
    const variableRatesWithScenario = mergeScenarioIntoRates(
        inputs.variableRates, inputs.scenario, inputs.scenarioEnabled, annualReturnRate
    );
    // When scenario is active, implicitly enable variable rates even if the toggle is off,
    // so getMonthlyRateForMonth will use the merged map for scenario years.
    const effectiveVariableRatesEnabled = inputs.variableRatesEnabled ||
        (inputs.scenarioEnabled && Object.keys(variableRatesWithScenario).length > 0);

    // Merge scenario into bucket rate maps only when the user opted in via affectsSafeBucket.
    // Default: safe bucket is shielded from the crash (bonds/cash less correlated to equities).
    const scenarioAffectsSafe = inputs.scenarioEnabled && inputs.scenario?.affectsSafeBucket;
    const safeVariableRatesWithScenario = mergeScenarioIntoRates(
        inputs.safeVariableRates, inputs.scenario, scenarioAffectsSafe,
        parsedInputs.bucketSafeRate
    );
    const surplusVariableRatesWithScenario = mergeScenarioIntoRates(
        inputs.surplusVariableRates, inputs.scenario, inputs.scenarioEnabled,
        parsedInputs.bucketSurplusRate
    );

    const realVariableRates = inflationRate ? adjustVariableRates(variableRatesWithScenario) : variableRatesWithScenario;
    const realSafeVariableRates = inflationRate ? adjustVariableRates(safeVariableRatesWithScenario) : safeVariableRatesWithScenario;
    const realSurplusVariableRates = inflationRate ? adjustVariableRates(surplusVariableRatesWithScenario) : surplusVariableRatesWithScenario;

    const startYear = new Date().getFullYear();

    // 2. Accumulation Phase (Phase 1)
    const accumResult = calculateAccumulation({
        currentAge,
        retirementStartAge,
        currentSavings,
        monthlyContribution,
        annualReturnRate: realReturnRate,
        variableRates: realVariableRates,
        variableRatesEnabled: effectiveVariableRatesEnabled,
        lifeEvents: parsedInputs.lifeEvents,
        startYear
    });

    const { balanceAtRetirement, totalPrincipal, history: accumHistory, lastMonthIndex } = accumResult;

    const monthsInRetirement = (retirementEndAge - retirementStartAge) * 12;

    // Build adjusted inputs for decumulation with real rates
    const realInputs = {
        ...parsedInputs,
        variableRatesEnabled: effectiveVariableRatesEnabled,
        bucketSafeRate: realBucketSafeRate,
        bucketSurplusRate: realBucketSurplusRate,
        variableRates: realVariableRates,
        safeVariableRates: realSafeVariableRates,
        surplusVariableRates: realSurplusVariableRates
    };

    const decumResult = calculateDecumulation({
        startMonthIndex: lastMonthIndex,
        monthsInRetirement,
        balanceAtRetirement,
        totalPrincipal,
        currentAge,
        retirementStartAge,
        inputs: realInputs,
        annualReturnRate: realReturnRate,
        taxRateDecimal: taxRate / 100,
        startYear,
        parameters: inputs.fiscalParameters || null // Pass dynamic parameters
    }, t);

    // Determine effective rate for post-retirement (Used for Perpetuity Calc)
    // If buckets are enabled, the 'Safe Bucket Rate' is the assumption for living off interest (Perpetuity)
    const retirementAnnualReturnRate = parsedInputs.enableBuckets
        ? realBucketSafeRate
        : realReturnRate;

    // When variable rates are enabled, derive the effective average rate for each phase.
    // This makes perpetuity and max-sustainable-withdrawal statistics consistent with the
    // simulation — especially when step mode sets all retirement years to a single target rate.
    let effectiveAccumRate = realReturnRate;
    let effectiveRetirementRate = retirementAnnualReturnRate;
    if (parsedInputs.variableRatesEnabled && realVariableRates) {
        const retirCalStart = startYear + Math.floor(retirementStartAge - currentAge);
        const retirCalEnd = startYear + Math.floor(retirementEndAge - currentAge);

        const accumRateValues = [];
        for (let y = startYear; y < retirCalStart; y++) {
            const r = parseFloat(realVariableRates[y]);
            if (!isNaN(r)) accumRateValues.push(r);
        }
        if (accumRateValues.length > 0) {
            effectiveAccumRate = accumRateValues.reduce((a, b) => a + b, 0) / accumRateValues.length;
        }

        // Don't override bucket perpetuity rate — that's governed by the safe-bucket rate
        if (!parsedInputs.enableBuckets) {
            const retirRateValues = [];
            for (let y = retirCalStart; y <= retirCalEnd; y++) {
                const r = parseFloat(realVariableRates[y]);
                if (!isNaN(r)) retirRateValues.push(r);
            }
            if (retirRateValues.length > 0) {
                effectiveRetirementRate = retirRateValues.reduce((a, b) => a + b, 0) / retirRateValues.length;
            }
        }
    }

    // 4. Statistics (Phase 3)
    const statsResult = calculateStatistics({
        balanceAtRetirement,
        requiredCapitalAtRetirement: decumResult.requiredCapitalPV,
        monthlyNetIncomeDesired,
        monthlyContribution,
        annualReturnRate: effectiveAccumRate, // Accumulation Rate (for PV to today)
        retirementAnnualReturnRate: effectiveRetirementRate, // Decumulation Rate (for Perpetuity threshold)
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

    // 5. NI Context for AI/UI
    const pensionSources = inputs.pensionIncomeSources || [];
    const annuitySources = pensionSources.filter(s => !s.isLumpSum);
    const incomeAtNIStart = calculateIncomeAtAge(annuitySources, 67, inputs.fiscalParameters ? { ...inputs.fiscalParameters, familyStatus: inputs.familyStatus } : { familyStatus: inputs.familyStatus });
    const niDetails = calculateNationalInsurance(67, 35, inputs.fiscalParameters, inputs.familyStatus);

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
        averageNetWithdrawal: statsResult.averageNetWithdrawal,
        maxSustainableNetWithdrawal: statsResult.maxSustainableNetWithdrawal,
        // Effective rates used for statistics (account for variable rates when enabled)
        effectiveRetirementRate,
        // NI Info
        incomeAtNIStart,
        niThreshold: niDetails.incomeTest.threshold
    };
}
