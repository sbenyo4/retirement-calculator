/**
 * Calculates the age from a birth date string.
 * @param {string} dateString - The birth date string (YYYY-MM-DD).
 * @returns {number|null} The calculated age in years (float), or null if input is invalid.
 */
export const calculateAgeFromDate = (dateString) => {
    if (!dateString) return null;
    const birthDateObj = new Date(dateString);
    const today = new Date();
    // 365.25 accounts for leap years on average
    const age = (today - birthDateObj) / (1000 * 60 * 60 * 24 * 365.25);
    return age;
};
