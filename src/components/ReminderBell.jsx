import { useState, useRef, useEffect, useMemo } from 'react';
import { Bell, BellRing, X, Clock, Trash2, FileText, Plus, Pencil, Save } from 'lucide-react';
import { useReminders, syncComponentReminders, silenceReminder, updateReminderInSession } from '../hooks/useReminders';
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
    const [editingReminder, setEditingReminder] = useState(null);
    const [editForm, setEditForm] = useState({ date: '', text: '' });
    
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
    const visibleTomorrow = useMemo(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tmr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        return visibleFuture.filter(r => r.date === tmr);
    }, [visibleFuture]);
    const visibleLater = useMemo(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tmr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        return visibleFuture.filter(r => r.date > tmr);
    }, [visibleFuture]);
    const visibleCount = visibleReminders.length;
    const visibleDueCount = visibleDueNow.length;
    const visibleFutureCount = visibleFuture.length;
    const visibleTomorrowCount = visibleTomorrow.length;

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

        // 1. CLOSE modal and clear form immediately for responsive feel
        const nextList = [...genReminders, newRem];
        setForm({ label: '', date: '', text: '' });
        setIsAdding(false);
        setIsSaving(true);

        try {
            // 2. Persist to Firestore first
            await setGeneralReminders(uid, nextList);

            // 3. Only after successful save: update session and silence (no popup)
            syncComponentReminders('general', nextList, true);
            silenceReminder(newId, 'general');
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

    const beginEditReminder = (reminder) => {
        setIsAdding(false);
        setEditingReminder(reminder);
        setEditForm({
            date: reminder?.date || '',
            text: reminder?.label || reminder?.description || reminder?.text || '',
        });
    };

    const toggleEditReminder = (reminder) => {
        if (
            editingReminder?.id === reminder?.id &&
            editingReminder?.source === reminder?.source
        ) {
            cancelEditReminder();
            return;
        }
        beginEditReminder(reminder);
    };

    const cancelEditReminder = () => {
        setEditingReminder(null);
    };

    const saveEditReminder = async () => {
        if (!editingReminder?.id || !editingReminder?.source || !editForm.date) return;
        const nextText = editForm.text.trim();
        const { id: reminderId, source } = editingReminder;
        silenceReminder(reminderId, source);
        updateReminderInSession(source, reminderId, { date: editForm.date, label: nextText });
        window.dispatchEvent(new CustomEvent('rc-reminder-edited', {
            detail: { id: reminderId, source, date: editForm.date, label: nextText }
        }));
        setEditingReminder(null);
    };

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
                    <span className={`absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-black flex items-center justify-center shadow-sm border border-white/20 pointer-events-none z-10 ${visibleTomorrowCount > 0 ? 'bg-yellow-500' : 'bg-blue-500'}`}>
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
                                            <ReminderRow
                                                key={r.id}
                                                r={r}
                                                isLight={isLight}
                                                isHe={isHe}
                                                formatDate={formatDate}
                                                sourceLabel={reminderSourceLabel}
                                                onConfirm={confirmReminder}
                                                onDismiss={dismiss}
                                                onEdit={toggleEditReminder}
                                                due
                                                isEditing={editingReminder?.id === r.id && editingReminder?.source === r.source}
                                                editForm={editForm}
                                                setEditForm={setEditForm}
                                                onSaveEdit={saveEditReminder}
                                                onCancelEdit={cancelEditReminder}
                                            />
                                        ))}
                                    </div>
                                )}
                                {false && visibleFuture.length > 0 && (
                                    <div>
                                        <div className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'text-amber-700 bg-amber-50' : 'text-amber-400 bg-amber-500/10'}`}>
                                            {isHe ? 'עתידיות' : 'Upcoming'}
                                        </div>
                                        {visibleFuture.map(r => (
                                            <ReminderRow
                                                key={r.id}
                                                r={r}
                                                isLight={isLight}
                                                isHe={isHe}
                                                formatDate={formatDate}
                                                sourceLabel={reminderSourceLabel}
                                                onConfirm={confirmReminder}
                                                onDismiss={dismiss}
                                                onEdit={toggleEditReminder}
                                                tone="tomorrow"
                                                isEditing={editingReminder?.id === r.id && editingReminder?.source === r.source}
                                                editForm={editForm}
                                                setEditForm={setEditForm}
                                                onSaveEdit={saveEditReminder}
                                                onCancelEdit={cancelEditReminder}
                                            />
                                        ))}
                                    </div>
                                )}
                                {visibleTomorrow.length > 0 && (
                                    <div>
                                        <div className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'text-yellow-700 bg-yellow-50' : 'text-yellow-300 bg-yellow-500/10'}`}>
                                            {isHe ? 'מחר' : 'Tomorrow'}
                                        </div>
                                        {visibleTomorrow.map(r => (
                                            <ReminderRow
                                                key={r.id}
                                                r={r}
                                                isLight={isLight}
                                                isHe={isHe}
                                                formatDate={formatDate}
                                                sourceLabel={reminderSourceLabel}
                                                onConfirm={confirmReminder}
                                                onDismiss={dismiss}
                                                onEdit={toggleEditReminder}
                                                tone="tomorrow"
                                                isEditing={editingReminder?.id === r.id && editingReminder?.source === r.source}
                                                editForm={editForm}
                                                setEditForm={setEditForm}
                                                onSaveEdit={saveEditReminder}
                                                onCancelEdit={cancelEditReminder}
                                            />
                                        ))}
                                    </div>
                                )}
                                {visibleLater.length > 0 && (
                                    <div>
                                        <div className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'text-slate-400 bg-slate-50' : 'text-gray-500 bg-white/5'}`}>
                                            {isHe ? 'עתידיות' : 'Later'}
                                        </div>
                                        {visibleLater.map(r => (
                                            <ReminderRow
                                                key={r.id}
                                                r={r}
                                                isLight={isLight}
                                                isHe={isHe}
                                                formatDate={formatDate}
                                                sourceLabel={reminderSourceLabel}
                                                onConfirm={confirmReminder}
                                                onDismiss={dismiss}
                                                onEdit={toggleEditReminder}
                                                isEditing={editingReminder?.id === r.id && editingReminder?.source === r.source}
                                                editForm={editForm}
                                                setEditForm={setEditForm}
                                                onSaveEdit={saveEditReminder}
                                                onCancelEdit={cancelEditReminder}
                                            />
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

function ReminderRow({ r, isLight, isHe, formatDate, sourceLabel, onConfirm, onDismiss, onEdit, onSaveEdit, onCancelEdit, isEditing, editForm, setEditForm, due, tone }) {
    const isTomorrow = tone === 'tomorrow';
    return (
        <>
        <div className={`flex items-start gap-2 px-3 py-2.5 ${due ? (isLight ? 'bg-red-50/50' : 'bg-red-500/5') : isTomorrow ? (isLight ? 'bg-yellow-50/70' : 'bg-yellow-500/5') : ''}`}>
            <Clock size={13} className={`mt-0.5 shrink-0 ${due ? 'text-red-400' : isTomorrow ? (isLight ? 'text-yellow-500' : 'text-yellow-300') : (isLight ? 'text-slate-400' : 'text-gray-500')}`} />
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
                <div className={`text-[11px] mt-0.5 ${due ? (isLight ? 'text-red-500' : 'text-red-400') : isTomorrow ? (isLight ? 'text-yellow-600' : 'text-yellow-300') : (isLight ? 'text-blue-500' : 'text-blue-400')}`}>
                    {formatDate(r.date)}
                </div>
                {r.text && <div className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{r.text}</div>}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
                <button
                    onClick={() => onEdit?.(r)}
                    title={isHe ? 'ערוך תזכורת' : 'Edit reminder'}
                    className={`p-0.5 rounded transition-colors ${isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400'}`}
                >
                    <Pencil size={12} />
                </button>
                <button onClick={() => onConfirm(r.id, r.source)} title={isHe ? 'מחק תזכורת' : 'Delete reminder'} className={`p-0.5 rounded transition-colors ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}>
                    <Trash2 size={12} />
                </button>
            </div>
        </div>
        {isEditing && (
            <div className={`px-3 pb-3 ${isLight ? 'border-t border-slate-100' : 'border-t border-white/10'}`}>
                <div className="grid gap-2 pt-2" style={{ gridTemplateColumns: '1fr auto' }}>
                    <div className="space-y-1">
                        <label className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'מתי?' : 'When?'}</label>
                        <input
                            type="date"
                            value={editForm.date}
                            onChange={e => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                            className={`w-full px-2 py-2 text-xs rounded-lg border outline-none ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-white/10 text-white'}`}
                        />
                        <label className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-400' : 'text-gray-500'} pt-1`}>{isHe ? 'טקסט התזכורת' : 'Reminder text'}</label>
                        <input
                            type="text"
                            value={editForm.text}
                            onChange={e => setEditForm(prev => ({ ...prev, text: e.target.value }))}
                            placeholder={isHe ? 'הטקסט של התזכורת' : 'Reminder text'}
                            className={`w-full px-2 py-2 text-xs rounded-lg border outline-none ${isLight ? 'bg-white border-slate-200 text-slate-700 placeholder-slate-300' : 'bg-slate-800 border-white/10 text-white placeholder-gray-500'}`}
                        />
                    </div>
                    <div className="flex items-end gap-1">
                        <button
                            onClick={() => onSaveEdit?.()}
                            disabled={!editForm.date}
                            className={`px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${editForm.date ? 'bg-blue-600 text-white hover:bg-blue-700' : isLight ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-gray-600 cursor-not-allowed'}`}
                            title={isHe ? 'שמור' : 'Save'}
                        >
                            <Save size={12} />
                        </button>
                        <button
                            onClick={() => onCancelEdit?.()}
                            className={`px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${isLight ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                            title={isHe ? 'בטל' : 'Cancel'}
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
