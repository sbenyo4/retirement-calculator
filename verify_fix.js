
import { calculateRetirementProjection } from './src/utils/calculator.js';

const inputs = {
    currentAge: 51.77,
    retirementStartAge: 55,
    retirementEndAge: 65,
    currentSavings: 2600000,
    monthlyContribution: 16000,
    monthlyNetIncomeDesired: 14000,
    annualReturnRate: 6,
    taxRate: 25
};

const result = calculateRetirementProjection(inputs);

console.log("Balance at Retirement:", result.balanceAtRetirement);
console.log("Required Capital:", result.requiredCapitalAtRetirement);
console.log("Surplus:", result.surplus);
console.log("Balance at End:", result.balanceAtEnd);

// Expected
const monthlyRate = inputs.annualReturnRate / 100 / 12;
const taxRateDecimal = inputs.taxRate / 100;
const effectiveMonthlyRate = monthlyRate * (1 - taxRateDecimal);
const monthsInRetirement = (inputs.retirementEndAge - inputs.retirementStartAge) * 12;
const expectedBalanceAtEnd = result.surplus * Math.pow(1 + monthlyRate, monthsInRetirement);

console.log("Expected Balance at End:", expectedBalanceAtEnd);
console.log("Match:", Math.abs(result.balanceAtEnd - expectedBalanceAtEnd) < 0.01);
