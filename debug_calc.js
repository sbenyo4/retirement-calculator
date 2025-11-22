
import { calculateRetirementProjection } from './src/utils/calculator.js';

const inputs = {
    currentAge: 51,
    retirementStartAge: 55,
    retirementEndAge: 67,
    currentSavings: 0,
    monthlyContribution: 13000,
    monthlyNetIncomeDesired: 15000,
    annualReturnRate: 6,
    taxRate: 25
};

console.log("Inputs:", inputs);

const result = calculateRetirementProjection(inputs);

console.log("\n--- Results ---");
console.log("Balance at Retirement:", result.balanceAtRetirement);
// We need to see the principal at retirement to calculate the ratio manually for explanation
// The function doesn't return principalAtRetirement directly in the result object, 
// but we can infer it or modify the function temporarily. 
// Actually, let's just re-implement the accumulation phase here quickly to get the exact numbers for the explanation.

const monthlyRate = inputs.annualReturnRate / 100 / 12;
const monthsToRetirement = (inputs.retirementStartAge - inputs.currentAge) * 12;

let balance = inputs.currentSavings;
let principal = inputs.currentSavings;

for (let i = 1; i <= monthsToRetirement; i++) {
    balance += balance * monthlyRate;
    balance += inputs.monthlyContribution;
    principal += inputs.monthlyContribution;
}

console.log("Calculated Balance at Retirement:", balance);
console.log("Calculated Principal at Retirement:", principal);

const gains = balance - principal;
const gainRatio = gains / balance;

console.log("Gains:", gains);
console.log("Gain Ratio:", gainRatio);

const taxRateDecimal = inputs.taxRate / 100;
const effectiveTaxRate = gainRatio * taxRateDecimal;

console.log("Effective Tax Rate (Gain Ratio * Tax Rate):", effectiveTaxRate);

const grossWithdrawal = inputs.monthlyNetIncomeDesired / (1 - effectiveTaxRate);

console.log("Calculated Gross Withdrawal:", grossWithdrawal);
console.log("Result from Function:", result.initialGrossWithdrawal);
