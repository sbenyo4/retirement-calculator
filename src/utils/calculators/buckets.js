
import { EVENT_TYPES } from '../../constants.js';
import { getMonthFromDate, getMonthlyAmount, isEventActive } from './helpers.js';

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

    // Clone event trackers for Pre-Pass
    let ppActiveExpense = 0;
    let ppActiveIncome = 0;

    // Initialize active events state at start of retirement
    lifeEvents.forEach(event => {
        if (!event.enabled) return;
        if (isEventActive(event, monthsToRetirement + 1)) {
            if (event.type === EVENT_TYPES.EXPENSE_CHANGE) ppActiveExpense += getMonthlyAmount(event);
            else if (event.type === EVENT_TYPES.INCOME_CHANGE) ppActiveIncome += getMonthlyAmount(event);
        }
    });

    // Run Pre-Pass Loop to calculate precise liability
    for (let j = 1; j <= monthsInRetirement; j++) {
        const currentSimMonth = monthsToRetirement + j;

        // Update Event States for this month
        lifeEvents.forEach(event => {
            if (!event.enabled) return;

            const eventStartMonth = getMonthFromDate(event.startDate);
            const eventEndMonth = event.endDate ? getMonthFromDate(event.endDate) : Infinity;

            // Check for state changes (Start or End)
            if (eventStartMonth === currentSimMonth) {
                if (event.type === EVENT_TYPES.EXPENSE_CHANGE) ppActiveExpense += getMonthlyAmount(event);
                else if (event.type === EVENT_TYPES.INCOME_CHANGE) ppActiveIncome += getMonthlyAmount(event);
            }

            // Check for endings
            if (eventEndMonth !== Infinity && currentSimMonth === eventEndMonth + 1) {
                if (event.type === EVENT_TYPES.EXPENSE_CHANGE) ppActiveExpense -= getMonthlyAmount(event);
                else if (event.type === EVENT_TYPES.INCOME_CHANGE) ppActiveIncome -= getMonthlyAmount(event);
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
