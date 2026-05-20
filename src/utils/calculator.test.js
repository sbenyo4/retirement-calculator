import { describe, it, expect } from 'vitest';
import { calculateRetirementProjection } from './calculator';
import { EVENT_TYPES } from '../constants';

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

    describe('yearly income overrides', () => {
        it('uses a changed income amount for the matching retirement year', () => {
            const firstRetirementYear = new Date().getFullYear() + 20;
            const result = calculateRetirementProjection({
                ...baseInputs,
                taxRate: 0,
                yearlyIncomeOverrides: {
                    [firstRetirementYear]: 8000
                }
            });

            expect(result.initialNetWithdrawal).toBeCloseTo(8000, 0);
            expect(result.requiredCapitalAtRetirement).toBeGreaterThan(
                calculateRetirementProjection({ ...baseInputs, taxRate: 0 }).requiredCapitalAtRetirement
            );
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

        it('scenario rates affect retirement statistics even when variable rates toggle is off', () => {
            const retirementYear = startYear + Math.floor(baseInputs.retirementStartAge - baseInputs.currentAge);
            const baseResult = calculateRetirementProjection(baseInputs);
            const scenarioResult = calculateRetirementProjection({
                ...baseInputs,
                variableRatesEnabled: false,
                scenarioEnabled: true,
                scenario: {
                    type: 'crash',
                    startYear: retirementYear,
                    crashDepth: -50,
                    recoveryYears: 1,
                    recoveryShape: 'linear',
                    recoveryMode: 'rate',
                },
            });

            expect(scenarioResult.effectiveRetirementRate).toBeLessThan(baseResult.effectiveRetirementRate);
            expect(scenarioResult.requiredCapitalForPerpetuity).toBeGreaterThan(baseResult.requiredCapitalForPerpetuity);
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

    describe('targetEndBalance parsing', () => {
        it('empty string targetEndBalance is not converted to 0 inside the calculator', () => {
            // Before the fix, parseFloat('') || 0 = 0, making the goal-seek
            // treat every calculation as targeting a 0 end balance.
            // Now targetEndBalance is excluded from numeric parsing.
            const withEmpty = calculateRetirementProjection({ ...baseInputs, targetEndBalance: '' });
            const withoutField = calculateRetirementProjection(baseInputs);
            expect(withEmpty.balanceAtEnd).toBeCloseTo(withoutField.balanceAtEnd, 0);
        });
    });

    describe('totalPrincipal floor', () => {
        it('negative contribution life event does not make totalPrincipal negative', () => {
            // A large negative income change should floor totalPrincipal at 0,
            // preventing profit ratio > 1 and over-taxation.
            const now = new Date();
            const futureDate = { year: now.getFullYear() + 1, month: 1 };
            const result = calculateRetirementProjection({
                ...baseInputs,
                lifeEvents: [{
                    id: '1',
                    enabled: true,
                    type: EVENT_TYPES.INCOME_CHANGE,
                    startDate: futureDate,
                    endDate: null,
                    monthlyChange: -50000, // enormous negative, far exceeds totalPrincipal
                }],
            });
            // If totalPrincipal went negative, the profit ratio would exceed 1
            // and tax would exceed the statutory rate, producing NaN or impossible values.
            // The balance itself can go negative (the drain is intentionally huge),
            // but the result must be a finite number — not NaN.
            expect(isNaN(result.balanceAtRetirement)).toBe(false);
            expect(isFinite(result.balanceAtRetirement)).toBe(true);
        });
    });

    describe('expired life events', () => {
        it('a life event that started and ended before today has no effect on the calculation', () => {
            // Before the fix, getMonthFromDate clamped negative values to 0,
            // making expired events appear active at month 0.
            const now = new Date();
            const pastYear = now.getFullYear() - 3;
            const expiredEvent = {
                id: '1',
                enabled: true,
                type: EVENT_TYPES.EXPENSE_CHANGE,
                startDate: { year: pastYear, month: 1 },
                endDate: { year: pastYear + 1, month: 12 },
                monthlyChange: 5000, // would significantly hurt accumulation if active
            };
            const withExpired = calculateRetirementProjection({
                ...baseInputs,
                lifeEvents: [expiredEvent],
            });
            const withoutEvents = calculateRetirementProjection(baseInputs);
            expect(withExpired.balanceAtRetirement).toBeCloseTo(withoutEvents.balanceAtRetirement, 0);
        });
    });

    describe('one-time expense during accumulation (balance floor)', () => {
        it('balance does not go negative when expense exceeds entire savings', () => {
            const now = new Date();
            const result = calculateRetirementProjection({
                ...baseInputs,
                currentSavings: 1000,
                lifeEvents: [{
                    id: '1',
                    enabled: true,
                    type: EVENT_TYPES.ONE_TIME_EXPENSE,
                    startDate: { year: now.getFullYear() + 1, month: 1 },
                    amount: 9999999, // far exceeds savings
                }],
            });
            // Balance must never be negative — clamped to 0
            expect(result.balanceAtRetirement).toBeGreaterThanOrEqual(0);
            expect(isNaN(result.balanceAtRetirement)).toBe(false);
        });

        it('accumulation history entries never show negative balance after large expense', () => {
            const now = new Date();
            const result = calculateRetirementProjection({
                ...baseInputs,
                currentSavings: 5000,
                lifeEvents: [{
                    id: '1',
                    enabled: true,
                    type: EVENT_TYPES.ONE_TIME_EXPENSE,
                    startDate: { year: now.getFullYear() + 2, month: 1 },
                    amount: 500000,
                }],
            });
            const accumHistory = result.history.filter(h => h.phase === 'accumulation');
            accumHistory.forEach(h => {
                expect(h.balance).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('one-time income during retirement and principal tracking', () => {
        it('one-time income event increases balanceAtEnd by the event amount (minus growth/tax effects)', () => {
            const surplusInputs = {
                ...baseInputs,
                currentSavings: 1000000,
                monthlyNetIncomeDesired: 2000,
            };
            const now = new Date();
            const retirementYear = now.getFullYear() + (surplusInputs.retirementStartAge - surplusInputs.currentAge);
            const midRetirementEvent = {
                id: '1',
                enabled: true,
                type: EVENT_TYPES.ONE_TIME_INCOME,
                startDate: { year: retirementYear + 5, month: 6 },
                amount: 100000,
            };
            const withIncome = calculateRetirementProjection({
                ...surplusInputs,
                lifeEvents: [midRetirementEvent],
            });
            const withoutIncome = calculateRetirementProjection(surplusInputs);
            // The one-time income should increase balanceAtEnd by at least the event amount
            // (it also earns some return between the event and retirement end).
            expect(withIncome.balanceAtEnd).toBeGreaterThan(withoutIncome.balanceAtEnd + 90000);
        });

        it('one-time income treated as cost-basis: profit ratio does not increase after the event', () => {
            // New funds injected as ONE_TIME_INCOME are principal (0% profit),
            // so overall tax burden should not increase disproportionately.
            const now = new Date();
            const retirementYear = now.getFullYear() + (baseInputs.retirementStartAge - baseInputs.currentAge);
            const earlyRetirementEvent = {
                id: '1',
                enabled: true,
                type: EVENT_TYPES.ONE_TIME_INCOME,
                startDate: { year: retirementYear + 1, month: 1 },
                amount: 500000,
            };
            const result = calculateRetirementProjection({
                ...baseInputs,
                lifeEvents: [earlyRetirementEvent],
            });
            // Result should be valid (no NaN / negative balance)
            expect(isNaN(result.balanceAtEnd)).toBe(false);
            expect(result.balanceAtEnd).toBeGreaterThan(0);
        });
    });

    describe('one-time expense during retirement and principal tracking', () => {
        // Use surplus inputs so there is a meaningful balance at end to compare.
        const surplusInputs = {
            ...baseInputs,
            currentSavings: 500000,
            monthlyNetIncomeDesired: 2000,
        };

        it('one-time expense reduces balanceAtEnd by approximately the expense amount', () => {
            const now = new Date();
            const retirementYear = now.getFullYear() + (surplusInputs.retirementStartAge - surplusInputs.currentAge);
            const expenseEvent = {
                id: '1',
                enabled: true,
                type: EVENT_TYPES.ONE_TIME_EXPENSE,
                startDate: { year: retirementYear + 1, month: 6 },
                amount: 50000,
            };
            const without = calculateRetirementProjection(surplusInputs);
            const with_ = calculateRetirementProjection({ ...surplusInputs, lifeEvents: [expenseEvent] });
            // Balance at end should be lower by roughly the expense amount
            // (slightly more due to lost growth on those funds over remaining years)
            expect(without.balanceAtEnd - with_.balanceAtEnd).toBeGreaterThan(40000);
        });

        it('one-time expense does not inflate tax burden (principal reduced proportionally)', () => {
            // If principal is NOT reduced on expense, subsequent withdrawals appear
            // 100% profit (no principal basis), causing inflated tax.
            // With the fix, the profit ratio stays proportional after the expense.
            const now = new Date();
            const retirementYear = now.getFullYear() + (surplusInputs.retirementStartAge - surplusInputs.currentAge);
            const expenseEvent = {
                id: '1',
                enabled: true,
                type: EVENT_TYPES.ONE_TIME_EXPENSE,
                startDate: { year: retirementYear + 1, month: 1 },
                amount: 100000,
            };
            const without = calculateRetirementProjection(surplusInputs);
            const with_ = calculateRetirementProjection({ ...surplusInputs, lifeEvents: [expenseEvent] });

            // Without the principal fix, the profit ratio spikes after the expense
            // (principal stays high, balance drops → apparent profit > real profit → excess tax).
            // Gross-to-net withdrawal ratio should be similar in both runs.
            const withoutRatio = without.averageGrossWithdrawal / without.averageNetWithdrawal;
            const with_Ratio = with_.averageGrossWithdrawal / with_.averageNetWithdrawal;
            expect(Math.abs(withoutRatio - with_Ratio)).toBeLessThan(0.15);
        });
    });

    describe('dynamic withdrawal strategy', () => {
        it('dynamic strategy keeps average withdrawal close to desired when rate matches expectation', () => {
            // With fixed rates, actual annual return ≈ annualReturnRate.
            // The dynamic strategy should NOT systematically drift up or down.
            const result = calculateRetirementProjection({
                ...baseInputs,
                withdrawalStrategy: 'dynamic',
                annualReturnRate: 5,
            });
            // averageNetWithdrawal should be within 30% of monthlyNetIncomeDesired
            expect(result.averageNetWithdrawal).toBeGreaterThan(baseInputs.monthlyNetIncomeDesired * 0.7);
            expect(result.averageNetWithdrawal).toBeLessThan(baseInputs.monthlyNetIncomeDesired * 1.3);
        });

        it('dynamic strategy at low rate (3%) does not systematically cut withdrawals', () => {
            // Before the fix, the expected return was hardcoded at 7%.
            // A 3% actual rate was always below 7% expected → withdrawal decreased every year.
            // After the fix, 3% actual ≈ 3% expected → withdrawal stays near desired level.
            const result = calculateRetirementProjection({
                ...baseInputs,
                withdrawalStrategy: 'dynamic',
                annualReturnRate: 3,
                monthlyNetIncomeDesired: 2000, // small enough to sustain at 3%
            });
            expect(result.averageNetWithdrawal).toBeGreaterThan(1200); // was collapsing toward 80% cap before fix
        });

        it('dynamic strategy at high rate (14%) does not wildly inflate withdrawals', () => {
            // Before the fix: 14% actual >> 7% expected → withdrawal maxed out every year.
            // After the fix: 14% actual ≈ 14% expected → slight upward drift only.
            const resultDynamic = calculateRetirementProjection({
                ...baseInputs,
                withdrawalStrategy: 'dynamic',
                annualReturnRate: 14,
            });
            const resultFixed = calculateRetirementProjection({
                ...baseInputs,
                withdrawalStrategy: 'fixed',
                annualReturnRate: 14,
            });
            // Dynamic withdrawal should not be dramatically higher than the desired withdrawal
            // (before fix it would compound to 1.2x every year → maxed out at 120% cap quickly)
            expect(resultDynamic.averageNetWithdrawal).toBeLessThan(baseInputs.monthlyNetIncomeDesired * 1.4);
            // Dynamic should still outperform fixed slightly (using excess returns)
            expect(resultDynamic.averageNetWithdrawal).toBeGreaterThanOrEqual(resultFixed.averageNetWithdrawal);
        });
    });
});
