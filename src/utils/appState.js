/**
 * Reads the current application state from the sessionStorage data bus.
 * Written by App.jsx (rc-calc-summary) and BudgetPlanner (rc-budget-summary).
 * Consumed by smart alerts evaluation and the settings panel.
 */
export function readAppState() {
    try {
        const budget = JSON.parse(sessionStorage.getItem('rc-budget-summary') || '{}');
        const calc = JSON.parse(sessionStorage.getItem('rc-calc-summary') || '{}');
        const categoryTotals = {};
        (budget.categories || []).forEach(c => {
            // Match by labelHe/labelEn — categoryId isn't stored in summary
            if (c.labelHe) categoryTotals[c.labelHe] = c.total;
            if (c.labelEn) categoryTotals[c.labelEn] = c.total;
        });
        return {
            // Budget
            totalMonthly: budget.totalMonthly || 0,
            totalAnnual: budget.totalAnnual || 0,
            target: budget.incomeTarget || 0,
            budgetGap: budget.gap ?? null,
            householdSize: budget.householdSize ?? null,
            perPerson: budget.perPerson ?? null,
            inflationRate: budget.inflation?.rate ?? null,
            inflationProjectedMonthly: budget.inflation?.projectedMonthly ?? null,
            categoryTotals,
            loanTracks: budget.loanTracks || [],
            // Calculation results
            balanceAtRetirement: calc.balanceAtRetirement ?? null,
            balanceAtEnd: calc.balanceAtEnd ?? null,
            surplus: calc.surplus ?? null,
            pvOfDeficit: calc.pvOfDeficit ?? null,
            pvOfCapitalPreservation: calc.pvOfCapitalPreservation ?? null,
            ranOutAtAge: calc.ranOutAtAge ?? null,
            requiredCapitalAtRetirement: calc.requiredCapitalAtRetirement ?? null,
            requiredCapitalForPerpetuity: calc.requiredCapitalForPerpetuity ?? null,
            initialNetWithdrawal: calc.initialNetWithdrawal ?? null,
            averageNetWithdrawal: calc.averageNetWithdrawal ?? null,
            maxSustainableNetWithdrawal: calc.maxSustainableNetWithdrawal ?? null,
            // Pension
            pensionGrossAtNI: calc.pensionGrossAtNI ?? null,
            pensionNetAtNI: calc.pensionNetAtNI ?? null,
            pensionNonWorkAtNI: calc.pensionNonWorkAtNI ?? null,
            niThreshold: calc.niThreshold ?? null,
            // Inputs
            monthlyNetIncomeDesired: calc.monthlyNetIncomeDesired || 0,
            retirementStartAge: calc.retirementStartAge || null,
            retirementEndAge: calc.retirementEndAge || null,
            currentAge: calc.currentAge || null,
            monthlyContribution: calc.monthlyContribution || 0,
            retirementDate: calc.retirementDate || null,
        };
    } catch {
        return { totalMonthly: 0, target: 0, categoryTotals: {}, loanTracks: [] };
    }
}
