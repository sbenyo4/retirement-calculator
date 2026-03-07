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

/**
 * Calculates the projected calendar year when a person reaches a target age.
 * @param {number|string} targetAge - The target age to project to.
 * @param {number|string} currentAge - The person's current age.
 * @param {string} [birthdate] - Optional birthdate string (YYYY-MM-DD) for precise calculation.
 * @param {boolean} [isAgeManual=false] - If true, ignores birthdate and uses currentAge-based arithmetic.
 * @returns {number|null} The projected year, or null if inputs are invalid.
 */
export const getProjectedYear = (targetAge, currentAge, birthdate, isAgeManual = false) => {
    if (!targetAge || !currentAge) return null;
    const target = parseFloat(targetAge);
    const current = parseFloat(currentAge);
    if (isNaN(target) || isNaN(current)) return null;

    if (birthdate && !isAgeManual) {
        return new Date(birthdate).getFullYear() + target;
    }
    return Math.floor(new Date().getFullYear() + (target - current));
};
