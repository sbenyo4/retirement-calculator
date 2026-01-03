
import { WITHDRAWAL_STRATEGIES, EVENT_TYPES } from '../constants.js';

/**
 * Validates retirement calculation inputs
 * @param {Object} inputs - User inputs to validate
 * @param {Function} t - Translation function (optional)
 * @returns {Array<string>} Array of error messages (empty if all valid)
 */
function validateInputs(inputs, t = null) {
    const errors = [];

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
        Object.entries(inputs).map(([k, v]) => [k, parseFloat(v)])
    );

    // Helper to get translation or fallback to English
    const getText = (key, fallback) => (t ? t(key) : fallback);

    // Age validations
    if (isNaN(currentAge) || currentAge < 0 || currentAge > 120) {
        errors.push(getText('validationCurrentAgeBetween', 'Current age must be between 0 and 120'));
    }
    if (isNaN(retirementStartAge) || retirementStartAge < 0 || retirementStartAge > 120) {
        errors.push(getText('validationRetirementStartAgeBetween', 'Retirement start age must be between 0 and 120'));
    }
    if (isNaN(retirementEndAge) || retirementEndAge < 0 || retirementEndAge > 120) {
        errors.push(getText('validationRetirementEndAgeBetween', 'Retirement end age must be between 0 and 120'));
    }

    // Age sequence validations
    if (!isNaN(currentAge) && !isNaN(retirementStartAge) && retirementStartAge <= currentAge) {
        errors.push(getText('validationRetirementStartGreater', 'Retirement start age must be greater than current age'));
    }
    if (!isNaN(retirementStartAge) && !isNaN(retirementEndAge) && retirementEndAge <= retirementStartAge) {
        errors.push(getText('validationRetirementEndGreater', 'Retirement end age must be greater than retirement start age'));
    }

    // Financial validations
    if (isNaN(currentSavings) || currentSavings < 0) {
        errors.push(getText('validationCurrentSavingsNonNegative', 'Current savings cannot be negative'));
    }
    if (isNaN(monthlyContribution) || monthlyContribution < 0) {
        errors.push(getText('validationMonthlyContributionNonNegative', 'Monthly contribution cannot be negative'));
    }
    if (isNaN(monthlyNetIncomeDesired) || monthlyNetIncomeDesired <= 0) {
        errors.push(getText('validationMonthlyIncomePositive', 'Monthly net income desired must be positive'));
    }

    // Rate validations
    if (isNaN(annualReturnRate) || annualReturnRate < -100 || annualReturnRate > 100) {
        errors.push(getText('validationAnnualReturnBetween', 'Annual return rate must be between -100% and 100%'));
    }
    if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
        errors.push(getText('validationTaxRateBetween', 'Tax rate must be between 0% and 100%'));
    }

    return errors;
}

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
 * @param {string} inputs.withdrawalStrategy (optional, default: 'fixed')
 * @param {number} inputs.withdrawalPercentage (optional, for percentage strategy, default: 4)
 * @param {Array} inputs.lifeEvents (optional, array of life events to apply)
 * @param {Function} t - Translation function (optional)
 * @returns {Object} result
 * @throws {Error} If inputs are invalid
 */
export function calculateRetirementProjection(inputs, t = null) {
    // Validate inputs first
    const validationErrors = validateInputs(inputs, t);
    if (validationErrors.length > 0) {
        const invalidInputsLabel = t ? t('validationInvalidInputs') : 'Invalid inputs:';
        const errorMessage = invalidInputsLabel + '\n' + validationErrors.map(e => `  • ${e}`).join('\n');
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    const {
        currentAge,
        retirementStartAge,
        retirementEndAge,
        currentSavings,
        monthlyContribution,
        monthlyNetIncomeDesired,
        annualReturnRate,
        taxRate,
        variableRates, // New input
        variableRatesEnabled // Toggle flag
    } = Object.fromEntries(
        Object.entries(inputs).map(([k, v]) => {
            if (k === 'variableRates' || k === 'variableRatesEnabled' || k === 'lifeEvents') return [k, v]; // Preserve non-numeric inputs
            return [k, parseFloat(v) || 0];
        })
    );

    // Get withdrawal strategy (default to fixed if not specified)
    const withdrawalStrategy = inputs.withdrawalStrategy || WITHDRAWAL_STRATEGIES.FIXED;
    const withdrawalPercentage = parseFloat(inputs.withdrawalPercentage) || 4;

    // Get life events (default to empty array if not specified)
    const lifeEvents = inputs.lifeEvents || [];

    // START YEAR for variable rates mapping
    const startYear = new Date().getFullYear();

    // Helper function to convert event date to month number from current age
    const getMonthFromDate = (date) => {
        if (!date) return null;
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        const yearsFromNow = date.year - currentYear;
        const monthsFromNow = yearsFromNow * 12 + (date.month - currentMonth);
        return Math.max(0, monthsFromNow); // Don't allow negative months
    };

    // Helper to check if an event is active at a given month
    const isEventActive = (event, currentMonth) => {
        const startMonth = getMonthFromDate(event.startDate);
        if (startMonth === null || currentMonth < startMonth) return false;

        // If no end date, event is active from start onwards
        if (!event.endDate) return true;

        // If has end date, check if we're before it
        // Note: End Date is usually "Exclusive" in our logic loop (removed when current == end)
        // EXCEPT for this check which is "Inclusive" (<=). 
        // We need to be careful with this usage.
        const endMonth = getMonthFromDate(event.endDate);
        return endMonth === null || currentMonth <= endMonth;
    };

    // Helper to safely get the monthly value (fallback to amount if monthlyChange is missing)
    const getMonthlyAmount = (event) => {
        return event.monthlyChange !== undefined && event.monthlyChange !== null
            ? event.monthlyChange
            : (event.amount || 0);
    };

    // Helper to get rate for a specific month index
    const getMonthlyRateForMonth = (monthIndex) => {
        const yearOffset = Math.floor(monthIndex / 12);
        const currentCalcYear = startYear + yearOffset;
        const yearRate = (variableRatesEnabled && variableRates && variableRates[currentCalcYear] !== undefined)
            ? variableRates[currentCalcYear]
            : annualReturnRate;
        return yearRate / 100 / 12;
    };

    // Constant tax rate (could be variable too, but keeping simple)
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
        contribution: 0,
        withdrawal: 0,
        accumulatedWithdrawals: 0,
        phase: 'accumulation'
    });

    // Track active monthly contribution (can be modified by INCOME_CHANGE events)
    let activeMonthlyContribution = monthlyContribution;

    // Pre-scan for events active at start (Month 0)
    lifeEvents.forEach(event => {
        if (!event.enabled) return;
        const start = getMonthFromDate(event.startDate);
        if (start <= 0 && isEventActive(event, 0)) {
            const amount = getMonthlyAmount(event);
            if (event.type === EVENT_TYPES.INCOME_CHANGE) {
                activeMonthlyContribution += amount;
            } else if (event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                activeMonthlyContribution -= amount;
            }
        }
    });

    for (let i = 1; i <= monthsToRetirement; i++) {
        currentMonth++;
        const monthlyRate = getMonthlyRateForMonth(currentMonth);

        // Apply life events for this month
        lifeEvents.forEach(event => {
            if (!event.enabled) return; // Skip disabled events

            const eventStartMonth = getMonthFromDate(event.startDate);

            // Check if this is the exact month the event starts
            if (eventStartMonth === currentMonth) {
                switch (event.type) {
                    case EVENT_TYPES.ONE_TIME_INCOME:
                        balance += event.amount;
                        totalPrincipal += event.amount;
                        break;

                    case EVENT_TYPES.ONE_TIME_EXPENSE:
                        balance -= event.amount;
                        // Also reduce principal if we're spending saved money
                        totalPrincipal = Math.max(0, totalPrincipal - event.amount);
                        break;

                    case EVENT_TYPES.INCOME_CHANGE:
                        // This modifies monthly contribution going forward
                        activeMonthlyContribution += getMonthlyAmount(event);
                        break;

                    case EVENT_TYPES.EXPENSE_CHANGE:
                        // This reduces monthly contribution capacity going forward
                        activeMonthlyContribution -= getMonthlyAmount(event);
                        break;
                }
            }

            // Check if recurring event should end this month
            if (event.endDate) {
                const eventEndMonth = getMonthFromDate(event.endDate);
                if (eventEndMonth === currentMonth) {
                    const amount = getMonthlyAmount(event);
                    if (event.type === EVENT_TYPES.INCOME_CHANGE) {
                        activeMonthlyContribution -= amount;
                    } else if (event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                        activeMonthlyContribution += amount;
                    }
                }
            }
        });

        // Interest
        const interest = balance * monthlyRate;
        balance += interest;

        // Contribution (using active contribution which may have been modified by events)
        balance += activeMonthlyContribution;
        totalPrincipal += activeMonthlyContribution;

        if (i % 12 === 0) { // Record yearly for chart data to keep it clean


            history.push({
                month: currentMonth,
                age: currentAge + (i / 12),
                balance: balance,
                contribution: activeMonthlyContribution * 12, // Annual contribution (current rate)
                withdrawal: 0,
                accumulatedWithdrawals: 0,
                phase: 'accumulation'
            });
        }
    }

    const balanceAtRetirement = balance;
    const principalAtRetirement = totalPrincipal;

    // --- Phase 2: Decumulation (Retirement Start -> Retirement End) ---
    // Withdrawal strategy logic:
    // FIXED: Fixed monthly amount (monthlyNetIncomeDesired)
    // FOUR_PERCENT: 4% of initial balance / 12, adjusted for inflation
    // PERCENTAGE: X% of current balance / 12
    // DYNAMIC: Adjust based on portfolio performance

    let retirementBalance = balanceAtRetirement;
    let ranOutAtAge = null;
    let initialGrossWithdrawal = 0;
    let initialNetWithdrawal = 0;
    let accumulatedWithdrawals = 0;
    let totalNetWithdrawal = 0;

    // Calculate base withdrawal for 4% rule (yearly amount / 12)
    const fourPercentMonthly = (balanceAtRetirement * 0.04) / 12;
    // Track the base for dynamic strategy
    let dynamicBaseWithdrawal = monthlyNetIncomeDesired;

    // Effective monthly rate for PV calculations - VARIES BY MONTH NOW due to variable rates
    // const effectiveMonthlyRate = monthlyRate * (1 - taxRateDecimal); 
    // We can't use a constant effectiveMonthlyRate for PV anymore if we want perfect accuracy, 
    // but for PV estimate we might just use the CURRENT average or base rate?
    // Let's stick to base annualReturnRate for PV estimate to avoid complexity, or calculate average.
    const effectiveMonthlyRate = (annualReturnRate / 100 / 12) * (1 - taxRateDecimal);

    // Accumulator for Required Capital (NPV of all future needs)
    let requiredCapitalPV = 0;

    // Track active expense adjustments during retirement
    let activeExpenseAdjustment = 0;
    // Track active income adjustments during retirement (e.g. pension)
    let activeIncomeAdjustment = 0;

    // Pre-scan for EXPENSE and INCOME events active at start of retirement
    lifeEvents.forEach(event => {
        if (!event.enabled) return;
        // Check if active NEXT month (first month of retirement).
        if (isEventActive(event, monthsToRetirement + 1)) {
            const monthlyAmount = getMonthlyAmount(event);
            if (event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                activeExpenseAdjustment += monthlyAmount;
            } else if (event.type === EVENT_TYPES.INCOME_CHANGE) {
                activeIncomeAdjustment += monthlyAmount;
            }
        }
    });

    let previousYearReturn = 0;

    for (let i = 1; i <= monthsInRetirement; i++) {
        currentMonth++;
        const monthlyRate = getMonthlyRateForMonth(currentMonth);

        // Apply life events for this month during retirement
        lifeEvents.forEach(event => {
            if (!event.enabled) return; // Skip disabled events

            const eventStartMonth = getMonthFromDate(event.startDate);

            // 1. Handle One-Time Events (Impact Balance directly)
            if (eventStartMonth === currentMonth) {
                switch (event.type) {
                    case EVENT_TYPES.ONE_TIME_INCOME:
                        retirementBalance += event.amount;
                        break;
                    case EVENT_TYPES.ONE_TIME_EXPENSE:
                        retirementBalance -= event.amount;
                        break;
                }
            }
        });

        // 2. Handle Recurring Events (Stateless Calculation)
        // Recalculate adjustments from scratch each month to avoid state drift
        activeIncomeAdjustment = 0;
        activeExpenseAdjustment = 0;

        lifeEvents.forEach(event => {
            if (!event.enabled) return;

            // Only check recurring types
            if (event.type === EVENT_TYPES.INCOME_CHANGE || event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                if (isEventActive(event, currentMonth)) {
                    const amount = getMonthlyAmount(event);
                    if (event.type === EVENT_TYPES.INCOME_CHANGE) {
                        activeIncomeAdjustment += amount;
                    } else if (event.type === EVENT_TYPES.EXPENSE_CHANGE) {
                        activeExpenseAdjustment += amount;
                    }
                }
            }
        });

        const interest = retirementBalance * monthlyRate;
        const tax = interest * taxRateDecimal;

        // Calculate withdrawal based on strategy
        let netWithdrawal;
        switch (withdrawalStrategy) {
            case WITHDRAWAL_STRATEGIES.FOUR_PERCENT:
                // 4% rule: fixed amount based on initial balance
                netWithdrawal = fourPercentMonthly;
                break;

            case WITHDRAWAL_STRATEGIES.PERCENTAGE:
                // Percentage: X% of current balance annually / 12
                netWithdrawal = (retirementBalance * (withdrawalPercentage / 100)) / 12;
                break;

            case WITHDRAWAL_STRATEGIES.DYNAMIC:
                // Dynamic: adjust based on previous year's performance
                if (i % 12 === 1 && i > 1) {
                    // Calculate previous year's return
                    // Use the RATE from the previous year (which we can approximate or track)
                    // For dynamic strategy, we should use the ACTUAL return of the previous year.
                    const prevYearRate = getMonthlyRateForMonth(currentMonth - 1);
                    const yearlyReturnRate = Math.pow(1 + prevYearRate, 12) - 1;
                    const expectedReturn = 0.07; // 7% expected

                    if (yearlyReturnRate > expectedReturn) {
                        // Good year: increase by up to 10%
                        dynamicBaseWithdrawal = Math.min(
                            dynamicBaseWithdrawal * 1.1,
                            monthlyNetIncomeDesired * 1.2 // Cap at 120% of original
                        );
                    } else if (yearlyReturnRate < expectedReturn - 0.05) {
                        // Bad year (more than 5% below expected): decrease by up to 10%
                        dynamicBaseWithdrawal = Math.max(
                            dynamicBaseWithdrawal * 0.9,
                            monthlyNetIncomeDesired * 0.8 // Floor at 80% of original
                        );
                    }
                }
                netWithdrawal = dynamicBaseWithdrawal;
                break;

            case WITHDRAWAL_STRATEGIES.INTEREST_ONLY:
                netWithdrawal = interest - tax;
                break;

            case WITHDRAWAL_STRATEGIES.FIXED:
            default:
                // Fixed: constant monthly amount
                netWithdrawal = monthlyNetIncomeDesired;
                break;
        }

        // Apply expense adjustments from EXPENSE_CHANGE events
        netWithdrawal += activeExpenseAdjustment;

        // Apply income adjustments from INCOME_CHANGE events (reduces withdrawal needed)
        netWithdrawal -= activeIncomeAdjustment;

        // Ensure netWithdrawal doesn't go below zero (i.e. if pension > expenses, we save the excess)
        // If netWithdrawal is negative, it means we have surplus income.
        // We should ADD this surplus to the balance.
        // So, if netWithdrawal is -1000, grossWithdrawal will be -1000 (ignoring tax on negative withdrawal).
        // Let's refine logical flow:

        if (netWithdrawal < 0) {
            // Surplus income!
            // We don't withdraw. We add to balance. 
            // Tax? Assuming surplus income is already net or tax handled elsewhere? 
            // Using simple logic: Add absolute surplus to retirementBalance.
            // Set grossWithdrawal to 0 because we aren't taking money out.
            const surplusIncome = Math.abs(netWithdrawal);
            retirementBalance += surplusIncome;
            netWithdrawal = 0;
            // Note: Depending on rules, this surplus might be taxed if it's investment income, but here we treat it as cash flow.
        }

        let grossWithdrawal = netWithdrawal + tax;

        if (i === 1) {
            initialGrossWithdrawal = grossWithdrawal;
            initialNetWithdrawal = netWithdrawal;
        }

        // Check if we have enough money
        if (retirementBalance + interest < grossWithdrawal) {
            grossWithdrawal = retirementBalance + interest; // Take what's left
            if (ranOutAtAge === null) {
                ranOutAtAge = retirementStartAge + (i / 12);
            }
        }

        retirementBalance = retirementBalance + interest - grossWithdrawal;
        accumulatedWithdrawals += grossWithdrawal;
        totalNetWithdrawal += netWithdrawal;

        // --- Required Capital Accumulation (NPV) ---
        // Calculate what we NEEDED this month to satisfy the goal.
        // Base Need: Monthly Net Income Desired
        // + Recurring Expenses (activeExpenseAdjustment)
        // - Recurring Income (activeIncomeAdjustment)
        let monthlyNeed = monthlyNetIncomeDesired + activeExpenseAdjustment - activeIncomeAdjustment;

        // Apply One-Time Events for this month to the Need
        // We need to find them again or track them? 
        // Tracking them in the loop is cleaner but let's just re-scan for ONE-TIME acts currentMonth
        // Optimization: checking inside the loop above is better but invasive to flow.
        // Let's safe-scan here since simulation is fast.

        lifeEvents.forEach(e => {
            if (!e.enabled) return;
            const startM = getMonthFromDate(e.startDate);
            if (startM === currentMonth) {
                if (e.type === EVENT_TYPES.ONE_TIME_EXPENSE) monthlyNeed += e.amount;
                if (e.type === EVENT_TYPES.ONE_TIME_INCOME) monthlyNeed -= e.amount;
            }
        });

        // Discount back to retirement start
        // Formula: PV = PMT / (1 + r)^n
        // If effectiveRate is 0, just add.
        if (effectiveMonthlyRate !== 0) {
            requiredCapitalPV += monthlyNeed / Math.pow(1 + effectiveMonthlyRate, i);
        } else {
            requiredCapitalPV += monthlyNeed;
        }

        if (i % 12 === 0 || retirementBalance <= 0) {
            history.push({
                month: currentMonth,
                age: retirementStartAge + (i / 12),
                balance: Math.max(0, retirementBalance),
                contribution: 0,
                withdrawal: grossWithdrawal * 12, // Annual withdrawal (current rate)
                accumulatedWithdrawals: accumulatedWithdrawals,
                phase: 'decumulation',
                withdrawalStrategy: withdrawalStrategy
            });
        }

        if (retirementBalance <= 0) {
            retirementBalance = 0;
            // Do NOT break here. We must continue to calculate requiredCapitalPV for the full duration.
            // break; 
        }
    }

    // --- Phase 3: Required Capital Calculation ---
    // We have calculated the NPV of the actual stream of desired needs in the loop above.
    const requiredCapitalAtRetirement = requiredCapitalPV;

    // --- Capital Preservation Calculation ---
    // Required Capital to preserve principal over the retirement period.
    // We want to find P such that after N months of withdrawals, we end with P again.
    // This uses the annuity formula with FV = P (instead of FV = 0)
    // 
    // Formula: P = PMT * ((1+r)^n - 1) / (r * (1+r)^n - r)
    // Where PMT is the monthly net income, r is effective monthly rate, n is months in retirement
    // 
    // Rearranging the annuity formula:
    // PV = (PMT / r) * (1 - (1 + r)^-n) for ending at 0
    // For ending at PV (preserving principal):
    // PV * (1+r)^n = PV + PMT * ((1+r)^n - 1) / r
    // PV * ((1+r)^n - 1) = PMT * ((1+r)^n - 1) / r
    // PV = PMT / r
    // 
    // Wait, that's the perpetuity formula again... Let me reconsider.
    // Actually, if we want to END with the same amount we STARTED with:
    // We withdraw each month and reinvest the remainder.
    // This is equivalent to the perpetuity case where the principal never changes.
    // 
    // The calculation IS independent of the period if we truly preserve principal!
    // The monthly withdrawal limit is: Principal * effective_rate
    // If we withdraw exactly this amount each month, the principal stays constant.
    //
    // So requiredCapitalForPerpetuity is correct - it doesn't depend on the period.
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
        const currentMonthlyRate = annualReturnRate / 100 / 12;
        if (currentMonthlyRate > 0) {
            pvOfDeficit = deficitAmount / Math.pow(1 + currentMonthlyRate, monthsToRetirement);
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
    const currentMonthlyRateForPreservation = annualReturnRate / 100 / 12;
    if (currentMonthlyRateForPreservation > 0) {
        const fvContributions = monthlyContribution * (Math.pow(1 + currentMonthlyRateForPreservation, monthsToRetirement) - 1) / currentMonthlyRateForPreservation;
        pvOfCapitalPreservation = (requiredCapitalForPerpetuity - fvContributions) / Math.pow(1 + currentMonthlyRateForPreservation, monthsToRetirement);
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

    // Calculate Average Withdrawals
    const averageGrossWithdrawal = accumulatedWithdrawals / monthsInRetirement;
    const averageNetWithdrawal = totalNetWithdrawal / monthsInRetirement;

    return {
        history,
        balanceAtRetirement,
        // FIXED: Always use the simulated retirementBalance which correctly accounts for the withdrawal strategy
        // The previous logic used a theoretical calculation when surplus > 0 which ignored the strategy
        balanceAtEnd: Math.max(0, retirementBalance),
        ranOutAtAge,
        requiredCapitalAtRetirement,
        requiredCapitalForPerpetuity,
        surplus,
        pvOfDeficit,
        pvOfCapitalPreservation,
        initialGrossWithdrawal,
        initialNetWithdrawal,
        averageGrossWithdrawal,
        averageNetWithdrawal
    };
}
