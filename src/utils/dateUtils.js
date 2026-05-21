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
 * Converts an age or an age span into whole model months.
 * Decimal ages are month selectors in the UI, so the monthly calculation engine
 * must receive one integer month count rather than letting loop bounds truncate.
 */
export const ageToWholeMonths = (age) => {
    const parsedAge = parseFloat(age);
    return isNaN(parsedAge) ? null : Math.round(parsedAge * 12);
};

export const getMonthsBetweenAges = (fromAge, toAge) => {
    const fromMonths = ageToWholeMonths(fromAge);
    const toMonths = ageToWholeMonths(toAge);
    return fromMonths === null || toMonths === null ? null : toMonths - fromMonths;
};

/**
 * Returns the calendar month in which a target age is reached.
 * When a birthdate is unavailable or current age was entered manually, the
 * current month is the anchor for the age span.
 */
export const getProjectedAgeDate = (targetAge, currentAge, birthdate, isAgeManual = false) => {
    if (targetAge == null || targetAge === '') return null;

    if (birthdate && !isAgeManual) {
        const birthDateObj = new Date(birthdate);
        const targetAgeMonths = ageToWholeMonths(targetAge);
        if (isNaN(birthDateObj.getTime()) || targetAgeMonths === null) return null;

        return new Date(
            birthDateObj.getFullYear(),
            birthDateObj.getMonth() + targetAgeMonths,
            1
        );
    }

    if (currentAge == null || currentAge === '') return null;
    const monthsToTarget = getMonthsBetweenAges(currentAge, targetAge);
    if (monthsToTarget === null) return null;

    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + monthsToTarget, 1);
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
    const projectedDate = getProjectedAgeDate(targetAge, currentAge, birthdate, isAgeManual);
    return projectedDate ? projectedDate.getFullYear() : null;
};
