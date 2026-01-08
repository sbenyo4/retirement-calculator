
/**
 * Calculates auxiliary statistics after the main simulation.
 */
export function calculateStatistics({
    balanceAtRetirement,
    requiredCapitalAtRetirement,
    monthlyNetIncomeDesired,
    monthlyContribution,
    annualReturnRate,
    taxRateDecimal,
    monthsToRetirement,
    monthsInRetirement,
    accumulatedWithdrawals,
    totalNetWithdrawal
}) {
    // 1. Capital Preservation (Perpetuity)
    const effectiveMonthlyRate = (annualReturnRate / 100 / 12) * (1 - taxRateDecimal);

    let requiredCapitalForPerpetuity = 0;
    if (effectiveMonthlyRate > 0) {
        requiredCapitalForPerpetuity = monthlyNetIncomeDesired / effectiveMonthlyRate;
    }

    // 2. PV of Deficit
    let pvOfDeficit = 0;
    const surplus = balanceAtRetirement - requiredCapitalAtRetirement;

    if (surplus < 0) {
        const deficitAmount = Math.abs(surplus);
        const currentMonthlyRate = annualReturnRate / 100 / 12;
        if (currentMonthlyRate > 0) {
            pvOfDeficit = deficitAmount / Math.pow(1 + currentMonthlyRate, monthsToRetirement);
        } else {
            pvOfDeficit = deficitAmount;
        }
    }

    // 3. PV of Capital Preservation
    let pvOfCapitalPreservation = 0;
    const currentMonthlyRateForPreservation = annualReturnRate / 100 / 12;
    if (currentMonthlyRateForPreservation > 0) {
        const fvContributions = monthlyContribution * (Math.pow(1 + currentMonthlyRateForPreservation, monthsToRetirement) - 1) / currentMonthlyRateForPreservation;
        pvOfCapitalPreservation = (requiredCapitalForPerpetuity - fvContributions) / Math.pow(1 + currentMonthlyRateForPreservation, monthsToRetirement);
    } else {
        const fvContributions = monthlyContribution * monthsToRetirement;
        pvOfCapitalPreservation = requiredCapitalForPerpetuity - fvContributions;
    }

    // 4. Averages
    const averageGrossWithdrawal = accumulatedWithdrawals / monthsInRetirement;
    const averageNetWithdrawal = totalNetWithdrawal / monthsInRetirement;

    return {
        requiredCapitalForPerpetuity,
        pvOfDeficit,
        pvOfCapitalPreservation,
        surplus,
        averageGrossWithdrawal,
        averageNetWithdrawal
    };
}
