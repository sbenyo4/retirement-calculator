import { useState, useEffect, useCallback, useMemo } from 'react';

const SESSION_KEY = 'rc-reminders';
const SNOOZE_KEY = 'rc-reminders-snoozed';

function readSnoozed() {
    try { return JSON.parse(sessionStorage.getItem(SNOOZE_KEY) || '{}'); } catch { return {}; }
}

export function setReminderSnooze(id, source, date) {
    if (!id || !source) return;
    const globalId = toGlobalId(id, source);
    const today = todayStr();
    const existing = readSnoozed();
    const cleaned = Object.fromEntries(Object.entries(existing).filter(([, d]) => d > today));
    cleaned[globalId] = date;
    try { sessionStorage.setItem(SNOOZE_KEY, JSON.stringify(cleaned)); } catch {}
}

// In-memory state for the current browser session
const shownThisSession = new Set();
const forcedPopupUntil = new Map();
const loginHandledReminderIds = new Set();
// Set to true only after the first DB sync completes (via markInitialSyncDone).
// Prevents any alert from flashing before we know what is actually due.
let syncReady = false;

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

export function resetReminderSession() {
    shownThisSession.clear();
    forcedPopupUntil.clear();
    loginHandledReminderIds.clear();
    syncReady = false;
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    window.dispatchEvent(new Event('rc-reminders-updated'));
}

// Called by GlobalRemindersSync once the first DB load is complete.
// Only after this point will alert popups be allowed to appear.
export function markInitialSyncDone() {
    syncReady = true;
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
                ...(changes.recurring !== undefined ? { recurring: changes.recurring } : {}),
                ...(changes.recurringType !== undefined ? { recurringType: changes.recurringType } : {}),
                ...(changes.recurringDay !== undefined ? { recurringDay: changes.recurringDay } : {}),
                ...(changes.recurringInterval !== undefined ? { recurringInterval: changes.recurringInterval } : {}),
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

function toYMDStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function nextOccurrenceOf(day) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const clamp = (y, m, d) => Math.min(d, new Date(y, m + 1, 0).getDate());
    const y = today.getFullYear();
    const m = today.getMonth();
    const thisDate = new Date(y, m, clamp(y, m, day));
    if (thisDate > today) return toYMDStr(thisDate);
    const nextM = m === 11 ? 0 : m + 1;
    const nextY = m === 11 ? y + 1 : y;
    return toYMDStr(new Date(nextY, nextM, clamp(nextY, nextM, day)));
}

export function nextOccurrenceByInterval(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + Math.max(1, days));
    return toYMDStr(d);
}

function recurringNextDate(reminder) {
    const type = reminder.recurringType || (reminder.recurringDay ? 'monthly' : null);
    if (type === 'monthly') return nextOccurrenceOf(reminder.recurringDay);
    if (type === 'interval') return nextOccurrenceByInterval(reminder.recurringInterval || 7);
    return null;
}

export function advanceRecurringReminder(id, source) {
    if (!id || !source) return;
    try {
        const current = readReminders();
        const reminder = current.find(r => String(r.id) === String(id) && r.source === source);
        if (!reminder?.recurring) return;
        const newDate = recurringNextDate(reminder);
        if (!newDate) return;
        const next = current.map(r =>
            (String(r.id) === String(id) && r.source === source) ? { ...r, date: newDate } : r
        );
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
        loginHandledReminderIds.add(toGlobalId(id, source));
        window.dispatchEvent(new CustomEvent('rc-reminder-advanced', { detail: { id, source, newDate } }));
        window.dispatchEvent(new Event('rc-reminders-updated'));
    } catch (err) {
        console.error('[useReminders] advance recurring failed', err);
    }
}

function readReminders() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); } catch { return []; }
}

export function useReminders() {
    const [reminders, setReminders] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); }
        catch { return []; }
    });
    const [, setTick] = useState(0);

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

    const alertDueNow = useMemo(() => {
        if (!syncReady) return [];
        return dueNow.filter(r => {
            const globalId = toGlobalId(r.id, r.source);
            if (isForced(globalId)) return true;
            return !loginHandledReminderIds.has(globalId);
        });
    }, [dueNow]);

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

export function addSingleReminder(reminder) {
    if (!reminder?.id || !reminder?.source || !reminder?.date) return;
    try {
        const existing = readReminders();
        const next = [...existing, { ...reminder, date: normalizeDate(reminder.date) }];
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event('rc-reminders-updated'));
    } catch {}
}

export function syncComponentReminders(source, items, silent = false) {
    syncMultipleSources([{ source, items, silent }]);
}

export function syncMultipleSources(syncConfigs) {
    try {
        const existing = readReminders();
        let nextState = [...existing];
        const snoozed = readSnoozed();
        const today = todayStr();
        syncConfigs.forEach(({ source, items }) => {
            nextState = nextState.filter(r => r.source !== source);
            const newOnes = items
                .filter(i => !!(i.reminder?.date || i.date))
                .map(i => {
                    const isRec = i.recurring || i.reminder?.recurring;
                    const rType = i.recurringType || i.reminder?.recurringType;
                    const rDay = i.recurringDay ?? i.reminder?.recurringDay;
                    const rInterval = i.recurringInterval ?? i.reminder?.recurringInterval;
                    const item = {
                        id: String(i.id),
                        label: i.label || i.title || i.description || i.id,
                        source: source,
                        date: normalizeDate(i.reminder?.date || i.date),
                        text: i.reminder?.text || i.text || '',
                        note: i.note || '',
                        ...(isRec ? {
                            recurring: true,
                            ...(rType ? { recurringType: rType } : {}),
                            ...(rDay !== undefined ? { recurringDay: rDay } : {}),
                            ...(rInterval !== undefined ? { recurringInterval: rInterval } : {}),
                        } : {}),
                    };
                    // If this reminder was snoozed and the snooze date is still in the future,
                    // keep the snoozed date so Firestore syncs don't undo the snooze.
                    const globalId = toGlobalId(item.id, source);
                    const snoozeDate = snoozed[globalId];
                    if (snoozeDate && snoozeDate > today) {
                        item.date = snoozeDate;
                    }
                    return item;
                });
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
