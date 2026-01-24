/**
 * Pension Income Calculator Utilities
 * מחשבון הכנסות פנסיוניות
 */

// Israeli National Insurance (Bituach Leumi) rates for old-age pension (2026)
// These are approximate monthly amounts in ILS
const NATIONAL_INSURANCE_RATES = {
    // Base monthly pension rates (January 2026)
    baseRates: {
        single: 1838,
        single_all_seniority: 2757, // Base 1838 + 50% seniority
        single_child: 2419,
        couple: 2762,
        couple_child: 3343,
        // Addon for those over age 80
        age80PlusAddon: 103,
        // Seniority addition per year of insurance (up to 50% max)
        seniorityAdditionPerYear: 2
    },
    // Deferred pension bonus (for delaying past 67)
    deferralBonusPerMonth: 5,
    // Income test thresholds (Mivchan Hakhnasot) - January 2026
    incomeTestThreshold: {
        workEarningsLimit: 9781, // Max work income without penalty
        single: 20226,          // Total income threshold (approx)
        couple: 26968           // Total income threshold (approx)
    }
};

// Israeli tax brackets for income (2026) - proposed legislation values
// מדרגות מס הכנסה 2026 (הצעה)
// Source: Israeli Ministry of Finance / Knesset proposed budget 2026
const PENSION_TAX_BRACKETS = [
    { limit: 7010, rate: 0.10 },
    { limit: 10060, rate: 0.14 },
    { limit: 16150, rate: 0.20 },
    { limit: 22440, rate: 0.31 },
    { limit: 46690, rate: 0.35 },
    { limit: 60130, rate: 0.47 },
    { limit: null, rate: 0.47 }
];

// Pension income exemption (Pshur - פטור מזכה) - January 2026
const PENSION_EXEMPTION = {
    rate: 0.575, // 57.5% פטור ב-2026
    maxMonthly: 5422, // תקרת פטור חודשית (9,430 * 57.5%)
    maxQualifiedIncome: 9430 // תקרת קצבה מזכה (נשאר מ-2025)
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
 * @param {object} properties - Additional properties (parameters, familyStatus, otherIncome)
 * @returns {object} Estimated monthly pension amount and calculation details
 */
export function calculateNationalInsurance(age, contributionYears = 35, parameters = null, familyStatus = 'single', otherIncome = 0) {
    const niParams = parameters?.nationalInsurance || {};

    // Robust merging with defaults
    const baseRates = {
        ...NATIONAL_INSURANCE_RATES.baseRates,
        ...(niParams.baseRates || {})
    };
    const incomeTestThreshold = {
        ...NATIONAL_INSURANCE_RATES.incomeTestThreshold,
        ...(niParams.incomeTestThreshold || {})
    };
    const rates = {
        ...NATIONAL_INSURANCE_RATES,
        ...niParams,
        baseRates,
        incomeTestThreshold
    };

    const status = familyStatus || 'single';
    const threshold = rates.incomeTestThreshold[status === 'couple' ? 'couple' : 'single'] || 20226;

    // Eligibility check - Old Age pension starts at age 67
    if (age < 67) {
        return {
            basePension: 0, seniorityBonus: 0, seniorityBonusPercent: 0,
            deferralBonus: 0, deferralBonusPercent: 0, totalMonthly: 0,
            incomeTest: { applied: false, threshold, otherIncome, reductionAmount: 0 },
            details: { contributionYears, age, familyStatus: status }
        };
    }

    const rawBase = rates.baseRates[status] || rates.baseRates.single;

    // Normalize rate fields: handle both 2 and 0.02 formats for percentages
    const normalize = (val, defaultValue) => {
        if (val === undefined || val === null || val === 0) return defaultValue;

        // If value is a tiny decimal (like 0.00417), it might be a monthly rate instead of yearly
        if (val > 0 && val < 0.01) {
            return val * 12 * 100; // Convert monthly decimal to yearly percentage (e.g. 0.00417 -> 5)
        }

        // If value is a small decimal (like 0.02 or 0.05), it's a yearly decimal
        if (val > 0 && val < 0.25) {
            return val * 100; // Convert 0.05 -> 5
        }

        return val;
    };

    const seniorityRate = normalize(rates.baseRates.seniorityAdditionPerYear, 2);
    const deferralRate = normalize(rates.deferralBonusPerMonth, 5);

    // Seniority bonus: calculated on rawBase (1,838), capped at 50%
    const seniorityYears = Math.max(0, Math.min(contributionYears - 10, 25));
    const seniorityBonusPercent = Math.round(seniorityYears * seniorityRate);
    const seniorityBonus = rawBase * (seniorityBonusPercent / 100);

    // Deferral bonus: calculated on rawBase (1,838), past age 67
    const deferralYears = Math.max(0, Math.min(age - 67, 5));
    const deferralBonusPercent = Math.round(deferralYears * deferralRate);
    const deferralBonus = rawBase * (deferralBonusPercent / 100);

    // Effective base pension (includes age 80+ supplement)
    let basePension = rawBase;
    if (age >= 80) {
        basePension += (rates.baseRates.age80PlusAddon || 103);
    }

    let totalMonthly = Math.round(basePension + seniorityBonus + deferralBonus);
    let incomeTestApplied = false;
    let reductionAmount = 0;

    // Income Test (Mivchan Hakhnasot) - Applied between age 67 and 70
    // Skip test if explicitly requested (e.g. user overrides)
    if (age >= 67 && age < 70 && otherIncome > threshold && !parameters?.ignoreIncomeTest) {
        incomeTestApplied = true;
        reductionAmount = totalMonthly;
        totalMonthly = 0;
    }

    return {
        basePension: Math.round(basePension),
        seniorityBonus: Math.round(seniorityBonus),
        seniorityBonusPercent,
        deferralBonus: Math.round(deferralBonus),
        deferralBonusPercent,
        totalMonthly: Math.max(0, totalMonthly),
        incomeTest: { applied: incomeTestApplied, threshold, otherIncome, reductionAmount },
        details: { contributionYears, age, familyStatus: status }
    };
}

/**
 * Calculate tax on pension income using Israeli tax brackets and Pshur exemption
 * @param {number} qualifiedPension - Portion of income eligible for Pshur exemption (pension annuity)
 * @param {number} otherTaxableIncome - Other taxable income (rent, work, etc.)
 * @param {object} parameters - Optional fiscal parameters override
 * @param {number} age - Current age for the calculation
 * @param {number} retirementAge - Age the user officially retires
 * @returns {object} Tax calculation details
 */
export function calculatePensionTax(qualifiedPension, otherTaxableIncome = 0, parameters = null, age = null, retirementAge = 67) {
    const brackets = parameters?.taxBrackets || PENSION_TAX_BRACKETS;
    const exemptionRules = parameters?.pensionExemption || PENSION_EXEMPTION;

    let exemptionAmount = 0;
    const isPensionAge = age !== null && age >= retirementAge;

    if (isPensionAge && qualifiedPension > 0) {
        // Exemption is 57.5% of the qualified income (capped)
        exemptionAmount = Math.min(qualifiedPension * exemptionRules.rate, exemptionRules.maxMonthly);
    }

    // Total taxable income = (Pension - Exemption) + Other Taxable
    const taxableIncome = Math.max(0, qualifiedPension - exemptionAmount) + otherTaxableIncome;
    const totalGross = qualifiedPension + otherTaxableIncome;

    let tax = 0;
    let remainingIncome = taxableIncome;
    let previousLimit = 0;

    for (const bracket of brackets) {
        if (remainingIncome <= 0) break;

        const effectiveLimit = bracket.limit === null ? Infinity : bracket.limit;
        const taxableInBracket = Math.min(remainingIncome, effectiveLimit - previousLimit);

        if (taxableInBracket > 0) {
            tax += taxableInBracket * bracket.rate;
            remainingIncome -= taxableInBracket;
            previousLimit = effectiveLimit;
        }
    }

    return {
        grossMonthly: totalGross,
        qualifiedPension: Math.round(qualifiedPension),
        otherTaxableIncome: Math.round(otherTaxableIncome),
        exemptionAmount: Math.round(exemptionAmount),
        taxableMonthly: Math.round(taxableIncome),
        taxMonthly: Math.round(tax),
        netMonthly: Math.round(totalGross - tax),
        effectiveRate: totalGross > 0
            ? (tax / totalGross) * 100
            : 0,
        isPensionAge
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
 * @param {object} parameters - Optional fiscal parameters override
 * @returns {object} Total income details at that age
 */
export function calculateIncomeAtAge(incomeSources, age, parameters = null) {
    const activeIncome = incomeSources.filter(source => {
        const startOk = age >= source.startAge;
        const endOk = source.endAge === null || age < source.endAge;
        return startOk && endOk && source.enabled !== false;
    });

    const totalGross = activeIncome.reduce((sum, source) => sum + source.amount, 0);

    // Separate work vs non-work income for NI income test
    const nonWorkIncome = activeIncome
        .filter(s => s.type !== 'work' && s.type !== 'nationalInsurance')
        .reduce((sum, source) => sum + source.amount, 0);

    // Differentiate components for tax calculation
    // 1. Qualified Pension: Eligible for Pshur (57.5%)
    const qualifiedPension = activeIncome
        .filter(s => s.type === 'pension' && s.isTaxable !== false)
        .reduce((sum, source) => sum + source.amount, 0);

    // 2. Other Taxable Income: Taxed normally without Pshur (rent, other taxable)
    const otherTaxableIncome = activeIncome
        .filter(s => s.type !== 'pension' && s.type !== 'nationalInsurance' && s.isTaxable !== false)
        .reduce((sum, source) => sum + source.amount, 0);

    // 3. Tax Exempt Income: Bypasses tax logic entirely (National Insurance)
    const taxExemptIncome = activeIncome
        .filter(s => s.isTaxable === false || s.type === 'nationalInsurance')
        .reduce((sum, source) => sum + source.amount, 0);

    const taxCalc = calculatePensionTax(
        qualifiedPension,
        otherTaxableIncome,
        parameters,
        age,
        parameters?.retirementAge || 67
    );

    return {
        age,
        sources: activeIncome,
        totalGross,
        qualifiedPension,
        otherTaxableIncome,
        taxExemptIncome,
        nonWorkIncome,
        tax: taxCalc.taxMonthly,
        totalNet: taxCalc.netMonthly + taxExemptIncome,
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
    capitalReturnRate = 4,
    parameters = null
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

    // Track current income to use for the NEXT period's calculation
    // Start with income at retirementStartAge
    // We must calculate NI separately to account for the income test at the initial retirement age
    const nonNISources = annuitySources.filter(s => s.type !== 'nationalInsurance');
    const incomeExcludingNIInitial = calculateIncomeAtAge(nonNISources, retirementStartAge, parameters);
    const niBaseSource = annuitySources.find(s => s.type === 'nationalInsurance');
    let niAmountInitial = 0;
    let niDetailsInitial = null;

    if (niBaseSource && niBaseSource.enabled !== false) {
        niDetailsInitial = calculateNationalInsurance(
            retirementStartAge,
            niBaseSource.details?.contributionYears || 35,
            parameters,
            parameters?.familyStatus || 'single',
            incomeExcludingNIInitial.nonWorkIncome
        );
        niAmountInitial = niDetailsInitial.totalMonthly;
    }

    const activeSourcesInitial = [...incomeExcludingNIInitial.sources];
    if (niAmountInitial > 0 && niBaseSource) {
        activeSourcesInitial.push({
            ...niBaseSource,
            amount: niAmountInitial
        });
    }

    let incomeAtPreviousAge = {
        ...incomeExcludingNIInitial,
        sources: activeSourcesInitial,
        totalGross: incomeExcludingNIInitial.totalGross + niAmountInitial,
        totalNet: incomeExcludingNIInitial.totalNet + niAmountInitial,
        niDetails: niDetailsInitial
    };

    const milestones = sortedAges.map((age, index) => {
        // Calculate income from all sources *except* National Insurance first,
        // as NI depends on other non-work income.
        const incomeExcludingNI = calculateIncomeAtAge(nonNISources, age, parameters);

        // Find NI source and recalculate with income test
        let niDetails = null;
        let niAmount = 0;

        if (niBaseSource && niBaseSource.enabled !== false) {
            niDetails = calculateNationalInsurance(
                age,
                niBaseSource.details?.contributionYears || 35,
                parameters,
                parameters?.familyStatus || 'single',
                incomeExcludingNI.nonWorkIncome // Pass other non-work income for the NI income test
            );
            niAmount = niDetails.totalMonthly;
        }

        // Combining income excluding NI with the (potentially adjusted) NI amount
        const totalGrossAtAge = incomeExcludingNI.totalGross + niAmount;
        // NI is generally tax-exempt, so add directly to net
        const totalNetAtAge = incomeExcludingNI.totalNet + niAmount;

        // Add NI to the active sources list so it shows up in UI badges
        const activeSources = [...incomeExcludingNI.sources];
        if (niAmount > 0 && niBaseSource) {
            activeSources.push({
                ...niBaseSource,
                amount: niAmount
            });
        }

        const currentMilestoneIncome = {
            ...incomeExcludingNI,
            sources: activeSources,
            totalGross: totalGrossAtAge,
            totalNet: totalNetAtAge,
            niDetails
        };

        const monthlyDeficit = monthlyExpenses - totalNetAtAge;

        // Calculate years since last milestone (or from retirementStartAge)
        const yearsSincePrevious = age - previousAge;

        // Calculate income for the PREVIOUS period (from previousAge to this age)
        // During this period, income was at the level it was at previousAge, not at 'age'
        if (yearsSincePrevious > 0 && accumulatedCapital > 0) {
            // Income during the previous period (before this milestone's income kicks in)
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
        incomeAtPreviousAge = currentMilestoneIncome;

        return {
            age,
            income: currentMilestoneIncome,
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

    const niCalc = calculateNationalInsurance(Math.max(67, pensionStartAge), contributionYears, inputs.fiscalParameters, inputs.familyStatus);

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
