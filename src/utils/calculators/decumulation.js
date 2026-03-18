
import { WITHDRAWAL_STRATEGIES, EVENT_TYPES } from '../../constants.js';
import { getMonthFromDate, getMonthlyAmount, getMonthlyRateForMonth } from './helpers.js';
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
    // Track principal (cost basis) for REALISTIC tax calculation
    // Tax is only paid on PROFIT portion of withdrawals, not on annual growth
    let currentPrincipal = totalPrincipal;
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
    // Running product of (1 + r_k) for each retirement month k.
    // Using a per-month cumulative factor instead of (1+r)^i lets us discount with the actual
    // variable rate for each month, so requiredCapitalPV is consistent with the simulation.
    let requiredCapitalCumulativeFactor = 1;

    // Track active adjustments
    let activeExpenseAdjustment = 0;
    let activeIncomeAdjustment = 0;

    // --- BUCKETS SETUP ---
    let safeBalance = 0;
    let surplusBalance = 0;
    // Track principal per bucket for accurate tax calculation
    let safePrincipal = 0;
    let surplusPrincipal = 0;

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
            // Split principal proportionally between buckets
            const safeRatio = safeBalance / balanceAtRetirement;
            safePrincipal = currentPrincipal * safeRatio;
            surplusPrincipal = currentPrincipal * (1 - safeRatio);
        } else {
            safeBalance = balanceAtRetirement;
            surplusBalance = 0;
            safePrincipal = currentPrincipal;
            surplusPrincipal = 0;
        }
    }

    // Pre-calculate event month ranges — dates never change during the loops
    const eventMonthRanges = lifeEvents.map(event => ({
        startMonth: getMonthFromDate(event.startDate),
        endMonth: event.endDate ? getMonthFromDate(event.endDate) : null
    }));

    // Pre-scan for events active at start of retirement
    lifeEvents.forEach((event, idx) => {
        if (!event.enabled) return;
        const { startMonth, endMonth } = eventMonthRanges[idx];
        if (startMonth !== null && (startMonthIndex + 1) >= startMonth && (endMonth === null || (startMonthIndex + 1) <= endMonth)) {
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
        lifeEvents.forEach((event, idx) => {
            if (!event.enabled) return; // Skip disabled events

            const eventStartMonth = eventMonthRanges[idx].startMonth;

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

        lifeEvents.forEach((event, idx) => {
            if (!event.enabled) return;
            if (event.type === EVENT_TYPES.INCOME_CHANGE || event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                const { startMonth, endMonth } = eventMonthRanges[idx];
                if (startMonth !== null && currentMonth >= startMonth && (endMonth === null || currentMonth <= endMonth)) {
                    const amount = getMonthlyAmount(event);
                    if (event.type === EVENT_TYPES.INCOME_CHANGE) {
                        activeIncomeAdjustment += amount;
                    } else if (event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                        activeExpenseAdjustment += amount;
                    }
                }
            }
        });

        // Interest calculation - NO ANNUAL TAX
        // Tax is paid only on profit portion of WITHDRAWALS (realistic Israeli capital gains)
        let interest = retirementBalance * monthlyRate;
        let effectiveInterest = interest;

        // Buckets Interest
        if (enableBuckets) {
            // Calculate the year for this month of retirement (i is 1-indexed retirement month)
            // startMonthIndex is months from today to retirement, startYear is current year
            const retirementStartYear = startYear + Math.floor(startMonthIndex / 12);
            const monthYear = retirementStartYear + Math.floor((i - 1) / 12);

            // Use variable rates if enabled, otherwise use fixed rates.
            // Guard against non-numeric strings (same pattern as getMonthlyRateForMonth).
            const parsedSafeRate = variableRatesEnabled && safeVariableRates[monthYear] !== undefined
                ? parseFloat(safeVariableRates[monthYear])
                : NaN;
            const safeAnnualRate = !isNaN(parsedSafeRate) ? parsedSafeRate : bucketSafeRate;
            const parsedSurplusRate = variableRatesEnabled && surplusVariableRates[monthYear] !== undefined
                ? parseFloat(surplusVariableRates[monthYear])
                : NaN;
            const surplusAnnualRate = !isNaN(parsedSurplusRate) ? parsedSurplusRate : bucketSurplusRate;

            const safeMonthlyRate = safeAnnualRate / 100 / 12;
            const surplusMonthlyRate = surplusAnnualRate / 100 / 12;

            const safeInterest = safeBalance * safeMonthlyRate;
            const surplusInterest = surplusBalance * surplusMonthlyRate;

            // Growth compounds tax-free (no annual tax deduction)
            safeBalance += safeInterest;
            surplusBalance += surplusInterest;

            effectiveInterest = safeInterest + surplusInterest;
        }

        // Calculate withdrawal
        let netWithdrawal;

        // For INTEREST_ONLY strategy, we need to calculate effective interest after tax
        // Since we now tax on withdrawal, "interest only" means taking only the growth portion
        const currentBalance = retirementBalance + effectiveInterest;

        switch (withdrawalStrategy) {
            case WITHDRAWAL_STRATEGIES.FOUR_PERCENT:
                netWithdrawal = fourPercentMonthly;
                break;
            case WITHDRAWAL_STRATEGIES.PERCENTAGE:
                netWithdrawal = (currentBalance * (withdrawalPercentage / 100)) / 12;
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
            case WITHDRAWAL_STRATEGIES.INTEREST_ONLY: {
                // Withdraw exactly the interest earned so the portfolio stays flat.
                // grossWithdrawal = effectiveInterest; the user receives interest minus tax on profit.
                // To make the gross-up below produce grossWithdrawal = effectiveInterest, we must
                // set netWithdrawal = effectiveInterest * (1 - profitRatio * taxRate).
                // Using flat taxRateDecimal here was wrong: it ignores the profit ratio and
                // causes the gross-up to apply tax a second time at a different rate.
                const _preBalance = retirementBalance + effectiveInterest;
                const _principal = enableBuckets ? (safePrincipal + surplusPrincipal) : currentPrincipal;
                const _profitRatio = _preBalance > 0
                    ? Math.max(0, Math.min(1, (_preBalance - _principal) / _preBalance))
                    : 0;
                netWithdrawal = effectiveInterest * (1 - _profitRatio * taxRateDecimal);
                break;
            }
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
            // Income goes to principal since it's new money
            currentPrincipal += surplusIncome;
            if (enableBuckets) {
                surplusBalance += surplusIncome;
                surplusPrincipal += surplusIncome;
            }
            netWithdrawal = 0;
        }

        // REALISTIC TAX CALCULATION: Tax only on profit portion of withdrawal.
        // When buckets are enabled, use per-bucket profit ratios and draw from safe first,
        // then surplus — matching the withdrawal allocation order below.
        // Using a combined blended ratio would over-tax safe-bucket withdrawals once the
        // buckets diverge (safe grows slowly → higher principal ratio than surplus).
        const preWithdrawalBalance = retirementBalance + effectiveInterest;

        // Per-bucket effective tax rates (safeBalance/surplusBalance already include this month's interest)
        const safeEffTaxRate = (enableBuckets && safeBalance > 0)
            ? Math.max(0, Math.min(1, (safeBalance - safePrincipal) / safeBalance)) * taxRateDecimal
            : 0;
        const surplusEffTaxRate = (enableBuckets && surplusBalance > 0)
            ? Math.max(0, Math.min(1, (surplusBalance - surplusPrincipal) / surplusBalance)) * taxRateDecimal
            : 0;

        let grossWithdrawal;
        let tax;

        if (enableBuckets) {
            // Gross-up drawing from safe first, then surplus
            const maxNetFromSafe = safeBalance * (1 - safeEffTaxRate);
            if (netWithdrawal <= maxNetFromSafe) {
                grossWithdrawal = safeEffTaxRate < 1 ? netWithdrawal / (1 - safeEffTaxRate) : netWithdrawal;
                tax = grossWithdrawal * safeEffTaxRate;
            } else {
                const remainingNet = netWithdrawal - maxNetFromSafe;
                const grossFromSurplus = surplusEffTaxRate < 1 ? remainingNet / (1 - surplusEffTaxRate) : remainingNet;
                grossWithdrawal = safeBalance + grossFromSurplus;
                tax = safeBalance * safeEffTaxRate + grossFromSurplus * surplusEffTaxRate;
            }
        } else {
            // Non-bucket: combined portfolio profit ratio
            const profitRatio = preWithdrawalBalance > 0
                ? Math.max(0, Math.min(1, (preWithdrawalBalance - currentPrincipal) / preWithdrawalBalance))
                : 0;
            const effectiveTaxRate = profitRatio * taxRateDecimal;
            grossWithdrawal = effectiveTaxRate < 1 ? netWithdrawal / (1 - effectiveTaxRate) : netWithdrawal;
            tax = grossWithdrawal * effectiveTaxRate;
        }

        if (i === 1) {
            initialGrossWithdrawal = grossWithdrawal;
            initialNetWithdrawal = netWithdrawal;
        }

        // Check availability
        if (preWithdrawalBalance < grossWithdrawal) {
            grossWithdrawal = preWithdrawalBalance;
            if (enableBuckets) {
                const capFromSafe = Math.min(safeBalance, grossWithdrawal);
                const capFromSurplus = grossWithdrawal - capFromSafe;
                tax = capFromSafe * safeEffTaxRate + capFromSurplus * surplusEffTaxRate;
            } else {
                const profitRatio = preWithdrawalBalance > 0
                    ? Math.max(0, Math.min(1, (preWithdrawalBalance - currentPrincipal) / preWithdrawalBalance))
                    : 0;
                tax = grossWithdrawal * profitRatio * taxRateDecimal;
            }
            if (ranOutAtAge === null) {
                ranOutAtAge = retirementStartAge + (i / 12);
            }
        }

        retirementBalance = preWithdrawalBalance - grossWithdrawal;

        // Update principal proportionally after withdrawal
        const principalForTax = enableBuckets ? (safePrincipal + surplusPrincipal) : currentPrincipal;
        const principalWithdrawn = preWithdrawalBalance > 0
            ? grossWithdrawal * (principalForTax / preWithdrawalBalance)
            : 0;
        currentPrincipal = Math.max(0, currentPrincipal - principalWithdrawn);

        // Buckets Withdrawal with principal tracking
        if (enableBuckets) {
            let remainingWithdrawal = grossWithdrawal;

            if (safeBalance >= remainingWithdrawal) {
                // Calculate principal reduction for safe bucket
                const safePrincipalRatio = safeBalance > 0 ? (safePrincipal / safeBalance) : 0;
                safePrincipal = Math.max(0, safePrincipal - remainingWithdrawal * safePrincipalRatio);
                safeBalance -= remainingWithdrawal;
                remainingWithdrawal = 0;
            } else {
                // Deplete safe bucket
                safePrincipal = 0;
                remainingWithdrawal -= safeBalance;
                safeBalance = 0;

                if (surplusBalance >= remainingWithdrawal) {
                    // Calculate principal reduction for surplus bucket
                    const surplusPrincipalRatio = surplusBalance > 0 ? (surplusPrincipal / surplusBalance) : 0;
                    surplusPrincipal = Math.max(0, surplusPrincipal - remainingWithdrawal * surplusPrincipalRatio);
                    surplusBalance -= remainingWithdrawal;
                    remainingWithdrawal = 0;
                } else {
                    surplusPrincipal = 0;
                    surplusBalance = 0;
                }
            }
            retirementBalance = safeBalance + surplusBalance;
        }

        accumulatedWithdrawals += grossWithdrawal;
        totalNetWithdrawal += netWithdrawal;


        // Required Capital PV Calculation
        let monthlyNeed = monthlyNetIncomeDesired + activeExpenseAdjustment - activeIncomeAdjustment;

        lifeEvents.forEach((e, idx) => {
            if (!e.enabled) return;
            if (eventMonthRanges[idx].startMonth === currentMonth) {
                if (e.type === EVENT_TYPES.ONE_TIME_EXPENSE) monthlyNeed += e.amount;
                if (e.type === EVENT_TYPES.ONE_TIME_INCOME) monthlyNeed -= e.amount;
            }
        });

        // Advance the cumulative discount factor by the actual rate for this month.
        // Non-bucket: uses the variable-rate-aware monthlyRate so step-mode rates are reflected.
        // Bucket: uses the fixed safe-bucket rate (liability side governed by safe rate).
        const pvMonthlyRate = enableBuckets
            ? (bucketSafeRate / 100 / 12) * (1 - taxRateDecimal)
            : monthlyRate * (1 - taxRateDecimal);
        requiredCapitalCumulativeFactor *= (1 + pvMonthlyRate);

        if (requiredCapitalCumulativeFactor !== 1) {
            requiredCapitalPV += monthlyNeed / requiredCapitalCumulativeFactor;
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
