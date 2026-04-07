import { useState, useRef, useEffect } from 'react';
import { Bell, BellRing, X, Clock, CheckCheck, Trash2 } from 'lucide-react';
import { useReminders } from '../hooks/useReminders';

export function ReminderBell({ id, t, language, isLight }) {
    const { reminders, dueNow, future, dueCount, count, dismiss, confirmReminder } = useReminders();
    const [open, setOpen] = useState(false);
    const panelRef = useRef(null);
    const isHe = language === 'he';

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const hasDue = dueCount > 0;

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return isHe ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
    }

    function sourceLabel(source) {
        if (source === 'checklist') return isHe ? 'צ׳קליסט' : 'Checklist';
        return isHe ? 'תקציב' : 'Budget';
    }

    return (
        <div id={id} className="relative" ref={panelRef}>
            <button
                onClick={() => setOpen(v => !v)}
                className={`relative px-2.5 py-2 rounded-lg backdrop-blur-sm transition-colors h-10 flex items-center ${
                    hasDue
                        ? (isLight ? 'bg-red-50 border border-red-200 text-red-500 hover:bg-red-100' : 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30')
                        : (isLight ? 'bg-white border border-gray-200 text-slate-500 hover:bg-gray-50 shadow-sm' : 'bg-white/10 hover:bg-white/20 text-gray-300')
                }`}
                title={isHe ? 'תזכורות' : 'Reminders'}
            >
                {hasDue
                    ? <BellRing size={18} className="animate-[wiggle_1s_ease-in-out_infinite]" />
                    : <Bell size={18} />}
                {dueCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm border border-white/20 pointer-events-none z-10">
                        {dueCount}
                    </span>
                )}
                {future.length > 0 && (
                    <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm border border-white/20 pointer-events-none z-10">
                        {future.length}
                    </span>
                )}
            </button>

            {open && (
                <div className={`absolute top-full mt-2 end-0 w-72 rounded-xl border shadow-xl z-[9998] overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                    dir={isHe ? 'rtl' : 'ltr'}>
                    {/* Header */}
                    <div className={`flex items-center justify-between px-3 py-2.5 border-b ${isLight ? 'border-slate-100 bg-slate-50' : 'border-white/10 bg-white/5'}`}>
                        <div className="flex items-center gap-2">
                            <Bell size={14} className={isLight ? 'text-slate-500' : 'text-gray-400'} />
                            <span className={`text-sm font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                {isHe ? 'תזכורות' : 'Reminders'}
                            </span>
                        </div>
                        <button onClick={() => setOpen(false)} className={`p-0.5 rounded transition-colors ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}>
                            <X size={14} />
                        </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto custom-scrollbar scrollbar-right">
                        {count === 0 ? (
                            <div className={`px-4 py-6 text-center text-sm ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {isHe ? 'אין תזכורות' : 'No reminders set'}
                            </div>
                        ) : (
                            <div className="divide-y divide-inherit">
                                {/* Due now */}
                                {dueNow.length > 0 && (
                                    <div>
                                        <div className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'text-red-500 bg-red-50' : 'text-red-400 bg-red-500/10'}`}>
                                            {isHe ? 'לטיפול עכשיו' : 'Due now'}
                                        </div>
                                        {dueNow.map(r => (
                                            <ReminderRow key={r.id} r={r} isLight={isLight} isHe={isHe} formatDate={formatDate} sourceLabel={sourceLabel} onConfirm={confirmReminder} onDismiss={dismiss} due />
                                        ))}
                                    </div>
                                )}
                                {/* Future */}
                                {future.length > 0 && (
                                    <div>
                                        <div className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'text-slate-400 bg-slate-50' : 'text-gray-500 bg-white/5'}`}>
                                            {isHe ? 'עתידיות' : 'Upcoming'}
                                        </div>
                                        {future.map(r => (
                                            <ReminderRow key={r.id} r={r} isLight={isLight} isHe={isHe} formatDate={formatDate} sourceLabel={sourceLabel} onConfirm={confirmReminder} onDismiss={dismiss} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function ReminderRow({ r, isLight, isHe, formatDate, sourceLabel, onConfirm, onDismiss, due }) {
    return (
        <div className={`flex items-start gap-2 px-3 py-2.5 ${due ? (isLight ? 'bg-red-50/50' : 'bg-red-500/5') : ''}`}>
            <Clock size={13} className={`mt-0.5 shrink-0 ${due ? 'text-red-400' : (isLight ? 'text-slate-400' : 'text-gray-500')}`} />
            <div className="flex-1 min-w-0">
                <div 
                    className="flex items-center gap-1.5 flex-wrap cursor-pointer group"
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent('rc-navigate-to-item', { detail: { source: r.source, id: r.id } }));
                        // We also want to close the dropdown... but setOpen is in the parent. We can just dispatch a general mousedown on document or a custom event if easier.
                        // For now we can just let it navigate. The dropdown closes on click outside.
                        document.dispatchEvent(new Event('mousedown')); // Hack to trigger click-outside listener
                    }}
                >
                    <span className={`text-xs font-medium truncate group-hover:underline ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{r.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-gray-400'}`}>{sourceLabel(r.source)}</span>
                </div>
                <div className={`text-[11px] mt-0.5 ${due ? (isLight ? 'text-red-500' : 'text-red-400') : (isLight ? 'text-blue-500' : 'text-blue-400')}`}>
                    {formatDate(r.date)}
                </div>
                {r.text && <div className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{r.text}</div>}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
                {due && (
                    <button onClick={() => onDismiss(r.id)} title={isHe ? 'הזכר שוב' : 'Remind later'} className={`p-0.5 rounded transition-colors ${isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400'}`}>
                        <Clock size={12} />
                    </button>
                )}
                <button onClick={() => onConfirm(r.id)} title={isHe ? 'מחק תזכורת' : 'Delete reminder'} className={`p-0.5 rounded transition-colors ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}>
                    <Trash2 size={12} />
                </button>
            </div>
        </div>
    );
}
