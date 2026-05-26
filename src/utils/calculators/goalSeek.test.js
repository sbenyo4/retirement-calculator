import { describe, expect, it } from 'vitest';
import { calculateRetirementProjection } from '../calculator';
import {
    findGoalSeekResultForTargetEndBalance,
    findMonthlyWithdrawalForTargetEndBalance,
    runProjectionWithGoalSeek
} from './goalSeek';

describe('goal seek target end balance', () => {
    const baseInputs = {
        currentAge: 30,
        retirementStartAge: 50,
        retirementEndAge: 70,
        currentSavings: 500000,
        monthlyContribution: 5000,
        monthlyNetIncomeDesired: 10000,
        annualReturnRate: 5,
        taxRate: 25,
        withdrawalStrategy: 'fixed',
    };

    it('returns an income that reproduces the same final balance when entered directly', () => {
        const inputs = {
            ...baseInputs,
            targetEndBalance: '1000000',
        };

        const { projection, goalSeekWithdrawal } = runProjectionWithGoalSeek(inputs);
        const direct = calculateRetirementProjection({
            ...inputs,
            targetEndBalance: '',
            monthlyNetIncomeDesired: goalSeekWithdrawal,
        });

        expect(goalSeekWithdrawal).toBeGreaterThan(0);
        expect(direct.balanceAtEnd).toBe(projection.balanceAtEnd);
    });

    it('uses the same solver for chart-style target balance lookups', () => {
        const targetEndBalance = 750000;
        const withdrawal = findMonthlyWithdrawalForTargetEndBalance(baseInputs, targetEndBalance);
        const direct = calculateRetirementProjection({
            ...baseInputs,
            monthlyNetIncomeDesired: withdrawal,
            targetEndBalance: '',
        });

        const lower = calculateRetirementProjection({
            ...baseInputs,
            monthlyNetIncomeDesired: withdrawal - 1,
            targetEndBalance: '',
        });
        const higher = calculateRetirementProjection({
            ...baseInputs,
            monthlyNetIncomeDesired: withdrawal + 1,
            targetEndBalance: '',
        });

        expect(Math.abs(direct.balanceAtEnd - targetEndBalance)).toBeLessThanOrEqual(
            Math.abs(lower.balanceAtEnd - targetEndBalance)
        );
        expect(Math.abs(direct.balanceAtEnd - targetEndBalance)).toBeLessThanOrEqual(
            Math.abs(higher.balanceAtEnd - targetEndBalance)
        );
    });

    it('expands the search range above the old fixed chart cap', () => {
        const largePortfolioInputs = {
            ...baseInputs,
            currentAge: 60,
            retirementStartAge: 61,
            retirementEndAge: 62,
            currentSavings: 100000000,
            monthlyContribution: 0,
            monthlyNetIncomeDesired: 1000,
            annualReturnRate: 0,
            taxRate: 0,
        };

        const withdrawal = findMonthlyWithdrawalForTargetEndBalance(largePortfolioInputs, 0);
        const direct = calculateRetirementProjection({
            ...largePortfolioInputs,
            monthlyNetIncomeDesired: withdrawal,
            targetEndBalance: '',
        });

        expect(withdrawal).toBeGreaterThan(100000);
        expect(direct.balanceAtEnd).toBeCloseTo(0, 0);
    });

    it('reports effective average withdrawal separately when yearly income overrides are active', () => {
        const retirementYear = new Date().getFullYear() + 20;
        const inputs = {
            ...baseInputs,
            monthlyNetIncomeDesired: 14000,
            yearlyIncomeOverrides: {
                [retirementYear]: 6000,
                [retirementYear + 1]: 8000,
                [retirementYear + 2]: 10000,
                [retirementYear + 3]: 12000,
                [retirementYear + 4]: 14000,
                [retirementYear + 5]: 16000,
            },
            targetEndBalance: '6500000',
        };

        const { projection, goalSeekWithdrawal } = runProjectionWithGoalSeek(inputs);
        const seekResult = findGoalSeekResultForTargetEndBalance(inputs, inputs.targetEndBalance);

        expect(projection.goalSeekBaseWithdrawal).toBe(goalSeekWithdrawal);
        expect(projection.goalSeekEffectiveWithdrawal).toBe(seekResult.effectiveWithdrawal);
        expect(projection.goalSeekEffectiveWithdrawal).toBeCloseTo(projection.averageNetWithdrawal, 0);
        expect(projection.goalSeekEffectiveWithdrawal).not.toBe(projection.goalSeekBaseWithdrawal);
        expect(Math.abs(projection.balanceAtEnd - parseFloat(inputs.targetEndBalance))).toBeLessThan(200);
    });
});
