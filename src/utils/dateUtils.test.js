import { describe, it, expect } from 'vitest';
import { getMonthsBetweenAges, getProjectedAgeDate, getProjectedYear } from './dateUtils';

describe('getProjectedYear', () => {
    it('returns null for null targetAge', () => {
        expect(getProjectedYear(null, 35)).toBeNull();
    });

    it('returns null for null currentAge', () => {
        expect(getProjectedYear(67, null)).toBeNull();
    });

    it('returns null for empty string targetAge', () => {
        expect(getProjectedYear('', 35)).toBeNull();
    });

    it('returns null for empty string currentAge', () => {
        expect(getProjectedYear(67, '')).toBeNull();
    });

    it('handles targetAge = 0 without returning null (fix: falsy check was too broad)', () => {
        // Before the fix, (!targetAge) was true for 0, returning null incorrectly.
        const result = getProjectedYear(0, 30);
        expect(result).not.toBeNull();
    });

    it('handles currentAge = 0 without returning null', () => {
        const result = getProjectedYear(67, 0);
        expect(result).not.toBeNull();
    });

    it('returns null for NaN string inputs after parseFloat', () => {
        expect(getProjectedYear('abc', 35)).toBeNull();
        expect(getProjectedYear(67, 'abc')).toBeNull();
    });

    it('computes correct projected year without birthdate', () => {
        const currentYear = new Date().getFullYear();
        expect(getProjectedYear(67, 35)).toBe(Math.floor(currentYear + 32));
        expect(getProjectedYear(90, 35)).toBe(Math.floor(currentYear + 55));
    });

    it('uses birthYear + targetAge when birthdate is provided and isAgeManual is false', () => {
        expect(getProjectedYear(90, 35, '1990-06-01', false)).toBe(2080);
    });

    it('uses the decimal age months when a birthdate projection crosses a calendar year', () => {
        const projectedDate = getProjectedAgeDate(35.75, 35, '1990-06-01', false);

        expect(projectedDate.getFullYear()).toBe(2026);
        expect(projectedDate.getMonth() + 1).toBe(3);
        expect(getProjectedYear(35.75, 35, '1990-06-01', false)).toBe(2026);
    });

    it('ignores birthdate when isAgeManual is true', () => {
        const currentYear = new Date().getFullYear();
        expect(getProjectedYear(90, 35, '1990-06-01', true)).toBe(Math.floor(currentYear + 55));
    });
});

describe('getMonthsBetweenAges', () => {
    it('maps quarter-age fractions to whole months', () => {
        expect(getMonthsBetweenAges(53, 53.75)).toBe(9);
        expect(getMonthsBetweenAges(53.75, 54)).toBe(3);
    });
});
