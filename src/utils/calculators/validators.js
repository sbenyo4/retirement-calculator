
/**
 * Validates retirement calculation inputs
 * @param {Object} inputs - User inputs to validate
 * @param {Function} t - Translation function (optional)
 * @returns {Array<string>} Array of error messages (empty if all valid)
 */
export function validateInputs(inputs, t = null) {
    const errors = [];

    const {
        currentAge,
        retirementStartAge,
        retirementEndAge,
        currentSavings,
        monthlyContribution,
        monthlyNetIncomeDesired,
        annualReturnRate,
        taxRate
    } = Object.fromEntries(
        Object.entries(inputs).map(([k, v]) => [k, parseFloat(v)])
    );

    // Helper to get translation or fallback to English
    const getText = (key, fallback) => (t ? t(key) : fallback);

    // Age validations
    if (isNaN(currentAge) || currentAge < 0 || currentAge > 120) {
        errors.push(getText('validationCurrentAgeBetween', 'Current age must be between 0 and 120'));
    }
    if (isNaN(retirementStartAge) || retirementStartAge < 0 || retirementStartAge > 120) {
        errors.push(getText('validationRetirementStartAgeBetween', 'Retirement start age must be between 0 and 120'));
    }
    if (isNaN(retirementEndAge) || retirementEndAge < 0 || retirementEndAge > 120) {
        errors.push(getText('validationRetirementEndAgeBetween', 'Retirement end age must be between 0 and 120'));
    }

    // Age sequence validations
    if (!isNaN(currentAge) && !isNaN(retirementStartAge) && retirementStartAge <= currentAge) {
        errors.push(getText('validationRetirementStartGreater', 'Retirement start age must be greater than current age'));
    }
    if (!isNaN(retirementStartAge) && !isNaN(retirementEndAge) && retirementEndAge <= retirementStartAge) {
        errors.push(getText('validationRetirementEndGreater', 'Retirement end age must be greater than retirement start age'));
    }

    // Financial validations
    if (isNaN(currentSavings) || currentSavings < 0) {
        errors.push(getText('validationCurrentSavingsNonNegative', 'Current savings cannot be negative'));
    }
    if (isNaN(monthlyContribution) || monthlyContribution < 0) {
        errors.push(getText('validationMonthlyContributionNonNegative', 'Monthly contribution cannot be negative'));
    }
    if (isNaN(monthlyNetIncomeDesired) || monthlyNetIncomeDesired <= 0) {
        errors.push(getText('validationMonthlyIncomePositive', 'Monthly net income desired must be positive'));
    }

    // Rate validations
    if (isNaN(annualReturnRate) || annualReturnRate < -100 || annualReturnRate > 100) {
        errors.push(getText('validationAnnualReturnBetween', 'Annual return rate must be between -100% and 100%'));
    }
    if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
        errors.push(getText('validationTaxRateBetween', 'Tax rate must be between 0% and 100%'));
    }

    return errors;
}
