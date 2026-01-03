
import { calculateRetirementProjection } from './src/utils/calculator.js';

const currentYear = 2026; // Simulating 2026 as "Now"

const mockInputs = {
    currentAge: 60,
    retirementStartAge: 63, // Retires in 3 years (2029)
    retirementEndAge: 83,
    currentSavings: 1000000,
    monthlyContribution: 0,
    monthlyNetIncomeDesired: 10000,
    annualReturnRate: 5,
    taxRate: 0,
    variableRatesEnabled: false,
    lifeEvents: [
        {
            id: 'evt1',
            type: 'income_change',
            name: 'Unemployment',
            amount: 0,
            monthlyChange: 10000,
            enabled: true,
            // Start March 2027 (Year +1, Month 3)
            startDate: { year: currentYear + 1, month: 3 },
            // End Sept 2027 (Year +1, Month 9)
            endDate: { year: currentYear + 1, month: 9 }
        }
    ]
};

try {
    console.log("--- DEBUG REPRO RUN ---");
    const result = calculateRetirementProjection(mockInputs);

    // Check first month of retirement (Year 2029 -> Month 37 approx)
    const retirementHistory = result.history.filter(h => h.phase === 'decumulation');
    const firstMonth = retirementHistory[0];

    console.log(`First Retirement Month (${firstMonth.month}): Net Withdrawal = ${firstMonth.withdrawal}`);

    if (firstMonth.withdrawal < 5000) {
        console.log("FAILURE: Net Withdrawal is abnormally low (~0). Income adjustment persists!");
    } else {
        console.log("SUCCESS: Net Withdrawal is normal (~10000). Event was cleared.");
    }

    console.log(`Initial Gross: ${result.initialGrossWithdrawal}`);
    console.log(`Avg Net: ${result.averageNetWithdrawal}`);

} catch (e) {
    console.error("Error:", e);
}
