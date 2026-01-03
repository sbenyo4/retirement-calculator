
import { calculateRetirementProjection } from './src/utils/calculator.js';

// Mock Constants
const EVENT_TYPES = {
    ONE_TIME_INCOME: 'one_time_income',
    ONE_TIME_EXPENSE: 'one_time_expense',
    INCOME_CHANGE: 'income_change',
    EXPENSE_CHANGE: 'expense_change'
};

const currentYear = new Date().getFullYear();

// Mock Inputs: Retirement starts in 1 year, lasts 5 years (short for clarity)
// Event: +10,000 Income for 6 months only, overlapping retirement start.
const mockInputs = {
    currentAge: 60,
    retirementStartAge: 61,
    retirementEndAge: 66,
    currentSavings: 1000000,
    monthlyContribution: 0,
    monthlyNetIncomeDesired: 10000,
    annualReturnRate: 5,
    taxRate: 0,
    variableRatesEnabled: false,
    lifeEvents: [
        {
            id: 'evt1',
            type: 'income_change', // Recurring income
            name: 'Unemployment',
            amount: 0, // Using monthlyChange
            monthlyChange: 10000,
            enabled: true,
            // Starts in 6 months (during accumulation)
            startDate: { year: currentYear, month: new Date().getMonth() + 7 },
            // Ends 6 months after that (just after retirement start)
            endDate: { year: currentYear + 1, month: new Date().getMonth() + 1 }
        }
    ]
};

// Alternative Scenario: Event starts exactly at retirement and lasts 6 months
const mockInputs2 = {
    ...mockInputs,
    lifeEvents: [
        {
            id: 'evt1',
            type: 'income_change',
            name: 'Short Gig',
            monthlyChange: 10000, // Covers the full 10,000 need
            enabled: true,
            startDate: { year: currentYear + 1, month: 1 },
            endDate: { year: currentYear + 1, month: 6 } // 6 months duration
        }
    ]
};

try {
    console.log("--- DEBUG RUN ---");
    const result = calculateRetirementProjection(mockInputs2);

    console.log(`Initial Gross: ${result.initialGrossWithdrawal}`);
    console.log(`Initial Net: ${result.initialNetWithdrawal}`);
    console.log(`Avg Gross: ${result.averageGrossWithdrawal}`);
    console.log(`Avg Net: ${result.averageNetWithdrawal}`);

    // Check monthly breakdown
    console.log("\nMonth-by-Month Withdrawal:");
    const retirementHistory = result.history.filter(h => h.phase === 'decumulation');

    // Log first 12 months
    retirementHistory.slice(0, 12).forEach(h => {
        console.log(`Month ${h.month} (Age ${h.age.toFixed(2)}): Withdrawal=${h.withdrawal.toFixed(0)}`);
    });

} catch (e) {
    console.error("Error:", e);
}
