import { calculateRetirementProjection } from './calculator';
import { WITHDRAWAL_STRATEGIES } from '../constants';

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
 * Simulates retirement with year-by-year varying returns
 * This allows dynamic withdrawal strategy to actually respond to market conditions
 */
function simulateRetirementWithVariance(inputs, yearlyReturns) {
    const currentAge = parseFloat(inputs.currentAge);
    const retirementStartAge = parseFloat(inputs.retirementStartAge);
    const retirementEndAge = parseFloat(inputs.retirementEndAge);
    const currentSavings = parseFloat(inputs.currentSavings) || 0;
    const monthlyContribution = parseFloat(inputs.monthlyContribution) || 0;
    const monthlyNetIncomeDesired = parseFloat(inputs.monthlyNetIncomeDesired) || 0;
    const taxRateDecimal = (parseFloat(inputs.taxRate) || 0) / 100;
    const withdrawalStrategy = inputs.withdrawalStrategy || WITHDRAWAL_STRATEGIES.FIXED;
    const withdrawalPercentage = parseFloat(inputs.withdrawalPercentage) || 4;
    const baseAnnualReturn = parseFloat(inputs.annualReturnRate) || 0;

    const yearsToRetirement = retirementStartAge - currentAge;
    const yearsInRetirement = retirementEndAge - retirementStartAge;
    const monthsToRetirement = Math.floor(yearsToRetirement * 12);
    const monthsInRetirement = Math.floor(yearsInRetirement * 12);

    // Phase 1: Accumulation (use average return for simplicity, or first year returns)
    const avgAccumulationReturn = baseAnnualReturn / 100;
    const monthlyAccumulationRate = Math.pow(1 + avgAccumulationReturn, 1 / 12) - 1;

    let balance = currentSavings;
    for (let i = 0; i < monthsToRetirement; i++) {
        balance = balance * (1 + monthlyAccumulationRate) + monthlyContribution;
    }
    const balanceAtRetirement = balance;

    // Phase 2: Retirement with year-by-year varying returns
    let retirementBalance = balanceAtRetirement;
    let ranOutAtAge = null;
    let initialGrossWithdrawal = 0;
    let initialNetWithdrawal = 0;

    // For 4% rule - calculate based on initial retirement balance
    const fourPercentMonthly = (balanceAtRetirement * 0.04) / 12;

    // For dynamic strategy tracking
    let dynamicBaseWithdrawal = monthlyNetIncomeDesired;
    let previousYearReturn = baseAnnualReturn / 100;
    const expectedReturn = 0.07; // 7% expected annual return

    for (let month = 1; month <= monthsInRetirement; month++) {
        // Determine which year of retirement we're in (0-indexed)
        const yearIndex = Math.floor((month - 1) / 12);
        const currentYearReturn = yearlyReturns[yearIndex] !== undefined
            ? yearlyReturns[yearIndex] / 100
            : baseAnnualReturn / 100;
        const currentMonthlyRate = Math.pow(1 + currentYearReturn, 1 / 12) - 1;

        const interest = retirementBalance * currentMonthlyRate;
        const tax = Math.max(0, interest) * taxRateDecimal;

        // Calculate withdrawal based on strategy
        let netWithdrawal;
        switch (withdrawalStrategy) {
            case WITHDRAWAL_STRATEGIES.FOUR_PERCENT:
                netWithdrawal = fourPercentMonthly;
                break;

            case WITHDRAWAL_STRATEGIES.PERCENTAGE:
                netWithdrawal = (retirementBalance * (withdrawalPercentage / 100)) / 12;
                break;

            case WITHDRAWAL_STRATEGIES.DYNAMIC:
                // At the start of each new year, adjust based on ACTUAL previous year's return
                if (month % 12 === 1 && month > 1) {
                    const lastYearReturn = yearlyReturns[yearIndex - 1] !== undefined
                        ? yearlyReturns[yearIndex - 1] / 100
                        : previousYearReturn;

                    if (lastYearReturn > expectedReturn) {
                        // Good year: increase by up to 10%
                        dynamicBaseWithdrawal = Math.min(
                            dynamicBaseWithdrawal * 1.1,
                            monthlyNetIncomeDesired * 1.2
                        );
                    } else if (lastYearReturn < expectedReturn - 0.05) {
                        // Bad year: decrease by up to 10%
                        dynamicBaseWithdrawal = Math.max(
                            dynamicBaseWithdrawal * 0.9,
                            monthlyNetIncomeDesired * 0.8
                        );
                    }
                    previousYearReturn = lastYearReturn;
                }
                netWithdrawal = dynamicBaseWithdrawal;
                break;

            case WITHDRAWAL_STRATEGIES.FIXED:
            default:
                netWithdrawal = monthlyNetIncomeDesired;
                break;
        }

        let grossWithdrawal = netWithdrawal + tax;

        if (month === 1) {
            initialGrossWithdrawal = grossWithdrawal;
            initialNetWithdrawal = netWithdrawal;
        }

        // Check if we have enough money
        if (retirementBalance + interest < grossWithdrawal) {
            grossWithdrawal = retirementBalance + interest;
            if (ranOutAtAge === null) {
                ranOutAtAge = retirementStartAge + (month / 12);
            }
        }

        retirementBalance = retirementBalance + interest - grossWithdrawal;
        if (retirementBalance < 0) retirementBalance = 0;
    }

    return {
        balanceAtRetirement,
        balanceAtEnd: Math.max(0, retirementBalance),
        ranOutAtAge,
        initialGrossWithdrawal,
        initialNetWithdrawal
    };
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

        const retirementStartAge = parseFloat(inputs.retirementStartAge);
        const retirementEndAge = parseFloat(inputs.retirementEndAge);
        const yearsInRetirement = Math.ceil(retirementEndAge - retirementStartAge);

        for (let i = 0; i < iterations; i++) {
            // Generate year-by-year returns for this simulation
            const yearlyReturns = generateYearlyReturns(meanReturn, volatility, yearsInRetirement);

            // Run simulation with varying returns
            const simResult = simulateRetirementWithVariance(baseInputs, yearlyReturns);
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

