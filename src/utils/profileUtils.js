
import { DEFAULT_INPUTS } from '../constants';
import { calculateAgeFromDate } from './dateUtils';

/**
 * Normalizes input data by merging with defaults and recalculating age from birthdate if applicable.
 * This ensures consistency across session loads, profile loads, and change detection.
 * 
 * @param {Object} data - The raw input data (from profile or session)
 * @returns {Object} Normalized input data
 */
export const normalizeInputs = (data) => {
    // 1. Merge with defaults to ensure all fields exist
    const normalized = { ...DEFAULT_INPUTS, ...data };

    // 2. Recalculate age if manualAge is NOT explicitly enabled and birthdate exists
    if (!normalized.manualAge && normalized.birthdate) {
        const newAge = calculateAgeFromDate(normalized.birthdate);
        if (newAge !== null) {
            // Keep the precision consistent (2 decimals) as a string, to match Input behavior
            normalized.currentAge = newAge.toFixed(2);
        }
    }

    // 3. Ensure numeric fields are strings to match HTML Input behavior and avoid type mismatches (30 vs "30")
    // This is crucial for deepEqual checks in ProfileManager
    const numericFields = [
        'currentSavings', 'monthlyContribution', 'monthlyNetIncomeDesired',
        'annualReturnRate', 'taxRate', 'retirementStartAge',
        'retirementEndAge', 'currentAge',
        'bucketSafeRate', 'bucketSurplusRate', 'withdrawalPercentage'
    ];

    numericFields.forEach(field => {
        if (normalized[field] !== undefined && normalized[field] !== null) {
            // Convert to number to match DEFAULT_INPUTS and InputForm parseFloat logic
            // Handle empty strings or invalid numbers gracefully
            const val = parseFloat(normalized[field]);
            normalized[field] = isNaN(val) ? 0 : val;
        }
    });

    return normalized;
};

export const getDetailedDiff = (obj1, obj2) => {
    if (!obj1 || !obj2) return ['One object is missing'];
    const diffs = [];
    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    allKeys.forEach(key => {
        const val1 = obj1[key];
        const val2 = obj2[key];
        if (typeof val1 !== typeof val2) {
            diffs.push(`Key '${key}': Type mismatch (${typeof val1} vs ${typeof val2})`);
        } else if (typeof val1 === 'object' && val1 !== null && val2 !== null) {
            if (JSON.stringify(val1) !== JSON.stringify(val2)) {
                diffs.push(`Key '${key}': Deep mismatch (${JSON.stringify(val1)} vs ${JSON.stringify(val2)})`);
            }
        } else if (val1 !== val2) {
            diffs.push(`Key '${key}': Value mismatch ('${val1}' vs '${val2}')`);
        }
    });
    return diffs;
};
