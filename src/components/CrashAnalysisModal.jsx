import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useDraggable } from '../hooks/useDraggable';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { X, BarChart2, TrendingDown, TrendingUp, Plus, Trash2, Info, Sparkles, Loader2 } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement,
    LineElement, PointElement, Title, Tooltip, Legend
} from 'chart.js';
import { useTheme } from '../contexts/ThemeContext';
import { calculateRetirementProjection } from '../utils/calculator';
import { generateScenarioRates } from '../utils/scenarioUtils';
import { getCrashAIInsights } from '../utils/ai-insights';

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
export default function CrashAnalysisModal({ isOpen, onClose, analysisInputs, language, aiProvider, aiModel, apiKeyOverride, presetLabel }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    useBodyScrollLock(isOpen);
    const he = language === 'he';

    const [activeTab, setActiveTab] = useState('sweep');

    // ── Sweep state ────────────────────────────────────────────────────────
    const [sweepResults, setSweepResults] = useState(null);
    const [isSweeping, setIsSweeping] = useState(false);
    const [selectedYear, setSelectedYear] = useState(null);
    const sweepChartRef = useRef(null);

    // ── Compare state ──────────────────────────────────────────────────────
    const [compareRows, setCompareRows] = useState([]);
    const [compareResults, setCompareResults] = useState(null);
    const [isComparing, setIsComparing] = useState(false);
    const compareInitRef = useRef(false);
    const compareDebounceRef = useRef(null);

    // ── AI analysis state ──────────────────────────────────────────────────
    const [aiInsight, setAiInsight] = useState(null);
    const [aiPanelVisible, setAiPanelVisible] = useState(false);
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [aiError, setAiError] = useState(null);
    const aiAbortRef = useRef(null);
    const aiCacheKeyRef = useRef(null);

    // ── Local safe-bucket override ─────────────────────────────────────────
    const [localAffectsSafe, setLocalAffectsSafe] = useState(
        analysisInputs?.scenario?.affectsSafeBucket ?? false
    );
    useEffect(() => {
        setLocalAffectsSafe(analysisInputs?.scenario?.affectsSafeBucket ?? false);
    }, [analysisInputs?.scenario?.affectsSafeBucket]);

    const effectiveInputs = useMemo(() => ({
        ...analysisInputs,
        scenario: { ...(analysisInputs?.scenario || {}), affectsSafeBucket: localAffectsSafe }
    }), [analysisInputs, localAffectsSafe]);

    // The active sweep (for detail panel + tooltips) based on current toggle
    const activeSweep = useMemo(() => {
        if (!sweepResults) return null;
        if (sweepResults.hasAlt) {
            return localAffectsSafe ? sweepResults.sweepAffected : sweepResults.sweepShielded;
        }
        return sweepResults.sweepShielded;
    }, [sweepResults, localAffectsSafe]);

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
        setTimeout(() => {
            try {
                const baseline = calculateRetirementProjection({ ...effectiveInputs, scenarioEnabled: false });
                const baseBalance = baseline.balanceAtEnd;
                const hasBuckets = !!effectiveInputs.enableBuckets;

                const calcSweep = (affectsSafe) => {
                    const sweep = [];
                    for (let year = currentYear; year <= retirementEndYear - 1; year++) {
                        try {
                            const r = calculateRetirementProjection({
                                ...effectiveInputs, scenarioEnabled: true,
                                scenario: { ...effectiveInputs.scenario, startYear: year, affectsSafeBucket: affectsSafe }
                            });
                            const diff = r.balanceAtEnd - baseBalance;
                            sweep.push({ year, balance: r.balanceAtEnd, diff,
                                pctDiff: baseBalance > 0 ? (diff / baseBalance) * 100 : 0,
                                isPreRetirement: year < retirementStartYear });
                        } catch {
                            sweep.push({ year, balance: 0, diff: -baseBalance, pctDiff: -100,
                                isPreRetirement: year < retirementStartYear, error: true });
                        }
                    }
                    return sweep;
                };

                const sweepShielded = calcSweep(false);
                const sweepAffected = hasBuckets ? calcSweep(true) : null;
                setSweepResults({ baseline: baseBalance, sweepShielded, sweepAffected, hasAlt: hasBuckets });
            } catch (e) { console.error('Sweep failed:', e); }
            setIsSweeping(false);
        }, 50);
    }, [effectiveInputs, currentYear, retirementEndYear, retirementStartYear]);

    // ── Compare logic ──────────────────────────────────────────────────────
    const buildDefaultRows = useCallback(() => {
        const s = effectiveInputs?.scenario || {};
        const depth = s.crashDepth ?? -20;
        const recYears = s.recoveryYears ?? 5;
        return [
            { id: uid(), year: currentYear,              depth, recYears },
            { id: uid(), year: retirementStartYear - 1,  depth, recYears },
            { id: uid(), year: retirementStartYear,      depth, recYears },
            { id: uid(), year: retirementStartYear + 3,  depth, recYears },
        ].filter(r => r.year >= currentYear && r.year < retirementEndYear);
    }, [effectiveInputs, currentYear, retirementStartYear, retirementEndYear]);

    const runCompare = useCallback((rows) => {
        if (!rows.length) return;
        setIsComparing(true);
        setTimeout(() => {
            try {
                const baseline = calculateRetirementProjection({ ...effectiveInputs, scenarioEnabled: false });
                const baseBalance = baseline.balanceAtEnd;
                const results = rows.map(row => {
                    try {
                        const r = calculateRetirementProjection({
                            ...effectiveInputs, scenarioEnabled: true,
                            scenario: {
                                ...effectiveInputs.scenario,
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
    }, [effectiveInputs]);

    const { dragStyle, onDragMouseDown } = useDraggable(isOpen);
    const { dragStyle: detailDragStyle, onDragMouseDown: onDetailDragMouseDown } = useDraggable(selectedYear !== null);
    const { dragStyle: aiDragStyle, onDragMouseDown: onAIDragMouseDown } = useDraggable(aiInsight !== null);

    // Reset when closed
    useEffect(() => {
        if (!isOpen) {
            setSweepResults(null);
            setCompareResults(null);
            compareInitRef.current = false;
            setActiveTab('sweep');
            setSelectedYear(null);
            setAiInsight(null);
            setAiPanelVisible(false);
            setAiError(null);
            aiAbortRef.current?.abort();
            aiCacheKeyRef.current = null;
            return;
        }
        runSweep();
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const runAIAnalysis = useCallback(async () => {
        if (!sweepResults || !aiProvider || isLoadingAI) return;
        const s = effectiveInputs?.scenario || {};
        const activeSweepForAI = localAffectsSafe ? sweepResults.sweepAffected : sweepResults.sweepShielded;
        const currentKey = JSON.stringify({
            baseline: sweepResults.baseline,
            worstYear: activeSweepForAI?.reduce((a, b) => b.balance < a.balance ? b : a, activeSweepForAI[0])?.year,
            crashDepth: s.crashDepth, recoveryYears: s.recoveryYears,
            recoveryShape: s.recoveryShape, recoveryMode: s.recoveryMode,
            targetAvgRate: s.targetAvgRate, affectsSafeBucket: localAffectsSafe,
            enableBuckets: effectiveInputs?.enableBuckets,
        });
        if (currentKey === aiCacheKeyRef.current && aiInsight) {
            setAiPanelVisible(true);
            return;
        }
        aiAbortRef.current?.abort();
        const controller = new AbortController();
        aiAbortRef.current = controller;
        aiCacheKeyRef.current = currentKey;
        setAiPanelVisible(true);
        setIsLoadingAI(true);
        setAiError(null);
        setAiInsight(null);
        try {
            const sweepForAI = { ...sweepResults, sweep: activeSweepForAI };
            const result = await getCrashAIInsights(
                effectiveInputs, sweepForAI, aiProvider, aiModel, apiKeyOverride, language,
                { signal: controller.signal }
            );
            setAiInsight(result);
        } catch (err) {
            if (err.name !== 'AbortError') setAiError(err.message || 'Error');
        } finally {
            setIsLoadingAI(false);
        }
    }, [sweepResults, aiProvider, aiModel, apiKeyOverride, language, isLoadingAI, aiInsight, effectiveInputs, localAffectsSafe]);

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
        const { baseline, sweepShielded, sweepAffected, hasAlt } = sweepResults;
        const baselineDataset = {
            type: 'line', label: he ? 'ללא קריסה' : 'No crash',
            data: Array(sweepShielded.length).fill(baseline),
            borderColor: 'rgba(251,191,36,0.9)', borderWidth: 2,
            borderDash: [6, 3], pointRadius: 0, fill: false, order: 1
        };
        if (!hasAlt || !sweepAffected) {
            return {
                labels: sweepShielded.map(r => String(r.year)),
                datasets: [
                    { type: 'bar', label: he ? 'יתרה סופית' : 'Final Balance',
                      data: sweepShielded.map(r => r.balance),
                      backgroundColor: sweepShielded.map(r => r.balance >= baseline ? 'rgba(34,197,94,0.65)' : 'rgba(239,68,68,0.65)'),
                      borderColor: sweepShielded.map(r => r.balance >= baseline ? 'rgba(34,197,94,1)' : 'rgba(239,68,68,1)'),
                      borderWidth: 1, borderRadius: 3, order: 2 },
                    baselineDataset
                ]
            };
        }
        // Shielded always shown; affected added only when toggle is on
        const shieldedDataset = {
            type: 'bar', label: he ? 'מוגן' : 'Shielded',
            data: sweepShielded.map(r => r.balance),
            backgroundColor: sweepShielded.map(r => r.balance >= baseline ? 'rgba(34,197,94,0.65)' : 'rgba(239,68,68,0.65)'),
            borderColor: sweepShielded.map(r => r.balance >= baseline ? 'rgba(34,197,94,1)' : 'rgba(239,68,68,1)'),
            borderWidth: 1, borderRadius: 3, order: 2, categoryPercentage: 0.9, barPercentage: 0.85
        };
        const affectedDataset = {
            type: 'bar', label: he ? 'מושפע' : 'Affected',
            data: sweepAffected.map(r => r.balance),
            backgroundColor: sweepAffected.map(r => r.balance >= baseline ? 'rgba(96,165,250,0.65)' : 'rgba(251,146,60,0.65)'),
            borderColor: sweepAffected.map(r => r.balance >= baseline ? 'rgba(96,165,250,1)' : 'rgba(251,146,60,1)'),
            borderWidth: 1, borderRadius: 3, order: 3, categoryPercentage: 0.9, barPercentage: 0.85
        };
        return {
            labels: sweepShielded.map(r => String(r.year)),
            datasets: localAffectsSafe
                ? [shieldedDataset, affectedDataset, baselineDataset]
                : [shieldedDataset, baselineDataset]
        };
    }, [sweepResults, localAffectsSafe, he]);

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

    // ── Click handler for sweep chart bars ───────────────────────────────
    const handleSweepChartClick = useCallback((event, _activeElements, chart) => {
        // Chart.js passes a ChartEvent wrapper; extract the native DOM event
        const nativeEvent = event.native || event;
        // Use 'nearest' with intersect: false so clicks near a bar also register
        const elements = chart.getElementsAtEventForMode(
            nativeEvent, 'nearest', { intersect: false, axis: 'x' }, true
        );
        // React to bar datasets (0 = shielded, 1 = affected), not the baseline line
        const barElement = elements.find(el => el.datasetIndex === 0 || el.datasetIndex === 1);
        if (!barElement) return;
        const refSweep = sweepResults?.sweepShielded ?? sweepResults?.sweep;
        const clickedYear = refSweep?.[barElement.index]?.year;
        if (clickedYear != null) {
            setSelectedYear(prev => prev === clickedYear ? null : clickedYear);
        }
    }, [sweepResults]);

    // ── Year detail data ────────────────────────────────────────────────────
    const yearDetail = useMemo(() => {
        if (selectedYear == null || !sweepResults) return null;
        const scenario = analysisInputs?.scenario || {};
        const baseRate = parseFloat(analysisInputs?.annualReturnRate) || 6;
        const crashDepth = scenario.crashDepth ?? -20;
        const recoveryYears = scenario.recoveryYears ?? 5;

        // Generate the rate overrides for this crash year
        const scenarioForYear = { ...scenario, startYear: selectedYear };
        const rates = generateScenarioRates(scenarioForYear, baseRate);

        // Build per-year schedule
        const schedule = [];
        for (let y = currentYear; y <= retirementEndYear; y++) {
            let rate = baseRate;
            let type = 'normal'; // normal | crash | recovery
            if (rates[y] !== undefined) {
                rate = rates[y];
                type = y === selectedYear ? 'crash' : 'recovery';
            }
            const phase = y < retirementStartYear ? 'accumulation' : 'retirement';
            // Check if this recovery year actually fits within simulation
            const isTruncated = type === 'recovery' && y > retirementEndYear;
            schedule.push({ year: y, rate, type, phase, isTruncated });
        }

        // Stats
        const recoveryEnd = selectedYear + recoveryYears;
        const recoveryUsed = Math.min(recoveryYears, Math.max(0, retirementEndYear - selectedYear));
        const normalYearsAfter = Math.max(0, retirementEndYear - Math.min(recoveryEnd, retirementEndYear));
        const fullRecovery = recoveryUsed >= recoveryYears;

        // Get sweep result for this year (from active scenario)
        const sweepEntry = activeSweep?.find(s => s.year === selectedYear);

        return {
            schedule,
            recoveryUsed,
            recoveryTotal: recoveryYears,
            normalYearsAfter,
            fullRecovery,
            crashDepth,
            sweepEntry,
            baseRate
        };
    }, [selectedYear, sweepResults, activeSweep, analysisInputs, currentYear, retirementEndYear, retirementStartYear]);

    const makeChartOptions = useCallback((getTooltipItems, onClick) => {
        const textColor = isLight ? '#374151' : '#d1d5db';
        const gridColor = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)';
        return {
            responsive: true, maintainAspectRatio: false,
            onClick,
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
    }, [isLight]);

    const sweepOptions = useMemo(() => makeChartOptions((idx) => {
        const r = activeSweep?.[idx];
        if (!r) return null;
        const sign = r.diff >= 0 ? '+' : '';
        const phase = r.isPreRetirement ? (he ? ' (צבירה)' : ' (accum.)') : (he ? ' (פרישה)' : ' (retire.)');
        const label = sweepResults?.hasAlt ? ` — ${localAffectsSafe ? (he ? 'מושפע' : 'Affected') : (he ? 'מוגן' : 'Shielded')}` : '';
        return {
            title: `${r.year}${phase}${label}`,
            lines: [
                `${he ? 'יתרה' : 'Balance'}: ${fmt(r.balance)}`,
                `${he ? 'הפרש' : 'Diff'}: ${sign}${fmt(r.diff)} (${sign}${r.pctDiff.toFixed(1)}%)`
            ]
        };
    }, handleSweepChartClick), [makeChartOptions, activeSweep, sweepResults, localAffectsSafe, he, handleSweepChartClick]);

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
    }, null), [makeChartOptions, compareRows, compareResults, retirementStartYear, he]);

    // ── Sweep stats ────────────────────────────────────────────────────────
    const sweepStats = useMemo(() => {
        if (!activeSweep?.length) return null;
        const { baseline } = sweepResults;
        const valid = activeSweep.filter(r => !r.error);
        if (!valid.length) return null;
        const best  = valid.reduce((a, b) => b.balance > a.balance ? b : a, valid[0]);
        const worst = valid.reduce((a, b) => b.balance < a.balance ? b : a, valid[0]);
        return { best, worst, aboveCount: valid.filter(r => r.balance >= baseline).length, total: valid.length, baseline };
    }, [activeSweep, sweepResults]);

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
                <div className="relative z-10 p-5 max-h-[88vh] overflow-y-auto" dir="ltr" style={{ scrollbarWidth: 'thin', scrollBehavior: 'smooth' }}><div dir={he ? 'rtl' : 'ltr'}>

                    {/* Header */}
                    <div className="flex items-center justify-between mb-3 cursor-grab active:cursor-grabbing" onMouseDown={onDragMouseDown}>
                        <div className="flex items-center gap-2">
                            <BarChart2 size={18} className="text-orange-400" />
                            <h2 className="text-base font-bold">{he ? 'ניתוח קריסות' : 'Crash Analysis'}</h2>
                            {presetLabel && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                    {presetLabel}
                                </span>
                            )}
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
                        {aiProvider && sweepResults && (
                            <button
                                onClick={runAIAnalysis}
                                disabled={isLoadingAI || isSweeping}
                                className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                    isLoadingAI
                                        ? 'text-purple-400'
                                        : (isLight ? 'text-purple-600 hover:bg-purple-100' : 'text-purple-300 hover:bg-white/10')
                                }`}
                            >
                                {isLoadingAI
                                    ? <><Loader2 size={12} className="animate-spin" />{he ? 'מנתח...' : 'Analyzing...'}</>
                                    : <><Sparkles size={12} />{he ? 'ניתוח AI' : 'AI Analysis'}</>
                                }
                            </button>
                        )}
                    </div>

                    {/* Scenario summary strip */}
                    <div className={`flex flex-wrap gap-3 mb-3 text-xs px-3 py-2 rounded-lg ${isLight ? 'bg-gray-50 text-gray-600' : 'bg-black/20 text-gray-400'}`} title={he ? 'סימולציה לצרכי תכנון בלבד — אינה חיזוי מדויק' : 'For planning purposes only — not an accurate prediction'}>
                        <span>{he ? 'ירידה:' : 'Drop:'} <strong dir="ltr">{Math.abs(scenario.crashDepth ?? 40)}%</strong></span>
                        <span>{he ? 'התאוששות:' : 'Recovery:'} <strong>{scenario.recoveryYears ?? 5} {he ? 'שנים' : 'yrs'}</strong></span>
                        <span>{he ? 'מודל:' : 'Mode:'} <strong>{recoveryLabel}</strong></span>
                        {analysisInputs?.enableBuckets && (
                            <span className="flex items-center gap-1.5">
                                {he ? 'דלי בטוח:' : 'Safe bucket:'}
                                <button
                                    onClick={() => setLocalAffectsSafe(v => !v)}
                                    className={`relative inline-flex w-8 h-4 rounded-full transition-colors ${localAffectsSafe ? 'bg-orange-500' : (isLight ? 'bg-gray-300' : 'bg-gray-600')}`}
                                    title={localAffectsSafe ? (he ? 'לחץ להגן על הדלי הבטוח' : 'Click to shield safe bucket') : (he ? 'לחץ להשפיע על הדלי הבטוח' : 'Click to affect safe bucket')}
                                >
                                    <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all duration-200" style={{ left: localAffectsSafe ? 18 : 2 }} />
                                </button>
                                <strong className={localAffectsSafe ? 'text-orange-400' : ''}>{localAffectsSafe ? (he ? 'מושפע' : 'affected') : (he ? 'מוגן' : 'shielded')}</strong>
                            </span>
                        )}
                        <span className={`ms-auto ${isLight ? 'text-amber-600' : 'text-amber-500'} opacity-70`}>⚠ {he ? 'לתכנון בלבד' : 'Planning only'}</span>
                    </div>


                    {/* ════════════ SWEEP TAB ════════════ */}
                    {activeTab === 'sweep' && (
                        <>
                            <div className={`rounded-xl p-3 mb-1 ${isLight ? 'bg-gray-50' : 'bg-black/20'}`} style={{ height: 220 }}>
                                {isSweeping
                                    ? <div className="flex items-center justify-center h-full text-sm text-gray-400">{he ? 'מחשב...' : 'Calculating...'}</div>
                                    : sweepChartData && <Bar ref={sweepChartRef} data={sweepChartData} options={sweepOptions} />
                                }
                            </div>
                            <div className={`text-center text-[10px] mb-2 ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                                {he ? 'לחץ על עמודה לפרטים' : 'Click a bar for details'}
                            </div>

                            {/* Legend */}
                            <div className="flex flex-wrap gap-3 mb-3 text-xs px-1">
                                {sweepResults?.hasAlt ? (<>
                                    {legendItem('bg-green-500 opacity-75', he ? 'מוגן — מעל' : 'Shielded — above')}
                                    {legendItem('bg-red-500 opacity-75', he ? 'מוגן — מתחת' : 'Shielded — below')}
                                    {legendItem('bg-blue-400 opacity-75', he ? 'מושפע — מעל' : 'Affected — above')}
                                    {legendItem('bg-orange-400 opacity-75', he ? 'מושפע — מתחת' : 'Affected — below')}
                                </>) : (<>
                                    {legendItem('bg-green-500 opacity-75', he ? 'מעל baseline' : 'Above baseline')}
                                    {legendItem('bg-red-500 opacity-75', he ? 'מתחת ל-baseline' : 'Below baseline')}
                                </>)}
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

                            {aiError && (
                                <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${isLight ? 'bg-red-50 text-red-600' : 'bg-red-900/20 text-red-400'}`}>
                                    {aiError}
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

                </div>{/* end content dir */}
                </div>
            </div>

            {/* ═══════ Year Detail — separate floating modal ═══════ */}
            {yearDetail && (
                <div
                    className={`absolute rounded-2xl shadow-2xl overflow-hidden w-[340px] ${
                        isLight ? 'bg-white ring-1 ring-gray-300 text-gray-900' : 'ring-1 ring-white/30 text-white'
                    }`}
                    dir={he ? 'rtl' : 'ltr'}
                    style={{ top: '20%', right: 'calc(50% + 177px)', ...detailDragStyle }}
                >
                    {!isLight && (
                        <>
                            <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                            <div className="absolute inset-0 bg-white/10" />
                        </>
                    )}
                    <div className="relative z-10 max-h-[80vh] overflow-y-auto" dir="ltr" style={{ scrollbarWidth: 'thin', scrollBehavior: 'smooth' }}><div dir={he ? 'rtl' : 'ltr'}>
                        {/* Header */}
                        <div
                            className={`flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing ${isLight ? 'bg-gray-50 border-b border-gray-100' : 'bg-white/5 border-b border-white/10'}`}
                            onMouseDown={onDetailDragMouseDown}
                        >
                            <div className="flex items-center gap-2">
                                <Info size={14} className="text-orange-400" />
                                <span className="text-sm font-bold">
                                    {he ? `פירוט שנת קריסה ${selectedYear}` : `Crash year ${selectedYear}`}
                                </span>
                                {yearDetail.sweepEntry && (
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                        yearDetail.sweepEntry.pctDiff >= 0
                                            ? (isLight ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400')
                                            : (isLight ? 'bg-red-100 text-red-700' : 'bg-red-900/30 text-red-400')
                                    }`}>
                                        <span dir="ltr">{fmtDiff(yearDetail.sweepEntry.pctDiff)}</span>
                                    </span>
                                )}
                            </div>
                            <button onClick={() => setSelectedYear(null)} className={`transition-colors ${isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-400 hover:text-gray-200'}`}>
                                <X size={16} />
                            </button>
                        </div>

                        {/* Rate schedule pills */}
                        <div className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                                {yearDetail.schedule.map(s => {
                                    const isCrash = s.type === 'crash';
                                    const isRecovery = s.type === 'recovery';
                                    const bgColor = isCrash
                                        ? (isLight ? 'bg-red-100 border-red-300 text-red-800' : 'bg-red-900/40 border-red-700/50 text-red-300')
                                        : isRecovery
                                            ? (isLight ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-amber-900/30 border-amber-700/40 text-amber-300')
                                            : (isLight ? 'bg-gray-50 border-gray-200 text-gray-600' : 'bg-white/5 border-white/10 text-gray-400');
                                    const phaseIcon = s.phase === 'accumulation' ? '💰' : '🏖️';
                                    return (
                                        <div key={s.year}
                                            className={`flex flex-col items-center px-2 py-1.5 rounded-lg border text-[11px] leading-tight min-w-[48px] ${bgColor}`}
                                        >
                                            <span className="font-semibold">{s.year}</span>
                                            <span className="font-bold tabular-nums" dir="ltr">{s.rate >= 0 ? '+' : ''}{s.rate.toFixed(1)}%</span>
                                            <span className="opacity-70">{phaseIcon}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Summary stats */}
                        <div className={`px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs border-t ${isLight ? 'bg-gray-50/50 border-gray-100' : 'bg-white/[0.02] border-white/5'}`}>
                            <span>
                                <span className={isLight ? 'text-gray-500' : 'text-gray-500'}>{he ? 'ירידה:' : 'Drop:'} </span>
                                <strong className="text-red-400" dir="ltr">{yearDetail.crashDepth}%</strong>
                            </span>
                            <span>
                                <span className={isLight ? 'text-gray-500' : 'text-gray-500'}>{he ? 'שנות התאוששות:' : 'Recovery:'} </span>
                                <strong className={yearDetail.fullRecovery ? 'text-green-400' : 'text-orange-400'}>
                                    {yearDetail.recoveryUsed}/{yearDetail.recoveryTotal}
                                    {!yearDetail.fullRecovery && (he ? ' ⚠️ חלקי' : ' ⚠️ partial')}
                                </strong>
                            </span>
                            <span>
                                <span className={isLight ? 'text-gray-500' : 'text-gray-500'}>{he ? 'שנות נורמלי אחרי:' : 'Normal after:'} </span>
                                <strong>{yearDetail.normalYearsAfter}</strong>
                            </span>
                            {yearDetail.sweepEntry && (
                                <span>
                                    <span className={isLight ? 'text-gray-500' : 'text-gray-500'}>{he ? 'יתרה סופית:' : 'Final:'} </span>
                                    <strong>{fmt(yearDetail.sweepEntry.balance)}</strong>
                                </span>
                            )}
                        </div>

                        {/* Legend */}
                        <div className={`px-4 py-2 flex flex-wrap gap-3 text-[10px] border-t ${isLight ? 'border-gray-100 text-gray-600' : 'border-white/5 text-gray-300'}`}>
                            {legendItem('bg-red-500/60', he ? 'קריסה' : 'Crash')}
                            {legendItem('bg-amber-500/50', he ? 'התאוששות' : 'Recovery')}
                            {legendItem(isLight ? 'bg-gray-300/60' : 'bg-white/10', he ? 'נורמלי' : 'Normal')}
                            <span className="flex items-center gap-1">💰 {he ? 'צבירה' : 'Accum.'}</span>
                            <span className="flex items-center gap-1">🏖️ {he ? 'פרישה' : 'Retire'}</span>
                        </div>
                    </div>{/* end content dir */}
                    </div>
                </div>
            )}
            {/* ═══════ AI Analysis — separate floating modal ═══════ */}
            {aiPanelVisible && aiInsight && (
                <div
                    className={`absolute rounded-2xl shadow-2xl overflow-hidden w-[380px] ${
                        isLight ? 'bg-white ring-1 ring-purple-200 text-gray-900' : 'ring-1 ring-purple-700/40 text-white'
                    }`}
                    dir={he ? 'rtl' : 'ltr'}
                    style={{ top: '8%', right: 'calc(50% + 177px)', ...aiDragStyle }}
                >
                    {!isLight && (
                        <>
                            <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-purple-900" />
                            <div className="absolute inset-0 bg-white/10" />
                        </>
                    )}
                    <div className="relative z-10 flex flex-col max-h-[60vh]">
                        {/* Header */}
                        <div
                            className={`flex-shrink-0 flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing ${isLight ? 'bg-purple-50 border-b border-purple-100' : 'bg-white/5 border-b border-white/10'}`}
                            onMouseDown={onAIDragMouseDown}
                        >
                            <div className="flex items-center gap-2">
                                <Sparkles size={14} className="text-purple-400" />
                                <span className="text-sm font-bold">{he ? 'ניתוח AI — קריסות' : 'AI Crash Analysis'}</span>
                            </div>
                            <button onClick={() => setAiPanelVisible(false)} className={`transition-colors ${isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-400 hover:text-gray-200'}`}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="overflow-y-auto" dir="ltr" style={{ scrollbarWidth: 'thin', scrollBehavior: 'smooth' }}>
                        <div dir={he ? 'rtl' : 'ltr'}>

                        {/* Summary */}
                        <div className={`px-4 py-3 text-xs ${isLight ? 'bg-purple-50/50 text-purple-900' : 'text-purple-200'}`}>
                            <p className="leading-relaxed">{aiInsight.summary}</p>
                        </div>

                        {/* Timing */}
                        <div className={`px-4 py-3 text-xs border-t ${isLight ? 'border-purple-100 text-gray-700' : 'border-white/10 text-gray-300'}`}>
                            <div className="font-semibold mb-1 text-orange-400">{he ? 'ניתוח עיתוי' : 'Timing Analysis'}</div>
                            <p className="leading-relaxed">{aiInsight.timingAnalysis}</p>
                        </div>

                        {/* Best / Worst */}
                        <div className={`grid grid-cols-2 border-t ${isLight ? 'border-purple-100' : 'border-white/10'}`}>
                            <div className={`px-3 py-3 text-xs ${isLight ? 'bg-green-50 text-green-800' : 'bg-green-900/20 text-green-300'}`}>
                                <div className="font-semibold mb-1 flex items-center gap-1">
                                    <TrendingUp size={11} />
                                    {he ? `מקרה טוב — ${aiInsight.bestCase?.year}` : `Best — ${aiInsight.bestCase?.year}`}
                                </div>
                                <p className="leading-relaxed">{aiInsight.bestCase?.assessment}</p>
                            </div>
                            <div className={`px-3 py-3 text-xs border-s ${isLight ? 'border-purple-100 bg-red-50 text-red-800' : 'border-white/10 bg-red-900/20 text-red-300'}`}>
                                <div className="font-semibold mb-1 flex items-center gap-1">
                                    <TrendingDown size={11} />
                                    {he ? `מקרה גרוע — ${aiInsight.worstCase?.year}` : `Worst — ${aiInsight.worstCase?.year}`}
                                </div>
                                <p className="leading-relaxed">{aiInsight.worstCase?.assessment}</p>
                            </div>
                        </div>

                        {/* Bucket Impact */}
                        {analysisInputs?.enableBuckets && aiInsight.bucketImpact && !aiInsight.bucketImpact.startsWith('N/A') && (
                            <div className={`px-4 py-3 text-xs border-t ${isLight ? 'border-purple-100 text-gray-700' : 'border-white/10 text-gray-300'}`}>
                                <div className="font-semibold mb-1 text-blue-400">{he ? 'השפעת אסטרטגיית הדליים' : 'Bucket Strategy Impact'}</div>
                                <p className="leading-relaxed">{aiInsight.bucketImpact}</p>
                            </div>
                        )}

                        {/* Recommendation */}
                        <div className={`px-4 py-3 text-xs border-t ${isLight ? 'border-purple-100 bg-amber-50 text-amber-900' : 'border-white/10 bg-amber-900/10 text-amber-200'}`}>
                            <div className="font-semibold mb-1">{he ? 'המלצה' : 'Recommendation'}</div>
                            <p className="leading-relaxed">{aiInsight.recommendation}</p>
                            {aiInsight.worstCase?.mitigation && (
                                <p className="leading-relaxed mt-1.5 opacity-80">{aiInsight.worstCase.mitigation}</p>
                            )}
                        </div>
                        </div>{/* end content dir */}
                        </div>{/* end scrollable */}
                    </div>
                </div>
            )}
        </div>
    );
}
