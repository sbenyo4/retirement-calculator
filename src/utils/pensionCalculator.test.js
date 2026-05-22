import { describe, it, expect } from 'vitest';
import { calculateCapitalDuration, calculateRetirementIncomeSummary, projectCurrentPensionSource } from './pensionCalculator';

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

describe('projectCurrentPensionSource', () => {
    it('projects an existing pension balance and uses a manual coefficient when present', () => {
        const result = projectCurrentPensionSource({
            id: 'pension-now',
            type: 'pension',
            amount: 0,
            startAge: 70,
            endAge: 90,
            currentAsset: { kind: 'pension', balance: 100_000, coefficient: 200 }
        }, 60, 67, 5);

        expect(result.projectedBalance).toBe(162_889);
        expect(result.appliedCoefficient).toBe(200);
        expect(result.amount).toBe(814);
        expect(result.coefficientCalculated).toBe(false);
        expect(result.isLumpSum).toBe(false);
    });

    it('calculates a pension coefficient from payout ages when no coefficient was entered', () => {
        const result = projectCurrentPensionSource({
            id: 'pension-auto',
            type: 'pension',
            amount: 0,
            startAge: 67,
            endAge: 87,
            currentAsset: { kind: 'pension', balance: 240_000, coefficient: '' }
        }, 67, 67, 0);

        expect(result.appliedCoefficient).toBe(240);
        expect(result.amount).toBe(1_000);
        expect(result.coefficientCalculated).toBe(true);
    });

    it('uses an age-based default coefficient when neither coefficient nor end age were entered', () => {
        const result = projectCurrentPensionSource({
            id: 'pension-age-default',
            type: 'pension',
            amount: 0,
            startAge: 70,
            endAge: null,
            currentAsset: { kind: 'pension', balance: 240_000, coefficient: '' }
        }, 70, 67, 0);

        expect(result.appliedCoefficient).toBe(240);
        expect(result.amount).toBe(1_000);
        expect(result.coefficientCalculated).toBe(true);
    });

    it('uses a source return rate before the pension window default return', () => {
        const result = projectCurrentPensionSource({
            id: 'pension-return',
            type: 'pension',
            amount: 0,
            startAge: 70,
            endAge: 90,
            currentAsset: { kind: 'pension', balance: 100_000, coefficient: 200, returnRate: 3 }
        }, 60, 67, 8);

        expect(result.projectedBalance).toBe(134_392);
        expect(result.appliedReturnRate).toBe(3);
    });

    it('uses the pension window default while a source return rate is blank', () => {
        const result = projectCurrentPensionSource({
            id: 'pension-default-return',
            type: 'pension',
            amount: 0,
            startAge: 70,
            endAge: 90,
            currentAsset: { kind: 'pension', balance: 100_000, coefficient: 200, returnRate: '' }
        }, 60, 67, 6);

        expect(result.projectedBalance).toBe(179_085);
        expect(result.appliedReturnRate).toBe(6);
    });

    it('keeps using the age saved with the current asset data date', () => {
        const result = projectCurrentPensionSource({
            id: 'pension-dated-balance',
            type: 'pension',
            amount: 0,
            startAge: 70,
            endAge: 90,
            currentAsset: {
                kind: 'pension',
                balance: 100_000,
                coefficient: 200,
                returnRate: 5,
                asOfDate: '2026-05-22',
                ageAtDate: 60
            }
        }, 61, 67, 5);

        expect(result.projectedBalance).toBe(162_889);
        expect(result.amount).toBe(814);
    });

    it('projects provident and severance balances as pension-window capital sources', () => {
        const result = projectCurrentPensionSource({
            id: 'provident-now',
            type: 'capital',
            amount: 0,
            startAge: 65,
            endAge: null,
            currentAsset: { kind: 'provident', balance: 50_000 }
        }, 60, 67, 4);

        expect(result.projectedBalance).toBe(60_833);
        expect(result.amount).toBe(60_833);
        expect(result.isLumpSum).toBe(true);
        expect(result.isTaxable).toBe(false);
        expect(result.appliedReturnRate).toBe(4);
    });
});

describe('calculateRetirementIncomeSummary calculated sources', () => {
    it('includes a calculated pension source in income by age immediately', () => {
        const summary = calculateRetirementIncomeSummary({
            incomeSources: [{
                id: 'calculated-pension',
                type: 'pension',
                name: 'Calculated Pension',
                amount: 1_500,
                startAge: '67',
                endAge: 87,
                isTaxable: true,
                enabled: true,
                calculated: true
            }],
            retirementStartAge: 50,
            retirementEndAge: 67,
            capital: 0,
            monthlyExpenses: 5_000,
            capitalReturnRate: 0
        });

        expect(summary.milestones[0].age).toBe(67);
        expect(summary.milestones[0].income.totalGross).toBe(1_500);
        expect(summary.milestones[0].income.sources.map(source => source.id)).toContain('calculated-pension');
        expect(summary.milestones.filter(milestone => milestone.age === 67)).toHaveLength(1);
    });

    it('respects national insurance source start and end ages', () => {
        const summary = calculateRetirementIncomeSummary({
            incomeSources: [{
                id: 'ni-window',
                type: 'nationalInsurance',
                name: 'NI',
                amount: 2_000,
                startAge: 70,
                endAge: 72,
                isTaxable: false,
                enabled: true
            }],
            retirementStartAge: 67,
            retirementEndAge: 67,
            capital: 0,
            monthlyExpenses: 5_000,
            capitalReturnRate: 0,
            parameters: { familyStatus: 'single', ignoreIncomeTest: true }
        });

        expect(summary.milestones.find(milestone => milestone.age === 67).income.sources).toEqual([]);
        expect(summary.milestones.find(milestone => milestone.age === 70).income.sources.map(source => source.id)).toContain('ni-window');
        expect(summary.milestones.find(milestone => milestone.age === 72).income.sources).toEqual([]);
    });
});
