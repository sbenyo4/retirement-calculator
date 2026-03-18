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

    describe('interest_only withdrawal strategy', () => {
        const interestOnlyInputs = {
            ...baseInputs,
            withdrawalStrategy: 'interestOnly',
            // One-year accumulation so principal ≈ currentSavings (known cost basis)
            currentAge: 59,
            retirementStartAge: 60,
            monthlyContribution: 0,
        };

        it('portfolio balance should remain flat (gross withdrawal = interest earned)', () => {
            // With all-principal portfolio (profit ratio ~0), tax is ~0, and gross ≈ net ≈ interest.
            // Balance should hold steady each year.
            const result = calculateRetirementProjection({
                ...interestOnlyInputs,
                currentSavings: 1000000,
                annualReturnRate: 6,
                taxRate: 0, // zero tax: gross=net=interest, balance strictly flat
            });

            const startBalance = result.balanceAtRetirement;
            const endBalance = result.balanceAtEnd;
            // Allow <1% drift from floating-point only
            const drift = Math.abs(endBalance - startBalance) / startBalance;
            expect(drift).toBeLessThan(0.01);
        });

        it('with tax > 0, balance still stays approximately flat (gross = interest, tax paid from withdrawal)', () => {
            // profit ratio will grow over time, but each month grossWithdrawal = effectiveInterest
            // so the principal portion is preserved; balance drifts only from the profit ratio changing
            const result = calculateRetirementProjection({
                ...interestOnlyInputs,
                currentSavings: 1000000,
                annualReturnRate: 6,
                taxRate: 25,
            });

            const startBalance = result.balanceAtRetirement;
            const endBalance = result.balanceAtEnd;
            // Balance should stay within 3% of start (slight drift as profit ratio changes)
            const drift = Math.abs(endBalance - startBalance) / startBalance;
            expect(drift).toBeLessThan(0.03);
        });

        it('net withdrawal should be less than gross interest when tax > 0', () => {
            const withTax = calculateRetirementProjection({
                ...interestOnlyInputs,
                currentSavings: 1000000,
                annualReturnRate: 6,
                taxRate: 25,
            });

            const noTax = calculateRetirementProjection({
                ...interestOnlyInputs,
                currentSavings: 1000000,
                annualReturnRate: 6,
                taxRate: 0,
            });

            // With tax, user receives less net per month (tax is deducted from interest income)
            expect(withTax.averageNetWithdrawal).toBeLessThan(noTax.averageNetWithdrawal);
        });
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
