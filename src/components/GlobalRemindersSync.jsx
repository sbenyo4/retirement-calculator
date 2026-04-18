import { useEffect, useRef } from 'react';
import { getBudgetItems, getChecklistState, getGeneralReminders, setBudgetItems, setChecklistState, setGeneralReminders, getDismissedReminders, dismissReminder, getSmartAlerts, setSmartAlerts } from '../utils/db';
import { syncComponentReminders, syncMultipleSources, markInitialSyncDone } from '../hooks/useReminders';
import { evaluateSmartAlerts } from '../utils/smartAlerts';
import { readAppState } from '../utils/appState';

function dispatchTriggered(triggered) {
    window.dispatchEvent(new CustomEvent('rc-smart-alerts-triggered', { detail: { triggered } }));
}

const LIFE_EVENT_SOURCE_PREFIX = 'lifeEvents:';
const LEGACY_LIFE_EVENT_SOURCE = 'lifeEvents';

function isLifeEventSource(source) {
    return typeof source === 'string' && (source === LEGACY_LIFE_EVENT_SOURCE || source.startsWith(LIFE_EVENT_SOURCE_PREFIX));
}



export function GlobalRemindersSync({ uid, lifeEvents: _lifeEvents = [], currentProfileId, profiles = [], updateProfile }) {
    const lastSyncedUidRef = useRef(null);
    const lastLifeEventSourceRef = useRef(null);

    // 1. Initial Load from DB Sources (Budget, Checklist, General)
    useEffect(() => {
        if (!uid) {
            lastSyncedUidRef.current = null;
            return;
        }
        if (lastSyncedUidRef.current === uid) return;
        lastSyncedUidRef.current = uid;

        const loadChecklistWithRetry = async (attempt = 0) => {
            const snap = await getChecklistState(uid).catch(err => {
                console.error("[Sync] Checklist failed:", err);
                return {};
            });
            const hasCategories = Array.isArray(snap?.categories) && snap.categories.length > 0;
            if (hasCategories) return snap;
            if (attempt >= 4) {
                console.warn("[Sync] Checklist: no categories after 4 retries — checklist reminders may not sync");
                return snap;
            }
            await new Promise(resolve => setTimeout(resolve, 300));
            if (lastSyncedUidRef.current !== uid) return {};
            return loadChecklistWithRetry(attempt + 1);
        };

        setTimeout(() => {
            if (lastSyncedUidRef.current !== uid) return; 
            
            console.log("%c[GlobalRemindersSync] Starting atomic sync for:", "color: #3b82f6; font-weight: bold", uid);

            getDismissedReminders(uid)
                .then((dismissedIds) => {
                    const dismissedSet = new Set(dismissedIds.map(String));

                    return Promise.all([
                        loadChecklistWithRetry(),
                        getGeneralReminders(uid).catch(err => { console.error("[Sync] General failed:", err); return []; }),
                    ]).then(([checklistSnap, generalSnap]) => {
                        const configs = [];

                        // Checklist
                        const checklistReminders = [];
                        if (checklistSnap?.categories) {
                            checklistSnap.categories.forEach(c => {
                                if (c.items) {
                                    c.items.forEach(i => {
                                        if (i.reminder?.date) checklistReminders.push({
                                            id: String(i.id),
                                            label: i.label || i.title,
                                            note: i.note || '',
                                            reminder: { date: i.reminder.date, text: i.reminder.text || '' }
                                        });
                                    });
                                }
                            });
                        }
                        configs.push({ source: 'checklist', items: checklistReminders });

                        // General
                        const generalReminders = (generalSnap || [])
                            .filter(r => !dismissedSet.has(String(r.id)))
                            .map(r => ({
                                id: String(r.id),
                                label: r.label,
                                reminder: { date: r.date, text: r.text || '' }
                            }));
                        configs.push({ source: 'general', items: generalReminders });

                        syncMultipleSources(configs);
                        markInitialSyncDone();
                    });
                })
                .catch(err => {
                    console.error("[GlobalRemindersSync] Atomic sync failed:", err);
                    // Even on failure, unblock alerts so the user isn't stuck with nothing.
                    markInitialSyncDone();
                });
        }, 100);
    }, [uid]);

    useEffect(() => {
        const sourceKey = currentProfileId ? `lifeEvents:${currentProfileId}` : null;
        const currentProfile = currentProfileId ? profiles.find(p => p.id === currentProfileId) : null;
        const profileLifeEvents = Array.isArray(currentProfile?.data?.lifeEvents) ? currentProfile.data.lifeEvents : null;
        const activeLifeEvents = profileLifeEvents
            ? profileLifeEvents.filter(event => event?.enabled !== false && event?.reminder?.date)
            : null;

        // Wait until the active profile data is available so we never sync the
        // previous profile's life events into the new profile's reminder source.
        if (sourceKey && !currentProfile?.data) {
            return;
        }

        let preserved = [];
        try {
            const existing = JSON.parse(sessionStorage.getItem('rc-reminders') || '[]');
            preserved = existing.filter(r => {
                const source = String(r.source || '');
                if (!isLifeEventSource(source)) return true;
                if (!sourceKey) return false;
                return (activeLifeEvents?.length || 0) > 0 && source === sourceKey;
            });
            sessionStorage.setItem('rc-reminders', JSON.stringify(preserved));
        } catch {}

        if (!sourceKey) {
            lastLifeEventSourceRef.current = null;
            window.dispatchEvent(new Event('rc-reminders-updated'));
            return;
        }

        if (!activeLifeEvents || activeLifeEvents.length === 0) {
            window.dispatchEvent(new Event('rc-reminders-updated'));
            return;
        }

        const isFirstForSource = lastLifeEventSourceRef.current !== sourceKey;
        lastLifeEventSourceRef.current = sourceKey;

        syncComponentReminders(sourceKey, activeLifeEvents, !isFirstForSource ? true : false);
    }, [uid, currentProfileId, profiles]);

    // 2. Global listener for confirmation
    useEffect(() => {
        if (!uid) return;

        const handleConfirm = async (e) => {
            const { id, source } = e.detail;
            
            if (window.__rc_handling_reminder_confirm === `${source}-${id}`) return;
            window.__rc_handling_reminder_confirm = `${source}-${id}`;

            try {
                // Budget
                if (!source || source === 'budget') {
                    const bSnap = await getBudgetItems(uid);
                    if (bSnap) {
                        const items = Array.isArray(bSnap) ? bSnap : (bSnap.items || []);
                        const idx = items.findIndex(i => String(i.id) === String(id));
                        if (idx > -1 && items[idx].reminder) {
                            const newItems = [...items];
                            const { reminder: _reminder, ...rest } = newItems[idx];
                            newItems[idx] = rest;
                            await setBudgetItems(uid, newItems, bSnap.householdSize, bSnap.backupSlots);
                        }
                    }
                }

                // Checklist
                if (!source || source === 'checklist') {
                    const cSnap = await getChecklistState(uid);
                    if (cSnap?.categories) {
                        let changed = false;
                        const newCats = cSnap.categories.map(cat => {
                            if (!cat.items) return cat;
                            const itemIdx = cat.items.findIndex(i => String(i.id) === String(id));
                            if (itemIdx > -1 && cat.items[itemIdx].reminder) {
                                changed = true;
                                const newItems = [...cat.items];
                                const { reminder: _reminder, ...rest } = newItems[itemIdx];
                                newItems[itemIdx] = rest;
                                return { ...cat, items: newItems };
                            }
                            return cat;
                        });
                        if (changed) {
                            await setChecklistState(uid, { ...cSnap, categories: newCats });
                        }
                    }
                }

                // General
                if (!source || source === 'general') {
                    const gRems = await getGeneralReminders(uid);
                    const filtered = gRems.filter(r => String(r.id) !== String(id));
                    if (filtered.length !== gRems.length) {
                        await setGeneralReminders(uid, filtered);
                    }
                }

                // Life events are profile-scoped. Only touch the profile that owns the reminder.
                if (isLifeEventSource(source)) {
                    const profileId = source.split(':').slice(1).join(':');
                    const profile = profiles.find(p => p.id === profileId);
                    if (profile?.data?.lifeEvents) {
                        const nextLifeEvents = profile.data.lifeEvents.map(event =>
                            String(event.id) === String(id)
                                ? { ...event, reminder: null }
                                : event
                        );
                        if (updateProfile) {
                            await updateProfile(profileId, { ...profile.data, lifeEvents: nextLifeEvents });
                        }
                    }
                }

                // Only the shared reminder types use the global dismissed list.
                if (!isLifeEventSource(source)) {
                    await dismissReminder(uid, String(id));
                }
            } catch (err) {
                console.error("[GlobalRemindersSync] DB update failed:", err);
            } finally {
                delete window.__rc_handling_reminder_confirm;
            }
        };

        window.addEventListener('rc-reminder-confirmed', handleConfirm);
        return () => window.removeEventListener('rc-reminder-confirmed', handleConfirm);
    }, [uid, profiles, updateProfile]);

    useEffect(() => {
        if (!uid) return;

        const handleEdit = async (e) => {
            const { id, source, date, label, text } = e.detail || {};
            if (!id || !source) return;

            try {
                const nextLabel = typeof label === 'string' ? label : undefined;
                const nextText = typeof text === 'string' ? text : undefined;

                // Budget
                if (source === 'budget') {
                    const bSnap = await getBudgetItems(uid);
                    if (bSnap) {
                        const items = Array.isArray(bSnap) ? bSnap : (bSnap.items || []);
                        const idx = items.findIndex(i => String(i.id) === String(id));
                        if (idx > -1) {
                            const newItems = [...items];
                            const nextItem = { ...newItems[idx] };
                            if (nextLabel !== undefined) nextItem.label = nextLabel;
                            nextItem.reminder = nextText !== undefined
                                ? { ...(nextItem.reminder || {}), date, text: nextText || '' }
                                : { ...(nextItem.reminder || {}), date };
                            newItems[idx] = nextItem;
                            await setBudgetItems(uid, newItems, bSnap.householdSize, bSnap.backupSlots);
                        }
                    }
                }

                // Checklist
                if (source === 'checklist') {
                    const cSnap = await getChecklistState(uid);
                    if (cSnap?.categories) {
                        let changed = false;
                        const newCats = cSnap.categories.map(cat => {
                            if (!cat.items) return cat;
                            let catChanged = false;
                            const newItems = cat.items.map(i => {
                                if (String(i.id) !== String(id)) return i;
                                catChanged = true;
                                changed = true;
                                const nextItem = { ...i };
                                if (nextLabel !== undefined) nextItem.label = nextLabel;
                                nextItem.reminder = nextText !== undefined
                                    ? { ...(nextItem.reminder || {}), date, text: nextText || '' }
                                    : { ...(nextItem.reminder || {}), date };
                                return nextItem;
                            });
                            return catChanged ? { ...cat, items: newItems } : cat;
                        });
                        if (changed) {
                            await setChecklistState(uid, { ...cSnap, categories: newCats });
                        }
                    }
                }

                // General
                if (source === 'general') {
                    const gRems = await getGeneralReminders(uid);
                    const next = gRems.map(r => {
                        if (String(r.id) !== String(id)) return r;
                        const nextRem = { ...r, date };
                        if (nextLabel !== undefined) nextRem.label = nextLabel;
                        if (nextText !== undefined) nextRem.text = nextText || '';
                        return nextRem;
                    });
                    const changed = next.length !== gRems.length ||
                        next.some((r, i) => r.id !== gRems[i]?.id || r.date !== gRems[i]?.date || r.label !== gRems[i]?.label);
                    if (changed) {
                        await setGeneralReminders(uid, next);
                    }
                }

                // Life events are profile-scoped. Only touch the profile that owns the reminder.
                if (isLifeEventSource(source)) {
                    const profileId = source.split(':').slice(1).join(':');
                    const profile = profiles.find(p => p.id === profileId);
                    if (profile?.data?.lifeEvents) {
                        const nextLifeEvents = profile.data.lifeEvents.map(event =>
                            String(event.id) === String(id)
                                ? {
                                    ...event,
                                    ...(nextLabel !== undefined ? { description: nextLabel } : {}),
                                    reminder: nextText !== undefined
                                        ? { ...(event.reminder || {}), date, text: nextText || '' }
                                        : { ...(event.reminder || {}), date }
                                }
                                : event
                        );
                        if (updateProfile) {
                            await updateProfile(profileId, { ...profile.data, lifeEvents: nextLifeEvents });
                        }
                    }
                }
            } catch (err) {
                console.error("[GlobalRemindersSync] Edit DB update failed:", err);
            }
        };

        window.addEventListener('rc-reminder-edited', handleEdit);
        return () => window.removeEventListener('rc-reminder-edited', handleEdit);
    }, [uid, profiles, updateProfile]);

    // Smart alerts: re-evaluate whenever budget sessionStorage changes
    useEffect(() => {
        if (!uid) return;

        const evaluate = () => {
            const appState = readAppState();
            getSmartAlerts(uid).then(alerts => {
                const triggered = evaluateSmartAlerts(alerts, appState);
                dispatchTriggered(triggered);
            }).catch(() => {});
        };

        const disable = async (e) => {
            const { id } = e.detail || {};
            if (!id) return;
            const current = await getSmartAlerts(uid).catch(() => []);
            const next = current.map(a => a.id === id ? { ...a, enabled: false } : a);
            await setSmartAlerts(uid, next).catch(() => {});
            // notify SmartAlertsPanel to refresh its state
            window.dispatchEvent(new CustomEvent('rc-smart-alerts-updated', { detail: { alerts: next } }));
            dispatchTriggered(evaluateSmartAlerts(next, readAppState()));
        };

        evaluate(); // run immediately on mount / uid change
        window.addEventListener('rc-budget-updated', evaluate);
        window.addEventListener('rc-calc-updated', evaluate);
        window.addEventListener('rc-smart-alerts-changed', evaluate);
        window.addEventListener('rc-smart-alert-disable', disable);
        return () => {
            window.removeEventListener('rc-budget-updated', evaluate);
            window.removeEventListener('rc-calc-updated', evaluate);
            window.removeEventListener('rc-smart-alerts-changed', evaluate);
            window.removeEventListener('rc-smart-alert-disable', disable);
        };
    }, [uid]);


    return null;
}
