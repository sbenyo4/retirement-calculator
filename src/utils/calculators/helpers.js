
// --- Date & Event Helpers ---

/**
 * Converts an event date object {year, month} to a month index (from now).
 * @param {Object} date - {year, month}
 * @returns {number|null} Month index from now (0-based approx context, but returned as monthsFromNow)
 */
export const getMonthFromDate = (date) => {
    if (!date) return null;
    if (isNaN(date.year) || isNaN(date.month) || date.year === undefined || date.month === undefined) return null;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const yearsFromNow = date.year - currentYear;
    const monthsFromNow = yearsFromNow * 12 + (date.month - currentMonth);
    return monthsFromNow;
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
 * Gets the calendar year for a month index relative to the calculation start.
 * Month 0 is the current/start month; month 1 is the following month.
 *
 * @param {number} monthIndex
 * @param {number} startYear
 * @param {number} startMonth 1-based month number (1 = January)
 * @returns {number}
 */
export const getCalendarYearForMonth = (monthIndex, startYear, startMonth = new Date().getMonth() + 1) => {
    const safeStartMonth = Math.min(12, Math.max(1, parseInt(startMonth) || 1));
    return startYear + Math.floor((safeStartMonth - 1 + monthIndex) / 12);
};

/**
 * Gets the applicable monthly interest rate for a specific month, accounting for variable rates.
 * @param {number} monthIndex 
 * @param {number} startYear 
 * @param {number} startMonth
 * @param {boolean} variableRatesEnabled 
 * @param {Object} variableRates 
 * @param {number} defaultAnnualRate 
 * @returns {number} Monthly rate (decimal)
 */
export const getMonthlyRateForMonth = (monthIndex, startYear, variableRatesEnabled, variableRates, defaultAnnualRate, startMonth = new Date().getMonth() + 1) => {
    const currentCalcYear = getCalendarYearForMonth(monthIndex, startYear, startMonth);
    let yearRate = defaultAnnualRate;
    if (variableRatesEnabled && variableRates && variableRates[currentCalcYear] !== undefined) {
        const parsed = parseFloat(variableRates[currentCalcYear]);
        if (!isNaN(parsed)) {
            yearRate = parsed;
        }
    }
    return Math.pow(1 + yearRate / 100, 1 / 12) - 1;
};
