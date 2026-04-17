
import { DEFAULT_INPUTS } from '../constants';
import { calculateAgeFromDate } from './dateUtils';

function normalizeReminderDate(reminderDate, fallbackYear, fallbackMonth) {
    if (typeof reminderDate === 'string') {
        const isoMatch = reminderDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) return reminderDate;
    }

    return `${String(fallbackYear).padStart(4, '0')}-${String(fallbackMonth).padStart(2, '0')}-01`;
}

export const normalizeInputs = (data) => {
    // 1. Start with a clean object based ONLY on allowed keys in DEFAULT_INPUTS
    // This removes "ghost" fields and treats null as undefined (forcing default)
    const normalized = {};
    Object.keys(DEFAULT_INPUTS).forEach(key => {
        normalized[key] = (data[key] !== undefined && data[key] !== null) ? data[key] : DEFAULT_INPUTS[key];
    });

    // 2. Birthdate standardization (Handle both birthDate and birthdate)
    if (!normalized.birthdate && (data.birthDate || data.birthdate)) {
        normalized.birthdate = data.birthDate || data.birthdate;
    }

    // 3. Recalculate age if manualAge is NOT explicitly enabled and birthdate exists
    if (!normalized.manualAge && normalized.birthdate) {
        const newAge = calculateAgeFromDate(normalized.birthdate);
        if (newAge !== null) {
            normalized.currentAge = newAge.toFixed(2);
        }
    }

    // 4. Ensure numeric fields are numbers (not strings from Inputs)
    const numericFields = [
        'currentSavings', 'monthlyContribution', 'monthlyNetIncomeDesired',
        'annualReturnRate', 'taxRate', 'retirementStartAge',
        'retirementEndAge', 'currentAge',
        'bucketSafeRate', 'bucketSurplusRate', 'withdrawalPercentage',
        'inflationRate', 'contributionYears', 'targetEndBalance', 'pensionInterestRate'
    ];

    numericFields.forEach(field => {
        if (normalized[field] !== undefined && normalized[field] !== null && normalized[field] !== '') {
            const val = parseFloat(normalized[field]);
            normalized[field] = isNaN(val) ? 0 : val;
        } else if (normalized[field] === '' && field !== 'targetEndBalance') {
            // Default to 0 for required numeric fields, but NOT for targetEndBalance (which can be empty)
            normalized[field] = 0;
        }
    });

    // 5. Normalize and Prune nested rate objects
    const rateMappings = {
        'variableRates': 'annualReturnRate',
        'safeVariableRates': 'bucketSafeRate',
        'surplusVariableRates': 'bucketSurplusRate'
    };

    Object.entries(rateMappings).forEach(([objKey, baseKey]) => {
        const baseRate = parseFloat(normalized[baseKey]) || 0;
        const rateObj = normalized[objKey];

        if (rateObj && typeof rateObj === 'object' && Object.keys(rateObj).length > 0) {
            const normalizedObj = {};
            let hasSignificantDifference = false;

            Object.entries(rateObj).forEach(([year, val]) => {
                const numVal = parseFloat(val);
                const finalVal = isNaN(numVal) ? 0 : numVal;
                
                if (Math.abs(finalVal - baseRate) > 0.001) {
                    normalizedObj[year] = finalVal;
                    hasSignificantDifference = true;
                }
            });

            normalized[objKey] = hasSignificantDifference ? normalizedObj : {};
        } else {
            normalized[objKey] = {};
        }
    });

    // 6. Normalize Life Events (Structure, Types, and Deterministic Order)
    if (Array.isArray(normalized.lifeEvents)) {
        normalized.lifeEvents = normalized.lifeEvents.map(event => {
            const startMonth = parseInt(event.startDate?.month) || 1;
            const startYear = parseInt(event.startDate?.year) || 2024;
            const normalizedEvent = {
                id: String(event.id),
                description: event.description || '',
                type: event.type || 'oneTimeExpense',
                enabled: event.enabled !== false, // default true
                // Explicitly preserve both fields, defaulting to null if missing/empty
                amount: (event.amount !== undefined && event.amount !== null && event.amount !== '') ? parseFloat(event.amount) : null,
                monthlyChange: (event.monthlyChange !== undefined && event.monthlyChange !== null && event.monthlyChange !== '') ? parseFloat(event.monthlyChange) : null,
                duration: (event.duration !== undefined && event.duration !== null) ? parseInt(event.duration) : 1,
                linkedTo: event.linkedTo || null, // UI uses null for unlinked
                startDate: {
                    month: startMonth,
                    year: startYear
                },
                // Explicitly include endDate as null if missing to match deepEqual key counts
                endDate: null,
                // Life-event reminders are derived from the event date but persisted as a normal reminder object
                reminder: event.reminder
                    ? {
                        date: normalizeReminderDate(event.reminder.date, startYear, startMonth),
                        text: event.reminder.text || ''
                    }
                    : null
            };

            if (event.endDate && event.endDate.year) {
                normalizedEvent.endDate = {
                    month: parseInt(event.endDate.month) || 12,
                    year: parseInt(event.endDate.year) || 2024
                };
            }

            return normalizedEvent;
        }).sort((a, b) => a.id.localeCompare(b.id)); // Deterministic order for deepEqual
    } else {
        normalized.lifeEvents = [];
    }

    // 7. Normalize Additional Yearly Income
    if (Array.isArray(normalized.additionalYearlyIncome)) {
        normalized.additionalYearlyIncome = normalized.additionalYearlyIncome
            .filter(e => e && e.id)
            .map(e => ({
                id: String(e.id),
                startYear: parseInt(e.startYear) || new Date().getFullYear(),
                endYear: e.endYear ? parseInt(e.endYear) : null,
                monthlyAmount: parseFloat(e.monthlyAmount) || 0,
                enabled: e.enabled !== false
            }))
            .filter(e => e.monthlyAmount > 0)
            .sort((a, b) => a.startYear - b.startYear);
    } else {
        normalized.additionalYearlyIncome = [];
    }

    return normalized;
};

export const getDetailedDiff = (obj1, obj2) => {
    if (!obj1 || !obj2) return ['One object is missing'];
    const diffs = [];
    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    allKeys.forEach(key => {
        const val1 = obj1[key];
        const val2 = obj2[key];
        
        if (typeof val1 !== typeof val2) {
            diffs.push(`${key}: Type mismatch (${typeof val1} vs ${typeof val2}). Values: [${String(val1)}] vs [${String(val2)}]`);
        } else if (val1 === null || val2 === null) {
            if (val1 !== val2) {
                diffs.push(`${key}: Null mismatch. Values: [${val1}] vs [${val2}]`);
            }
        } else if (Array.isArray(val1) && Array.isArray(val2)) {
            if (val1.length !== val2.length) {
                diffs.push(`${key}: Array length mismatch (${val1.length} vs ${val2.length})`);
            } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
                diffs.push(`${key}: Array content mismatch`);
            }
        } else if (typeof val1 === 'object') {
            if (JSON.stringify(val1) !== JSON.stringify(val2)) {
                diffs.push(`${key}: Object mismatch. Current: ${JSON.stringify(val1)} vs DB: ${JSON.stringify(val2)}`);
            }
        } else if (val1 !== val2) {
            // Check for numeric equality to avoid float precision issues (0.0001)
            const num1 = parseFloat(val1);
            const num2 = parseFloat(val2);
            if (!isNaN(num1) && !isNaN(num2)) {
                if (Math.abs(num1 - num2) > 0.0001) {
                    diffs.push(`${key}: Numeric mismatch (${num1} vs ${num2})`);
                }
            } else {
                diffs.push(`${key}: Value mismatch ('${val1}' vs '${val2}')`);
            }
        }
    });
    return diffs;
};
