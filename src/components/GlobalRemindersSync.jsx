import { useEffect } from 'react';
import { getBudgetItems, setBudgetItems, getChecklistState, setChecklistState } from '../utils/db';
import { writeReminders } from '../hooks/useReminders';

export function GlobalRemindersSync({ uid }) {
    useEffect(() => {
        if (!uid) return;

        // 1. Fetch on load and populate session storage
        Promise.all([
            getBudgetItems(uid),
            getChecklistState(uid)
        ]).then(([budgetSnap, checklistSnap]) => {
            const allReminders = [];

            if (budgetSnap) {
                const items = Array.isArray(budgetSnap) ? budgetSnap : budgetSnap.items || [];
                items.forEach(i => {
                    if (i.reminder?.date) {
                        allReminders.push({ ...i, _source: 'budget' });
                    }
                });
            }

            if (checklistSnap && checklistSnap.categories) {
                checklistSnap.categories.forEach(c => {
                    if (c.items) {
                        c.items.forEach(i => {
                            if (i.reminder?.date) {
                                allReminders.push({ ...i, _source: 'checklist' });
                            }
                        });
                    }
                });
            }

            // Populate sessionStorage immediately on login
            writeReminders(allReminders);
        }).catch(err => console.error("[GlobalRemindersSync] failed to fetch", err));

        // 2. Global listener to delete from DB if components aren't mounted to do it
        const handleConfirm = async (e) => {
            const { id } = e.detail;
            
            // Give BudgetPlanner/Checklist a chance to handle it synchronously if they are mounted
            // They can set this global flag so we don't interfere
            if (window.__rc_handling_reminder_confirm === id) return;

            try {
                // Try budget
                const bSnap = await getBudgetItems(uid);
                let changedBudget = false;
                let newItems = [];
                if (bSnap) {
                    const items = Array.isArray(bSnap) ? bSnap : bSnap.items || [];
                    newItems = items.map(i => {
                        if (i.id === id && i.reminder) {
                            changedBudget = true;
                            const { reminder, ...rest } = i;
                            return rest;
                        }
                        return i;
                    });
                }
                if (changedBudget) {
                    if (Array.isArray(bSnap)) {
                         await setBudgetItems(uid, newItems, 2, []);
                    } else {
                         await setBudgetItems(uid, newItems, bSnap.householdSize, bSnap.backupSlots);
                    }
                    return; // found and deleted
                }

                // Try checklist
                const cSnap = await getChecklistState(uid);
                if (cSnap && cSnap.categories) {
                    let changedChecklist = false;
                    const cCategories = cSnap.categories.map(c => {
                        if (!c.items) return c;
                        let changedItems = false;
                        const cItems = c.items.map(i => {
                            if (i.id === id && i.reminder) {
                                changedItems = true;
                                changedChecklist = true;
                                const { reminder, ...rest } = i;
                                return rest;
                            }
                            return i;
                        });
                        return changedItems ? { ...c, items: cItems } : c;
                    });
                    if (changedChecklist) {
                        await setChecklistState(uid, { ...cSnap, categories: cCategories });
                    }
                }
            } catch (err) {
                console.error("[GlobalRemindersSync] failed to delete from db", err);
            }
        };

        window.addEventListener('rc-reminder-confirmed', handleConfirm);
        return () => window.removeEventListener('rc-reminder-confirmed', handleConfirm);
    }, [uid]);

    return null;
}
