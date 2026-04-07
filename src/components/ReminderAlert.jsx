import { Bell, CheckCircle, Clock, ArrowUpRight } from 'lucide-react';
import { useReminders } from '../hooks/useReminders';

export function ReminderAlert({ language, isLight }) {
    const { pendingAlert, remindAgain, confirmReminder } = useReminders();
    const isHe = language === 'he';

    if (!pendingAlert) return null;

    const r = pendingAlert;

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return isHe ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
    }

    return (
        <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-16 px-4 pointer-events-none">
            {/* Backdrop — dim but doesn't block */}
            <div className="absolute inset-0 bg-black/20 pointer-events-auto" onClick={() => remindAgain(r.id)} />

            <div
                className={`relative pointer-events-auto w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                dir={isHe ? 'rtl' : 'ltr'}
            >
                {/* Colored top strip */}
                <div className="h-1.5 bg-amber-400 w-full" />

                {/* Content */}
                <div className="px-5 py-4">
                    <div className="flex items-start gap-3 mb-4">
                        <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isLight ? 'bg-amber-100' : 'bg-amber-500/20'}`}>
                            <Bell size={18} className="text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`text-sm font-bold mb-0.5 ${isLight ? 'text-slate-800' : 'text-white'}`}>
                                {isHe ? 'תזכורת' : 'Reminder'}
                            </div>
                            <div className="flex items-start justify-between gap-2">
                                <div className={`text-base font-semibold max-w-[85%] ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                    {r.label}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        window.dispatchEvent(new CustomEvent('rc-navigate-to-item', { detail: { source: r.source, id: r.id } }));
                                        remindAgain(r.id); // dismiss popup so they can view the item
                                    }}
                                    className={`p-1.5 rounded-full transition-colors shrink-0 ${isLight ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'}`}
                                    title={isHe ? 'מעבר לפריט' : 'Go to item'}
                                >
                                    <ArrowUpRight size={14} />
                                </button>
                            </div>
                            {r.text && (
                                <div className={`text-sm mt-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                    {r.text}
                                </div>
                            )}
                            <div className={`flex items-center gap-1 mt-1.5 text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                <Clock size={11} />
                                <span>{formatDate(r.date)}</span>
                                {r.source === 'checklist'
                                    ? <span className={`ms-1.5 px-1.5 py-0.5 rounded-full ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-gray-400'}`}>{isHe ? 'צ׳קליסט' : 'Checklist'}</span>
                                    : <span className={`ms-1.5 px-1.5 py-0.5 rounded-full ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-gray-400'}`}>{isHe ? 'תקציב' : 'Budget'}</span>
                                }
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => confirmReminder(r.id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-colors ${isLight ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                        >
                            <CheckCircle size={15} />
                            {isHe ? 'טופל' : 'Done'}
                        </button>
                        <button
                            onClick={() => remindAgain(r.id)}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
                        >
                            {isHe ? 'הזכר שוב' : 'Remind later'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
