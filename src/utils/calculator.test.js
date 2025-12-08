import { describe, it, expect } from 'vitest';
import { calculateRetirementProjection } from './calculator';

describe('calculateRetirementProjection', () => {
    const baseInputs = {
        currentAge: 30,
        retirementStartAge: 50,
        retirementEndAge: 70,
        currentSavings: 100000,
        monthlyContribution: 1000,
        monthlyNetIncomeDesired: 4000,
        annualReturnRate: 5,
        taxRate: 25
    };

    describe('basic calculations', () => {
        it('should return valid history array', () => {
            const result = calculateRetirementProjection(baseInputs);

            expect(result.history).toBeDefined();
            expect(Array.isArray(result.history)).toBe(true);
            expect(result.history.length).toBeGreaterThan(0);
        });

        it('should calculate balance at retirement', () => {
            const result = calculateRetirementProjection(baseInputs);

            expect(result.balanceAtRetirement).toBeDefined();
            expect(result.balanceAtRetirement).toBeGreaterThan(baseInputs.currentSavings);
        });

        it('should calculate required capital at retirement', () => {
            const result = calculateRetirementProjection(baseInputs);

            expect(result.requiredCapitalAtRetirement).toBeDefined();
            expect(result.requiredCapitalAtRetirement).toBeGreaterThan(0);
        });

        it('should calculate capital for perpetuity', () => {
            const result = calculateRetirementProjection(baseInputs);

            expect(result.requiredCapitalForPerpetuity).toBeDefined();
            expect(result.requiredCapitalForPerpetuity).toBeGreaterThan(0);
            // Perpetuity capital should be greater than required capital (since you preserve principal)
            expect(result.requiredCapitalForPerpetuity).toBeGreaterThan(result.requiredCapitalAtRetirement);
        });
    });

    describe('surplus and deficit', () => {
        it('should have surplus when savings are high', () => {
            const highSavingsInputs = {
                ...baseInputs,
                currentSavings: 1000000,
                monthlyContribution: 5000
            };
            const result = calculateRetirementProjection(highSavingsInputs);

            expect(result.surplus).toBeGreaterThan(0);
            expect(result.ranOutAtAge).toBeNull();
        });

        it('should have deficit when savings are low', () => {
            const lowSavingsInputs = {
                ...baseInputs,
                currentSavings: 0,
                monthlyContribution: 100,
                monthlyNetIncomeDesired: 10000
            };
            const result = calculateRetirementProjection(lowSavingsInputs);

            expect(result.surplus).toBeLessThan(0);
        });

        it('should calculate pvOfDeficit when in deficit', () => {
            const lowSavingsInputs = {
                ...baseInputs,
                currentSavings: 0,
                monthlyContribution: 100,
                monthlyNetIncomeDesired: 10000
            };
            const result = calculateRetirementProjection(lowSavingsInputs);

            expect(result.pvOfDeficit).toBeGreaterThan(0);
        });
    });

    describe('edge cases', () => {
        it('should handle zero interest rate', () => {
            const zeroRateInputs = {
                ...baseInputs,
                annualReturnRate: 0
            };
            const result = calculateRetirementProjection(zeroRateInputs);

            expect(result.balanceAtRetirement).toBeDefined();
            // With 0% interest, balance = savings + contributions
            const expectedBalance = baseInputs.currentSavings + (baseInputs.monthlyContribution * 20 * 12);
            expect(result.balanceAtRetirement).toBeCloseTo(expectedBalance, -2);
        });

        it('should handle zero tax rate', () => {
            const zeroTaxInputs = {
                ...baseInputs,
                taxRate: 0
            };
            const result = calculateRetirementProjection(zeroTaxInputs);

            expect(result.balanceAtRetirement).toBeDefined();
            expect(result.initialGrossWithdrawal).toBeCloseTo(baseInputs.monthlyNetIncomeDesired, -2);
        });

        it('should handle very short retirement period', () => {
            const shortRetirementInputs = {
                ...baseInputs,
                retirementStartAge: 50,
                retirementEndAge: 51
            };
            const result = calculateRetirementProjection(shortRetirementInputs);

            expect(result.balanceAtRetirement).toBeDefined();
            expect(result.requiredCapitalAtRetirement).toBeGreaterThan(0);
        });

        it('should handle string inputs (parseFloat conversion)', () => {
            const stringInputs = {
                currentAge: '30',
                retirementStartAge: '50',
                retirementEndAge: '70',
                currentSavings: '100000',
                monthlyContribution: '1000',
                monthlyNetIncomeDesired: '4000',
                annualReturnRate: '5',
                taxRate: '25'
            };
            const result = calculateRetirementProjection(stringInputs);

            expect(result.balanceAtRetirement).toBeDefined();
            expect(result.balanceAtRetirement).toBeGreaterThan(0);
        });
    });

    describe('history tracking', () => {
        it('should track both accumulation and decumulation phases', () => {
            const result = calculateRetirementProjection(baseInputs);

            const accumulationPhases = result.history.filter(h => h.phase === 'accumulation');
            const decumulationPhases = result.history.filter(h => h.phase === 'decumulation');

            expect(accumulationPhases.length).toBeGreaterThan(0);
            expect(decumulationPhases.length).toBeGreaterThan(0);
        });

        it('should have increasing balance during accumulation', () => {
            const result = calculateRetirementProjection(baseInputs);

            const accumulationPhases = result.history.filter(h => h.phase === 'accumulation');

            for (let i = 1; i < accumulationPhases.length; i++) {
                expect(accumulationPhases[i].balance).toBeGreaterThanOrEqual(accumulationPhases[i - 1].balance);
            }
        });

        it('should track accumulated withdrawals during decumulation', () => {
            const result = calculateRetirementProjection(baseInputs);

            const decumulationPhases = result.history.filter(h => h.phase === 'decumulation');

            for (let i = 1; i < decumulationPhases.length; i++) {
                expect(decumulationPhases[i].accumulatedWithdrawals).toBeGreaterThanOrEqual(decumulationPhases[i - 1].accumulatedWithdrawals);
            }
        });
    });

    describe('bankruptcy detection', () => {
        it('should detect when savings run out', () => {
            const bankruptInputs = {
                ...baseInputs,
                currentSavings: 1000,
                monthlyContribution: 100,
                monthlyNetIncomeDesired: 50000,
                retirementEndAge: 90
            };
            const result = calculateRetirementProjection(bankruptInputs);

            expect(result.ranOutAtAge).not.toBeNull();
            expect(result.ranOutAtAge).toBeGreaterThan(baseInputs.retirementStartAge);
            expect(result.ranOutAtAge).toBeLessThanOrEqual(bankruptInputs.retirementEndAge);
        });
    });
});
