/**
 * Pension Income Calculator Utilities
 * מחשבון הכנסות פנסיוניות
 */

// Israeli National Insurance (Bituach Leumi) rates for old-age pension (2026)
// These are approximate monthly amounts in ILS
const NATIONAL_INSURANCE_RATES = {
    // Base pension rates (without income supplement)
    baseRates: {
        single: {
            67: 1800,  // Before age 80
            80: 1900   // Age 80+
        },
        // Seniority addition per year of insurance (up to 50% max)
        seniorityAdditionPerYear: 2 // 2% per year of contribution beyond 10 years
    },
    // Deferred pension bonus (for delaying past 67)
    deferralBonusPerMonth: 5 // 5% per year = 0.417% per month
};

// Israeli tax brackets for income (2026) - updated per proposed legislation
// מדרגות מס הכנסה 2026
const PENSION_TAX_BRACKETS = [
    { limit: 7010, rate: 0.10 },    // Up to 7,010 - 10%
    { limit: 10060, rate: 0.14 },   // 7,011-10,060 - 14%
    { limit: 19000, rate: 0.20 },   // 10,061-19,000 - 20% (הורחב מ-16,150)
    { limit: 25100, rate: 0.31 },   // 19,001-25,100 - 31% (הורחב מ-22,440)
    { limit: 46690, rate: 0.35 },   // 25,101-46,690 - 35%
    { limit: Infinity, rate: 0.47 } // 46,691+ - 47%
];

// Pension income exemption (פטור על קצבה) - 2026
const PENSION_EXEMPTION = {
    rate: 0.575, // 57.5% פטור ב-2026 (עולה ל-62.5% ב-2027, 67% ב-2028)
    maxMonthly: 5422 // תקרת פטור חודשית
};

// Capital gains tax rates
const CAPITAL_TAX_RATES = {
    standard: 0.25,          // 25% standard capital gains tax
    realEstate: 0.25,        // Real estate capital gains (with exemptions)
    pensionExemption: 0.35   // 35% of pension lump sum is tax-exempt
};

/**
 * Calculate estimated National Insurance pension based on age and contribution years
 * @param {number} age - Age at which pension starts
 * @param {number} contributionYears - Years of contributions to National Insurance
 * @returns {object} Estimated monthly pension amount and calculation details
 */
export function calculateNationalInsurance(age, contributionYears = 35) {
    // Base pension (single person)
    const basePension = age >= 80
        ? NATIONAL_INSURANCE_RATES.baseRates.single[80]
        : NATIONAL_INSURANCE_RATES.baseRates.single[67];

    // Seniority bonus: 2% per year beyond 10 years, capped at 50%
    const seniorityYears = Math.max(0, Math.min(contributionYears - 10, 25));
    const seniorityBonusPercent = seniorityYears * NATIONAL_INSURANCE_RATES.baseRates.seniorityAdditionPerYear;
    const seniorityBonus = basePension * (seniorityBonusPercent / 100);

    // Deferral bonus: 5% per year past age 67, max 25% (5 years)
    const deferralYears = Math.max(0, Math.min(age - 67, 5));
    const deferralBonusPercent = deferralYears * NATIONAL_INSURANCE_RATES.deferralBonusPerMonth;
    const deferralBonus = basePension * (deferralBonusPercent / 100);

    const totalMonthly = Math.round(basePension + seniorityBonus + deferralBonus);

    return {
        basePension: Math.round(basePension),
        seniorityBonus: Math.round(seniorityBonus),
        seniorityBonusPercent,
        deferralBonus: Math.round(deferralBonus),
        deferralBonusPercent,
        totalMonthly,
        details: {
            contributionYears,
            age
        }
    };
}

/**
 * Calculate tax on pension income using Israeli tax brackets
 * @param {number} grossMonthlyPension - Total gross monthly pension income
 * @returns {object} Tax calculation details
 */
export function calculatePensionTax(grossMonthlyPension) {
    let tax = 0;
    let remainingIncome = grossMonthlyPension;
    let previousLimit = 0;

    for (const bracket of PENSION_TAX_BRACKETS) {
        if (remainingIncome <= 0) break;

        const taxableInBracket = Math.min(remainingIncome, bracket.limit - previousLimit);
        tax += taxableInBracket * bracket.rate;
        remainingIncome -= taxableInBracket;
        previousLimit = bracket.limit;
    }

    const effectiveRate = grossMonthlyPension > 0
        ? (tax / grossMonthlyPension) * 100
        : 0;

    return {
        grossMonthly: grossMonthlyPension,
        taxMonthly: Math.round(tax),
        netMonthly: Math.round(grossMonthlyPension - tax),
        effectiveRate: Math.round(effectiveRate * 10) / 10
    };
}

/**
 * Calculate tax on capital (lump sum) withdrawals
 * @param {number} capitalAmount - Total capital amount
 * @param {number} taxExemptAmount - Amount that is tax-exempt
 * @returns {object} Tax calculation details
 */
export function calculateCapitalTax(capitalAmount, taxExemptAmount = 0) {
    const taxableAmount = Math.max(0, capitalAmount - taxExemptAmount);
    const tax = taxableAmount * CAPITAL_TAX_RATES.standard;

    return {
        grossCapital: capitalAmount,
        taxExempt: taxExemptAmount,
        taxableAmount,
        tax: Math.round(tax),
        netCapital: Math.round(capitalAmount - tax),
        effectiveRate: capitalAmount > 0
            ? Math.round((tax / capitalAmount) * 1000) / 10
            : 0
    };
}

/**
 * Calculate how many years capital will last given monthly deficit
 * @param {number} capital - Starting capital
 * @param {number} monthlyDeficit - Monthly shortfall (expenses - income)
 * @param {number} annualReturnRate - Annual return rate on capital (percentage)
 * @returns {object} Years calculation details
 */
export function calculateCapitalDuration(capital, monthlyDeficit, annualReturnRate = 4) {
    if (monthlyDeficit <= 0) {
        // No deficit - capital lasts forever (or there's a surplus)
        return {
            yearsUntilDepletion: Infinity,
            ageAtDepletion: null,
            remainingCapital: capital,
            monthlyDeficit
        };
    }

    const monthlyRate = annualReturnRate / 100 / 12;
    let remainingCapital = capital;
    let months = 0;
    const maxMonths = 100 * 12; // Cap at 100 years

    while (remainingCapital > 0 && months < maxMonths) {
        // Add interest
        remainingCapital *= (1 + monthlyRate);
        // Subtract deficit
        remainingCapital -= monthlyDeficit;
        months++;
    }

    const years = months / 12;

    return {
        yearsUntilDepletion: Math.round(years * 10) / 10,
        months,
        monthlyDeficit,
        annualReturnRate
    };
}

/**
 * Pension income source entry
 * @typedef {Object} PensionIncomeSource
 * @property {string} type - Type of income (pension, nationalInsurance, rent, etc.)
 * @property {string} name - Display name
 * @property {number} amount - Monthly amount (gross)
 * @property {number} startAge - Age when this income starts
 * @property {number} endAge - Age when this income ends (null for lifetime)
 * @property {boolean} isTaxable - Whether this income is taxable
 */

/**
 * Calculate total pension income at a specific age
 * @param {PensionIncomeSource[]} incomeSources - Array of income sources
 * @param {number} age - Age to calculate at
 * @returns {object} Total income details at that age
 */
export function calculateIncomeAtAge(incomeSources, age) {
    const activeIncome = incomeSources.filter(source => {
        const startOk = age >= source.startAge;
        const endOk = source.endAge === null || age < source.endAge;
        return startOk && endOk && source.enabled !== false;
    });

    const totalGross = activeIncome.reduce((sum, source) => sum + source.amount, 0);
    const taxableGross = activeIncome
        .filter(s => s.isTaxable !== false)
        .reduce((sum, source) => sum + source.amount, 0);

    const taxCalc = calculatePensionTax(taxableGross);
    const nonTaxableIncome = totalGross - taxableGross;

    return {
        age,
        sources: activeIncome,
        totalGross,
        taxableGross,
        nonTaxableIncome,
        tax: taxCalc.taxMonthly,
        totalNet: taxCalc.netMonthly + nonTaxableIncome,
        effectiveTaxRate: totalGross > 0
            ? Math.round((taxCalc.taxMonthly / totalGross) * 1000) / 10
            : 0
    };
}

/**
 * Calculate retirement income summary at key ages
 * @param {PensionIncomeSource[]} incomeSources - Array of income sources
 * @param {number} retirementStartAge - Age retirement begins
 * @param {number} retirementEndAge - Age retirement planning ends
 * @param {number} capital - Capital at retirement
 * @param {number} monthlyExpenses - Monthly expenses/desired income
 * @param {number} capitalReturnRate - Annual return rate on capital
 * @returns {object} Summary by milestone ages
 */
export function calculateRetirementIncomeSummary({
    incomeSources = [],
    retirementStartAge,
    retirementEndAge,
    capital,
    monthlyExpenses,
    capitalReturnRate = 4
}) {
    // Find all unique milestone ages from income sources only
    // Collect start ages from all enabled income sources
    const milestoneAges = new Set();
    incomeSources.forEach(source => {
        if (source.enabled !== false) {
            // Add start age
            milestoneAges.add(source.startAge);
            // Add end age if defined
            if (source.endAge) {
                milestoneAges.add(source.endAge);
            }
        }
    });

    // Always include retirementEndAge as the baseline (this is where capital is calculated)
    milestoneAges.add(retirementEndAge);

    // Sort ages
    const sortedAges = Array.from(milestoneAges)
        .filter(age => age >= retirementEndAge)
        .sort((a, b) => a - b);

    // Get lump sum additions indexed by age
    const lumpSumsByAge = {};
    incomeSources.forEach(source => {
        if (source.isLumpSum && source.enabled !== false) {
            const age = source.startAge;
            lumpSumsByAge[age] = (lumpSumsByAge[age] || 0) + (parseFloat(source.amount) || 0);
        }
    });

    // Calculate income and accumulated capital at each milestone age
    // Start from retirementEndAge (where capital is calculated)
    let accumulatedCapital = capital;
    let previousAge = retirementEndAge;

    // Get annuity sources (excluding lump sums)
    const annuitySources = incomeSources.filter(s => !s.isLumpSum);

    const milestones = sortedAges.map((age, index) => {
        const incomeAtAge = calculateIncomeAtAge(annuitySources, age);
        const monthlyDeficit = monthlyExpenses - incomeAtAge.totalNet;

        // Calculate years since last milestone (or from retirementStartAge)
        const yearsSincePrevious = age - previousAge;

        // Calculate income for the PREVIOUS period (from previousAge to this age)
        // During this period, income was at the level it was at previousAge, not at 'age'
        if (yearsSincePrevious > 0 && accumulatedCapital > 0) {
            // Income during the previous period (before this milestone's income kicks in)
            const incomeAtPreviousAge = calculateIncomeAtAge(annuitySources, previousAge);
            const previousMonthlyDeficit = monthlyExpenses - incomeAtPreviousAge.totalNet;

            const monthlyRate = capitalReturnRate / 100 / 12;
            const months = yearsSincePrevious * 12;

            // Apply interest and deficit each month using PREVIOUS period's income
            for (let m = 0; m < months; m++) {
                accumulatedCapital *= (1 + monthlyRate);
                accumulatedCapital -= previousMonthlyDeficit;
            }
        }

        // Add any lump sum at this age
        if (lumpSumsByAge[age]) {
            accumulatedCapital += lumpSumsByAge[age];
        }

        // Ensure capital doesn't go below 0 for display
        const displayCapital = Math.max(0, Math.round(accumulatedCapital));

        const capitalDuration = calculateCapitalDuration(displayCapital, monthlyDeficit, capitalReturnRate);

        previousAge = age;

        return {
            age,
            income: incomeAtAge,
            accumulatedCapital: displayCapital,
            monthlyDeficit: Math.max(0, monthlyDeficit),
            monthlySurplus: Math.max(0, -monthlyDeficit),
            capitalDuration,
            ageAtDepletion: capitalDuration.yearsUntilDepletion !== Infinity
                ? Math.round((age + capitalDuration.yearsUntilDepletion) * 10) / 10
                : null
        };
    });

    return {
        milestones,
        capital,
        monthlyExpenses,
        retirementStartAge,
        retirementEndAge
    };
}

/**
 * Create default income sources based on retirement profile
 * @param {object} inputs - Profile inputs
 * @returns {PensionIncomeSource[]} Default income sources
 */
export function createDefaultIncomeSources(inputs) {
    const retirementStartAge = parseFloat(inputs.retirementStartAge) || 50;
    const retirementEndAge = parseFloat(inputs.retirementEndAge) || 67;
    const currentAge = parseFloat(inputs.currentAge) || 40;

    // Pension starts at retirement END age (after early retirement self-funded period)
    const pensionStartAge = retirementEndAge;
    const contributionYears = Math.max(10, pensionStartAge - 22); // Assume work started at 22

    const niCalc = calculateNationalInsurance(Math.max(67, pensionStartAge), contributionYears);

    return [
        {
            id: 'pension_1',
            type: 'pension',
            name: 'קצבת פנסיה',
            nameEn: 'Pension Annuity',
            amount: 0,
            startAge: pensionStartAge, // Pension starts at end age
            endAge: null,
            isTaxable: true,
            enabled: true,
            isEditable: true
        },
        {
            id: 'national_insurance',
            type: 'nationalInsurance',
            name: 'ביטוח לאומי',
            nameEn: 'National Insurance',
            amount: niCalc.totalMonthly,
            startAge: Math.max(67, pensionStartAge), // NI starts at 67 minimum
            endAge: null,
            isTaxable: false,
            enabled: true,
            isEditable: true,
            autoCalculated: true,
            calculationDetails: niCalc
        }
    ];
}

export { NATIONAL_INSURANCE_RATES, PENSION_TAX_BRACKETS, CAPITAL_TAX_RATES, PENSION_EXEMPTION };
