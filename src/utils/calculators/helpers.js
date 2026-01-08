
import { EVENT_TYPES } from '../../constants.js';

// --- Date & Event Helpers ---

/**
 * Converts an event date object {year, month} to a month index (from now).
 * @param {Object} date - {year, month}
 * @returns {number|null} Month index from now (0-based approx context, but returned as monthsFromNow)
 */
export const getMonthFromDate = (date) => {
    if (!date) return null;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const yearsFromNow = date.year - currentYear;
    const monthsFromNow = yearsFromNow * 12 + (date.month - currentMonth);
    return Math.max(0, monthsFromNow); // Don't allow negative months
};

/**
 * Checks if an event is active at a given month index.
 * @param {Object} event 
 * @param {number} currentMonth 
 * @returns {boolean}
 */
export const isEventActive = (event, currentMonth) => {
    const startMonth = getMonthFromDate(event.startDate);
    if (startMonth === null || currentMonth < startMonth) return false;

    // If no end date, event is active from start onwards
    if (!event.endDate) return true;

    // If has end date, check if we're before it
    const endMonth = getMonthFromDate(event.endDate);
    return endMonth === null || currentMonth <= endMonth;
};

/**
 * Safely gets the monthly value (fallback to amount if monthlyChange is missing).
 * @param {Object} event 
 * @returns {number}
 */
export const getMonthlyAmount = (event) => {
    return event.monthlyChange !== undefined && event.monthlyChange !== null
        ? event.monthlyChange
        : (event.amount || 0);
};

/**
 * Gets the applicable monthly interest rate for a specific month, accounting for variable rates.
 * @param {number} monthIndex 
 * @param {number} startYear 
 * @param {boolean} variableRatesEnabled 
 * @param {Object} variableRates 
 * @param {number} defaultAnnualRate 
 * @returns {number} Monthly rate (decimal)
 */
export const getMonthlyRateForMonth = (monthIndex, startYear, variableRatesEnabled, variableRates, defaultAnnualRate) => {
    const yearOffset = Math.floor(monthIndex / 12);
    const currentCalcYear = startYear + yearOffset;
    const yearRate = (variableRatesEnabled && variableRates && variableRates[currentCalcYear] !== undefined)
        ? variableRates[currentCalcYear]
        : defaultAnnualRate;
    return yearRate / 100 / 12;
};
