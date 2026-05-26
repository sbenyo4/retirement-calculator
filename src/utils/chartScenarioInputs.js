import { calculateRetirementProjection } from './calculator';

const RATE_TO_VARIABLE_RATE_KEY = {
    annualReturnRate: 'variableRates',
    bucketSafeRate: 'safeVariableRates',
    bucketSurplusRate: 'surplusVariableRates',
};

export function applyIncomeScenario(baseInputs, nextMonthlyIncome) {
    const currentBaseIncome = parseFloat(baseInputs.monthlyNetIncomeDesired) || 0;
    const nextIncome = Math.max(1, parseFloat(nextMonthlyIncome) || 0);
    const delta = nextIncome - currentBaseIncome;
    const overrides = baseInputs.yearlyIncomeOverrides;

    if (!overrides || typeof overrides !== 'object' || Object.keys(overrides).length === 0) {
        return { ...baseInputs, monthlyNetIncomeDesired: nextIncome };
    }

    const nextOverrides = {};
    Object.entries(overrides).forEach(([year, amount]) => {
        const parsed = parseFloat(amount);
        if (!isNaN(parsed) && parsed > 0) {
            nextOverrides[year] = Math.max(1, parsed + delta);
        }
    });

    return {
        ...baseInputs,
        monthlyNetIncomeDesired: nextIncome,
        yearlyIncomeOverrides: nextOverrides,
    };
}

export function applyRateScenario(baseInputs, inputKey, value) {
    const nextInputs = { ...baseInputs, [inputKey]: value };
    const variableRateKey = RATE_TO_VARIABLE_RATE_KEY[inputKey];

    if (baseInputs.variableRatesEnabled && variableRateKey) {
        const existingRates = baseInputs[variableRateKey];
        if (existingRates && Object.keys(existingRates).length > 0) {
            const flatRates = {};
            Object.keys(existingRates).forEach(year => { flatRates[year] = value; });
            nextInputs[variableRateKey] = flatRates;
        }
    }

    return nextInputs;
}

export function applyChartScenarioInput(baseInputs, inputKey, value) {
    if (inputKey === 'monthlyNetIncomeDesired') {
        return applyIncomeScenario(baseInputs, value);
    }

    if (RATE_TO_VARIABLE_RATE_KEY[inputKey]) {
        return applyRateScenario(baseInputs, inputKey, value);
    }

    return { ...baseInputs, [inputKey]: value };
}

export function calculateChartScenarioProjection(baseInputs, inputKey, value, t = null) {
    return calculateRetirementProjection(
        applyChartScenarioInput(baseInputs, inputKey, value),
        t
    );
}
