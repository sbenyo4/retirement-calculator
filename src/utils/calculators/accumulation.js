
import { EVENT_TYPES } from '../../constants.js';
import { getMonthFromDate, isEventActive, getMonthlyAmount, getMonthlyRateForMonth } from './helpers.js';

/**
 * Calculates the accumulation phase (Now -> Retirement Start).
 * 
 * @param {Object} params
 * @param {number} params.currentAge
 * @param {number} params.retirementStartAge
 * @param {number} params.currentSavings
 * @param {number} params.monthlyContribution
 * @param {number} params.annualReturnRate
 * @param {Object} params.variableRates
 * @param {boolean} params.variableRatesEnabled
 * @param {Array} params.lifeEvents
 * @param {number} params.startYear
 * 
 * @returns {Object} { history, balanceAtRetirement, totalPrincipal }
 */
export function calculateAccumulation({
    currentAge,
    retirementStartAge,
    currentSavings,
    monthlyContribution,
    annualReturnRate,
    variableRates,
    variableRatesEnabled,
    lifeEvents,
    startYear
}) {
    const monthsToRetirement = (retirementStartAge - currentAge) * 12;

    let balance = currentSavings;
    let totalPrincipal = currentSavings; // Track principal for tax basis
    let history = [];
    let currentMonth = 0;

    // Initial state
    history.push({
        month: 0,
        age: currentAge,
        balance: balance,
        contribution: 0,
        withdrawal: 0,
        accumulatedWithdrawals: 0,
        phase: 'accumulation'
    });

    // Track active monthly contribution (can be modified by INCOME_CHANGE events)
    let activeMonthlyContribution = monthlyContribution;

    // Pre-scan for events active at start (Month 0)
    lifeEvents.forEach(event => {
        if (!event.enabled) return;
        const start = getMonthFromDate(event.startDate);
        if (start <= 0 && isEventActive(event, 0)) {
            const amount = getMonthlyAmount(event);
            if (event.type === EVENT_TYPES.INCOME_CHANGE) {
                activeMonthlyContribution += amount;
            } else if (event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                activeMonthlyContribution -= amount;
            }
        }
    });

    for (let i = 1; i <= monthsToRetirement; i++) {
        currentMonth++;
        const monthlyRate = getMonthlyRateForMonth(currentMonth, startYear, variableRatesEnabled, variableRates, annualReturnRate);

        // Apply life events for this month
        lifeEvents.forEach(event => {
            if (!event.enabled) return; // Skip disabled events

            const eventStartMonth = getMonthFromDate(event.startDate);

            // Check if this is the exact month the event starts
            if (eventStartMonth === currentMonth) {
                switch (event.type) {
                    case EVENT_TYPES.ONE_TIME_INCOME:
                        balance += event.amount;
                        totalPrincipal += event.amount;
                        break;

                    case EVENT_TYPES.ONE_TIME_EXPENSE:
                        balance -= event.amount;
                        // Also reduce principal if we're spending saved money
                        totalPrincipal = Math.max(0, totalPrincipal - event.amount);
                        break;

                    case EVENT_TYPES.INCOME_CHANGE:
                        // This modifies monthly contribution going forward
                        activeMonthlyContribution += getMonthlyAmount(event);
                        break;

                    case EVENT_TYPES.EXPENSE_CHANGE:
                        // This reduces monthly contribution capacity going forward
                        activeMonthlyContribution -= getMonthlyAmount(event);
                        break;
                }
            }

            // Check if recurring event should end this month
            if (event.endDate) {
                const eventEndMonth = getMonthFromDate(event.endDate);
                if (eventEndMonth === currentMonth) {
                    const amount = getMonthlyAmount(event);
                    if (event.type === EVENT_TYPES.INCOME_CHANGE) {
                        activeMonthlyContribution -= amount;
                    } else if (event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                        activeMonthlyContribution += amount;
                    }
                }
            }
        });

        // Interest
        const interest = balance * monthlyRate;
        balance += interest;

        // Contribution (using active contribution which may have been modified by events)
        balance += activeMonthlyContribution;
        totalPrincipal += activeMonthlyContribution;

        if (i % 12 === 0) { // Record yearly for chart data
            history.push({
                month: currentMonth,
                age: currentAge + (i / 12),
                balance: balance,
                contribution: activeMonthlyContribution * 12, // Annual contribution (current rate)
                withdrawal: 0,
                accumulatedWithdrawals: 0,
                phase: 'accumulation'
            });
        }
    }

    return {
        balanceAtRetirement: balance,
        totalPrincipal,
        history,
        lastMonthIndex: currentMonth
    };
}
