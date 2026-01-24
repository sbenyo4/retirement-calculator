import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeInputs, getDetailedDiff } from './profileUtils.js';
import { DEFAULT_INPUTS } from '../constants.js';

// Mock dateUtils to control age calculation
vi.mock('./dateUtils.js', () => ({
    calculateAgeFromDate: vi.fn()
}));

import { calculateAgeFromDate } from './dateUtils.js';

describe('profileUtils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('normalizeInputs', () => {
        it('merges input data with DEFAULT_INPUTS', () => {
            const partialData = { currentSavings: 100000 };
            const result = normalizeInputs(partialData);

            // Should have all default fields
            expect(result.monthlyContribution).toBe(DEFAULT_INPUTS.monthlyContribution);
            expect(result.annualReturnRate).toBe(DEFAULT_INPUTS.annualReturnRate);
            expect(result.taxRate).toBe(DEFAULT_INPUTS.taxRate);
            // Should keep the overridden value
            expect(result.currentSavings).toBe(100000);
        });

        it('converts numeric fields from strings to numbers', () => {
            const data = {
                currentSavings: '50000',
                monthlyContribution: '1000',
                currentAge: '35'
            };
            const result = normalizeInputs(data);

            expect(typeof result.currentSavings).toBe('number');
            expect(result.currentSavings).toBe(50000);
            expect(typeof result.monthlyContribution).toBe('number');
            expect(result.monthlyContribution).toBe(1000);
            expect(typeof result.currentAge).toBe('number');
        });

        it('handles empty string numeric fields by converting to 0', () => {
            const data = {
                currentSavings: '',
                monthlyContribution: ''
            };
            const result = normalizeInputs(data);

            expect(result.currentSavings).toBe(0);
            expect(result.monthlyContribution).toBe(0);
        });

        it('handles invalid numeric strings by converting to 0', () => {
            const data = {
                currentSavings: 'invalid',
                monthlyContribution: 'NaN'
            };
            const result = normalizeInputs(data);

            expect(result.currentSavings).toBe(0);
            expect(result.monthlyContribution).toBe(0);
        });

        it('recalculates age from birthdate when manualAge is false', () => {
            calculateAgeFromDate.mockReturnValue(42.5);

            const data = {
                birthdate: '1982-06-15',
                manualAge: false
            };
            const result = normalizeInputs(data);

            expect(calculateAgeFromDate).toHaveBeenCalledWith('1982-06-15');
            expect(result.currentAge).toBe(42.5); // toFixed(2) converts "42.50" then parsed back as 42.5
        });

        it('does NOT recalculate age when manualAge is true', () => {
            calculateAgeFromDate.mockReturnValue(42.5);

            const data = {
                birthdate: '1982-06-15',
                manualAge: true,
                currentAge: 45
            };
            const result = normalizeInputs(data);

            expect(calculateAgeFromDate).not.toHaveBeenCalled();
            expect(result.currentAge).toBe(45);
        });

        it('does NOT recalculate age when birthdate is empty', () => {
            const data = {
                birthdate: '',
                manualAge: false,
                currentAge: 30
            };
            const result = normalizeInputs(data);

            expect(calculateAgeFromDate).not.toHaveBeenCalled();
        });

        it('handles null values from calculateAgeFromDate gracefully', () => {
            calculateAgeFromDate.mockReturnValue(null);

            const data = {
                birthdate: 'invalid-date',
                manualAge: false,
                currentAge: 30
            };
            const result = normalizeInputs(data);

            // Should keep original age when calculation returns null
            expect(result.currentAge).toBe(30);
        });

        it('preserves non-numeric fields as-is', () => {
            const data = {
                birthdate: '1990-01-15',
                lifeEvents: [{ id: 1, type: 'income' }],
                variableRates: { 2025: 5.5 }
            };
            const result = normalizeInputs(data);

            expect(result.birthdate).toBe('1990-01-15');
            expect(result.lifeEvents).toEqual([{ id: 1, type: 'income' }]);
            expect(result.variableRates).toEqual({ 2025: 5.5 });
        });

        it('handles all bucket-related numeric fields', () => {
            const data = {
                bucketSafeRate: '3.5',
                bucketSurplusRate: '7',
                withdrawalPercentage: '4.5'
            };
            const result = normalizeInputs(data);

            expect(result.bucketSafeRate).toBe(3.5);
            expect(result.bucketSurplusRate).toBe(7);
            expect(result.withdrawalPercentage).toBe(4.5);
        });
    });

    describe('getDetailedDiff', () => {
        it('returns empty array when objects are identical', () => {
            const obj1 = { a: 1, b: 'hello', c: true };
            const obj2 = { a: 1, b: 'hello', c: true };
            const diffs = getDetailedDiff(obj1, obj2);

            expect(diffs).toEqual([]);
        });

        it('detects value mismatches', () => {
            const obj1 = { a: 1, b: 'hello' };
            const obj2 = { a: 2, b: 'hello' };
            const diffs = getDetailedDiff(obj1, obj2);

            expect(diffs.length).toBe(1);
            expect(diffs[0]).toContain("Key 'a'");
            expect(diffs[0]).toContain('Value mismatch');
        });

        it('detects type mismatches', () => {
            const obj1 = { a: '1' };
            const obj2 = { a: 1 };
            const diffs = getDetailedDiff(obj1, obj2);

            expect(diffs.length).toBe(1);
            expect(diffs[0]).toContain('Type mismatch');
            expect(diffs[0]).toContain('string');
            expect(diffs[0]).toContain('number');
        });

        it('detects deep mismatches in nested objects', () => {
            const obj1 = { nested: { a: 1, b: 2 } };
            const obj2 = { nested: { a: 1, b: 3 } };
            const diffs = getDetailedDiff(obj1, obj2);

            expect(diffs.length).toBe(1);
            expect(diffs[0]).toContain('Deep mismatch');
        });

        it('detects missing keys in one object', () => {
            const obj1 = { a: 1, b: 2 };
            const obj2 = { a: 1 };
            const diffs = getDetailedDiff(obj1, obj2);

            expect(diffs.length).toBe(1);
            expect(diffs[0]).toContain("Key 'b'");
        });

        it('handles null objects', () => {
            const diffs1 = getDetailedDiff(null, { a: 1 });
            const diffs2 = getDetailedDiff({ a: 1 }, null);

            expect(diffs1).toEqual(['One object is missing']);
            expect(diffs2).toEqual(['One object is missing']);
        });

        it('handles undefined objects', () => {
            const diffs = getDetailedDiff(undefined, { a: 1 });

            expect(diffs).toEqual(['One object is missing']);
        });

        it('handles arrays correctly', () => {
            const obj1 = { arr: [1, 2, 3] };
            const obj2 = { arr: [1, 2, 4] };
            const diffs = getDetailedDiff(obj1, obj2);

            expect(diffs.length).toBe(1);
            expect(diffs[0]).toContain('Deep mismatch');
        });

        it('handles identical nested objects', () => {
            const obj1 = { nested: { a: 1 } };
            const obj2 = { nested: { a: 1 } };
            const diffs = getDetailedDiff(obj1, obj2);

            expect(diffs).toEqual([]);
        });

        it('handles null values within objects', () => {
            const obj1 = { a: null };
            const obj2 = { a: null };
            const diffs = getDetailedDiff(obj1, obj2);

            expect(diffs).toEqual([]);
        });

        it('detects difference between null and undefined', () => {
            const obj1 = { a: null };
            const obj2 = { a: undefined };
            const diffs = getDetailedDiff(obj1, obj2);

            expect(diffs.length).toBeGreaterThan(0);
        });
    });
});
