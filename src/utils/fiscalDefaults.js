/**
 * Fiscal Parameters - Single Source of Truth
 * All default values for National Insurance and Tax Brackets (2026)
 *
 * This file serves as the canonical source for fiscal data.
 * Other files should import from here rather than hardcoding values.
 */

// Israeli National Insurance (Bituach Leumi) rates for old-age pension (January 2026)
// Source: https://www.btl.gov.il/English%20Homepage/Benefits/Old%20Age%20Insurance/Pages/Pensionrates.aspx
export const DEFAULT_NATIONAL_INSURANCE = {
    baseRates: {
        single: 1838,           // Base monthly pension for single person
        single_child: 2419,     // Single + child supplement (1838 + 581)
        couple: 2762,           // Couple (1838 + 924 spouse supplement)
        couple_child: 3343,     // Couple + child (2762 + 581)
        age80PlusAddon: 103,    // Additional for age 80+
        seniorityAdditionPerYear: 2  // 2% per year (up to 50% max)
    },
    deferralBonusPerMonth: 5,   // 5% per year for deferring past 67
    // Income test thresholds (מבחן הכנסות) - applies ages 67-70 only
    // Source: https://www.btl.gov.il/benefits/old_age/Conditions_of_eligibility/Pages/hachnasotMewavoda.aspx
    incomeTestThreshold: {
        workEarningsLimit: 9781,  // Max work income for full pension (single)
        single: 13970,            // Above this = no pension at all (single)
        couple: 19483             // Above this = no pension at all (couple)
    }
};

// Israeli tax brackets for income (January 2026)
export const DEFAULT_TAX_BRACKETS = [
    { limit: 7010, rate: 0.10 },
    { limit: 10060, rate: 0.14 },
    { limit: 16150, rate: 0.20 },
    { limit: 22440, rate: 0.31 },
    { limit: 46690, rate: 0.35 },
    { limit: 60130, rate: 0.47 },
    { limit: null, rate: 0.47 }  // Catch-all bracket
];

// Combined default fiscal parameters
export const DEFAULT_FISCAL_PARAMETERS = {
    nationalInsurance: DEFAULT_NATIONAL_INSURANCE,
    taxBrackets: DEFAULT_TAX_BRACKETS
};

// Validation ranges - expected bounds for 2026 values (with 10% tolerance for stricter validation)
export const VALIDATION_RANGES = {
    nationalInsurance: {
        // Strict ranges (10% tolerance) - values outside trigger ERRORS
        single: { min: 1650, max: 2020 },       // ~1838 +/- 10%
        single_child: { min: 2180, max: 2660 }, // ~2419 +/- 10%
        couple: { min: 2490, max: 3040 },       // ~2762 +/- 10%
        couple_child: { min: 3010, max: 3680 }, // ~3343 +/- 10%
        // Income test thresholds - UPDATED to match official 2026 values
        incomeTestSingle: { min: 12500, max: 15500 },  // ~13970 +/- ~10%
        incomeTestCouple: { min: 17500, max: 21500 }   // ~19483 +/- ~10%
    },
    taxBrackets: {
        firstBracketLimit: { min: 6300, max: 7700 },  // ~7010 +/- 10%
        lastBracketLimit: { min: 54000, max: 66000 }, // ~60130 +/- 10%
        minRate: 0.08,
        maxRate: 0.50
    }
};

/**
 * Validation result object
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether the data passed validation
 * @property {string[]} errors - List of validation error messages
 * @property {string[]} warnings - List of validation warnings
 * @property {Object} correctedData - Data with automatic corrections applied (if any)
 */

/**
 * Validate National Insurance rates
 * @param {Object} niData - National Insurance data to validate
 * @returns {ValidationResult}
 */
export function validateNationalInsurance(niData) {
    const errors = [];
    const warnings = [];
    const correctedData = structuredClone(niData || {});

    if (!niData || !niData.baseRates) {
        return {
            isValid: false,
            errors: ['Missing National Insurance base rates'],
            warnings: [],
            correctedData: null
        };
    }

    const ranges = VALIDATION_RANGES.nationalInsurance;
    const rates = niData.baseRates;

    // 1. Check all required fields exist
    const requiredFields = ['single', 'couple'];
    for (const field of requiredFields) {
        if (rates[field] === undefined || rates[field] === null) {
            errors.push(`Missing required field: ${field}`);
        }
    }

    // 2. Check value ranges - these are now ERRORS (stricter validation)
    if (rates.single !== undefined) {
        const val = Number(rates.single);
        if (isNaN(val)) {
            errors.push(`Invalid single rate: not a number`);
        } else if (val < ranges.single.min || val > ranges.single.max) {
            errors.push(`Single rate ${val} outside valid range (${ranges.single.min}-${ranges.single.max}). Expected ~1838.`);
        }
    }

    if (rates.couple !== undefined) {
        const val = Number(rates.couple);
        if (isNaN(val)) {
            errors.push(`Invalid couple rate: not a number`);
        } else if (val < ranges.couple.min || val > ranges.couple.max) {
            errors.push(`Couple rate ${val} outside valid range (${ranges.couple.min}-${ranges.couple.max}). Expected ~2762.`);
        }
    }

    if (rates.single_child !== undefined) {
        const val = Number(rates.single_child);
        if (isNaN(val)) {
            errors.push(`Invalid single_child rate: not a number`);
        } else if (val < ranges.single_child.min || val > ranges.single_child.max) {
            errors.push(`Single_child rate ${val} outside valid range. Expected ~2419.`);
        }
    }

    if (rates.couple_child !== undefined) {
        const val = Number(rates.couple_child);
        if (isNaN(val)) {
            errors.push(`Invalid couple_child rate: not a number`);
        } else if (val < ranges.couple_child.min || val > ranges.couple_child.max) {
            errors.push(`Couple_child rate ${val} outside valid range. Expected ~3343.`);
        }
    }

    // 3. Check relationship constraints (CRITICAL for detecting AI calculation errors)
    if (rates.single && rates.couple) {
        if (Number(rates.couple) <= Number(rates.single)) {
            errors.push(`Invalid relationship: couple (${rates.couple}) must be greater than single (${rates.single})`);
        }
    }

    if (rates.single && rates.single_child) {
        if (Number(rates.single_child) <= Number(rates.single)) {
            errors.push(`Invalid relationship: single_child (${rates.single_child}) must be greater than single (${rates.single})`);
        }
    }

    if (rates.couple && rates.couple_child) {
        if (Number(rates.couple_child) <= Number(rates.couple)) {
            errors.push(`Invalid relationship: couple_child (${rates.couple_child}) must be greater than couple (${rates.couple})`);
        }
    }

    if (rates.single_child && rates.couple_child) {
        if (Number(rates.couple_child) <= Number(rates.single_child)) {
            errors.push(`Invalid relationship: couple_child (${rates.couple_child}) must be greater than single_child (${rates.single_child})`);
        }
    }

    // 4. Validate income test thresholds - CRITICAL validation (errors, not warnings)
    if (niData.incomeTestThreshold) {
        const thresholds = niData.incomeTestThreshold;
        if (thresholds.single && thresholds.couple) {
            if (Number(thresholds.couple) <= Number(thresholds.single)) {
                errors.push(`Invalid income test: couple threshold must be greater than single threshold`);
            }
        }

        // Income test thresholds are critical - wrong values cause major calculation errors
        if (thresholds.single) {
            const val = Number(thresholds.single);
            if (isNaN(val) || val < ranges.incomeTestSingle.min || val > ranges.incomeTestSingle.max) {
                errors.push(`Income test single threshold ${val} outside valid range (${ranges.incomeTestSingle.min}-${ranges.incomeTestSingle.max}). Expected ~20226.`);
            }
        }

        if (thresholds.couple) {
            const val = Number(thresholds.couple);
            if (isNaN(val) || val < ranges.incomeTestCouple.min || val > ranges.incomeTestCouple.max) {
                errors.push(`Income test couple threshold ${val} outside valid range (${ranges.incomeTestCouple.min}-${ranges.incomeTestCouple.max}). Expected ~26968.`);
            }
        }
    } else {
        // Income test thresholds are required
        errors.push('Missing income test thresholds');
    }

    // 5. Auto-correct obvious format issues
    // Convert percentage formats (e.g., 2 for 2% seniority is correct, keep as is)
    // But if someone sends 0.02, normalize to 2
    if (correctedData.baseRates?.seniorityAdditionPerYear !== undefined) {
        const val = correctedData.baseRates.seniorityAdditionPerYear;
        if (val > 0 && val < 0.1) {
            correctedData.baseRates.seniorityAdditionPerYear = val * 100;
            warnings.push(`Normalized seniorityAdditionPerYear from ${val} to ${val * 100}`);
        }
    }

    if (correctedData.deferralBonusPerMonth !== undefined) {
        const val = correctedData.deferralBonusPerMonth;
        if (val > 0 && val < 0.1) {
            correctedData.deferralBonusPerMonth = val * 100;
            warnings.push(`Normalized deferralBonusPerMonth from ${val} to ${val * 100}`);
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        correctedData: errors.length === 0 ? correctedData : null
    };
}

/**
 * Validate tax brackets
 * @param {Array} brackets - Array of tax brackets to validate
 * @returns {ValidationResult}
 */
export function validateTaxBrackets(brackets) {
    const errors = [];
    const warnings = [];
    let correctedBrackets = [];

    if (!brackets || !Array.isArray(brackets) || brackets.length === 0) {
        return {
            isValid: false,
            errors: ['Missing or empty tax brackets array'],
            warnings: [],
            correctedData: null
        };
    }

    const ranges = VALIDATION_RANGES.taxBrackets;
    let previousLimit = 0;

    for (let i = 0; i < brackets.length; i++) {
        const bracket = brackets[i];
        let limit = bracket.limit;
        let rate = bracket.rate;

        // 1. Normalize rate (handle 10 vs 0.10)
        if (typeof rate === 'number' && rate > 1) {
            rate = rate / 100;
            warnings.push(`Normalized bracket ${i + 1} rate from ${bracket.rate} to ${rate}`);
        }

        // 2. Normalize limit (handle string formats like "7,010")
        if (typeof limit === 'string') {
            const cleanStr = limit.replace(/,/g, '').toLowerCase();
            if (cleanStr === 'infinity' || cleanStr === 'null' || cleanStr === '') {
                limit = null;
            } else {
                limit = parseFloat(cleanStr);
            }
        }

        // Handle Infinity, 0, or last bracket -> null
        const isLast = i === brackets.length - 1;
        if (limit === Infinity || (isLast && (limit === 0 || limit === null))) {
            limit = null;
        }

        // 3. Validate rate range
        if (typeof rate !== 'number' || isNaN(rate)) {
            errors.push(`Bracket ${i + 1}: invalid rate`);
        } else if (rate < ranges.minRate || rate > ranges.maxRate) {
            warnings.push(`Bracket ${i + 1}: rate ${rate} outside expected range (${ranges.minRate}-${ranges.maxRate})`);
        }

        // 4. Validate limit ordering (must be ascending)
        if (limit !== null) {
            if (typeof limit !== 'number' || isNaN(limit)) {
                errors.push(`Bracket ${i + 1}: invalid limit`);
            } else if (limit <= previousLimit) {
                errors.push(`Bracket ${i + 1}: limit ${limit} not greater than previous (${previousLimit}). Brackets must be ascending.`);
            }
            previousLimit = limit;
        }

        correctedBrackets.push({ limit, rate });
    }

    // 5. Check first and last bracket bounds
    if (correctedBrackets.length > 0) {
        const firstLimit = correctedBrackets[0].limit;
        if (firstLimit !== null && (firstLimit < ranges.firstBracketLimit.min || firstLimit > ranges.firstBracketLimit.max)) {
            warnings.push(`First bracket limit ${firstLimit} outside expected range`);
        }

        // Find the last non-null limit
        const lastWithLimit = [...correctedBrackets].reverse().find(b => b.limit !== null);
        if (lastWithLimit) {
            if (lastWithLimit.limit < ranges.lastBracketLimit.min || lastWithLimit.limit > ranges.lastBracketLimit.max) {
                warnings.push(`Last bracket limit ${lastWithLimit.limit} outside expected range`);
            }
        }
    }

    // 6. Ensure catch-all bracket exists
    const lastBracket = correctedBrackets[correctedBrackets.length - 1];
    if (lastBracket && lastBracket.limit !== null) {
        // Add catch-all bracket if missing
        correctedBrackets.push({ limit: null, rate: lastBracket.rate });
        warnings.push('Added missing catch-all bracket');
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        correctedData: errors.length === 0 ? correctedBrackets : null
    };
}

/**
 * Validate complete fiscal parameters object
 * @param {Object} fiscalData - Complete fiscal data to validate
 * @returns {ValidationResult}
 */
export function validateFiscalParameters(fiscalData) {
    const allErrors = [];
    const allWarnings = [];

    if (!fiscalData) {
        return {
            isValid: false,
            errors: ['Fiscal data is null or undefined'],
            warnings: [],
            correctedData: null
        };
    }

    // Validate National Insurance
    const niResult = validateNationalInsurance(fiscalData.nationalInsurance);
    allErrors.push(...niResult.errors.map(e => `NI: ${e}`));
    allWarnings.push(...niResult.warnings.map(w => `NI: ${w}`));

    // Validate Tax Brackets
    const taxResult = validateTaxBrackets(fiscalData.taxBrackets);
    allErrors.push(...taxResult.errors.map(e => `Tax: ${e}`));
    allWarnings.push(...taxResult.warnings.map(w => `Tax: ${w}`));

    const isValid = allErrors.length === 0;

    return {
        isValid,
        errors: allErrors,
        warnings: allWarnings,
        correctedData: isValid ? {
            nationalInsurance: niResult.correctedData,
            taxBrackets: taxResult.correctedData
        } : null
    };
}

/**
 * Check if value appears to be from an older year (2025 or earlier) or is otherwise suspicious
 * @param {number} singleRate - The single person NI rate
 * @returns {Object} Detection result with year estimate
 */
export function detectOutdatedValues(singleRate) {
    // Known historical values for single person NI rate
    const historicalRates = {
        2025: { min: 1750, max: 1770 },  // ~1756
        2024: { min: 1680, max: 1710 },  // ~1690
        2023: { min: 1595, max: 1625 }   // ~1610
    };

    // Current expected value for 2026
    const expected2026 = 1838;
    const tolerance = 0.03; // 3% tolerance for "correct" values

    for (const [year, range] of Object.entries(historicalRates)) {
        if (singleRate >= range.min && singleRate <= range.max) {
            return {
                isOutdated: true,
                detectedYear: parseInt(year),
                message: `Value ${singleRate} appears to be from ${year}, not 2026. Expected ~${expected2026}.`
            };
        }
    }

    // Check if the value is significantly different from expected 2026 value
    const diffPercent = Math.abs((singleRate - expected2026) / expected2026);
    if (diffPercent > tolerance) {
        return {
            isOutdated: true,
            detectedYear: null,
            message: `Value ${singleRate} differs by ${(diffPercent * 100).toFixed(1)}% from expected 2026 value of ${expected2026}`
        };
    }

    return { isOutdated: false, detectedYear: null, message: null };
}
