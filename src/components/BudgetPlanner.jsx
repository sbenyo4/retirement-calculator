import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Target, RotateCcw, BrainCircuit, Loader2, Search, X, History, Clock, ToggleLeft, ToggleRight } from 'lucide-react';
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

// ─── Backup display helper ────────────────────────────────────────────────────
const MAX_BACKUP_SLOTS = 3;

function backupAge(savedAt, isHe) {
    const mins = Math.round((Date.now() - savedAt) / 60000);
    if (mins < 1) return isHe ? 'עכשיו' : 'just now';
    if (mins < 60) return isHe ? `לפני ${mins} דק׳` : `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return isHe ? `לפני ${h} שע׳` : `${h}h ago`;
    return isHe ? `לפני ${Math.floor(h / 24)} ימים` : `${Math.floor(h / 24)}d ago`;
}

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
            <button
                onClick={() => onChange({ ...item, enabled: !item.enabled })}
                className="shrink-0 p-0.5"
                title={item.enabled ? (isHe ? 'השהה' : 'Pause') : (isHe ? 'הפעל' : 'Enable')}
            >
                {item.enabled
                    ? <ToggleRight size={18} className="text-blue-500" />
                    : <ToggleLeft size={18} className={isLight ? 'text-slate-400' : 'text-gray-400'} />}
            </button>

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
                <button
                    onClick={() => onChange({ ...item, enabled: !item.enabled })}
                    className="shrink-0 p-0.5"
                    title={item.enabled ? (isHe ? 'השהה' : 'Pause') : (isHe ? 'הפעל' : 'Enable')}
                >
                    {item.enabled
                        ? <ToggleRight size={18} className="text-blue-500" />
                        : <ToggleLeft size={18} className={isLight ? 'text-slate-400' : 'text-gray-400'} />}
                </button>
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
function CategorySection({ category, items, isHe, isLight, currency, t, open, onToggle, onChangeItem, onDeleteItem, onAddItem, onAddLoanItem, onToggleAll }) {
    const label = isHe ? category.labelHe : category.labelEn;
    const enabledItems = items.filter(i => i.enabled);
    const categoryTotal = enabledItems.reduce((s, i) => s + toMonthly(i), 0);
    const disabledCount = items.length - enabledItems.length;
    const allDisabled = items.length > 0 && enabledItems.length === 0;

    return (
        <div className={`rounded-xl border transition-opacity ${allDisabled ? 'opacity-50' : ''} ${isLight ? 'border-slate-200 bg-white' : 'border-white/20 bg-white/10'}`}>
            <div
                className={`sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium backdrop-blur-md ${isLight ? 'bg-white' : 'bg-white/10'}`}
                dir={isHe ? 'rtl' : 'ltr'}
            >
                <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-start">
                    <span className="text-base shrink-0">{category.icon}</span>
                    <span className="flex-1 min-w-0 truncate">{label}</span>
                </button>
                {disabledCount > 0 && (
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isLight ? 'bg-amber-100 text-amber-600' : 'bg-amber-500/20 text-amber-400'}`}>
                        {isHe ? `${disabledCount} מושהה` : `${disabledCount} paused`}
                    </span>
                )}
                {categoryTotal > 0 && (
                    <span className={`text-sm font-semibold shrink-0 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                        {currency}{Math.round(categoryTotal).toLocaleString()}
                    </span>
                )}
                <button
                    onClick={e => { e.stopPropagation(); onToggleAll(); }}
                    title={allDisabled ? (isHe ? 'הפעל הכל' : 'Enable all') : (isHe ? 'השהה הכל' : 'Pause all')}
                    className="shrink-0 p-0.5"
                >
                    {allDisabled
                        ? <ToggleLeft size={18} className={isLight ? 'text-slate-400' : 'text-gray-400'} />
                        : <ToggleRight size={18} className="text-blue-500" />}
                </button>
                <button onClick={onToggle} className="shrink-0 opacity-50">
                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
            </div>

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
export default function BudgetPlanner({ inputs, setInputs, results, t, language, isLight, aiProvider, aiModel, apiKeyOverride }) {
    const isHe = language === 'he';
    const currency = isHe ? '₪' : '$';
    // Use actual calculated net withdrawal if available (reflects withdrawal strategy), else use the manual input
    const target = Math.round(results?.initialNetWithdrawal ?? parseFloat(inputs.monthlyNetIncomeDesired) ?? 0);
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;

    const [items, setItems] = useState(DEFAULT_ITEMS);
    const [householdSize, setHouseholdSize] = useState(2);
    const [loaded, setLoaded] = useState(false);
    const saveAllowedRef = useRef(false); // only true after successful Firestore load
    const saveTimerRef = useRef(null);
    const confirmedRef = useRef(null);   // last successfully saved snapshot
    const latestStateRef = useRef({ items, householdSize }); // always-current ref for closures
    const backupSlotsRef = useRef([]);   // in-memory mirror of Firestore backupSlots
    const [backups, setBackups] = useState([]);
    const [showRestore, setShowRestore] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState(null); // { type: 'restore'|'reset', backup? }
    const [openCategoryId, setOpenCategoryId] = useState(null);
    const [aiInsight, setAiInsight] = useState(null);
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const aiSnapshotRef = useRef(null); // fingerprint of data when insight was last generated
    const aiInsightRef = useRef(null);  // cached insight text (survives modal close)
    const { dragStyle: aiDragStyle, onDragMouseDown: onAiDragMouseDown } = useDraggable(aiModalOpen);
    const [showFuture, setShowFuture] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Always-current ref so closures (setTimeout, beforeunload) always see latest state
    latestStateRef.current = { items, householdSize };

    const searchResults = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return null;
        return items.filter(item => {
            const hay = [
                item.label,
                ...(item.tracks || []).map(tr => tr.label),
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [searchQuery, items]);

    // Load from Firestore on mount
    useEffect(() => {
        if (!uid) return;
        getBudgetItems(uid).then(saved => {
            let loadedItems = null;
            let loadedHouseholdSize = 2;
            if (saved) {
                if (Array.isArray(saved)) { loadedItems = saved; } // legacy format
                else {
                    if (Array.isArray(saved.items)) loadedItems = saved.items;
                    if (saved.householdSize) loadedHouseholdSize = saved.householdSize;
                }
            }
            if (loadedItems) {
                setItems(loadedItems);
                setHouseholdSize(loadedHouseholdSize);
                confirmedRef.current = { items: loadedItems, householdSize: loadedHouseholdSize, savedAt: Date.now() };
                const slots = Array.isArray(saved?.backupSlots) ? saved.backupSlots : [];
                backupSlotsRef.current = slots;
                setBackups(slots);
            }
            saveAllowedRef.current = true;
            setLoaded(true);
        }).catch(err => {
            console.error('[Budget load error]', err);
            // Do NOT allow saves if load failed — prevents overwriting Firestore with DEFAULT_ITEMS
            setLoaded(true);
        });
    }, [uid]);

    // Debounced save to Firestore whenever items change (after initial load)
    useEffect(() => {
        if (!uid || !loaded || !saveAllowedRef.current) return;
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            const { items: latestItems, householdSize: latestHouseholdSize } = latestStateRef.current;
            // Build updated backup slots: push previous confirmed state (if has real data, not duplicate)
            const prev = confirmedRef.current;
            let newSlots = backupSlotsRef.current;
            if (prev?.items?.some(i => i.enabled && toMonthly(i) > 0)) {
                const isDup = newSlots[0] && JSON.stringify(newSlots[0].items) === JSON.stringify(prev.items);
                if (!isDup) {
                    newSlots = [
                        { items: prev.items, householdSize: prev.householdSize, totalMonthly: prev.items.filter(i => i.enabled).reduce((s, i) => s + toMonthly(i), 0), savedAt: prev.savedAt },
                        ...newSlots,
                    ].slice(0, MAX_BACKUP_SLOTS);
                }
            }
            const snap = { items: latestItems, householdSize: latestHouseholdSize, savedAt: Date.now() };
            setBudgetItems(uid, latestItems, latestHouseholdSize, newSlots)
                .then(() => {
                    confirmedRef.current = snap;
                    backupSlotsRef.current = newSlots;
                    setBackups(newSlots);
                })
                .catch(err => console.error('[Budget save]', err));
        }, SAVE_DEBOUNCE_MS);
        return () => clearTimeout(saveTimerRef.current);
    }, [uid, items, householdSize, loaded]);

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
                    items: catItems.map(i => ({ label: i.label, amount: Math.round(toMonthly(i)) })),
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
    const fullMonthly = useMemo(
        () => items.reduce((s, i) => s + toMonthly(i), 0),
        [items]
    );
    const pausedMonthly = fullMonthly - totalMonthly;

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
    const visibleCategories = useMemo(() => {
        const all = [
            ...CATEGORIES,
            ...customCategoryIds.map(id => ({ id, icon: '📋', labelHe: id, labelEn: id })),
        ];
        // Fully-disabled categories sink to the bottom; within each group sort by enabled monthly cost desc
        return all.sort((a, b) => {
            const catItemsA = items.filter(i => i.categoryId === a.id);
            const catItemsB = items.filter(i => i.categoryId === b.id);
            const allOffA = catItemsA.length > 0 && catItemsA.every(i => !i.enabled);
            const allOffB = catItemsB.length > 0 && catItemsB.every(i => !i.enabled);
            if (allOffA !== allOffB) return allOffA ? 1 : -1;
            const totalA = catItemsA.filter(i => i.enabled).reduce((s, i) => s + toMonthly(i), 0);
            const totalB = catItemsB.filter(i => i.enabled).reduce((s, i) => s + toMonthly(i), 0);
            return totalB - totalA;
        });
    }, [items, customCategoryIds]);

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

    const handleRestore = useCallback((backup) => {
        setPendingConfirm({ type: 'restore', backup });
    }, []);

    const handleConfirmAction = useCallback(() => {
        if (!pendingConfirm) return;
        if (pendingConfirm.type === 'restore') {
            const { backup } = pendingConfirm;
            if (Array.isArray(backup.items)) setItems(backup.items);
            if (backup.householdSize) setHouseholdSize(backup.householdSize);
            setShowRestore(false);
        } else if (pendingConfirm.type === 'reset') {
            updateItems(DEFAULT_ITEMS);
            setAiInsight(null);
            aiInsightRef.current = null;
            aiSnapshotRef.current = null;
        }
        setPendingConfirm(null);
    }, [pendingConfirm, updateItems]);

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

    const handleToggleCategoryItems = useCallback((categoryId) => {
        updateItems(prev => {
            const catItems = prev.filter(i => i.categoryId === categoryId);
            const allEnabled = catItems.every(i => i.enabled);
            // If all enabled → disable all; otherwise → enable all
            return prev.map(i => i.categoryId === categoryId ? { ...i, enabled: !allEnabled } : i);
        });
    }, [updateItems]);

    const handleReset = useCallback(() => {
        setPendingConfirm({ type: 'reset' });
    }, []);

    const handleAiInsight = useCallback(async () => {
        if (!aiProvider || !aiModel) return;

        // Fingerprint: enabled items with non-zero amounts + target + household
        const snapshot = JSON.stringify({
            target,
            householdSize,
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
            // Categories whose total scales with number of people
            const SCALABLE_CATS = new Set(['food', 'health', 'personal', 'family', 'entertainment']);
            const catLabels = Object.fromEntries(CATEGORIES.map(c => [c.id, isHe ? c.labelHe : c.labelEn]));

            const emptyCatNames = [];
            const lines = CATEGORIES.map(cat => {
                const catItems = items.filter(i => i.categoryId === cat.id && i.enabled);
                const activeItems = catItems.filter(i => {
                    if (i.type === 'loan') return (i.tracks || []).some(trackActive);
                    return i.amount > 0;
                });
                if (!activeItems.length) {
                    emptyCatNames.push(catLabels[cat.id] || cat.id);
                    return null;
                }
                const catTotal = activeItems.reduce((s, i) => s + toMonthly(i), 0);
                const catPerPerson = householdSize > 0 ? Math.round(catTotal / householdSize) : 0;
                const scaleTag = SCALABLE_CATS.has(cat.id)
                    ? (isHe ? ` | ${cur}${catPerPerson}/נפש [משתנה לפי נפשות]` : ` | ${cur}${catPerPerson}/person [scales with people]`)
                    : (isHe ? ` [קבועה — לא תלויה בנפשות]` : ` [fixed — doesn't scale]`);
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
                return `${catLabels[cat.id] || cat.id} (${cur}${Math.round(catTotal)}/mo${scaleTag}):\n${itemLines}`;
            }).filter(Boolean).join('\n');

            const missingSection = emptyCatNames.length
                ? (isHe
                    ? `\nקטגוריות ריקות (₪0 — ייתכן שחסרות הוצאות): ${emptyCatNames.join(', ')}`
                    : `\nEmpty categories (₪0 — possibly missing expenses): ${emptyCatNames.join(', ')}`)
                : '';

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

            const perPerson = householdSize > 0 ? Math.round(totalMonthly / householdSize) : 0;

            const systemPrompt = isHe
                ? `אתה יועץ פיננסי בכיר המתמחה בתכנון פרישה בישראל. נתח את תקציב ההוצאות החודשי. המשתמש הזין ${householdSize} נפש/ות. הוצאה לנפש: ${cur}${perPerson.toLocaleString()}/חודש.

**מבנה התשובה הנדרש (עד 350 מילה):**

⚠️ התראות לפי נפשות:
עבור כל קטגוריה המסומנת [משתנה לפי נפשות] — בדוק אם הסכום לנפש הגיוני. ציין במפורש: גבוה מדי / נמוך מדי / סביר, עם הסבר קצר. עבור קטגוריות [קבועות] — בדוק אם הסכום הכולל הגיוני ללא תלות בנפשות.

➕ הוצאות חסרות:
סקור את הקטגוריות הריקות שצוינו. ציין אילו מהן כנראה חסרות הוצאות אמיתיות (לפי גיל פרישה ומשפחה ישראלית), ואת ההוצאה הצפויה הממוצעת. גם הצע הוצאות שאינן ברשימה כלל אך חשובות לגיל זה.

📊 סיכום:
פער מהיעד ומה אפשר לייעל.`
                : `You are a senior financial advisor specializing in retirement planning. The user has ${householdSize} person${householdSize !== 1 ? 's' : ''} in the household. Per-person spending: ${cur}${perPerson.toLocaleString()}/mo.

**Required response structure (under 350 words):**

⚠️ Per-person anomalies:
For each category tagged [scales with people] — check if the per-person amount is reasonable. State explicitly: too high / too low / reasonable, with a brief reason. For [fixed] categories — check if the total amount makes sense regardless of household size.

➕ Missing expenses:
Review the empty categories listed. State which ones likely have real expenses missing (for a retired household), with expected typical amounts. Also suggest important expenses not in the list at all for this life stage.

📊 Summary:
Gap vs target and what can be optimized.`;

            const householdLine = isHe
                ? `נפשות בבית: ${householdSize} | הוצאה לנפש: ${cur}${perPerson.toLocaleString()}/חודש`
                : `Household: ${householdSize} person${householdSize !== 1 ? 's' : ''} | Per-person: ${cur}${perPerson.toLocaleString()}/mo`;
            const userMsg = isHe
                ? `${householdLine}\nיעד הכנסה חודשית: ${cur}${Math.round(target)}\nסה"כ הוצאות: ${cur}${Math.round(totalMonthly)}\nפער: ${cur}${Math.round(target - totalMonthly)}\n\nפירוט:\n${lines || 'אין הוצאות מוזנות'}${missingSection}${futureSavingsSection}`
                : `${householdLine}\nMonthly income target: ${cur}${Math.round(target)}\nTotal expenses: ${cur}${Math.round(totalMonthly)}\nGap: ${cur}${Math.round(target - totalMonthly)}\n\nBreakdown:\n${lines || 'No expenses entered'}${missingSection}${futureSavingsSection}`;

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
    const pctColor   = pct > 0.9 ? 'text-red-500' : pct > 0.8 ? 'text-amber-400' : 'text-emerald-500';

    return (
        <div className="space-y-3" dir={isHe ? 'rtl' : 'ltr'}>

            {/* ── Summary banner — sticky ── */}
            <div className={`sticky top-0 z-20 rounded-xl p-3 border backdrop-blur-md ${isLight ? 'bg-white border-slate-200' : 'bg-white/10 border-white/20'}`}>
                <div className="flex items-end justify-between mb-2 gap-4">
                    <div className="text-right">
                        <div className={`text-sm font-medium mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetIncomeTarget')}
                        </div>
                        <div className={`text-lg font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                            {currency}{target.toLocaleString()}
                        </div>
                        <div className={`text-xs mt-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                            {currency}{(target * 12).toLocaleString()} {isHe ? '/ שנה' : '/ yr'}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className={`text-sm font-medium mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetTotalExpenses')}
                        </div>
                        <div className="flex items-baseline justify-end gap-2" dir="ltr">
                            {pausedMonthly > 0 && (
                                <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                    (+{currency}{Math.round(pausedMonthly).toLocaleString()})
                                </span>
                            )}
                            <span className={`text-lg font-semibold ${statusColor}`}>
                                {currency}{Math.round(totalMonthly).toLocaleString()}
                            </span>
                        </div>
                        <div className={`text-xs mt-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                            {currency}{Math.round(totalMonthly * 12).toLocaleString()} {isHe ? '/ שנה' : '/ yr'}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className={`text-sm font-medium mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetGap')}
                        </div>
                        <div className={`text-lg font-semibold ${gap >= 0 ? 'text-emerald-500' : 'text-red-500'}`} dir="ltr">
                            {gap >= 0 ? '+' : ''}{currency}{Math.round(gap).toLocaleString()}
                        </div>
                        <div className={`text-xs mt-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                            {currency}{Math.round(Math.abs(gap * 12)).toLocaleString()}{gap >= 0 ? '+' : '-'} {isHe ? '/ שנה' : '/ yr'}
                        </div>
                    </div>
                </div>
                {/* Household size */}
                <div className={`flex items-center gap-2 mb-2 text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    <span>👥</span>
                    <span>{isHe ? 'נפשות בבית:' : 'Household size:'}</span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setHouseholdSize(s => Math.max(1, s - 1))}
                            className={`w-5 h-5 rounded flex items-center justify-center font-bold transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
                        >−</button>
                        <span className={`w-5 text-center font-semibold ${isLight ? 'text-slate-700' : 'text-white'}`}>{householdSize}</span>
                        <button
                            onClick={() => setHouseholdSize(s => Math.min(10, s + 1))}
                            className={`w-5 h-5 rounded flex items-center justify-center font-bold transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
                        >+</button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className={`flex-1 h-2 rounded-full overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-white/10'}`}>
                        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                    </div>
                    {target > 0 && (
                        <span className={`text-xs shrink-0 font-medium ${pctColor}`}>
                            {Math.round(pct * 100)}% {t('budgetOfTarget')}
                        </span>
                    )}
                </div>

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

            {/* ── Search ── */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-white/10 border-white/20'}`}>
                <Search size={13} className={isLight ? 'text-slate-400 shrink-0' : 'text-gray-500 shrink-0'} />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={isHe ? 'חפש פריט… (למשל: סיעוד, ביטוח)' : 'Search item… (e.g. insurance, mortgage)'}
                    className={`flex-1 bg-transparent text-xs outline-none placeholder:text-gray-400 ${isLight ? 'text-slate-800' : 'text-white'}`}
                    dir={isHe ? 'rtl' : 'ltr'}
                />
                {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className={isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}>
                        <X size={13} />
                    </button>
                )}
            </div>

            {/* ── Search results ── */}
            {searchResults && (
                <div className={`rounded-xl border ${isLight ? 'border-slate-200 bg-white' : 'border-white/20 bg-white/10'}`}>
                    <div className={`px-3 py-2 text-xs font-medium border-b ${isLight ? 'text-slate-500 border-slate-100' : 'text-gray-400 border-white/10'}`} dir={isHe ? 'rtl' : 'ltr'}>
                        {searchResults.length > 0
                            ? (isHe ? `${searchResults.length} תוצאות` : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`)
                            : (isHe ? 'אין תוצאות' : 'No results')}
                    </div>
                    {searchResults.map(item => {
                        const cat = visibleCategories.find(c => c.id === item.categoryId);
                        const monthly = toMonthly(item);
                        return (
                            <div key={item.id} className={`flex items-center gap-2 px-3 py-2 border-b last:border-0 text-sm ${item.enabled ? '' : 'opacity-40'} ${isLight ? 'border-slate-100' : 'border-white/5'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                <span className="text-base shrink-0">{cat?.icon ?? '📋'}</span>
                                <div className="flex-1 min-w-0">
                                    <div className={`font-medium truncate ${isLight ? 'text-slate-800' : 'text-white'}`}>{item.label}</div>
                                    <div className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? (cat?.labelHe ?? item.categoryId) : (cat?.labelEn ?? item.categoryId)}</div>
                                </div>
                                {monthly > 0 && (
                                    <span className={`text-xs font-semibold shrink-0 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                        {currency}{Math.round(monthly).toLocaleString()}/{isHe ? 'חודש' : 'mo'}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

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
                        onToggleAll={() => handleToggleCategoryItems(cat.id)}
                    />
                );
            })}

            {/* ── Restore panel ── */}
            {showRestore && (
                <div className={`rounded-xl border p-3 space-y-2 ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/20 border-amber-500/30'}`}>
                    <div className={`text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'text-amber-800' : 'text-amber-300'}`}>
                        <History size={13} />
                        {isHe ? 'שחזור מגיבוי' : 'Restore from backup'}
                    </div>
                    {backups.length === 0 ? (
                        <p className={`text-xs ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{isHe ? 'אין גיבויים זמינים' : 'No backups available'}</p>
                    ) : backups.map((bk, i) => (
                        <div key={i} className={`flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg ${isLight ? 'bg-white border border-amber-100' : 'bg-white/5 border border-white/10'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                                <Clock size={11} className={isLight ? 'text-amber-500 shrink-0' : 'text-amber-400 shrink-0'} />
                                <div>
                                    <div className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{backupAge(bk.savedAt, isHe)}</div>
                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {isHe ? `סה"כ ${currency}${Math.round(bk.totalMonthly).toLocaleString()}/חודש` : `Total ${currency}${Math.round(bk.totalMonthly).toLocaleString()}/mo`}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRestore(bk)}
                                className={`shrink-0 px-2 py-1 rounded text-[10px] font-bold transition-colors ${isLight ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-amber-500 text-white hover:bg-amber-400'}`}
                            >
                                {isHe ? 'שחזר' : 'Restore'}
                            </button>
                        </div>
                    ))}
                    <button onClick={() => setShowRestore(false)} className={`text-[10px] ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}>
                        {isHe ? 'סגור' : 'Close'}
                    </button>
                </div>
            )}

            {/* ── Inline confirmation banner ── */}
            {pendingConfirm && (
                <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/20 border-red-500/30'}`}>
                    <span className={`text-xs font-medium ${isLight ? 'text-red-800' : 'text-red-300'}`}>
                        {pendingConfirm.type === 'reset'
                            ? (isHe ? 'לאפס את כל הנתונים?' : 'Reset all budget data?')
                            : (isHe ? `לשחזר גיבוי מ-${backupAge(pendingConfirm.backup.savedAt, isHe)}?` : `Restore backup from ${backupAge(pendingConfirm.backup.savedAt, isHe)}?`)}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => setPendingConfirm(null)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${isLight ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-white/10 border border-white/20 text-gray-300 hover:bg-white/20'}`}
                        >
                            {isHe ? 'ביטול' : 'Cancel'}
                        </button>
                        <button
                            onClick={handleConfirmAction}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                            {isHe ? 'כן, המשך' : 'Yes, proceed'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Bottom actions — Reset pinned to left, rest on right ── */}
            <div className="flex items-center justify-between gap-2 pt-1" dir="ltr">
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={handleReset}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${isLight ? 'border-slate-200 text-slate-500 hover:bg-slate-50' : 'border-white/20 text-gray-400 hover:bg-white/10'}`}
                    >
                        <RotateCcw size={13} />
                        {t('budgetReset')}
                    </button>
                    <button
                        onClick={() => setShowRestore(v => !v)}
                        title={isHe ? 'שחזור מגיבוי' : 'Restore from backup'}
                        className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${showRestore ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500/50 bg-amber-900/20 text-amber-400') : (isLight ? 'border-slate-200 text-slate-400 hover:bg-slate-50' : 'border-white/20 text-gray-500 hover:bg-white/10')}`}
                    >
                        <History size={13} />
                    </button>
                </div>
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
