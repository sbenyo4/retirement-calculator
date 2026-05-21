import { useState, useEffect, useRef } from 'react';
import { ToggleLeft, ToggleRight, Trash2, MessageSquare, Bell, Save, TrendingUp, Lock, Unlock, RefreshCw } from 'lucide-react';
import { silenceReminder, nextOccurrenceOf, nextOccurrenceByInterval } from '../../hooks/useReminders';
import { toMonthly, withReminderPausedState, effectiveIsFixed } from './budgetUtils';

export function BudgetItemRow({ item, isHe, isLight, currency, t, onChange, onDelete, onToggleEnabled, projFactor, showInflation, extraActionButton: _extraActionButton, labelAdornment, currentAge, retirementEndAge }) {
    const [editingLabel, setEditingLabel] = useState(false);
    const [labelDraft, setLabelDraft] = useState(item.label);
    const [amountDraft, setAmountDraft] = useState(item.amount === 0 ? '' : String(item.amount));
    const amountFocusedRef = useRef(false);
    useEffect(() => {
        if (!amountFocusedRef.current) {
            setAmountDraft(item.amount === 0 ? '' : String(item.amount));
        }
    }, [item.amount]);
    const [showNote, setShowNote] = useState(false);
    const [noteDraft, setNoteDraft] = useState(item.note || '');
    const [showReminder, setShowReminder] = useState(false);
    const [reminderDate, setReminderDate] = useState(item.reminder?.date || '');
    const [reminderText, setReminderText] = useState(item.reminder?.text || '');
    const [reminderType, setReminderType] = useState(() => item.reminder?.recurring ? (item.reminder?.recurringType || 'monthly') : 'none');
    const [reminderDay, setReminderDay] = useState(item.reminder?.recurringDay || 10);
    const [reminderInterval, setReminderInterval] = useState(item.reminder?.recurringInterval || 7);

    const [showContinuous, setShowContinuous] = useState(false);
    const [continuousDraft, setContinuousDraft] = useState({
        isContinuous: !!item.isContinuous,
        endYear: item.endYear || '',
        growthType: item.growthType || 'fixed',
        growthValue: item.growthValue || ''
    });
    const continuousDirty = continuousDraft.isContinuous !== !!item.isContinuous ||
        continuousDraft.endYear !== (item.endYear || '') ||
        continuousDraft.growthType !== (item.growthType || 'fixed') ||
        continuousDraft.growthValue !== (item.growthValue || '');

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

    const commitNote = () => {
        const trimmed = noteDraft.trim();
        if (trimmed !== (item.note || '').trim()) onChange({ ...item, note: trimmed || undefined });
    };
    const noteDirty = noteDraft.trim() !== (item.note || '').trim();

    return (
        <div id={`budget-item-${item.id}`} className={`relative flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm ${item.enabled !== false ? '' : 'opacity-40'} ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/10'}`}
            dir={isHe ? 'rtl' : 'ltr'}>

            {/* Enable toggle */}
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
            {item.isContinuous && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded border leading-none shrink-0 cursor-default ${isLight ? 'bg-purple-50 border-purple-200 text-purple-600' : 'bg-purple-500/20 border-purple-500/30 text-purple-300'}`}
                      title={isHe ? 'פריט מתמשך עם הגדרות גידול' : 'Continuous item with growth settings'}>
                    {(() => {
                        const parts = [];
                        if (item.growthType === 'fixed') parts.push(`+${currency}${item.growthValue || 0}`);
                        else if (item.growthType === 'percent') parts.push(`+${item.growthValue || 0}%`);
                        else if (item.growthType === 'categoryPercent') parts.push(`+${item.growthValue || 0}% ${isHe ? 'מקטגוריה' : 'cat'}`);
                        if (item.endYear) parts.push(`${isHe ? 'עד (כולל)' : 'till (incl)'} ${item.endYear}`);
                        return parts.join(' | ') || (isHe ? 'מתמשך' : 'Continuous');
                    })()}
                </span>
            )}
            {labelAdornment}

            {/* Amount + annual hint + inflation projection */}
            <div className="flex items-center gap-1 shrink-0" dir="ltr">
                <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{currency}</span>
                <input
                    type="number"
                    min="0"
                    value={amountDraft}
                    placeholder="0"
                    onChange={e => setAmountDraft(e.target.value)}
                    onFocus={() => { amountFocusedRef.current = true; }}
                    onBlur={() => { amountFocusedRef.current = false; commitAmount(); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
                    className={`w-24 text-sm text-end px-1.5 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                />
                {showInflation && monthly > 0 && (
                    <span className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                        → {Math.round(monthly * projFactor)}
                    </span>
                )}
                {showMonthlyHint && (
                    <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                        ≈{Math.round(monthly)}/{t('budgetMonthly')}
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

            {/* Reminder button */}
            <button
                onMouseDown={e => { e.preventDefault(); setShowReminder(v => !v); setShowNote(false); setShowContinuous(false); }}
                className={`shrink-0 p-0.5 rounded transition-colors ${showReminder
                    ? (isLight ? 'text-blue-600 bg-blue-100' : 'text-blue-400 bg-blue-500/20')
                    : item.reminder?.date
                        ? (isLight ? 'text-blue-500 hover:text-blue-600' : 'text-blue-400 hover:text-blue-300')
                        : (isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400')}`}
                title={isHe ? 'תזכורת' : 'Reminder'}
            >
                <Bell size={13} />
            </button>

            {/* Note button */}
            <button
                onMouseDown={e => { e.preventDefault(); setShowNote(v => !v); setShowReminder(false); setShowContinuous(false); }}
                className={`shrink-0 p-0.5 rounded transition-colors ${showNote
                    ? (isLight ? 'text-amber-600 bg-amber-100' : 'text-amber-400 bg-amber-500/20')
                    : item.note
                        ? (isLight ? 'text-amber-500 hover:text-amber-600' : 'text-amber-400 hover:text-amber-300')
                        : (isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400')}`}
                title={isHe ? 'הערה' : 'Note'}
            >
                <MessageSquare size={13} />
            </button>

            {/* Delete */}
            <button
                onClick={onDelete}
                className={`shrink-0 p-0.5 rounded transition-colors ${isLight ? 'text-slate-300 hover:text-red-500 hover:bg-red-50' : 'text-gray-600 hover:text-red-400 hover:bg-red-900/20'}`}
            >
                <Trash2 size={13} />
            </button>

            {/* Continuous Settings button */}
            <button
                onMouseDown={e => { e.preventDefault(); setShowContinuous(v => !v); setShowNote(false); setShowReminder(false); }}
                className={`shrink-0 p-0.5 rounded transition-colors ${showContinuous
                    ? (isLight ? 'text-purple-600 bg-purple-100' : 'text-purple-400 bg-purple-500/20')
                    : item.isContinuous
                        ? (isLight ? 'text-purple-500 hover:text-purple-600' : 'text-purple-400 hover:text-purple-300')
                        : (isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400')}`}
                title={isHe ? 'הגדרות מתמשכות (סיום/גידול)' : 'Continuous settings (end/growth)'}
            >
                <TrendingUp size={13} />
            </button>

            {/* Fixed/Variable toggle */}
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

            {/* Floating reminder panel */}
            {showReminder && (
                <div
                    className={`absolute z-[9999] top-full mt-1 w-52 rounded-lg border shadow-lg overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                    style={{ [isHe ? 'right' : 'left']: '4rem' }}
                    dir={isHe ? 'rtl' : 'ltr'}
                >
                    <div className={`flex items-center justify-between px-2.5 py-2 border-b ${isLight ? 'bg-blue-50 border-blue-100' : 'bg-blue-500/10 border-white/10'}`}>
                        <div className="flex items-center gap-1.5">
                            <Bell size={12} className={isLight ? 'text-blue-500' : 'text-blue-400'} />
                            <span className={`text-[11px] font-semibold ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>
                                {isHe ? `תזכורת — ${item.label}` : `Reminder — ${item.label}`}
                            </span>
                        </div>
                        {item.reminder?.date && (
                            <button
                                onMouseDown={e => { e.preventDefault(); onChange({ ...item, reminder: undefined }); setReminderDate(''); setReminderText(''); setReminderType('none'); setShowReminder(false); }}
                                className={`transition-colors ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}
                                title={isHe ? 'מחק תזכורת' : 'Delete reminder'}
                            ><Trash2 size={11} /></button>
                        )}
                    </div>
                    <div className="p-2.5 space-y-2">
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
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'כל ה-' : 'Day'}</span>
                                    <input type="number" min={1} max={28} value={reminderDay} onChange={e => setReminderDay(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
                                        className={`w-14 px-1.5 py-1 text-xs rounded border outline-none text-center ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/20 bg-white/10 text-gray-200'}`} />
                                    <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'לחודש' : 'of month'}</span>
                                </div>
                            ) : reminderType === 'interval' ? (
                                <div className="flex items-center gap-2 mt-1">
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
                                placeholder={isHe ? 'למשל: לבדוק מחיר...' : 'e.g. check price...'}
                                className={`mt-0.5 w-full text-xs px-2 py-1 rounded border outline-none ${isLight ? 'border-slate-200 bg-white text-slate-700 placeholder-slate-300' : 'border-white/20 bg-white/10 text-gray-200 placeholder-gray-600'}`}
                            />
                        </div>
                        <button
                            onMouseDown={e => {
                                e.preventDefault();
                                const computedDate = reminderType === 'monthly' ? nextOccurrenceOf(reminderDay) : reminderType === 'interval' ? nextOccurrenceByInterval(reminderInterval) : reminderDate;
                                if (!computedDate) return;
                                silenceReminder(item.id);
                                onChange({ ...item, reminder: {
                                    date: computedDate,
                                    text: reminderText.trim(),
                                    ...(reminderType !== 'none' ? { recurring: true, recurringType: reminderType, ...(reminderType === 'monthly' ? { recurringDay: reminderDay } : { recurringInterval: reminderInterval }) } : {}),
                                }});
                                setShowReminder(false);
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
            )}

            {/* Floating note panel */}
            {showNote && (
                <div
                    className={`absolute z-50 top-full mt-1 w-48 rounded-lg border shadow-lg border-s-4 border-s-amber-400 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-white/20'}`}
                    style={{ [isHe ? 'right' : 'left']: '2rem' }}
                    dir={isHe ? 'rtl' : 'ltr'}
                >
                    <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5">
                        <span className={`text-[10px] font-medium truncate ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {isHe ? `הערה ל${item.label}` : `Note: ${item.label}`}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0 ms-1">
                            <button
                                onMouseDown={e => {
                                    e.preventDefault();
                                    if (!noteDirty) return;
                                    commitNote();
                                    setShowNote(false);
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
                                    onMouseDown={e => { e.preventDefault(); setNoteDraft(''); onChange({ ...item, note: undefined }); setShowNote(false); }}
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
                        onBlur={() => { commitNote(); setShowNote(false); }}
                        onKeyDown={e => { if (e.key === 'Escape') { setNoteDraft(item.note || ''); setShowNote(false); } if (e.key === 'Enter' && e.ctrlKey) { commitNote(); setShowNote(false); } }}
                        placeholder={isHe ? 'הערה חופשית...' : 'Free note...'}
                        className={`w-full text-xs px-2 pb-2 resize-none outline-none leading-relaxed bg-transparent ${isLight ? 'text-slate-700 placeholder-slate-300' : 'text-gray-200 placeholder-gray-600'}`}
                    />
                </div>
            )}

            {/* Floating continuous panel */}
            {showContinuous && (
                <div
                    className={`absolute z-[9999] top-full mt-1 w-56 rounded-lg border shadow-lg overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                    style={{ [isHe ? 'right' : 'left']: '5rem' }}
                    dir={isHe ? 'rtl' : 'ltr'}
                >
                    <div className={`flex items-center justify-between px-2.5 py-2 border-b ${isLight ? 'bg-purple-50 border-purple-100' : 'bg-purple-500/10 border-white/10'}`}>
                        <div className="flex items-center gap-1.5">
                            <TrendingUp size={12} className={isLight ? 'text-purple-500' : 'text-purple-400'} />
                            <span className={`text-[11px] font-semibold ${isLight ? 'text-purple-700' : 'text-purple-300'}`}>
                                {isHe ? `מתמשך — ${item.label}` : `Continuous — ${item.label}`}
                            </span>
                        </div>
                        <label className="flex items-center gap-1 cursor-pointer">
                            <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'פעיל' : 'Active'}</span>
                            <input
                                type="checkbox"
                                checked={continuousDraft.isContinuous}
                                onChange={e => setContinuousDraft(d => ({ ...d, isContinuous: e.target.checked }))}
                                className={`rounded text-purple-500 focus:ring-purple-500 outline-none ${isLight ? 'border-slate-300' : 'border-white/20 bg-white/10'}`}
                            />
                        </label>
                    </div>
                    {continuousDraft.isContinuous && (
                        <div className="p-2.5 space-y-3">
                            <div>
                                <label className={`block text-[10px] font-medium mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'שנת סיום (אופציונלי, כולל)' : 'End Year (optional, inclusive)'}</label>
                                <input
                                    type="number"
                                    value={continuousDraft.endYear}
                                    onChange={e => setContinuousDraft(d => ({ ...d, endYear: e.target.value ? parseInt(e.target.value) || '' : '' }))}
                                    onKeyDown={e => {
                                        if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            setContinuousDraft(d => {
                                                const currentYear = new Date().getFullYear();
                                                const maxYear = currentYear + Math.max(1, Math.round(retirementEndAge - currentAge));
                                                let current = d.endYear ? parseInt(d.endYear) : currentYear;
                                                return { ...d, endYear: Math.min(maxYear, current + 1) };
                                            });
                                        } else if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            setContinuousDraft(d => {
                                                const currentYear = new Date().getFullYear();
                                                const minYear = currentYear + 1;
                                                let current = d.endYear ? parseInt(d.endYear) : minYear + 1;
                                                return { ...d, endYear: Math.max(minYear, current - 1) };
                                            });
                                        }
                                    }}
                                    placeholder={isHe ? 'למשל: 2035' : 'e.g. 2035'}
                                    className={`w-full text-xs px-2 py-1 rounded border outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isLight ? 'border-slate-200 bg-white text-slate-700 placeholder-slate-300' : 'border-white/20 bg-slate-800 text-gray-200 placeholder-gray-600'}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-[10px] font-medium mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'סוג גידול משנה לשנה' : 'Yearly Growth Type'}</label>
                                <select
                                    value={continuousDraft.growthType}
                                    onChange={e => setContinuousDraft(d => ({ ...d, growthType: e.target.value }))}
                                    className={`w-full text-xs px-2 py-1 rounded border outline-none ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/20 bg-slate-800 text-gray-200'}`}
                                >
                                    <option value="fixed" className={isLight ? 'bg-white' : 'bg-slate-800'}>{isHe ? 'סכום קבוע' : 'Fixed amount'}</option>
                                    <option value="percent" className={isLight ? 'bg-white' : 'bg-slate-800'}>{isHe ? 'אחוז קבוע' : 'Fixed percentage'}</option>
                                    <option value="categoryPercent" className={isLight ? 'bg-white' : 'bg-slate-800'}>{isHe ? 'אחוז מהקטגוריה' : 'Percentage of category'}</option>
                                </select>
                            </div>
                            <div>
                                <label className={`block text-[10px] font-medium mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'ערך גידול' : 'Growth Value'}</label>
                                <input
                                    type="number"
                                    value={continuousDraft.growthValue}
                                    onChange={e => setContinuousDraft(d => ({ ...d, growthValue: e.target.value ? parseFloat(e.target.value) || 0 : '' }))}
                                    placeholder={continuousDraft.growthType === 'fixed' ? '0.00' : '0%'}
                                    className={`w-full text-xs px-2 py-1 rounded border outline-none ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/20 bg-slate-800 text-gray-200'}`}
                                />
                            </div>
                        </div>
                    )}
                    <div className="p-2.5 pt-0 mt-2">
                        <button
                            onMouseDown={e => {
                                e.preventDefault();
                                onChange({ ...item,
                                    isContinuous: continuousDraft.isContinuous,
                                    endYear: continuousDraft.endYear || undefined,
                                    growthType: continuousDraft.growthType,
                                    growthValue: continuousDraft.growthValue !== '' ? continuousDraft.growthValue : undefined
                                });
                                setShowContinuous(false);
                            }}
                            disabled={!continuousDirty}
                            className={`w-full text-xs py-1.5 rounded font-medium transition-colors ${continuousDirty
                                ? (isLight ? 'bg-purple-500 text-white hover:bg-purple-600' : 'bg-purple-600 text-white hover:bg-purple-500')
                                : (isLight ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-gray-600 cursor-not-allowed')}`}
                        >
                            {isHe ? 'שמור שינויים' : 'Save changes'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
