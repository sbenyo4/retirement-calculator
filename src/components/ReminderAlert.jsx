import { useEffect, useState } from 'react';
import { Bell, CheckCircle, Clock, ArrowUpRight, MessageSquare, RefreshCw } from 'lucide-react';
import { createPortal } from 'react-dom';
import { markLoginReminderHandled, useReminders, advanceRecurringReminder } from '../hooks/useReminders';

const isLifeEventSource = (source) =>
    typeof source === 'string' && (source === 'lifeEvents' || source.startsWith('lifeEvents:'));

export function ReminderAlert({ language, isLight, sessionKey }) {
    const { alertDueNow, confirmReminder } = useReminders();
    const isHe = language === 'he';
    const [locallyClosedAlertIds, setLocallyClosedAlertIds] = useState(() => new Set());

    useEffect(() => {
        setLocallyClosedAlertIds(new Set());
    }, [sessionKey]);

    useEffect(() => {
        if (!alertDueNow.length) {
            setLocallyClosedAlertIds(new Set());
            return;
        }

        const dueIds = new Set(alertDueNow.map(r => `${r.source}-${r.id}`));
        setLocallyClosedAlertIds(prev => {
            if (!prev.size) return prev;
            let changed = false;
            const next = new Set();
            prev.forEach(id => {
                if (dueIds.has(id)) next.add(id);
                else changed = true;
            });
            return changed ? next : prev;
        });
    }, [alertDueNow]);

    const visibleAlerts = alertDueNow.filter(r => !locallyClosedAlertIds.has(`${r.source}-${r.id}`));
    if (!visibleAlerts.length) return null;

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return isHe ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
    }

    function sourceLabel(source) {
        if (source === 'general') return isHe ? 'כללי' : 'General';
        if (source === 'checklist') return isHe ? 'צ׳קליסט' : 'Checklist';
        if (source === 'budget') return isHe ? 'תקציב' : 'Budget';
        if (isLifeEventSource(source)) return isHe ? 'אירוע חיים' : 'Life Event';
        return source;
    }

    // Active card is always the first visible alert
    const active = visibleAlerts[0];
    const rest = visibleAlerts.slice(1);
    const globalId = `${active.source}-${active.id}`;

    // Stack peek cards: show up to 2 behind the active one
    const peekCards = rest.slice(0, 2);

    return createPortal(
        <div className="fixed inset-0 z-[999999] flex items-start justify-center pt-16 px-4 pointer-events-none">
            {/* Stack container — relative so peek cards can be absolutely positioned */}
            <div className="relative w-full max-w-sm pointer-events-auto">

                {/* Peek cards behind the active one (rendered first = bottom of stack) */}
                {peekCards.map((r, i) => (
                    <div
                        key={`${r.source}-${r.id}`}
                        className={`absolute inset-x-0 top-0 rounded-2xl border-2 overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                        style={{
                            transform: `translateY(${(i + 1) * 6}px) scale(${1 - (i + 1) * 0.03})`,
                            zIndex: -i - 1,
                            opacity: 1 - (i + 1) * 0.15,
                        }}
                    >
                        <div className="h-2 bg-gradient-to-r from-amber-400 to-orange-500 w-full" />
                        <div className="px-5 py-3 flex items-center gap-2">
                            <Bell size={14} className="text-amber-500 shrink-0" />
                            <span className={`text-sm font-semibold truncate ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                {r.label}
                            </span>
                        </div>
                    </div>
                ))}

                {/* Active (front) card */}
                <div
                    className={`relative rounded-2xl shadow-2xl border-2 overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                    dir={isHe ? 'rtl' : 'ltr'}
                    style={{ zIndex: 1 }}
                >
                    <div className="h-2 bg-gradient-to-r from-amber-400 to-orange-500 w-full" />

                    <div className="px-5 py-4">
                        {/* Counter badge */}
                        {rest.length > 0 && (
                            <div className={`flex items-center gap-1.5 text-xs font-semibold mb-3 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                <Bell size={12} className="animate-bounce" />
                                {isHe
                                    ? `תזכורת 1 מתוך ${visibleAlerts.length}`
                                    : `Reminder 1 of ${visibleAlerts.length}`}
                            </div>
                        )}

                        <div className="flex items-start gap-3 mb-4">
                            <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isLight ? 'bg-amber-100' : 'bg-amber-500/20'}`}>
                                <Bell size={18} className="text-amber-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <div className={`text-base font-bold leading-tight ${isLight ? 'text-slate-800' : 'text-white'}`}>
                                        {active.label}
                                    </div>
                                    {active.source !== 'general' && (
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                window.dispatchEvent(
                                                    new CustomEvent('rc-navigate-to-item', {
                                                        detail: { source: active.source, id: active.id }
                                                    })
                                                );
                                            }}
                                            className={`p-1.5 rounded-full transition-colors shrink-0 ${isLight ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'}`}
                                            title={isHe ? 'מעבר לפריט' : 'Go to item'}
                                        >
                                            <ArrowUpRight size={15} />
                                        </button>
                                    )}
                                </div>
                                {(active.note || active.text) && (
                                    <div className={`mt-2 rounded-lg text-sm border ${isLight ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>
                                        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 border-b text-xs font-semibold ${isLight ? 'border-amber-200 text-amber-600' : 'border-amber-500/20 text-amber-400'}`}>
                                            <MessageSquare size={11} />
                                            {isHe ? 'הערה' : 'Note'}
                                        </div>
                                        <div className="px-2.5 py-2 leading-snug">{active.note || active.text}</div>
                                    </div>
                                )}
                                <div className={`flex items-center gap-1.5 mt-2 text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                    <Clock size={11} />
                                    <span>{formatDate(active.date)}</span>
                                    <span className="opacity-30">·</span>
                                    <span className="uppercase text-[10px] tracking-widest">{sourceLabel(active.source)}</span>
                                    {active.recurring && (
                                        <>
                                            <span className="opacity-30">·</span>
                                            <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${isLight ? 'text-purple-500' : 'text-purple-400'}`}>
                                                <RefreshCw size={9} />
                                                {(active.recurringType || 'monthly') === 'interval'
                                                    ? (isHe ? `חוזרת כל ${active.recurringInterval} ימים` : `every ${active.recurringInterval} days`)
                                                    : (isHe ? `חוזרת כל ה-${active.recurringDay}` : `every d.${active.recurringDay}`)
                                                }
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {active.recurring ? (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => advanceRecurringReminder(active.id, active.source)}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                                    >
                                        <CheckCircle size={15} />
                                        {isHe ? 'אשר עכשיו' : 'Confirm'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            markLoginReminderHandled(active.id, active.source);
                                            setLocallyClosedAlertIds(prev => {
                                                const next = new Set(prev);
                                                next.add(globalId);
                                                return next;
                                            });
                                        }}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
                                    >
                                        {isHe ? 'הזכר אח"כ' : 'Snooze'}
                                    </button>
                                </div>
                                <button
                                    onClick={() => confirmReminder(active.id, active.source)}
                                    className={`w-full py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${isLight ? 'bg-red-50 hover:bg-red-100 text-red-500 border border-red-200' : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'}`}
                                >
                                    <RefreshCw size={12} />
                                    {isHe ? 'בטל תזכורת חוזרת לצמיתות' : 'Stop recurring reminder'}
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => confirmReminder(active.id, active.source)}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                                >
                                    <CheckCircle size={16} />
                                    {isHe ? 'בוצע' : 'Done'}
                                </button>
                                <button
                                    onClick={() => {
                                        markLoginReminderHandled(active.id, active.source);
                                        setLocallyClosedAlertIds(prev => {
                                            const next = new Set(prev);
                                            next.add(globalId);
                                            return next;
                                        });
                                    }}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
                                >
                                    {isHe ? 'הזכר לי אח"כ' : 'Snooze'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
