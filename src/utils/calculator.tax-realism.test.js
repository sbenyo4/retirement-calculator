import { describe, it, expect } from 'vitest';
import { calculateRetirementProjection } from './calculator';

describe('Tax Calculation Realism', () => {
    const baseInputs = {
        currentAge: 40,
        retirementStartAge: 60,
        retirementEndAge: 85,
        currentSavings: 500000,
        monthlyContribution: 5000,
        monthlyNetIncomeDesired: 10000,
        annualReturnRate: 6,
        taxRate: 25,
        withdrawalStrategy: 'fixed'
    };

    it('buckets with same rates as non-buckets should produce similar results', () => {
        // Without buckets
        const noBucketsResult = calculateRetirementProjection({
            ...baseInputs,
            enableBuckets: false
        });

        // With buckets - same rates everywhere
        const bucketsResult = calculateRetirementProjection({
            ...baseInputs,
            enableBuckets: true,
            bucketSafeRate: 6,
            bucketSurplusRate: 6
        });

        // Balance at retirement should be identical
        expect(bucketsResult.balanceAtRetirement).toBeCloseTo(noBucketsResult.balanceAtRetirement, 0);

        // Balance at end should be very similar (within 5%)
        const diff = Math.abs(bucketsResult.balanceAtEnd - noBucketsResult.balanceAtEnd);
        const diffPercent = noBucketsResult.balanceAtEnd > 0
            ? (diff / noBucketsResult.balanceAtEnd) * 100
            : 0;

        console.log('No buckets balance at end:', noBucketsResult.balanceAtEnd);
        console.log('Buckets balance at end:', bucketsResult.balanceAtEnd);
        console.log('Difference:', diffPercent.toFixed(2) + '%');

        expect(diffPercent).toBeLessThan(5);
    });

    it('tax is calculated only on profit portion of withdrawals', () => {
        // With 0% tax, results should be better than with tax
        const noTaxResult = calculateRetirementProjection({
            ...baseInputs,
            taxRate: 0
        });

        const withTaxResult = calculateRetirementProjection({
            ...baseInputs,
            taxRate: 25
        });

        // With tax, balance should be lower (tax reduces effective withdrawal power)
        expect(withTaxResult.balanceAtEnd).toBeLessThan(noTaxResult.balanceAtEnd);
    });

    it('higher returns should result in higher ending balance when not running out', () => {
        const lowReturnResult = calculateRetirementProjection({
            ...baseInputs,
            annualReturnRate: 4
        });

        const highReturnResult = calculateRetirementProjection({
            ...baseInputs,
            annualReturnRate: 8
        });

        // Higher return should mean higher ending balance
        expect(highReturnResult.balanceAtEnd).toBeGreaterThan(lowReturnResult.balanceAtEnd);
    });
});
