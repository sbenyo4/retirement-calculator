import { calculateRetirementProjection } from './calculator';

export const SIMULATION_TYPES = {
    MONTE_CARLO: 'monte_carlo',
    CONSERVATIVE: 'conservative',
    OPTIMISTIC: 'optimistic'
};

// Helper to generate normally distributed random numbers (Box-Muller transform)
function randn_bm() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Generates an array of yearly returns with random variance
 */
function generateYearlyReturns(meanReturn, volatility, years) {
    const returns = [];
    for (let i = 0; i < years; i++) {
        const randomVariation = randn_bm() * volatility;
        // Clamp returns between -30% and +50% for realism
        const yearReturn = Math.max(-30, Math.min(50, meanReturn + randomVariation));
        returns.push(yearReturn);
    }
    return returns;
}

export function calculateSimulation(inputs, type) {
    const baseInputs = {
        ...inputs,
        annualReturnRate: parseFloat(inputs.annualReturnRate) || 0
    };

    if (type === SIMULATION_TYPES.CONSERVATIVE) {
        const conservativeInputs = {
            ...baseInputs,
            annualReturnRate: Math.max(0, baseInputs.annualReturnRate - 2),
        };
        const result = calculateRetirementProjection(conservativeInputs);
        result.source = 'simulation';
        return result;
    }

    if (type === SIMULATION_TYPES.OPTIMISTIC) {
        const optimisticInputs = {
            ...baseInputs,
            annualReturnRate: baseInputs.annualReturnRate + 1.5
        };
        const result = calculateRetirementProjection(optimisticInputs);
        result.source = 'simulation';
        return result;
    }

    if (type === SIMULATION_TYPES.MONTE_CARLO) {
        const iterations = 500;
        const results = [];
        const volatility = 15; // 15% standard deviation (realistic for equities)
        const meanReturn = baseInputs.annualReturnRate;

        const currentAge = parseFloat(inputs.currentAge);
        const retirementStartAge = parseFloat(inputs.retirementStartAge);
        const retirementEndAge = parseFloat(inputs.retirementEndAge);
        const yearsInRetirement = Math.ceil(retirementEndAge - retirementStartAge);

        // Calculate the calendar year when retirement starts
        const startYear = new Date().getFullYear();
        const retirementStartCalendarYear = startYear + Math.ceil(retirementStartAge - currentAge);

        for (let i = 0; i < iterations; i++) {
            // Generate year-by-year returns for this simulation
            const yearlyReturns = generateYearlyReturns(meanReturn, volatility, yearsInRetirement);

            // Convert random returns to variableRates format (calendar-year keyed)
            // Only retirement years get randomized — accumulation uses the base rate
            const simVariableRates = {};
            for (let y = 0; y < yearsInRetirement; y++) {
                simVariableRates[retirementStartCalendarYear + y] = yearlyReturns[y];
            }

            // Run through the real pipeline with randomized rates
            // This accounts for life events, bucket strategy, realistic tax, and pension sources
            const simResult = calculateRetirementProjection({
                ...baseInputs,
                variableRatesEnabled: true,
                variableRates: simVariableRates
            });
            results.push(simResult);
        }

        // Sort results by ending balance to find percentiles
        results.sort((a, b) => a.balanceAtEnd - b.balanceAtEnd);

        const p25 = results[Math.floor(iterations * 0.25)];
        const median = results[Math.floor(iterations * 0.5)];
        const p75 = results[Math.floor(iterations * 0.75)];

        // Also run the standard calculation to get full result structure
        const baseResult = calculateRetirementProjection(baseInputs);

        // Merge median simulation results with base calculation structure
        const sanitizedMedian = {
            ...baseResult,
            balanceAtEnd: median.balanceAtEnd,
            balanceAtRetirement: median.balanceAtRetirement,
            ranOutAtAge: median.ranOutAtAge,
            initialGrossWithdrawal: median.initialGrossWithdrawal,
            initialNetWithdrawal: median.initialNetWithdrawal,
            pvOfDeficit: Math.max(0, baseResult.pvOfDeficit),
            simulationRange: {
                p25Balance: p25.balanceAtEnd,
                p75Balance: p75.balanceAtEnd,
                minBalance: results[0].balanceAtEnd,
                maxBalance: results[iterations - 1].balanceAtEnd
            },
            isMonteCarlo: true,
            source: 'simulation'
        };
        return sanitizedMedian;
    }

    const result = calculateRetirementProjection(baseInputs);
    result.source = 'simulation';
    return result;
}
