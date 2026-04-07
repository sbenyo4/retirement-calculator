import { useState, useEffect, useCallback, useMemo } from 'react';

const SESSION_KEY = 'rc-reminders';

// In-memory set of reminders shown in CURRENT browser session life
const shownThisSession = new Set();

export function resetReminderSession() {
    console.log("%c[Reminders] Resetting session shown-state", "color: #ef4444; font-weight: bold");
    shownThisSession.clear();
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    window.dispatchEvent(new Event('rc-reminders-updated'));
}

export function silenceReminder(id, source) {
    if (!id) return;
    const globalId = source ? `${source}-${id}` : String(id);
    shownThisSession.add(globalId);
    window.dispatchEvent(new Event('rc-reminders-updated'));
}

function normalizeDate(d) {
    if (!d) return '';
    if (typeof d === 'string') {
        const isoMatch = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
        const parts = d.split(/[/-]/);
        if (parts.length === 3) {
            let y, m, day;
            if (parts[0].length === 4) { [y, m, day] = parts; }
            else if (parts[2].length === 4) { [day, m, y] = parts; }
            if (y && m && day) {
                return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
        }
    }
    try {
        const date = new Date(d);
        if (isNaN(date.getTime())) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    } catch { return ''; }
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
    const [reminders, setReminders] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); }
        catch { return []; }
    });
    const [tick, setTick] = useState(0);
    const [systemReady, setSystemReady] = useState(false);
    const [forceShowTill, setForceShowTill] = useState(0);

    useEffect(() => {
        const t = setTimeout(() => {
            setSystemReady(true);
            setForceShowTill(Date.now() + 15000);
        }, 800);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        const update = () => {
            try {
                const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
                setReminders(saved);
                setTick(t => t + 1);
            } catch {}
        };
        window.addEventListener('rc-reminders-updated', update);
        const id = setInterval(update, 60_000);
        return () => {
            clearInterval(id);
            window.removeEventListener('rc-reminders-updated', update);
        };
    }, []);

    const normalizedReminders = useMemo(() => 
        reminders.map(r => ({ ...r, date: normalizeDate(r.date) })), 
    [reminders]);
    
    const { dueNow, future } = useMemo(() => {
        const today = todayStr();
        return {
            dueNow: normalizedReminders
                .filter(r => r.date && r.date <= today)
                .sort((a, b) => b.date.localeCompare(a.date)),
            future: normalizedReminders
                .filter(r => r.date && r.date > today)
                .sort((a, b) => a.date.localeCompare(b.date))
        };
    }, [normalizedReminders]);

    const pendingAlert = useMemo(() => {
        if (!systemReady) return null;
        return dueNow.find(r => !shownThisSession.has(`${r.source}-${r.id}`)) || null;
    }, [dueNow, tick, systemReady]);

    const markShown = useCallback((id, source) => {
        if (!id) return;
        shownThisSession.add(source ? `${source}-${id}` : String(id));
        setTick(t => t + 1);
        window.dispatchEvent(new Event('rc-reminders-updated'));
    }, []);

    const confirmReminder = useCallback((id) => {
        const found = reminders.find(r => String(r.id) === String(id));
        const source = found?.source;
        try {
            const current = readReminders();
            const filtered = current.filter(r => !(String(r.id) === String(id) && r.source === source));
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(filtered));
        } catch {}
        markShown(id, source);
        setReminders(prev => prev.filter(r => !(String(r.id) === String(id) && r.source === source)));
        window.dispatchEvent(new CustomEvent('rc-reminder-confirmed', { detail: { id, source } }));
        window.dispatchEvent(new Event('rc-reminders-updated'));
    }, [markShown, reminders]);

    const dismiss = useCallback((id) => {
        const found = reminders.find(r => String(r.id) === String(id));
        markShown(id, found?.source);
    }, [markShown, reminders]);

    return {
        reminders: normalizedReminders,
        dueNow,
        future,
        pendingAlert,
        dismiss,
        remindAgain: dismiss,
        confirmReminder,
        count: normalizedReminders.length,
        dueCount: dueNow.length,
    };
}

export function syncComponentReminders(source, items, silent = false) {
    syncMultipleSources([{ source, items, silent }]);
}

export function syncMultipleSources(syncConfigs) {
    try {
        const existing = readReminders();
        let nextState = [...existing];
        syncConfigs.forEach(({ source, items, silent }) => {
            nextState = nextState.filter(r => r.source !== source);
            const newOnes = items
                .filter(i => !!(i.reminder?.date || i.date))
                .map(i => ({
                    id: String(i.id),
                    label: i.label || i.title || i.description || i.id,
                    source: source,
                    date: normalizeDate(i.reminder?.date || i.date),
                    text: i.reminder?.text || i.text || '',
                }));
            if (silent) {
                newOnes.forEach(r => shownThisSession.add(`${source}-${r.id}`));
            }
            nextState = [...nextState, ...newOnes];
        });
        const nextValue = JSON.stringify(nextState);
        if (sessionStorage.getItem(SESSION_KEY) !== nextValue) {
            sessionStorage.setItem(SESSION_KEY, nextValue);
            window.dispatchEvent(new Event('rc-reminders-updated'));
        }
    } catch (err) {
        console.error("[useReminders] sync failed", err);
    }
}
