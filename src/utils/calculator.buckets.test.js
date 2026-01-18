
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
        const retirementDurationYears = 2;
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
});
