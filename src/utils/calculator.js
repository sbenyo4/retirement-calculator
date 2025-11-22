
/**
 * Calculates the future value and required capital for retirement.
 * 
 * @param {Object} inputs
 * @param {number} inputs.currentAge
 * @param {number} inputs.retirementStartAge
 * @param {number} inputs.retirementEndAge
 * @param {number} inputs.currentSavings
 * @param {number} inputs.monthlyContribution
 * @param {number} inputs.monthlyNetIncomeDesired
 * @param {number} inputs.annualReturnRate (percentage, e.g., 7 for 7%)
 * @param {number} inputs.taxRate (percentage, e.g., 25 for 25%)
 * @returns {Object} result
 */
export function calculateRetirementProjection(inputs) {
    const {
        currentAge,
        retirementStartAge,
        retirementEndAge,
        currentSavings,
        monthlyContribution,
        monthlyNetIncomeDesired,
        annualReturnRate,
        taxRate
    } = Object.fromEntries(
        Object.entries(inputs).map(([k, v]) => [k, parseFloat(v) || 0])
    );

    const monthlyRate = annualReturnRate / 100 / 12;
    const taxRateDecimal = taxRate / 100;

    const monthsToRetirement = (retirementStartAge - currentAge) * 12;
    const monthsInRetirement = (retirementEndAge - retirementStartAge) * 12;

    // --- Phase 1: Accumulation (Now -> Retirement Start) ---
    let balance = currentSavings;
    let totalPrincipal = currentSavings; // Track principal for tax basis
    let history = [];
    let currentMonth = 0;

    // Initial state
    history.push({
        month: 0,
        age: currentAge,
        balance: balance,
        phase: 'accumulation'
    });

    for (let i = 1; i <= monthsToRetirement; i++) {
        // Interest
        const interest = balance * monthlyRate;
        balance += interest;

        // Contribution
        balance += monthlyContribution;
        totalPrincipal += monthlyContribution;

        currentMonth++;
        if (i % 12 === 0) { // Record yearly for chart data to keep it clean, or monthly? Let's do monthly but maybe filter for UI
            history.push({
                month: currentMonth,
                age: currentAge + (i / 12),
                balance: balance,
                phase: 'accumulation'
            });
        }
    }

    const balanceAtRetirement = balance;
    const principalAtRetirement = totalPrincipal;

    // --- Phase 2: Decumulation (Retirement Start -> Retirement End) ---
    // User Defined Logic:
    // 1. Calculate Monthly Interest.
    // 2. Tax = Monthly Interest * Tax Rate.
    // 3. Gross Withdrawal = Net Income + Tax.
    // 4. Balance = Balance + Interest - Gross Withdrawal.

    let retirementBalance = balanceAtRetirement;
    let ranOutAtAge = null;
    let initialGrossWithdrawal = 0;

    for (let i = 1; i <= monthsInRetirement; i++) {
        const interest = retirementBalance * monthlyRate;
        const tax = interest * taxRateDecimal;

        let grossWithdrawal = monthlyNetIncomeDesired + tax;

        if (i === 1) {
            initialGrossWithdrawal = grossWithdrawal;
        }

        // Check if we have enough money
        // Note: We add interest first, then withdraw.
        // If (Balance + Interest) < GrossWithdrawal, we are bankrupt.
        if (retirementBalance + interest < grossWithdrawal) {
            grossWithdrawal = retirementBalance + interest; // Take what's left
            if (ranOutAtAge === null) {
                ranOutAtAge = retirementStartAge + (i / 12);
            }
        }

        retirementBalance = retirementBalance + interest - grossWithdrawal;

        currentMonth++;
        if (i % 12 === 0 || retirementBalance <= 0) {
            history.push({
                month: currentMonth,
                age: retirementStartAge + (i / 12),
                balance: Math.max(0, retirementBalance),
                phase: 'decumulation'
            });
        }

        if (retirementBalance <= 0) {
            retirementBalance = 0;
            break;
        }
    }

    // --- Phase 3: Required Capital Calculation ---
    // We need to find the starting capital (at retirement age) that results in 0 balance at end age.
    // Using the new logic:
    // Balance(i) = Balance(i-1) * (1 + Rate) - (Net + Balance(i-1)*Rate*TaxRate)
    // Balance(i) = Balance(i-1) * (1 + Rate - Rate*TaxRate) - Net
    // Balance(i) = Balance(i-1) * (1 + Rate * (1 - TaxRate)) - Net
    // This is a standard annuity formula with an effective rate = Rate * (1 - TaxRate).

    const effectiveMonthlyRate = monthlyRate * (1 - taxRateDecimal);

    // PV of Annuity Formula: PV = PMT * (1 - (1 + r)^-n) / r
    let requiredCapitalAtRetirement = 0;
    if (effectiveMonthlyRate > 0) {
        requiredCapitalAtRetirement = monthlyNetIncomeDesired * (1 - Math.pow(1 + effectiveMonthlyRate, -monthsInRetirement)) / effectiveMonthlyRate;
    } else {
        requiredCapitalAtRetirement = monthlyNetIncomeDesired * monthsInRetirement;
    }

    // --- Capital Preservation Calculation ---
    // Required Capital = Net Income / (Monthly Rate * (1 - Tax Rate))
    // This assumes you live off the interest AFTER tax, keeping principal intact.
    let requiredCapitalForPerpetuity = 0;
    if (effectiveMonthlyRate > 0) {
        requiredCapitalForPerpetuity = monthlyNetIncomeDesired / effectiveMonthlyRate;
    }

    return {
        history,
        balanceAtRetirement,
        balanceAtEnd: Math.max(0, retirementBalance),
        ranOutAtAge,
        requiredCapitalAtRetirement,
        requiredCapitalForPerpetuity,
        surplus: balanceAtRetirement - requiredCapitalAtRetirement,
        initialGrossWithdrawal
    };
}
