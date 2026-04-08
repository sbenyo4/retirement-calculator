import { useEffect, useRef } from 'react';
import { onBudgetItemsSnapshot } from '../utils/db';
import { syncComponentReminders } from '../hooks/useReminders';

export function BudgetRemindersSync({ uid }) {
    const bootstrappedRef = useRef(false);

    useEffect(() => {
        if (!uid) {
            bootstrappedRef.current = false;
            return;
        }

        const unsubscribe = onBudgetItemsSnapshot(uid, async (budgetSnap) => {
            try {
                const items = Array.isArray(budgetSnap?.items) ? budgetSnap.items : [];
                const budgetReminders = items
                    .filter(i => i?.reminder?.date)
                    .map(i => ({
                        id: String(i.id),
                        label: i.label || i.title || i.id,
                        reminder: { date: i.reminder.date, text: i.reminder.text || '' }
                    }));

                syncComponentReminders('budget', budgetReminders, bootstrappedRef.current);
                bootstrappedRef.current = true;
            } catch (err) {
                console.error('[BudgetRemindersSync] Failed:', err);
            }
        });

        return () => unsubscribe?.();
    }, [uid]);

    return null;
}
