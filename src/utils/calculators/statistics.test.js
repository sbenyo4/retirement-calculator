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

    describe('requiredCapitalForPerpetuity', () => {
        it('is finite and correct for a positive real return', () => {
            // effectiveMonthlyRate = (5/100/12) * (1-0.25) = 0.003125
            // perpetuity = 3000 / 0.003125 = 960000
            const result = calculateStatistics({
                ...baseArgs,
                annualReturnRate: 5,
                retirementAnnualReturnRate: 5,
                taxRateDecimal: 0.25,
            });
            expect(result.requiredCapitalForPerpetuity).toBeCloseTo(960000, 0);
        });

        it('is Infinity when effective retirement rate is zero (fix: was incorrectly 0)', () => {
            // effectiveMonthlyRate = 0 when annualReturnRate = 0
            const result = calculateStatistics({
                ...baseArgs,
                annualReturnRate: 0,
                retirementAnnualReturnRate: 0,
                taxRateDecimal: 0.25,
            });
            expect(result.requiredCapitalForPerpetuity).toBe(Infinity);
        });

        it('is Infinity when effective retirement rate is negative', () => {
            // effectiveMonthlyRate < 0: a shrinking portfolio can never sustain a perpetuity
            const result = calculateStatistics({
                ...baseArgs,
                annualReturnRate: -3,
                retirementAnnualReturnRate: -3,
                taxRateDecimal: 0.25,
            });
            expect(result.requiredCapitalForPerpetuity).toBe(Infinity);
        });

        it('is Infinity when tax rate is 100% (effectiveRate = 0 despite positive gross rate)', () => {
            const result = calculateStatistics({
                ...baseArgs,
                annualReturnRate: 5,
                retirementAnnualReturnRate: 5,
                taxRateDecimal: 1.0,
            });
            expect(result.requiredCapitalForPerpetuity).toBe(Infinity);
        });

        it('pvOfCapitalPreservation is also Infinity when perpetuity capital is Infinity', () => {
            const result = calculateStatistics({
                ...baseArgs,
                annualReturnRate: 0,
                retirementAnnualReturnRate: 0,
                taxRateDecimal: 0.25,
            });
            expect(result.pvOfCapitalPreservation).toBe(Infinity);
        });
    });
});
