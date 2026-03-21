import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, BarChart2, TrendingDown, TrendingUp, Plus, Trash2 } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement,
    LineElement, PointElement, Title, Tooltip, Legend
} from 'chart.js';
import { useTheme } from '../contexts/ThemeContext';
import { calculateRetirementProjection } from '../utils/calculator';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

let _nextId = 1;
const uid = () => _nextId++;

/**
 * CrashAnalysisModal — two-tab crash analysis:
 *   • Year Sweep:  auto-sweeps every crash year, plots final balance vs baseline
 *   • Compare:     user-defined table of scenarios (year × depth × recovery years)
 *
 * Props:
 *   isOpen         — boolean
 *   onClose        — () => void
 *   analysisInputs — full inputs merged with current scenario form state
 *   language       — 'he' | 'en'
 */
export default function CrashAnalysisModal({ isOpen, onClose, analysisInputs, language }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const he = language === 'he';

    const [activeTab, setActiveTab] = useState('sweep');

    // ── Sweep state ────────────────────────────────────────────────────────
    const [sweepResults, setSweepResults] = useState(null);
    const [isSweeping, setIsSweeping] = useState(false);

    // ── Compare state ──────────────────────────────────────────────────────
    const [compareRows, setCompareRows] = useState([]);
    const [compareResults, setCompareResults] = useState(null);
    const [isComparing, setIsComparing] = useState(false);
    const compareInitRef = useRef(false);
    const compareDebounceRef = useRef(null);

    const currentYear = new Date().getFullYear();

    const retirementStartYear = useMemo(() => {
        const age = parseFloat(analysisInputs?.currentAge) || 30;
        const retAge = parseFloat(analysisInputs?.retirementStartAge) || 50;
        return currentYear + Math.round(retAge - age);
    }, [analysisInputs, currentYear]);

    const retirementEndYear = useMemo(() => {
        const age = parseFloat(analysisInputs?.currentAge) || 30;
        const endAge = parseFloat(analysisInputs?.retirementEndAge) || 65;
        return currentYear + Math.round(endAge - age);
    }, [analysisInputs, currentYear]);

    // ── Helpers ────────────────────────────────────────────────────────────
    const fmt = (v) => {
        if (Math.abs(v) >= 1_000_000) return `₪${(v / 1_000_000).toFixed(2)}M`;
        if (Math.abs(v) >= 1_000)     return `₪${(v / 1_000).toFixed(0)}K`;
        return `₪${Math.round(v).toLocaleString()}`;
    };
    const fmtDiff = (pct) => `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;

    // ── Sweep logic ────────────────────────────────────────────────────────
    const runSweep = useCallback(() => {
        setIsSweeping(true);
        setSweepResults(null);
        setTimeout(() => {
            try {
                const baseline = calculateRetirementProjection({ ...analysisInputs, scenarioEnabled: false });
                const baseBalance = baseline.balanceAtEnd;
                const sweep = [];
                for (let year = currentYear; year <= retirementEndYear - 1; year++) {
                    try {
                        const r = calculateRetirementProjection({
                            ...analysisInputs, scenarioEnabled: true,
                            scenario: { ...analysisInputs.scenario, startYear: year }
                        });
                        const diff = r.balanceAtEnd - baseBalance;
                        sweep.push({
                            year, balance: r.balanceAtEnd, diff,
                            pctDiff: baseBalance > 0 ? (diff / baseBalance) * 100 : 0,
                            isPreRetirement: year < retirementStartYear
                        });
                    } catch {
                        sweep.push({ year, balance: 0, diff: -baseBalance, pctDiff: -100,
                            isPreRetirement: year < retirementStartYear, error: true });
                    }
                }
                setSweepResults({ baseline: baseBalance, sweep });
            } catch (e) { console.error('Sweep failed:', e); }
            setIsSweeping(false);
        }, 50);
    }, [analysisInputs, currentYear, retirementEndYear, retirementStartYear]);

    // ── Compare logic ──────────────────────────────────────────────────────
    const buildDefaultRows = useCallback(() => {
        const s = analysisInputs?.scenario || {};
        const depth = s.crashDepth ?? -20;
        const recYears = s.recoveryYears ?? 5;
        return [
            { id: uid(), year: currentYear,              depth, recYears },
            { id: uid(), year: retirementStartYear - 1,  depth, recYears },
            { id: uid(), year: retirementStartYear,      depth, recYears },
            { id: uid(), year: retirementStartYear + 3,  depth, recYears },
        ].filter(r => r.year >= currentYear && r.year < retirementEndYear);
    }, [analysisInputs, currentYear, retirementStartYear, retirementEndYear]);

    const runCompare = useCallback((rows) => {
        if (!rows.length) return;
        setIsComparing(true);
        setTimeout(() => {
            try {
                const baseline = calculateRetirementProjection({ ...analysisInputs, scenarioEnabled: false });
                const baseBalance = baseline.balanceAtEnd;
                const results = rows.map(row => {
                    try {
                        const r = calculateRetirementProjection({
                            ...analysisInputs, scenarioEnabled: true,
                            scenario: {
                                ...analysisInputs.scenario,
                                startYear: row.year,
                                crashDepth: row.depth,
                                recoveryYears: row.recYears
                            }
                        });
                        const diff = r.balanceAtEnd - baseBalance;
                        return { id: row.id, balance: r.balanceAtEnd, diff,
                            pctDiff: baseBalance > 0 ? (diff / baseBalance) * 100 : 0 };
                    } catch {
                        return { id: row.id, balance: 0, diff: -baseBalance, pctDiff: -100, error: true };
                    }
                });
                setCompareResults({ baseline: baseBalance, results });
            } catch (e) { console.error('Compare failed:', e); }
            setIsComparing(false);
        }, 10);
    }, [analysisInputs]);

    // Reset when closed
    useEffect(() => {
        if (!isOpen) {
            setSweepResults(null);
            setCompareResults(null);
            compareInitRef.current = false;
            setActiveTab('sweep');
            return;
        }
        runSweep();
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // Init compare rows on first tab visit
    useEffect(() => {
        if (activeTab !== 'compare' || compareInitRef.current) return;
        compareInitRef.current = true;
        setCompareRows(buildDefaultRows());
    }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounced auto-run compare when rows change
    useEffect(() => {
        if (activeTab !== 'compare' || !compareRows.length) return;
        clearTimeout(compareDebounceRef.current);
        compareDebounceRef.current = setTimeout(() => runCompare(compareRows), 400);
        return () => clearTimeout(compareDebounceRef.current);
    }, [compareRows, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Row mutation helpers ───────────────────────────────────────────────
    const updateRow = (id, field, value) =>
        setCompareRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    const removeRow = (id) =>
        setCompareRows(prev => prev.filter(r => r.id !== id));
    const addRow = () => {
        const s = analysisInputs?.scenario || {};
        setCompareRows(prev => [...prev, {
            id: uid(),
            year: s.startYear ?? currentYear,
            depth: s.crashDepth ?? -20,
            recYears: s.recoveryYears ?? 5
        }]);
    };

    // ── Chart data ─────────────────────────────────────────────────────────
    const sweepChartData = useMemo(() => {
        if (!sweepResults) return null;
        const { baseline, sweep } = sweepResults;
        return {
            labels: sweep.map(r => String(r.year)),
            datasets: [
                {
                    type: 'bar', label: he ? 'יתרה סופית' : 'Final Balance',
                    data: sweep.map(r => r.balance),
                    backgroundColor: sweep.map(r => r.balance >= baseline ? 'rgba(34,197,94,0.65)' : 'rgba(239,68,68,0.65)'),
                    borderColor:     sweep.map(r => r.balance >= baseline ? 'rgba(34,197,94,1)'    : 'rgba(239,68,68,1)'),
                    borderWidth: 1, borderRadius: 3, order: 2
                },
                {
                    type: 'line', label: he ? 'ללא קריסה' : 'No crash',
                    data: Array(sweep.length).fill(baseline),
                    borderColor: 'rgba(251,191,36,0.9)', borderWidth: 2,
                    borderDash: [6, 3], pointRadius: 0, fill: false, order: 1
                }
            ]
        };
    }, [sweepResults, he]);

    const compareChartData = useMemo(() => {
        if (!compareResults || !compareRows.length) return null;
        const { baseline, results } = compareResults;
        const labels = compareRows.map(r => `${r.year} -${Math.abs(r.depth)}%`);
        return {
            labels,
            datasets: [
                {
                    type: 'bar', label: he ? 'יתרה סופית' : 'Final Balance',
                    data: results.map(r => r.balance),
                    backgroundColor: results.map(r => r.balance >= baseline ? 'rgba(34,197,94,0.65)' : 'rgba(239,68,68,0.65)'),
                    borderColor:     results.map(r => r.balance >= baseline ? 'rgba(34,197,94,1)'    : 'rgba(239,68,68,1)'),
                    borderWidth: 1, borderRadius: 3, order: 2
                },
                {
                    type: 'line', label: he ? 'ללא קריסה' : 'No crash',
                    data: Array(results.length).fill(baseline),
                    borderColor: 'rgba(251,191,36,0.9)', borderWidth: 2,
                    borderDash: [6, 3], pointRadius: 0, fill: false, order: 1
                }
            ]
        };
    }, [compareResults, compareRows, he]);

    const makeChartOptions = useCallback((getTooltipItems) => {
        const textColor = isLight ? '#374151' : '#d1d5db';
        const gridColor = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)';
        return {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    filter: (item) => item.datasetIndex === 0,
                    callbacks: {
                        title: (items) => getTooltipItems(items[0]?.dataIndex)?.title ?? '',
                        label: (item)  => getTooltipItems(item.dataIndex)?.lines ?? []
                    }
                }
            },
            scales: {
                x: { ticks: { color: textColor, font: { size: 9 } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, font: { size: 10 }, callback: (v) => fmt(v) }, grid: { color: gridColor } }
            }
        };
    }, [isLight]); // eslint-disable-line react-hooks/exhaustive-deps

    const sweepOptions = useMemo(() => makeChartOptions((idx) => {
        const r = sweepResults?.sweep[idx];
        if (!r) return null;
        const sign = r.diff >= 0 ? '+' : '';
        const phase = r.isPreRetirement ? (he ? ' (צבירה)' : ' (accum.)') : (he ? ' (פרישה)' : ' (retire.)');
        return {
            title: `${r.year}${phase}`,
            lines: [
                `${he ? 'יתרה' : 'Balance'}: ${fmt(r.balance)}`,
                `${he ? 'הפרש' : 'Diff'}: ${sign}${fmt(r.diff)} (${sign}${r.pctDiff.toFixed(1)}%)`
            ]
        };
    }), [makeChartOptions, sweepResults, he]); // eslint-disable-line react-hooks/exhaustive-deps

    const compareOptions = useMemo(() => makeChartOptions((idx) => {
        const row = compareRows[idx];
        const res = compareResults?.results[idx];
        if (!row || !res) return null;
        const sign = res.diff >= 0 ? '+' : '';
        const isPreRet = row.year < retirementStartYear;
        const phase = isPreRet ? (he ? ' (צבירה)' : ' (accum.)') : (he ? ' (פרישה)' : ' (retire.)');
        return {
            title: `${row.year}${phase}`,
            lines: [
                `${he ? 'יתרה' : 'Balance'}: ${fmt(res.balance)}`,
                `${he ? 'הפרש' : 'Diff'}: ${sign}${fmt(res.diff)} (${sign}${res.pctDiff.toFixed(1)}%)`
            ]
        };
    }), [makeChartOptions, compareRows, compareResults, retirementStartYear, he]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Sweep stats ────────────────────────────────────────────────────────
    const sweepStats = useMemo(() => {
        if (!sweepResults?.sweep?.length) return null;
        const { sweep, baseline } = sweepResults;
        const valid = sweep.filter(r => !r.error);
        if (!valid.length) return null;
        const best  = valid.reduce((a, b) => b.balance > a.balance ? b : a, valid[0]);
        const worst = valid.reduce((a, b) => b.balance < a.balance ? b : a, valid[0]);
        return { best, worst, aboveCount: valid.filter(r => r.balance >= baseline).length, total: valid.length, baseline };
    }, [sweepResults]);

    // ── Styling helpers ────────────────────────────────────────────────────
    const scenario = analysisInputs?.scenario || {};
    const recoveryLabel = scenario.recoveryMode === 'value'
        ? (he ? 'ערך חוזר' : 'Value') : (he ? 'שיעור חוזר' : 'Rate');

    const tabCls = (tab) => `px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        activeTab === tab
            ? 'bg-orange-500 text-white'
            : (isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-white/10')
    }`;

    const inputCls = `w-full px-1.5 py-1 text-xs rounded border text-center ${
        isLight ? 'bg-white border-gray-300 text-gray-800' : 'bg-black/30 border-white/20 text-white'
    }`;

    const legendItem = (color, label) => (
        <span className="flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 rounded-sm ${color}`} />
            {label}
        </span>
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100000] p-4">
            <div
                className={`relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden ${
                    isLight ? 'bg-white border border-gray-200 text-gray-900' : 'border border-white/30 text-white'
                }`}
                dir={he ? 'rtl' : 'ltr'}
            >
                {!isLight && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                        <div className="absolute inset-0 bg-white/10" />
                    </>
                )}
                <div className="relative z-10 p-5 max-h-[88vh] overflow-y-auto">

                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <BarChart2 size={18} className="text-orange-400" />
                            <h2 className="text-base font-bold">{he ? 'ניתוח קריסות' : 'Crash Analysis'}</h2>
                        </div>
                        <button onClick={onClose} className={`transition-colors ${isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-400 hover:text-gray-200'}`}>
                            <X size={18} />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className={`flex gap-1 mb-3 p-1 rounded-xl w-fit ${isLight ? 'bg-gray-100' : 'bg-black/20'}`}>
                        <button className={tabCls('sweep')} onClick={() => setActiveTab('sweep')}>
                            {he ? 'סריקת שנים' : 'Year Sweep'}
                        </button>
                        <button className={tabCls('compare')} onClick={() => setActiveTab('compare')}>
                            {he ? 'השוואת תרחישים' : 'Compare'}
                        </button>
                    </div>

                    {/* Scenario summary strip */}
                    <div className={`flex flex-wrap gap-3 mb-3 text-xs px-3 py-2 rounded-lg ${isLight ? 'bg-gray-50 text-gray-600' : 'bg-black/20 text-gray-400'}`}>
                        <span>{he ? 'ירידה:' : 'Drop:'} <strong dir="ltr">{Math.abs(scenario.crashDepth ?? 40)}%</strong></span>
                        <span>{he ? 'התאוששות:' : 'Recovery:'} <strong>{scenario.recoveryYears ?? 5} {he ? 'שנים' : 'yrs'}</strong></span>
                        <span>{he ? 'מודל:' : 'Mode:'} <strong>{recoveryLabel}</strong></span>
                        {analysisInputs?.enableBuckets && (
                            <span>{he ? 'דלי בטוח:' : 'Safe:'}{' '}
                                <strong>{scenario.affectsSafeBucket ? (he ? 'מושפע' : 'affected') : (he ? 'מוגן' : 'shielded')}</strong>
                            </span>
                        )}
                    </div>

                    {/* ════════════ SWEEP TAB ════════════ */}
                    {activeTab === 'sweep' && (
                        <>
                            <div className={`rounded-xl p-3 mb-3 ${isLight ? 'bg-gray-50' : 'bg-black/20'}`} style={{ height: 220 }}>
                                {isSweeping
                                    ? <div className="flex items-center justify-center h-full text-sm text-gray-400">{he ? 'מחשב...' : 'Calculating...'}</div>
                                    : sweepChartData && <Bar data={sweepChartData} options={sweepOptions} />
                                }
                            </div>

                            {/* Legend */}
                            <div className="flex gap-4 mb-3 text-xs px-1">
                                {legendItem('bg-green-500 opacity-75', he ? 'מעל baseline' : 'Above baseline')}
                                {legendItem('bg-red-500 opacity-75', he ? 'מתחת ל-baseline' : 'Below baseline')}
                                <span className="flex items-center gap-1.5">
                                    <span className="inline-block w-6 border-t-2 border-dashed border-yellow-400" />
                                    {he ? 'ללא קריסה' : 'No crash'}
                                </span>
                            </div>

                            {sweepStats && (
                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    <div className={`p-3 rounded-xl ${isLight ? 'bg-green-50 text-green-800' : 'bg-green-900/20 text-green-300'}`}>
                                        <div className="flex items-center gap-1 text-xs mb-1 opacity-80"><TrendingUp size={11} />{he ? 'שנת קריסה הטובה ביותר' : 'Best crash year'}</div>
                                        <div className="font-bold text-sm">{sweepStats.best.year}</div>
                                        <div className="text-xs mt-0.5">{fmt(sweepStats.best.balance)} <span className="opacity-60">(+{sweepStats.best.pctDiff.toFixed(1)}%)</span></div>
                                    </div>
                                    <div className={`p-3 rounded-xl ${isLight ? 'bg-red-50 text-red-800' : 'bg-red-900/20 text-red-300'}`}>
                                        <div className="flex items-center gap-1 text-xs mb-1 opacity-80"><TrendingDown size={11} />{he ? 'שנת קריסה הגרועה ביותר' : 'Worst crash year'}</div>
                                        <div className="font-bold text-sm">{sweepStats.worst.year}</div>
                                        <div className="text-xs mt-0.5">{fmt(sweepStats.worst.balance)} <span className="opacity-60">({sweepStats.worst.pctDiff.toFixed(1)}%)</span></div>
                                    </div>
                                    <div className={`col-span-2 p-3 rounded-xl ${isLight ? 'bg-gray-50' : 'bg-black/20'}`}>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>{he ? 'ללא קריסה (baseline):' : 'No crash (baseline):'}</span>
                                            <span className="font-semibold">{fmt(sweepStats.baseline)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>{he ? 'שנים מעל baseline:' : 'Years above baseline:'}</span>
                                            <span className={`font-semibold ${sweepStats.aboveCount >= sweepStats.total / 2 ? 'text-green-400' : 'text-orange-400'}`}>
                                                {sweepStats.aboveCount} / {sweepStats.total}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* ════════════ COMPARE TAB ════════════ */}
                    {activeTab === 'compare' && (
                        <>
                            {/* Chart */}
                            <div className={`rounded-xl p-3 mb-3 ${isLight ? 'bg-gray-50' : 'bg-black/20'}`} style={{ height: 200 }}>
                                {isComparing
                                    ? <div className="flex items-center justify-center h-full text-sm text-gray-400">{he ? 'מחשב...' : 'Calculating...'}</div>
                                    : compareChartData && <Bar data={compareChartData} options={compareOptions} />
                                }
                            </div>

                            {/* Legend */}
                            <div className="flex gap-4 mb-2 text-xs px-1">
                                {legendItem('bg-green-500 opacity-75', he ? 'מעל baseline' : 'Above baseline')}
                                {legendItem('bg-red-500 opacity-75', he ? 'מתחת ל-baseline' : 'Below baseline')}
                                <span className="flex items-center gap-1.5">
                                    <span className="inline-block w-6 border-t-2 border-dashed border-yellow-400" />
                                    {he ? 'ללא קריסה' : 'No crash'}
                                </span>
                            </div>

                            {/* Editable table */}
                            <div className={`rounded-xl overflow-hidden mb-2 ${isLight ? 'border border-gray-200' : 'border border-white/10'}`}>
                                <table className="w-full text-xs">
                                    <thead className={isLight ? 'bg-gray-50 text-gray-500' : 'bg-black/20 text-gray-400'}>
                                        <tr>
                                            <th className="px-2 py-2 text-start font-medium">{he ? 'שנה' : 'Year'}</th>
                                            <th className="px-2 py-2 text-start font-medium">{he ? 'ירידה %' : 'Depth %'}</th>
                                            <th className="px-2 py-2 text-start font-medium">{he ? 'שנות התאוששות' : 'Rec. Years'}</th>
                                            <th className="px-2 py-2 text-start font-medium">{he ? 'יתרה סופית' : 'Final Balance'}</th>
                                            <th className="px-2 py-2 text-start font-medium">Δ%</th>
                                            <th className="px-2 py-2 w-6" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {compareRows.map((row) => {
                                            const res = compareResults?.results.find(r => r.id === row.id);
                                            const isAbove = res && res.balance >= (compareResults?.baseline ?? 0);
                                            return (
                                                <tr key={row.id} className={`border-t ${isLight ? 'border-gray-100' : 'border-white/5'}`}>
                                                    <td className="px-2 py-1.5 min-w-[74px]">
                                                        <input type="number" value={row.year}
                                                            min={currentYear} max={retirementEndYear - 1}
                                                            className={inputCls}
                                                            onChange={e => updateRow(row.id, 'year', parseInt(e.target.value) || currentYear)} />
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        <input type="number" value={Math.abs(row.depth)}
                                                            min={1} max={99}
                                                            className={inputCls}
                                                            onChange={e => updateRow(row.id, 'depth', -Math.abs(parseFloat(e.target.value) || 20))} />
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        <input type="number" value={row.recYears}
                                                            min={1} max={20}
                                                            className={inputCls}
                                                            onChange={e => updateRow(row.id, 'recYears', Math.max(1, parseInt(e.target.value) || 5))} />
                                                    </td>
                                                    <td className="px-2 py-1.5 font-medium tabular-nums">
                                                        {res ? fmt(res.balance) : <span className="opacity-30">–</span>}
                                                    </td>
                                                    <td className={`px-2 py-1.5 font-semibold tabular-nums ${
                                                        res ? (isAbove ? 'text-green-500' : 'text-red-400') : ''
                                                    }`}>
                                                        {res ? fmtDiff(res.pctDiff) : <span className="opacity-30">–</span>}
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        <button onClick={() => removeRow(row.id)}
                                                            className={`opacity-40 hover:opacity-80 transition-opacity ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer row: baseline + add button */}
                            <div className="flex items-center justify-between mb-3">
                                {compareResults ? (
                                    <div className="text-xs">
                                        <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>{he ? 'ללא קריסה:' : 'Baseline:'}</span>
                                        {' '}<span className="font-semibold">{fmt(compareResults.baseline)}</span>
                                    </div>
                                ) : <div />}
                                <button
                                    onClick={addRow}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                        isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-white/10 hover:bg-white/15 text-gray-300'
                                    }`}
                                >
                                    <Plus size={12} />
                                    {he ? 'הוסף שורה' : 'Add row'}
                                </button>
                            </div>
                        </>
                    )}

                    <button onClick={onClose} className="w-full py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors">
                        {he ? 'סגור' : 'Close'}
                    </button>

                </div>
            </div>
        </div>
    );
}
