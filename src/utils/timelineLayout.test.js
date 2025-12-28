
import { calculateTimelineLayout } from './timelineLayout';

// Mock event helper
const createEvent = (id, startYear, endYear, isExpense = false) => ({
    id,
    startDate: { year: Math.floor(startYear), month: Math.round((startYear % 1) * 12) || 1 },
    endDate: endYear ? { year: Math.floor(endYear), month: Math.round((endYear % 1) * 12) || 1 } : null,
    isExpense,
    type: isExpense ? 'EXPENSE' : 'INCOME'
});

describe('calculateTimelineLayout', () => {
    test('should place non-overlapping events on the same track', () => {
        const events = [
            createEvent(1, 2025, 2026), // track 1
            createEvent(2, 2027, 2028), // track 1 (gap ok)
        ];

        const result = calculateTimelineLayout(events, { minSpacingYears: 0.5 });
        expect(result.incomeTracks).toBe(1);
        expect(result.layoutEvents.find(e => e.id === 1).trackIndex).toBe(1);
        expect(result.layoutEvents.find(e => e.id === 2).trackIndex).toBe(1);
    });

    test('should stack overlapping events', () => {
        const events = [
            createEvent(1, 2025, 2030), // track 1
            createEvent(2, 2026, 2027), // Overlaps -> track 2
        ];

        const result = calculateTimelineLayout(events, { minSpacingYears: 0.5 });
        expect(result.incomeTracks).toBe(2);
        expect(result.layoutEvents.find(e => e.id === 1).trackIndex).toBe(1);
        expect(result.layoutEvents.find(e => e.id === 2).trackIndex).toBe(2);
    });

    test('should separate income and expenses', () => {
        const events = [
            createEvent(1, 2025, 2030, false), // Income
            createEvent(2, 2025, 2030, true),  // Expense
        ];

        const result = calculateTimelineLayout(events);
        expect(result.incomeTracks).toBe(1);
        expect(result.expenseTracks).toBe(1);

        const e1 = result.layoutEvents.find(e => e.id === 1);
        const e2 = result.layoutEvents.find(e => e.id === 2);

        expect(e1.lane).toBe('income');
        expect(e1.trackIndex).toBe(1);
        expect(e2.lane).toBe('expense');
        expect(e2.trackIndex).toBe(1);
    });

    test('should handle one-time events with buffers', () => {
        // One time event at 2025.0
        const events = [
            createEvent(1, 2025.0, null),
            createEvent(2, 2025.2, null)  // Very close, should collide if buffer is 0.5
        ];

        const result = calculateTimelineLayout(events, { minSpacingYears: 0.5 });
        expect(result.incomeTracks).toBe(2);
    });
});
