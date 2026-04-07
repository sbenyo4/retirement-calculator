import { useEffect, useRef } from 'react';
import { getBudgetItems, getChecklistState, getGeneralReminders, setBudgetItems, setChecklistState, setGeneralReminders, getDismissedReminders, dismissReminder } from '../utils/db';
import { syncMultipleSources } from '../hooks/useReminders';

export function GlobalRemindersSync({ uid, lifeEvents = [] }) {
    const lastSyncedUidRef = useRef(null);

    // 1. Initial Load from DB Sources (Budget, Checklist, General)
    useEffect(() => {
        if (!uid || lastSyncedUidRef.current === uid) return;
        lastSyncedUidRef.current = uid;

        setTimeout(() => {
            if (lastSyncedUidRef.current !== uid) return; 
            
            console.log("%c[GlobalRemindersSync] Starting atomic sync for:", "color: #3b82f6; font-weight: bold", uid);

            Promise.all([
                getBudgetItems(uid).catch(err => { console.error("[Sync] Budget failed:", err); return { items: [] }; }),
                getChecklistState(uid).catch(err => { console.error("[Sync] Checklist failed:", err); return {}; }),
                getGeneralReminders(uid).catch(err => { console.error("[Sync] General failed:", err); return []; }),
                getDismissedReminders(uid).catch(err => { console.error("[Sync] Dismissed failed:", err); return []; })
            ]).then(([budgetSnap, checklistSnap, generalSnap, dismissedIds]) => {
                const configs = [];
                const dismissedSet = new Set(dismissedIds.map(String));

                // 1a. Budget
                const bItems = Array.isArray(budgetSnap) ? budgetSnap : (budgetSnap?.items || []);
                const budgetReminders = bItems
                    .filter(i => i.reminder?.date && !dismissedSet.has(String(i.id)))
                    .map(i => ({
                        id: String(i.id),
                        label: i.label || i.title || i.id,
                        reminder: { date: i.reminder.date, text: i.reminder.text || '' }
                    }));
                configs.push({ source: 'budget', items: budgetReminders });

                // 1b. Checklist
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

                // 1c. General
                const generalReminders = (generalSnap || [])
                    .filter(r => !dismissedSet.has(String(r.id)))
                    .map(r => ({
                        id: String(r.id),
                        label: r.label,
                        reminder: { date: r.date, text: r.text || '' }
                    }));
                configs.push({ source: 'general', items: generalReminders });

                syncMultipleSources(configs);
            }).catch(err => {
                console.error("[GlobalRemindersSync] Atomic sync failed:", err);
            });
        }, 500); 
    }, [uid]);

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

                // Always add to dismissedReminders to prevent ghost alerts
                await dismissReminder(uid, String(id));
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
