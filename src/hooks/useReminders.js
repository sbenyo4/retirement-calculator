import { useState, useEffect, useCallback } from 'react';

const SESSION_KEY = 'rc-reminders';

// In-memory only — must be cleared on every login
const shownThisSession = new Set();

/** Call this on every login to reset shown state */
export function resetReminderSession() {
    shownThisSession.clear();
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    window.dispatchEvent(new Event('rc-reminders-session-reset'));
    window.dispatchEvent(new Event('rc-reminders-updated')); // Notify hooks to clear local state
}

/** Instantly marks a reminder as shown so it doesn't pop up for the first time in the same session it was created */
export function silenceReminder(id) {
    if (!id) return;
    shownThisSession.add(id);
    window.dispatchEvent(new Event('rc-reminders-shown-updated'));
}

function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function readReminders() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); } catch { return []; }
}

export function useReminders() {
    const [reminders, setReminders] = useState(readReminders);
    const [shown, setShown] = useState(() => new Set(shownThisSession));

    useEffect(() => {
        // Always re-sync both reminders AND shown at the same time,
        // so a silenced reminder is still excluded even when rc-reminders-updated fires after silenceReminder
        const sync = () => {
            setReminders(readReminders());
            setShown(new Set(shownThisSession));
        };
        const syncShown = () => setShown(new Set(shownThisSession));
        const reset = () => { setShown(new Set()); };
        sync();
        const id = setInterval(sync, 60_000);
        window.addEventListener('rc-reminders-updated', sync);
        window.addEventListener('rc-reminders-shown-updated', syncShown);
        window.addEventListener('rc-reminders-session-reset', reset);
        return () => {
            clearInterval(id);
            window.removeEventListener('rc-reminders-updated', sync);
            window.removeEventListener('rc-reminders-shown-updated', syncShown);
            window.removeEventListener('rc-reminders-session-reset', reset);
        };
    }, []);

    const today = todayStr();
    const dueNow = reminders
        .filter(r => r.date && r.date <= today)
        .sort((a, b) => b.date.localeCompare(a.date));
    const future = reminders
        .filter(r => r.date && r.date > today)
        .sort((a, b) => a.date.localeCompare(b.date));

    // pendingAlert: due reminders not yet shown this session — show one at a time
    // Read directly from module-level shownThisSession (always current) instead of React state (can be stale due to batching)
    const pendingAlert = dueNow.find(r => !shownThisSession.has(r.id)) || null;

    const markShown = useCallback((id) => {
        shownThisSession.add(id);
        setShown(new Set(shownThisSession));
        window.dispatchEvent(new Event('rc-reminders-shown-updated'));
    }, []);

    /** "Remind again" — hides for this session, reappears next login */
    const remindAgain = useCallback((id) => { markShown(id); }, [markShown]);

    /** "Confirmed" / "Delete" — removes reminder from item via event + immediately from sessionStorage */
    const confirmReminder = useCallback((id) => {
        // Remove from sessionStorage immediately so it never reappears, even before Firestore saves
        try {
            const current = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(current.filter(r => r.id !== id)));
        } catch {}
        markShown(id);
        setReminders(prev => prev.filter(r => r.id !== id));
        window.dispatchEvent(new CustomEvent('rc-reminder-confirmed', { detail: { id } }));
        window.dispatchEvent(new Event('rc-reminders-updated'));
    }, [markShown]);

    /** Bell panel dismiss (session only) */
    const dismiss = useCallback((id) => { markShown(id); }, [markShown]);

    return {
        reminders,
        dueNow,
        future,
        pendingAlert,
        dismiss,
        remindAgain,
        confirmReminder,
        count: reminders.length,
        dueCount: dueNow.length,
    };
}

/** Write the full reminders array to sessionStorage and notify listeners */
export function writeReminders(items, silent = false) {
    try {
        const list = items
            .filter(i => i.reminder?.date)
            .map(i => ({
                id: i.id,
                label: i.label || i.title || i.id,
                source: i._source || 'budget',
                date: i.reminder.date,
                text: i.reminder.text || '',
            }));
        
        if (silent) {
            list.forEach(r => shownThisSession.add(r.id));
        }

        sessionStorage.setItem(SESSION_KEY, JSON.stringify(list));
        window.dispatchEvent(new Event('rc-reminders-updated'));
    } catch {}
}

/** Merges items from a specific source without overwriting other sources' reminders */
export function syncComponentReminders(source, items, silent = false) {
    try {
        const existing = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
        const filtered = existing.filter(r => r.source !== source);
        const newReminders = items
            .filter(i => i.reminder && i.reminder.date)
            .map(i => ({
                id: i.id,
                label: i.label || i.title || i.id,
                source: source,
                date: i.reminder.date,
                text: i.reminder.text || '',
            }));

        if (silent) {
            newReminders.forEach(r => shownThisSession.add(r.id));
        }

        sessionStorage.setItem(SESSION_KEY, JSON.stringify([...filtered, ...newReminders]));
        window.dispatchEvent(new Event('rc-reminders-updated'));
    } catch {}
}
