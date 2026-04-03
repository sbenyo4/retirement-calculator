import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Target, RotateCcw, BrainCircuit, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getBudgetItems, setBudgetItems } from '../utils/db';
import { getChatResponse } from '../utils/ai-chat';
import { useDraggable } from '../hooks/useDraggable';

const SAVE_DEBOUNCE_MS = 1000;

// ─── AI insight renderer ──────────────────────────────────────────────────────
function renderInline(text, isLight) {
    // Parse **bold** spans
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
            return <strong key={i} className={isLight ? 'text-slate-900 font-semibold' : 'text-white font-semibold'}>{p.slice(2, -2)}</strong>;
        }
        return p;
    });
}

function InsightRenderer({ text, isLight }) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) { i++; continue; } // skip blank lines (handled via spacing)

        // Heading: starts with ## or ### or is ALL-CAPS short line or ends with :
        const isHeading = /^#{1,3}\s/.test(trimmed)
            || (/^[^•\-*]/.test(trimmed) && trimmed.endsWith(':') && trimmed.length < 60);
        if (isHeading) {
            const headText = trimmed.replace(/^#{1,3}\s*/, '').replace(/:$/, '');
            elements.push(
                <div key={i} className={`flex items-center gap-2 mt-4 mb-1.5 first:mt-0 pb-1 border-b ${isLight ? 'border-slate-100' : 'border-white/10'}`}>
                    <span className="w-1 h-4 rounded-full bg-purple-400 shrink-0" />
                    <span className={`text-xs font-bold uppercase tracking-wide ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                        {renderInline(headText, isLight)}
                    </span>
                </div>
            );
            i++; continue;
        }

        // Bullet: starts with -, •, *, or digit+.
        if (/^[-•*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
            const bulletText = trimmed.replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, '');
            elements.push(
                <div key={i} className="flex gap-2 items-start py-0.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                    <span className={`text-sm leading-relaxed ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                        {renderInline(bulletText, isLight)}
                    </span>
                </div>
            );
            i++; continue;
        }

        // Plain paragraph
        elements.push(
            <p key={i} className={`text-sm leading-relaxed mt-2 first:mt-0 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                {renderInline(trimmed, isLight)}
            </p>
        );
        i++;
    }
    return <div className="space-y-0.5">{elements}</div>;
}

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


const getNowYM = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };

const trackActive = (track) => {
    if (!track.endDate) return true;
    const [y, m] = track.endDate.split('-').map(Number);
    return y * 12 + (m - 1) >= getNowYM();
};

const toMonthly = (item) => {
    if (item.type === 'loan') {
        return (item.tracks || []).filter(trackActive).reduce((s, tr) => s + (tr.amount || 0), 0);
    }
    return item.frequency === 'annual' ? (item.amount || 0) / 12 : (item.amount || 0);
};

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

// ─── Loan / Mortgage item (multi-track) ──────────────────────────────────────
function LoanItemRow({ item, isHe, isLight, currency, t, onChange, onDelete }) {
    const [open, setOpen] = useState((item.tracks || []).length <= 1); // open by default when freshly created
    const [editingLabel, setEditingLabel] = useState(false);
    const [labelDraft, setLabelDraft] = useState(item.label);
    const [trackDrafts, setTrackDrafts] = useState(() =>
        Object.fromEntries((item.tracks || []).map(tr => [tr.id, { label: tr.label, amount: tr.amount === 0 ? '' : String(tr.amount) }]))
    );

    // Sync drafts when a new track is added externally
    useEffect(() => {
        setTrackDrafts(prev => {
            const next = { ...prev };
            (item.tracks || []).forEach(tr => {
                if (!next[tr.id]) next[tr.id] = { label: tr.label, amount: tr.amount === 0 ? '' : String(tr.amount) };
            });
            return next;
        });
    }, [item.tracks]);

    const monthsLeft = (endDate) => {
        if (!endDate) return null;
        const [y, m] = endDate.split('-').map(Number);
        return y * 12 + (m - 1) - getNowYM();
    };

    const activeMonthly = (item.tracks || []).filter(trackActive).reduce((s, tr) => s + (tr.amount || 0), 0);

    const updateTrack = (trackId, changes) =>
        onChange({ ...item, tracks: (item.tracks || []).map(tr => tr.id === trackId ? { ...tr, ...changes } : tr) });

    const deleteTrack = (trackId) =>
        onChange({ ...item, tracks: (item.tracks || []).filter(tr => tr.id !== trackId) });

    const addTrack = () => {
        const newTrack = { id: genId(), label: t('budgetTrack'), amount: 0, endDate: '' };
        setTrackDrafts(prev => ({ ...prev, [newTrack.id]: { label: newTrack.label, amount: '' } }));
        onChange({ ...item, tracks: [...(item.tracks || []), newTrack] });
    };

    const commitLabel = () => {
        setEditingLabel(false);
        if (labelDraft.trim()) onChange({ ...item, label: labelDraft.trim() });
        else setLabelDraft(item.label);
    };

    return (
        <div className={`rounded-lg border my-1 ${item.enabled ? '' : 'opacity-40'} ${isLight ? 'border-indigo-100 bg-indigo-50/40' : 'border-indigo-500/20 bg-indigo-900/10'}`}>
            {/* Header — click chevron area to toggle tracks */}
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm" dir={isHe ? 'rtl' : 'ltr'}>
                <input type="checkbox" checked={item.enabled}
                    onChange={e => onChange({ ...item, enabled: e.target.checked })}
                    className="accent-blue-500 shrink-0 cursor-pointer"
                />
                <span className="shrink-0">🏦</span>
                {editingLabel ? (
                    <input autoFocus value={labelDraft}
                        onChange={e => setLabelDraft(e.target.value)}
                        onBlur={commitLabel}
                        onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setEditingLabel(false); setLabelDraft(item.label); } }}
                        className={`flex-1 text-sm px-1 rounded border ${isLight ? 'border-blue-400 bg-white text-slate-800' : 'border-blue-500 bg-white/10 text-white'} outline-none`}
                    />
                ) : (
                    <span className="flex-1 font-medium cursor-pointer truncate" onClick={() => { setEditingLabel(true); setLabelDraft(item.label); }}>
                        {item.label}
                    </span>
                )}
                {activeMonthly > 0 && (
                    <span className={`text-sm font-semibold shrink-0 ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
                        {currency}{Math.round(activeMonthly).toLocaleString()}/{t('budgetMonthly')}
                    </span>
                )}
                <button onClick={() => setOpen(o => !o)}
                    className={`shrink-0 p-0.5 rounded transition-colors ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}>
                    {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button onClick={onDelete} className={`shrink-0 p-0.5 rounded ${isLight ? 'text-slate-300 hover:text-red-500 hover:bg-red-50' : 'text-gray-600 hover:text-red-400 hover:bg-red-900/20'}`}>
                    <Trash2 size={13} />
                </button>
            </div>

            {/* Tracks list — collapsible */}
            {open && <div className="px-2 pb-2 space-y-1">
                {(item.tracks || []).map(track => {
                    const active = trackActive(track);
                    const ml = monthsLeft(track.endDate);
                    const draft = trackDrafts[track.id] || { label: track.label, amount: String(track.amount || '') };
                    return (
                        <div key={track.id} dir={isHe ? 'rtl' : 'ltr'}
                            className={`flex flex-wrap items-center gap-1.5 text-xs px-1.5 py-1 rounded border ${
                                active
                                    ? (isLight ? 'border-slate-100 bg-white' : 'border-white/10 bg-white/5')
                                    : (isLight ? 'border-slate-100 bg-slate-50 opacity-50' : 'border-white/5 bg-white/5 opacity-50')
                            }`}>
                            {/* Track label */}
                            <input
                                value={draft.label}
                                onChange={e => setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], label: e.target.value } }))}
                                onBlur={() => { const l = (trackDrafts[track.id]?.label || '').trim(); if (l) updateTrack(track.id, { label: l }); }}
                                onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                                className={`w-20 px-1 py-0.5 rounded border text-xs ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                            />
                            {/* Monthly amount */}
                            <div className="flex items-center gap-0.5 shrink-0">
                                <span className={`${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{currency}</span>
                                <input type="number" min="0" value={draft.amount} placeholder="0"
                                    onChange={e => setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], amount: e.target.value } }))}
                                    onBlur={() => {
                                        const val = parseFloat(trackDrafts[track.id]?.amount) || 0;
                                        updateTrack(track.id, { amount: val });
                                        setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], amount: val === 0 ? '' : String(val) } }));
                                    }}
                                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                                    className={`w-20 text-end px-1 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                                />
                                <span className={`shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>/{t('budgetMonthly')}</span>
                            </div>
                            {/* End date */}
                            <div className="flex items-center gap-0.5 flex-1 min-w-0">
                                <span className={`shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{t('budgetEndDate')}:</span>
                                <input type="month" value={track.endDate || ''}
                                    onChange={e => updateTrack(track.id, { endDate: e.target.value })}
                                    className={`flex-1 min-w-0 px-1 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-600' : 'border-white/20 bg-white/10 text-gray-300'} outline-none focus:border-blue-400`}
                                />
                            </div>
                            {/* Status badge */}
                            {track.endDate && (
                                <span className={`shrink-0 px-1.5 py-0.5 rounded-full font-medium ${active
                                    ? 'bg-emerald-500/20 text-emerald-600'
                                    : 'bg-red-500/20 text-red-500'}`}>
                                    {active
                                        ? (ml !== null ? `${ml}m` : '∞')
                                        : t('budgetLoanDone')}
                                </span>
                            )}
                            <button onClick={() => deleteTrack(track.id)}
                                className={`shrink-0 p-0.5 rounded ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}>
                                <Trash2 size={11} />
                            </button>
                        </div>
                    );
                })}
                <button onClick={addTrack} dir={isHe ? 'rtl' : 'ltr'}
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${isLight ? 'text-indigo-600 hover:bg-indigo-50' : 'text-indigo-400 hover:bg-indigo-900/20'}`}>
                    <Plus size={11} />
                    {t('budgetAddTrack')}
                </button>
            </div>}
        </div>
    );
}

// ─── Category accordion ───────────────────────────────────────────────────────
function CategorySection({ category, items, isHe, isLight, currency, t, open, onToggle, onChangeItem, onDeleteItem, onAddItem, onAddLoanItem }) {
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
                    {items.map(item => item.type === 'loan' ? (
                        <LoanItemRow
                            key={item.id}
                            item={item}
                            isHe={isHe}
                            isLight={isLight}
                            currency={currency}
                            t={t}
                            onChange={onChangeItem}
                            onDelete={() => onDeleteItem(item.id)}
                        />
                    ) : (
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
                    <div className="flex items-center gap-2 mt-1 flex-wrap" dir={isHe ? 'rtl' : 'ltr'}>
                        <button
                            onClick={onAddItem}
                            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg transition-colors ${isLight ? 'text-blue-600 hover:bg-blue-50' : 'text-blue-400 hover:bg-blue-900/20'}`}
                        >
                            <Plus size={12} />
                            {t('budgetAddItem')}
                        </button>
                        <button
                            onClick={onAddLoanItem}
                            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg transition-colors ${isLight ? 'text-indigo-600 hover:bg-indigo-50' : 'text-indigo-400 hover:bg-indigo-900/20'}`}
                        >
                            <Plus size={12} />
                            {t('budgetAddLoan')}
                        </button>
                    </div>
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
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const aiSnapshotRef = useRef(null); // fingerprint of data when insight was last generated
    const aiInsightRef = useRef(null);  // cached insight text (survives modal close)
    const { dragStyle: aiDragStyle, onDragMouseDown: onAiDragMouseDown } = useDraggable(aiModalOpen);
    const [showFuture, setShowFuture] = useState(false);

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
                const catItems = items.filter(i => i.categoryId === cat.id && i.enabled && toMonthly(i) > 0);
                if (!catItems.length) return null;
                return {
                    labelHe: cat.labelHe,
                    labelEn: cat.labelEn,
                    total: Math.round(catItems.reduce((s, i) => s + toMonthly(i), 0)),
                };
            }).filter(Boolean);
            const loanTracks = items.filter(i => i.type === 'loan' && i.enabled)
                .flatMap(i => (i.tracks || []).filter(tr => tr.endDate && tr.amount > 0).map(tr => {
                    const [y, m] = tr.endDate.split('-').map(Number);
                    const ml = y * 12 + (m - 1) - getNowYM();
                    return { loan: i.label, track: tr.label, amount: tr.amount, endDate: tr.endDate, monthsLeft: ml, active: ml >= 0 };
                }));
            sessionStorage.setItem('rc-budget-summary', JSON.stringify({
                totalMonthly: Math.round(monthly),
                totalAnnual: Math.round(monthly * 12),
                gap: Math.round((parseFloat(inputs.monthlyNetIncomeDesired) || 0) - monthly),
                categories,
                loanTracks: loanTracks.length ? loanTracks : undefined,
            }));
        } catch {}
    }, [items, loaded, inputs.monthlyNetIncomeDesired]);

    // totalMonthly must be declared before any callbacks that reference it
    const totalMonthly = useMemo(
        () => items.filter(i => i.enabled).reduce((s, i) => s + toMonthly(i), 0),
        [items]
    );

    // Future milestones: points in time where loan tracks expire and expenses drop
    const futureMilestones = useMemo(() => {
        const expiring = items
            .filter(i => i.type === 'loan' && i.enabled)
            .flatMap(i => (i.tracks || [])
                .filter(tr => tr.endDate && tr.amount > 0 && trackActive(tr))
                .map(tr => ({ loanLabel: i.label, trackLabel: tr.label, amount: tr.amount, endDate: tr.endDate }))
            )
            .sort((a, b) => a.endDate.localeCompare(b.endDate));
        if (!expiring.length) return [];
        const byDate = expiring.reduce((acc, tr) => {
            if (!acc[tr.endDate]) acc[tr.endDate] = [];
            acc[tr.endDate].push(tr);
            return acc;
        }, {});
        const nowYM = getNowYM();
        let cumSaving = 0;
        return Object.entries(byDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, tracks]) => {
                const saving = tracks.reduce((s, tr) => s + tr.amount, 0);
                cumSaving += saving;
                const [y, m] = date.split('-').map(Number);
                const ml = y * 12 + (m - 1) - nowYM;
                return { date, tracks, saving, cumSaving, newTotal: totalMonthly - cumSaving, monthsLeft: ml };
            });
    }, [items, totalMonthly]);

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

    const handleAddLoanItem = useCallback((categoryId) => {
        const firstTrack = { id: genId(), label: t('budgetTrack'), amount: 0, endDate: '' };
        const newItem = { id: genId(), categoryId, label: t('budgetAddLoan'), type: 'loan', tracks: [firstTrack], enabled: true };
        updateItems(prev => [...prev, newItem]);
        setOpenCategoryId(categoryId);
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
            aiInsightRef.current = null;
            aiSnapshotRef.current = null;
        }
    }, [updateItems, t]);

    const handleAiInsight = useCallback(async () => {
        if (!aiProvider || !aiModel) return;

        // Fingerprint: enabled items with non-zero amounts + target
        const snapshot = JSON.stringify({
            target,
            items: items
                .filter(i => i.enabled && toMonthly(i) > 0)
                .map(i => i.type === 'loan'
                    ? { id: i.id, tracks: i.tracks }
                    : { id: i.id, amount: i.amount, frequency: i.frequency })
                .sort((a, b) => a.id.localeCompare(b.id)),
        });
        setAiModalOpen(true);
        if (aiSnapshotRef.current === snapshot && aiInsightRef.current) return; // data unchanged — reuse cached

        setAiLoading(true);
        setAiError(null);
        setAiInsight(null);
        aiInsightRef.current = null;
        try {
            const cur = isHe ? '₪' : '$';
            const catLabels = Object.fromEntries(CATEGORIES.map(c => [c.id, isHe ? c.labelHe : c.labelEn]));
            const lines = CATEGORIES.map(cat => {
                const catItems = items.filter(i => i.categoryId === cat.id && i.enabled);
                const activeItems = catItems.filter(i => {
                    if (i.type === 'loan') return (i.tracks || []).some(trackActive);
                    return i.amount > 0;
                });
                if (!activeItems.length) return null;
                const catTotal = activeItems.reduce((s, i) => s + toMonthly(i), 0);
                const itemLines = activeItems.map(i => {
                    if (i.type === 'loan') {
                        const allTracks = (i.tracks || []);
                        const trackLines = allTracks.map(tr => {
                            const active = trackActive(tr);
                            const ml = tr.endDate ? (() => { const [y, m] = tr.endDate.split('-').map(Number); return y * 12 + (m - 1) - getNowYM(); })() : null;
                            const status = !tr.endDate ? (isHe ? 'ללא תאריך סיום' : 'no end date')
                                : active ? (isHe ? `נגמר בעוד ${ml} חודשים (${tr.endDate})` : `ends in ${ml}mo (${tr.endDate})`)
                                : (isHe ? `הסתיים (${tr.endDate})` : `expired (${tr.endDate})`);
                            return `    · ${tr.label}: ${cur}${tr.amount}/mo — ${status}`;
                        }).join('\n');
                        return `  - ${i.label} (loan) ${cur}${Math.round(toMonthly(i))}/mo:\n${trackLines}`;
                    }
                    return `  - ${i.label}: ${cur}${Math.round(toMonthly(i))}/mo`;
                }).join('\n');
                return `${catLabels[cat.id] || cat.id} (${cur}${Math.round(catTotal)}/mo):\n${itemLines}`;
            }).filter(Boolean).join('\n');

            // Build a summary of future savings from expiring loan tracks
            const futureSavings = items.filter(i => i.type === 'loan' && i.enabled)
                .flatMap(i => (i.tracks || []).filter(tr => tr.endDate && trackActive(tr) && tr.amount > 0)
                    .map(tr => {
                        const [y, m] = tr.endDate.split('-').map(Number);
                        const ml = y * 12 + (m - 1) - getNowYM();
                        return isHe
                            ? `- "${tr.label}" של "${i.label}": ${cur}${tr.amount}/חודש יסתיים בעוד ${ml} חודשים (${tr.endDate})`
                            : `- "${tr.label}" of "${i.label}": ${cur}${tr.amount}/mo ends in ${ml} months (${tr.endDate})`;
                    })
                );

            const futureSavingsSection = futureSavings.length
                ? (isHe
                    ? `\nשינויים עתידיים בהוצאות (מסלולי הלוואה שייגמרו):\n${futureSavings.join('\n')}`
                    : `\nFuture expense reductions (loan tracks ending):\n${futureSavings.join('\n')}`)
                : '';

            const systemPrompt = isHe
                ? 'אתה יועץ פיננסי. נתח את תקציב ההוצאות החודשי של המשתמש בצורה תמציתית (עד 250 מילה). ציין דפוסים, הוצאות גבוהות, חוסרים אפשריים, ומה ניתן לייעל. אם יש הלוואות עם תאריכי סיום — ציין מתי ההוצאה תרד וב-כמה, ומה זה אומר מבחינת הפנסיה. דבר ישירות ובעברית.'
                : 'You are a financial advisor. Analyze the monthly budget concisely (under 250 words). Note spending patterns, high categories, possible gaps, and optimization opportunities. If there are loans with end dates, explicitly state when and by how much expenses will drop, and what that means for retirement cash flow. Be direct and specific.';

            const userMsg = isHe
                ? `יעד הכנסה חודשית: ${cur}${Math.round(target)}\nסה"כ הוצאות: ${cur}${Math.round(totalMonthly)}\nפער: ${cur}${Math.round(target - totalMonthly)}\n\nפירוט:\n${lines || 'אין הוצאות מוזנות'}${futureSavingsSection}`
                : `Monthly income target: ${cur}${Math.round(target)}\nTotal expenses: ${cur}${Math.round(totalMonthly)}\nGap: ${cur}${Math.round(target - totalMonthly)}\n\nBreakdown:\n${lines || 'No expenses entered'}${futureSavingsSection}`;

            const reply = await getChatResponse(
                [{ role: 'user', content: userMsg }],
                systemPrompt,
                aiProvider, aiModel, apiKeyOverride
            );
            aiSnapshotRef.current = snapshot;
            aiInsightRef.current = reply;
            setAiInsight(reply);
        } catch (err) {
            if (err.name !== 'AbortError') setAiError(err.message || 'Error');
        } finally {
            setAiLoading(false);
        }
    }, [aiProvider, aiModel, apiKeyOverride, items, target, totalMonthly, isHe]);

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

                {/* Future budget toggle — shown only when there are expiring loan tracks */}
                {futureMilestones.length > 0 && (
                    <button
                        onClick={() => setShowFuture(v => !v)}
                        className={`mt-2 w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${isLight ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'bg-indigo-900/20 text-indigo-300 hover:bg-indigo-900/30'}`}
                        dir={isHe ? 'rtl' : 'ltr'}
                    >
                        <span className="font-medium">
                            {isHe ? `תקציב עתידי — ${futureMilestones.length} שינויים צפויים` : `Future budget — ${futureMilestones.length} planned change${futureMilestones.length > 1 ? 's' : ''}`}
                        </span>
                        {showFuture ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                )}

                {/* Future milestones timeline */}
                {showFuture && futureMilestones.length > 0 && (
                    <div className="mt-2 space-y-2" dir={isHe ? 'rtl' : 'ltr'}>
                        {futureMilestones.map((ms, idx) => {
                            const futureGap = target - ms.newTotal;
                            const futurePct = target > 0 ? Math.min(ms.newTotal / target, 1.5) : 0;
                            const futureBarColor = futurePct > 1 ? 'bg-red-400' : futurePct > 0.9 ? 'bg-amber-400' : 'bg-emerald-400';
                            return (
                                <div key={idx} className={`rounded-lg p-2.5 border ${isLight ? 'border-indigo-100 bg-indigo-50/60' : 'border-indigo-500/20 bg-indigo-900/10'}`}>
                                    {/* Date + saving badge */}
                                    <div className="flex items-center justify-between mb-1.5 gap-2">
                                        <span className={`text-xs font-semibold ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
                                            {ms.date}
                                            <span className={`ms-1.5 font-normal ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                ({ms.monthsLeft}m)
                                            </span>
                                        </span>
                                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 font-medium">
                                            −{currency}{Math.round(ms.saving).toLocaleString()}/{isHe ? 'חודש' : 'mo'}
                                        </span>
                                    </div>
                                    {/* Expiring tracks */}
                                    <div className={`text-xs mb-2 space-y-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                        {ms.tracks.map((tr, ti) => (
                                            <div key={ti}>• {tr.loanLabel} — {tr.trackLabel}: {currency}{tr.amount}/{isHe ? 'חודש' : 'mo'}</div>
                                        ))}
                                    </div>
                                    {/* New totals */}
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className={isLight ? 'text-slate-500' : 'text-gray-400'}>{isHe ? 'הוצאה חודשית חדשה' : 'New monthly total'}</span>
                                        <div className="flex items-center gap-2">
                                            <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                                {currency}{Math.round(ms.newTotal).toLocaleString()}
                                            </span>
                                            {target > 0 && (
                                                <span className={`font-medium ${futureGap >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                                    ({futureGap >= 0 ? '+' : ''}{currency}{Math.round(futureGap).toLocaleString()})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {target > 0 && (
                                        <div className={`h-1.5 rounded-full overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-white/10'}`}>
                                            <div className={`h-full rounded-full ${futureBarColor}`} style={{ width: `${Math.min(futurePct * 100, 100)}%` }} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {/* Final state summary */}
                        {futureMilestones.length > 1 && (() => {
                            const last = futureMilestones[futureMilestones.length - 1];
                            return (
                                <div className={`text-xs text-center py-1 rounded-lg ${isLight ? 'text-emerald-700 bg-emerald-50' : 'text-emerald-400 bg-emerald-900/10'}`}>
                                    {isHe
                                        ? `לאחר כל השינויים: ${currency}${Math.round(last.newTotal).toLocaleString()}/חודש (חיסכון של ${currency}${Math.round(last.cumSaving).toLocaleString()} בחודש)`
                                        : `After all changes: ${currency}${Math.round(last.newTotal).toLocaleString()}/mo (saving ${currency}${Math.round(last.cumSaving).toLocaleString()}/mo)`}
                                </div>
                            );
                        })()}
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
                        onAddLoanItem={() => handleAddLoanItem(cat.id)}
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

            {/* ── AI Insight modal ── */}
            {aiModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-12 px-4 pointer-events-none">
                    <div className="absolute inset-0 pointer-events-auto" onClick={() => setAiModalOpen(false)} />
                    <div
                        className={`relative w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden pointer-events-auto ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                        style={aiDragStyle}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal header — draggable */}
                        <div
                            className={`flex items-center justify-between px-4 py-3 border-b cursor-grab active:cursor-grabbing select-none ${isLight ? 'border-slate-100' : 'border-white/10'}`}
                            onMouseDown={onAiDragMouseDown}
                        >
                            <div className="flex items-center gap-2">
                                <BrainCircuit size={15} className="text-purple-400" />
                                <span className={`font-semibold text-sm ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                    {isHe ? 'תובנות AI על התקציב' : 'AI Budget Insights'}
                                </span>
                            </div>
                            <button
                                onClick={() => setAiModalOpen(false)}
                                className={`text-lg leading-none opacity-40 hover:opacity-80 transition-opacity ${isLight ? 'text-slate-600' : 'text-gray-300'}`}
                            >✕</button>
                        </div>
                        {/* Modal body */}
                        <div className="px-4 py-4 max-h-[70vh] overflow-y-auto custom-scrollbar scrollbar-right" dir={isHe ? 'rtl' : 'ltr'}>
                            {aiLoading ? (
                                <div className={`flex items-center gap-2 text-sm ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                    <Loader2 size={15} className="animate-spin text-purple-400" />
                                    {isHe ? 'מנתח תקציב...' : 'Analyzing budget...'}
                                </div>
                            ) : aiError ? (
                                <p className="text-sm text-red-500">{aiError}</p>
                            ) : (
                                <InsightRenderer text={aiInsight} isLight={isLight} />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
