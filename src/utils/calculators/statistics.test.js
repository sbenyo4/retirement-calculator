import { describe, it, expect } from 'vitest';
import { calculateStatistics } from './statistics';

const baseArgs = {
    balanceAtRetirement: 500000,
    requiredCapitalAtRetirement: 600000, // deficit scenario
    monthlyNetIncomeDesired: 3000,
    monthlyContribution: 1000,
    annualReturnRate: 5,
    retirementAnnualReturnRate: null,
    taxRateDecimal: 0.25,
    monthsToRetirement: 240,
    monthsInRetirement: 240,
    accumulatedWithdrawals: 600000,
    totalNetWithdrawal: 450000,
};

describe('calculateStatistics', () => {
    describe('negative rate handling', () => {
        it('maxSustainableNetWithdrawal uses PMT formula for negative effective rate (not the zero branch)', () => {
            // effectiveMonthlyRate = (-2/100/12) * (1-0.25) = negative
            const result = calculateStatistics({
                ...baseArgs,
                balanceAtRetirement: 300000,
                requiredCapitalAtRetirement: 100000, // surplus
                annualReturnRate: -2,
                retirementAnnualReturnRate: -2,
                taxRateDecimal: 0.25,
            });

            // With a negative rate the PMT formula gives a SMALLER withdrawal than balance/n
            // because capital is shrinking. It must be finite and positive (balance > 0).
            expect(result.maxSustainableNetWithdrawal).toBeGreaterThan(0);
            expect(isNaN(result.maxSustainableNetWithdrawal)).toBe(false);

            // Verify it is less than the zero-rate approximation (300000/240 = 1250)
            const zeroRateApprox = 300000 / 240;
            expect(result.maxSustainableNetWithdrawal).toBeLessThan(zeroRateApprox);
        });

        it('pvOfDeficit uses PV formula for negative accumulation rate', () => {
            // With a negative growth rate the present value of a future deficit is LARGER
            // (money is worth more today if the rate is negative), so PV > FV deficit.
            const negResult = calculateStatistics({
                ...baseArgs,
                annualReturnRate: -2,
                retirementAnnualReturnRate: -2,
            });

            const posResult = calculateStatistics({
                ...baseArgs,
                annualReturnRate: 5,
                retirementAnnualReturnRate: 5,
            });

            // Both must be finite, non-NaN and positive (deficit scenario)
            expect(isNaN(negResult.pvOfDeficit)).toBe(false);
            expect(negResult.pvOfDeficit).toBeGreaterThan(0);

            // Negative-rate PV of deficit > positive-rate PV of deficit
            expect(negResult.pvOfDeficit).toBeGreaterThan(posResult.pvOfDeficit);
        });

        it('maxSustainableNetWithdrawal is finite and non-NaN for zero rate', () => {
            const result = calculateStatistics({
                ...baseArgs,
                balanceAtRetirement: 240000,
                requiredCapitalAtRetirement: 0,
                annualReturnRate: 0,
                retirementAnnualReturnRate: 0,
                taxRateDecimal: 0,
            });

            // zero-rate: PMT = balance / months = 240000 / 240 = 1000
            expect(result.maxSustainableNetWithdrawal).toBeCloseTo(1000, 2);
            expect(isNaN(result.maxSustainableNetWithdrawal)).toBe(false);
        });
    });
});
