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

export function calculateSimulation(inputs, type) {
    const baseInputs = {
        ...inputs,
        annualReturnRate: parseFloat(inputs.annualReturnRate) || 0
    };

    if (type === SIMULATION_TYPES.CONSERVATIVE) {
        // Conservative: Reduce return rate by 2%, Increase tax by 5% (simulated via lower net return)
        const conservativeInputs = {
            ...baseInputs,
            annualReturnRate: Math.max(0, baseInputs.annualReturnRate - 2),
            // We could also adjust inflation if we had it, or tax
        };
        const result = calculateRetirementProjection(conservativeInputs);
        result.source = 'simulation';
        return result;
    }

    if (type === SIMULATION_TYPES.OPTIMISTIC) {
        // Optimistic: Increase return rate by 1.5%
        const optimisticInputs = {
            ...baseInputs,
            annualReturnRate: baseInputs.annualReturnRate + 1.5
        };
        const result = calculateRetirementProjection(optimisticInputs);
        result.source = 'simulation';
        return result;
    }

    if (type === SIMULATION_TYPES.MONTE_CARLO) {
        // Monte Carlo: Run 500 simulations with random volatility
        // We assume annual return is mean, and standard deviation is say 10% of mean or fixed 5%?
        // Let's use a simplified volatility model: Annual return +/- volatility
        const iterations = 500;
        const results = [];
        const volatility = 5; // 5% standard deviation

        for (let i = 0; i < iterations; i++) {
            // For each simulation, we could vary the rate PER YEAR, but for performance and simplicity in this structure
            // we will vary the AVERAGE rate for the lifetime. 
            // A more advanced MC would vary it year-by-year inside the calculator logic, 
            // but that requires refactoring the core calculator to accept a rate array.
            // For now, let's vary the average annual return.

            const randomVariation = randn_bm() * volatility; // Normal distribution
            const simulatedRate = Math.max(0, baseInputs.annualReturnRate + (randomVariation * 0.2)); // Scale down volatility impact on *average*

            const simResult = calculateRetirementProjection({
                ...baseInputs,
                annualReturnRate: simulatedRate
            });
            results.push(simResult);
        }

        // Sort results by ending balance to find percentiles
        results.sort((a, b) => a.balanceAtEnd - b.balanceAtEnd);

        const p25 = results[Math.floor(iterations * 0.25)];
        const median = results[Math.floor(iterations * 0.5)];
        const p75 = results[Math.floor(iterations * 0.75)];

        // Return the median result structure, but attach range info
        // Ensure pvOfDeficit is not negative (if surplus exists, deficit should be 0)
        const sanitizedMedian = {
            ...median,
            pvOfDeficit: Math.max(0, median.pvOfDeficit),
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
