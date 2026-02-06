
import { calculateRetirementProjection } from './src/utils/calculator.js';

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

console.log('--- DEBUG START ---');

// Test 2: Tax Check
console.log('\nRunning Tax Check...');
const noTaxResult = calculateRetirementProjection({
    ...baseInputs,
    taxRate: 0
});
const withTaxResult = calculateRetirementProjection({
    ...baseInputs,
    taxRate: 25
});

console.log('Balance No Tax:', noTaxResult.balanceAtEnd);
console.log('Balance With Tax:', withTaxResult.balanceAtEnd);
console.log('Balance At Retirement (No Tax):', noTaxResult.balanceAtRetirement);
console.log('Balance At Retirement (With Tax):', withTaxResult.balanceAtRetirement);
console.log('Diff:', noTaxResult.balanceAtEnd - withTaxResult.balanceAtEnd);

if (withTaxResult.balanceAtEnd < noTaxResult.balanceAtEnd) {
    console.log('PASS: Tax reduced balance.');
} else {
    console.log('FAIL: Tax did NOT reduce balance.');
}

// Test 1: Buckets Check
console.log('\nRunning Buckets Check...');
const noBucketsResult = calculateRetirementProjection({
    ...baseInputs,
    enableBuckets: false
});

const bucketsResult = calculateRetirementProjection({
    ...baseInputs,
    enableBuckets: true,
    bucketSafeRate: 6,
    bucketSurplusRate: 6
});

console.log('No Buckets End Balance:', noBucketsResult.balanceAtEnd);
console.log('Buckets End Balance:', bucketsResult.balanceAtEnd);
const diff = Math.abs(bucketsResult.balanceAtEnd - noBucketsResult.balanceAtEnd);
const diffPercent = (diff / noBucketsResult.balanceAtEnd) * 100;
console.log(`Diff: ${diff} (${diffPercent.toFixed(4)}%)`);

if (diffPercent < 5) {
    console.log('PASS: Difference < 5%');
} else {
    console.log('FAIL: Difference > 5%');
}

// Test 3: Return Rate Check
console.log('\nRunning Return Rate Check...');
const lowReturnResult = calculateRetirementProjection({
    ...baseInputs,
    annualReturnRate: 4
});
const highReturnResult = calculateRetirementProjection({
    ...baseInputs,
    annualReturnRate: 8
});

console.log('Low Return (4%) End Balance:', lowReturnResult.balanceAtEnd);
console.log('High Return (8%) End Balance:', highReturnResult.balanceAtEnd);

if (highReturnResult.balanceAtEnd > lowReturnResult.balanceAtEnd) {
    console.log('PASS: Higher return -> Higher balance');
} else {
    console.log('FAIL: Higher return did NOT -> Higher balance');
}
