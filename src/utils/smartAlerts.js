import { getChatResponse } from './ai-chat';

// ─── Condition types ────────────────────────────────────────────────────────
// Each type defines: check(condition, appState) → boolean, and a summary fn.

export const CONDITION_TYPES = {

    // Budget total is X% of withdrawal target  e.g. >= 80%
    budget_pct_of_target: {
        labelHe: 'תקציב % מהיעד',
        labelEn: 'Budget % of target',
        check({ threshold, operator }, { totalMonthly, target }) {
            if (!target) return false;
            const pct = totalMonthly / target;
            return compare(pct, operator, threshold);
        },
        statusHe({ threshold, operator }, { totalMonthly, target }) {
            if (!target) return 'אין יעד משיכה';
            const pct = Math.round((totalMonthly / target) * 100);
            return `${pct}% מהיעד (סף: ${operator}${Math.round(threshold * 100)}%)`;
        },
        statusEn({ threshold, operator }, { totalMonthly, target }) {
            if (!target) return 'No target set';
            const pct = Math.round((totalMonthly / target) * 100);
            return `${pct}% of target (threshold: ${operator}${Math.round(threshold * 100)}%)`;
        },
    },

    // Monthly savings (target − expenses) below/above amount  e.g. < 1000
    monthly_savings: {
        labelHe: 'חיסכון חודשי',
        labelEn: 'Monthly savings',
        check({ amount, operator }, { totalMonthly, target }) {
            const savings = (target || 0) - totalMonthly;
            return compare(savings, operator, amount);
        },
        statusHe({ amount, operator }, { totalMonthly, target }) {
            const savings = Math.round((target || 0) - totalMonthly);
            return `חיסכון: ₪${savings.toLocaleString()} (סף: ${operator}₪${amount.toLocaleString()})`;
        },
        statusEn({ amount, operator }, { totalMonthly, target }) {
            const savings = Math.round((target || 0) - totalMonthly);
            return `Savings: ₪${savings.toLocaleString()} (threshold: ${operator}₪${amount.toLocaleString()})`;
        },
    },

    // A specific category exceeds X% of total budget  e.g. food > 30%
    category_pct: {
        labelHe: 'קטגוריה % מהתקציב',
        labelEn: 'Category % of budget',
        check({ categoryId, threshold, operator }, { totalMonthly, categoryTotals }) {
            if (!totalMonthly) return false;
            const catTotal = categoryTotals?.[categoryId] || 0;
            return compare(catTotal / totalMonthly, operator, threshold);
        },
        statusHe({ categoryId, threshold, operator }, { totalMonthly, categoryTotals }) {
            const catTotal = categoryTotals?.[categoryId] || 0;
            const pct = totalMonthly ? Math.round((catTotal / totalMonthly) * 100) : 0;
            return `${categoryId}: ${pct}% מהתקציב (סף: ${operator}${Math.round(threshold * 100)}%)`;
        },
        statusEn({ categoryId, threshold, operator }, { totalMonthly, categoryTotals }) {
            const catTotal = categoryTotals?.[categoryId] || 0;
            const pct = totalMonthly ? Math.round((catTotal / totalMonthly) * 100) : 0;
            return `${categoryId}: ${pct}% of budget (threshold: ${operator}${Math.round(threshold * 100)}%)`;
        },
    },

    // Days to retirement date below X  e.g. < 365
    days_to_retirement: {
        labelHe: 'ימים לפרישה',
        labelEn: 'Days to retirement',
        check({ days, operator }, { retirementDate }) {
            if (!retirementDate) return false;
            const daysLeft = Math.round((new Date(retirementDate) - Date.now()) / 86400000);
            return compare(daysLeft, operator, days);
        },
        statusHe({ days, operator }, { retirementDate }) {
            if (!retirementDate) return 'אין תאריך פרישה';
            const daysLeft = Math.round((new Date(retirementDate) - Date.now()) / 86400000);
            return `${daysLeft} ימים לפרישה (סף: ${operator}${days})`;
        },
        statusEn({ days, operator }, { retirementDate }) {
            if (!retirementDate) return 'No retirement date';
            const daysLeft = Math.round((new Date(retirementDate) - Date.now()) / 86400000);
            return `${daysLeft} days to retirement (threshold: ${operator}${days})`;
        },
    },

    // Accumulated capital at retirement above/below amount
    balance_at_retirement: {
        labelHe: 'יתרה בגיל פרישה',
        labelEn: 'Balance at retirement',
        check({ amount, operator }, { balanceAtRetirement }) {
            if (balanceAtRetirement == null) return false;
            return compare(balanceAtRetirement, operator, amount);
        },
        statusHe({ amount, operator }, { balanceAtRetirement }) {
            if (balanceAtRetirement == null) return 'אין נתוני חישוב';
            return `יתרה בפרישה: ₪${Math.round(balanceAtRetirement).toLocaleString()} (סף: ${operator}₪${Math.round(amount).toLocaleString()})`;
        },
        statusEn({ amount, operator }, { balanceAtRetirement }) {
            if (balanceAtRetirement == null) return 'No calculation data';
            return `Balance at retirement: ₪${Math.round(balanceAtRetirement).toLocaleString()} (threshold: ${operator}₪${Math.round(amount).toLocaleString()})`;
        },
    },

    // Required capital needed to fund all retirement years (PV of future withdrawals)
    required_capital_at_retirement: {
        labelHe: 'הון נדרש לפרישה',
        labelEn: 'Required capital for retirement',
        check({ amount, operator }, { requiredCapitalAtRetirement }) {
            if (requiredCapitalAtRetirement == null) return false;
            return compare(requiredCapitalAtRetirement, operator, amount);
        },
        statusHe({ amount, operator }, { requiredCapitalAtRetirement }) {
            if (requiredCapitalAtRetirement == null) return 'אין נתוני חישוב';
            return `הון נדרש: ₪${Math.round(requiredCapitalAtRetirement).toLocaleString()} (סף: ${operator}₪${Math.round(amount).toLocaleString()})`;
        },
        statusEn({ amount, operator }, { requiredCapitalAtRetirement }) {
            if (requiredCapitalAtRetirement == null) return 'No calculation data';
            return `Required capital: ₪${Math.round(requiredCapitalAtRetirement).toLocaleString()} (threshold: ${operator}₪${Math.round(amount).toLocaleString()})`;
        },
    },

    // Surplus (positive) or deficit (negative) at retirement
    surplus_amount: {
        labelHe: 'עודף / גירעון',
        labelEn: 'Surplus / deficit',
        check({ amount, operator }, { surplus }) {
            if (surplus == null) return false;
            return compare(surplus, operator, amount);
        },
        statusHe({ amount, operator }, { surplus }) {
            if (surplus == null) return 'אין נתוני חישוב';
            return `עודף: ₪${Math.round(surplus).toLocaleString()} (סף: ${operator}₪${Math.round(amount).toLocaleString()})`;
        },
        statusEn({ amount, operator }, { surplus }) {
            if (surplus == null) return 'No calculation data';
            return `Surplus: ₪${Math.round(surplus).toLocaleString()} (threshold: ${operator}₪${Math.round(amount).toLocaleString()})`;
        },
    },

    // Initial monthly net withdrawal vs desired target
    withdrawal_vs_target: {
        labelHe: 'משיכה % מהיעד',
        labelEn: 'Withdrawal % of target',
        check({ threshold, operator }, { initialNetWithdrawal, monthlyNetIncomeDesired }) {
            if (!monthlyNetIncomeDesired || initialNetWithdrawal == null) return false;
            return compare(initialNetWithdrawal / monthlyNetIncomeDesired, operator, threshold);
        },
        statusHe({ threshold, operator }, { initialNetWithdrawal, monthlyNetIncomeDesired }) {
            if (!monthlyNetIncomeDesired || initialNetWithdrawal == null) return 'אין נתוני חישוב';
            const pct = Math.round((initialNetWithdrawal / monthlyNetIncomeDesired) * 100);
            return `משיכה: ${pct}% מהיעד (סף: ${operator}${Math.round(threshold * 100)}%)`;
        },
        statusEn({ threshold, operator }, { initialNetWithdrawal, monthlyNetIncomeDesired }) {
            if (!monthlyNetIncomeDesired || initialNetWithdrawal == null) return 'No calculation data';
            const pct = Math.round((initialNetWithdrawal / monthlyNetIncomeDesired) * 100);
            return `Withdrawal: ${pct}% of target (threshold: ${operator}${Math.round(threshold * 100)}%)`;
        },
    },

    // Money runs out before a given age
    ran_out_before_age: {
        labelHe: 'כסף נגמר לפני גיל',
        labelEn: 'Funds run out before age',
        check({ age }, { ranOutAtAge }) {
            if (!ranOutAtAge) return false; // null = money doesn't run out
            return ranOutAtAge < age;
        },
        statusHe({ age }, { ranOutAtAge }) {
            if (!ranOutAtAge) return 'הכסף לא נגמר';
            return `הכסף נגמר בגיל ${ranOutAtAge} (סף: לפני גיל ${age})`;
        },
        statusEn({ age }, { ranOutAtAge }) {
            if (!ranOutAtAge) return 'Funds do not run out';
            return `Funds run out at age ${ranOutAtAge} (threshold: before age ${age})`;
        },
    },

    // Any active loan track ends within X months
    loan_ending_soon: {
        labelHe: 'הלוואה נגמרת בקרוב',
        labelEn: 'Loan ending soon',
        check({ months }, { loanTracks }) {
            return (loanTracks || []).some(t => t.active && t.monthsLeft <= months);
        },
        statusHe({ months }, { loanTracks }) {
            const match = (loanTracks || []).filter(t => t.active && t.monthsLeft <= months);
            if (!match.length) return `אין הלוואות שנגמרות תוך ${months} חודשים`;
            return match.map(t => `"${t.track}" נגמרת בעוד ${t.monthsLeft} חו׳`).join(' · ');
        },
        statusEn({ months }, { loanTracks }) {
            const match = (loanTracks || []).filter(t => t.active && t.monthsLeft <= months);
            if (!match.length) return `No loans ending within ${months} months`;
            return match.map(t => `"${t.track}" ends in ${t.monthsLeft}mo`).join(' · ');
        },
    },
};

function compare(value, operator, threshold) {
    switch (operator) {
        case '>=': return value >= threshold;
        case '<=': return value <= threshold;
        case '>':  return value >  threshold;
        case '<':  return value <  threshold;
        case '==': return Math.abs(value - threshold) < 0.001;
        default:   return false;
    }
}

// ─── Evaluate all alerts against current app state ──────────────────────────

/**
 * appState: {
 *   totalMonthly, target, retirementDate,
 *   categoryTotals: { [categoryId]: number },
 *   loanTracks: [{ active, monthsLeft, loan, track, amount }]
 * }
 * Returns array of alerts that are currently triggered.
 */
export function evaluateSmartAlerts(alerts, appState) {
    const now = Date.now();
    return (alerts || []).filter(alert => {
        if (!alert.enabled) return false;
        if (alert.snoozedUntil && now < alert.snoozedUntil) return false;
        const def = CONDITION_TYPES[alert.condition?.type];
        if (!def) return false;
        try {
            return def.check(alert.condition, appState);
        } catch {
            return false;
        }
    });
}

export function getAlertStatus(alert, appState, isHe) {
    const def = CONDITION_TYPES[alert.condition?.type];
    if (!def) return '';
    try {
        return isHe ? def.statusHe(alert.condition, appState) : def.statusEn(alert.condition, appState);
    } catch {
        return '';
    }
}

export function isAlertTriggered(alert, appState) {
    const def = CONDITION_TYPES[alert.condition?.type];
    if (!def || !alert.enabled) return false;
    try { return def.check(alert.condition, appState); } catch { return false; }
}

// ─── AI parser ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a smart alert parser for a Hebrew retirement planning app.
The user describes a condition in natural language (Hebrew or English).
You must return ONLY valid JSON — no markdown, no explanation.

Each condition type checks a SPECIFIC value — map ONLY when the intent clearly matches:

BUDGET CONDITIONS (based on monthly expenses):
- budget_pct_of_target — checks: (sum of monthly expenses) ÷ (monthly withdrawal target).
  Use ONLY for: "monthly spending is X% of monthly target/goal".
  Example: "תתריע אם הוצאות חודשיות עולות על 90% מיעד המשיכה".
  Parameters: { type, threshold (0–1 fraction), operator }

- monthly_savings — checks: (monthly withdrawal target) − (monthly expenses) = monthly surplus.
  Use for: "monthly surplus/savings is below/above ₪X".
  Example: "תתריע אם החיסכון החודשי יורד מתחת ל-₪2000".
  Parameters: { type, amount (₪ number), operator }

- category_pct — checks: (one expense category total) ÷ (total monthly budget).
  Use for: "category X is more than Y% of total budget".
  Parameters: { type, categoryId (the category name as it appears), threshold (0–1), operator }

RETIREMENT CALCULATION CONDITIONS (based on projected retirement results):
- balance_at_retirement — checks: the ACTUAL balance you will have accumulated at retirement date (₪).
  Use ONLY for: "if the balance / portfolio / savings I have at retirement is above/below ₪X".
  This is what you actually saved up, NOT how much you need.
  Example: "תתריע אם היתרה שצברתי בגיל פרישה תהיה פחות מ-2 מיליון".
  Parameters: { type, amount (₪ number), operator }

- required_capital_at_retirement — checks: the required capital needed to fund all retirement years (PV of all future withdrawals at retirement date) (₪).
  Use for: "if the required capital / הון נדרש / how much is needed to fund retirement is above/below ₪X".
  This is the magic number — how much you NEED at retirement to finance the withdrawal years.
  IMPORTANT: "הון נדרש" or "כמה צריך לממן שנות פרישה" ALWAYS maps to this type, NOT to balance_at_retirement.
  Example: "תתריע אם ההון הנדרש לפרישה עולה על 3 מיליון".
  Parameters: { type, amount (₪ number), operator }

- surplus_amount — checks: surplus (positive) or deficit (negative) at retirement (₪).
  Use for: "if there's a deficit / shortfall / surplus at retirement".
  Example: "תתריע אם יש גירעון בפרישה" → operator "<", amount 0.
  Parameters: { type, amount (₪ number), operator }

- withdrawal_vs_target — checks: (projected initial monthly net withdrawal) ÷ (desired monthly income).
  Use for: "actual withdrawal is less than X% of desired income".
  Example: "תתריע אם המשיכה בפועל נמוכה מ-80% מהיעד".
  Parameters: { type, threshold (0–1 fraction), operator }

- ran_out_before_age — checks: whether projected funds run out before a given age.
  Use for: "money runs out before age X" / "funds exhausted before age X".
  Example: "תתריע אם הכסף נגמר לפני גיל 90".
  Parameters: { type, age (number) }
  Note: no operator field — the condition is always "runs out before age".

TIME / LOAN CONDITIONS:
- days_to_retirement — checks: days remaining until the saved retirement date.
  Use for: "less than X days/months/years until retirement".
  Parameters: { type, days (number), operator }

- loan_ending_soon — checks: whether any active loan ends within X months.
  Use for: "a loan is ending within X months".
  Parameters: { type, months (number) }

IMPORTANT RULES:
- Do NOT use budget_pct_of_target for accumulated capital, net worth, total savings, or portfolio value — use balance_at_retirement or required_capital_at_retirement instead.
- Do NOT use balance_at_retirement for monthly expense ratios — use budget_pct_of_target instead.
- Do NOT confuse balance_at_retirement (what you have) with required_capital_at_retirement (what you need). "הון נדרש" = required_capital_at_retirement. "יתרה בפרישה" or "הון שנצבר" = balance_at_retirement.
- Do NOT guess — if the user's intent does not clearly match one of the ten types above, return an error.
- The error message must be in Hebrew and list which types ARE available.

Return JSON:
{
  "condition": { ...condition object },
  "label": "short Hebrew label (max 5 words)",
  "summary": "one Hebrew sentence confirming exactly what value will be checked and when the alert fires"
}

If you cannot parse a valid condition, return: { "error": "reason in Hebrew" }`;

export async function parseAlertWithAI(userText, provider, model, apiKeyOverride) {
    const reply = await getChatResponse(
        [{ role: 'user', content: userText }],
        SYSTEM_PROMPT,
        provider, model, apiKeyOverride
    );
    // Strip markdown code fences if present
    const clean = reply.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.condition?.type || !CONDITION_TYPES[parsed.condition.type]) {
        throw new Error('Unknown condition type: ' + parsed.condition?.type);
    }
    return parsed; // { condition, label, summary }
}
