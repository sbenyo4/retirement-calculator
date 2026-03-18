import { describe, it, expect } from 'vitest';
import { calculateCapitalDuration } from './pensionCalculator';

describe('calculateCapitalDuration', () => {
    it('returns Infinity when return rate sustains the withdrawal (capital never depletes)', () => {
        // $1,200,000 at 6% annual → monthly interest = 1,200,000 * 0.06/12 = 6,000
        // Monthly deficit = 5,000 → interest exceeds deficit → balance grows → never depletes
        const result = calculateCapitalDuration(1_200_000, 5_000, 6);
        expect(result.yearsUntilDepletion).toBe(Infinity);
    });

    it('returns Infinity when monthly deficit is zero', () => {
        const result = calculateCapitalDuration(500_000, 0, 5);
        expect(result.yearsUntilDepletion).toBe(Infinity);
    });

    it('returns Infinity when monthly deficit is negative (surplus income)', () => {
        const result = calculateCapitalDuration(500_000, -1000, 5);
        expect(result.yearsUntilDepletion).toBe(Infinity);
    });

    it('returns finite years when capital is depleted before 100-year cap', () => {
        // $120,000 at 0% with $1,000/month deficit → depletes in exactly 120 months = 10 years
        const result = calculateCapitalDuration(120_000, 1_000, 0);
        expect(result.yearsUntilDepletion).toBe(10);
        expect(result.yearsUntilDepletion).not.toBe(Infinity);
    });

    it('returns 0 years when capital is already zero', () => {
        const result = calculateCapitalDuration(0, 1_000, 5);
        expect(result.yearsUntilDepletion).toBe(0);
    });
});
