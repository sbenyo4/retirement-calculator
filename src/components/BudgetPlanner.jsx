import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Target, RotateCcw, BrainCircuit, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getBudgetItems, setBudgetItems } from '../utils/db';
import { getChatResponse } from '../utils/ai-chat';

const SAVE_DEBOUNCE_MS = 1000;

// ─── Category metadata ────────────────────────────────────────────────────────
const CATEGORIES = [
    { id: 'housing',       icon: '🏠', labelHe: 'דיור',     labelEn: 'Housing'       },
    { id: 'food',          icon: '🛒', labelHe: 'מזון',     labelEn: 'Food'          },
    { id: 'health',        icon: '🏥', labelHe: 'בריאות',   labelEn: 'Health'        },
    { id: 'transport',     icon: '🚗', labelHe: 'תחבורה',   labelEn: 'Transport'     },
    { id: 'entertainment', icon: '🎭', labelHe: 'בילויים',  labelEn: 'Entertainment' },
    { id: 'personal',      icon: '👤', labelHe: 'אישי',     labelEn: 'Personal'      },
    { id: 'family',        icon: '👨‍👩‍👧', labelHe: 'משפחה',   labelEn: 'Family'        },
    { id: 'misc',          icon: '🔧', labelHe: 'שונות',    labelEn: 'Misc'          },
];

const DEFAULT_ITEMS = [
    { id: 'h-arnona',      categoryId: 'housing',       label: 'ארנונה',               amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-vaad',        categoryId: 'housing',       label: 'ועד בית',              amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-electricity', categoryId: 'housing',       label: 'חשמל',                 amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-water',       categoryId: 'housing',       label: 'מים',                  amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-gas',         categoryId: 'housing',       label: 'גז',                   amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-internet',    categoryId: 'housing',       label: 'אינטרנט + סלולר',      amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-insurance',   categoryId: 'housing',       label: 'ביטוח דירה',           amount: 0, frequency: 'annual',  enabled: true },
    { id: 'f-grocery',     categoryId: 'food',          label: 'קניות וסופר',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 'f-restaurants', categoryId: 'food',          label: 'מסעדות ובתי קפה',      amount: 0, frequency: 'monthly', enabled: true },
    { id: 'hlth-ins',      categoryId: 'health',        label: 'ביטוח בריאות משלים',   amount: 0, frequency: 'monthly', enabled: true },
    { id: 'hlth-doctors',  categoryId: 'health',        label: 'רופאים ותרופות',       amount: 0, frequency: 'monthly', enabled: true },
    { id: 'hlth-dental',   categoryId: 'health',        label: 'שיניים',               amount: 0, frequency: 'annual',  enabled: true },
    { id: 'hlth-optics',   categoryId: 'health',        label: 'אופטיקה',              amount: 0, frequency: 'annual',  enabled: true },
    { id: 't-car-ins',     categoryId: 'transport',     label: 'ביטוח + רישוי רכב',    amount: 0, frequency: 'annual',  enabled: true },
    { id: 't-fuel',        categoryId: 'transport',     label: 'דלק / טעינה',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 't-public',      categoryId: 'transport',     label: 'תחבורה ציבורית',       amount: 0, frequency: 'monthly', enabled: true },
    { id: 'e-sport',       categoryId: 'entertainment', label: 'ספורט וכושר',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 'e-culture',     categoryId: 'entertainment', label: 'תרבות ובידור',         amount: 0, frequency: 'monthly', enabled: true },
    { id: 'e-travel',      categoryId: 'entertainment', label: 'חופשות ונסיעות',       amount: 0, frequency: 'annual',  enabled: true },
    { id: 'p-clothing',    categoryId: 'personal',      label: 'ביגוד והנעלה',         amount: 0, frequency: 'annual',  enabled: true },
    { id: 'p-grooming',    categoryId: 'personal',      label: 'טיפוח ויופי',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 'fam-gifts',     categoryId: 'family',        label: 'מתנות',                amount: 0, frequency: 'monthly', enabled: true },
    { id: 'fam-support',   categoryId: 'family',        label: 'תמיכה בילדים / נכדים', amount: 0, frequency: 'monthly', enabled: true },
    { id: 'm-home',        categoryId: 'misc',          label: 'כלי בית וציוד',        amount: 0, frequency: 'annual',  enabled: true },
    { id: 'm-other',       categoryId: 'misc',          label: 'שונות',                amount: 0, frequency: 'monthly', enabled: true },
];


const toMonthly = (item) =>
    item.frequency === 'annual' ? (item.amount || 0) / 12 : (item.amount || 0);

function genId() {
    return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Single item row ──────────────────────────────────────────────────────────
function BudgetItemRow({ item, isHe, isLight, currency, t, onChange, onDelete }) {
    const [editingLabel, setEditingLabel] = useState(false);
    const [labelDraft, setLabelDraft] = useState(item.label);
    const [amountDraft, setAmountDraft] = useState(item.amount === 0 ? '' : String(item.amount));

    const commitLabel = () => {
        setEditingLabel(false);
        if (labelDraft.trim()) onChange({ ...item, label: labelDraft.trim() });
        else setLabelDraft(item.label);
    };

    const commitAmount = () => {
        const val = parseFloat(amountDraft) || 0;
        setAmountDraft(val === 0 ? '' : String(val));
        onChange({ ...item, amount: val });
    };

    const monthly = toMonthly({ ...item, amount: parseFloat(amountDraft) || 0 });
    const showMonthlyHint = item.frequency === 'annual' && (parseFloat(amountDraft) || 0) > 0;

    return (
        <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm ${item.enabled ? '' : 'opacity-40'} ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/10'}`}
            dir={isHe ? 'rtl' : 'ltr'}>

            {/* Enable toggle */}
            <input
                type="checkbox"
                checked={item.enabled}
                onChange={e => onChange({ ...item, enabled: e.target.checked })}
                className="accent-blue-500 shrink-0 cursor-pointer"
            />

            {/* Label */}
            {editingLabel ? (
                <input
                    autoFocus
                    value={labelDraft}
                    onChange={e => setLabelDraft(e.target.value)}
                    onBlur={commitLabel}
                    onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setEditingLabel(false); setLabelDraft(item.label); } }}
                    className={`flex-1 min-w-0 text-sm px-1 rounded border ${isLight ? 'border-blue-400 bg-white text-slate-800' : 'border-blue-500 bg-white/10 text-white'} outline-none`}
                />
            ) : (
                <span
                    className="flex-1 min-w-0 truncate cursor-pointer"
                    title={t('budgetClickToEdit')}
                    onClick={() => { setEditingLabel(true); setLabelDraft(item.label); }}
                >
                    {item.label}
                </span>
            )}

            {/* Amount + annual hint */}
            <div className="flex flex-col items-end shrink-0">
                <div className="flex items-center gap-1">
                    <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{currency}</span>
                    <input
                        type="number"
                        min="0"
                        value={amountDraft}
                        placeholder="0"
                        onChange={e => setAmountDraft(e.target.value)}
                        onBlur={commitAmount}
                        onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
                        className={`w-24 text-sm text-end px-1.5 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                    />
                </div>
                {showMonthlyHint && (
                    <span className={`text-xs mt-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                        ≈ {currency}{Math.round(monthly)}/{t('budgetMonthly')}
                    </span>
                )}
            </div>

            {/* Frequency toggle */}
            <div className={`flex rounded text-xs shrink-0 border ${isLight ? 'border-slate-200' : 'border-white/20'}`}>
                <button
                    onClick={() => onChange({ ...item, frequency: 'monthly' })}
                    className={`px-1.5 py-0.5 rounded-s transition-colors ${item.frequency === 'monthly'
                        ? 'bg-blue-600 text-white'
                        : (isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-gray-400 hover:bg-white/10')}`}
                >
                    {t('budgetMonthly')}
                </button>
                <button
                    onClick={() => onChange({ ...item, frequency: 'annual' })}
                    className={`px-1.5 py-0.5 rounded-e transition-colors ${item.frequency === 'annual'
                        ? 'bg-blue-600 text-white'
                        : (isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-gray-400 hover:bg-white/10')}`}
                >
                    {t('budgetAnnual')}
                </button>
            </div>

            {/* Delete */}
            <button
                onClick={onDelete}
                className={`shrink-0 p-0.5 rounded transition-colors ${isLight ? 'text-slate-300 hover:text-red-500 hover:bg-red-50' : 'text-gray-600 hover:text-red-400 hover:bg-red-900/20'}`}
            >
                <Trash2 size={13} />
            </button>
        </div>
    );
}

// ─── Category accordion ───────────────────────────────────────────────────────
function CategorySection({ category, items, isHe, isLight, currency, t, open, onToggle, onChangeItem, onDeleteItem, onAddItem }) {
    const label = isHe ? category.labelHe : category.labelEn;
    const categoryTotal = items.filter(i => i.enabled).reduce((s, i) => s + toMonthly(i), 0);

    return (
        <div className={`rounded-xl border ${isLight ? 'border-slate-200 bg-white' : 'border-white/20 bg-white/10'}`}>
            <button
                onClick={onToggle}
                className={`sticky top-0 z-10 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors backdrop-blur-md ${isLight ? 'bg-white hover:bg-slate-50' : 'bg-white/10 hover:bg-white/15'}`}
                dir={isHe ? 'rtl' : 'ltr'}
            >
                <span className="text-base">{category.icon}</span>
                <span className="flex-1 text-start">{label}</span>
                {categoryTotal > 0 && (
                    <span className={`text-sm font-semibold ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                        {currency}{Math.round(categoryTotal).toLocaleString()}
                    </span>
                )}
                {open ? <ChevronUp size={14} className="shrink-0 opacity-50" /> : <ChevronDown size={14} className="shrink-0 opacity-50" />}
            </button>

            {open && (
                <div className="px-2 pb-2 space-y-0.5">
                    {items.map(item => (
                        <BudgetItemRow
                            key={item.id}
                            item={item}
                            isHe={isHe}
                            isLight={isLight}
                            currency={currency}
                            t={t}
                            onChange={onChangeItem}
                            onDelete={() => onDeleteItem(item.id)}
                        />
                    ))}
                    <button
                        onClick={onAddItem}
                        className={`flex items-center gap-1.5 mt-1 px-2 py-1 text-xs rounded-lg transition-colors ${isLight ? 'text-blue-600 hover:bg-blue-50' : 'text-blue-400 hover:bg-blue-900/20'}`}
                        dir={isHe ? 'rtl' : 'ltr'}
                    >
                        <Plus size={12} />
                        {t('budgetAddItem')}
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
// Budget is stored globally in Firestore per user — not per-profile.
// setInputs is only called when the user explicitly clicks "adopt as income target".
export default function BudgetPlanner({ inputs, setInputs, t, language, isLight, aiProvider, aiModel, apiKeyOverride }) {
    const isHe = language === 'he';
    const currency = isHe ? '₪' : '$';
    const target = parseFloat(inputs.monthlyNetIncomeDesired) || 0;
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;

    const [items, setItems] = useState(DEFAULT_ITEMS);
    const [loaded, setLoaded] = useState(false);
    const saveTimerRef = useRef(null);
    const [openCategoryId, setOpenCategoryId] = useState(null);
    const [aiInsight, setAiInsight] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const aiSnapshotRef = useRef(null); // fingerprint of data when insight was last generated

    // Load from Firestore on mount
    useEffect(() => {
        if (!uid) return;
        getBudgetItems(uid).then(saved => {
            if (saved && Array.isArray(saved)) setItems(saved);
            setLoaded(true);
        }).catch(() => setLoaded(true));
    }, [uid]);

    // Debounced save to Firestore whenever items change (after initial load)
    useEffect(() => {
        if (!uid || !loaded) return;
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            setBudgetItems(uid, items).catch(err => console.error('[Budget save]', err));
        }, SAVE_DEBOUNCE_MS);
        return () => clearTimeout(saveTimerRef.current);
    }, [uid, items, loaded]);

    // Keep sessionStorage in sync so AI chat and AI insights can read the budget
    useEffect(() => {
        if (!loaded) return;
        try {
            const monthly = items.filter(i => i.enabled).reduce((s, i) => s + toMonthly(i), 0);
            const categories = CATEGORIES.map(cat => {
                const catItems = items.filter(i => i.categoryId === cat.id && i.enabled && i.amount > 0);
                if (!catItems.length) return null;
                return {
                    labelHe: cat.labelHe,
                    labelEn: cat.labelEn,
                    total: Math.round(catItems.reduce((s, i) => s + toMonthly(i), 0)),
                };
            }).filter(Boolean);
            sessionStorage.setItem('rc-budget-summary', JSON.stringify({
                totalMonthly: Math.round(monthly),
                totalAnnual: Math.round(monthly * 12),
                gap: Math.round((parseFloat(inputs.monthlyNetIncomeDesired) || 0) - monthly),
                categories,
            }));
        } catch {}
    }, [items, loaded, inputs.monthlyNetIncomeDesired]);

    // totalMonthly must be declared before any callbacks that reference it
    const totalMonthly = items.filter(i => i.enabled).reduce((s, i) => s + toMonthly(i), 0);

    const allCategoryIds = CATEGORIES.map(c => c.id);
    const customCategoryIds = [...new Set(
        items.filter(i => !allCategoryIds.includes(i.categoryId)).map(i => i.categoryId)
    )];
    const visibleCategories = [
        ...CATEGORIES,
        ...customCategoryIds.map(id => ({ id, icon: '📋', labelHe: id, labelEn: id })),
    ];

    const updateItems = useCallback((updater) => {
        setItems(prev => typeof updater === 'function' ? updater(prev) : updater);
    }, []);

    const handleChangeItem = useCallback((updated) => {
        updateItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    }, [updateItems]);

    const handleDeleteItem = useCallback((id) => {
        updateItems(prev => prev.filter(i => i.id !== id));
    }, [updateItems]);

    const handleAddItem = useCallback((categoryId) => {
        const newItem = { id: genId(), categoryId, label: t('budgetNewItem'), amount: 0, frequency: 'monthly', enabled: true };
        updateItems(prev => [...prev, newItem]);
    }, [updateItems, t]);

    const handleAddCategory = useCallback(() => {
        const name = prompt(t('budgetCategoryName'));
        if (!name?.trim()) return;
        const catId = name.trim().toLowerCase().replace(/\s+/g, '-');
        const newItem = { id: genId(), categoryId: catId, label: t('budgetNewItem'), amount: 0, frequency: 'monthly', enabled: true };
        updateItems(prev => [...prev, newItem]);
    }, [updateItems, t]);

    const handleAdoptAsTarget = useCallback(() => {
        setInputs(prev => ({ ...prev, monthlyNetIncomeDesired: Math.round(totalMonthly) }));
    }, [setInputs, totalMonthly]);

    const handleReset = useCallback(() => {
        if (window.confirm(t('budgetResetConfirm'))) {
            updateItems(DEFAULT_ITEMS);
            setAiInsight(null);
        }
    }, [updateItems, isHe]);

    const handleAiInsight = useCallback(async () => {
        if (!aiProvider || !aiModel) return;

        // Fingerprint: enabled items with non-zero amounts + target
        const snapshot = JSON.stringify({
            target,
            items: items
                .filter(i => i.enabled && i.amount > 0)
                .map(i => ({ id: i.id, amount: i.amount, frequency: i.frequency }))
                .sort((a, b) => a.id.localeCompare(b.id)),
        });
        if (aiSnapshotRef.current === snapshot && aiInsight) return; // data unchanged — reuse

        setAiLoading(true);
        setAiError(null);
        setAiInsight(null);
        try {
            const cur = isHe ? '₪' : '$';
            const catLabels = Object.fromEntries(CATEGORIES.map(c => [c.id, isHe ? c.labelHe : c.labelEn]));
            const lines = CATEGORIES.map(cat => {
                const catItems = items.filter(i => i.categoryId === cat.id && i.enabled && i.amount > 0);
                if (!catItems.length) return null;
                const catTotal = catItems.reduce((s, i) => s + toMonthly(i), 0);
                const itemLines = catItems.map(i => `  - ${i.label}: ${cur}${Math.round(toMonthly(i))}/mo`).join('\n');
                return `${catLabels[cat.id] || cat.id} (${cur}${Math.round(catTotal)}/mo):\n${itemLines}`;
            }).filter(Boolean).join('\n');

            const systemPrompt = isHe
                ? 'אתה יועץ פיננסי. נתח את תקציב ההוצאות החודשי של המשתמש בצורה תמציתית (עד 200 מילה). ציין דפוסים, הוצאות גבוהות, חוסרים אפשריים, ומה ניתן לייעל. דבר ישירות ובעברית.'
                : 'You are a financial advisor. Analyze the monthly budget concisely (under 200 words). Note spending patterns, high categories, possible gaps, and optimization opportunities. Be direct and specific.';

            const userMsg = isHe
                ? `יעד הכנסה חודשית: ${cur}${Math.round(target)}\nסה"כ הוצאות: ${cur}${Math.round(totalMonthly)}\nפער: ${cur}${Math.round(target - totalMonthly)}\n\nפירוט:\n${lines || 'אין הוצאות מוזנות'}`
                : `Monthly income target: ${cur}${Math.round(target)}\nTotal expenses: ${cur}${Math.round(totalMonthly)}\nGap: ${cur}${Math.round(target - totalMonthly)}\n\nBreakdown:\n${lines || 'No expenses entered'}`;

            const reply = await getChatResponse(
                [{ role: 'user', content: userMsg }],
                systemPrompt,
                aiProvider, aiModel, apiKeyOverride
            );
            aiSnapshotRef.current = snapshot;
            setAiInsight(reply);
        } catch (err) {
            if (err.name !== 'AbortError') setAiError(err.message || 'Error');
        } finally {
            setAiLoading(false);
        }
    }, [aiProvider, aiModel, apiKeyOverride, items, target, totalMonthly, isHe, aiInsight]);

    const pct = target > 0 ? Math.min(totalMonthly / target, 1.5) : 0;
    const gap = target - totalMonthly;
    const statusColor = pct > 1 ? 'text-red-500' : pct > 0.9 ? 'text-amber-500' : 'text-emerald-500';
    const barColor   = pct > 1 ? 'bg-red-500'   : pct > 0.9 ? 'bg-amber-500'   : 'bg-emerald-500';

    return (
        <div className="space-y-3" dir={isHe ? 'rtl' : 'ltr'}>

            {/* ── Summary banner — sticky ── */}
            <div className={`sticky top-0 z-20 rounded-xl p-3 border backdrop-blur-md ${isLight ? 'bg-white border-slate-200' : 'bg-white/10 border-white/20'}`}>
                <div className="flex items-end justify-between mb-2 gap-4">
                    <div>
                        <div className={`text-xs mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetIncomeTarget')}
                        </div>
                        <div className={`text-lg font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                            {currency}{target.toLocaleString()}
                        </div>
                    </div>
                    <div className="text-end">
                        <div className={`text-xs mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetTotalExpenses')}
                        </div>
                        <div className={`text-lg font-semibold ${statusColor}`}>
                            {currency}{Math.round(totalMonthly).toLocaleString()}
                        </div>
                        <div className={`text-xs mt-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                            {currency}{Math.round(totalMonthly * 12).toLocaleString()} {isHe ? '/ שנה' : '/ yr'}
                        </div>
                    </div>
                    <div className="text-end">
                        <div className={`text-xs mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetGap')}
                        </div>
                        <div className={`text-lg font-semibold ${gap >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {gap >= 0 ? '+' : ''}{currency}{Math.round(gap).toLocaleString()}
                        </div>
                    </div>
                </div>
                <div className={`h-2 rounded-full overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-white/10'}`}>
                    <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                </div>
                {target > 0 && (
                    <div className={`text-xs mt-1 text-end ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                        {Math.round(pct * 100)}% {t('budgetOfTarget')}
                    </div>
                )}
            </div>

            {/* ── Categories ── */}
            {visibleCategories.map(cat => {
                const catItems = items.filter(i => i.categoryId === cat.id);
                if (catItems.length === 0 && !CATEGORIES.find(c => c.id === cat.id)) return null;
                return (
                    <CategorySection
                        key={cat.id}
                        category={cat}
                        items={catItems}
                        isHe={isHe}
                        isLight={isLight}
                        currency={currency}
                        t={t}
                        open={openCategoryId === cat.id}
                        onToggle={() => setOpenCategoryId(prev => prev === cat.id ? null : cat.id)}
                        onChangeItem={handleChangeItem}
                        onDeleteItem={handleDeleteItem}
                        onAddItem={() => handleAddItem(cat.id)}
                    />
                );
            })}

            {/* ── Bottom actions — Reset pinned to left, rest on right ── */}
            <div className="flex items-center justify-between gap-2 pt-1" dir="ltr">
                <button
                    onClick={handleReset}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${isLight ? 'border-slate-200 text-slate-500 hover:bg-slate-50' : 'border-white/20 text-gray-400 hover:bg-white/10'}`}
                >
                    <RotateCcw size={13} />
                    {t('budgetReset')}
                </button>
                <div className="flex items-center gap-2 flex-wrap justify-end" dir={isHe ? 'rtl' : 'ltr'}>
                    <button
                        onClick={handleAddCategory}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-white/20 text-gray-400 hover:bg-white/10'}`}
                    >
                        <Plus size={13} />
                        {t('budgetAddCategory')}
                    </button>
                    <button
                        onClick={handleAdoptAsTarget}
                        disabled={totalMonthly === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Target size={13} />
                        {t('budgetAdoptTarget')}
                    </button>
                    {aiProvider && aiModel && (
                        <button
                            onClick={handleAiInsight}
                            disabled={aiLoading || totalMonthly === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <BrainCircuit size={13} />}
                            {isHe ? 'תובנות AI' : 'AI Insights'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── AI Insight panel ── */}
            {(aiInsight || aiError) && (
                <div className={`rounded-xl p-3 border text-sm ${aiError
                    ? (isLight ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-900/20 border-red-500/30 text-red-300')
                    : (isLight ? 'bg-purple-50 border-purple-200 text-slate-700' : 'bg-purple-900/20 border-purple-500/30 text-gray-200')
                }`} dir={isHe ? 'rtl' : 'ltr'}>
                    <div className="flex items-center justify-between mb-2 gap-2">
                        <div className="flex items-center gap-1.5 font-medium text-xs">
                            <BrainCircuit size={13} className={aiError ? 'text-red-500' : 'text-purple-400'} />
                            {isHe ? 'תובנות AI על התקציב' : 'AI Budget Insights'}
                        </div>
                        <button onClick={() => { setAiInsight(null); setAiError(null); aiSnapshotRef.current = null; }}
                            className="opacity-50 hover:opacity-100 text-xs leading-none">✕</button>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{aiError || aiInsight}</p>
                </div>
            )}
        </div>
    );
}
