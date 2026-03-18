
import { calculateRetirementProjection } from './calculator';
import { WITHDRAWAL_STRATEGIES } from '../constants';

describe('Separate Buckets Strategy', () => {
    const baseInputs = {
        currentAge: 30,
        retirementStartAge: 65,
        retirementEndAge: 90,
        currentSavings: 100000,
        monthlyContribution: 1000,
        monthlyNetIncomeDesired: 5000,
        annualReturnRate: 5, // Default pre-retirement
        taxRate: 0,
        withdrawalStrategy: WITHDRAWAL_STRATEGIES.FIXED
    };

    test('should run without error when buckets enabled', () => {
        const result = calculateRetirementProjection({
            ...baseInputs,
            enableBuckets: true,
            bucketSafeRate: 2,
            bucketSurplusRate: 7
        });
        expect(result).toBeDefined();
        expect(result.history.length).toBeGreaterThan(0);

        // Data check - buckets should be defined in DECUMULATION phase
        const decumulationStart = result.history.find(h => h.phase === 'decumulation');
        if (decumulationStart) {
            expect(decumulationStart.safeBucket).toBeDefined();
            expect(decumulationStart.surplusBucket).toBeDefined();
        }
    });

    test('should accumulate using annualReturnRate (Accumulation Rate) pre-retirement', () => {
        // Run with buckets enabled
        const bucketsResult = calculateRetirementProjection({
            ...baseInputs,
            enableBuckets: true,
            bucketSafeRate: 2,
            bucketSurplusRate: 7
        });

        // Run with buckets disabled but same return rate
        const standardResult = calculateRetirementProjection({
            ...baseInputs,
            enableBuckets: false,
            annualReturnRate: 5
        });

        // Balances at retirement should be identical because bucket rates only apply POST-retirement
        expect(bucketsResult.balanceAtRetirement).toBeCloseTo(standardResult.balanceAtRetirement, 0);
    });

    test('should split capital according to Safe Rate liability calculation', () => {
        // Safe Rate 0% => Liability is just Sum of Withdrawals required
        const result = calculateRetirementProjection({
            ...baseInputs,
            currentAge: 64, // 1 year to retirement
            retirementStartAge: 65,
            retirementEndAge: 66, // 1 year of retirement (12 months)
            monthlyNetIncomeDesired: 1000,
            enableBuckets: true,
            bucketSafeRate: 0, // 0% means simplified math
            bucketSurplusRate: 5
        });

        // 12 months * 1000 = 12000 needed.
        // Discount rate is 0, so PV = 12000.
        // Check if logic detected this.

        // Note: requiredCapitalAtRetirement is the total PV.
        expect(result.requiredCapitalAtRetirement).toBeCloseTo(12000, -1); // Allow small diff for precision
    });

    test('should grow buckets at different rates', () => {
        const result = calculateRetirementProjection({
            ...baseInputs,
            currentAge: 64, // Fix: Must be less than retirement start
            retirementStartAge: 65,
            retirementEndAge: 67, // 2 year retirement
            currentSavings: 1000000, // Large surplus
            monthlyNetIncomeDesired: 1000, // Small need
            enableBuckets: true,
            bucketSafeRate: 0, // Safe bucket shouldn't grow
            bucketSurplusRate: 10 // Surplus should grow fast
        });

        // Find the first and last decumulation records
        const startHist = result.history.find(h => h.phase === 'decumulation');
        const endHist = result.history[result.history.length - 1];

        // Safe bucket starts around 1000 * 24 = 24000
        // Surplus starts around 1000000 - 24000 = 976000

        // Assert Safe Bucket stays roughly same (minus withdrawals) since 0% interest
        // Actually it decreases by withdrawal.

        // Assert Surplus Bucket grows!
        // It has 0 withdrawals (safe bucket covers them).
        // 10% annual growth on ~976k

        expect(endHist.surplusBucket).toBeGreaterThan(startHist.surplusBucket);
        expect(result.surplus).toBeGreaterThan(0);
    });

    test('per-bucket tax: safe-only withdrawals use safe profit ratio, not inflated combined ratio', () => {
        // Setup: $1M savings, 1-year accumulation at 6% → balanceAtRetirement ≈ $1,061,678, all principal $1M.
        // combinedProfitRatio at retirement ≈ 5.81%.
        //
        // bucketSafeRate=0%: safe bucket never grows → its profit ratio stays ≈5.81% via proportional depletion.
        // bucketSurplusRate=20%: surplus explodes → combined profit ratio inflates to 50%+ over 20 years.
        //
        // With CORRECT per-bucket tax:
        //   Every withdrawal comes from safe, taxed at safe's ≈5.81% profit ratio.
        //   grossFactor ≈ 1/(1 - 0.058*0.25) ≈ 1.0147
        //   averageGross/averageNet ≈ 1.015
        //
        // With WRONG blended combined tax (old code):
        //   Withdrawals use the growing combined profit ratio → grossFactor grows toward 1.14+
        //   averageGross/averageNet >> 1.05
        const result = calculateRetirementProjection({
            currentAge: 64,
            retirementStartAge: 65,
            retirementEndAge: 85, // 20 years
            currentSavings: 1000000,
            monthlyContribution: 0,
            monthlyNetIncomeDesired: 800, // pre-pass sizes safe to cover exactly 240 months at safe rate
            annualReturnRate: 6,
            taxRate: 25,
            withdrawalStrategy: WITHDRAWAL_STRATEGIES.FIXED,
            enableBuckets: true,
            bucketSafeRate: 0,    // no growth → profit ratio constant throughout retirement
            bucketSurplusRate: 20 // high growth → would inflate combined ratio, but not per-bucket safe
        });

        // All withdrawals come from safe bucket (surplus is never touched).
        // With per-bucket tax the gross/net ratio stays ≈1.015 every month → average ≈ 1.015.
        // With combined tax (old code) the ratio would have grown to ~1.14 on average.
        const avgGrossNetRatio = result.averageGrossWithdrawal / result.averageNetWithdrawal;
        expect(avgGrossNetRatio).toBeGreaterThan(1.0);   // some tax is paid (profit ratio > 0)
        expect(avgGrossNetRatio).toBeLessThan(1.05);     // taxed at safe-bucket rate, NOT inflated combined
    });

    test('per-bucket tax: zero-tax portfolio pays no tax regardless of bucket rates', () => {
        const result = calculateRetirementProjection({
            ...baseInputs,
            taxRate: 0,
            enableBuckets: true,
            bucketSafeRate: 2,
            bucketSurplusRate: 8
        });
        // With taxRate=0, grossWithdrawal === netWithdrawal every month
        expect(result.initialGrossWithdrawal).toBeCloseTo(result.initialNetWithdrawal, 5);
    });

    test('bucket variable rate NaN guard: non-numeric string falls back to fixed rate', () => {
        const startYear = new Date().getFullYear();
        const safeRates = {};
        const surplusRates = {};
        for (let y = startYear; y <= startYear + 60; y++) {
            safeRates[y] = 'bad_value';
            surplusRates[y] = 'bad_value';
        }

        const result = calculateRetirementProjection({
            ...baseInputs,
            enableBuckets: true,
            bucketSafeRate: 2,
            bucketSurplusRate: 7,
            variableRatesEnabled: true,
            safeVariableRates: safeRates,
            surplusVariableRates: surplusRates
        });

        // Non-numeric rates must fall back to fixed bucket rates — no NaN propagation
        expect(isNaN(result.balanceAtEnd)).toBe(false);
        expect(isNaN(result.balanceAtRetirement)).toBe(false);

        // Result must match a run using fixed rates only (no variable rates)
        const fixedResult = calculateRetirementProjection({
            ...baseInputs,
            enableBuckets: true,
            bucketSafeRate: 2,
            bucketSurplusRate: 7
        });
        expect(result.balanceAtEnd).toBeCloseTo(fixedResult.balanceAtEnd, 0);
    });
});
