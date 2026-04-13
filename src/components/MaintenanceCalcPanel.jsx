import { useState, useMemo } from 'react';
import {
    Calculator, ChevronDown, ChevronRight, CheckCircle, Info, BrainCircuit, Loader2,
    Wrench, Zap, PaintbrushVertical, Hammer, Droplets, LayoutList, BookOpen,
    Thermometer, ShieldCheck, Trees, Waves, Home, Lightbulb,
} from 'lucide-react';
import { getChatResponse } from '../utils/ai-chat';

// Maps Hebrew section keywords → lucide icon + accent color class
const SECTION_ICONS = [
    { pattern: /אינסטלציה|צנרת|שרברב/,        Icon: Droplets,           color: 'text-blue-500'   },
    { pattern: /חשמל/,                          Icon: Zap,                color: 'text-yellow-500' },
    { pattern: /צביע|טיח|גבס/,                 Icon: PaintbrushVertical, color: 'text-orange-400' },
    { pattern: /נגרות|דלת|ארון|ריהוט/,         Icon: Hammer,             color: 'text-amber-600'  },
    { pattern: /מזגן|קירור|חימום/,             Icon: Thermometer,        color: 'text-cyan-500'   },
    { pattern: /מכשיר|מקרר|כביס|מדיח|תנור/,   Icon: Home,               color: 'text-purple-500' },
    { pattern: /גינ|גנ|מרפסת/,                 Icon: Trees,              color: 'text-green-500'  },
    { pattern: /בריכ/,                          Icon: Waves,              color: 'text-sky-500'    },
    { pattern: /ביטח|שמירה|אבטח/,              Icon: ShieldCheck,        color: 'text-emerald-500'},
    { pattern: /גישה|הערכה|מתודולוגי|הסבר|גישת/,Icon: BookOpen,          color: 'text-indigo-400' },
    { pattern: /פירוט|קטגורי|רשימ/,            Icon: LayoutList,         color: 'text-indigo-500' },
    { pattern: /המלצ|עצה|טיפ/,                 Icon: Lightbulb,          color: 'text-yellow-400' },
    { pattern: /תיקו|תחזוק|כללי/,              Icon: Wrench,             color: 'text-teal-500'   },
];

function getSectionIcon(title) {
    const found = SECTION_ICONS.find(({ pattern }) => pattern.test(title));
    return found || { Icon: Info, color: 'text-indigo-400' };
}

// Render inline markdown: **bold**, *italic*
function renderInline(str) {
    const parts = str.split(/(\*{1,2}[^*\n]+\*{1,2})/g);
    return parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
        if (p.startsWith('*')  && p.endsWith('*'))  return <em key={i}>{p.slice(1, -1)}</em>;
        return p;
    });
}

// Professional markdown renderer for AI maintenance estimates
function MarkdownBlock({ text, isLight }) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let key = 0;
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trimEnd();

        if (!line.trim()) { i++; continue; }

        // Horizontal rule
        if (/^[-*_]{3,}$/.test(line.trim())) {
            elements.push(
                <hr key={key++} className={`my-3 border-t ${isLight ? 'border-indigo-100' : 'border-white/10'}`} />
            );
            i++; continue;
        }

        // Markdown heading (## Title) — large, icon-mapped
        const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
        if (headingMatch) {
            const title = headingMatch[2].replace(/\*\*/g, '');
            const { Icon, color } = getSectionIcon(title);
            elements.push(
                <div key={key++} className={`flex items-center gap-2 pt-3 pb-1 border-b ${isLight ? 'border-indigo-100' : 'border-indigo-500/20'}`}>
                    <Icon size={14} className={`shrink-0 ${color}`} />
                    <span className={`text-sm font-bold tracking-wide ${isLight ? 'text-indigo-800' : 'text-indigo-200'}`}>
                        {renderInline(headingMatch[2])}
                    </span>
                </div>
            );
            i++; continue;
        }

        // Bold-only line as a section title (e.g. **פירוט:**)
        const boldLineMatch = line.match(/^\*\*(.+?)\*\*\s*:?\s*$/);
        if (boldLineMatch) {
            const title = boldLineMatch[1];
            const { Icon, color } = getSectionIcon(title);
            elements.push(
                <div key={key++} className={`flex items-center gap-2 pt-3 pb-1 border-b ${isLight ? 'border-indigo-100' : 'border-indigo-500/20'}`}>
                    <Icon size={13} className={`shrink-0 ${color}`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
                        {title}
                    </span>
                </div>
            );
            i++; continue;
        }

        // Numbered list — collect consecutive items
        if (/^\d+\.\s/.test(line)) {
            const items = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i].trimEnd())) {
                items.push(lines[i].trimEnd().replace(/^\d+\.\s*/, ''));
                i++;
            }
            elements.push(
                <div key={key++} className="space-y-1.5 my-2">
                    {items.map((item, idx) => {
                        // Each numbered item may contain a cost — highlight it
                        const costMatch = item.match(/(₪[\d,]+)/g);
                        return (
                            <div key={idx} className={`flex items-start gap-2 rounded-lg px-2.5 py-2 ${isLight ? 'bg-indigo-50' : 'bg-indigo-900/20'}`}>
                                <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5
                                    ${isLight ? 'bg-indigo-200 text-indigo-700' : 'bg-indigo-500/30 text-indigo-300'}`}>
                                    {idx + 1}
                                </span>
                                <span className={`text-[11px] leading-snug flex-1 ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                    {renderInline(item)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            );
            continue;
        }

        // Bullet list — collect consecutive items
        if (/^[-*•]\s/.test(line)) {
            const items = [];
            while (i < lines.length && /^[-*•]\s/.test(lines[i].trimEnd())) {
                items.push(lines[i].trimEnd().replace(/^[-*•]\s*/, ''));
                i++;
            }
            elements.push(
                <div key={key++} className="space-y-1 my-1.5">
                    {items.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                            <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${isLight ? 'bg-indigo-400' : 'bg-indigo-500'}`} />
                            <span className={`text-[11px] leading-snug ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                {renderInline(item)}
                            </span>
                        </div>
                    ))}
                </div>
            );
            continue;
        }

        // Regular paragraph
        elements.push(
            <p key={key++} className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                {renderInline(line)}
            </p>
        );
        i++;
    }

    return <div className="space-y-0.5">{elements}</div>;
}

const CURRENT_YEAR = new Date().getFullYear();

// ─── Calibration ─────────────────────────────────────────────────────────────
// Includes: plumbing repairs, electrical repairs, painting (amortized), appliance
// repair/replacement (amortized), boiler/water heater, carpentry, general contractor.
// Excludes: ועד בית, ביטוח דירה, utilities — those are budgeted separately.
const PROPERTY_TYPES = [
    { id: 'apartment',  labelHe: 'דירה רגילה',    labelEn: 'Apartment',      baseRate: 55  },
    { id: 'garden',     labelHe: 'דירת גן',        labelEn: 'Garden Apt',     baseRate: 68  },
    { id: 'penthouse',  labelHe: 'פנטהאוז',        labelEn: 'Penthouse',      baseRate: 82  },
    { id: 'cottage',    labelHe: "קוטג' / דופלקס", labelEn: 'Cottage/Duplex', baseRate: 105 },
    { id: 'house',      labelHe: 'בית פרטי',       labelEn: 'Private House',  baseRate: 130 },
];

const CONDITIONS = [
    { id: 'excellent', labelHe: 'מצוין',      labelEn: 'Excellent',  factor: 0.65 },
    { id: 'good',      labelHe: 'טוב',         labelEn: 'Good',       factor: 1.00 },
    { id: 'average',   labelHe: 'בינוני',      labelEn: 'Average',    factor: 1.35 },
    { id: 'needsWork', labelHe: 'דרוש שיפוץ', labelEn: 'Needs Work', factor: 1.80 },
];

// Occupancy factor: single person uses appliances/plumbing/surfaces far less than a family.
// Baseline (1.00) = 3-4 people. Scale is sub-linear — fixed costs (structure, roof, aging)
// don't depend on occupancy; only usage-driven wear does (~60% of total).
const OCCUPANCY_OPTIONS = [
    { id: '1',  labelHe: '1 (לבד)',       labelEn: '1 (alone)',   factor: 0.72 },
    { id: '2',  labelHe: '2 נפשות',       labelEn: '2 people',    factor: 0.86 },
    { id: '3',  labelHe: '3–4 נפשות',     labelEn: '3–4 people',  factor: 1.00 },
    { id: '5',  labelHe: '5+ נפשות',      labelEn: '5+ people',   factor: 1.15 },
];

function getAgeFactor(years) {
    if (years <= 5)  return 0.60;
    if (years <= 10) return 0.80;
    if (years <= 20) return 1.00;
    if (years <= 30) return 1.25;
    return 1.50;
}

function getAgeLabel(years, isHe) {
    if (years <= 5)  return isHe ? 'חדש מאוד (עד 5 שנים)' : 'Very new (≤5 yrs)';
    if (years <= 10) return isHe ? 'חדש (6–10 שנים)' : 'New (6–10 yrs)';
    if (years <= 20) return isHe ? 'בינוני (11–20 שנים)' : 'Mid-age (11–20 yrs)';
    if (years <= 30) return isHe ? 'מבוגר (21–30 שנים)' : 'Older (21–30 yrs)';
    return isHe ? 'ישן (מעל 30 שנה)' : 'Old (>30 yrs)';
}

// tama38Type: '1' = חיזוק+שיפוץ, '2' = פינוי-בינוי
function resolveEffectiveAge(originalAge, hasTama, tamaType, tamaYear) {
    if (!hasTama) return { effectiveAge: originalAge, tamaNote: null };
    const tamaSince = Math.max(0, CURRENT_YEAR - (parseInt(tamaYear) || CURRENT_YEAR));
    if (tamaType === '2') {
        return { effectiveAge: tamaSince, tamaNote: 'tama2' };
    }
    // /1: 65% of systems renewed, 35% still original
    return { effectiveAge: Math.round(0.35 * originalAge + 0.65 * tamaSince), tamaNote: 'tama1' };
}

function buildAiPrompt(inputs, isHe, householdSize) {
    const { propertyType, sqm, age, acUnits, condition, hasGarden, hasPool, hasTama, tamaType, tamaYear } = inputs;
    const pt = PROPERTY_TYPES.find(p => p.id === propertyType) || PROPERTY_TYPES[0];
    const cond = CONDITIONS.find(c => c.id === condition) || CONDITIONS[1];
    const occ = OCCUPANCY_OPTIONS.find(o => o.id === householdSizeToOccupancyId(householdSize)) || OCCUPANCY_OPTIONS[2];
    const { effectiveAge } = resolveEffectiveAge(age, hasTama, tamaType, tamaYear);

    const lines = [
        `סוג נכס: ${pt.labelHe}`,
        `שטח: ${sqm} מ"ר`,
        `גיל הנכס: ${age} שנים${hasTama ? ` (עבר תמ"א 38/${tamaType} בשנת ${tamaYear}, גיל אפקטיבי: ${effectiveAge} שנים)` : ''}`,
        `מצב: ${cond.labelHe}`,
        `מספר נפשות: ${occ.labelHe} — שים לב שבדיירות בודדת השחיקה על אינסטלציה, מכשירים, צביעה ורצפות נמוכה משמעותית`,
        `מזגנים: ${acUnits || 0}`,
        `גינה / מרפסת גדולה: ${hasGarden ? 'כן' : 'לא'}`,
        `בריכה: ${hasPool ? 'כן' : 'לא'}`,
    ];

    return `אתה מומחה לתחזוקת נכסים בישראל.
הערך עלות תחזוקה שנתית ריאלית עבור הנכס הבא:

${lines.join('\n')}

חשוב מאוד — אל תכלול בהערכה:
- ועד בית (מתוקצב בנפרד)
- ביטוח דירה (מתוקצב בנפרד)
- חשמל, מים, גז (מתוקצבים בנפרד)
- שירות מזגנים (מתוקצב בנפרד)

כלול רק הוצאות תיקון ותחזוקה שהדייר/בעלים משלם בפועל:
תיקוני אינסטלציה, תיקוני חשמל, צביעה (אמורטיזציה), תיקון/החלפת מכשירי חשמל (אמורטיזציה), דוד שמש/חשמלי, נגרות, קבלן כללי, מזיקים וכו׳.

ספק:
1. סכום שנתי כולל (בשקלים) — בשורה ראשונה בפורמט: **סה"כ: ₪X,XXX**
2. פירוט לפי קטגוריות (4-6 קטגוריות)
3. הסבר קצר לגישת ההערכה

היה ריאליסטי ומעשי. ענה בעברית.`;
}

// Parse a number out of the AI response (looks for bold total line)
function parseAiTotal(text) {
    const match = text.match(/[*_]{0,2}סה["\u05d4]?כ[^:]*:\s*[₪]?\s*([\d,]+)/);
    if (match) return parseInt(match[1].replace(/,/g, ''), 10);
    // fallback: find any ₪ followed by number
    const nums = [...text.matchAll(/₪\s*([\d,]+)/g)].map(m => parseInt(m[1].replace(/,/g, ''), 10));
    return nums.length ? Math.max(...nums) : null;
}

// Map a raw household count to the nearest occupancy option id.
function householdSizeToOccupancyId(n) {
    const count = parseInt(n) || 1;
    if (count <= 1) return '1';
    if (count === 2) return '2';
    if (count <= 4) return '3';
    return '5';
}

export function MaintenanceCalcPanel({ item, isHe, isLight, currency, onApply, householdSize, aiProvider, aiModel, apiKeyOverride }) {
    const saved = item.calcInputs || {};
    const [propertyType, setPropertyType] = useState(saved.propertyType || 'apartment');
    const [sqm, setSqm]         = useState(saved.sqm    != null ? String(saved.sqm)     : '');
    const [age, setAge]         = useState(saved.age    != null ? String(saved.age)     : '');
    const [acUnits, setAcUnits] = useState(saved.acUnits != null ? String(saved.acUnits) : '');
    const [condition, setCondition] = useState(saved.condition || 'good');
    const [hasGarden, setHasGarden] = useState(saved.hasGarden || false);
    const [hasPool,   setHasPool]   = useState(saved.hasPool   || false);
    const [hasTama,   setHasTama]   = useState(saved.hasTama   || false);
    const [tamaType,  setTamaType]  = useState(saved.tamaType  || '1');
    const [tamaYear,  setTamaYear]  = useState(saved.tamaYear  != null ? String(saved.tamaYear) : '');
    const [showBreakdown, setShowBreakdown] = useState(false);

    // AI state
    const [aiLoading, setAiLoading]   = useState(false);
    const [aiResult, setAiResult]     = useState(null);   // { text, total }
    const [aiError, setAiError]       = useState(null);
    const [aiOpen, setAiOpen]         = useState(true);
    const [aiLastKey, setAiLastKey]   = useState(null);   // JSON snapshot of inputs when last asked

    const isHouseType = propertyType === 'house' || propertyType === 'penthouse' || propertyType === 'cottage';

    const calc = useMemo(() => {
        const s = parseFloat(sqm) || 0;
        if (!s) return null;
        const origAge = parseFloat(age) || 0;
        const ac  = parseFloat(acUnits) || 0;
        const pt   = PROPERTY_TYPES.find(p => p.id === propertyType) || PROPERTY_TYPES[0];
        const cond = CONDITIONS.find(c => c.id === condition)        || CONDITIONS[1];
        const occId = householdSizeToOccupancyId(householdSize);
        const occ  = OCCUPANCY_OPTIONS.find(o => o.id === occId) || OCCUPANCY_OPTIONS[2];
        const { effectiveAge, tamaNote } = resolveEffectiveAge(origAge, hasTama, tamaType, tamaYear);
        const ageFactor = getAgeFactor(effectiveAge);
        // Split core into structural (age-driven, ~40%) and usage-driven (~60%).
        // Only the usage-driven portion scales with occupancy.
        const coreRaw    = s * pt.baseRate * ageFactor * cond.factor;
        const structural = coreRaw * 0.40;
        const usageDriven = coreRaw * 0.60 * occ.factor;
        const core       = Math.round(structural + usageDriven);
        const acCost     = Math.round(ac * 600 * occ.factor);   // AC service also scales with use
        const gardenCost = hasGarden ? 2500 : 0;
        const poolCost   = (hasPool && isHouseType) ? 8000 : 0;
        const total      = core + acCost + gardenCost + poolCost;
        return { core, acCost, gardenCost, poolCost, total, ageFactor, cond, occ, pt, s, origAge, effectiveAge, ac, tamaNote };
    }, [sqm, age, acUnits, propertyType, condition, householdSize, hasGarden, hasPool, isHouseType, hasTama, tamaType, tamaYear]);

    const txt = (en, he) => isHe ? he : en;
    const fmt = (v) => `${currency}${Math.round(v).toLocaleString()}`;

    const currentCalcInputs = () => ({
        propertyType,
        sqm:     parseFloat(sqm)     || 0,
        age:     parseFloat(age)     || 0,
        acUnits: parseFloat(acUnits) || 0,
        condition, hasGarden, hasPool,
        hasTama, tamaType,
        tamaYear: hasTama ? (parseInt(tamaYear) || null) : null,
    });

    const canAsk = !!(aiProvider && aiModel && parseFloat(sqm));

    const buildAiKey = () => JSON.stringify({
        ...currentCalcInputs(),
        householdSize: parseInt(householdSize) || 1,
        aiModel,
    });

    const inputsChanged = canAsk && buildAiKey() !== aiLastKey;

    const handleAskAi = async () => {
        if (!canAsk) return;
        const key = buildAiKey();
        // If inputs haven't changed since last fetch, just open the panel — no re-fetch
        if (key === aiLastKey && aiResult) {
            setAiOpen(true);
            return;
        }
        setAiOpen(true);
        setAiLoading(true);
        setAiError(null);
        setAiResult(null);
        try {
            const prompt = buildAiPrompt(currentCalcInputs(), isHe, householdSize);
            const reply = await getChatResponse(
                [{ role: 'user', content: prompt }],
                'You are a home maintenance cost expert for Israeli real estate.',
                aiProvider, aiModel, apiKeyOverride
            );
            const total = parseAiTotal(reply);
            setAiResult({ text: reply, total });
            setAiLastKey(key);
        } catch (err) {
            setAiError(isHe ? 'שגיאה בקבלת הערכת AI' : 'AI estimate failed');
        } finally {
            setAiLoading(false);
        }
    };

    const fieldClass = `w-full text-xs px-2 py-1.5 rounded-lg border outline-none ${
        isLight
            ? 'bg-white border-teal-200 text-slate-800 placeholder-slate-300 focus:border-teal-400'
            : 'bg-teal-900/30 border-teal-500/30 text-white placeholder-gray-500 focus:border-teal-400'
    }`;

    return (
        <div className={`mx-2 mb-1.5 rounded-xl border overflow-hidden ${isLight ? 'bg-teal-50 border-teal-200' : 'bg-teal-900/20 border-teal-500/30'}`} dir={isHe ? 'rtl' : 'ltr'}>

            {/* Header */}
            <div className={`flex items-center gap-2 px-3 py-2 border-b ${isLight ? 'bg-teal-100/70 border-teal-200' : 'bg-teal-500/10 border-teal-500/20'}`}>
                <Calculator size={13} className={isLight ? 'text-teal-600' : 'text-teal-400'} />
                <span className={`text-xs font-semibold flex-1 ${isLight ? 'text-teal-700' : 'text-teal-300'}`}>
                    {txt('Annual Maintenance Calculator', 'מחשבון תחזוקה שנתית')}
                </span>
                <span className={`text-[10px] ${isLight ? 'text-teal-500' : 'text-teal-500'}`}>
                    {txt('excl. fees, insurance & utilities', 'ללא ועד בית, ביטוח ושירותים')}
                </span>
            </div>

            <div className="p-3 space-y-3">

                {/* Property type */}
                <div>
                    <label className={`text-[11px] font-medium block mb-1.5 ${isLight ? 'text-teal-700' : 'text-teal-300'}`}>{txt('Property type', 'סוג הנכס')}</label>
                    <div className="flex flex-wrap gap-1">
                        {PROPERTY_TYPES.map(pt => (
                            <button key={pt.id}
                                onClick={() => { setPropertyType(pt.id); if (!['house','penthouse','cottage'].includes(pt.id)) setHasPool(false); }}
                                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${propertyType === pt.id
                                    ? (isLight ? 'bg-teal-600 text-white font-semibold' : 'bg-teal-500 text-white font-semibold')
                                    : (isLight ? 'bg-white text-teal-700 border border-teal-200 hover:bg-teal-100' : 'bg-teal-900/30 text-teal-300 border border-teal-500/30 hover:bg-teal-500/20')}`}
                            >{isHe ? pt.labelHe : pt.labelEn}</button>
                        ))}
                    </div>
                </div>

                {/* Size + Age */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={`text-[11px] font-medium block mb-1 ${isLight ? 'text-teal-700' : 'text-teal-300'}`}>{txt('Built area (sqm)', 'שטח בנוי (מ"ר)')}</label>
                        <input type="number" min="0" value={sqm} onChange={e => setSqm(e.target.value)} placeholder={isHe ? "לדוג׳ 85" : 'e.g. 85'} className={fieldClass} />
                    </div>
                    <div>
                        <label className={`text-[11px] font-medium block mb-1 ${isLight ? 'text-teal-700' : 'text-teal-300'}`}>{txt('Property age (years)', 'גיל הנכס (שנים)')}</label>
                        <input type="number" min="0" value={age} onChange={e => setAge(e.target.value)} placeholder={isHe ? "לדוג׳ 20" : 'e.g. 20'} className={fieldClass} />
                        {age !== '' && !hasTama && parseFloat(age) >= 0 && (
                            <div className={`text-[10px] mt-0.5 ${isLight ? 'text-teal-500' : 'text-teal-500'}`}>{getAgeLabel(parseFloat(age), isHe)}</div>
                        )}
                    </div>
                </div>

                {/* TAMA 38 */}
                <div className={`rounded-xl border overflow-hidden ${hasTama ? (isLight ? 'bg-purple-50 border-purple-200' : 'bg-purple-900/20 border-purple-500/30') : (isLight ? 'bg-white border-teal-100' : 'bg-teal-900/10 border-teal-500/20')}`}>
                    {/* Header row — always visible, click toggles both checkbox and open state */}
                    <button
                        type="button"
                        onClick={() => setHasTama(v => !v)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 select-none"
                    >
                        <input
                            type="checkbox"
                            checked={hasTama}
                            readOnly
                            className="rounded w-3.5 h-3.5 accent-purple-500 pointer-events-none"
                        />
                        <span className={`flex-1 text-xs font-medium text-start ${hasTama ? (isLight ? 'text-purple-700' : 'text-purple-300') : (isLight ? 'text-teal-700' : 'text-teal-300')}`}>
                            {txt('Property underwent TAMA 38', 'הנכס עבר תמ"א 38')}
                        </span>
                        {hasTama && (
                            <span className={`text-[10px] shrink-0 ${isLight ? 'text-purple-500' : 'text-purple-400'}`}>
                                {calc
                                    ? (isHe ? `גיל אפקטיבי ${calc.effectiveAge} שנים` : `eff. age ${calc.effectiveAge} yrs`)
                                    : tamaYear
                                        ? (isHe ? `${tamaType === '2' ? 'פינוי-בינוי' : 'חיזוק'} ${tamaYear}` : `${tamaType === '2' ? 'rebuild' : 'renov.'} ${tamaYear}`)
                                        : (isHe ? `תמ"א 38/${tamaType}` : `TAMA 38/${tamaType}`)
                                }
                            </span>
                        )}
                        <ChevronDown size={13} className={`shrink-0 transition-transform duration-200 ${hasTama ? 'rotate-180' : ''} ${hasTama ? (isLight ? 'text-purple-400' : 'text-purple-400') : (isLight ? 'text-teal-400' : 'text-teal-500')}`} />
                    </button>

                    {hasTama && (
                        <div className={`px-3 pb-2.5 space-y-2 border-t ${isLight ? 'border-purple-100' : 'border-purple-500/20'}`}>
                            {/* Type selector */}
                            <div className="pt-2">
                                <div className="flex gap-1.5">
                                    {[
                                        { id: '1', labelHe: '38/1 — חיזוק ושיפוץ', labelEn: 'TAMA 38/1 — Renovation' },
                                        { id: '2', labelHe: '38/2 — פינוי-בינוי',   labelEn: 'TAMA 38/2 — Rebuild' },
                                    ].map(opt => (
                                        <button key={opt.id} onClick={() => setTamaType(opt.id)}
                                            className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] leading-tight transition-colors ${tamaType === opt.id
                                                ? (isLight ? 'bg-purple-600 text-white font-semibold' : 'bg-purple-500 text-white font-semibold')
                                                : (isLight ? 'bg-white text-purple-700 border border-purple-200 hover:bg-purple-50' : 'bg-purple-900/30 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20')}`}
                                        >{isHe ? opt.labelHe : opt.labelEn}</button>
                                    ))}
                                </div>
                                <div className={`mt-1 flex items-start gap-1 text-[10px] leading-snug ${isLight ? 'text-purple-400' : 'text-purple-500'}`}>
                                    <Info size={10} className="shrink-0 mt-0.5" />
                                    {tamaType === '2'
                                        ? txt('Full rebuild — age reset to completion year.', 'בנייה מחדש — גיל מאפס משנת ההשלמה.')
                                        : txt('65% renewed, 35% original age.', '65% חודש, 35% גיל מקורי.')}
                                </div>
                            </div>
                            {/* Year + effective age on one row */}
                            <div className="flex items-end gap-2">
                                <div className="w-24 shrink-0">
                                    <label className={`text-[11px] font-medium block mb-1 ${isLight ? 'text-purple-600' : 'text-purple-300'}`}>{txt('Year', 'שנה')}</label>
                                    <input type="number" min="1990" max={CURRENT_YEAR} value={tamaYear} onChange={e => setTamaYear(e.target.value)}
                                        placeholder={String(CURRENT_YEAR - 5)}
                                        className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none ${isLight ? 'bg-white border-purple-200 text-slate-800 focus:border-purple-400' : 'bg-purple-900/30 border-purple-500/30 text-white focus:border-purple-400'}`}
                                    />
                                </div>
                                {calc && (
                                    <div className={`flex-1 text-[11px] rounded-lg px-2.5 py-1.5 ${isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-500/15 text-purple-300'}`}>
                                        {isHe
                                            ? `גיל אפקטיבי: ${calc.effectiveAge} שנים${tamaType === '1' ? ` (במקום ${calc.origAge})` : ''} · ${getAgeLabel(calc.effectiveAge, isHe)}`
                                            : `Eff. age: ${calc.effectiveAge} yrs${tamaType === '1' ? ` (orig. ${calc.origAge})` : ''} · ${getAgeLabel(calc.effectiveAge, isHe)}`}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* AC units + Condition */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={`text-[11px] font-medium block mb-1 ${isLight ? 'text-teal-700' : 'text-teal-300'}`}>
                            {txt('AC units', 'מזגנים')}
                            <span className={`font-normal ms-1 ${isLight ? 'text-teal-400' : 'text-teal-600'}`}>{txt('(+₪600/unit)', '(+₪600/יח׳)')}</span>
                        </label>
                        <input type="number" min="0" value={acUnits} onChange={e => setAcUnits(e.target.value)} placeholder="0" className={fieldClass} />
                    </div>
                    <div>
                        <label className={`text-[11px] font-medium block mb-1 ${isLight ? 'text-teal-700' : 'text-teal-300'}`}>{txt('Condition', 'מצב הנכס')}</label>
                        <div className={`grid grid-cols-2 gap-0.5 rounded-lg overflow-hidden border ${isLight ? 'border-teal-200' : 'border-teal-500/30'}`}>
                            {CONDITIONS.map(c => (
                                <button key={c.id} onClick={() => setCondition(c.id)}
                                    className={`py-1.5 text-[10px] transition-colors ${condition === c.id
                                        ? (isLight ? 'bg-teal-600 text-white font-semibold' : 'bg-teal-500 text-white font-semibold')
                                        : (isLight ? 'bg-white text-teal-700 hover:bg-teal-50' : 'bg-teal-900/30 text-teal-300 hover:bg-teal-500/20')}`}
                                >{isHe ? c.labelHe : c.labelEn}</button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Garden / Pool + occupancy badge */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={hasGarden} onChange={e => setHasGarden(e.target.checked)} className="rounded accent-teal-500 w-3.5 h-3.5" />
                        <span className={`text-xs ${isLight ? 'text-teal-700' : 'text-teal-300'}`}>{txt('Garden / balcony (+₪2,500)', 'גינה / מרפסת (+₪2,500)')}</span>
                    </label>
                    {isHouseType && (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={hasPool} onChange={e => setHasPool(e.target.checked)} className="rounded accent-teal-500 w-3.5 h-3.5" />
                            <span className={`text-xs ${isLight ? 'text-teal-700' : 'text-teal-300'}`}>{txt('Pool (+₪8,000)', 'בריכה (+₪8,000)')}</span>
                        </label>
                    )}
                    {calc && (
                        <span className={`text-[10px] flex items-center gap-1 ${isLight ? 'text-teal-500' : 'text-teal-600'}`}>
                            <Info size={10} className="shrink-0" />
                            {isHe ? `${householdSize || 1} נפש · ×${calc.occ.factor.toFixed(2)}` : `${householdSize || 1}p · ×${calc.occ.factor.toFixed(2)}`}
                        </span>
                    )}
                </div>

                {/* Formula result */}
                {calc ? (
                    <div className={`rounded-xl border p-3 ${isLight ? 'bg-white border-teal-200' : 'bg-teal-900/30 border-teal-500/30'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-semibold ${isLight ? 'text-teal-700' : 'text-teal-300'}`}>{txt('Formula estimate', 'הערכת נוסחה')}</span>
                            <button onClick={() => setShowBreakdown(v => !v)} className={`flex items-center gap-0.5 text-[10px] ${isLight ? 'text-teal-500 hover:text-teal-700' : 'text-teal-400 hover:text-teal-200'}`}>
                                {txt('breakdown', 'פירוט')}
                                {showBreakdown ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                            </button>
                        </div>
                        <div className="flex items-baseline gap-3">
                            <span className={`text-xl font-black ${isLight ? 'text-teal-700' : 'text-teal-300'}`}>{fmt(calc.total)}</span>
                            <span className={`text-xs ${isLight ? 'text-teal-500' : 'text-teal-500'}`}>≈ {fmt(calc.total / 12)} / {txt('month', 'חודש')}</span>
                        </div>

                        {showBreakdown && (
                            <div className={`mt-2.5 pt-2.5 border-t space-y-1.5 text-[11px] ${isLight ? 'border-teal-100' : 'border-teal-500/20'}`}>
                                <div className="flex justify-between">
                                    <span className={isLight ? 'text-slate-500' : 'text-gray-400'}>
                                        {txt('Base', 'בסיס')} ({calc.s} {txt('sqm', 'מ"ר')} × {fmt(calc.pt.baseRate)}) · {getAgeLabel(calc.effectiveAge, isHe)}{calc.tamaNote && <span className={isLight ? ' text-purple-500' : ' text-purple-400'}> ✦ תמ"א</span>} · {isHe ? calc.cond.labelHe : calc.cond.labelEn} · {isHe ? calc.occ.labelHe : calc.occ.labelEn}
                                    </span>
                                    <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>{fmt(calc.core)}</span>
                                </div>
                                {calc.acCost > 0 && <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-gray-400'}>{txt('AC service', 'שירות מזגנים')} ({calc.ac} × {fmt(600)})</span><span className={`font-medium ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>{fmt(calc.acCost)}</span></div>}
                                {calc.gardenCost > 0 && <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-gray-400'}>{txt('Garden / balcony', 'גינה / מרפסת')}</span><span className={`font-medium ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>{fmt(calc.gardenCost)}</span></div>}
                                {calc.poolCost > 0 && <div className="flex justify-between"><span className={isLight ? 'text-slate-500' : 'text-gray-400'}>{txt('Pool', 'בריכה')}</span><span className={`font-medium ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>{fmt(calc.poolCost)}</span></div>}
                                <div className={`flex justify-between pt-1 border-t font-semibold ${isLight ? 'border-teal-100 text-teal-700' : 'border-teal-500/20 text-teal-300'}`}><span>{txt('Total / year', 'סה"כ / שנה')}</span><span>{fmt(calc.total)}</span></div>
                            </div>
                        )}

                        <button onClick={() => onApply({ amount: calc.total, calcInputs: currentCalcInputs() })}
                            className={`mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${isLight ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm' : 'bg-teal-500 text-white hover:bg-teal-400'}`}>
                            <CheckCircle size={13} />
                            {txt('Apply formula estimate', 'החל הערכת נוסחה')} — {fmt(calc.total)} / {txt('yr', 'שנה')}
                        </button>
                    </div>
                ) : (
                    <div className={`text-center text-xs py-3 ${isLight ? 'text-teal-400' : 'text-teal-600'}`}>
                        {txt('Enter property size above to calculate', 'הזן שטח הנכס לחישוב האוטומטי')}
                    </div>
                )}

                {/* AI Estimate */}
                {aiProvider && aiModel && (
                    <div className={`rounded-xl border overflow-hidden ${isLight ? 'border-indigo-200' : 'border-indigo-500/30'}`}>
                        {/* Header — always visible */}
                        <div className={`flex items-center gap-2 px-3 py-2 ${isLight ? 'bg-indigo-50' : 'bg-indigo-900/20'}`}>
                            {/* Toggle open/close */}
                            <button
                                onClick={() => setAiOpen(v => !v)}
                                className="flex items-center gap-2 flex-1 min-w-0"
                            >
                                <BrainCircuit size={13} className={isLight ? 'text-indigo-500' : 'text-indigo-400'} />
                                <span className={`text-xs font-semibold ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>{txt('AI Estimate', 'הערכת AI')}</span>
                                {/* Summary when collapsed */}
                                {!aiOpen && aiResult?.total && (
                                    <span className={`text-xs font-bold ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`}>
                                        — {fmt(aiResult.total)}
                                    </span>
                                )}
                                <ChevronDown size={13} className={`shrink-0 transition-transform duration-200 ${aiOpen ? 'rotate-180' : ''} ${isLight ? 'text-indigo-400' : 'text-indigo-500'}`} />
                            </button>
                            {/* Ask / Refresh button */}
                            <button
                                onClick={handleAskAi}
                                disabled={!canAsk || aiLoading}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 ${canAsk && !aiLoading
                                    ? inputsChanged
                                        ? (isLight ? 'bg-indigo-600 text-white hover:bg-indigo-700 ring-1 ring-indigo-400' : 'bg-indigo-500 text-white hover:bg-indigo-400 ring-1 ring-indigo-400')
                                        : (isLight ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200' : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30')
                                    : (isLight ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-gray-600 cursor-not-allowed')}`}
                            >
                                {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <BrainCircuit size={11} />}
                                {aiLoading
                                    ? txt('Analyzing...', 'מנתח...')
                                    : aiResult && !inputsChanged
                                        ? txt('Up to date', 'עדכני')
                                        : txt('Ask AI', 'שאל AI')}
                            </button>
                        </div>

                        {/* Body — collapsible */}
                        {aiOpen && (
                            <div className={`border-t ${isLight ? 'border-indigo-100' : 'border-indigo-500/20'}`}>
                                {!canAsk && !aiResult && (
                                    <div className={`px-3 py-2 text-[11px] ${isLight ? 'text-indigo-400' : 'text-indigo-500'}`}>
                                        {txt('Enter property size first to enable AI estimate', 'הזן שטח הנכס כדי להפעיל הערכת AI')}
                                    </div>
                                )}
                                {aiLoading && (
                                    <div className={`flex items-center gap-2 px-3 py-3 text-[11px] ${isLight ? 'text-indigo-400' : 'text-indigo-500'}`}>
                                        <Loader2 size={13} className="animate-spin shrink-0" />
                                        {txt('Analyzing your property...', 'מנתח את הנכס...')}
                                    </div>
                                )}
                                {aiError && (
                                    <div className={`px-3 py-2 text-xs ${isLight ? 'text-red-500' : 'text-red-400'}`}>{aiError}</div>
                                )}
                                {aiResult && !aiLoading && (
                                    <div className={`p-3 space-y-2.5 ${isLight ? 'bg-white' : 'bg-indigo-900/10'}`}>
                                        {aiResult.total && (
                                            <div className="flex items-baseline gap-3">
                                                <span className={`text-xl font-black ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>{fmt(aiResult.total)}</span>
                                                <span className={`text-xs ${isLight ? 'text-indigo-400' : 'text-indigo-500'}`}>≈ {fmt(aiResult.total / 12)} / {txt('month', 'חודש')}</span>
                                            </div>
                                        )}
                                        <div className="max-h-56 overflow-y-auto custom-scrollbar scrollbar-right" dir="rtl">
                                            <MarkdownBlock text={aiResult.text} isLight={isLight} />
                                        </div>
                                        {aiResult.total && (
                                            <button onClick={() => onApply({ amount: aiResult.total, calcInputs: currentCalcInputs() })}
                                                className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${isLight ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm' : 'bg-indigo-500 text-white hover:bg-indigo-400'}`}>
                                                <CheckCircle size={13} />
                                                {txt('Apply AI estimate', 'החל הערכת AI')} — {fmt(aiResult.total)} / {txt('yr', 'שנה')}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
