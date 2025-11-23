
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

    // --- PV of Deficit Calculation ---
    // How much needed TODAY to cover the deficit at retirement?
    // PV = FV / (1 + r)^n
    let pvOfDeficit = 0;
    const surplus = balanceAtRetirement - requiredCapitalAtRetirement;

    if (surplus < 0) {
        // We need to cover the deficit amount
        const deficitAmount = Math.abs(surplus);
        // Discount it back to today using the monthly rate
        if (monthlyRate > 0) {
            pvOfDeficit = deficitAmount / Math.pow(1 + monthlyRate, monthsToRetirement);
        } else {
            pvOfDeficit = deficitAmount;
        }
    }

    // --- PV of Capital Preservation Calculation ---
    // How much needed TODAY to reach the required capital for perpetuity at retirement?
    // We need to account for the fact that we are also contributing monthly.
    // FV_needed = RequiredCapitalForPerpetuity
    // FV_current_savings = CurrentSavings * (1+r)^n
    // FV_contributions = PMT * ((1+r)^n - 1) / r
    // Total FV = FV_current_savings + FV_contributions
    // Shortfall = FV_needed - Total FV
    // PV_Shortfall = Shortfall / (1+r)^n
    // Needed Today = Current Savings + PV_Shortfall (if Shortfall > 0)
    // Or simply: PV_needed = (RequiredCapitalForPerpetuity - FV_contributions) / (1+r)^n
    // If PV_needed < 0, it means contributions alone are enough (or too much), so needed today is 0 (or negative surplus).
    // However, the user wants "Needed Today" to replace Current Savings.
    // So we want to find X such that:
    // X * (1+r)^n + FV_contributions = RequiredCapitalForPerpetuity
    // X * (1+r)^n = RequiredCapitalForPerpetuity - FV_contributions
    // X = (RequiredCapitalForPerpetuity - FV_contributions) / (1+r)^n

    let pvOfCapitalPreservation = 0;
    if (monthlyRate > 0) {
        const fvContributions = monthlyContribution * (Math.pow(1 + monthlyRate, monthsToRetirement) - 1) / monthlyRate;
        pvOfCapitalPreservation = (requiredCapitalForPerpetuity - fvContributions) / Math.pow(1 + monthlyRate, monthsToRetirement);
    } else {
        const fvContributions = monthlyContribution * monthsToRetirement;
        pvOfCapitalPreservation = requiredCapitalForPerpetuity - fvContributions;
    }

    // If negative, it means contributions cover it all and we don't need any starting capital (actually we have surplus capacity)
    // But for the "Needed Today" display, we usually show the positive amount required. 
    // If it's negative, it implies 0 is needed today (and we can even reduce contributions).
    // Let's keep the raw number for now, but in UI we might want to handle negative differently if needed.
    // For the copy button, if it's negative, setting savings to negative doesn't make sense. 
    // But the math X is correct for "what should be in the bank today".

    return {
        history,
        balanceAtRetirement,
        balanceAtEnd: Math.max(0, retirementBalance),
        ranOutAtAge,
        requiredCapitalAtRetirement,
        requiredCapitalForPerpetuity,
        surplus,
        pvOfDeficit,
        pvOfCapitalPreservation,
        initialGrossWithdrawal
    };
}
