import { useState, useEffect, useCallback, useMemo } from 'react';

const SESSION_KEY = 'rc-reminders';

// In-memory set of reminders shown in CURRENT browser session life
const shownThisSession = new Set();
const forcedPopupUntil = new Map();
const loginTargetReminderIds = new Set();
const loginHandledReminderIds = new Set();
let loginPopupMode = true;
let loginPopupGraceUntil = 0;

function toGlobalId(id, source) {
    return source ? `${source}-${id}` : String(id);
}

function isForced(globalId) {
    const until = forcedPopupUntil.get(globalId);
    if (!until) return false;
    if (until <= Date.now()) {
        forcedPopupUntil.delete(globalId);
        return false;
    }
    return true;
}

function resetLoginPopupModeState() {
    loginPopupMode = true;
    loginPopupGraceUntil = Date.now() + 2500;
    loginTargetReminderIds.clear();
    loginHandledReminderIds.clear();
}

export function resetReminderSession() {
    console.log("%c[Reminders] Resetting session shown-state", "color: #ef4444; font-weight: bold");
    shownThisSession.clear();
    forcedPopupUntil.clear();
    resetLoginPopupModeState();
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    window.dispatchEvent(new Event('rc-reminders-updated'));
}

export function silenceReminder(id, source) {
    if (!id) return;
    const globalId = toGlobalId(id, source);
    shownThisSession.add(globalId);
    forcedPopupUntil.delete(globalId);
    window.dispatchEvent(new Event('rc-reminders-updated'));
}

export function forgetReminderShown(id, source) {
    if (!id) return;
    const globalId = toGlobalId(id, source);
    shownThisSession.delete(globalId);
}

export function forceReminderPopup(id, source, durationMs = 15000) {
    if (!id || !source) return;
    const globalId = toGlobalId(id, source);
    shownThisSession.delete(globalId);
    forcedPopupUntil.set(globalId, Date.now() + Math.max(1000, durationMs));
    window.dispatchEvent(new Event('rc-reminders-updated'));
}

export function markLoginReminderHandled(id, source) {
    if (!id || !source) return;
    loginHandledReminderIds.add(toGlobalId(id, source));
    window.dispatchEvent(new Event('rc-reminders-updated'));
}

export function updateReminderInSession(source, id, changes = {}) {
    if (!source || !id) return;
    try {
        const current = readReminders();
        const next = current.map(r => {
            if (r.source !== source || String(r.id) !== String(id)) return r;
            return {
                ...r,
                ...(changes.label !== undefined ? { label: changes.label } : {}),
                ...(changes.date !== undefined ? { date: changes.date } : {}),
                ...(changes.text !== undefined ? { text: changes.text } : {}),
            };
        });
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event('rc-reminders-updated'));
    } catch (err) {
        console.error('[useReminders] update reminder failed', err);
    }
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
        // Catch any session updates that happened before this hook subscribed.
        update();
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

    useEffect(() => {
        if (!loginPopupMode) return;

        const now = Date.now();
        if (now <= loginPopupGraceUntil) {
            dueNow.forEach(r => loginTargetReminderIds.add(toGlobalId(r.id, r.source)));
            const wait = Math.max(0, loginPopupGraceUntil - now);
            const timeoutId = setTimeout(() => {
                window.dispatchEvent(new Event('rc-reminders-updated'));
            }, wait + 5);
            return () => clearTimeout(timeoutId);
        }

        const allHandled = Array.from(loginTargetReminderIds).every(id => loginHandledReminderIds.has(id));
        if (allHandled) {
            loginPopupMode = false;
            window.dispatchEvent(new Event('rc-reminders-updated'));
        }
    }, [dueNow, tick]);

    const alertDueNow = useMemo(() => {
        if (!loginPopupMode) return [];
        return dueNow.filter(r => {
            const globalId = toGlobalId(r.id, r.source);
            if (isForced(globalId)) return true;
            if (!loginTargetReminderIds.has(globalId)) return false;
            return !loginHandledReminderIds.has(globalId);
        });
    }, [dueNow, tick]);

    const pendingAlert = useMemo(() => {
        return alertDueNow[0] || null;
    }, [alertDueNow]);

    const markShown = useCallback((id, source) => {
        if (!id) return;
        const globalId = toGlobalId(id, source);
        shownThisSession.add(globalId);
        forcedPopupUntil.delete(globalId);
        setTick(t => t + 1);
        window.dispatchEvent(new Event('rc-reminders-updated'));
    }, []);

    const confirmReminder = useCallback((id, sourceHint) => {
        const found = sourceHint
            ? reminders.find(r => String(r.id) === String(id) && r.source === sourceHint)
            : reminders.find(r => String(r.id) === String(id));
        const source = sourceHint || found?.source;
        try {
            const current = readReminders();
            const filtered = current.filter(r => {
                if (String(r.id) !== String(id)) return true;
                if (!source) return false;
                return r.source !== source;
            });
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(filtered));
        } catch {}
        if (source) {
            loginHandledReminderIds.add(toGlobalId(id, source));
        }
        markShown(id, source);
        setReminders(prev => prev.filter(r => {
            if (String(r.id) !== String(id)) return true;
            if (!source) return false;
            return r.source !== source;
        }));
        window.dispatchEvent(new CustomEvent('rc-reminder-confirmed', { detail: { id, source } }));
        window.dispatchEvent(new Event('rc-reminders-updated'));
    }, [markShown, reminders]);

    const dismiss = useCallback((id, sourceHint) => {
        const found = sourceHint
            ? reminders.find(r => String(r.id) === String(id) && r.source === sourceHint)
            : reminders.find(r => String(r.id) === String(id));
        const source = sourceHint || found?.source;
        if (source) {
            loginHandledReminderIds.add(toGlobalId(id, source));
        }
        markShown(id, source);
    }, [markShown, reminders]);

    return {
        reminders: normalizedReminders,
        dueNow,
        alertDueNow,
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
