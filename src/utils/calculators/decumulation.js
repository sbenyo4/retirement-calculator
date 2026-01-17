
import { WITHDRAWAL_STRATEGIES, EVENT_TYPES } from '../../constants.js';
import { getMonthFromDate, getMonthlyAmount, isEventActive, getMonthlyRateForMonth } from './helpers.js';
import { calculatePrePassRequiredCapital } from './buckets.js';

/**
 * Calculates the decumulation phase (Retirement Start -> End).
 */
export function calculateDecumulation({
    startMonthIndex, // Usually monthsToRetirement
    monthsInRetirement,
    balanceAtRetirement,
    totalPrincipal, // At retirement
    currentAge,
    retirementStartAge,
    inputs,
    annualReturnRate,
    taxRateDecimal,
    startYear
}, t = null) {
    const {
        monthlyNetIncomeDesired,
        withdrawalStrategy = WITHDRAWAL_STRATEGIES.FIXED,
        withdrawalPercentage = 4,
        lifeEvents = [],
        variableRatesEnabled,
        variableRates,
        enableBuckets,
        bucketSafeRate = 0,
        bucketSurplusRate = 0,
        safeVariableRates = {},
        surplusVariableRates = {}
    } = inputs;

    let history = [];
    let currentMonth = startMonthIndex;

    let retirementBalance = balanceAtRetirement;
    // We treat totalPrincipal as a proxy for the non-taxable portion, but in this simplified model 
    // we often tax the 'interest' portion generated each month.
    // The original code calculated effective tax rate for gross-up based on the ratio at retirement start.
    const principalAtRetirement = totalPrincipal;

    let ranOutAtAge = null;
    let initialGrossWithdrawal = 0;
    let initialNetWithdrawal = 0;
    let accumulatedWithdrawals = 0;
    let totalNetWithdrawal = 0;

    // Strategies setup
    const fourPercentMonthly = (balanceAtRetirement * 0.04) / 12;
    let dynamicBaseWithdrawal = monthlyNetIncomeDesired;

    // Required Capital PV Accumulator
    let requiredCapitalPV = 0;

    // Effective monthly rate for PV discounting
    const effectiveMonthlyRate = (annualReturnRate / 100 / 12) * (1 - taxRateDecimal);

    // Track active adjustments
    let activeExpenseAdjustment = 0;
    let activeIncomeAdjustment = 0;

    // --- BUCKETS SETUP ---
    let safeBalance = 0;
    let surplusBalance = 0;

    if (enableBuckets) {
        // Calculate Gross Up Factor used for pre-pass
        const totalProfitAtRetirement = retirementBalance - principalAtRetirement;
        const profitRatioAtRetirement = retirementBalance > 0 ? (totalProfitAtRetirement / retirementBalance) : 0;
        const effectiveTaxRate = Math.max(0, profitRatioAtRetirement * taxRateDecimal);
        const grossUpFactor = 1 / (1 - effectiveTaxRate);

        const prePassRequiredCapital = calculatePrePassRequiredCapital({
            monthsToRetirement: startMonthIndex,
            monthsInRetirement,
            lifeEvents,
            monthlyNetIncomeDesired,
            bucketSafeRate,
            taxRateDecimal,
            grossUpFactor
        });

        if (balanceAtRetirement >= prePassRequiredCapital) {
            safeBalance = prePassRequiredCapital;
            surplusBalance = balanceAtRetirement - prePassRequiredCapital;
        } else {
            safeBalance = balanceAtRetirement;
            surplusBalance = 0;
        }
    }

    // Pre-scan for events active at start of retirement
    lifeEvents.forEach(event => {
        if (!event.enabled) return;
        if (isEventActive(event, startMonthIndex + 1)) {
            const monthlyAmount = getMonthlyAmount(event);
            if (event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                activeExpenseAdjustment += monthlyAmount;
            } else if (event.type === EVENT_TYPES.INCOME_CHANGE) {
                activeIncomeAdjustment += monthlyAmount;
            }
        }
    });

    for (let i = 1; i <= monthsInRetirement; i++) {
        currentMonth++;
        const monthlyRate = getMonthlyRateForMonth(currentMonth, startYear, variableRatesEnabled, variableRates, annualReturnRate);

        // Apply life events for this month during retirement
        lifeEvents.forEach(event => {
            if (!event.enabled) return; // Skip disabled events

            const eventStartMonth = getMonthFromDate(event.startDate);

            // 1. One-Time Events
            if (eventStartMonth === currentMonth) {
                switch (event.type) {
                    case EVENT_TYPES.ONE_TIME_INCOME:
                        retirementBalance += event.amount;
                        if (enableBuckets) {
                            surplusBalance += event.amount;
                        }
                        break;
                    case EVENT_TYPES.ONE_TIME_EXPENSE:
                        retirementBalance -= event.amount;
                        if (enableBuckets) {
                            let expenseRemaining = event.amount;
                            if (safeBalance >= expenseRemaining) {
                                safeBalance -= expenseRemaining;
                                expenseRemaining = 0;
                            } else {
                                expenseRemaining -= safeBalance;
                                safeBalance = 0;
                                surplusBalance -= expenseRemaining;
                            }
                        }
                        break;
                }
            }
        });

        // 2. Recurring Events (Stateless Calculation)
        activeIncomeAdjustment = 0;
        activeExpenseAdjustment = 0;

        lifeEvents.forEach(event => {
            if (!event.enabled) return;
            if (event.type === EVENT_TYPES.INCOME_CHANGE || event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                if (isEventActive(event, currentMonth)) {
                    const amount = getMonthlyAmount(event);
                    if (event.type === EVENT_TYPES.INCOME_CHANGE) {
                        activeIncomeAdjustment += amount;
                    } else if (event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                        activeExpenseAdjustment += amount;
                    }
                }
            }
        });

        // Interest & Tax
        let interest = retirementBalance * monthlyRate;
        let tax = interest * taxRateDecimal;
        let effectiveInterest = interest;

        // Buckets Interest
        if (enableBuckets) {
            // Calculate the year for this month of retirement (i is 1-indexed retirement month)
            // startMonthIndex is months from today to retirement, startYear is current year
            const retirementStartYear = startYear + Math.floor(startMonthIndex / 12);
            const monthYear = retirementStartYear + Math.floor((i - 1) / 12);

            // Use variable rates if enabled, otherwise use fixed rates
            const safeAnnualRate = variableRatesEnabled && safeVariableRates[monthYear] !== undefined
                ? parseFloat(safeVariableRates[monthYear])
                : bucketSafeRate;
            const surplusAnnualRate = variableRatesEnabled && surplusVariableRates[monthYear] !== undefined
                ? parseFloat(surplusVariableRates[monthYear])
                : bucketSurplusRate;

            const safeMonthlyRate = safeAnnualRate / 100 / 12;
            const surplusMonthlyRate = surplusAnnualRate / 100 / 12;

            const safeInterest = safeBalance * safeMonthlyRate;
            const surplusInterest = surplusBalance * surplusMonthlyRate;

            safeBalance += safeInterest;
            surplusBalance += surplusInterest;

            // Treat tax as withdrawal from buckets
            const safeTax = safeInterest * taxRateDecimal;
            const surplusTax = surplusInterest * taxRateDecimal;

            // effectiveInterest in main view is sum
            effectiveInterest = safeInterest + surplusInterest;
            // tax is also sum
            tax = safeTax + surplusTax;
        }

        // Calculate withdrawal
        let netWithdrawal;
        switch (withdrawalStrategy) {
            case WITHDRAWAL_STRATEGIES.FOUR_PERCENT:
                netWithdrawal = fourPercentMonthly;
                break;
            case WITHDRAWAL_STRATEGIES.PERCENTAGE:
                netWithdrawal = (retirementBalance * (withdrawalPercentage / 100)) / 12;
                break;
            case WITHDRAWAL_STRATEGIES.DYNAMIC:
                if (i % 12 === 1 && i > 1) {
                    const prevYearRate = getMonthlyRateForMonth(currentMonth - 1, startYear, variableRatesEnabled, variableRates, annualReturnRate);
                    const yearlyReturnRate = Math.pow(1 + prevYearRate, 12) - 1;
                    const expectedReturn = 0.07;

                    if (yearlyReturnRate > expectedReturn) {
                        dynamicBaseWithdrawal = Math.min(dynamicBaseWithdrawal * 1.1, monthlyNetIncomeDesired * 1.2);
                    } else if (yearlyReturnRate < expectedReturn - 0.05) {
                        dynamicBaseWithdrawal = Math.max(dynamicBaseWithdrawal * 0.9, monthlyNetIncomeDesired * 0.8);
                    }
                }
                netWithdrawal = dynamicBaseWithdrawal;
                break;
            case WITHDRAWAL_STRATEGIES.INTEREST_ONLY:
                netWithdrawal = interest - tax;
                break;
            case WITHDRAWAL_STRATEGIES.FIXED:
            default:
                netWithdrawal = monthlyNetIncomeDesired;
                break;
        }

        netWithdrawal += activeExpenseAdjustment;
        netWithdrawal -= activeIncomeAdjustment;

        if (netWithdrawal < 0) {
            const surplusIncome = Math.abs(netWithdrawal);
            retirementBalance += surplusIncome;
            if (enableBuckets) surplusBalance += surplusIncome; // Add income to surplus? Or safe? Usually surplus/cash.
            netWithdrawal = 0;
        }

        let grossWithdrawal = netWithdrawal + tax;

        if (i === 1) {
            initialGrossWithdrawal = grossWithdrawal;
            initialNetWithdrawal = netWithdrawal;
        }

        // Check availability
        if (retirementBalance + effectiveInterest < grossWithdrawal) {
            grossWithdrawal = retirementBalance + effectiveInterest;
            if (ranOutAtAge === null) {
                ranOutAtAge = retirementStartAge + (i / 12);
            }
        }

        retirementBalance = retirementBalance + effectiveInterest - grossWithdrawal;

        // Buckets Withdrawal
        if (enableBuckets) {
            let remainingWithdrawal = grossWithdrawal;

            // Tax was already 'calculated' but we need to pay it from buckets. 
            // The grossWithdrawal INCLUDES tax.
            // But we already added Interest to buckets. 
            // So we just subtract grossWithdrawal.

            if (safeBalance >= remainingWithdrawal) {
                safeBalance -= remainingWithdrawal;
                remainingWithdrawal = 0;
            } else {
                remainingWithdrawal -= safeBalance;
                safeBalance = 0;

                if (surplusBalance >= remainingWithdrawal) {
                    surplusBalance -= remainingWithdrawal;
                    remainingWithdrawal = 0;
                } else {
                    surplusBalance = 0;
                }
            }
            retirementBalance = safeBalance + surplusBalance;
        }

        accumulatedWithdrawals += grossWithdrawal;
        totalNetWithdrawal += netWithdrawal;

        // Required Capital PV Calculation
        let monthlyNeed = monthlyNetIncomeDesired + activeExpenseAdjustment - activeIncomeAdjustment;

        lifeEvents.forEach(e => {
            if (!e.enabled) return;
            const startM = getMonthFromDate(e.startDate);
            if (startM === currentMonth) {
                if (e.type === EVENT_TYPES.ONE_TIME_EXPENSE) monthlyNeed += e.amount;
                if (e.type === EVENT_TYPES.ONE_TIME_INCOME) monthlyNeed -= e.amount;
            }
        });

        let discountRate = effectiveMonthlyRate;
        if (enableBuckets) {
            const safeMonthlyRate = (bucketSafeRate / 100 / 12) * (1 - taxRateDecimal);
            discountRate = safeMonthlyRate;
        }

        if (discountRate !== 0) {
            requiredCapitalPV += monthlyNeed / Math.pow(1 + discountRate, i);
        } else {
            requiredCapitalPV += monthlyNeed;
        }

        if (i % 12 === 0 || retirementBalance <= 0) {
            history.push({
                month: currentMonth,
                age: retirementStartAge + (i / 12),
                balance: Math.max(0, retirementBalance),
                safeBucket: enableBuckets ? Math.max(0, safeBalance) : 0,
                surplusBucket: enableBuckets ? Math.max(0, surplusBalance) : 0,
                contribution: 0,
                withdrawal: grossWithdrawal * 12,
                accumulatedWithdrawals: accumulatedWithdrawals,
                phase: 'decumulation',
                withdrawalStrategy: withdrawalStrategy
            });
        }

        if (retirementBalance <= 0) {
            retirementBalance = 0;
            safeBalance = 0;
            surplusBalance = 0;
        }
    }

    return {
        history,
        balanceAtRetirement: balanceAtRetirement, // From start
        balanceAtEnd: Math.max(0, retirementBalance),
        ranOutAtAge,
        initialGrossWithdrawal,
        initialNetWithdrawal,
        accumulatedWithdrawals, // Total gross
        totalNetWithdrawal, // Total net
        requiredCapitalPV, // The Magic Number (Required Capital At Retirement)
        monthsInRetirement
    };
}
