/**
 * Formatting utilities for the retirement calculator
 */

/**
 * Creates a memoizable currency formatter for the given language
 * @param {string} language - 'he' for Hebrew/ILS or 'en' for English/USD
 * @returns {Intl.NumberFormat} Formatter instance
 */
export const createCurrencyFormatter = (language) => {
    return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: language === 'he' ? 'ILS' : 'USD',
        maximumFractionDigits: 0
    });
};

/**
 * Formats a numeric value as currency
 * @param {number} value - The value to format
 * @param {string} language - 'he' for Hebrew/ILS or 'en' for English/USD
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, language) => {
    return createCurrencyFormatter(language).format(value);
};

/**
 * Formats a number with thousands separators
 * @param {number} value - The value to format
 * @param {string} language - 'he' for Hebrew or 'en' for English
 * @returns {string} Formatted number string
 */
export const formatNumber = (value, language) => {
    return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
        maximumFractionDigits: 0
    }).format(value);
};

/**
 * Formats a percentage value
 * @param {number} value - The percentage value (e.g., 5 for 5%)
 * @param {string} language - 'he' for Hebrew or 'en' for English
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value, language) => {
    return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }).format(value / 100);
};
