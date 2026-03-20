
import { EVENT_TYPES } from '../../constants.js';
import { getMonthFromDate, getMonthlyAmount } from './helpers.js';

/**
 * Logic for initializing and managing buckets.
 */

/**
 * Pre-pass calculation to verify Safe Bucket need.
 * Copied from calculator.js logic.
 */
export function calculatePrePassRequiredCapital({
    monthsToRetirement,
    monthsInRetirement,
    lifeEvents,
    monthlyNetIncomeDesired,
    bucketSafeRate,
    taxRateDecimal,
    grossUpFactor
}) {
    let prePassRequiredCapital = 0;
    const safeMonthlyRate = (bucketSafeRate / 100 / 12) * (1 - taxRateDecimal);

    // Pre-calculate event month ranges — dates never change during the loop
    const eventMonthRanges = lifeEvents.map(event => ({
        startMonth: getMonthFromDate(event.startDate),
        endMonth: event.endDate ? getMonthFromDate(event.endDate) : null
    }));

    // Run Pre-Pass Loop to calculate precise liability.
    // Uses stateless per-month recalculation (mirrors decumulation.js) to avoid
    // double-counting events that start on the first retirement month and to keep
    // end-boundary logic identical to isEventActive (currentMonth <= endMonth).
    for (let j = 1; j <= monthsInRetirement; j++) {
        const currentSimMonth = monthsToRetirement + j;

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
        const monthlyGrossNeed = monthlyNetNeed * grossUpFactor;

        // Discount to T=0 of Retirement
        const discount = Math.pow(1 + safeMonthlyRate, j);
        prePassRequiredCapital += monthlyGrossNeed / discount;
    }

    return prePassRequiredCapital;
}
