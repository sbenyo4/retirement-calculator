import { Bell, CheckCircle, Clock, ArrowUpRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useReminders } from '../hooks/useReminders';

const isLifeEventSource = (source) => typeof source === 'string' && (source === 'lifeEvents' || source.startsWith('lifeEvents:'));

export function ReminderAlert({ language, isLight }) {
    const { pendingAlert, remindAgain, confirmReminder } = useReminders();
    const isHe = language === 'he';

    if (pendingAlert) {
        console.log("[ReminderAlert] Rendering for:", pendingAlert.label);
    }

    if (!pendingAlert) return null;

    const r = pendingAlert;

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
            <div
                className={`relative pointer-events-auto w-full max-w-sm rounded-2xl shadow-2xl border-2 overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
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
                                            window.dispatchEvent(new CustomEvent('rc-navigate-to-item', { detail: { source: r.source, id: r.id } }));
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
                            onClick={() => confirmReminder(r.id)}
                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                        >
                            <CheckCircle size={18} />
                            {isHe ? 'בוצע' : 'Done'}
                        </button>
                        <button
                            onClick={() => remindAgain(r.id)}
                            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
                        >
                            {isHe ? 'הזכר לי אחר כך' : 'Snooze'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
