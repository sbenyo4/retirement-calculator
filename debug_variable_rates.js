
import { calculateRetirementProjection } from './src/utils/calculator.js';

const currentYear = new Date().getFullYear();

// Mock Inputs
const mockInputs = {
    currentAge: 30,
    retirementStartAge: 32, // 2 years accumulation
    retirementEndAge: 34,   // 2 years retirement
    currentSavings: 100000,
    monthlyContribution: 0,
    monthlyNetIncomeDesired: 1000,
    annualReturnRate: 5, // Base rate
    taxRate: 0,
    variableRatesEnabled: true, // ENABLED
    variableRates: {
        [currentYear]: 50,      // Year 0: +50%
        [currentYear + 1]: -50, // Year 1: -50%
        [currentYear + 2]: 10,  // Year 2: +10%
        [currentYear + 3]: 10   // Year 3: +10%
    }
};

try {
    const result = calculateRetirementProjection(mockInputs);

    console.log("--- Debug Results ---");
    console.log("Start Year:", currentYear);
    console.log("Variable Rates:", mockInputs.variableRates);

    // Check history for first 24 months (Accumulation)
    // Month 12 should recall Year 0 return.
    // Month 24 should reflect Year 1 return.

    const month12 = result.history.find(h => h.month === 12);
    const month24 = result.history.find(h => h.month === 24);

    console.log("Month 12 Balance:", month12.balance); // Should have grown ~50%
    console.log("Month 24 Balance:", month24.balance); // Should have dropped ~50% from M12

    // Expected logic:
    // 100,000 * 1.5 = 150,000 (roughly)
    // 150,000 * 0.5 = 75,000 (roughly)

    if (month12.balance > 140000 && month24.balance < 80000) {
        console.log("SUCCESS: Variable Rates ARE applying.");
    } else {
        console.log("FAILURE: Variable Rates NOT applying correctly.");
        if (Math.abs(month12.balance - 105000) < 1000) {
            console.log("DIAGNOSIS: Appears to be using fixed 5% rate.");
        }
    }

} catch (e) {
    console.error("Error:", e);
}
