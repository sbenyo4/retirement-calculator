
import { EVENT_TYPES } from '../../constants.js';
import { getMonthFromDate, getMonthlyAmount, getMonthlyRateForMonth } from './helpers.js';

/**
 * Logic for initializing and managing buckets.
 */

/**
 * Pre-pass calculation to verify Safe Bucket need.
 *
 * Uses a time-varying gross-up factor that matches the actual simulation's
 * per-bucket effective tax rate. The key insight is that proportional
 * withdrawals preserve the principal ratio within a month — only interest
 * growth erodes it — so the principal ratio evolves as:
 *   p_j = p_0 / (1 + safeMonthlyRate)^j
 * This is a closed-form formula with no circular dependency.
 * Discounting is done at the pre-tax safe rate (not after-tax), which is
 * what the actual safe bucket uses for growth.
 */
export function calculatePrePassRequiredCapital({
    monthsToRetirement,
    monthsInRetirement,
    lifeEvents,
    monthlyNetIncomeDesired,
    bucketSafeRate,
    taxRateDecimal,
    profitRatioAtRetirement,
    // Variable rate support — must mirror the actual safe bucket simulation exactly
    safeVariableRates = {},
    variableRatesEnabled = false,
    startYear = new Date().getFullYear(),
    startMonth = new Date().getMonth() + 1
}) {
    let prePassRequiredCapital = 0;

    // Initial principal ratio of safe bucket (same as overall portfolio at retirement,
    // since safe principal is allocated proportionally to balance)
    const initialPrincipalRatio = 1 - profitRatioAtRetirement;

    // Pre-calculate event month ranges — dates never change during the loop
    const eventMonthRanges = lifeEvents.map(event => ({
        startMonth: getMonthFromDate(event.startDate),
        endMonth: event.endDate ? getMonthFromDate(event.endDate) : null
    }));

    // Cumulative growth factor = product of (1+r_k) for k=1..j.
    // Used for both PV discounting and principal ratio evolution.
    // Accumulated month-by-month using the ACTUAL safe variable rates so the
    // pre-pass matches the real simulation when affectsSafeBucket is true.
    let cumulativeGrowthFactor = 1;

    // Run Pre-Pass Loop to calculate precise liability.
    // Uses stateless per-month recalculation (mirrors decumulation.js) to avoid
    // double-counting events that start on the first retirement month and to keep
    // end-boundary logic identical to isEventActive (currentMonth <= endMonth).
    for (let j = 1; j <= monthsInRetirement; j++) {
        const currentSimMonth = monthsToRetirement + j;

        // Per-month safe rate using the same lookup as decumulation.js (supports variable rates)
        const monthlyRate = getMonthlyRateForMonth(currentSimMonth, startYear, variableRatesEnabled, safeVariableRates, bucketSafeRate, startMonth);

        // Advance cumulative growth by this month's actual safe rate
        cumulativeGrowthFactor *= (1 + monthlyRate);

        // Time-varying principal ratio: interest grows balance but not principal,
        // so the ratio shrinks by (1+r) each month. Proportional withdrawals
        // preserve the ratio, so only interest matters.
        const principalRatio_j = initialPrincipalRatio / cumulativeGrowthFactor;

        // Time-varying effective tax rate: mirrors (safeBalance - safePrincipal)/safeBalance * tax
        const safeEffTaxRate_j = Math.max(0, 1 - principalRatio_j) * taxRateDecimal;
        const grossUpFactor_j = safeEffTaxRate_j < 1 ? 1 / (1 - safeEffTaxRate_j) : 1;

        // Recalculate active adjustments from scratch each month — same as decumulation.js
        let ppActiveExpense = 0;
        let ppActiveIncome = 0;
        lifeEvents.forEach((event, idx) => {
            if (!event.enabled) return;
            if (event.type === EVENT_TYPES.EXPENSE_CHANGE || event.type === EVENT_TYPES.INCOME_CHANGE) {
                const { startMonth, endMonth } = eventMonthRanges[idx];
                if (startMonth !== null && currentSimMonth >= startMonth && (endMonth === null || currentSimMonth <= endMonth)) {
                    const amount = getMonthlyAmount(event);
                    if (event.type === EVENT_TYPES.EXPENSE_CHANGE) ppActiveExpense += amount;
                    else ppActiveIncome += amount;
                }
            }
        });

        // Calculate Net Need for this month
        const monthlyNetNeed = Math.max(0, monthlyNetIncomeDesired + ppActiveExpense - ppActiveIncome);
        const monthlyGrossNeed = monthlyNetNeed * grossUpFactor_j;

        // Discount to T=0 of Retirement at pre-tax safe rate
        prePassRequiredCapital += monthlyGrossNeed / cumulativeGrowthFactor;
    }

    return prePassRequiredCapital;
}
