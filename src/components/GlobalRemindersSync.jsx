import { useEffect, useRef } from 'react';
import { getBudgetItems, getChecklistState, getGeneralReminders, setBudgetItems, setChecklistState, setGeneralReminders, getDismissedReminders, dismissReminder } from '../utils/db';
import { syncComponentReminders, syncMultipleSources } from '../hooks/useReminders';

const LIFE_EVENT_SOURCE_PREFIX = 'lifeEvents:';
const LEGACY_LIFE_EVENT_SOURCE = 'lifeEvents';

function isLifeEventSource(source) {
    return typeof source === 'string' && (source === LEGACY_LIFE_EVENT_SOURCE || source.startsWith(LIFE_EVENT_SOURCE_PREFIX));
}

export function GlobalRemindersSync({ uid, lifeEvents = [], currentProfileId, profiles = [], updateProfile }) {
    const lastSyncedUidRef = useRef(null);
    const lastLifeEventSourceRef = useRef(null);

    // 1. Initial Load from DB Sources (Budget, Checklist, General)
    useEffect(() => {
        if (!uid || lastSyncedUidRef.current === uid) return;
        lastSyncedUidRef.current = uid;

        setTimeout(() => {
            if (lastSyncedUidRef.current !== uid) return; 
            
            console.log("%c[GlobalRemindersSync] Starting atomic sync for:", "color: #3b82f6; font-weight: bold", uid);

            getDismissedReminders(uid)
                .then((dismissedIds) => {
                    const dismissedSet = new Set(dismissedIds.map(String));

                    return Promise.all([
                        getChecklistState(uid).catch(err => { console.error("[Sync] Checklist failed:", err); return {}; }),
                        getGeneralReminders(uid).catch(err => { console.error("[Sync] General failed:", err); return []; }),
                    ]).then(([checklistSnap, generalSnap]) => {
                        const configs = [];

                        // Checklist
                        const checklistReminders = [];
                        if (checklistSnap?.categories) {
                            checklistSnap.categories.forEach(c => {
                                if (c.items) {
                                    c.items.forEach(i => {
                                        if (i.reminder?.date && !dismissedSet.has(String(i.id))) checklistReminders.push({
                                            id: String(i.id),
                                            label: i.label || i.title,
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
                    });
                })
                .catch(err => {
                    console.error("[GlobalRemindersSync] Atomic sync failed:", err);
                });
        }, 500); 
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
                            const { reminder, ...rest } = newItems[idx];
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
                                const { reminder, ...rest } = newItems[itemIdx];
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
    }, [uid]);

    return null;
}
