import React, { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency } from '../utils/formatters';
import { generateRetirementChecklistInsights, applyChecklistDiff, explainChecklistItem, generateChecklistOverview, localizeAiError } from '../utils/ai-calculator';
import { useAuth } from '../contexts/AuthContext';
import { getChecklistState, setChecklistState, getChecklistOverview, setChecklistOverview } from '../utils/db';
import {
    Shield, Heart, Receipt, TrendingUp, Home, Scale, Laptop,
    AlertTriangle, CheckCircle, ChevronDown, ChevronRight,
    Umbrella, Stethoscope, Building2, FileText, Users,
    Activity, CreditCard, Zap, Star, Info, BadgeAlert, RefreshCw, Landmark, RotateCcw, Search, X, EyeOff, Undo2, Trash2, MessageSquare, Bell, Save, Lock, LockOpen
} from 'lucide-react';
import { syncComponentReminders, forgetReminderShown, silenceReminder, nextOccurrenceOf, nextOccurrenceByInterval } from '../hooks/useReminders';
import { undismissReminder } from '../utils/db';

const PRIORITIES = {
    critical: { en: 'Critical', he: 'קריטי', color: 'bg-red-500', text: 'text-red-500', border: 'border-red-500/30', bg: 'bg-red-500/10', order: 0 },
    high:     { en: 'High',     he: 'גבוה',  color: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10', order: 1 },
    medium:   { en: 'Medium',   he: 'בינוני', color: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-500/10', order: 2 },
    low:      { en: 'Low',      he: 'נמוך',  color: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10', order: 3 },
};

// Known category ID → translated title. Used for AI-generated categories whose title was saved in a different language.
const CATEGORY_TITLES = {
    'insurance':         { en: 'Insurance',                       he: 'ביטוחים' },
    'national-insurance':{ en: 'National Insurance (Bituach Leumi)', he: 'ביטוח לאומי' },
    'pension':           { en: 'Pension',                         he: 'פנסיה' },
    'tax':               { en: 'Tax Planning',                    he: 'תכנון מס' },
    'financial':         { en: 'Financial Management',            he: 'ניהול פיננסי' },
    'healthcare':        { en: 'Healthcare Planning',             he: 'תכנון בריאות' },
    'legal':             { en: 'Legal & Estate Planning',         he: 'תכנון משפטי ועיזבון' },
    'lifestyle':         { en: 'Lifestyle & Daily Life',          he: 'אורח חיים ויום-יום' },
};

function getCategoryTitle(cat, language) {
    const known = CATEGORY_TITLES[cat.id];
    if (known) return language === 'he' ? known.he : known.en;
    return cat.title; // fallback for AI-invented categories
}

function buildItems(inputs, results, language) {
    const isHe = language === 'he';
    const txt = (en, he) => isHe ? he : en;
    const fmtC = (v) => formatCurrency(Math.round(v), language);

    const currentAge = parseFloat(inputs?.currentAge) || 65;
    const retirementAge = parseFloat(inputs?.retirementStartAge) || 67;
    const retirementEndAge = parseFloat(inputs?.retirementEndAge) || 85;
    const monthlyIncome = parseFloat(inputs?.monthlyNetIncomeDesired) || 0;
    const taxRate = parseFloat(inputs?.taxRate) || 0;
    const inflationRate = parseFloat(inputs?.inflationRate) || 0;
    const isRetired = currentAge >= retirementAge;
    const yearsTillRetirement = Math.max(0, retirementAge - currentAge);
    const retirementYears = retirementEndAge - retirementAge;
    const balanceAtRetirement = results?.balanceAtRetirement || 0;
    const ranOutAtAge = results?.ranOutAtAge || null;
    const surplus = results?.surplus || 0;
    const isDeficit = surplus < 0;
    const emergencyFundTarget = monthlyIncome * 18;
    const annualWithdrawal = monthlyIncome * 12;
    const withdrawalRate = balanceAtRetirement > 0 ? (annualWithdrawal / balanceAtRetirement * 100) : 0;

    // Timing shorthands
    const before = (yrs) => ({ type: 'before', value: -yrs });           // N years before retirement
    const atRet  = ()     => ({ type: 'range', value: -1, valueTo: 1 }); // around retirement date
    const after  = (yrs) => ({ type: 'after', value: yrs });             // N years after retirement
    const byAge  = (age)  => ({ type: 'age', value: age });              // by a specific age
    const ongoing = ()    => ({ type: 'ongoing' });                       // recurring / always relevant

    return [
        // ─── INSURANCE ─────────────────────────────────────────────────────────
        {
            category: 'insurance',
            icon: Shield,
            title: txt('Insurance', 'ביטוחים'),
            color: 'blue',
            items: [
                {
                    id: 'health-private',
                    priority: 'critical',
                    timing: atRet(),
                    title: txt('Private Health Insurance', 'ביטוח בריאות פרטי'),
                    desc: txt(
                        'Employer-sponsored coverage ends when you retire. You must switch to a private personal health policy immediately — gaps in coverage can mean being uninsurable later.',
                        'כיסוי ביטוחי דרך המעסיק פוקע עם הפרישה. יש לעבור לפוליסה פרטית מיד — פער בכיסוי עלול למנוע ביטוחיות בעתיד.'
                    ),
                    details: txt(
                        'Options include: basic health fund membership + supplemental plan (מכבי זהב/מאוחדת עדיף) + private comprehensive insurance. Compare costs and coverage carefully. After age 65, some plans limit coverage or increase premiums significantly.',
                        'אפשרויות: חברות בקופת חולים + ביטוח משלים + ביטוח פרטי. השוו עלויות וכיסויים. מעל גיל 65 חלק מהתוכניות מגבילות כיסוי או מייקרות פרמיות משמעותית.'
                    ),
                    relevant: true,
                },
                {
                    id: 'dental',
                    priority: 'high',
                    timing: before(2),
                    title: txt('Dental Insurance', 'ביטוח שיניים'),
                    desc: txt(
                        'Basic health insurance does not cover most dental treatments. Average retirees spend ₪3,000–8,000/year on dental. Supplemental dental coverage significantly reduces out-of-pocket costs.',
                        'ביטוח הבריאות הבסיסי אינו מכסה טיפולי שיניים. גמלאים מוציאים בממוצע ₪3,000–8,000 לשנה על שיניים. ביטוח משלים לשיניים מפחית משמעותית את ההוצאה.'
                    ),
                    details: txt(
                        'Health fund supplemental plans (מכבי זהב, מאוחדת עדיף, כללית מושלם) include dental benefits. Compare against standalone dental insurance. Note waiting periods.',
                        'תוכניות המשלים של קופות החולים (מכבי זהב, מאוחדת עדיף, כללית מושלם) כוללות הטבות לשיניים. השוו מול ביטוח שיניים עצמאי. שימו לב לתקופות אכשרה.'
                    ),
                    relevant: true,
                },
                {
                    id: 'ltc',
                    priority: currentAge >= 60 ? 'critical' : 'high',
                    timing: byAge(60),
                    title: txt('Long-Term Care Insurance', 'ביטוח סיעודי'),
                    desc: txt(
                        'Long-term nursing care in Israel costs ₪8,000–20,000/month. This is one of the largest unplanned risks in retirement. The older you are, the harder and more expensive it becomes to obtain coverage.',
                        'טיפול סיעודי בישראל עולה ₪8,000–20,000 לחודש. זה אחד הסיכונים הגדולים ביותר בפרישה. ככל שמתבגרים, הביטוח יקר יותר וקשה יותר לקבלו.'
                    ),
                    details: txt(
                        'Review existing LTC coverage from employer or old policies. National Insurance pays a basic LTC allowance (about ₪2,000–5,000/month) — far below actual costs. Supplement with private insurance. Consider whether family members can provide care.',
                        'בדקו כיסוי סיעודי קיים ממעסיק או פוליסות ישנות. ביטוח לאומי משלם קצבת סיעוד בסיסית (כ-₪2,000–5,000 לחודש) — הרבה מתחת לעלות בפועל. השלימו בביטוח פרטי. שקלו האם בני משפחה יכולים לסייע.'
                    ),
                    relevant: true,
                },
                {
                    id: 'life',
                    priority: 'low',
                    timing: before(3),
                    title: txt('Life Insurance — Review Need', 'ביטוח חיים — בחינה מחדש'),
                    desc: txt(
                        'Life insurance is designed to replace lost income for dependents. If you have no dependents or your savings cover heirs\' needs, you may be able to cancel premiums and redirect that money.',
                        'ביטוח חיים נועד לפצות על אובדן הכנסה לתלויים. אם אין תלויים או שחסכונות מכסים את צרכי היורשים, ייתכן שניתן לבטל ולהשתמש בפרמיות לצרכים אחרים.'
                    ),
                    details: txt(
                        'Review existing term/whole-life policies. Some policies have cash value that can be withdrawn. Consider mortgage cancellation insurance separately if relevant.',
                        'בדקו פוליסות ריסק/חיים קיימות. לחלק יש ערך פדיון. שקלו ביטוח הלוואת משכנתא בנפרד אם רלוונטי.'
                    ),
                    relevant: true,
                },
            ],
        },

        // ─── NATIONAL INSURANCE ────────────────────────────────────────────────
        {
            category: 'national-insurance',
            icon: Landmark,
            title: txt('National Insurance (Bituach Leumi)', 'ביטוח לאומי'),
            color: 'teal',
            items: [
                {
                    id: 'ni-contributions',
                    priority: retirementAge < 67 ? 'high' : 'medium',
                    timing: ongoing(),
                    title: txt('Ongoing NI Contributions', 'הפקדות ביטוח לאומי שוטפות'),
                    desc: txt(
                        `If you retire before age 67, you are still required to pay National Insurance contributions on passive income (capital gains, rental income). Failure to pay can result in loss of benefits.`,
                        `אם פורשים לפני גיל 67, עדיין חייבים בתשלום דמי ביטוח לאומי על הכנסות פסיביות (רווחי הון, שכ"ד). אי תשלום עלול לגרום לאובדן זכויות.`
                    ),
                    details: txt(
                        'Report all passive income to the NI Institute annually. Rate for non-employed is 9.61% up to the ceiling. Consult an accountant to ensure correct classification.',
                        'דווחו לביטוח לאומי על כל הכנסה פסיבית מדי שנה. שיעור לשאינו עובד עומד על 9.61% עד תקרה. התייעצו עם רואה חשבון לסיווג נכון.'
                    ),
                    relevant: retirementAge < 67,
                },
                {
                    id: 'ni-old-age',
                    priority: 'high',
                    timing: before(5),
                    title: txt('Old-Age Allowance Planning', 'קצבת זקנה — תכנון'),
                    desc: txt(
                        'Old-age allowance eligibility starts at age 67 (men) and between 62–67 (women, transitional). Work income above a threshold reduces or eliminates the benefit. Passive income from savings does not affect it.',
                        'זכאות לקצבת זקנה מגיל 67 (גברים), ו-62–67 (נשים, מדורג). הכנסה מעבודה מעל תקרה מפחיתה או מבטלת את הקצבה. הכנסה פסיבית מחסכונות אינה משפיעה עליה.'
                    ),
                    details: txt(
                        'The full allowance for a single person is approximately ₪1,800–2,200/month (2024). It provides a safety floor but is far below typical retirement expenses. Do not count on it as a primary income source.',
                        'הקצבה המלאה ליחיד היא כ-₪1,800–2,200 לחודש (2024). מהווה רשת ביטחון אך רחוקה מהוצאות פרישה טיפוסיות. אל תסמכו עליה כמקור הכנסה עיקרי.'
                    ),
                    relevant: true,
                },
            ],
        },

        // ─── TAX PLANNING ──────────────────────────────────────────────────────
        {
            category: 'tax',
            icon: Receipt,
            title: txt('Tax Planning', 'תכנון מס'),
            color: 'amber',
            items: [
                {
                    id: 'capital-gains',
                    priority: taxRate > 0 ? 'high' : 'medium',
                    timing: before(1),
                    title: txt('Capital Gains Tax on Withdrawals', 'מס רווחי הון על משיכות'),
                    desc: txt(
                        `Capital gains tax of 25% applies to the profit portion of each withdrawal. With your ${taxRate}% tax rate setting, annual withdrawals of ${fmtC(monthlyIncome * 12)} will generate a meaningful tax bill that must be budgeted for.`,
                        `מס רווחי הון של 25% חל על חלק הרווח בכל משיכה. עם שיעור מס של ${taxRate}%, משיכות שנתיות של ${fmtC(monthlyIncome * 12)} יצרו חבות מס שיש לתקצב אותה.`
                    ),
                    details: txt(
                        'Tax is only on gains above original cost basis (not on principal). The effective tax rate decreases as your cost basis grows relative to gains. File an annual tax return (דוח שנתי) even if you have no employment income.',
                        'מס חל רק על רווח מעל עלות המקורית (לא על הקרן). שיעור המס האפקטיבי יורד ככל שהעלות גבוהה יחסית לרווח. הגישו דוח שנתי למס הכנסה גם ללא הכנסת עבודה.'
                    ),
                    relevant: taxRate > 0,
                },
                {
                    id: 'tax-return',
                    priority: 'high',
                    timing: ongoing(),
                    title: txt('Annual Tax Return Obligation', 'חובת הגשת דוח שנתי'),
                    desc: txt(
                        'As a retiree living off investments, you must file an annual tax return. This includes reporting capital gains, interest income, dividends, and rental income. Missing filing leads to penalties.',
                        'כגמלאי החי מהשקעות, חובה להגיש דוח שנתי למס הכנסה. יש לדווח על רווחי הון, הכנסות ריבית, דיבידנדים והכנסות שכ"ד. אי הגשה מובילה לקנסות.'
                    ),
                    details: txt(
                        'Work with a tax advisor who specializes in retirees. There are exemptions and deductions (points, senior exemptions) that can significantly reduce your tax burden. Set aside an emergency tax reserve.',
                        'עבדו עם יועץ מס המתמחה בגמלאים. קיימות פטורות וניכויים (נקודות זיכוי, פטורי גיל) שיכולים להפחית משמעותית את נטל המס. הפרישו עתודת מס חירום.'
                    ),
                    relevant: true,
                },
                {
                    id: 'withdrawal-sequence',
                    priority: 'medium',
                    timing: before(2),
                    title: txt('Tax-Efficient Withdrawal Sequencing', 'סדר משיכות יעיל מבחינת מס'),
                    desc: txt(
                        'The order in which you withdraw from different accounts significantly impacts total tax paid over retirement. Withdrawing from high-basis accounts first, leaving higher-gain accounts to grow longer, reduces total tax.',
                        'הסדר שבו מושכים מחשבונות שונים משפיע מאוד על סך המס לאורך הפרישה. משיכה מחשבונות עם עלות גבוהה תחילה, תוך השארת חשבונות בעלי רווח גבוה לגדול — מפחיתה מס כולל.'
                    ),
                    details: txt(
                        'Consider: (1) Deplete low-basis accounts last. (2) Use realized losses to offset gains. (3) Spread large gains across multiple tax years. (4) If married, consider splitting assets for each spouse\'s tax brackets.',
                        'שקלו: (1) רוקנו חשבונות עם עלות נמוכה אחרונים. (2) השתמשו בהפסדים ממומשים לקיזוז רווחים. (3) פרסו רווחים גדולים על פני מספר שנות מס. (4) אם נשואים, שקלו פיצול נכסים לפי מדרגות מס של כל בן זוג.'
                    ),
                    relevant: true,
                },
            ],
        },

        // ─── FINANCIAL MANAGEMENT ──────────────────────────────────────────────
        {
            category: 'financial',
            icon: TrendingUp,
            title: txt('Financial Management', 'ניהול פיננסי'),
            color: 'green',
            items: [
                {
                    id: 'emergency-fund',
                    priority: 'critical',
                    timing: before(1),
                    title: txt(`Emergency Fund — Target: ${fmtC(emergencyFundTarget)}`, `קרן חירום — יעד: ${fmtC(emergencyFundTarget)}`),
                    desc: txt(
                        `Keep 18–24 months of expenses (${fmtC(emergencyFundTarget)}) in immediately liquid, low-risk accounts. This prevents forced selling of investments during market downturns to cover daily needs.`,
                        `שמרו 18–24 חודשי הוצאות (${fmtC(emergencyFundTarget)}) בחשבונות נזילים ומיידיים. זה מונע מכירה כפויה של השקעות בירידות שוק כדי לממן צרכים שוטפים.`
                    ),
                    details: txt(
                        'Options: bank current account, short-term government bonds (מק"מ), money market funds. Do NOT include this in your retirement portfolio calculations — it is a separate buffer. Replenish when drawn down.',
                        'אפשרויות: חשבון עו"ש, מק"מ, קרנות כספיות. אל תכללו זאת בחישובי תיק הפרישה — זהו מאגר נפרד. חדשו לאחר שמשכתם.'
                    ),
                    relevant: true,
                },
                {
                    id: 'diversification',
                    priority: 'high',
                    timing: before(3),
                    title: txt('Diversification — Don\'t Keep All Eggs in One Basket', 'פיזור — אל תשימו כל הביצים בסל אחד'),
                    desc: txt(
                        'Government deposit guarantee covers only ₪250,000 per bank. If your savings exceed this, spread across multiple banks and instruments (bonds, ETFs, real estate, etc.).',
                        'ערבות מדינה על פיקדונות מכסה רק ₪250,000 לבנק. אם חסכונות עולים על כך, פזרו בין בנקים מרובים ומכשירים שונים (אג"ח, ETF, נדל"ן וכו\').'
                    ),
                    details: txt(
                        'Consider: Multiple banks, Israeli government bonds, ETFs tracking world indices, real estate exposure via REITs, some foreign currency. Avoid concentration in single stocks or sectors.',
                        'שקלו: בנקים מרובים, אג"ח ממשלת ישראל, ETF על מדדים עולמיים, חשיפה לנדל"ן דרך קרנות, מטבע זר. הימנעו מריכוז במניה בודדת או סקטור.'
                    ),
                    relevant: true,
                },
                {
                    id: 'annual-review',
                    priority: 'high',
                    timing: ongoing(),
                    title: txt('Annual Retirement Plan Review', 'סקירה שנתית של תוכנית הפרישה'),
                    desc: txt(
                        'At least once a year: compare actual expenses to plan, review portfolio performance vs. assumption, and adjust withdrawal rate if necessary. Market downturns in early retirement are especially dangerous.',
                        'לפחות פעם בשנה: השוו הוצאות בפועל מול תוכנית, בדקו ביצועי תיק לעומת הנחה, והתאימו שיעור משיכה במידת הצורך. ירידות שוק בתחילת הפרישה מסוכנות במיוחד.'
                    ),
                    details: txt(
                        'The "sequence of returns risk": losing 30% in year 1 with fixed withdrawals depletes capital irreversibly. Consider reducing withdrawals by 10–20% in bad market years to let the portfolio recover.',
                        '"סיכון רצף תשואות": הפסד של 30% בשנה 1 עם משיכות קבועות מרוקן הון באופן בלתי הפיך. שקלו הפחתת משיכות ב-10–20% בשנות שוק רעות כדי לאפשר לתיק להתאושש.'
                    ),
                    relevant: true,
                },
                {
                    id: 'inflation-risk',
                    priority: inflationRate === 0 ? 'high' : 'medium',
                    timing: before(5),
                    title: txt(
                        inflationRate === 0 ? '⚠ Inflation NOT Modeled in Your Plan' : 'Inflation Risk Over Retirement',
                        inflationRate === 0 ? '⚠ אינפלציה לא מוסרת בתוכניתך' : 'סיכון אינפלציה לאורך הפרישה'
                    ),
                    desc: txt(
                        inflationRate === 0
                            ? `Your plan currently assumes 0% inflation. At 3% annual inflation, ₪10,000 today buys only ₪5,500 worth of goods in 20 years. Consider adding an inflation assumption to your model.`
                            : `With ${inflationRate}% annual inflation, purchasing power halves in ${Math.round(70 / inflationRate)} years. Your investment returns must exceed inflation to maintain real living standards.`,
                        inflationRate === 0
                            ? `תוכניתך מניחה כרגע 0% אינפלציה. באינפלציה שנתית של 3%, ₪10,000 היום שווים רק ₪5,500 ברכישה בעוד 20 שנה. שקלו להוסיף הנחת אינפלציה למודל.`
                            : `עם ${inflationRate}% אינפלציה שנתית, כוח הקנייה מ減半 תוך ${Math.round(70 / inflationRate)} שנה. תשואת ההשקעות חייבת לעלות על האינפלציה לשמירת רמת חיים ריאלית.`
                    ),
                    details: txt(
                        'Two-phase inflation planning: in active retirement (65–75) lifestyle inflation is high (more travel, activities). In passive retirement (75+) personal care and healthcare inflation dominates (5–7%/year).',
                        'תכנון אינפלציה דו-שלבי: בפרישה פעילה (65–75) אינפלציה של סגנון חיים גבוהה (נסיעות, פעילויות). בפרישה פסיבית (75+) אינפלציית טיפול אישי ובריאות שולטת (5–7% לשנה).'
                    ),
                    relevant: true,
                },
                {
                    id: 'withdrawal-risk',
                    priority: isDeficit || ranOutAtAge ? 'critical' : (withdrawalRate > 5 ? 'high' : 'medium'),
                    timing: ongoing(),
                    title: txt(
                        ranOutAtAge
                            ? `⚠ Funds Run Out at Age ${ranOutAtAge.toFixed(1)} — Urgent Review Needed`
                            : isDeficit
                                ? '⚠ Projected Shortfall — Review Withdrawal Rate'
                                : `Withdrawal Rate: ${withdrawalRate.toFixed(1)}%/year`,
                        ranOutAtAge
                            ? `⚠ כספים נגמרים בגיל ${ranOutAtAge.toFixed(1)} — נדרשת סקירה דחופה`
                            : isDeficit
                                ? '⚠ גירעון צפוי — סקירת שיעור המשיכה נדרשת'
                                : `שיעור משיכה: ${withdrawalRate.toFixed(1)}% לשנה`
                    ),
                    desc: txt(
                        ranOutAtAge
                            ? `Based on current inputs, your savings run out at age ${ranOutAtAge.toFixed(1)}. You need to either increase savings, reduce spending, or delay retirement. This is the most urgent issue to address.`
                            : isDeficit
                                ? `Your projected capital at retirement is less than required for your target income over ${retirementYears} years. Consider increasing contributions, reducing spending targets, or accepting a lower income in later years.`
                                : withdrawalRate > 5
                                    ? `Your withdrawal rate of ${withdrawalRate.toFixed(1)}% exceeds the commonly recommended 4% safe withdrawal rate. This may be sustainable but increases the risk of running out of money.`
                                    : `Your withdrawal rate of ${withdrawalRate.toFixed(1)}% is within a sustainable range. The 4% rule suggests this rate can last 30+ years in most market scenarios.`,
                        ranOutAtAge
                            ? `בהנחות הנוכחיות, חסכונות נגמרים בגיל ${ranOutAtAge.toFixed(1)}. יש להגדיל חסכונות, להפחית הוצאות, או לדחות פרישה. זו הבעיה הדחופה ביותר.`
                            : isDeficit
                                ? `ההון הצפוי בפרישה נמוך מהנדרש לפי יעד ההכנסה שלך ל-${retirementYears} שנה. שקלו הגדלת הפקדות, הפחתת יעד ההוצאה, או קבלת הכנסה נמוכה יותר בשנים המאוחרות.`
                                : withdrawalRate > 5
                                    ? `שיעור המשיכה שלך ${withdrawalRate.toFixed(1)}% עולה על הכלל הנפוץ של 4% בטוח. עשוי להיות בר-קיימא אך מגדיל סיכון לחוסר כספים.`
                                    : `שיעור המשיכה שלך ${withdrawalRate.toFixed(1)}% נמצא בטווח בר-קיימא. כלל ה-4% מציע שיעור זה יחזיק 30+ שנה ברוב תרחישי השוק.`
                    ),
                    details: txt(
                        'Strategies to improve sustainability: (1) Reduce spending in early retirement. (2) Consider part-time work for first few years. (3) Delay social security / NI benefits if possible. (4) Downsize property to release capital. (5) Use the "guardrails" strategy — reduce withdrawals by 10% when portfolio falls below threshold.',
                        'אסטרטגיות לשיפור הקיימות: (1) הפחתת הוצאות בתחילת הפרישה. (2) תעסוקה חלקית בשנים הראשונות. (3) דחיית קצבת זקנה אם ניתן. (4) מעבר לנכס קטן יותר לשחרור הון. (5) אסטרטגיית "מעקפים" — הפחתת 10% כשתיק יורד מתחת לסף.'
                    ),
                    relevant: true,
                },
            ],
        },

        // ─── HEALTHCARE ────────────────────────────────────────────────────────
        {
            category: 'healthcare',
            icon: Stethoscope,
            title: txt('Healthcare Planning', 'תכנון בריאות'),
            color: 'rose',
            items: [
                {
                    id: 'healthcare-costs',
                    priority: 'high',
                    timing: before(3),
                    title: txt('Rising Healthcare Costs with Age', 'עלייה בהוצאות בריאות עם הגיל'),
                    desc: txt(
                        'Healthcare expenses increase approximately 5–7% per year as you age — far faster than general inflation. Most people underestimate this cost in retirement planning. At 75, spending is typically 2–3× what it was at 65.',
                        'הוצאות בריאות עולות בכ-5–7% לשנה עם ההתבגרות — הרבה מהר יותר מהאינפלציה הכללית. רוב האנשים מזלזלים בעלות זו בתכנון הפרישה. בגיל 75, הוצאות הן בדרך כלל פי 2–3 ממה שהיו בגיל 65.'
                    ),
                    details: txt(
                        'Budget separately for: medications (add 5% annually), specialist visits, physiotherapy, optical, hearing aids. Consider that long-term care is not included here — that is a separate category (insurance).',
                        'תקצבו בנפרד: תרופות (הוסיפו 5% לשנה), ביקורי מומחים, פיזיותרפיה, אופטיקה, מכשירי שמיעה. שימו לב שטיפול סיעודי אינו כלול כאן — זה קטגוריה נפרדת (ביטוח).'
                    ),
                    relevant: true,
                },
                {
                    id: 'supplemental-health',
                    priority: 'high',
                    timing: atRet(),
                    title: txt('Supplemental Health Fund Plan', 'ביטוח משלים בקופת חולים'),
                    desc: txt(
                        'Your health fund\'s supplemental plan (מכבי זהב, מאוחדת עדיף, כללית מושלם, לאומית שלי) covers drugs not in the basic basket, specialist access, advanced imaging, and some dental. Compare your current plan against others.',
                        'תוכנית המשלים של קופת החולים (מכבי זהב, מאוחדת עדיף, כללית מושלם, לאומית שלי) מכסה תרופות מחוץ לסל, נגישות למומחים, הדמיה מתקדמת וחלק מהשיניים. השוו את התוכנית הנוכחית.'
                    ),
                    details: txt(
                        'Switching plans is only allowed during specific enrollment periods (January–March). Check if your current medications are covered before switching. Some plans have waiting periods for pre-existing conditions.',
                        'מעבר בין תוכניות אפשרי רק בתקופות הרישום (ינואר–מרץ). בדקו אם תרופות קיימות מכוסות לפני מעבר. לחלק מהתוכניות יש תקופות אכשרה למצבים קיימים.'
                    ),
                    relevant: true,
                },
            ],
        },

        // ─── LEGAL & ESTATE ────────────────────────────────────────────────────
        {
            category: 'legal',
            icon: Scale,
            title: txt('Legal & Estate Planning', 'תכנון משפטי ועיזבון'),
            color: 'purple',
            items: [
                {
                    id: 'will',
                    priority: 'critical',
                    timing: before(5),
                    title: txt('Will (Tzava\'a) — Updated?', 'צוואה — מעודכנת?'),
                    desc: txt(
                        'Without a valid will, your estate is distributed according to the Inheritance Law, which may not match your wishes. Update your will to reflect current assets, new accounts, and any changes in family structure.',
                        'ללא צוואה תקפה, עיזבונך יתחלק לפי חוק הירושה, שעשוי לא לשקף את רצונותיך. עדכנו את הצוואה לנכסים נוכחיים, חשבונות חדשים ושינויים במבנה המשפחה.'
                    ),
                    details: txt(
                        'A will should be either handwritten in full (including date and signature) or notarized. Store the original safely and ensure your executor knows where it is. Review every 5 years or after major life events.',
                        'צוואה חייבת להיות כתובה ביד במלואה (כולל תאריך וחתימה) או מאושרת בפני נוטריון. שמרו את המקור במקום בטוח ווודאו שמנהל העיזבון יודע היכן הוא. סקרו כל 5 שנים או לאחר אירועים משמעותיים.'
                    ),
                    relevant: true,
                },
                {
                    id: 'power-of-attorney',
                    priority: 'critical',
                    timing: before(3),
                    title: txt('Lasting Power of Attorney', 'ייפוי כוח מתמשך'),
                    desc: txt(
                        'A Lasting Power of Attorney (ייפוי כוח מתמשך) allows a trusted person to manage your financial and personal decisions if you become incapacitated due to illness or cognitive decline. Must be registered with the Guardian General\'s Office before you lose capacity.',
                        'ייפוי כוח מתמשך מאפשר לאדם מהימן לנהל החלטות כלכליות ואישיות אם תאבד כשרות עקב מחלה או ירידה קוגניטיבית. חייב להיות רשום באפוטרופוס הכללי בעוד יש לכם כשרות.'
                    ),
                    details: txt(
                        'Separate from a regular power of attorney (which becomes invalid if you lose mental capacity). The continuing POA remains valid. You can appoint different people for financial vs. personal decisions. Cost: ~₪2,000–4,000 for a lawyer to prepare.',
                        'שונה מייפוי כוח רגיל (שמתבטל אם אבדה כשרות). ייפוי הכוח המתמשך נשאר תקף. ניתן למנות אנשים שונים להחלטות כספיות מול אישיות. עלות: כ-₪2,000–4,000 לעורך דין.'
                    ),
                    relevant: true,
                },
                {
                    id: 'advance-directive',
                    priority: 'high',
                    timing: byAge(65),
                    title: txt('Advance Medical Directive', 'הנחיות רפואיות מקדימות'),
                    desc: txt(
                        'Document your medical preferences in advance: resuscitation preferences, artificial ventilation, feeding tubes, and end-of-life care. Without this, medical teams must apply all life-prolonging measures by law.',
                        'תעדו העדפות רפואיות מראש: העדפות החייאה, הנשמה מלאכותית, הזנה בצינורית וטיפול בסוף חיים. ללא זאת, צוותים רפואיים מחויבים ביישום כל האמצעים המאריכים חיים על פי חוק.'
                    ),
                    details: txt(
                        'Register with the Ministry of Health\'s "Living Will" (הנחיות מקדימות) registry. Update every 5 years (the form expires). Ensure your healthcare proxy and family know your wishes. This is separate from the Lasting POA.',
                        'רשמו במרשם "הנחיות מקדימות" של משרד הבריאות. עדכנו כל 5 שנים (הטופס פוקע). וודאו שמיופה הכוח הרפואי ובני המשפחה מכירים את רצונותיכם. זה נפרד מייפוי הכוח המתמשך.'
                    ),
                    relevant: true,
                },
                {
                    id: 'beneficiaries',
                    priority: 'high',
                    timing: before(2),
                    title: txt('Update Beneficiaries on All Accounts', 'עדכון מוטבים על כל החשבונות'),
                    desc: txt(
                        'Beneficiary designations on insurance policies, pension/provident funds, and bank accounts override your will. If a beneficiary died or circumstances changed, outdated designations can cause assets to go to the wrong person.',
                        'מינוי מוטבים בפוליסות ביטוח, קרנות פנסיה/גמל וחשבונות בנק גובר על הצוואה. אם מוטב נפטר או נסיבות השתנו, מינוי ישן יכול לגרום להעברת נכסים לאדם לא נכון.'
                    ),
                    details: txt(
                        'Check: life insurance, pension funds, provident funds, education funds, any jointly-held assets, and bank accounts with designated beneficiary instructions (הוראת מוטב). Also verify digital assets and online accounts.',
                        'בדקו: ביטוח חיים, קרנות פנסיה, קרנות גמל, קרנות השתלמות, נכסים משותפים, וחשבונות בנק עם הוראת מוטב. בדקו גם נכסים דיגיטליים וחשבונות מקוונים.'
                    ),
                    relevant: true,
                },
            ],
        },

        // ─── HOUSING ───────────────────────────────────────────────────────────
        {
            category: 'housing',
            icon: Home,
            title: txt('Housing & Property', 'דיור ורכוש'),
            color: 'orange',
            items: [
                {
                    id: 'maintenance',
                    priority: 'medium',
                    timing: ongoing(),
                    title: txt('Property Maintenance Budget', 'תקציב תחזוקת נכס'),
                    desc: txt(
                        'Budget 1–2% of property value annually for maintenance (plumbing, electrical, roof, appliances, painting). Many retirees are caught off guard by large, sudden maintenance costs.',
                        'תקצבו 1–2% משווי הנכס לשנה לתחזוקה (אינסטלציה, חשמל, גג, מכשירים, צביעה). גמלאים רבים מופתעים מהוצאות תחזוקה גדולות ופתאומיות.'
                    ),
                    details: txt(
                        'Create a home maintenance reserve fund. Schedule preventive maintenance (annual HVAC service, water heater checks, roof inspection). Large items (roof, boiler, elevator) should be planned 5–10 years ahead.',
                        'צרו קרן עתודה לתחזוקת הבית. תזמנו תחזוקה מונעת (שירות מיזוג שנתי, בדיקות דוד, בדיקת גג). פריטים גדולים (גג, דוד, מעלית) צריך לתכנן 5–10 שנים מראש.'
                    ),
                    relevant: true,
                },
                {
                    id: 'accessibility',
                    priority: currentAge >= 70 ? 'high' : 'medium',
                    timing: byAge(70),
                    title: txt('Accessibility Planning', 'תכנון נגישות'),
                    desc: txt(
                        'Plan accessibility modifications early — before they become urgent. Grab bars in bathrooms, step-free entrances, wider doorways, and good lighting are significantly cheaper to plan and build during renovations than to retrofit later.',
                        'תכננו שינויי נגישות מוקדם — לפני שהם הופכים לדחופים. ידיות תמיכה בחדרי רחצה, כניסות ללא מדרגות, דלתות רחבות ותאורה טובה זולים הרבה יותר לתכנן בשיפוץ מאשר להוסיף מאוחר.'
                    ),
                    details: txt(
                        'Consider a home assessment by an occupational therapist specializing in aging in place. Evaluate: floor surfaces, bathroom safety, bedroom access, kitchen ergonomics, emergency response system. Budget ₪15,000–50,000 for a typical home adaptation.',
                        'שקלו הערכת בית על ידי מרפא בעיסוק המתמחה בהזדקנות בבית. העריכו: משטחי רצפה, בטיחות חדר רחצה, גישה לחדר שינה, ארגונומיה במטבח, מערכת מענה חירום. תקצבו ₪15,000–50,000 להסתגלות בית טיפוסית.'
                    ),
                    relevant: true,
                },
                {
                    id: 'downsizing',
                    priority: 'low',
                    timing: before(5),
                    title: txt('Consider Downsizing', 'שקלו מעבר לנכס קטן יותר'),
                    desc: txt(
                        isDeficit
                            ? `Your plan shows a projected shortfall. Selling a large property and moving to a smaller one could release significant capital to supplement retirement income.`
                            : 'A large family home may have higher maintenance, utilities, and property tax costs than needed. Moving to a smaller property releases equity and reduces ongoing costs.',
                        isDeficit
                            ? `תוכניתך מראה גירעון צפוי. מכירת נכס גדול ומעבר לקטן יותר עלולה לשחרר הון משמעותי לתמיכה בהכנסת הפרישה.`
                            : 'בית משפחה גדול עלול לכלול הוצאות תחזוקה, חשמל ארנונה גבוהות מהצורך. מעבר לנכס קטן משחרר הון ומפחית עלויות שוטפות.'
                    ),
                    details: txt(
                        'Timing matters: real estate transaction costs are significant (lawyer, agent, purchase tax). Consider proximity to family, medical facilities, public transport, and community. Some retirees prefer urban apartment living for convenience.',
                        'תזמון חשוב: עלויות עסקת נדל"ן משמעותיות (עורך דין, תיווך, מס רכישה). שקלו קרבה למשפחה, מתקנים רפואיים, תחבורה ציבורית וקהילה. גמלאים רבים מעדיפים דירת עיר לנוחות.'
                    ),
                    relevant: true,
                },
            ],
        },

        // ─── DAILY LIFE ────────────────────────────────────────────────────────
        {
            category: 'lifestyle',
            icon: Heart,
            title: txt('Lifestyle & Daily Life', 'אורח חיים ויום-יום'),
            color: 'pink',
            items: [
                {
                    id: 'two-phases',
                    priority: 'high',
                    timing: before(5),
                    title: txt('Plan for Two Retirement Phases', 'תכנן לשני שלבי פרישה'),
                    desc: txt(
                        'Retirement is not uniform: Active Phase (65–75) — higher spending on travel, hobbies, dining; Passive Phase (75+) — lower activity costs but significantly higher healthcare and personal care expenses.',
                        'פרישה אינה אחידה: שלב פעיל (65–75) — הוצאות גבוהות יותר על נסיעות, תחביבים, מסעדות; שלב פסיבי (75+) — עלויות פעילות נמוכות יותר אך הוצאות בריאות וטיפול אישי גבוהות משמעותית.'
                    ),
                    details: txt(
                        'Rule of thumb: Active phase spending is 110–120% of your base retirement budget. Passive phase spending on lifestyle decreases to 80–90%, but healthcare adds 20–40%. Total spending pattern often forms a "smile curve".',
                        'כלל אצבע: הוצאות שלב פעיל הן 110–120% מתקציב הפרישה הבסיסי. הוצאות אורח חיים בשלב פסיבי יורדות ל-80–90%, אך בריאות מוסיפה 20–40%. דפוס ההוצאות הכולל מצייר לעיתות "עקומת חיוך".'
                    ),
                    relevant: retirementYears > 15,
                },
                {
                    id: 'social',
                    priority: 'medium',
                    timing: atRet(),
                    title: txt('Maintain Social Connections', 'שמירה על קשרים חברתיים'),
                    desc: txt(
                        'Social isolation is a major health risk for retirees, associated with cognitive decline, depression, and increased mortality. Plan how you will maintain social connections and build new ones after leaving the workplace.',
                        'בידוד חברתי הוא גורם סיכון בריאותי משמעותי לגמלאים, הקשור לירידה קוגניטיבית, דיכאון ותמותה מוגברת. תכננו כיצד תשמרו קשרים חברתיים ותבנו חדשים לאחר עזיבת מקום העבודה.'
                    ),
                    details: txt(
                        'Options: volunteering, senior clubs (מועדון גמלאים), continuing education (אוניברסיטה לגיל השלישי), religious community, hobby groups, grandchildren involvement, travel groups. Budget for social activities — this is a health investment.',
                        'אפשרויות: התנדבות, מועדון גמלאים, לימוד מתמשך (אוניברסיטה לגיל השלישי), קהילה דתית, חוגים, מעורבות עם נכדים, קבוצות נסיעות. תקצבו לפעילויות חברתיות — זהו השקעה בריאותית.'
                    ),
                    relevant: true,
                },
                {
                    id: 'part-time',
                    priority: isDeficit ? 'high' : 'low',
                    timing: atRet(),
                    title: txt('Part-Time Work Option', 'אפשרות תעסוקה חלקית'),
                    desc: txt(
                        isDeficit
                            ? 'Your plan shows a shortfall. Even a small part-time income (₪2,000–4,000/month) can significantly extend your portfolio longevity and reduce the depletion rate in critical early years.'
                            : 'Part-time work is not just for income — it provides structure, purpose, social connection, and cognitive stimulation. Many retirees find it more fulfilling than full retirement.',
                        isDeficit
                            ? 'תוכניתך מראה גירעון. אפילו הכנסה חלקית קטנה (₪2,000–4,000 לחודש) יכולה לארך משמעותית את חיי התיק ולהפחית את שיעור ההתרוקנות בשנים הראשונות הקריטיות.'
                            : 'תעסוקה חלקית אינה רק להכנסה — היא מספקת מבנה, מטרה, קשרים חברתיים וגירוי קוגניטיבי. גמלאים רבים מוצאים אותה מספקת יותר מפרישה מלאה.'
                    ),
                    details: txt(
                        'Be aware: work income above the NI threshold may reduce old-age allowance. However, the first ₪7,522/month (2024) in work income does not affect the benefit. Consult on the most tax-efficient structure (employee vs. self-employed).',
                        'שימו לב: הכנסת עבודה מעל תקרת ביטוח לאומי עשויה להפחית קצבת זקנה. עם זאת, ₪7,522 ראשונים לחודש (2024) מעבודה אינם משפיעים על הקצבה. התייעצו לגבי המבנה היעיל ביותר מבחינת מס (שכיר מול עצמאי).'
                    ),
                    relevant: true,
                },
            ],
        },

        // ─── DIGITAL & DOCUMENTATION ──────────────────────────────────────────
        {
            category: 'digital',
            icon: Laptop,
            title: txt('Digital & Documentation', 'דיגיטלי ותיעוד'),
            color: 'slate',
            items: [
                {
                    id: 'account-documentation',
                    priority: 'high',
                    timing: before(2),
                    title: txt('Document All Financial Accounts', 'תיעוד כל החשבונות הפיננסיים'),
                    desc: txt(
                        'Create a comprehensive, up-to-date list of all financial accounts — banks, investments, insurance policies, pension/provident funds — with account numbers and contact information. Store in a secure, accessible location known to trusted family members.',
                        'צרו רשימה מקיפה ומעודכנת של כל החשבונות הפיננסיים — בנקים, השקעות, פוליסות ביטוח, קרנות פנסיה/גמל — עם מספרי חשבון ופרטי קשר. שמרו במיקום בטוח ונגיש שמוכר לבני משפחה.'
                    ),
                    details: txt(
                        'Include: bank accounts, brokerage accounts, insurance policies (numbers, company, coverage amount), pension/provident/education funds, real estate documents, loans. Update annually. Consider a password manager for digital credentials.',
                        'כלול: חשבונות בנק, חשבונות ברוקרים, פוליסות ביטוח (מספרים, חברה, סכום כיסוי), קרנות פנסיה/גמל/השתלמות, מסמכי נדל"ן, הלוואות. עדכנו שנתית. שקלו מנהל סיסמאות לפרטי גישה דיגיטלית.'
                    ),
                    relevant: true,
                },
                {
                    id: 'digital-estate',
                    priority: 'medium',
                    timing: before(3),
                    title: txt('Digital Estate Planning', 'תכנון עיזבון דיגיטלי'),
                    desc: txt(
                        'Online accounts, email, social media, cloud storage, cryptocurrency, and digital subscriptions need to be addressed in your estate plan. Many platforms have inactive account policies or memorial settings.',
                        'חשבונות מקוונים, אימייל, רשתות חברתיות, אחסון ענן, מטבעות קריפטו ומנויים דיגיטליים צריכים לכלול בתוכנית העיזבון. לפלטפורמות רבות יש מדיניות לחשבונות לא פעילים.'
                    ),
                    details: txt(
                        'Actions: Set up Google Inactive Account Manager, Facebook legacy contact. Document cryptocurrency keys securely (lost keys = lost funds permanently). Cancel unnecessary subscriptions. Create a digital asset inventory separate from financial accounts.',
                        'פעולות: הגדרת מנהל חשבון לא פעיל של גוגל, איש קשר מורשה בפייסבוק. תעדו מפתחות קריפטו בצורה מאובטחת (מפתחות אבודים = כסף אבוד לצמיתות). בטלו מנויים מיותרים. צרו מלאי נכסים דיגיטליים נפרד מהחשבונות הפיננסיים.'
                    ),
                    relevant: true,
                },
            ],
        },
    ];
}

const COLOR_MAP = {
    blue:   { header: 'text-blue-400',   ring: 'ring-blue-500/30',   bg: 'bg-blue-500/10',   dot: 'bg-blue-400' },
    teal:   { header: 'text-teal-400',   ring: 'ring-teal-500/30',   bg: 'bg-teal-500/10',   dot: 'bg-teal-400' },
    amber:  { header: 'text-amber-400',  ring: 'ring-amber-500/30',  bg: 'bg-amber-500/10',  dot: 'bg-amber-400' },
    green:  { header: 'text-green-400',  ring: 'ring-green-500/30',  bg: 'bg-green-500/10',  dot: 'bg-green-400' },
    rose:   { header: 'text-rose-400',   ring: 'ring-rose-500/30',   bg: 'bg-rose-500/10',   dot: 'bg-rose-400' },
    purple: { header: 'text-purple-400', ring: 'ring-purple-500/30', bg: 'bg-purple-500/10', dot: 'bg-purple-400' },
    orange: { header: 'text-orange-400', ring: 'ring-orange-500/30', bg: 'bg-orange-500/10', dot: 'bg-orange-400' },
    pink:   { header: 'text-pink-400',   ring: 'ring-pink-500/30',   bg: 'bg-pink-500/10',   dot: 'bg-pink-400' },
    slate:  { header: 'text-slate-400',  ring: 'ring-slate-500/30',  bg: 'bg-slate-500/10',  dot: 'bg-slate-400' },
};

const LIGHT_COLOR_MAP = {
    blue:   { header: 'text-blue-700',   ring: 'ring-blue-200',   bg: 'bg-blue-50',   dot: 'bg-blue-500' },
    teal:   { header: 'text-teal-700',   ring: 'ring-teal-200',   bg: 'bg-teal-50',   dot: 'bg-teal-500' },
    amber:  { header: 'text-amber-700',  ring: 'ring-amber-200',  bg: 'bg-amber-50',  dot: 'bg-amber-500' },
    green:  { header: 'text-green-700',  ring: 'ring-green-200',  bg: 'bg-green-50',  dot: 'bg-green-500' },
    rose:   { header: 'text-rose-700',   ring: 'ring-rose-200',   bg: 'bg-rose-50',   dot: 'bg-rose-500' },
    purple: { header: 'text-purple-700', ring: 'ring-purple-200', bg: 'bg-purple-50', dot: 'bg-purple-500' },
    orange: { header: 'text-orange-700', ring: 'ring-orange-200', bg: 'bg-orange-50', dot: 'bg-orange-500' },
    pink:   { header: 'text-pink-700',   ring: 'ring-pink-200',   bg: 'bg-pink-50',   dot: 'bg-pink-500' },
    slate:  { header: 'text-slate-700',  ring: 'ring-slate-200',  bg: 'bg-slate-50',  dot: 'bg-slate-500' },
};

// ── Timing helpers ────────────────────────────────────────────────────────
// timing: { type: 'before'|'after'|'range'|'age'|'ongoing', value: number, valueTo?: number }
// value for 'before'/'after': years relative to retirement (negative = before)
// value for 'age': target age
// value for 'range': start years, valueTo: end years (relative to retirement)
function getTimingStatus(timing, inputs, checked) {
    if (!timing) return null;
    const currentAge = parseFloat(inputs?.currentAge) || 30;
    const retAge     = parseFloat(inputs?.retirementStartAge) || 67;
    const isHe       = false; // resolved per caller
    const yearsToRet = retAge - currentAge;

    let yearsUntilDeadline = null; // positive = still time, negative = overdue

    if (timing.type === 'before') {
        // e.g. value: -5 means "5 years before retirement" → deadline = yearsToRet - 5
        const deadlineFromNow = yearsToRet + timing.value; // value is negative
        yearsUntilDeadline = deadlineFromNow;
    } else if (timing.type === 'after') {
        // value: 1 means "do in first year of retirement" → deadline = yearsToRet + value
        yearsUntilDeadline = yearsToRet + timing.value;
    } else if (timing.type === 'range') {
        // value = start (years from ret), valueTo = end (years from ret)
        const startFromNow = yearsToRet + timing.value;
        const endFromNow   = yearsToRet + (timing.valueTo ?? 0);
        if (currentAge >= retAge + (timing.valueTo ?? 0)) {
            yearsUntilDeadline = -1; // past the window
        } else if (currentAge < retAge + timing.value) {
            yearsUntilDeadline = startFromNow; // before window
        } else {
            yearsUntilDeadline = endFromNow; // inside window
        }
    } else if (timing.type === 'age') {
        yearsUntilDeadline = timing.value - currentAge;
    } else if (timing.type === 'ongoing') {
        return { status: 'ongoing', years: null };
    }

    if (yearsUntilDeadline === null) return null;
    if (checked) return { status: 'done', years: yearsUntilDeadline };
    if (yearsUntilDeadline < 0) return { status: 'overdue', years: yearsUntilDeadline };
    if (yearsUntilDeadline <= 1) return { status: 'urgent', years: yearsUntilDeadline };
    if (yearsUntilDeadline <= 3) return { status: 'soon', years: yearsUntilDeadline };
    return { status: 'ok', years: yearsUntilDeadline };
}

function TimingBadge({ timing, inputs, checked, isLight, language }) {
    const isHe = language === 'he';
    const s = getTimingStatus(timing, inputs, checked);
    if (!s || s.status === 'done') return null;

    const fmt = (y) => {
        if (y === null) return '';
        const abs = Math.abs(y);
        if (abs < 0.5) return isHe ? 'עכשיו' : 'now';
        if (abs < 1.5) return isHe ? 'שנה' : '1 yr';
        return isHe ? `${Math.round(abs)} שנים` : `${Math.round(abs)} yrs`;
    };

    let label, colorClass;

    if (timing.type === 'ongoing') {
        label = isHe ? 'שוטף' : 'Ongoing';
        colorClass = isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/15 text-blue-300';
    } else if (s.status === 'overdue') {
        const abs = Math.abs(s.years);
        label = isHe ? `באיחור ${fmt(s.years)}` : `${fmt(s.years)} overdue`;
        colorClass = isLight ? 'bg-red-100 text-red-700' : 'bg-red-500/20 text-red-300';
    } else if (s.status === 'urgent') {
        label = isHe ? `דחוף — ${fmt(s.years)}` : `Urgent — ${fmt(s.years)}`;
        colorClass = isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-300';
    } else if (s.status === 'soon') {
        label = isHe ? `בקרוב — ${fmt(s.years)}` : `Soon — ${fmt(s.years)}`;
        colorClass = isLight ? 'bg-yellow-100 text-yellow-700' : 'bg-yellow-500/15 text-yellow-300';
    } else {
        label = isHe ? `עוד ${fmt(s.years)}` : `In ${fmt(s.years)}`;
        colorClass = isLight ? 'bg-green-100 text-green-700' : 'bg-green-500/15 text-green-300';
    }

    return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${colorClass}`}>
            📅 {label}
        </span>
    );
}
// ─────────────────────────────────────────────────────────────────────────────

function PriorityBadge({ priority, isLight, language }) {
    const p = PRIORITIES[priority];
    if (!p) return null;
    const label = language === 'he' ? p.he : p.en;
    return (
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${p.color} text-white shrink-0`}>
            {label}
        </span>
    );
}



/** Renders children into document.body anchored at a given DOMRect */
function PopupPortal({ anchorRect, align = 'right', children }) {
    const popupRef = useRef(null);
    const [style, setStyle] = useState({
        position: 'fixed',
        top: anchorRect ? anchorRect.bottom + 4 : 0,
        zIndex: 9999,
        visibility: 'hidden',
    });

    useLayoutEffect(() => {
        const popupEl = popupRef.current;
        if (!popupEl || !anchorRect) return;

        const gap = 4;
        const viewportPadding = 8;
        const popupWidth = popupEl.offsetWidth || 0;
        const popupHeight = popupEl.offsetHeight || 0;
        const spaceBelow = window.innerHeight - anchorRect.bottom - gap - viewportPadding;
        const spaceAbove = anchorRect.top - gap - viewportPadding;
        const openAbove = popupHeight > spaceBelow && spaceAbove > spaceBelow;

        const top = openAbove
            ? Math.max(viewportPadding, anchorRect.top - popupHeight - gap)
            : Math.min(window.innerHeight - popupHeight - viewportPadding, anchorRect.bottom + gap);

        const nextStyle = align === 'right'
            ? {
                position: 'fixed',
                top,
                left: Math.max(viewportPadding, anchorRect.right - popupWidth),
                zIndex: 9999,
                visibility: 'visible',
            }
            : {
                position: 'fixed',
                top,
                left: Math.min(
                    Math.max(viewportPadding, anchorRect.left),
                    window.innerWidth - popupWidth - viewportPadding
                ),
                zIndex: 9999,
                visibility: 'visible',
            };

        setStyle(prev => {
            const sameTop = Math.abs((prev.top ?? 0) - nextStyle.top) < 1;
            const sameLeft = Math.abs((prev.left ?? 0) - nextStyle.left) < 1;
            const sameVisibility = prev.visibility === nextStyle.visibility;
            if (sameTop && sameLeft && sameVisibility) return prev;
            return nextStyle;
        });
    }, [anchorRect, align, children]);

    if (!anchorRect) return null;

    return ReactDOM.createPortal(
        <div ref={popupRef} style={style}>{children}</div>,
        document.body
    );
}

function AiTextRenderer({ text, isLight }) {
    return (
        <div className="space-y-2">
            {text.split('\n').map((line, i) => {
                if (!line.trim()) return null;
                const isBullet = /^[•\-\*]\s/.test(line.trim()) || /^\d+\.\s/.test(line.trim());
                const isHeading = line.startsWith('**') && line.endsWith('**');
                if (isHeading) {
                    return (
                        <p key={i} className={`font-semibold text-[11px] mt-3 mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                            {line.replace(/\*\*/g, '')}
                        </p>
                    );
                }
                const parts = line.split(/(\*\*[^*]+\*\*)/);
                const content = parts.map((p, j) =>
                    p.startsWith('**') && p.endsWith('**')
                        ? <strong key={j} className={isLight ? 'text-gray-900' : 'text-white'}>{p.slice(2, -2)}</strong>
                        : <span key={j}>{p}</span>
                );
                if (isBullet) {
                    return (
                        <div key={i} className={`flex gap-2 ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                            <span className="shrink-0 mt-0.5">•</span>
                            <span>{content}</span>
                        </div>
                    );
                }
                return <p key={i} className={isLight ? 'text-gray-700' : 'text-gray-300'}>{content}</p>;
            })}
        </div>
    );
}

function ChecklistItem({ item, isLight, language, isExpanded, onToggle, checked, onCheck, onConfirmRemove, onKeepItem, isNew, onSeen, onKeepNew, onDismissNew, onManualRemove, onChangeItem, uid, categoryTitle, categoryEmoji, categoryIcon: CatIcon, inputs, results, aiProvider, aiModel, apiKeyOverride, aiExplanation, onSetAiExplanation, isLocked, onToggleLock }) {
    const p = PRIORITIES[item.priority] || PRIORITIES.medium;
    const isHe = language === 'he';

    const [showNote, setShowNote] = useState(false);
    const [noteDraft, setNoteDraft] = useState(item.note || '');
    const [aiExplainLoading, setAiExplainLoading] = useState(false);
    const [aiExplainError, setAiExplainError] = useState(null);
    const [showAiExplain, setShowAiExplain] = useState(false);

    const handleAiExplain = async (e) => {
        e.stopPropagation();
        if (aiExplanation) { setShowAiExplain(v => !v); return; }
        setShowAiExplain(true);
        setAiExplainLoading(true);
        setAiExplainError(null);
        try {
            const text = await explainChecklistItem(item, inputs, results, aiProvider, aiModel, apiKeyOverride, language);
            onSetAiExplanation(item.id, text);
        } catch (err) {
            setAiExplainError(localizeAiError(err, language));
        } finally {
            setAiExplainLoading(false);
        }
    };
    
    const [showReminder, setShowReminder] = useState(false);
    const [reminderDate, setReminderDate] = useState(item.reminder?.date || '');
    const [reminderText, setReminderText] = useState(item.reminder?.text || '');
    const [reminderType, setReminderType] = useState(() => item.reminder?.recurring ? (item.reminder?.recurringType || 'monthly') : 'none');
    const [reminderDay, setReminderDay] = useState(item.reminder?.recurringDay || 10);
    const [reminderInterval, setReminderInterval] = useState(item.reminder?.recurringInterval || 7);

    const reminderBtnRef = useRef(null);
    const noteBtnRef = useRef(null);
    const [reminderAnchor, setReminderAnchor] = useState(null);
    const [noteAnchor, setNoteAnchor] = useState(null);

    // Reset local reminder state when the item's reminder changes externally (e.g. after confirm/delete)
    useEffect(() => {
        setReminderDate(item.reminder?.date || '');
        setReminderText(item.reminder?.text || '');
        setReminderType(item.reminder?.recurring ? (item.reminder?.recurringType || 'monthly') : 'none');
        setReminderDay(item.reminder?.recurringDay || 10);
        setReminderInterval(item.reminder?.recurringInterval || 7);
    }, [item.reminder?.date, item.reminder?.text, item.reminder?.recurring, item.reminder?.recurringType, item.reminder?.recurringDay, item.reminder?.recurringInterval]);

    // Reset note draft when item.note changes externally
    useEffect(() => {
        setNoteDraft(item.note || '');
    }, [item.note]);

    const commitNote = () => {
        const text = noteDraft.trim();
        if (text !== (item.note || '')) {
            const updated = { ...item };
            if (!text) delete updated.note; else updated.note = text;
            onChangeItem(updated);
        }
    };
    const noteDirty = noteDraft.trim() !== (item.note || '').trim();


    return (
        <div id={`checklist-item-${item.id}`} className={`group rounded-lg border transition-all ${checked
                ? (isLight ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-white/5 bg-white/2 opacity-50')
                : isLight
                    ? `border-gray-200 ${item.priority === 'critical' ? 'bg-red-50' : item.priority === 'high' ? 'bg-orange-50/50' : 'bg-white'}`
                    : `border-white/10 ${item.priority === 'critical' ? 'bg-red-500/5' : item.priority === 'high' ? 'bg-orange-500/5' : 'bg-white/3'}`
        }`}>
            <div className="flex items-start">
                {/* Checkbox */}
                <button
                    onClick={(e) => { e.stopPropagation(); onCheck(); }}
                    className={`shrink-0 m-3 mt-3.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${checked
                        ? 'bg-green-500 border-green-500'
                        : isLight ? 'border-gray-300 hover:border-green-400' : 'border-gray-600 hover:border-green-500'}`}
                >
                    {checked && <CheckCircle size={10} className="text-white" />}
                </button>
                {/* Expand button */}
                <button onClick={() => { onToggle(); if (!isExpanded && isNew) onSeen?.(); }} className="flex-1 text-start p-3 ps-0 flex items-start gap-3">
                    <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${p.color}`} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                            <span className={`text-sm font-medium leading-snug ${checked ? 'line-through' : ''} ${isLight ? 'text-gray-900' : 'text-white'}`}>
                                {item.title}
                            </span>
                            {!checked && <PriorityBadge priority={item.priority} isLight={isLight} language={language} />}
                            {!checked && item.timing && <TimingBadge timing={item.timing} inputs={inputs} checked={checked} isLight={isLight} language={language} />}
                            {isNew && !checked && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isLight ? 'bg-green-100 text-green-700' : 'bg-green-500/20 text-green-400'}`}>
                                    {isHe ? 'חדש' : 'New'}
                                </span>
                            )}
                        </div>
                        <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                            {item.desc}
                        </p>
                        {categoryTitle && (
                            <div className={`text-[10px] mt-1.5 flex items-center gap-1 font-medium ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                                {categoryEmoji ? <span>{categoryEmoji}</span> : CatIcon ? <CatIcon size={11} /> : null}
                                {categoryTitle}
                            </div>
                        )}
                    </div>
                </button>
                <div className="flex items-center gap-0.5 shrink-0 me-1 mt-1">
                    <button
                        onClick={() => { onToggle(); if (!isExpanded && isNew) onSeen?.(); }}
                        className={`p-1 rounded transition-colors ${isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {onToggleLock && (
                        <button
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onToggleLock(item.id); }}
                            title={isLocked ? (isHe ? 'נעול — AI לא יסיר סעיף זה (לחץ לביטול)' : 'Locked — AI won\'t remove this item (click to unlock)') : (isHe ? 'לחץ לנעול — מנע מה-AI להסיר' : 'Click to lock — prevent AI from removing')}
                            className={`p-1 rounded transition-colors ${
                                isLocked
                                    ? (isLight ? 'text-amber-600 hover:text-amber-700' : 'text-amber-400 hover:text-amber-300')
                                    : (isLight ? 'text-gray-300 hover:text-gray-500' : 'text-gray-600 hover:text-gray-400')
                            }`}
                        >
                            {isLocked ? <Lock size={12} /> : <LockOpen size={12} />}
                        </button>
                    )}
                    {aiProvider && aiModel && (
                        <button
                            onMouseDown={handleAiExplain}
                            title={isHe ? 'הסבר AI' : 'AI Explain'}
                            className={`px-1.5 py-0.5 rounded transition-colors text-[10px] font-bold ${
                                showAiExplain
                                    ? (isLight ? 'text-purple-700 bg-purple-200' : 'text-purple-200 bg-purple-500/30')
                                    : aiExplanation
                                        ? (isLight ? 'text-purple-600 bg-purple-100 ring-1 ring-purple-300' : 'text-purple-300 bg-purple-500/20 ring-1 ring-purple-500/40')
                                        : (isLight ? 'text-gray-400 hover:text-purple-600 hover:bg-purple-50' : 'text-gray-500 hover:text-purple-400 hover:bg-purple-500/10')
                            }`}
                        >
                            AI
                        </button>
                    )}
                    <button
                        ref={reminderBtnRef}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (!showReminder) { setReminderAnchor(reminderBtnRef.current?.getBoundingClientRect()); } setShowReminder(v => !v); setShowNote(false); setNoteAnchor(null); }}
                        className={`p-1 rounded transition-colors ${showReminder
                            ? (isLight ? 'text-blue-600 bg-blue-100' : 'text-blue-400 bg-blue-500/20')
                            : item.reminder?.date
                                ? (isLight ? 'text-blue-500 hover:text-blue-600' : 'text-blue-400 hover:text-blue-300')
                                : (isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300')}`}
                        title={isHe ? 'תזכורת' : 'Reminder'}
                    >
                        <Bell size={13} />
                    </button>
                    <button
                        ref={noteBtnRef}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (!showNote) { setNoteAnchor(noteBtnRef.current?.getBoundingClientRect()); } setShowNote(v => !v); setShowReminder(false); setReminderAnchor(null); }}
                        className={`p-1 rounded transition-colors ${showNote
                            ? (isLight ? 'text-amber-600 bg-amber-100' : 'text-amber-400 bg-amber-500/20')
                            : item.note
                                ? (isLight ? 'text-amber-500 hover:text-amber-600' : 'text-amber-400 hover:text-amber-300')
                                : (isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300')}`}
                        title={isHe ? 'הערה' : 'Note'}
                    >
                        <MessageSquare size={13} />
                    </button>
                    {onManualRemove && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onManualRemove(); }}
                            title={isHe ? 'הסר' : 'Remove'}
                            className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isLight ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'}`}
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                </div>
            </div>
            {/* Popups via portal to escape overflow-hidden parents */}
            {showReminder && reminderAnchor && (
                <PopupPortal anchorRect={reminderAnchor} align={isHe ? 'left' : 'right'}>
                    <div
                        className={`w-68 rounded-lg border shadow-xl overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                        style={{ width: '272px' }}
                        dir={isHe ? 'rtl' : 'ltr'}
                    >
                        <div className={`flex items-center justify-between px-2.5 py-2 border-b ${isLight ? 'bg-blue-50 border-blue-100' : 'bg-blue-500/10 border-white/10'}`}>
                            <div className="flex items-center gap-1.5">
                                <Bell size={12} className={isLight ? 'text-blue-500' : 'text-blue-400'} />
                                <span className={`text-[11px] font-semibold ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>
                                    {isHe ? 'תזכורת' : 'Reminder'}
                                </span>
                                {item.note && (
                                    <span className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-400'}`} title={item.note}>
                                        <MessageSquare size={9} />
                                        {isHe ? 'יש הערה' : 'Has note'}
                                    </span>
                                )}
                            </div>
                            {item.reminder?.date && (
                                <button
                                    onMouseDown={e => {
                                        e.preventDefault();
                                        const updated = { ...item };
                                        delete updated.reminder;
                                        onChangeItem(updated, { reminderChanged: true });
                                        setReminderDate('');
                                        setReminderText('');
                                        setShowReminder(false);
                                        setReminderAnchor(null);
                                    }}
                                    className={`transition-colors ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}
                                    title={isHe ? 'מחק תזכורת' : 'Delete reminder'}
                                ><Trash2 size={11} /></button>
                            )}
                        </div>
                        <div className="p-2.5 space-y-2">
                            {item.note && (
                                <div className={`rounded text-[11px] border ${isLight ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>
                                    <div className={`flex items-center gap-1 px-2 py-1 border-b text-[10px] font-semibold ${isLight ? 'border-amber-200 text-amber-600' : 'border-amber-500/20 text-amber-400'}`}>
                                        <MessageSquare size={9} />
                                        {isHe ? 'הערה לסעיף' : 'Item note'}
                                    </div>
                                    <div className="px-2 py-1.5 leading-snug">{item.note}</div>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <div className={`flex rounded-lg overflow-hidden border text-[10px] font-semibold ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                                    {[
                                        { val: 'none', label: isHe ? 'תאריך' : 'Date' },
                                        { val: 'monthly', label: isHe ? 'חודשי' : 'Monthly', icon: true },
                                        { val: 'interval', label: isHe ? 'כל X ימים' : 'Every X days', icon: true },
                                    ].map(opt => (
                                        <button key={opt.val} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setReminderType(opt.val)}
                                            className={`flex-1 flex items-center justify-center gap-0.5 py-1.5 transition-colors ${reminderType === opt.val ? (isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-500/30 text-purple-300') : (isLight ? 'bg-white text-slate-400 hover:bg-slate-50' : 'bg-transparent text-gray-500 hover:bg-white/5')}`}>
                                            {opt.icon && <RefreshCw size={8} />}{opt.label}
                                        </button>
                                    ))}
                                </div>
                                {reminderType === 'monthly' ? (
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'כל ה-' : 'Day'}</span>
                                        <input type="number" min={1} max={28} value={reminderDay} onChange={e => setReminderDay(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
                                            className={`w-14 px-1.5 py-1 text-xs rounded border outline-none text-center ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/20 bg-white/10 text-gray-200'}`} />
                                        <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'לחודש' : 'of month'}</span>
                                    </div>
                                ) : reminderType === 'interval' ? (
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'כל' : 'Every'}</span>
                                        <input type="number" min={1} max={365} value={reminderInterval} onChange={e => setReminderInterval(Math.min(365, Math.max(1, parseInt(e.target.value) || 1)))}
                                            className={`w-14 px-1.5 py-1 text-xs rounded border outline-none text-center ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/20 bg-white/10 text-gray-200'}`} />
                                        <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'ימים' : 'days'}</span>
                                    </div>
                                ) : (
                                    <input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)}
                                        className={`w-full text-xs px-2 py-1 rounded border outline-none ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/20 bg-white/10 text-gray-200'}`} />
                                )}
                            </div>
                            <div>
                                <label className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'טקסט (אופציונלי)' : 'Note (optional)'}</label>
                                <input
                                    type="text"
                                    value={reminderText}
                                    onChange={e => setReminderText(e.target.value)}
                                    placeholder={isHe ? 'למשל: לבדוק מול סוכן...' : 'e.g. check with agent...'}
                                    className={`mt-0.5 w-full text-xs px-2 py-1 rounded border outline-none ${isLight ? 'border-slate-200 bg-white text-slate-700 placeholder-slate-300' : 'border-white/20 bg-white/10 text-gray-200 placeholder-gray-600'}`}
                                />
                            </div>
                            <button
                                onMouseDown={e => {
                                    e.preventDefault();
                                    const computedDate = reminderType === 'monthly' ? nextOccurrenceOf(reminderDay) : reminderType === 'interval' ? nextOccurrenceByInterval(reminderInterval) : reminderDate;
                                    if (!computedDate) return;
                                    if (uid) undismissReminder(uid, item.id).catch(() => {});
                                    onChangeItem(
                                        { ...item, reminder: {
                                            date: computedDate,
                                            text: reminderText.trim(),
                                            ...(reminderType !== 'none' ? { recurring: true, recurringType: reminderType, ...(reminderType === 'monthly' ? { recurringDay: reminderDay } : { recurringInterval: reminderInterval }) } : {}),
                                        }},
                                        { reminderChanged: true, suppressImmediateAlert: true }
                                    );
                                    setShowReminder(false);
                                    setReminderAnchor(null);
                                }}
                                disabled={reminderType === 'none' && !reminderDate}
                                className={`w-full text-xs py-1.5 rounded font-medium transition-colors ${(reminderType !== 'none' || reminderDate)
                                    ? (isLight ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-blue-600 text-white hover:bg-blue-500')
                                    : (isLight ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-gray-600 cursor-not-allowed')}`}
                            >
                                {isHe ? 'שמור תזכורת' : 'Save reminder'}
                            </button>
                        </div>
                    </div>
                </PopupPortal>
            )}
            {showNote && noteAnchor && (
                <PopupPortal anchorRect={noteAnchor} align={isHe ? 'left' : 'right'}>
                    <div
                        className={`w-64 rounded-lg border shadow-xl border-s-4 border-s-amber-400 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-white/20'}`}
                        dir={isHe ? 'rtl' : 'ltr'}
                    >
                        <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5">
                        <span
                            className={`text-[10px] font-medium truncate flex-1 min-w-0 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}
                            title={isHe ? `הערה: ${item.title}` : `Note: ${item.title}`}
                        >
                            {isHe ? `הערה: ${item.title}` : `Note: ${item.title}`}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0 ms-1">
                            <button
                                onMouseDown={e => {
                                    e.preventDefault();
                                    if (!noteDirty) return;
                                    commitNote();
                                    setShowNote(false);
                                    setNoteAnchor(null);
                                }}
                                disabled={!noteDirty}
                                className={`transition-colors ${noteDirty
                                    ? (isLight ? 'text-emerald-600 hover:text-emerald-700' : 'text-emerald-400 hover:text-emerald-300')
                                    : (isLight ? 'text-slate-200 cursor-not-allowed' : 'text-gray-600 cursor-not-allowed')}`}
                                title={isHe ? 'שמור הערה' : 'Save note'}
                            >
                                <Save size={11} />
                            </button>
                            {noteDraft && (
                                <button
                                    onMouseDown={e => { e.preventDefault(); setNoteDraft(''); const updated = { ...item }; delete updated.note; onChangeItem(updated); setShowNote(false); setNoteAnchor(null); }}
                                    className={`transition-colors ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}
                                    title={isHe ? 'מחק הערה' : 'Delete note'}
                                >
                                    <Trash2 size={11} />
                                </button>
                            )}
                        </div>
                    </div>
                        <textarea
                            autoFocus
                            rows={4}
                            value={noteDraft}
                            onChange={e => setNoteDraft(e.target.value)}
                            onBlur={() => { commitNote(); setShowNote(false); setNoteAnchor(null); }}
                            onKeyDown={e => { if (e.key === 'Escape') { setNoteDraft(item.note || ''); setShowNote(false); setNoteAnchor(null); } if (e.key === 'Enter' && e.ctrlKey) { commitNote(); setShowNote(false); setNoteAnchor(null); } }}
                            placeholder={isHe ? 'הערה...' : 'Note...'}
                            className={`w-full text-xs bg-transparent outline-none resize-none px-2 py-1.5 hide-scrollbar ${isLight ? 'text-gray-800 placeholder-slate-300' : 'text-white placeholder-gray-500'}`}
                        />
                    </div>
                </PopupPortal>
            )}
            {isNew && !checked && (onKeepNew || onDismissNew) && (
                <div className={`flex items-center gap-2 px-3 pb-2 ms-10 text-xs`}>
                    <span className={isLight ? 'text-green-700' : 'text-green-400'}>
                        {isHe ? 'פריט חדש מה-AI. מה תרצה לעשות?' : 'New AI item. What would you like to do?'}
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); onKeepNew?.(); }}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium ${isLight ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                    >
                        {isHe ? 'שמור' : 'Keep'}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDismissNew?.(); }}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium ${isLight ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
                    >
                        {isHe ? 'בטל' : 'Dismiss'}
                    </button>
                </div>
            )}
            {isExpanded && item.details && (
                <div className={`px-3 pb-3 pt-0 ms-10 text-xs leading-relaxed border-t ${isLight ? 'border-gray-100 text-gray-700 bg-white/60' : 'border-white/5 text-gray-300'}`}>
                    <div className="pt-2">{item.details}</div>
                </div>
            )}
            {showAiExplain && (
                <div className={`mx-3 mb-3 rounded-lg border text-xs ${isLight ? 'bg-purple-50 border-purple-100' : 'bg-purple-500/10 border-purple-500/20'}`}>
                    <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isLight ? 'border-purple-100' : 'border-purple-500/20'}`}>
                        <span className={`font-semibold text-[11px] ${isLight ? 'text-purple-700' : 'text-purple-300'}`}>{isHe ? 'הסבר AI' : 'AI Explanation'}</span>
                        <button
                            onMouseDown={async (e) => {
                                e.preventDefault(); e.stopPropagation();
                                onSetAiExplanation(item.id, null);
                                setAiExplainLoading(true);
                                setAiExplainError(null);
                                try {
                                    const text = await explainChecklistItem(item, inputs, results, aiProvider, aiModel, apiKeyOverride, language);
                                    onSetAiExplanation(item.id, text);
                                } catch (err) {
                                    setAiExplainError(localizeAiError(err, language));
                                } finally {
                                    setAiExplainLoading(false);
                                }
                            }}
                            disabled={aiExplainLoading}
                            title={isHe ? 'רענן' : 'Refresh'}
                            className={`p-1 rounded transition-colors disabled:opacity-40 ${isLight ? 'text-purple-400 hover:text-purple-700 hover:bg-purple-100' : 'text-purple-500 hover:text-purple-300 hover:bg-purple-500/20'}`}
                        >
                            <RefreshCw size={11} className={aiExplainLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    {aiExplainLoading && (
                        <div className="flex items-center gap-2 px-3 py-2">
                            <RefreshCw size={12} className="animate-spin text-purple-400" />
                            <span className={isLight ? 'text-purple-600' : 'text-purple-300'}>{isHe ? 'מייצר הסבר…' : 'Generating explanation…'}</span>
                        </div>
                    )}
                    {aiExplainError && (
                        <div className={`px-3 py-2 ${isLight ? 'text-red-600' : 'text-red-400'}`}>{aiExplainError}</div>
                    )}
                    {aiExplanation && (
                        <div className="px-3 py-2 text-xs leading-relaxed">
                            <AiTextRenderer text={aiExplanation} isLight={isLight} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function RetirementChecklist({ results, inputs, language, t, aiProvider, aiModel, apiKeyOverride }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isRtl = language === 'he';
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;

    const [expandedCategories, setExpandedCategories] = useState(new Set());
    const [expandedItems, setExpandedItems] = useState(new Set());
    const [aiData, setAiData] = useState(null);           // { categories, snapshot, updatedAt }
    const [dbLoaded, setDbLoaded] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [newItemIds, setNewItemIds] = useState(new Set()); // IDs added in the last AI run
    const [seenNewIds, setSeenNewIds] = useState(new Set()); // new items the user has expanded
    const [dismissedItems, setDismissedItems] = useState([]); // ever-dismissed/removed items: [{id, catId, categoryTitle, item}]
    const [keptItemIds, setKeptItemIds] = useState(new Set()); // items user explicitly kept (AI won't re-flag)
    const [aiSilentLoading, setAiSilentLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [filterMode, setFilterMode] = useState(null);
    const [timingFilter, setTimingFilter] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [overviewOpen, setOverviewOpen] = useState(false);
    const [overviewText, setOverviewText] = useState(null);
    const [overviewStale, setOverviewStale] = useState(false);
    const [overviewLoading, setOverviewLoading] = useState(false);
    const [overviewError, setOverviewError] = useState(null);
    const overviewStaleInitRef = useRef(false);
    const overviewDragRef = useRef(null);
    const overviewPosRef = useRef({ x: 0, y: 0 });
    const [overviewPos, setOverviewPos] = useState({ x: 0, y: 0 });
    const [aiTimestamp, setAiTimestamp] = useState(null);
    const [checkedItems, setCheckedItems] = useState(new Set());
    const [aiExplanations, setAiExplanations] = useState({});
    const handleSetAiExplanation = useCallback((itemId, text) => {
        setAiExplanations(prev => ({ ...prev, [itemId]: text }));
    }, []);

    const handleOpenOverviewRef = useRef(null);
    useEffect(() => {
        const handler = () => handleOpenOverviewRef.current?.();
        window.addEventListener('app:openChecklistOverview', handler);
        return () => window.removeEventListener('app:openChecklistOverview', handler);
    }, []);

    // Load persisted checklist state from Firestore on mount
    useEffect(() => {
        if (!uid) { setDbLoaded(true); return; }
        getChecklistState(uid).then(saved => {
            if (saved?.categories?.length) {
                setAiData({ categories: saved.categories, snapshot: saved.snapshot || null });
                setAiTimestamp(saved.updatedAt || null);
                // Initial sync to sessionStorage so popups trigger on login
                const allFlatItems = saved.categories.flatMap(c => c.items);
                syncComponentReminders('checklist', allFlatItems, false);
            }
            if (Array.isArray(saved?.checkedItems)) {
                setCheckedItems(new Set(saved.checkedItems));
            }
            if (Array.isArray(saved?.dismissedItems)) {
                setDismissedItems(saved.dismissedItems);
            }
            if (Array.isArray(saved?.keptItemIds)) {
                setKeptItemIds(new Set(saved.keptItemIds));
            }
            if (saved?.aiExplanations && typeof saved.aiExplanations === 'object') {
                setAiExplanations(saved.aiExplanations);
            }
            setDbLoaded(true);
        }).catch(err => {
            console.error('[RetirementChecklist] Failed to load checklist state from Firestore:', err);
            setDbLoaded(true);
        });
    }, [uid]);

    // Load overview from its own dedicated Firestore document — isolated from checklist state saves
    const overviewDbLoadedRef = useRef(false);
    useEffect(() => {
        if (!uid) { overviewDbLoadedRef.current = true; return; }
        overviewStaleInitRef.current = false;
        getChecklistOverview(uid).then(saved => {
            if (saved?.overviewText) {
                setOverviewText(saved.overviewText);
                setOverviewStale(false);
            }
            overviewDbLoadedRef.current = true;
        }).catch(err => {
            console.error('[Checklist overview load error]', err);
            overviewDbLoadedRef.current = true;
        });
    }, [uid]);

    // Stable refs so doRefresh never becomes stale
    const latestRef = useRef({});
    latestRef.current = { inputs, results, aiProvider, aiModel, apiKeyOverride, language };
    const aiDataRef = useRef(null);
    aiDataRef.current = aiData;
    const dismissedItemsRef = useRef([]);
    dismissedItemsRef.current = dismissedItems;
    const dismissedItemIdsRef = useRef(new Set());
    dismissedItemIdsRef.current = new Set(dismissedItems.map(d => d.id));
    const keptItemIdsRef = useRef(new Set());
    keptItemIdsRef.current = keptItemIds;
    const refreshIdRef = useRef(0);
    const autoTimerRef = useRef(null);

    const getSnapshot = (inp, res) => JSON.stringify({
        a: inp?.currentAge, b: inp?.retirementStartAge, c: inp?.retirementEndAge,
        d: inp?.currentSavings, e: inp?.monthlyContribution, f: inp?.monthlyNetIncomeDesired,
        g: inp?.annualReturnRate, h: inp?.inflationRate,
        i: res?.balanceAtRetirement != null ? Math.round(res.balanceAtRetirement) : null,
        j: res?.ranOutAtAge ?? null,
        k: res?.surplus != null ? Math.round(res.surplus) : null,
        l: inp?.taxRate, m: inp?.withdrawalStrategy, n: inp?.enableBuckets,
        o: inp?.pensionIncomeSources?.length,
    });

    const persistState = useCallback((categories, snapshot) => {
        if (!uid) return;
        const ts = Date.now();
        setChecklistState(uid, { categories, snapshot, updatedAt: ts })
            .then(() => setAiTimestamp(ts))
            .catch(err => console.error('[Checklist save]', err));
    }, [uid]);

    // Mark overview stale when checklist data changes after initial load
    const overviewTextRef = useRef(null);
    overviewTextRef.current = overviewText;
    useEffect(() => {
        if (!dbLoaded || !overviewDbLoadedRef.current) return;
        if (!overviewStaleInitRef.current) { overviewStaleInitRef.current = true; return; }
        if (overviewTextRef.current) setOverviewStale(true);
    }, [aiData, dbLoaded]);

    // Persist AI explanations to Firestore whenever they change (after initial load)
    const aiExplanationsLoadedRef = useRef(false);
    useEffect(() => {
        if (!dbLoaded) return; // wait until initial load is done
        if (!aiExplanationsLoadedRef.current) { aiExplanationsLoadedRef.current = true; return; } // skip the load-triggered render
        if (!uid || Object.keys(aiExplanations).length === 0) return;
        setChecklistState(uid, { aiExplanations }).catch(err =>
            console.error('[Checklist] Failed to save AI explanations:', err)
        );
    }, [aiExplanations, uid, dbLoaded]);

    // Expose uid to toggleChecked via ref so it doesn't need to be a dep
    const uidRef = useRef(uid);
    uidRef.current = uid;

    useEffect(() => {
        const handleScroll = (e) => {
            const { id } = e.detail;
            const activeCategories = aiDataRef.current ? aiDataRef.current.categories : buildItems(latestRef.current.inputs, latestRef.current.results, latestRef.current.language);
            const cat = activeCategories.find(c => c.items && c.items.some(i => i.id === id));
            if (cat) {
                 setExpandedCategories(prev => new Set([...prev, cat.category || cat.id]));
                 setExpandedItems(prev => new Set([...prev, id]));
                 setTimeout(() => {
                     const el = document.getElementById(`checklist-item-${id}`);
                     if (el) {
                         el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                         const oldBg = el.style.backgroundColor;
                         const oldTransition = el.style.transition;
                         el.style.transition = 'background-color 0.5s';
                         el.style.backgroundColor = 'rgba(234, 179, 8, 0.3)'; // yellow
                         setTimeout(() => {
                             el.style.backgroundColor = oldBg;
                             setTimeout(() => { el.style.transition = oldTransition; }, 500);
                         }, 2000);
                     }
                 }, 100);
            }
        };
        window.addEventListener('rc-scroll-to-checklist-item', handleScroll);
        return () => window.removeEventListener('rc-scroll-to-checklist-item', handleScroll);
    }, []);

    const doRefresh = useCallback(async (silent = false) => {
        const { inputs, results, aiProvider, aiModel, apiKeyOverride, language } = latestRef.current;
        if (!aiProvider || !aiModel) return;
        const id = ++refreshIdRef.current;
        if (silent) setAiSilentLoading(true);
        else { setAiLoading(true); setAiError(null); }
        try {
            const staticBase = buildItems(latestRef.current.inputs, latestRef.current.results, latestRef.current.language);
            const staticNormalized = staticBase.map(cat => ({ id: cat.category, title: cat.title, emoji: '', items: cat.items }));
            // First run: use static as base. Subsequent runs: use previous result for stability.
            const prevCategories = aiDataRef.current?.categories || null;
            const existingCats = prevCategories || staticNormalized;
            const data = await generateRetirementChecklistInsights(
                inputs, results, aiProvider, aiModel, apiKeyOverride, language, existingCats, dismissedItemIdsRef.current, keptItemIdsRef.current, prevCategories
            );
            if (id !== refreshIdRef.current) return;
            const snapshot = getSnapshot(inputs, results);

            // Auto-move AI-suggested removals to dismissedItems instead of showing inline prompts
            const aiRemovedEntries = [];
            const cleanedCategories = data.categories.map(cat => ({
                ...cat,
                items: cat.items.filter(item => {
                    if (!item.aiSuggestedRemoval) return true;
                    // Already in dismissed list — skip
                    if (dismissedItemIdsRef.current.has(item.id)) return false;
                    aiRemovedEntries.push({ id: item.id, catId: cat.id, categoryTitle: cat.title, item: { ...item, aiSuggestedRemoval: false } });
                    return false;
                }),
            })).filter(cat => cat.items.length > 0);

            if (aiRemovedEntries.length > 0) {
                setDismissedItems(prev => {
                    const existingIds = new Set(prev.map(d => d.id));
                    const toAdd = aiRemovedEntries.filter(e => !existingIds.has(e.id));
                    if (!toAdd.length) return prev;
                    const next = [...prev, ...toAdd];
                    if (uid) setChecklistState(uid, { dismissedItems: next }).catch(() => {});
                    return next;
                });
            }

            const newAiData = { categories: cleanedCategories, snapshot };
            setAiData(newAiData);
            setAiTimestamp(Date.now());
            setAiError(null);
            persistState(cleanedCategories, snapshot);
            // "New" = IDs that weren't in the previous result (reliable, content-stable)
            const prevIds = new Set((prevCategories || []).flatMap(c => c.items.map(i => i.id)));
            const actuallyNew = cleanedCategories.flatMap(c => c.items).filter(i => !prevIds.has(i.id));
            setNewItemIds(actuallyNew.length ? new Set(actuallyNew.map(i => i.id)) : new Set());
            setSeenNewIds(new Set());
        } catch (err) {
            if (id !== refreshIdRef.current) return;
            if (!silent) setAiError(err.message);
        } finally {
            if (id === refreshIdRef.current) {
                if (silent) setAiSilentLoading(false);
                else setAiLoading(false);
            }
        }
    }, [persistState, uid]);

    const handleRefresh = useCallback(() => {
        doRefresh(false);
    }, [doRefresh]);

    const fetchOverview = useCallback(async () => {
        setOverviewLoading(true);
        setOverviewError(null);
        try {
            const { inputs: inp, results: res, aiProvider: prov, aiModel: mod, apiKeyOverride: key, language: lang } = latestRef.current;
            const cats = aiDataRef.current?.categories || buildItems(inp, res, lang);
            const text = await generateChecklistOverview(cats, inp, res, prov, mod, key, lang);
            setOverviewText(text);
            setOverviewStale(false);
            if (uidRef.current) {
                setChecklistOverview(uidRef.current, text).catch(err => console.error('[Checklist overview save error]', err));
            }
        } catch (err) {
            setOverviewError(localizeAiError(err, latestRef.current.language));
        } finally {
            setOverviewLoading(false);
        }
    }, []);

    const handleOpenOverview = useCallback(() => {
        setOverviewOpen(true);
        setOverviewPos({ x: 0, y: 0 });
        if (!dbLoaded || !overviewDbLoadedRef.current) return;
        if (!overviewText || overviewStale) fetchOverview();
    }, [overviewText, overviewStale, fetchOverview, dbLoaded]);
    handleOpenOverviewRef.current = handleOpenOverview;

    const startDrag = useCallback((e) => {
        if (e.button !== 0) return;
        const startX = e.clientX - overviewPosRef.current.x;
        const startY = e.clientY - overviewPosRef.current.y;
        const onMove = (ev) => {
            const pos = { x: ev.clientX - startX, y: ev.clientY - startY };
            overviewPosRef.current = pos;
            setOverviewPos({ ...pos });
        };
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, []);

    useEffect(() => {
        const handleConfirm = (e) => {
            const { id } = e.detail;
            if (!aiDataRef.current || !aiDataRef.current.categories) return;

            let changed = false;
            const newCategories = aiDataRef.current.categories.map(c => {
                if (!c.items) return c;
                let changedItems = false;
                const newItems = c.items.map(i => {
                    if (i.id === id && i.reminder) {
                        changed = true;
                        changedItems = true;
                        const { reminder, ...rest } = i;
                        return rest;
                    }
                    return i;
                });
                return changedItems ? { ...c, items: newItems } : c;
            });

            if (changed) {
                // tell the global sync we handled it
                window.__rc_handling_reminder_confirm = id;
                const newAiData = { ...aiDataRef.current, categories: newCategories };
                setAiData(newAiData);
                persistState(newAiData.categories, newAiData.snapshot);
                const allFlatItems = newAiData.categories.flatMap(cat => cat.items);
                syncComponentReminders('checklist', allFlatItems, true);
                
                setTimeout(() => { window.__rc_handling_reminder_confirm = null; }, 500);
            }
        };
        window.addEventListener('rc-reminder-confirmed', handleConfirm);
        return () => window.removeEventListener('rc-reminder-confirmed', handleConfirm);
    }, [persistState]);

    const staticCategories = useMemo(
        () => buildItems(inputs, results, language),
        [inputs, results, language]
    );

    const handleChangeItem = useCallback((catId, updatedItem, options = {}) => {
        let changed = false;
        let newAiData = null;
        const reminderTouched = options.reminderChanged === true;
        const suppressImmediateAlert = options.suppressImmediateAlert === true;
        const sourceCategories = aiDataRef.current?.categories || staticCategories;
        const existingCategory = sourceCategories.find(c => c.category === catId || c.id === catId);
        const previousReminder = existingCategory?.items?.find(i => i.id === updatedItem.id || i.title === updatedItem.title)?.reminder || null;

        if (aiDataRef.current && aiDataRef.current.categories) {
            newAiData = { ...aiDataRef.current };
            newAiData.categories = newAiData.categories.map(c => {
                if (c.category !== catId && c.id !== catId) return c;
                const itemIdx = c.items.findIndex(i => i.id === updatedItem.id || i.title === updatedItem.title);
                if (itemIdx === -1) return c;
                changed = true;
                const newItems = [...c.items];
                newItems[itemIdx] = updatedItem;
                return { ...c, items: newItems };
            });
        }

        if (!changed) {
            // Build existing item data map so we preserve note/reminder on other items
            const existingItemData = {};
            for (const cat of (aiDataRef.current?.categories || [])) {
                for (const it of (cat.items || [])) {
                    existingItemData[it.id] = it;
                }
            }
            const base = staticCategories
                .map(cat => ({
                    id: cat.category,
                    title: cat.title,
                    emoji: '',
                    items: cat.items
                        .filter(i => i.relevant)
                        .map(i => {
                            if (i.id === updatedItem.id && cat.category === catId) return updatedItem;
                            const existing = existingItemData[i.id] || {};
                            return {
                                id: i.id,
                                priority: i.priority,
                                title: i.title,
                                description: i.desc || '',
                                details: i.details || '',
                                ...(existing.note ? { note: existing.note } : {}),
                                ...(existing.reminder ? { reminder: existing.reminder } : {}),
                                ...(existing.timing ? { timing: existing.timing } : {}),
                            };
                        }),
                }))
                .filter(cat => cat.items.length > 0);
            
            changed = true;
            newAiData = { categories: base, snapshot: getSnapshot(latestRef.current.inputs, latestRef.current.results) };
        }

        if (changed && newAiData) {
            setAiData(newAiData);
            persistState(newAiData.categories, newAiData.snapshot);
            const allFlatItems = newAiData.categories.flatMap(c => c.items);
            const reminderChanged = reminderTouched || JSON.stringify(previousReminder || null) !== JSON.stringify(updatedItem.reminder || null);
            if (reminderChanged && updatedItem?.id) {
                if (suppressImmediateAlert) {
                    silenceReminder(updatedItem.id, 'checklist');
                } else {
                    forgetReminderShown(updatedItem.id, 'checklist');
                }
            }
            syncComponentReminders('checklist', allFlatItems, !reminderChanged);
        }
    }, [staticCategories, persistState]);


    // Clear list only (no AI call) — next auto or manual refresh starts fresh
    const handleClearList = useCallback(() => {
        setAiData(null);
        setAiTimestamp(null);
        if (uid) setChecklistState(uid, { categories: [], snapshot: null, updatedAt: Date.now() }).catch(() => {});
    }, [uid]);

    // Reset to the fixed static base list — AI will diff from this clean baseline
    const handleResetToBase = useCallback(() => {
        setNewItemIds(new Set());
        setSeenNewIds(new Set());
        const base = staticCategories
            .map(cat => ({
                id: cat.category,
                title: cat.title,
                emoji: '',
                items: cat.items
                    .filter(i => i.relevant)
                    .map(i => ({
                        id: i.id,
                        priority: i.priority,
                        title: i.title,
                        description: i.desc || '',
                        details: i.details || '',
                    })),
            }))
            .filter(cat => cat.items.length > 0);
        const snap = getSnapshot(inputs, results);
        const ts = Date.now();
        setAiData({ categories: base, snapshot: snap });
        setAiTimestamp(ts);
        if (uid) setChecklistState(uid, { categories: base, snapshot: snap, updatedAt: ts }).catch(() => {});
    }, [uid, staticCategories, inputs, results]);

    // Confirm AI's removal suggestion — actually delete the item, remember it as dismissed
    const handleConfirmRemove = useCallback((catId, itemId) => {
        const cat = aiDataRef.current?.categories?.find(c => c.id === catId);
        const item = cat?.items?.find(i => i.id === itemId);
        const categoryTitle = cat ? getCategoryTitle(cat, latestRef.current.language) : catId;
        setAiData(prev => {
            if (!prev?.categories) return prev;
            const categories = prev.categories
                .map(c => c.id !== catId ? c : { ...c, items: c.items.filter(i => i.id !== itemId) })
                .filter(c => c.items.length > 0);
            const next = { ...prev, categories };
            if (uid) setChecklistState(uid, { categories, snapshot: prev.snapshot, updatedAt: Date.now() }).catch(() => {});
            syncComponentReminders('checklist', categories.flatMap(c => c.items), true);
            return next;
        });
        silenceReminder(itemId, 'checklist');
        if (item) {
            setDismissedItems(prev => {
                if (prev.some(d => d.id === itemId)) return prev;
                const next = [...prev, { id: itemId, catId, categoryTitle, item: { ...item, aiSuggestedRemoval: false } }];
                if (uid) setChecklistState(uid, { dismissedItems: next }).catch(() => {});
                return next;
            });
        }
    }, [uid]);

    // Dismiss AI's removal suggestion — keep the item, clear the flag, remember choice permanently
    const handleKeepItem = useCallback((catId, itemId) => {
        setAiData(prev => {
            if (!prev?.categories) return prev;
            const categories = prev.categories.map(cat =>
                cat.id !== catId ? cat : {
                    ...cat,
                    items: cat.items.map(i => i.id !== itemId ? i : { ...i, aiSuggestedRemoval: false })
                }
            );
            const next = { ...prev, categories };
            if (uid) setChecklistState(uid, { categories, snapshot: prev.snapshot, updatedAt: Date.now() }).catch(() => {});
            return next;
        });
        setKeptItemIds(prev => {
            if (prev.has(itemId)) return prev;
            const next = new Set([...prev, itemId]);
            if (uid) setChecklistState(uid, { keptItemIds: [...next] }).catch(() => {});
            return next;
        });
    }, [uid]);

    // Keep a new AI item (just clear the "new" badge)
    const handleKeepNewItem = useCallback((itemId) => {
        setSeenNewIds(prev => new Set([...prev, itemId]));
    }, []);

    // Toggle lock on an item — locked items are protected from AI removal
    const handleToggleLock = useCallback((itemId) => {
        setKeptItemIds(prev => {
            const next = new Set(prev);
            next.has(itemId) ? next.delete(itemId) : next.add(itemId);
            if (uid) setChecklistState(uid, { keptItemIds: [...next] }).catch(() => {});
            return next;
        });
    }, [uid]);

    // Dismiss a new AI item: remove from list + remember forever (with full data for restore)
    const handleDismissNewItem = useCallback((catId, itemId) => {
        const cat = aiDataRef.current?.categories?.find(c => c.id === catId);
        const item = cat?.items?.find(i => i.id === itemId);
        const categoryTitle = cat ? getCategoryTitle(cat, latestRef.current.language) : catId;
        setNewItemIds(prev => { const next = new Set(prev); next.delete(itemId); return next; });
        setAiData(prev => {
            if (!prev?.categories) return prev;
            const categories = prev.categories
                .map(c => c.id !== catId ? c : { ...c, items: c.items.filter(i => i.id !== itemId) })
                .filter(c => c.items.length > 0);
            const next = { ...prev, categories };
            if (uid) setChecklistState(uid, { categories, snapshot: prev.snapshot, updatedAt: Date.now() }).catch(() => {});
            syncComponentReminders('checklist', categories.flatMap(c => c.items), true);
            return next;
        });
        silenceReminder(itemId, 'checklist');
        setDismissedItems(prev => {
            if (prev.some(d => d.id === itemId)) return prev;
            const stored = item || { id: itemId, title: itemId, priority: 'medium', description: '', details: '' };
            const next = [...prev, { id: itemId, catId, categoryTitle, item: stored }];
            if (uid) setChecklistState(uid, { dismissedItems: next }).catch(() => {});
            return next;
        });
    }, [uid]);

    // Restore a dismissed item back to its category
    const handleRestoreItem = useCallback((itemId) => {
        const dismissed = dismissedItemsRef.current.find(d => d.id === itemId);
        if (!dismissed) return;
        const { catId, categoryTitle, item } = dismissed;
        setDismissedItems(prev => {
            const next = prev.filter(d => d.id !== itemId);
            if (uid) setChecklistState(uid, { dismissedItems: next }).catch(() => {});
            return next;
        });
        setAiData(prev => {
            if (!prev?.categories) return prev;
            const cats = prev.categories;
            const catIdx = cats.findIndex(c => c.id === catId);
            let categories;
            if (catIdx >= 0) {
                if (cats[catIdx].items.some(i => i.id === itemId)) {
                    categories = cats;
                } else {
                    categories = cats.map((c, i) => i !== catIdx ? c : { ...c, items: [...c.items, item] });
                }
            } else {
                categories = [...cats, { id: catId, title: categoryTitle, emoji: '', items: [item] }];
            }
            const next = { ...prev, categories };
            if (uid) setChecklistState(uid, { categories, snapshot: prev.snapshot, updatedAt: Date.now() }).catch(() => {});
            syncComponentReminders('checklist', categories.flatMap(c => c.items), true);
            return next;
        });
    }, [uid]);

    // Permanently delete from dismissed list — item can be re-added by AI in future
    const handlePermanentDelete = useCallback((itemId) => {
        silenceReminder(itemId, 'checklist');
        setDismissedItems(prev => {
            const next = prev.filter(d => d.id !== itemId);
            if (uid) setChecklistState(uid, { dismissedItems: next }).catch(() => {});
            return next;
        });
        // Also remove from keptItemIds so AI can freely re-suggest it
        setKeptItemIds(prev => {
            if (!prev.has(itemId)) return prev;
            const next = new Set(prev);
            next.delete(itemId);
            if (uid) setChecklistState(uid, { keptItemIds: [...next] }).catch(() => {});
            return next;
        });
    }, [uid]);

    // Manual remove by user — move item to dismissed list
    const handleManualRemove = useCallback((catId, itemId) => {
        handleConfirmRemove(catId, itemId);
    }, [handleConfirmRemove]);

    // Stable ref so auto-refresh effect never re-fires due to doRefresh identity change
    const doRefreshRef = useRef(doRefresh);
    doRefreshRef.current = doRefresh;

    // Auto-refresh: ONLY when DB has loaded and there are no categories yet (first-time population)
    useEffect(() => {
        if (!dbLoaded || !aiProvider || !aiModel) return;
        if (aiDataRef.current?.categories?.length) return; // already have data — never auto-run again
        autoTimerRef.current = setTimeout(() => doRefreshRef.current(true), 0);
        return () => clearTimeout(autoTimerRef.current);
    }, [dbLoaded, aiProvider, aiModel]);

    // Stale indicator: inputs changed since last AI run
    const isStale = useMemo(() => {
        if (!aiData?.categories?.length || !aiData?.snapshot) return false;
        return getSnapshot(inputs, results) !== aiData.snapshot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        aiData?.snapshot,
        inputs?.currentAge, inputs?.retirementStartAge, inputs?.retirementEndAge,
        inputs?.currentSavings, inputs?.monthlyContribution, inputs?.monthlyNetIncomeDesired,
        inputs?.annualReturnRate, inputs?.inflationRate,
        inputs?.taxRate, inputs?.withdrawalStrategy, inputs?.enableBuckets,
        inputs?.pensionIncomeSources?.length,
        results?.balanceAtRetirement, results?.ranOutAtAge, results?.surplus,
    ]);

    const staticTimingById = useMemo(() => {
        const map = {};
        for (const cat of staticCategories) {
            for (const item of cat.items) {
                if (item.timing) map[item.id] = item.timing;
            }
        }
        return map;
    }, [staticCategories]);

    const activeCategories = useMemo(() => {
        if (!aiData?.categories) return null;
        return aiData.categories.map(cat => ({
            ...cat,
            items: (cat.items || []).map(item => ({
                ...item,
                timing: item.timing ?? staticTimingById[item.id],
            })),
        }));
    }, [aiData, staticTimingById]);

    // Count critical/high/new/flagged items
    const criticalCount = useMemo(() => {
        if (activeCategories) return activeCategories.flatMap(c => c.items).filter(i => i.priority === 'critical').length;
        return staticCategories.flatMap(c => c.items).filter(i => i.relevant && i.priority === 'critical').length;
    }, [activeCategories, staticCategories]);
    const highCount = useMemo(() => {
        if (activeCategories) return activeCategories.flatMap(c => c.items).filter(i => i.priority === 'high').length;
        return staticCategories.flatMap(c => c.items).filter(i => i.relevant && i.priority === 'high').length;
    }, [activeCategories, staticCategories]);
    const newCount = useMemo(() =>
        activeCategories ? activeCategories.flatMap(c => c.items).filter(i => newItemIds.has(i.id) && !seenNewIds.has(i.id)).length : 0,
    [activeCategories, newItemIds, seenNewIds]);
    const hasNoteCount = useMemo(() =>
        activeCategories ? activeCategories.flatMap(c => c.items).filter(i => i.note?.trim()).length : 0,
    [activeCategories]);
    const hasReminderCount = useMemo(() =>
        activeCategories ? activeCategories.flatMap(c => c.items).filter(i => i.reminder?.date).length : 0,
    [activeCategories]);
    const dismissedCount = dismissedItems.length;

    // Timing counts for filter badges
    const timingCounts = useMemo(() => {
        const counts = { overdue: 0, urgent: 0, soon: 0, ongoing: 0 };
        const allItems = activeCategories
            ? activeCategories.flatMap(c => c.items)
            : staticCategories.flatMap(c => c.items.filter(i => i.relevant));
        for (const item of allItems) {
            if (!item.timing || checkedItems.has(item.id)) continue;
            const s = getTimingStatus(item.timing, inputs, false);
            if (s && counts[s.status] !== undefined) counts[s.status]++;
        }
        return counts;
    }, [activeCategories, staticCategories, inputs, checkedItems]);

    // Flat filtered list: [{ categoryTitle, categoryEmoji, item }]
    const filteredItems = useMemo(() => {
        if (!filterMode && !timingFilter) return null;
        const allItems = activeCategories
            ? activeCategories.flatMap(c =>
                c.items.map(item => ({ categoryTitle: getCategoryTitle(c, language), categoryEmoji: c.emoji, categoryIcon: null, catId: c.id, item }))
            )
            : staticCategories.flatMap(c =>
                c.items.filter(i => i.relevant).map(item => ({ categoryTitle: c.title, categoryEmoji: null, categoryIcon: c.icon, catId: c.category, item }))
            );
        let result = allItems;
        if (filterMode === 'new') result = result.filter(e => newItemIds.has(e.item.id) && !seenNewIds.has(e.item.id));
        else if (filterMode === 'hasNote') result = result.filter(e => e.item.note?.trim());
        else if (filterMode === 'hasReminder') result = result.filter(e => e.item.reminder?.date);
        else if (filterMode === 'done') result = result.filter(e => {
            const k = (e.item.id && typeof e.item.id === 'string' && e.item.id.trim()) ? e.item.id.trim() : `${e.catId}-${(e.item.title || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9א-ת-]/g, '')}`;
            return checkedItems.has(k);
        });
        else if (filterMode) result = result.filter(e => e.item.priority === filterMode);
        if (timingFilter) {
            result = result
                .filter(e => {
                    if (!e.item.timing) return false;
                    const s = getTimingStatus(e.item.timing, inputs, checkedItems.has(e.item.id));
                    return s && s.status === timingFilter;
                })
                .sort((a, b) => {
                    const sa = getTimingStatus(a.item.timing, inputs, false);
                    const sb = getTimingStatus(b.item.timing, inputs, false);
                    return (sa?.years ?? 0) - (sb?.years ?? 0); // most overdue (most negative) first
                });
        }
        return result;
    }, [filterMode, timingFilter, activeCategories, staticCategories, newItemIds, seenNewIds, language, inputs, checkedItems]);

    const searchResults = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return null;
        const allItems = activeCategories
            ? activeCategories.flatMap(c =>
                c.items.map((item, idx) => ({ categoryTitle: getCategoryTitle(c, language), categoryEmoji: c.emoji, categoryIcon: null, catId: c.id, item, itemExpandId: `${c.id}-${idx}` }))
            )
            : staticCategories.flatMap(c =>
                c.items.filter(i => i.relevant).map(item => ({ categoryTitle: c.title, categoryEmoji: null, categoryIcon: c.icon, catId: c.category, item, itemExpandId: item.id }))
            );
        return allItems.filter(({ item }) => {
            const hay = [item.title, item.desc, item.description, item.details].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [searchQuery, activeCategories, staticCategories, language]);
 
    // Auto-reset filter if it becomes empty (e.g. user removed the only note that was being filtered)
    useEffect(() => {
        if (filterMode && filterMode !== 'dismissed' && filteredItems && filteredItems.length === 0 && !timingFilter) {
            setFilterMode(null);
        }
        if (timingFilter && filteredItems && filteredItems.length === 0 && !filterMode) {
            setTimingFilter(null);
        }
    }, [filterMode, timingFilter, filteredItems]);

    // Also leave "dismissed" mode once the last dismissed item is restored/removed.
    useEffect(() => {
        if (filterMode === 'dismissed' && dismissedItems.length === 0) {
            setFilterMode(null);
        }
    }, [filterMode, dismissedItems.length]);

    const toggleCategory = (id) => {
        setExpandedCategories(prev => prev.has(id) ? new Set() : new Set([id]));
    };

    const toggleItem = (id) => {
        setExpandedItems(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleGoToCategory = (catId, itemId) => {
        setSearchQuery('');
        setTimingFilter(null);
        setExpandedCategories(new Set([catId]));
        if (itemId) {
            setExpandedItems(prev => { const next = new Set(prev); next.add(itemId); return next; });
        }
    };

    const categoryIcon = (cat) => {
        // Match on stable category ID first (most reliable — AI is instructed to use fixed IDs)
        const id = (cat.id || '').toLowerCase();
        const title = (cat.title || '').toLowerCase();
        const key = id || title;

        if (key.includes('national-insurance') || key.includes('ni-') || key.includes('bituach') || key.includes('ביטוח לאומי'))
            return <Landmark size={16} className={isLight ? 'text-teal-700' : 'text-teal-400'} />;
        if (key.includes('pension') || key.includes('פנסיה'))
            return <Building2 size={16} className={isLight ? 'text-green-700' : 'text-green-400'} />;
        if (key.includes('insurance') || key.includes('ביטוח'))
            return <Shield size={16} className={isLight ? 'text-blue-700' : 'text-blue-400'} />;
        if (key.includes('tax') || key.includes('taxation') || key.includes('מיסוי') || key.includes('מס'))
            return <Receipt size={16} className={isLight ? 'text-amber-700' : 'text-amber-400'} />;
        if (key.includes('financial') || key.includes('finance') || key.includes('פיננסי'))
            return <TrendingUp size={16} className={isLight ? 'text-emerald-700' : 'text-emerald-400'} />;
        if (key.includes('health') || key.includes('healthcare') || key.includes('בריאות'))
            return <Stethoscope size={16} className={isLight ? 'text-rose-700' : 'text-rose-400'} />;
        if (key.includes('legal') || key.includes('estate') || key.includes('משפטי') || key.includes('עיזבון'))
            return <Scale size={16} className={isLight ? 'text-purple-700' : 'text-purple-400'} />;
        if (key.includes('housing') || key.includes('property') || key.includes('דיור') || key.includes('נדלן') || key.includes('נדל'))
            return <Home size={16} className={isLight ? 'text-orange-700' : 'text-orange-400'} />;
        if (key.includes('lifestyle') || key.includes('life-style') || key.includes('אורח'))
            return <Activity size={16} className={isLight ? 'text-pink-700' : 'text-pink-400'} />;
        if (key.includes('digital') || key.includes('online') || key.includes('דיגיטל'))
            return <Laptop size={16} className={isLight ? 'text-slate-700' : 'text-slate-400'} />;
        return <FileText size={16} className={isLight ? 'text-slate-700' : 'text-slate-400'} />;
    };

    const sortByPriority = (items) =>
        [...items].sort((a, b) => (PRIORITIES[a.priority]?.order ?? 9) - (PRIORITIES[b.priority]?.order ?? 9));

    // Stable key: prefer AI-provided id, fallback to normalized category+title hash
    const itemKey = (catId, item) => {
        if (item.id && typeof item.id === 'string' && item.id.trim()) return item.id.trim();
        return `${catId}-${(item.title || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9א-ת-]/g, '')}`;
    };

    const toggleChecked = (key) => {
        setCheckedItems(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            if (uidRef.current) {
                setChecklistState(uidRef.current, { checkedItems: [...next] }).catch(err =>
                    console.error('[Checklist checked save]', err)
                );
            }
            return next;
        });
    };

    // Total / done counts for progress bar
    const { totalItems, doneItems } = useMemo(() => {
        const cats = activeCategories
            ? activeCategories.map(c => ({ id: c.id, items: c.items }))
            : staticCategories.map(c => ({ id: c.category, items: c.items.filter(i => i.relevant) }));
        let total = 0, done = 0;
        cats.forEach(c => c.items.forEach(item => {
            total++;
            if (checkedItems.has(itemKey(c.id, item))) done++;
        }));
        return { totalItems: total, doneItems: done };
    }, [activeCategories, staticCategories, checkedItems]);

    const friendlyError = (raw) => {
        const m = (raw || '').toLowerCase();
        if (m.includes('api key') || m.includes('missing api') || m.includes('unauthorized') || m.includes('401'))
            return txt('Missing or invalid API key. Check your settings.', 'מפתח API חסר או לא תקין. בדוק את ההגדרות.');
        if (m.includes('rate limit') || m.includes('429') || m.includes('quota'))
            return txt('Rate limit reached. Please wait a moment and try again.', 'חריגה ממגבלת קריאות. המתן רגע ונסה שוב.');
        if (m.includes('timeout') || m.includes('timed out'))
            return txt('Request timed out. Check your internet connection and try again.', 'הבקשה פגה. בדוק חיבור לאינטרנט ונסה שוב.');
        if (m.includes('network') || m.includes('fetch') || m.includes('econnrefused'))
            return txt('Network error. Check your internet connection.', 'שגיאת רשת. בדוק חיבור לאינטרנט.');
        if (m.includes('json') || m.includes('parse') || m.includes('syntax'))
            return txt('AI returned an invalid response. Please try again.', 'תגובת ה-AI לא תקינה. נסה שוב.');
        if (m.includes('model') || m.includes('404') || m.includes('not found'))
            return txt('Selected AI model not found. Check your settings.', 'מודל ה-AI שנבחר לא נמצא. בדוק הגדרות.');
        return txt('Failed to generate insights. Please try again.', 'שגיאה בייצור התובנות. נסה שוב.');
    };

    const txt = (en, he) => isRtl ? he : en;

    const tsLabel = (() => {
        if (!aiTimestamp || aiLoading || aiSilentLoading) return null;
        const mins = Math.round((Date.now() - aiTimestamp) / 60000);
        if (mins < 1) return txt('Updated just now', 'עודכן זה עתה');
        if (mins < 60) return txt(`Updated ${mins}m ago`, `עודכן לפני ${mins} דק'`);
        const hrs = Math.floor(mins / 60);
        return txt(`Updated ${hrs}h ago`, `עודכן לפני ${hrs} שע'`);
    })();

    const scrollRef = useRef(null);
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const update = () => {
            const top = el.getBoundingClientRect().top;
            el.style.maxHeight = (window.innerHeight - top - 2) + 'px';
        };
        update();
        window.addEventListener('resize', update);
        window.visualViewport?.addEventListener('resize', update);
        return () => {
            window.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('resize', update);
        };
    });

    return (
        <div
            className={`flex flex-col overflow-hidden ${isLight ? 'bg-gray-50' : 'bg-transparent'}`} style={{height:'100%'}}
            dir={isRtl ? 'rtl' : 'ltr'}
        >
            {/* Header summary strip */}
            <div className={`flex-shrink-0 px-4 py-3 border-b flex items-center gap-3 flex-wrap ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900/80 border-white/10'}`}>
                <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-400" />
                    <span className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                        {txt('Retirement Planning Checklist', 'רשימת תכנון לפרישה')}
                    </span>
                    {aiProvider && aiModel && (
                        <button
                            onClick={handleOpenOverview}
                            title={isRtl ? 'תובנות AI כלליות' : 'AI Overview'}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold transition-colors ${isLight ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'}`}
                        >AI</button>
                    )}
                    {totalItems > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isLight ? 'bg-gray-100 text-gray-500' : 'bg-white/10 text-gray-400'}`}>{totalItems} {txt('items', 'סעיפים')}</span>}
                    {tsLabel && <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>{tsLabel}</span>}
                    {aiSilentLoading && <RefreshCw size={11} className="animate-spin text-purple-400" />}
                </div>
                {aiProvider && aiModel && (
                    <div className="flex items-center gap-1.5">
                        {isStale && !aiLoading && !aiSilentLoading && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-400'}`}>
                                {txt('inputs changed', 'נתונים השתנו')}
                            </span>
                        )}
                        <button
                            onClick={handleRefresh}
                            disabled={aiLoading}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${isStale && !aiLoading ? (isLight ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30') : (isLight ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30')} disabled:opacity-50`}
                        >
                            <RefreshCw size={12} className={aiLoading ? 'animate-spin' : ''} />
                            {aiLoading ? txt('Generating...', 'מייצר...') : txt('Refresh with AI', 'רענן עם AI')}
                        </button>
                        {!aiLoading && (
                            <button
                                onClick={handleResetToBase}
                                title={txt('Reset to base list (removes AI additions)', 'אפס לרשימת בסיס (מסיר תוספות AI)')}
                                className={`p-1 rounded transition-all opacity-40 hover:opacity-100 ${isLight ? 'text-gray-500 hover:text-blue-600' : 'text-gray-500 hover:text-blue-400'}`}
                            >
                                <RotateCcw size={12} />
                            </button>
                        )}
                    </div>
                )}
                <div className="flex items-center gap-1 ms-auto">
                    {[
                        { mode: 'critical', icon: AlertTriangle, count: criticalCount, active: 'bg-red-500 text-white ring-1 ring-red-400', inactive: 'text-red-400 hover:bg-red-500/30', badge: 'bg-red-500', tip: txt('Critical', 'קריטי') },
                        { mode: 'high',     icon: BadgeAlert,    count: highCount,     active: 'bg-orange-500 text-white ring-1 ring-orange-400', inactive: 'text-orange-400 hover:bg-orange-500/30', badge: 'bg-orange-500', tip: txt('High', 'גבוה') },
                        { mode: 'new',      icon: Zap,           count: newCount,      active: 'bg-green-500 text-white ring-1 ring-green-400',  inactive: 'text-green-400 hover:bg-green-500/30',  badge: 'bg-green-500',  tip: txt('New', 'חדש') },
                        { mode: 'hasNote',  icon: MessageSquare, count: hasNoteCount,  active: 'bg-amber-600 text-white ring-1 ring-amber-500',  inactive: 'text-amber-500 hover:bg-amber-500/30',  badge: 'bg-amber-600',  tip: txt('Notes', 'הערות') },
                        { mode: 'hasReminder', icon: Bell,       count: hasReminderCount, active: 'bg-blue-600 text-white ring-1 ring-blue-500', inactive: 'text-blue-500 hover:bg-blue-500/30',    badge: 'bg-blue-600',   tip: txt('Reminders', 'תזכורות') },
                        { mode: 'dismissed',icon: EyeOff,        count: dismissedCount,active: 'bg-gray-500 text-white ring-1 ring-gray-400',    inactive: 'text-gray-400 hover:bg-gray-500/30',    badge: 'bg-gray-500',   tip: txt('Dismissed', 'נדחו') },
                    ].map(({ mode, icon: Icon, count, active, inactive, badge, tip }) => (
                        <button
                            key={mode}
                            onClick={() => setFilterMode(f => f === mode ? null : mode)}
                            title={`${tip}${count > 0 ? ` (${count})` : ''}`}
                            className={`relative p-1.5 rounded-lg transition-all ${filterMode === mode ? active : `${isLight ? 'bg-gray-100' : 'bg-white/5'} ${count === 0 ? 'opacity-30 cursor-default' : inactive}`}`}
                            disabled={count === 0 && filterMode !== mode}
                        >
                            <Icon size={13} />
                            {count > 0 && (
                                <span className={`absolute -top-1 -end-1 min-w-[14px] h-[14px] px-0.5 rounded-full text-white text-[9px] font-bold flex items-center justify-center ${filterMode === mode ? 'bg-white/30' : badge}`}>
                                    {count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Search + timing filters */}
            <div className={`flex-shrink-0 px-3 py-1.5 border-b flex items-center gap-2 ${isLight ? 'bg-white border-gray-100' : 'bg-gray-900/60 border-white/5'}`}>
                {/* Search input */}
                <div className={`flex items-center gap-1.5 flex-1 px-2 py-1 rounded-lg ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}>
                    <Search size={12} className={isLight ? 'text-gray-400 shrink-0' : 'text-gray-500 shrink-0'} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={txt('חיפוש…', 'חיפוש…')}
                        className={`flex-1 bg-transparent text-xs outline-none placeholder:text-gray-400 min-w-0 ${isLight ? 'text-gray-800' : 'text-white'}`}
                        dir={isRtl ? 'rtl' : 'ltr'}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className={isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300'}>
                            <X size={12} />
                        </button>
                    )}
                </div>
                {/* Timing badges */}
                <div className="flex items-center gap-1 shrink-0">
                    {[
                        { key: 'overdue', label: 'באיחור', color: timingFilter === 'overdue' ? 'bg-red-500 text-white' : (isLight ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-red-500/15 text-red-400 hover:bg-red-500/25') },
                        { key: 'urgent',  label: 'דחוף',   color: timingFilter === 'urgent'  ? 'bg-amber-500 text-white' : (isLight ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25') },
                        { key: 'soon',    label: 'בקרוב',  color: timingFilter === 'soon'    ? 'bg-yellow-500 text-white' : (isLight ? 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100' : 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25') },
                        { key: 'ongoing', label: 'שוטף',   color: timingFilter === 'ongoing' ? 'bg-blue-500 text-white' : (isLight ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25') },
                    ].map(({ key, label, color }) => {
                        const count = timingCounts[key];
                        if (count === 0 && timingFilter !== key) return null;
                        return (
                            <button
                                key={key}
                                onClick={() => setTimingFilter(f => f === key ? null : key)}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${color}`}
                            >
                                {label}
                                {count > 0 && <span className={`text-[9px] font-bold ${timingFilter === key ? 'opacity-75' : ''}`}>{count}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Progress bar */}
            {totalItems > 0 && (
                <div className={`flex-shrink-0 px-4 py-2 border-b ${isLight ? 'bg-white border-gray-100' : 'bg-gray-900/60 border-white/5'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isLight ? 'bg-gray-200' : 'bg-white/10'}`}>
                            <div
                                className="h-full rounded-full bg-green-500 transition-all duration-500"
                                style={{ width: `${totalItems ? (doneItems / totalItems) * 100 : 0}%` }}
                            />
                        </div>
                        <button
                            onClick={() => setFilterMode(f => f === 'done' ? null : 'done')}
                            className={`text-[11px] font-medium shrink-0 rounded px-1 -mx-1 transition-colors ${filterMode === 'done' ? (isLight ? 'bg-green-100 text-green-700' : 'bg-green-500/20 text-green-400') : (isLight ? 'text-gray-500 hover:text-green-600' : 'text-gray-400 hover:text-green-400')}`}
                        >
                            {doneItems}/{totalItems} {txt('done', 'טופל')}
                        </button>
                    </div>
                </div>
            )}

            {/* Scrollable content - dir=ltr forces scrollbar to right side even in RTL mode */}
            <div ref={scrollRef} className="overflow-y-auto custom-scrollbar scrollbar-right" dir="ltr">
            <div dir={isRtl ? 'rtl' : 'ltr'}>

            {/* Disclaimer */}
            <div className={`mx-4 mt-3 mb-1 flex items-start gap-2 text-[11px] p-2 rounded-lg ${isLight ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'}`}>
                <Info size={13} className="shrink-0 mt-0.5" />
                <span>{txt(
                    'This checklist covers key planning areas for retirement in Israel. Items are personalized based on your inputs. Always consult qualified professionals (financial advisor, tax advisor, lawyer) for your specific situation.',
                    'רשימה זו מכסה תחומי תכנון מרכזיים לפרישה בישראל. הפריטים מותאמים אישית על בסיס הנתונים שלך. תמיד התייעצו עם אנשי מקצוע מוסמכים (יועץ פיננסי, יועץ מס, עורך דין) עבור המצב הספציפי שלך.'
                )}</span>
            </div>

            {/* First-load skeleton while AI generates */}
            {!aiData && aiSilentLoading && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 px-8">
                    <RefreshCw size={28} className="animate-spin text-purple-400" />
                    <span className={`text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                        {txt('Generating personalized insights...', 'מייצר תובנות מותאמות אישית...')}
                    </span>
                </div>
            )}

            {/* AI error */}
            {aiError && (
                <div className={`mx-4 mt-3 mb-1 rounded-lg border p-3 ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/20'}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={14} className="text-red-400 shrink-0" />
                        <span className={`text-xs font-semibold ${isLight ? 'text-red-700' : 'text-red-400'}`}>
                            {txt('Error generating insights', 'שגיאה בייצור תובנות')}
                        </span>
                    </div>
                    <p className={`text-xs ${isLight ? 'text-red-600' : 'text-red-300'}`}>
                        {friendlyError(aiError)}
                    </p>
                    <button
                        onClick={handleRefresh}
                        className={`mt-2 text-xs font-medium underline ${isLight ? 'text-red-700' : 'text-red-400'}`}
                    >
                        {txt('Try again', 'נסה שוב')}
                    </button>
                </div>
            )}

            {/* Search results */}
            {searchResults && (
                <div className="p-4 space-y-2">
                    <div className={`text-xs font-semibold mb-3 flex items-center gap-2 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                        <Search size={13} />
                        {searchResults.length > 0
                            ? txt(`${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${searchQuery}"`, `${searchResults.length} תוצאות עבור "${searchQuery}"`)
                            : txt(`No results for "${searchQuery}"`, `אין תוצאות עבור "${searchQuery}"`)}
                    </div>
                    {searchResults.map(({ categoryTitle, categoryEmoji, categoryIcon: CatIcon, catId, item }) => {
                        const key = itemKey(catId || categoryTitle, item);
                        return (
                            <ChecklistItem
                                key={key}
                                item={item}
                                uid={uid}
                                isLight={isLight}
                                language={language}
                                inputs={inputs}
                                isExpanded={expandedItems.has(key)}
                                onToggle={() => toggleItem(key)}
                                checked={checkedItems.has(key)}
                                onCheck={() => toggleChecked(key)}
                                onConfirmRemove={() => handleConfirmRemove(catId, item.id)}
                                onKeepItem={() => handleKeepItem(catId, item.id)}
                                isNew={newItemIds.has(item.id) && !seenNewIds.has(item.id)}
                                onSeen={() => setSeenNewIds(prev => new Set([...prev, item.id]))}
                                onKeepNew={() => handleKeepNewItem(item.id)}
                                onDismissNew={() => handleDismissNewItem(catId, item.id)}
                                onManualRemove={() => handleManualRemove(catId, item.id)}
                                onChangeItem={(updated, options) => handleChangeItem(catId, updated, options)}
                                categoryTitle={categoryTitle}
                                categoryEmoji={categoryEmoji}
                                categoryIcon={CatIcon}
                                results={results}
                                aiProvider={aiProvider}
                                aiModel={aiModel}
                                apiKeyOverride={apiKeyOverride}
                                aiExplanation={aiExplanations[item.id]}
                                onSetAiExplanation={handleSetAiExplanation}
                                isLocked={keptItemIds.has(item.id)}
                                onToggleLock={handleToggleLock}
                            />
                        );
                    })}
                </div>
            )}

            {/* Filtered flat list */}
            {!searchResults && filteredItems && (
                <div className="p-4 space-y-2">
                    <div className={`text-xs font-semibold mb-3 flex items-center gap-2 ${
                        filterMode === 'critical' ? 'text-red-400' :
                        filterMode === 'high' ? 'text-orange-400' :
                        filterMode === 'new' ? 'text-green-400' :
                        filterMode === 'hasNote' ? 'text-amber-500' :
                        filterMode === 'hasReminder' ? 'text-blue-500' :
                        filterMode === 'done' ? 'text-green-500' :
                        'text-amber-400'
                    }`}>
                        {filterMode === 'critical' ? <AlertTriangle size={13} /> :
                         filterMode === 'high' ? <BadgeAlert size={13} /> :
                         filterMode === 'new' ? <Zap size={13} /> :
                         filterMode === 'hasNote' ? <MessageSquare size={13} /> :
                         filterMode === 'hasReminder' ? <Bell size={13} /> :
                         filterMode === 'done' ? <CheckCircle size={13} /> :
                         <AlertTriangle size={13} />}
                        {filterMode === 'critical' ? txt(`${filteredItems.length} Critical Items`, `${filteredItems.length} פריטים קריטיים`) :
                         filterMode === 'high' ? txt(`${filteredItems.length} High Priority Items`, `${filteredItems.length} פריטים בעדיפות גבוהה`) :
                         filterMode === 'new' ? txt(`${filteredItems.length} New Items`, `${filteredItems.length} פריטים חדשים`) :
                         filterMode === 'hasNote' ? txt(`${filteredItems.length} Items with Notes`, `${filteredItems.length} פריטים עם הערות`) :
                         filterMode === 'hasReminder' ? txt(`${filteredItems.length} Items with Reminders`, `${filteredItems.length} פריטים עם תזכורות`) :
                         filterMode === 'done' ? txt(`${filteredItems.length} Handled Items`, `${filteredItems.length} פריטים טופלו`) :
                         txt(`${filteredItems.length} Items for Review`, `${filteredItems.length} פריטים לבדיקה`)}
                    </div>
                    {filteredItems.map(({ categoryTitle, categoryEmoji, categoryIcon: CatIcon, catId, item }) => {
                        const key = itemKey(catId || categoryTitle, item);
                        return (
                                                    <ChecklistItem
                                                        key={key}
                                                        item={item}
                                                        uid={uid}
                                                        isLight={isLight}
                                                        language={language}
                                                        inputs={inputs}
                                                        isExpanded={expandedItems.has(key)}
                                                        onToggle={() => toggleItem(key)}
                                checked={checkedItems.has(key)}
                                onCheck={() => toggleChecked(key)}
                                onConfirmRemove={() => handleConfirmRemove(catId, item.id)}
                                onKeepItem={() => handleKeepItem(catId, item.id)}
                                isNew={newItemIds.has(item.id) && !seenNewIds.has(item.id)}
                                onSeen={() => setSeenNewIds(prev => new Set([...prev, item.id]))}
                                onKeepNew={() => handleKeepNewItem(item.id)}
                                onDismissNew={() => handleDismissNewItem(catId, item.id)}
                                onManualRemove={() => handleManualRemove(catId, item.id)}
                                onChangeItem={(updated, options) => handleChangeItem(catId, updated, options)}
                                categoryTitle={categoryTitle}
                                categoryEmoji={categoryEmoji}
                                categoryIcon={CatIcon}
                                results={results}
                                aiProvider={aiProvider}
                                aiModel={aiModel}
                                apiKeyOverride={apiKeyOverride}
                                aiExplanation={aiExplanations[item.id]}
                                onSetAiExplanation={handleSetAiExplanation}
                                isLocked={keptItemIds.has(item.id)}
                                onToggleLock={handleToggleLock}
                            />
                        );
                    })}
                </div>
            )}

            {/* Dismissed items panel */}
            {!searchResults && filterMode === 'dismissed' && (
                <div className="p-4 space-y-2">
                    <div className={`text-xs font-semibold mb-3 flex items-center gap-2 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                        <EyeOff size={13} />
                        {txt(`${dismissedItems.length} dismissed item${dismissedItems.length !== 1 ? 's' : ''}`, `${dismissedItems.length} פריטים שנדחו`)}
                    </div>
                    {dismissedItems.map(({ id, catId, categoryTitle, item }) => {
                        const p = PRIORITIES[item.priority] || PRIORITIES.medium;
                        return (
                            <div key={id} className={`rounded-xl ring-1 overflow-hidden ${isLight ? 'ring-gray-200 bg-white opacity-70' : 'ring-white/10 bg-white/5 opacity-60'}`}>
                                <div className="flex items-center gap-3 p-3">
                                    <div className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${p.color}`}>
                                        {p[isRtl ? 'he' : 'en'].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-xs font-semibold line-through ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>{item.title}</div>
                                        <div className={`text-[11px] mt-0.5 ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>{categoryTitle}</div>
                                    </div>
                                    <button
                                        onClick={() => handleRestoreItem(id)}
                                        title={txt('Restore to list', 'החזר לרשימה')}
                                        className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${isLight ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}
                                    >
                                        <Undo2 size={11} />
                                        {txt('Restore', 'שחזר')}
                                    </button>
                                    <button
                                        onClick={() => handlePermanentDelete(id)}
                                        title={txt('Delete permanently (AI may re-add)', 'מחק לצמיתות (AI יוכל להוסיף שוב)')}
                                        className={`shrink-0 p-1.5 rounded transition-all ${isLight ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'}`}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Categories */}
            {!searchResults && filterMode !== 'dismissed' && !filteredItems && !(!aiData && aiSilentLoading) && <div className="p-4 space-y-3">
                {(activeCategories
                    ? [...activeCategories].sort((a, b) => {
                        const critA = a.items.filter(i => i.priority === 'critical').length;
                        const critB = b.items.filter(i => i.priority === 'critical').length;
                        if (critB !== critA) return critB - critA;
                        const highA = a.items.filter(i => i.priority === 'high').length;
                        const highB = b.items.filter(i => i.priority === 'high').length;
                        return highB - highA;
                    }).map(cat => {
                        const c = (isLight ? LIGHT_COLOR_MAP : COLOR_MAP).blue;
                        const isOpen = expandedCategories.has(cat.id);
                        const criticals = cat.items.filter(i => i.priority === 'critical').length;
                        const highs = cat.items.filter(i => i.priority === 'high').length;
                        const notes = cat.items.filter(i => i.note?.trim()).length;
                        const reminders = cat.items.filter(i => i.reminder?.date).length;
                        return (
                            <div key={cat.id} className={`rounded-xl ring-1 overflow-hidden ${c.ring} ${isLight ? 'bg-white' : 'bg-white/5'}`}>
                                <button
                                    onClick={() => toggleCategory(cat.id)}
                                    className={`w-full flex items-center gap-3 p-3 text-start transition-colors ${isLight ? 'hover:bg-gray-50' : 'hover:bg-white/5'}`}
                                >
                                    <div className={`p-1.5 rounded-lg ${isLight ? 'bg-blue-50' : 'bg-blue-500/10'}`}>
                                        {categoryIcon(cat)}
                                    </div>
                                    <span className={`text-sm font-semibold flex-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                                        {getCategoryTitle(cat, language)} <span className="font-normal opacity-60">({cat.items.length})</span>
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        {notes > 0 && (
                                            <span className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-400'}`} title={language === 'he' ? 'הערות' : 'Notes'}>
                                                <MessageSquare size={10} />
                                                {notes}
                                            </span>
                                        )}
                                        {reminders > 0 && (
                                            <span className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'}`} title={language === 'he' ? 'תזכורות' : 'Reminders'}>
                                                <Bell size={10} />
                                                {reminders}
                                            </span>
                                        )}
                                        {criticals > 0 && <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{criticals}</span>}
                                        {highs > 0 && <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">{highs}</span>}
                                        {isOpen ? <ChevronDown size={14} className={isLight ? 'text-gray-400' : 'text-gray-500'} /> : <ChevronRight size={14} className={isLight ? 'text-gray-400' : 'text-gray-500'} />}
                                    </div>
                                </button>
                                {isOpen && (
                                    <div className={`px-3 pb-3 space-y-2 border-t ${isLight ? 'border-gray-100' : 'border-white/5'}`}>
                                        <div className="pt-2 space-y-2">
                                            {sortByPriority(cat.items).map((item, idx) => {
                                                const normalizedItem = { ...item, id: item.id || `${cat.id}-${idx}`, desc: item.description, relevant: true };
                                                const key = itemKey(cat.id, normalizedItem);
                                                return (
                                                    <ChecklistItem
                                                        key={normalizedItem.id}
                                                        item={normalizedItem}
                                                        uid={uid}
                                                        isLight={isLight}
                                                        language={language}
                                                        inputs={inputs}
                                                        isExpanded={expandedItems.has(normalizedItem.id)}
                                                        onToggle={() => toggleItem(normalizedItem.id)}
                                                        checked={checkedItems.has(key)}
                                                        onCheck={() => toggleChecked(key)}
                                                        onConfirmRemove={() => handleConfirmRemove(cat.id, normalizedItem.id)}
                                                        onKeepItem={() => handleKeepItem(cat.id, normalizedItem.id)}
                                                        isNew={newItemIds.has(normalizedItem.id) && !seenNewIds.has(normalizedItem.id)}
                                                        onSeen={() => setSeenNewIds(prev => new Set([...prev, normalizedItem.id]))}
                                                        onKeepNew={() => handleKeepNewItem(normalizedItem.id)}
                                                        onDismissNew={() => handleDismissNewItem(cat.id, normalizedItem.id)}
                                                        onManualRemove={() => handleManualRemove(cat.id, normalizedItem.id)}
                                                        onChangeItem={(updated, options) => handleChangeItem(cat.id, updated, options)}
                                                        results={results}
                                                        aiProvider={aiProvider}
                                                        aiModel={aiModel}
                                                        apiKeyOverride={apiKeyOverride}
                                                        aiExplanation={aiExplanations[normalizedItem.id]}
                                                        onSetAiExplanation={handleSetAiExplanation}
                                                        isLocked={keptItemIds.has(normalizedItem.id)}
                                                        onToggleLock={handleToggleLock}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                    : staticCategories.map(cat => {
                    const colorMap = isLight ? LIGHT_COLOR_MAP : COLOR_MAP;
                    const c = colorMap[cat.color] || colorMap.blue;
                    const Icon = cat.icon;
                    const isOpen = expandedCategories.has(cat.category);
                    const relevantItems = cat.items.filter(i => i.relevant);
                    const criticals = relevantItems.filter(i => i.priority === 'critical').length;
                    const highs = relevantItems.filter(i => i.priority === 'high').length;
                    const notes = relevantItems.filter(i => i.note?.trim()).length;
                    const reminders = relevantItems.filter(i => i.reminder?.date).length;

                    return (
                        <div key={cat.category} className={`rounded-xl ring-1 overflow-hidden ${c.ring} ${isLight ? 'bg-white' : 'bg-white/5'}`}>
                            {/* Category header */}
                            <button
                                onClick={() => toggleCategory(cat.category)}
                                className={`w-full flex items-center gap-3 p-3 text-start transition-colors ${isLight ? 'hover:bg-gray-50' : 'hover:bg-white/5'}`}
                            >
                                <div className={`p-1.5 rounded-lg ${c.bg}`}>
                                    <Icon size={16} className={c.header} />
                                </div>
                                <span className={`text-sm font-semibold flex-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                                    {cat.title}
                                </span>
                                <div className="flex items-center gap-1.5">
                                    {notes > 0 && (
                                        <span className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-400'}`} title={language === 'he' ? 'הערות' : 'Notes'}>
                                            <MessageSquare size={10} />
                                            {notes}
                                        </span>
                                    )}
                                    {reminders > 0 && (
                                        <span className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'}`} title={language === 'he' ? 'תזכורות' : 'Reminders'}>
                                            <Bell size={10} />
                                            {reminders}
                                        </span>
                                    )}
                                    {criticals > 0 && <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{criticals}</span>}
                                    {highs > 0 && <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">{highs}</span>}
                                    {isOpen ? <ChevronDown size={14} className={isLight ? 'text-gray-400' : 'text-gray-500'} /> : <ChevronRight size={14} className={isLight ? 'text-gray-400' : 'text-gray-500'} />}
                                </div>
                            </button>

                            {/* Items */}
                            {isOpen && (
                                <div className={`px-3 pb-3 space-y-2 border-t ${isLight ? 'border-gray-100' : 'border-white/5'}`}>
                                    <div className="pt-2 space-y-2">
                                        {relevantItems
                                            .sort((a, b) => PRIORITIES[a.priority].order - PRIORITIES[b.priority].order)
                                            .map(item => {
                                                const key = itemKey(cat.category, item);
                                                return (
                                                    <ChecklistItem
                                                        key={item.id}
                                                        item={item}
                                                        uid={uid}
                                                        isLight={isLight}
                                                        language={language}
                                                        inputs={inputs}
                                                        isExpanded={expandedItems.has(item.id)}
                                                        onToggle={() => toggleItem(item.id)}
                                                        checked={checkedItems.has(key)}
                                                        onCheck={() => toggleChecked(key)}
                                                        onChangeItem={(updated, options) => handleChangeItem(cat.category, updated, options)}
                                                        results={results}
                                                        aiProvider={aiProvider}
                                                        aiModel={aiModel}
                                                        apiKeyOverride={apiKeyOverride}
                                                        aiExplanation={aiExplanations[item.id]}
                                                        onSetAiExplanation={handleSetAiExplanation}
                                                        isLocked={keptItemIds.has(item.id)}
                                                        onToggleLock={handleToggleLock}
                                                    />
                                                );
                                            })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                }))}
            </div>}
            </div>{/* end inner dir wrapper */}
            </div>{/* end scrollable content */}

            {/* AI Overview draggable modal */}
            {overviewOpen && ReactDOM.createPortal(
                <div
                    className="fixed z-[9999] pointer-events-none"
                    style={{ inset: 0 }}
                >
                    <div
                        ref={overviewDragRef}
                        className={`pointer-events-auto absolute w-[360px] max-h-[70vh] flex flex-col rounded-xl shadow-2xl border overflow-hidden ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-white/15'}`}
                        style={{ top: `calc(50% + ${overviewPos.y}px)`, left: `calc(50% + ${overviewPos.x}px)`, transform: 'translate(-50%, -50%)' }}
                        dir={isRtl ? 'rtl' : 'ltr'}
                    >
                        {/* Header — drag handle */}
                        <div
                            onMouseDown={startDrag}
                            className={`flex items-center gap-2 px-3 py-2 border-b cursor-grab active:cursor-grabbing select-none shrink-0 ${isLight ? 'bg-purple-50 border-purple-100' : 'bg-purple-500/10 border-purple-500/20'}`}
                        >
                            <span className={`text-xs font-semibold flex-1 ${isLight ? 'text-purple-700' : 'text-purple-300'}`}>
                                {isRtl ? '✦ תובנות AI — מה חשוב לי לשים לב' : '✦ AI Overview — Key Priorities'}
                            </span>
                            {overviewStale && !overviewLoading && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isLight ? 'bg-amber-100 text-amber-600' : 'bg-amber-500/20 text-amber-400'}`}>
                                    {isRtl ? 'לא עדכני' : 'stale'}
                                </span>
                            )}
                            <button
                                onClick={() => { setOverviewError(null); fetchOverview(); }}
                                disabled={overviewLoading}
                                title={isRtl ? 'רענן' : 'Refresh'}
                                className={`p-1 rounded transition-colors disabled:opacity-40 ${isLight ? 'text-purple-400 hover:text-purple-700 hover:bg-purple-100' : 'text-purple-500 hover:text-purple-300 hover:bg-purple-500/20'}`}
                            >
                                <RefreshCw size={12} className={overviewLoading ? 'animate-spin' : ''} />
                            </button>
                            <button
                                onClick={() => setOverviewOpen(false)}
                                className={`p-1 rounded transition-colors ${isLight ? 'text-gray-400 hover:text-gray-700 hover:bg-gray-100' : 'text-gray-500 hover:text-gray-300 hover:bg-white/10'}`}
                            >
                                <X size={13} />
                            </button>
                        </div>
                        {/* Content */}
                        <div className="overflow-y-auto custom-scrollbar scrollbar-right flex-1 p-3 text-xs leading-relaxed">
                            {overviewLoading && (
                                <div className="flex items-center gap-2 py-2 justify-center">
                                    <RefreshCw size={14} className="animate-spin text-purple-400" />
                                    <span className={isLight ? 'text-purple-600' : 'text-purple-300'}>{isRtl ? 'מעדכן ניתוח…' : 'Updating analysis…'}</span>
                                </div>
                            )}
                            {overviewError && !overviewLoading && <div className={isLight ? 'text-red-600' : 'text-red-400'}>{overviewError}</div>}
                            {overviewText && (
                                <AiTextRenderer text={overviewText} isLight={isLight} />
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
