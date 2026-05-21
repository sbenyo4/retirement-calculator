import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, ToggleLeft, ToggleRight, Lock, Unlock } from 'lucide-react';
import { trackActive, toProjectedMonthly, withReminderPausedState, effectiveIsFixed, genId, getNowYM } from './budgetUtils';

export function LoanItemRow({ item, isHe, isLight, currency, t, onChange, onDelete, onToggleEnabled, projFactor, projYears, showInflation }) {
    const [open, setOpen] = useState((item.tracks || []).length <= 1);
    const [editingLabel, setEditingLabel] = useState(false);
    const [labelDraft, setLabelDraft] = useState(item.label);
    const [trackDrafts, setTrackDrafts] = useState(() =>
        Object.fromEntries((item.tracks || []).map(tr => [tr.id, { label: tr.label, amount: tr.amount === 0 ? '' : String(tr.amount) }]))
    );

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
        const newTrack = { id: genId(), label: t('budgetTrack'), amount: 0, endDate: '', inflationAffected: false };
        setTrackDrafts(prev => ({ ...prev, [newTrack.id]: { label: newTrack.label, amount: '' } }));
        onChange({ ...item, tracks: [...(item.tracks || []), newTrack] });
    };

    const commitLabel = () => {
        setEditingLabel(false);
        if (labelDraft.trim()) onChange({ ...item, label: labelDraft.trim() });
        else setLabelDraft(item.label);
    };

    return (
        <div id={`budget-item-${item.id}`} className={`rounded-lg border my-1 ${item.enabled !== false ? '' : 'opacity-40'} ${isLight ? 'border-indigo-100 bg-indigo-50/40' : 'border-indigo-500/20 bg-indigo-900/10'}`}>
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm" dir={isHe ? 'rtl' : 'ltr'}>
                <button
                    onClick={() => onToggleEnabled
                        ? onToggleEnabled(item.id, !(item.enabled !== false))
                        : onChange(withReminderPausedState(item, !(item.enabled !== false)))
                    }
                    className="shrink-0 p-0.5"
                    title={item.enabled !== false ? (isHe ? 'השהה' : 'Pause') : (isHe ? 'הפעל' : 'Enable')}
                >
                    {item.enabled !== false
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
                {showInflation && (() => {
                    const activeTracks = (item.tracks || []).filter(trackActive);
                    const linkedCount = activeTracks.filter(tr => tr.inflationAffected).length;
                    const allLinked = activeTracks.length > 0 && linkedCount === activeTracks.length;
                    const partial = linkedCount > 0 && linkedCount < activeTracks.length;
                    const label = allLinked ? (isHe ? 'צמוד' : 'CPI') : partial ? (isHe ? 'צמוד חלקי' : 'partial CPI') : (isHe ? 'קבוע' : 'fixed');
                    const colorClass = allLinked
                        ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500 bg-amber-900/20 text-amber-400')
                        : partial
                        ? (isLight ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-orange-400 bg-orange-900/20 text-orange-400')
                        : (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-white/20 bg-white/5 text-gray-500');
                    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${colorClass}`}>{label}</span>;
                })()}
                {activeMonthly > 0 && (
                    <span className="flex items-baseline gap-1 shrink-0" dir="ltr">
                        <span className={`text-sm font-semibold ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
                            {currency}{Math.round(activeMonthly).toLocaleString()}/{t('budgetMonthly')}
                        </span>
                        {showInflation && (() => {
                            const proj = toProjectedMonthly(item, projFactor, projYears);
                            return (
                                <span className={`text-xs font-normal ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {proj > 0 ? `${currency}${Math.round(proj).toLocaleString()}` : (isHe ? 'יסתיים' : 'ends')}
                                </span>
                            );
                        })()}
                    </span>
                )}
                <button onClick={() => setOpen(o => !o)}
                    className={`shrink-0 p-0.5 rounded transition-colors ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}>
                    {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button
                    onClick={() => onChange({ ...item, isFixed: !effectiveIsFixed(item) })}
                    className={`shrink-0 p-0.5 rounded transition-colors ${effectiveIsFixed(item)
                        ? (isLight ? 'text-orange-500 hover:text-orange-600' : 'text-orange-400 hover:text-orange-300')
                        : (isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400')}`}
                    title={effectiveIsFixed(item)
                        ? (isHe ? 'קבוע — לחץ לסמן כמשתנה' : 'Fixed — click to mark variable')
                        : (isHe ? 'משתנה — לחץ לסמן כקבוע' : 'Variable — click to mark fixed')}
                >
                    {effectiveIsFixed(item) ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                <button onClick={onDelete} className={`shrink-0 p-0.5 rounded ${isLight ? 'text-slate-300 hover:text-red-500 hover:bg-red-50' : 'text-gray-600 hover:text-red-400 hover:bg-red-900/20'}`}>
                    <Trash2 size={13} />
                </button>
            </div>

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
                            <input
                                value={draft.label}
                                onChange={e => setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], label: e.target.value } }))}
                                onBlur={() => { const l = (trackDrafts[track.id]?.label || '').trim(); if (l) updateTrack(track.id, { label: l }); }}
                                onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                                className={`w-20 px-1 py-0.5 rounded border text-xs ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                            />
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
                            <div className="flex items-center gap-0.5 flex-1 min-w-0">
                                <span className={`shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{t('budgetEndDate')}:</span>
                                <input type="month" value={track.endDate || ''}
                                    onChange={e => updateTrack(track.id, { endDate: e.target.value })}
                                    className={`flex-1 min-w-0 px-1 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-600' : 'border-white/20 bg-white/10 text-gray-300'} outline-none focus:border-blue-400`}
                                />
                            </div>
                            {track.endDate && (
                                <span className={`shrink-0 px-1.5 py-0.5 rounded-full font-medium ${active
                                    ? 'bg-emerald-500/20 text-emerald-600'
                                    : 'bg-red-500/20 text-red-500'}`}>
                                    {active
                                        ? (ml !== null ? `${ml}m` : '∞')
                                        : t('budgetLoanDone')}
                                </span>
                            )}
                            {showInflation && (
                                <button
                                    onClick={() => updateTrack(track.id, { inflationAffected: !track.inflationAffected })}
                                    className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 transition-colors ${track.inflationAffected
                                        ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500 bg-amber-900/20 text-amber-400')
                                        : (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-white/20 bg-white/5 text-gray-500')}`}
                                    title={isHe ? (track.inflationAffected ? 'צמוד מדד' : 'קבוע') : (track.inflationAffected ? 'CPI-linked' : 'Fixed rate')}
                                >
                                    {isHe ? (track.inflationAffected ? 'צמוד' : 'קבוע') : (track.inflationAffected ? 'CPI' : 'fixed')}
                                </button>
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
