import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMonthFromDate } from './helpers';

describe('getMonthFromDate', () => {
    const NOW = new Date('2026-03-15');

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns null for null input', () => {
        expect(getMonthFromDate(null)).toBeNull();
        expect(getMonthFromDate(undefined)).toBeNull();
    });

    it('returns 0 for the current month', () => {
        expect(getMonthFromDate({ year: 2026, month: 3 })).toBe(0);
    });

    it('returns a positive value for a future date', () => {
        expect(getMonthFromDate({ year: 2026, month: 6 })).toBe(3);
        expect(getMonthFromDate({ year: 2027, month: 3 })).toBe(12);
    });

    it('returns a negative value for a past date', () => {
        expect(getMonthFromDate({ year: 2026, month: 2 })).toBe(-1);
        expect(getMonthFromDate({ year: 2025, month: 3 })).toBe(-12);
    });

    it('past date does NOT clamp to 0 (fix: expired events are excluded)', () => {
        // Before the fix, Math.max(0, negative) returned 0,
        // making expired events appear active at month 0.
        const result = getMonthFromDate({ year: 2020, month: 1 });
        expect(result).toBeLessThan(0);
    });
});

describe('expired life events are not active at calculation start', () => {
    // Integration-style check: an event with both startDate and endDate
    // in the past should have a negative endMonth, so the pre-scan condition
    // (endMonth >= 0) correctly excludes it.
    const NOW = new Date('2026-03-15');

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('eventMonthRanges endMonth is negative for an event that ended in the past', () => {
        const pastEndDate = { year: 2024, month: 6 };
        const endMonth = getMonthFromDate(pastEndDate);
        // endMonth must be negative so that (endMonth >= 0) is false in the pre-scan
        expect(endMonth).toBeLessThan(0);
    });

    it('eventMonthRanges startMonth is negative for an event that started in the past', () => {
        const pastStartDate = { year: 2024, month: 1 };
        const startMonth = getMonthFromDate(pastStartDate);
        expect(startMonth).toBeLessThan(0);
    });
});
