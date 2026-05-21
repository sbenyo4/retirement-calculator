import { FIXED_BY_DEFAULT_IDS, RET_JSON_START, RET_JSON_END } from './constants';

export const getNowYM = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };

export function defaultIsFixed(item) {
    if (item.type === 'loan') return true;
    return FIXED_BY_DEFAULT_IDS.has(item.id);
}

export function effectiveIsFixed(item) {
    return item.isFixed !== undefined ? item.isFixed : defaultIsFixed(item);
}

export function parseRetirementAdj(text) {
    if (!text) return null;
    const s = text.indexOf(RET_JSON_START);
    const e = text.indexOf(RET_JSON_END);
    if (s === -1 || e === -1) return null;
    try {
        const adj = JSON.parse(text.slice(s + RET_JSON_START.length, e).trim());
        if (!adj || (!adj.additions && !adj.increases)) return null;
        adj.additions = Array.isArray(adj.additions) ? adj.additions : [];
        adj.increases = Array.isArray(adj.increases) ? adj.increases : [];
        return adj;
    } catch { return null; }
}

export function stripRetirementJson(text) {
    if (!text) return text;
    const s = text.indexOf(RET_JSON_START);
    if (s === -1) return text;
    const e = text.indexOf(RET_JSON_END);
    if (e === -1) return text;
    return (text.slice(0, s) + text.slice(e + RET_JSON_END.length)).trim();
}

export function matchIncrease(itemLabel, incLabel) {
    const a = itemLabel.toLowerCase().trim();
    const b = incLabel.toLowerCase().trim();
    return a === b || a.includes(b) || b.includes(a);
}

export function backupAge(savedAt, isHe) {
    const mins = Math.round((Date.now() - savedAt) / 60000);
    if (mins < 1) return isHe ? 'עכשיו' : 'just now';
    if (mins < 60) return isHe ? `לפני ${mins} דק׳` : `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return isHe ? `לפני ${h} שע׳` : `${h}h ago`;
    return isHe ? `לפני ${Math.floor(h / 24)} ימים` : `${Math.floor(h / 24)}d ago`;
}

export const trackActive = (track) => {
    if (!track.endDate) return true;
    const [y, m] = track.endDate.split('-').map(Number);
    return y * 12 + (m - 1) >= getNowYM();
};

export const toMonthly = (item) => {
    if (item.type === 'loan') {
        return (item.tracks || []).filter(trackActive).reduce((s, tr) => s + (tr.amount || 0), 0);
    }
    return item.frequency === 'annual' ? (item.amount || 0) / 12 : (item.amount || 0);
};

export const isBudgetItemPaused = (item) => item?.status === 'paused' || item?.enabled === false;

export function normalizeBudgetItem(item) {
    if (!item) return item;
    const paused = isBudgetItemPaused(item);
    return {
        ...item,
        status: paused ? 'paused' : 'active',
        enabled: !paused
    };
}

export function withReminderPausedState(item, enabled) {
    if (!item) return item;
    const nextEnabled = enabled !== false;
    if (!nextEnabled) {
        if (item.reminder?.date) {
            return {
                ...item,
                status: 'paused',
                enabled: false,
                pausedReminder: { ...item.reminder },
                reminder: undefined
            };
        }
        return { ...item, status: 'paused', enabled: false };
    }

    if (!item.reminder?.date && item.pausedReminder?.date) {
        const { pausedReminder, ...rest } = item;
        return { ...rest, status: 'active', enabled: true, reminder: { ...pausedReminder } };
    }

    const { pausedReminder: _pausedReminder, ...rest } = item;
    return { ...rest, status: 'active', enabled: true };
}

export function mergeBudgetItemUpdate(currentItem, updatedItem) {
    if (!currentItem) return normalizeBudgetItem(updatedItem);
    if (!updatedItem) return normalizeBudgetItem(currentItem);

    const currentPaused = isBudgetItemPaused(currentItem);
    const {
        status: _nextStatus,
        enabled: _nextEnabled,
        pausedReminder: _nextPausedReminder,
        ...restUpdated
    } = updatedItem;

    if (currentPaused) {
        return normalizeBudgetItem({
            ...currentItem,
            ...restUpdated,
            reminder: currentItem.reminder,
            pausedReminder: currentItem.pausedReminder,
            status: currentItem.status,
            enabled: currentItem.enabled,
        });
    }

    return normalizeBudgetItem({
        ...currentItem,
        ...restUpdated,
        status: currentItem.status,
        enabled: currentItem.enabled,
        pausedReminder: currentItem.pausedReminder,
    });
}

export const trackActiveInFuture = (track, projYears) => {
    if (!track.endDate) return true;
    const [y, m] = track.endDate.split('-').map(Number);
    return y * 12 + (m - 1) >= getNowYM() + Math.round(projYears * 12);
};

export const trackActiveInYear = (track, year) => {
    if (!track.endDate) return true;
    return parseInt(track.endDate.split('-')[0]) >= year;
};

export const toProjectedMonthly = (item, projFactor, projYears) => {
    if (item.enabled === false) return 0;
    if (item.type === 'loan') {
        return (item.tracks || [])
            .filter(tr => trackActive(tr) && trackActiveInFuture(tr, projYears))
            .reduce((s, tr) => s + (tr.amount || 0) * (tr.inflationAffected ? projFactor : 1), 0);
    }
    return toMonthly(item) * projFactor;
};

export function genId() {
    return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
