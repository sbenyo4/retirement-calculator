
import { EVENT_TYPES } from '../../constants.js';
import { getMonthFromDate, getMonthlyAmount } from './helpers.js';

/**
 * Logic for initializing and managing buckets.
 */

/**
 * Calculates the required capital for the "Safe" bucket based on liabilities.
 * This runs a pre-pass simulation of the retirement phase to determine total liability.
 * 
 * @param {Object} params 
 * @returns {number} Required Safe Capital
 */
export function calculateSafeBucketRequirement({
    monthsToRetirement,
    monthsInRetirement,
    lifeEvents,
    monthlyNetIncomeDesired,
    bucketSafeRate,
    taxRateDecimal
}) {
    let prePassRequiredCapital = 0;

    // Calculate NPV of liabilities using Safe Rate
    const safeMonthlyRate = (bucketSafeRate / 100 / 12) * (1 - taxRateDecimal);

    // Initial Gross-Up Estimate (simplified for pre-pass, could be refined)
    // We assume a worst-case or standard tax drag for the gross-up to be safe.
    // In strict logic, we don't know the exact tax rate without the balance mix, 
    // but using the full tax rate on the interest component is a safe bet.
    // However, the calculator.js logic tried to estimate effective tax rate based on profit ratio.
    // Since we don't know the profit ratio of the SAFE bucket specifically yet, we can approximate.
    // Let's assume the Safe Bucket is mostly principal + low interest, but let's stick to the calculator.js logic
    // which effectively assumed some profit ratio. 
    // To match calculator.js EXACTLY, we need the *projected* profit ratio at retirement.
    // But we don't have that easily without running accumulation? 
    // Wait, the caller CAN pass `balanceAtRetirement` and `principalAtRetirement`.
    // Let's assume we receive an `effectiveTaxRate` or `grossUpFactor` passed in.

    // Actually, looking at the code, it calculates `effectiveTaxRate` based on TOTAL balance stats.
    // So we will perform that logic in `decumulation.js` or `calculator.js` and pass the factor here.

    // Wait, I should include the logic here if possible, but I need the inputs.
    // I'll make `grossUpFactor` a required input.

    return 0; // Placeholder, see logic below
}

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
