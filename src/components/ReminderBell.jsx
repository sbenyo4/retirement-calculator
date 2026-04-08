import { useState, useRef, useEffect, useMemo } from 'react';
import { Bell, BellRing, X, Clock, Trash2, FileText, Plus } from 'lucide-react';
import { useReminders, syncComponentReminders, silenceReminder } from '../hooks/useReminders';
import { useAuth } from '../contexts/AuthContext';
import { setGeneralReminders } from '../utils/db';

const isLifeEventSource = (source) => typeof source === 'string' && (source === 'lifeEvents' || source.startsWith('lifeEvents:'));

export function ReminderBell({ id, t, language, isLight, activeProfileId }) {
    const { reminders, dueNow, future, dismiss, confirmReminder } = useReminders();
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;

    const [open, setOpen] = useState(false);
    const panelRef = useRef(null);
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({ label: '', date: '', text: '' });
    
    const isHe = language === 'he';
    const activeLifeEventSource = activeProfileId ? `lifeEvents:${activeProfileId}` : null;
    const isVisibleReminder = (reminder) => {
        if (!reminder) return false;
        if (!isLifeEventSource(reminder.source)) return true;
        return reminder.source === activeLifeEventSource;
    };
    
    // Derived state: general reminders are just a filter of the global list
    // This is the SINGLE SOURCE OF TRUTH. No local state or effects needed to sync.
    const genReminders = useMemo(() => 
        reminders.filter(r => r.source === 'general'), 
    [reminders]);
    const visibleReminders = useMemo(() => reminders.filter(isVisibleReminder), [reminders, activeLifeEventSource]);
    const visibleDueNow = useMemo(() => dueNow.filter(isVisibleReminder), [dueNow, activeLifeEventSource]);
    const visibleFuture = useMemo(() => future.filter(isVisibleReminder), [future, activeLifeEventSource]);
    const visibleCount = visibleReminders.length;
    const visibleDueCount = visibleDueNow.length;
    const visibleFutureCount = visibleFuture.length;

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleAdd = async () => {
        if (!form.label || !form.date || !uid) return;
        const newId = `gen-${Date.now()}`;
        const newRem = {
            id: newId,
            label: form.label,
            date: form.date, // Browser input type="date" is already YYYY-MM-DD
            text: form.text
        };

        // 1. SILENT local update (Immediate UI feedback, no popup)
        silenceReminder(newId);
        
        // 2. CLOSE modal and clear form immediately for responsive feel
        const nextList = [...genReminders, newRem];
        setForm({ label: '', date: '', text: '' });
        setIsAdding(false);
        setIsSaving(true);

        try {
            // 3. Update Global Session Storage (which triggers useReminders hooks)
            syncComponentReminders('general', nextList, true);

            // 4. Persist to Firestore
            await setGeneralReminders(uid, nextList);
        } catch (err) {
            console.error('[ReminderBell] Save failed:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const hasDue = visibleDueCount > 0;

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return isHe ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
    }

    function sourceLabel(source) {
        if (source === 'checklist') return isHe ? 'צ׳קליסט' : 'Checklist';
        if (source === 'budget') return isHe ? 'תקציב' : 'Budget';
        if (source === 'general') return isHe ? 'כללי' : 'General';
        if (isLifeEventSource(source)) return isHe ? 'אירוע חיים' : 'Life Event';
        return source;
    }

    const reminderSourceLabel = (source) => sourceLabel(source);

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
                {visibleDueCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm border border-white/20 pointer-events-none z-10">
                        {visibleDueCount}
                    </span>
                )}
                {visibleFutureCount > 0 && (
                    <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm border border-white/20 pointer-events-none z-10">
                        {visibleFutureCount}
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
                        {visibleCount === 0 ? (
                            <div className={`px-4 py-6 text-center text-sm ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {isHe ? 'אין תזכורות' : 'No reminders set'}
                            </div>
                        ) : (
                            <div className="divide-y divide-inherit">
                                {visibleDueNow.length > 0 && (
                                    <div>
                                        <div className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'text-red-500 bg-red-50' : 'text-red-400 bg-red-500/10'}`}>
                                            {isHe ? 'לטיפול עכשיו' : 'Due now'}
                                        </div>
                                        {visibleDueNow.map(r => (
                                            <ReminderRow key={r.id} r={r} isLight={isLight} isHe={isHe} formatDate={formatDate} sourceLabel={reminderSourceLabel} onConfirm={confirmReminder} onDismiss={dismiss} due />
                                        ))}
                                    </div>
                                )}
                                {visibleFuture.length > 0 && (
                                    <div>
                                        <div className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'text-slate-400 bg-slate-50' : 'text-gray-500 bg-white/5'}`}>
                                            {isHe ? 'עתידיות' : 'Upcoming'}
                                        </div>
                                        {visibleFuture.map(r => (
                                            <ReminderRow key={r.id} r={r} isLight={isLight} isHe={isHe} formatDate={formatDate} sourceLabel={reminderSourceLabel} onConfirm={confirmReminder} onDismiss={dismiss} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer / Add Action */}
                    <div className={`border-t ${isLight ? 'border-slate-100 bg-slate-50' : 'border-white/10 bg-white/5'}`}>
                        {isAdding ? (
                            <div className="p-3 space-y-2.5">
                                <div className="space-y-1">
                                    <label className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'מה התזכורת?' : 'What is the reminder?'}</label>
                                    <div className="relative">
                                        <FileText size={14} className="absolute start-2 top-2.5 text-slate-400" />
                                        <input
                                            autoFocus
                                            className={`w-full ps-8 pe-3 py-2 text-xs rounded-lg border outline-none transition-all ${isLight ? 'bg-white border-slate-200 focus:border-blue-500' : 'bg-slate-800 border-white/10 focus:border-blue-500 text-white'}`}
                                            placeholder={isHe ? 'למשל: לבדוק דמי ניהול' : 'e.g. Check management fees'}
                                            value={form.label}
                                            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="grid gap-2" style={{ gridTemplateColumns: '1fr auto' }}>
                                    <div className="space-y-1">
                                        <label className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'מתי?' : 'When?'}</label>
                                        <input
                                            type="date"
                                            className={`w-full px-2 py-2 text-xs rounded-lg border outline-none ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-white/10 text-white'}`}
                                            value={form.date}
                                            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <button
                                            onClick={handleAdd}
                                            disabled={!form.label || !form.date || isSaving}
                                            className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                        >
                                            {isSaving ? (isHe ? 'שומר...' : 'Saving...') : (isHe ? 'שמור' : 'Save')}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex justify-center">
                                    <button onClick={() => setIsAdding(false)} className={`text-[10px] font-medium hover:underline ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {isHe ? 'ביטול' : 'Cancel'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsAdding(true)}
                                className={`w-full py-3 flex items-center justify-center gap-2 text-xs font-semibold transition-colors hover:bg-blue-500/5 ${isLight ? 'text-blue-600' : 'text-blue-400'}`}
                            >
                                <Plus size={14} />
                                {isHe ? 'הוסף תזכורת כללית' : 'Add general reminder'}
                            </button>
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
                        if (r.source === 'general') return;
                        window.dispatchEvent(new CustomEvent('rc-navigate-to-item', { detail: { source: r.source, id: r.id } }));
                        document.dispatchEvent(new Event('mousedown')); // trigger click-outside
                    }}
                >
                    <span className={`text-xs font-medium truncate ${r.source !== 'general' ? 'group-hover:underline' : ''} ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{r.label}</span>
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
