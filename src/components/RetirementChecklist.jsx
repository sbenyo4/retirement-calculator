import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency } from '../utils/formatters';
import { generateRetirementChecklistInsights } from '../utils/ai-calculator';
import {
    Shield, Heart, Receipt, TrendingUp, Home, Scale, Laptop,
    AlertTriangle, CheckCircle, ChevronDown, ChevronRight,
    Umbrella, Stethoscope, Building2, FileText, Users,
    Activity, CreditCard, Zap, Star, Info, BadgeAlert, RefreshCw, Flag, Landmark
} from 'lucide-react';

const PRIORITIES = {
    critical: { en: 'Critical', he: 'קריטי', color: 'bg-red-500', text: 'text-red-500', border: 'border-red-500/30', bg: 'bg-red-500/10', order: 0 },
    high:     { en: 'High',     he: 'גבוה',  color: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10', order: 1 },
    medium:   { en: 'Medium',   he: 'בינוני', color: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-500/10', order: 2 },
    low:      { en: 'Low',      he: 'נמוך',  color: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10', order: 3 },
};

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

function ChecklistItem({ item, isLight, language, isExpanded, onToggle, checked, onCheck }) {
    const p = PRIORITIES[item.priority] || PRIORITIES.medium;

    return (
        <div className={`rounded-lg border transition-all ${checked
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
                <button onClick={onToggle} className="flex-1 text-start p-3 ps-0 flex items-start gap-3">
                    <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${p.color}`} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                            <span className={`text-sm font-medium leading-snug ${checked ? 'line-through' : ''} ${isLight ? 'text-gray-900' : 'text-white'}`}>
                                {item.title}
                            </span>
                            {!checked && <PriorityBadge priority={item.priority} isLight={isLight} language={language} />}
                        </div>
                        <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                            {item.desc}
                        </p>
                    </div>
                    <span className={`shrink-0 mt-0.5 ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                </button>
            </div>
            {isExpanded && item.details && (
                <div className={`px-3 pb-3 pt-0 ms-10 text-xs leading-relaxed border-t ${isLight ? 'border-gray-100 text-gray-700 bg-white/60' : 'border-white/5 text-gray-300'}`}>
                    <div className="pt-2">{item.details}</div>
                </div>
            )}
        </div>
    );
}

export default function RetirementChecklist({ results, inputs, language, t, aiProvider, aiModel, apiKeyOverride }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isRtl = language === 'he';

    const [expandedCategories, setExpandedCategories] = useState(new Set());
    const [expandedItems, setExpandedItems] = useState(new Set());
    const [aiData, setAiData] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('rc-ai-data') || 'null'); }
        catch { return null; }
    });
    const [aiLoading, setAiLoading] = useState(false); // true = manual refresh (blocks button)
    const [aiSilentLoading, setAiSilentLoading] = useState(false); // true = background auto-refresh
    const [aiError, setAiError] = useState(null);
    const [filterMode, setFilterMode] = useState(null); // null | 'critical' | 'high'
    const [aiTimestamp, setAiTimestamp] = useState(() => {
        try { return parseInt(sessionStorage.getItem('rc-ai-ts') || '0', 10) || null; }
        catch { return null; }
    });
    const [checkedItems, setCheckedItems] = useState(() => {
        try { return new Set(JSON.parse(localStorage.getItem('retirement-checklist-done') || '[]')); }
        catch { return new Set(); }
    });

    // Stable refs so doRefresh never becomes stale
    const latestRef = useRef({});
    latestRef.current = { inputs, results, aiProvider, aiModel, apiKeyOverride, language };
    const refreshIdRef = useRef(0);
    const autoTimerRef = useRef(null);
    const hasDataRef = useRef(!!sessionStorage.getItem('rc-ai-data'));

    const getSnapshot = (inp, res) => JSON.stringify({
        a: inp?.currentAge, b: inp?.retirementStartAge, c: inp?.retirementEndAge,
        d: inp?.currentSavings, e: inp?.monthlyContribution, f: inp?.monthlyNetIncomeDesired,
        g: inp?.annualReturnRate, h: inp?.inflationRate,
        i: res?.balanceAtRetirement, j: res?.ranOutAtAge, k: res?.surplus,
        l: inp?.taxRate, m: inp?.withdrawalStrategy, n: inp?.enableBuckets,
        o: inp?.pensionIncomeSources?.length,
    });

    const doRefresh = useCallback(async (silent = false) => {
        const { inputs, results, aiProvider, aiModel, apiKeyOverride, language } = latestRef.current;
        if (!aiProvider || !aiModel) return;
        const id = ++refreshIdRef.current;
        // Set loading state before async work
        if (silent) setAiSilentLoading(true);
        else { setAiLoading(true); setAiError(null); }
        let succeeded = false;
        try {
            const data = await generateRetirementChecklistInsights(
                inputs, results, aiProvider, aiModel, apiKeyOverride, language
            );
            if (id !== refreshIdRef.current) return; // a newer request superseded this one
            succeeded = true;
            const ts = Date.now();
            try {
                sessionStorage.setItem('rc-ai-data', JSON.stringify(data));
                sessionStorage.setItem('rc-ai-snapshot', getSnapshot(inputs, results));
                sessionStorage.setItem('rc-ai-ts', String(ts));
            } catch {}
            hasDataRef.current = true;
            setAiData(data);
            setAiTimestamp(ts);
            setExpandedCategories(new Set());
            setAiError(null);
        } catch (err) {
            if (id !== refreshIdRef.current) return;
            if (!silent) setAiError(err.message);
            // silent failure: keep existing data untouched
        } finally {
            // Always clear loading for the request that is still "current"
            if (id === refreshIdRef.current) {
                if (silent) setAiSilentLoading(false);
                else setAiLoading(false);
            }
        }
    }, []); // no deps — reads from ref

    const handleRefresh = useCallback(() => {
        try { sessionStorage.removeItem('rc-ai-snapshot'); } catch {}
        doRefresh(false);
    }, [doRefresh]);

    // Auto-refresh: skip if cached data matches current inputs (same session)
    useEffect(() => {
        if (!aiProvider || !aiModel) return;
        clearTimeout(autoTimerRef.current);
        try {
            const currentSnapshot = getSnapshot(latestRef.current.inputs, latestRef.current.results);
            const storedSnapshot = sessionStorage.getItem('rc-ai-snapshot');
            if (hasDataRef.current && currentSnapshot === storedSnapshot) return; // nothing changed
        } catch {}
        const delay = hasDataRef.current ? 2500 : 0;
        autoTimerRef.current = setTimeout(() => doRefresh(true), delay);
        return () => clearTimeout(autoTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        inputs?.currentAge, inputs?.retirementStartAge, inputs?.retirementEndAge,
        inputs?.currentSavings, inputs?.monthlyContribution, inputs?.monthlyNetIncomeDesired,
        inputs?.annualReturnRate, inputs?.inflationRate,
        inputs?.taxRate, inputs?.withdrawalStrategy, inputs?.enableBuckets,
        inputs?.pensionIncomeSources?.length,
        results?.balanceAtRetirement, results?.ranOutAtAge, results?.surplus,
        language, aiProvider, aiModel, doRefresh,
    ]);

    const staticCategories = useMemo(
        () => buildItems(inputs, results, language),
        [inputs, results, language]
    );

    const activeCategories = aiData?.categories ?? null;

    // Count critical/high items
    const criticalCount = useMemo(() => {
        if (activeCategories) return activeCategories.flatMap(c => c.items).filter(i => i.priority === 'critical').length;
        return staticCategories.flatMap(c => c.items).filter(i => i.relevant && i.priority === 'critical').length;
    }, [activeCategories, staticCategories]);
    const highCount = useMemo(() => {
        if (activeCategories) return activeCategories.flatMap(c => c.items).filter(i => i.priority === 'high').length;
        return staticCategories.flatMap(c => c.items).filter(i => i.relevant && i.priority === 'high').length;
    }, [activeCategories, staticCategories]);

    // Flat filtered list: [{ categoryTitle, categoryEmoji, item }]
    const filteredItems = useMemo(() => {
        if (!filterMode) return null;
        const cats = activeCategories
            ? activeCategories.map(c => ({
                id: c.id, title: c.title, emoji: c.emoji,
                items: c.items.filter(i => i.priority === filterMode)
            }))
            : staticCategories.map(c => ({
                id: c.category, title: c.title, emoji: null, icon: c.icon,
                items: c.items.filter(i => i.relevant && i.priority === filterMode)
            }));
        return cats.flatMap(c => c.items.map(item => ({ categoryTitle: c.title, categoryEmoji: c.emoji, categoryIcon: c.icon, catId: c.id || c.category, item })));
    }, [filterMode, activeCategories, staticCategories]);

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
            try { localStorage.setItem('retirement-checklist-done', JSON.stringify([...next])); } catch {}
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

    return (
        <div
            className={`flex flex-col h-full overflow-hidden ${isLight ? 'bg-gray-50' : 'bg-transparent'}`}
            dir={isRtl ? 'rtl' : 'ltr'}
        >
            {/* Header summary strip */}
            <div className={`flex-shrink-0 px-4 py-3 border-b flex items-center gap-3 flex-wrap ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900/80 border-white/10'}`}>
                <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-400" />
                    <span className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                        {txt('Retirement Planning Checklist', 'רשימת תכנון לפרישה')}
                    </span>
                    {aiData && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-500/20 text-purple-300'}`}>AI</span>}
                    {tsLabel && <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>{tsLabel}</span>}
                    {aiSilentLoading && <RefreshCw size={11} className="animate-spin text-purple-400" />}
                </div>
                {aiProvider && aiModel && (
                    <button
                        onClick={handleRefresh}
                        disabled={aiLoading}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${isLight ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'} disabled:opacity-50`}
                    >
                        <RefreshCw size={12} className={aiLoading ? 'animate-spin' : ''} />
                        {aiLoading ? txt('Generating...', 'מייצר...') : txt('Refresh with AI', 'רענן עם AI')}
                    </button>
                )}
                <div className="flex items-center gap-2 ms-auto flex-wrap">
                    {criticalCount > 0 && (
                        <button
                            onClick={() => setFilterMode(f => f === 'critical' ? null : 'critical')}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-all ${filterMode === 'critical' ? 'bg-red-500 text-white ring-2 ring-red-300' : 'bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white'}`}
                        >
                            <AlertTriangle size={10} />
                            {criticalCount} {txt('Critical', 'קריטי')}
                        </button>
                    )}
                    {highCount > 0 && (
                        <button
                            onClick={() => setFilterMode(f => f === 'high' ? null : 'high')}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-all ${filterMode === 'high' ? 'bg-orange-500 text-white ring-2 ring-orange-300' : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white'}`}
                        >
                            <BadgeAlert size={10} />
                            {highCount} {txt('High', 'גבוה')}
                        </button>
                    )}
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
                        <span className={`text-[11px] font-medium shrink-0 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                            {doneItems}/{totalItems} {txt('done', 'טופל')}
                        </span>
                    </div>
                </div>
            )}

            {/* Scrollable content - dir=ltr forces scrollbar to right side even in RTL mode */}
            <div className="flex-1 overflow-y-auto custom-scrollbar" dir="ltr">
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

            {/* Filtered flat list */}
            {filteredItems && (
                <div className="p-4 space-y-2">
                    <div className={`text-xs font-semibold mb-3 flex items-center gap-2 ${filterMode === 'critical' ? 'text-red-400' : 'text-orange-400'}`}>
                        {filterMode === 'critical' ? <AlertTriangle size={13} /> : <BadgeAlert size={13} />}
                        {filterMode === 'critical' ? txt(`${filteredItems.length} Critical Items`, `${filteredItems.length} פריטים קריטיים`) : txt(`${filteredItems.length} High Priority Items`, `${filteredItems.length} פריטים בעדיפות גבוהה`)}
                    </div>
                    {filteredItems.map(({ categoryTitle, categoryEmoji, categoryIcon: CatIcon, catId, item }, idx) => {
                        const itemId = `filter-${idx}`;
                        const key = itemKey(catId || categoryTitle, item);
                        const p = PRIORITIES[item.priority] || PRIORITIES.low;
                        const isExpanded = expandedItems.has(itemId);
                        const isChecked = checkedItems.has(key);
                        return (
                            <div key={itemId} className={`rounded-xl ring-1 overflow-hidden ${p.border} ${isChecked ? 'opacity-50' : ''} ${isLight ? 'bg-white' : 'bg-white/5'}`}>
                                <div className="flex items-start">
                                    <button
                                        onClick={() => toggleChecked(key)}
                                        className={`shrink-0 m-3 mt-3.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-green-500 border-green-500' : isLight ? 'border-gray-300 hover:border-green-400' : 'border-gray-600 hover:border-green-500'}`}
                                    >
                                        {isChecked && <CheckCircle size={10} className="text-white" />}
                                    </button>
                                    <button
                                        onClick={() => toggleItem(itemId)}
                                        className={`flex-1 flex items-start gap-3 p-3 ps-0 text-start transition-colors ${isLight ? 'hover:bg-gray-50' : 'hover:bg-white/5'}`}
                                    >
                                        <div className={`mt-0.5 shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${p.color}`}>
                                            {filterMode === 'critical' ? txt('CRITICAL', 'קריטי') : txt('HIGH', 'גבוה')}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-xs font-semibold ${isChecked ? 'line-through' : ''} ${isLight ? 'text-gray-900' : 'text-white'}`}>{item.title}</div>
                                            <div className={`text-[11px] mt-0.5 flex items-center gap-1 ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {categoryEmoji ? <span>{categoryEmoji}</span> : CatIcon ? <CatIcon size={10} /> : null}
                                                {categoryTitle}
                                            </div>
                                        </div>
                                        {isExpanded ? <ChevronDown size={13} className="shrink-0 mt-0.5 text-gray-400" /> : <ChevronRight size={13} className="shrink-0 mt-0.5 text-gray-400" />}
                                    </button>
                                </div>
                                {isExpanded && (
                                    <div className={`px-3 pb-3 space-y-1 border-t ${isLight ? 'border-gray-100' : 'border-white/5'}`}>
                                        <p className={`pt-2 text-xs ${isLight ? 'text-gray-600' : 'text-gray-300'}`}>{item.desc || item.description}</p>
                                        {item.details && <p className={`text-[11px] mt-1 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>{item.details}</p>}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Categories */}
            {!filteredItems && !(!aiData && aiSilentLoading) && <div className="p-4 space-y-3">
                {(activeCategories
                    ? activeCategories.map(cat => {
                        const c = (isLight ? LIGHT_COLOR_MAP : COLOR_MAP).blue;
                        const isOpen = expandedCategories.has(cat.id);
                        const criticals = cat.items.filter(i => i.priority === 'critical').length;
                        const highs = cat.items.filter(i => i.priority === 'high').length;
                        return (
                            <div key={cat.id} className={`rounded-xl ring-1 overflow-hidden ${c.ring} ${isLight ? 'bg-white' : 'bg-white/5'}`}>
                                <button
                                    onClick={() => toggleCategory(cat.id)}
                                    className={`w-full flex items-center gap-3 p-3 text-start transition-colors ${isLight ? 'hover:bg-gray-50' : 'hover:bg-white/5'}`}
                                >
                                    <div className={`p-1.5 rounded-lg ${isLight ? 'bg-blue-50' : 'bg-blue-500/10'}`}>
                                        {categoryIcon(cat)}
                                    </div>
                                    <span className={`text-sm font-semibold flex-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>{cat.title}</span>
                                    <div className="flex items-center gap-1.5">
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
                                                        key={idx}
                                                        item={normalizedItem}
                                                        isLight={isLight}
                                                        language={language}
                                                        isExpanded={expandedItems.has(`${cat.id}-${idx}`)}
                                                        onToggle={() => toggleItem(`${cat.id}-${idx}`)}
                                                        checked={checkedItems.has(key)}
                                                        onCheck={() => toggleChecked(key)}
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
                                                        isLight={isLight}
                                                        language={language}
                                                        isExpanded={expandedItems.has(item.id)}
                                                        onToggle={() => toggleItem(item.id)}
                                                        checked={checkedItems.has(key)}
                                                        onCheck={() => toggleChecked(key)}
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
        </div>
    );
}
