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

    describe('variable rates', () => {
        const startYear = new Date().getFullYear();

        it('numeric variable rates produce same result as equivalent fixed rate', () => {
            const fixedResult = calculateRetirementProjection({
                ...baseInputs,
                annualReturnRate: 5
            });

            // Every year set to 5 (as numbers) — should match fixed 5%
            const rates = {};
            for (let y = startYear; y <= startYear + 30; y++) rates[y] = 5;
            const variableResult = calculateRetirementProjection({
                ...baseInputs,
                variableRatesEnabled: true,
                variableRates: rates
            });

            expect(variableResult.balanceAtRetirement).toBeCloseTo(fixedResult.balanceAtRetirement, 0);
        });

        it('string variable rates are parsed and produce same result as numeric rates', () => {
            const rates = {};
            for (let y = startYear; y <= startYear + 30; y++) rates[y] = 7;
            const numericResult = calculateRetirementProjection({
                ...baseInputs,
                variableRatesEnabled: true,
                variableRates: rates
            });

            // Same rates stored as strings — must produce identical result
            const stringRates = {};
            for (let y = startYear; y <= startYear + 30; y++) stringRates[y] = '7';
            const stringResult = calculateRetirementProjection({
                ...baseInputs,
                variableRatesEnabled: true,
                variableRates: stringRates
            });

            expect(stringResult.balanceAtRetirement).toBeCloseTo(numericResult.balanceAtRetirement, 0);
            expect(stringResult.balanceAtEnd).toBeCloseTo(numericResult.balanceAtEnd, 0);
        });

        it('non-numeric string rate falls back to default annual rate', () => {
            const defaultResult = calculateRetirementProjection({
                ...baseInputs,
                annualReturnRate: 5
            });

            // One year has a bad value; should fall back to 5% for that year
            const rates = {};
            for (let y = startYear; y <= startYear + 30; y++) rates[y] = 'bad_value';
            const badRateResult = calculateRetirementProjection({
                ...baseInputs,
                variableRatesEnabled: true,
                variableRates: rates,
                annualReturnRate: 5 // fallback
            });

            // Result should be close to the fixed-rate default (all years use fallback)
            expect(badRateResult.balanceAtRetirement).toBeCloseTo(defaultResult.balanceAtRetirement, 0);
            // Result must not be NaN
            expect(isNaN(badRateResult.balanceAtRetirement)).toBe(false);
            expect(isNaN(badRateResult.balanceAtEnd)).toBe(false);
        });

        it('zero percent variable rate is treated as 0%, not as falsy fallback', () => {
            const rates = {};
            for (let y = startYear; y <= startYear + 30; y++) rates[y] = 0;
            const zeroRateResult = calculateRetirementProjection({
                ...baseInputs,
                variableRatesEnabled: true,
                variableRates: rates,
                annualReturnRate: 5 // must NOT be used — rates explicitly set to 0
            });

            const fixedZeroResult = calculateRetirementProjection({
                ...baseInputs,
                annualReturnRate: 0
            });

            expect(zeroRateResult.balanceAtRetirement).toBeCloseTo(fixedZeroResult.balanceAtRetirement, 0);
        });
    });

    describe('inflation adjustment', () => {
        const thisYear = new Date().getFullYear();

        it('non-numeric variable rate with inflation does not produce NaN balance', () => {
            const rates = {};
            for (let y = thisYear; y <= thisYear + 30; y++) rates[y] = 'bad_value';

            const result = calculateRetirementProjection({
                ...baseInputs,
                annualReturnRate: 5,
                inflationRate: 2,
                variableRatesEnabled: true,
                variableRates: rates
            });

            // Non-numeric entries must not propagate NaN through inflation adjustment
            expect(isNaN(result.balanceAtRetirement)).toBe(false);
            expect(isNaN(result.balanceAtEnd)).toBe(false);
        });

        it('numeric variable rates with inflation are adjusted correctly', () => {
            const rates = {};
            for (let y = thisYear; y <= thisYear + 30; y++) rates[y] = 7;

            const result = calculateRetirementProjection({
                ...baseInputs,
                annualReturnRate: 7,
                inflationRate: 2,
                variableRatesEnabled: true,
                variableRates: rates
            });

            // 7% nominal - 2% inflation = 5% real — should match fixed 5% real
            const fixedRealResult = calculateRetirementProjection({
                ...baseInputs,
                annualReturnRate: 5
            });

            expect(result.balanceAtRetirement).toBeCloseTo(fixedRealResult.balanceAtRetirement, 0);
        });
    });

    describe('step mode parity', () => {
        // Regression: step mode with 0 years (all years at target rate) must produce the same
        // requiredCapitalAtRetirement and surplus as setting that rate as the fixed base rate.
        // Root cause was that requiredCapitalPV used a constant discount rate derived from
        // annualReturnRate even when variable rates were set uniformly to a different value.
        const startYear = new Date().getFullYear();

        it('uniform variable rate produces same requiredCapitalAtRetirement as equivalent fixed rate', () => {
            const TARGET_RATE = 6;
            const BASE_RATE = 5; // deliberately different from target

            // All years at 6% via variable rates (step mode with 0 years at base)
            const rates = {};
            for (let y = startYear; y <= startYear + 50; y++) rates[y] = TARGET_RATE;
            const stepResult = calculateRetirementProjection({
                ...baseInputs,
                annualReturnRate: BASE_RATE,
                variableRatesEnabled: true,
                variableRates: rates
            });

            // 6% set directly as the fixed rate (no variable rates)
            const directResult = calculateRetirementProjection({
                ...baseInputs,
                annualReturnRate: TARGET_RATE,
                variableRatesEnabled: false
            });

            expect(stepResult.balanceAtRetirement).toBeCloseTo(directResult.balanceAtRetirement, 0);
            expect(stepResult.requiredCapitalAtRetirement).toBeCloseTo(directResult.requiredCapitalAtRetirement, 0);
            expect(stepResult.surplus).toBeCloseTo(directResult.surplus, 0);
            expect(stepResult.requiredCapitalForPerpetuity).toBeCloseTo(directResult.requiredCapitalForPerpetuity, 0);
            expect(stepResult.maxSustainableNetWithdrawal).toBeCloseTo(directResult.maxSustainableNetWithdrawal, 0);
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
