
/**
 * Calculates auxiliary statistics after the main simulation.
 */
export function calculateStatistics({
    balanceAtRetirement,
    requiredCapitalAtRetirement,
    monthlyNetIncomeDesired,
    monthlyContribution,

    annualReturnRate,
    retirementAnnualReturnRate = null,
    taxRateDecimal,
    monthsToRetirement,
    monthsInRetirement,
    accumulatedWithdrawals,
    totalNetWithdrawal
}) {
    // 1. Capital Preservation (Perpetuity)
    // Use Retirement Rate if provided, else fall back to Accumulation Rate
    const rateForPerpetuity = retirementAnnualReturnRate !== null ? retirementAnnualReturnRate : annualReturnRate;
    const effectiveMonthlyRate = (rateForPerpetuity / 100 / 12) * (1 - taxRateDecimal);

    // At zero or negative real return, sustaining a perpetual withdrawal requires infinite capital.
    const requiredCapitalForPerpetuity = effectiveMonthlyRate > 0
        ? monthlyNetIncomeDesired / effectiveMonthlyRate
        : Infinity;

    // 2. PV of Deficit
    let pvOfDeficit = 0;
    const surplus = balanceAtRetirement - requiredCapitalAtRetirement;

    if (surplus < 0) {
        const deficitAmount = Math.abs(surplus);
        const currentMonthlyRate = annualReturnRate / 100 / 12;
        if (currentMonthlyRate !== 0) {
            // Works for both positive and negative rates.
            // Negative rate: (1+r)^n < 1 → PV > FV, correctly reflecting a larger present deficit.
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

    // 5. Max sustainable net withdrawal (PMT that depletes balance to exactly 0)
    // PMT formula is valid for any non-zero rate (including negative). Only r=0 requires special handling.
    let maxSustainableNetWithdrawal = 0;
    if (effectiveMonthlyRate !== 0) {
        maxSustainableNetWithdrawal = balanceAtRetirement * effectiveMonthlyRate / (1 - Math.pow(1 + effectiveMonthlyRate, -monthsInRetirement));
    } else {
        maxSustainableNetWithdrawal = balanceAtRetirement / monthsInRetirement;
    }

    return {
        requiredCapitalForPerpetuity,
        pvOfDeficit,
        pvOfCapitalPreservation,
        surplus,
        averageGrossWithdrawal,
        averageNetWithdrawal,
        maxSustainableNetWithdrawal
    };
}
