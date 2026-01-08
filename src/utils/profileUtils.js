
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

    return normalized;
};
