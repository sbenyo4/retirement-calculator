import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, History, Trash2, RotateCcw, TrendingUp, Clock, Loader2, Pencil, Check } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale,
    LineElement, PointElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { useTheme } from '../contexts/ThemeContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useDraggable } from '../hooks/useDraggable';
import { HISTORY_TRACKED_FIELDS, diffProfileData } from '../utils/profileUtils';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend, Filler);

/**
 * Scale a return earned over `months` up to its annual equivalent, compounded.
 * Returns a percentage, or null when the input can't be annualized meaningfully
 * (a wiped-out balance, or a window too short for the extrapolation to mean much).
 */
const annualize = (periodRate, months) => {
    if (periodRate == null || months <= 0.01 || periodRate <= -1) return null;
    return (Math.pow(1 + periodRate, 12 / months) - 1) * 100;
};

/** Keeps a signed number reading left-to-right ("-44,436") inside an RTL table. */
const Num = ({ children }) => <span dir="ltr" className="inline-block">{children}</span>;

/**
 * Green/red by the sign of the value itself — a gain is green even when it fell
 * short of the plan. Falling short is a separate signal, carried by the gap column.
 */
const signColor = (n) => (n == null || isNaN(n) || n === 0) ? '' : n > 0 ? 'text-green-500' : 'text-red-500';

/**
 * One interval of the savings breakdown — also used for the "overall" footer row.
 * The two rate cells are deliberately parallel: the big number in each is the
 * return over THIS interval's length, so they compare directly; the annual figure
 * underneath is the same thing scaled to a year.
 */
function BreakdownRow({ r, className, label, isLight, he, fmtValue, fmtPct, fmtMonths, tr }) {
    const muted = isLight ? 'text-gray-500' : 'text-gray-400';
    // Did the return meet the plan? Only this drives the gap column's color.
    const gapColor = r.met == null ? '' : r.met ? 'text-green-500' : 'text-red-500';
    return (
        <tr className={className}>
            <td className="px-2 py-1.5">
                {label ?? new Date(r.t1).toLocaleDateString(he ? 'he-IL' : 'en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            </td>
            <td className="px-2 py-1.5 text-end"><Num>{fmtMonths(r.months)}</Num></td>
            <td className={`px-2 py-1.5 text-end ${signColor(r.deltaBalance)}`}><Num>{fmtValue(r.deltaBalance)}</Num></td>
            {/* Contributions are always positive — no signal to carry, so no color. */}
            <td className="px-2 py-1.5 text-end"><Num>{fmtValue(r.contributions)}</Num></td>
            <td className={`px-2 py-1.5 text-end ${signColor(r.growth)}`}><Num>{fmtValue(r.growth)}</Num></td>
            <td className={`px-2 py-1.5 text-end font-semibold ${signColor(r.actualPct)}`}>
                <Num>{fmtPct(r.actualPct)}</Num>
                <div className={`font-normal text-[10px] ${muted}`}>
                    <Num>{fmtPct(r.annualizedPct, 1)}</Num> {tr('historyPerYearShort', he ? 'שנתי' : '/yr')}
                </div>
            </td>
            <td className="px-2 py-1.5 text-end">
                <Num>{fmtPct(r.expectedPct, 2, false)}</Num>
                <div className={`text-[10px] ${muted}`}>
                    <Num>{fmtPct(r.plannedPct, 1, false)}</Num> {tr('historyPerYearShort', he ? 'שנתי' : '/yr')}
                </div>
            </td>
            <td className={`px-2 py-1.5 text-end font-semibold ${gapColor}`}>
                <Num>{fmtPct(r.gapPct)}</Num>
                {r.met != null && <span className="ms-1">{r.met ? '✓' : '✗'}</span>}
                <div className={`font-normal text-[10px] ${muted}`}>
                    <Num>{r.gapAmount == null ? '—' : `${r.gapAmount > 0 ? '+' : ''}${fmtValue(r.gapAmount)}`}</Num>
                </div>
            </td>
        </tr>
    );
}

/**
 * ProfileHistoryModal — per-profile change history.
 *   • Timeline: every saved version with exact date+time, change diff, delete + restore.
 *   • Trend:    line chart of a chosen numeric field's value across versions.
 *   • Retention control: cap the number of retained versions, or set unlimited.
 *
 * Opened from the command palette ('open:profileHistory') or the ProfileManager button.
 */
export default function ProfileHistoryModal({
    isOpen, onClose, profileId, profileName,
    getHistory, deleteHistoryEntry, updateHistoryEntry, getHistoryLimit, setHistoryLimit,
    onRestore, language, t,
}) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const he = language === 'he';
    useBodyScrollLock(isOpen);
    const { dragStyle, onDragMouseDown } = useDraggable(isOpen, { constrainToViewport: true });

    const [activeTab, setActiveTab] = useState('timeline');
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [field, setField] = useState(HISTORY_TRACKED_FIELDS[0].key);

    // Inline edit state (edit a version's timestamp and tracked numeric values)
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState(null); // { datetime: string, values: { [field]: string } }

    // Retention control
    const [limitEnabled, setLimitEnabled] = useState(true);
    const [limitValue, setLimitValue] = useState(100);

    const tr = useCallback((key, fallback) => {
        if (!t) return fallback;
        const res = t(key);
        return (!res || res === key) ? fallback : res;
    }, [t]);

    const load = useCallback(async () => {
        if (!profileId) { setEntries([]); return; }
        setLoading(true);
        try {
            const list = await getHistory(profileId);
            setEntries(Array.isArray(list) ? list : []);
        } catch {
            setEntries([]);
        } finally {
            setLoading(false);
        }
    }, [profileId, getHistory]);

    useEffect(() => {
        if (!isOpen) return;
        setActiveTab('timeline');
        setExpandedId(null);
        load();
        // Load retention setting
        (async () => {
            try {
                const lim = await getHistoryLimit();
                if (lim === null || lim === undefined) {
                    setLimitEnabled(false);
                } else {
                    setLimitEnabled(true);
                    setLimitValue(lim);
                }
            } catch { /* keep defaults */ }
        })();
    }, [isOpen, load, getHistoryLimit]);

    // ── Formatting helpers ──────────────────────────────────────────────
    const fmtDateTime = useCallback((ms) => {
        if (!ms) return '';
        try {
            return new Date(ms).toLocaleString(he ? 'he-IL' : 'en-GB', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit',
            });
        } catch {
            return new Date(ms).toISOString();
        }
    }, [he]);

    const fmtValue = useCallback((v) => {
        if (v === null || v === undefined || v === '') return '—';
        const n = parseFloat(v);
        if (isNaN(n)) return String(v);
        if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString();
        return String(Math.round(n * 100) / 100);
    }, []);

    // Resolve a human label for a field key (tracked fields use translations).
    const labelFor = useCallback((key) => {
        const tracked = HISTORY_TRACKED_FIELDS.find(f => f.key === key);
        if (tracked) return tr(tracked.labelKey, key);
        const direct = tr(key, key);
        return direct;
    }, [tr]);

    const summarizeChanges = useCallback((changes) => {
        if (!Array.isArray(changes) || changes.length === 0) return null;
        return changes.map((c) => {
            if (c.nested) return `${labelFor(c.field)}: ${tr('historyChanged', he ? 'שונה' : 'changed')}`;
            return `${labelFor(c.field)}: ${fmtValue(c.from)} → ${fmtValue(c.to)}`;
        });
    }, [labelFor, fmtValue, tr, he]);

    // ── Trend data ──────────────────────────────────────────────────────
    const trendPoints = useMemo(() => {
        const asc = [...entries].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        return asc
            .map(e => ({ t: e.createdAt, v: parseFloat(e.data?.[field]) }))
            .filter(p => !isNaN(p.v));
    }, [entries, field]);

    // Expected savings line — "what it should be" per the plan: takes the FIRST
    // version in time as the baseline (starting balance, monthly contribution,
    // annual return) and projects the expected balance at each later timestamp.
    // Only meaningful for the savings field.
    const expectedPoints = useMemo(() => {
        if (field !== 'currentSavings') return null;
        const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;
        const asc = [...entries]
            .filter(e => !isNaN(parseFloat(e.data?.currentSavings)))
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        if (asc.length < 2) return null;
        const base = asc[0];
        const B0 = parseFloat(base.data?.currentSavings);
        const C = parseFloat(base.data?.monthlyContribution) || 0;
        const r = parseFloat(base.data?.annualReturnRate) || 0;
        // True monthly equivalent of the annual rate, so 12 months compound to
        // exactly r — same convention as the breakdown table below.
        const monthlyRate = Math.pow(1 + r / 100, 1 / 12) - 1;
        const t0 = base.createdAt;
        return asc.map((e) => {
            const m = Math.max(0, (e.createdAt - t0) / MS_PER_MONTH);
            let fv;
            if (monthlyRate === 0) {
                fv = B0 + C * m;
            } else {
                const growth = Math.pow(1 + monthlyRate, m);
                fv = B0 * growth + C * ((growth - 1) / monthlyRate);
            }
            return { t: e.createdAt, v: fv };
        });
    }, [entries, field]);

    const showExpected = field === 'currentSavings' && !!expectedPoints;

    const chartData = useMemo(() => ({
        labels: trendPoints.map(p => new Date(p.t).toLocaleDateString(he ? 'he-IL' : 'en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })),
        datasets: [
            {
                label: tr('historyActual', he ? 'בפועל' : 'Actual'),
                data: trendPoints.map(p => p.v),
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                pointBackgroundColor: '#a855f7',
                pointRadius: 4,
                tension: 0.25,
                fill: true,
            },
            ...(showExpected ? [{
                label: tr('historyExpectedPlan', he ? 'לפי התוכנית' : 'Per plan'),
                data: expectedPoints.map(p => p.v),
                borderColor: '#22c55e',
                backgroundColor: 'transparent',
                pointBackgroundColor: '#22c55e',
                pointRadius: 3,
                borderDash: [6, 4],
                tension: 0.25,
                fill: false,
            }] : []),
        ],
    }), [trendPoints, expectedPoints, showExpected, tr, he]);

    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: showExpected, labels: { color: isLight ? '#475569' : '#cbd5e1', boxWidth: 12, font: { size: 11 } } },
            tooltip: {
                callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${fmtValue(ctx.parsed.y)}`,
                },
            },
        },
        scales: {
            x: { ticks: { color: isLight ? '#475569' : '#94a3b8', maxRotation: 0, autoSkip: true }, grid: { color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' } },
            y: { ticks: { color: isLight ? '#475569' : '#94a3b8', callback: (v) => fmtValue(v) }, grid: { color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' } },
        },
    }), [isLight, fmtValue, showExpected]);

    // ── Savings growth decomposition (only for the currentSavings field) ──
    // For each interval between two saved versions, split the change in savings
    // into contributions (monthly contribution × months elapsed) vs. investment
    // return (the remainder), then express that return BOTH as the actual % for
    // the interval's own length and annualized — so it can be compared like for
    // like against what the planned annual rate implies over that same length.
    //
    // The rate is money-weighted (modified Dietz): contributions trickle in
    // across the interval, so the base they earn on is b0 + contributions/2 —
    // otherwise a month with a big deposit looks like a better return than it was.
    const savingsBreakdown = useMemo(() => {
        if (field !== 'currentSavings') return null;
        const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

        // Return over `months` implied by an annual rate, compounded (0.5% for
        // one month at 6%/yr — not 6%, and not a flat 6/12 either).
        const periodRateFor = (annualPct, months) =>
            (isNaN(annualPct) || months <= 0) ? null : Math.pow(1 + annualPct / 100, months / 12) - 1;

        const asc = [...entries].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        const rows = [];
        for (let i = 1; i < asc.length; i++) {
            const prev = asc[i - 1];
            const cur = asc[i];
            const b0 = parseFloat(prev.data?.currentSavings);
            const b1 = parseFloat(cur.data?.currentSavings);
            if (isNaN(b0) || isNaN(b1)) continue;
            const months = Math.max(0, (cur.createdAt - prev.createdAt) / MS_PER_MONTH);
            const monthlyContribution = parseFloat(prev.data?.monthlyContribution) || 0;
            const contributions = monthlyContribution * months;
            const deltaBalance = b1 - b0;
            const growth = deltaBalance - contributions; // return-driven portion
            const base = b0 + contributions / 2;        // money-weighted base

            const actualRate = base > 0 ? growth / base : null;             // over the interval
            const plannedPct = parseFloat(prev.data?.annualReturnRate);
            const expectedRate = periodRateFor(plannedPct, months);          // over the same interval
            const expectedGrowth = (expectedRate != null && base > 0) ? base * expectedRate : null;

            rows.push({
                t0: prev.createdAt, t1: cur.createdAt, months, b0, b1, deltaBalance, contributions, growth, base,
                actualPct: actualRate == null ? null : actualRate * 100,
                expectedPct: expectedRate == null ? null : expectedRate * 100,
                gapPct: (actualRate == null || expectedRate == null) ? null : (actualRate - expectedRate) * 100,
                gapAmount: (expectedGrowth == null) ? null : growth - expectedGrowth,
                annualizedPct: annualize(actualRate, months),
                plannedPct: isNaN(plannedPct) ? null : plannedPct,
                met: (actualRate == null || expectedRate == null) ? null : actualRate >= expectedRate - 0.0001,
            });
        }
        if (rows.length === 0) return null;

        // Whole-history summary: first saved balance → last, same money-weighting.
        const first = rows[0], last = rows[rows.length - 1];
        const months = rows.reduce((s, r) => s + r.months, 0);
        const contributions = rows.reduce((s, r) => s + r.contributions, 0);
        const growth = last.b1 - first.b0 - contributions;
        const base = first.b0 + contributions / 2;
        const actualRate = base > 0 ? growth / base : null;
        // Planned rate may have changed mid-history — weight each interval by its length.
        const rated = rows.filter(r => r.plannedPct != null && r.months > 0);
        const ratedMonths = rated.reduce((s, r) => s + r.months, 0);
        const plannedPct = ratedMonths > 0
            ? rated.reduce((s, r) => s + r.plannedPct * r.months, 0) / ratedMonths
            : null;
        const expectedRate = plannedPct == null ? null : Math.pow(1 + plannedPct / 100, months / 12) - 1;
        const expectedGrowth = (expectedRate != null && base > 0) ? base * expectedRate : null;
        const total = {
            t0: first.t0, t1: last.t1, months, b0: first.b0, b1: last.b1,
            deltaBalance: last.b1 - first.b0, contributions, growth, base,
            actualPct: actualRate == null ? null : actualRate * 100,
            expectedPct: expectedRate == null ? null : expectedRate * 100,
            gapPct: (actualRate == null || expectedRate == null) ? null : (actualRate - expectedRate) * 100,
            gapAmount: expectedGrowth == null ? null : growth - expectedGrowth,
            annualizedPct: annualize(actualRate, months),
            plannedPct,
            met: (actualRate == null || expectedRate == null) ? null : actualRate >= expectedRate - 0.0001,
        };

        return { rows: [...rows].reverse(), total }; // newest interval first
    }, [entries, field]);

    // `signed` marks a value as a delta (an explicit + reads as "ahead of plan");
    // a plain rate like the planned 6% is shown unsigned.
    const fmtPct = useCallback((n, digits = 2, signed = true) =>
        (n == null || isNaN(n)) ? '—' : `${signed && n > 0 ? '+' : ''}${n.toFixed(digits)}%`, []);
    const fmtMonths = useCallback((m) => m >= 10 ? Math.round(m).toString() : (Math.round(m * 10) / 10).toString(), []);

    // ── Actions ─────────────────────────────────────────────────────────
    const handleDelete = useCallback(async (versionId) => {
        const ok = window.confirm(tr('historyDeleteConfirm', he ? 'למחוק גרסה זו מההיסטוריה?' : 'Delete this version from history?'));
        if (!ok) return;
        setEntries(prev => prev.filter(e => e.id !== versionId)); // optimistic
        try {
            await deleteHistoryEntry(profileId, versionId);
        } catch {
            load(); // revert to server truth on failure
        }
    }, [deleteHistoryEntry, profileId, load, tr, he]);

    const handleRestore = useCallback((entry) => {
        const ok = window.confirm(tr('historyRestoreConfirm', he
            ? 'לשחזר את הערכים מגרסה זו לטופס? השינוי יסומן כלא-שמור עד שתעדכן את הפרופיל.'
            : 'Restore this version\'s values into the form? It will show as unsaved until you update the profile.'));
        if (!ok) return;
        if (onRestore && entry?.data) onRestore(entry.data);
        onClose();
    }, [onRestore, onClose, tr, he]);

    const persistLimit = useCallback(async (enabled, value) => {
        try {
            await setHistoryLimit(enabled ? value : null);
        } catch { /* ignore */ }
    }, [setHistoryLimit]);

    // ── Inline edit (timestamp + tracked values) ────────────────────────
    // datetime-local <-> epoch ms, interpreted in the viewer's local timezone.
    const msToLocalInput = useCallback((ms) => {
        const d = new Date(ms || Date.now());
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }, []);

    const startEdit = useCallback((entry) => {
        setExpandedId(null);
        const values = {};
        HISTORY_TRACKED_FIELDS.forEach((f) => {
            const v = entry.data?.[f.key];
            values[f.key] = (v === undefined || v === null) ? '' : String(v);
        });
        setEditForm({ datetime: msToLocalInput(entry.createdAt), values });
        setEditingId(entry.id);
    }, [msToLocalInput]);

    const cancelEdit = useCallback(() => { setEditingId(null); setEditForm(null); }, []);

    const saveEdit = useCallback(async (entry) => {
        if (!editForm) return;
        const parsedMs = new Date(editForm.datetime).getTime();
        const newCreatedAt = isNaN(parsedMs) ? (entry.createdAt || Date.now()) : parsedMs;

        const newData = { ...(entry.data || {}) };
        HISTORY_TRACKED_FIELDS.forEach((f) => {
            const raw = editForm.values[f.key];
            if (raw === '' || raw == null) return; // leave field unchanged
            const n = parseFloat(raw);
            if (!isNaN(n)) newData[f.key] = n;
        });

        // Recompute this entry's change summary against the version that now
        // precedes it in time (order may shift if the timestamp changed).
        const updatedList = entries.map((e) => e.id === entry.id ? { ...e, createdAt: newCreatedAt, data: newData } : e);
        const asc = [...updatedList].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        const idx = asc.findIndex((e) => e.id === entry.id);
        const changes = diffProfileData(idx > 0 ? asc[idx - 1].data : null, newData);

        const patch = { createdAt: newCreatedAt, data: newData, changes, edited: true, editedAt: Date.now() };

        // Optimistic update + re-sort newest first
        setEntries((prev) => prev
            .map((e) => e.id === entry.id ? { ...e, ...patch } : e)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
        setEditingId(null);
        setEditForm(null);

        try {
            await updateHistoryEntry(profileId, entry.id, patch);
        } catch {
            load(); // revert to server truth on failure
        }
    }, [editForm, entries, updateHistoryEntry, profileId, load]);

    if (!isOpen) return null;

    const tabCls = (id) => `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        activeTab === id
            ? 'bg-purple-600 text-white'
            : (isLight ? 'text-gray-600 hover:bg-gray-200' : 'text-gray-300 hover:bg-white/10')
    }`;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100000] p-4">
            <div
                data-draggable-modal
                className={`relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden ${
                    isLight ? 'bg-white ring-1 ring-gray-300 text-gray-900' : 'ring-1 ring-white/30 text-white'
                }`}
                dir={he ? 'rtl' : 'ltr'}
                style={dragStyle}
            >
                {!isLight && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                        <div className="absolute inset-0 bg-white/10" />
                    </>
                )}
                <div className="relative z-10 p-5 max-h-[88vh] overflow-y-auto custom-scrollbar">
                    {/* Header (drag handle) */}
                    <div className="flex items-center justify-between mb-3 cursor-grab active:cursor-grabbing" onMouseDown={onDragMouseDown}>
                        <div className="flex items-center gap-2 min-w-0">
                            <History size={18} className="text-purple-400 shrink-0" />
                            <h2 className="text-base font-bold truncate">
                                {tr('changeHistory', he ? 'היסטוריית שינויים' : 'Change History')}
                                {profileName ? ` — ${profileName}` : ''}
                            </h2>
                        </div>
                        <button onClick={onClose} className={`transition-colors shrink-0 ${isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-400 hover:text-gray-200'}`}>
                            <X size={18} />
                        </button>
                    </div>

                    {!profileId ? (
                        <div className={`py-12 text-center text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                            {tr('historyNoProfile', he ? 'טען או שמור פרופיל כדי לראות היסטוריית שינויים.' : 'Load or save a profile to see its change history.')}
                        </div>
                    ) : (
                        <>
                            {/* Tabs */}
                            <div className={`flex gap-1 mb-4 p-1 rounded-xl w-fit ${isLight ? 'bg-gray-100' : 'bg-black/20'}`}>
                                <button className={tabCls('timeline')} onClick={() => setActiveTab('timeline')}>
                                    <span className="inline-flex items-center gap-1.5"><Clock size={14} />{tr('historyTimeline', he ? 'ציר זמן' : 'Timeline')}</span>
                                </button>
                                <button className={tabCls('trend')} onClick={() => setActiveTab('trend')}>
                                    <span className="inline-flex items-center gap-1.5"><TrendingUp size={14} />{tr('historyTrend', he ? 'מגמה' : 'Trend')}</span>
                                </button>
                            </div>

                            {loading ? (
                                <div className="py-12 flex items-center justify-center">
                                    <Loader2 size={22} className="animate-spin text-purple-400" />
                                </div>
                            ) : entries.length === 0 ? (
                                <div className={`py-12 text-center text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                    {tr('historyEmpty', he ? 'אין עדיין היסטוריה. שמור או עדכן את הפרופיל כדי לתעד שינויים.' : 'No history yet. Save or update the profile to record changes.')}
                                </div>
                            ) : activeTab === 'timeline' ? (
                                <ul className="space-y-2">
                                    {entries.map((entry) => {
                                        const summary = summarizeChanges(entry.changes);
                                        const isCreated = entry.source === 'save' || !summary;
                                        const expanded = expandedId === entry.id;
                                        return (
                                            <li key={entry.id} className={`rounded-xl border ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/10 bg-white/5'} p-3`}>
                                                {editingId === entry.id && editForm ? (
                                                    /* Edit mode: timestamp + tracked values */
                                                    <div className="w-full space-y-2" dir={he ? 'rtl' : 'ltr'}>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <label className={`text-xs ${isLight ? 'text-gray-600' : 'text-gray-300'}`}>
                                                                {tr('historyDateTime', he ? 'תאריך ושעה' : 'Date & time')}
                                                            </label>
                                                            <input
                                                                type="datetime-local"
                                                                value={editForm.datetime}
                                                                onChange={(e) => setEditForm(f => ({ ...f, datetime: e.target.value }))}
                                                                className={`rounded-lg py-1 px-2 text-xs outline-none ${isLight ? 'bg-white border border-gray-300 text-gray-900' : 'bg-black/30 border border-white/20 text-white'}`}
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {HISTORY_TRACKED_FIELDS.map((f) => (
                                                                <label key={f.key} className="flex flex-col gap-0.5 text-[11px]">
                                                                    <span className={`truncate ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>{labelFor(f.key)}</span>
                                                                    <input
                                                                        type="number"
                                                                        step="any"
                                                                        value={editForm.values[f.key] ?? ''}
                                                                        onChange={(e) => setEditForm(fm => ({ ...fm, values: { ...fm.values, [f.key]: e.target.value } }))}
                                                                        className={`rounded py-1 px-2 outline-none ${isLight ? 'bg-white border border-gray-300 text-gray-900' : 'bg-black/30 border border-white/20 text-white'}`}
                                                                    />
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <div className="flex justify-end gap-1">
                                                            <button
                                                                onClick={() => saveEdit(entry)}
                                                                title={tr('save', he ? 'שמור' : 'Save')}
                                                                className="p-1.5 rounded-lg bg-green-500/20 text-green-500 hover:bg-green-500/30 transition-colors"
                                                            >
                                                                <Check size={15} />
                                                            </button>
                                                            <button
                                                                onClick={cancelEdit}
                                                                title={tr('cancel', he ? 'ביטול' : 'Cancel')}
                                                                className={`p-1.5 rounded-lg transition-colors ${isLight ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                                                            >
                                                                <X size={15} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-sm font-semibold">{fmtDateTime(entry.createdAt)}</span>
                                                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${isCreated ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'}`}>
                                                                {isCreated ? tr('historyCreated', he ? 'נוצר' : 'Created') : tr('historyUpdated', he ? 'עודכן' : 'Updated')}
                                                            </span>
                                                            {entry.edited && (
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${isLight ? 'bg-gray-200 text-gray-500' : 'bg-white/10 text-gray-400'}`}>
                                                                    {tr('historyEdited', he ? 'נערך' : 'edited')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {summary && (
                                                            <div className={`mt-1 text-xs ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                                                                {(expanded ? summary : summary.slice(0, 2)).map((line, i) => (
                                                                    <div key={i} className="truncate">{line}</div>
                                                                ))}
                                                                {summary.length > 2 && (
                                                                    <button
                                                                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                                                                        className="text-purple-400 hover:text-purple-300 mt-0.5"
                                                                    >
                                                                        {expanded
                                                                            ? tr('showLess', he ? 'הצג פחות' : 'Show less')
                                                                            : `+${summary.length - 2} ${tr('historyMore', he ? 'שינויים נוספים' : 'more')}`}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            onClick={() => startEdit(entry)}
                                                            title={tr('historyEdit', he ? 'ערוך גרסה' : 'Edit version')}
                                                            className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
                                                        >
                                                            <Pencil size={15} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleRestore(entry)}
                                                            title={tr('historyRestore', he ? 'שחזר גרסה' : 'Restore version')}
                                                            className="p-1.5 rounded-lg bg-yellow-500/15 text-yellow-500 hover:bg-yellow-500/25 transition-colors"
                                                        >
                                                            <RotateCcw size={15} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(entry.id)}
                                                            title={tr('delete', he ? 'מחק' : 'Delete')}
                                                            className="p-1.5 rounded-lg bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-colors"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                /* Trend tab */
                                <div>
                                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                                        <label className={`text-sm ${isLight ? 'text-gray-600' : 'text-gray-300'}`}>
                                            {tr('historyField', he ? 'שדה' : 'Field')}:
                                        </label>
                                        <select
                                            value={field}
                                            onChange={e => setField(e.target.value)}
                                            className={`rounded-lg py-1.5 px-3 text-sm outline-none ${isLight ? 'bg-white border border-gray-300 text-gray-900' : 'bg-black/30 border border-white/20 text-white'}`}
                                        >
                                            {HISTORY_TRACKED_FIELDS.map(f => (
                                                <option key={f.key} value={f.key}>{labelFor(f.key)}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {trendPoints.length === 0 ? (
                                        <div className={`py-10 text-center text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                            {tr('historyNoTrend', he ? 'אין מספיק נתונים להצגת מגמה עבור שדה זה.' : 'Not enough data to chart this field yet.')}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="h-56">
                                                <Line data={chartData} options={chartOptions} />
                                            </div>
                                            {field === 'currentSavings' && savingsBreakdown ? (
                                                <>
                                                    <p className={`mt-3 mb-1.5 text-xs ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                                        {tr('historySavingsBreakdownDesc', he
                                                            ? 'פירוק עליית החיסכון בין שמירות: כמה מהעלייה מקורו בהפקדות וכמה בתשואה בפועל — והתשואה שהושגה בפועל באותו פרק זמן מול מה שהתוכנית מבטיחה לאותו פרק זמן.'
                                                            : 'Breakdown of savings growth between saves: how much came from contributions vs. actual return — and the return actually earned over that span against what the plan implies for the same span.')}
                                                    </p>
                                                    <div className={`rounded-lg overflow-x-auto border ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
                                                        <table className="w-full text-[11px] whitespace-nowrap">
                                                            <thead className={isLight ? 'bg-gray-100 text-gray-600' : 'bg-white/5 text-gray-400'}>
                                                                <tr>
                                                                    <th className="text-start px-2 py-1.5">{tr('historyPeriodEnd', he ? 'עד תאריך' : 'Up to')}</th>
                                                                    <th className="text-end px-2 py-1.5">{tr('historyMonths', he ? 'חודשים' : 'Months')}</th>
                                                                    <th className="text-end px-2 py-1.5">{tr('historyDeltaSavings', he ? 'Δ חיסכון' : 'Δ Savings')}</th>
                                                                    <th className="text-end px-2 py-1.5">{tr('monthlyContribution', he ? 'הפקדות' : 'Contributions')}</th>
                                                                    <th className="text-end px-2 py-1.5">{tr('historyReturnAmount', he ? 'תשואה ₪' : 'Return ₪')}</th>
                                                                    <th className="text-end px-2 py-1.5">{tr('historyActualForPeriod', he ? 'בפועל לתקופה' : 'Actual, this span')}</th>
                                                                    <th className="text-end px-2 py-1.5">{tr('historyExpectedForPeriod', he ? 'צפוי לתקופה' : 'Expected, same span')}</th>
                                                                    <th className="text-end px-2 py-1.5">{tr('historyGap', he ? 'פער' : 'Gap')}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {savingsBreakdown.rows.map((r, i) => (
                                                                    <BreakdownRow
                                                                        key={i} r={r} isLight={isLight} he={he}
                                                                        fmtValue={fmtValue} fmtPct={fmtPct} fmtMonths={fmtMonths} tr={tr}
                                                                        className={isLight ? 'border-t border-gray-100' : 'border-t border-white/5'}
                                                                    />
                                                                ))}
                                                            </tbody>
                                                            {savingsBreakdown.rows.length > 1 && (
                                                                <tfoot>
                                                                    <BreakdownRow
                                                                        r={savingsBreakdown.total} isLight={isLight} he={he}
                                                                        fmtValue={fmtValue} fmtPct={fmtPct} fmtMonths={fmtMonths} tr={tr}
                                                                        label={tr('historyTotalSinceStart', he ? 'סה״כ' : 'Overall')}
                                                                        className={`font-semibold border-t-2 ${isLight ? 'border-gray-300 bg-gray-50' : 'border-white/20 bg-white/5'}`}
                                                                    />
                                                                </tfoot>
                                                            )}
                                                        </table>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className={`mt-3 rounded-lg overflow-hidden border ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
                                                    <table className="w-full text-xs">
                                                        <thead className={isLight ? 'bg-gray-100 text-gray-600' : 'bg-white/5 text-gray-400'}>
                                                            <tr>
                                                                <th className="text-start px-3 py-1.5">{tr('historyDate', he ? 'תאריך' : 'Date')}</th>
                                                                <th className="text-end px-3 py-1.5">{labelFor(field)}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {[...trendPoints].reverse().map((p, i) => (
                                                                <tr key={i} className={isLight ? 'border-t border-gray-100' : 'border-t border-white/5'}>
                                                                    <td className="px-3 py-1.5">{fmtDateTime(p.t)}</td>
                                                                    <td className="px-3 py-1.5 text-end font-medium">{fmtValue(p.v)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Retention control */}
                            <div className={`mt-4 pt-3 border-t ${isLight ? 'border-gray-200' : 'border-white/10'} flex items-center gap-3 flex-wrap text-sm`}>
                                <span className={isLight ? 'text-gray-600' : 'text-gray-400'}>
                                    {tr('historyRetention', he ? 'שמירת גרסאות:' : 'Keep versions:')}
                                </span>
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!limitEnabled}
                                        onChange={(e) => {
                                            const unlimited = e.target.checked;
                                            setLimitEnabled(!unlimited);
                                            persistLimit(!unlimited, limitValue);
                                        }}
                                    />
                                    <span>{tr('historyUnlimited', he ? 'ללא הגבלה' : 'Unlimited')}</span>
                                </label>
                                {limitEnabled && (
                                    <input
                                        type="number"
                                        min="1"
                                        value={limitValue}
                                        onChange={(e) => setLimitValue(Math.max(1, parseInt(e.target.value) || 1))}
                                        onBlur={() => persistLimit(true, limitValue)}
                                        className={`w-20 rounded-lg py-1 px-2 text-sm outline-none ${isLight ? 'bg-white border border-gray-300' : 'bg-black/30 border border-white/20 text-white'}`}
                                    />
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
