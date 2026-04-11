import { useEffect, useState } from 'react';
import { Bell, CheckCircle, Clock, ArrowUpRight, MessageSquare } from 'lucide-react';
import { createPortal } from 'react-dom';
import { markLoginReminderHandled, useReminders } from '../hooks/useReminders';

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

    return createPortal(
        <div className="fixed inset-0 z-[999999] flex items-start justify-center pt-16 px-4 pointer-events-none">
            <div className="w-full max-w-sm space-y-3">
                {visibleAlerts.map(r => {
                    const globalId = `${r.source}-${r.id}`;
                    return (
                        <div
                            key={globalId}
                            className={`relative pointer-events-auto rounded-2xl shadow-2xl border-2 overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                            dir={isHe ? 'rtl' : 'ltr'}
                        >
                            <div className="h-2 bg-gradient-to-r from-amber-400 to-orange-500 w-full" />

                            <div className="px-5 py-5">
                                <div className="flex items-start gap-3 mb-5">
                                    <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isLight ? 'bg-amber-100' : 'bg-amber-500/20'}`}>
                                        <Bell size={20} className="text-amber-500 animate-bounce" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-black uppercase tracking-wider mb-1 ${isLight ? 'text-amber-600' : 'text-amber-500'}`}>
                                            {isHe ? 'תזכורת חשובה' : 'IMPORTANT REMINDER'}
                                        </div>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className={`text-lg font-bold leading-tight ${isLight ? 'text-slate-800' : 'text-white'}`}>
                                                {r.label}
                                            </div>
                                            {r.source !== 'general' && (
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        window.dispatchEvent(
                                                            new CustomEvent('rc-navigate-to-item', {
                                                                detail: { source: r.source, id: r.id }
                                                            })
                                                        );
                                                    }}
                                                    className={`p-1.5 rounded-full transition-colors shrink-0 ${isLight ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'}`}
                                                    title={isHe ? 'מעבר לפריט' : 'Go to item'}
                                                >
                                                    <ArrowUpRight size={16} />
                                                </button>
                                            )}
                                        </div>
                                        {r.text && (
                                            <div className={`text-sm mt-2 font-medium ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                                {r.text}
                                            </div>
                                        )}
                                        {r.note && (
                                            <div className={`mt-2 rounded-lg text-sm border ${isLight ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>
                                                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 border-b text-xs font-semibold ${isLight ? 'border-amber-200 text-amber-600' : 'border-amber-500/20 text-amber-400'}`}>
                                                    <MessageSquare size={12} />
                                                    {isHe ? 'הערה' : 'Note'}
                                                </div>
                                                <div className="px-2.5 py-2 leading-snug">{r.note}</div>
                                            </div>
                                        )}
                                        <div className={`flex items-center gap-1.5 mt-3 text-xs font-semibold ${isLight ? 'text-slate-400 border-t border-slate-50 pt-2' : 'text-gray-500 border-t border-white/5 pt-2'}`}>
                                            <Clock size={12} />
                                            <span>{formatDate(r.date)}</span>
                                            <span className="mx-1 opacity-20">|</span>
                                            <span className="uppercase text-[10px] tracking-widest">
                                                {sourceLabel(r.source)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2.5">
                                    <button
                                        onClick={() => confirmReminder(r.id, r.source)}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                                    >
                                        <CheckCircle size={18} />
                                        {isHe ? 'בוצע' : 'Done'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            markLoginReminderHandled(r.id, r.source);
                                            setLocallyClosedAlertIds(prev => {
                                                const next = new Set(prev);
                                                next.add(globalId);
                                                return next;
                                            });
                                        }}
                                        className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
                                    >
                                        {isHe ? 'הזכר לי אח"כ' : 'Snooze'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>,
        document.body
    );
}
