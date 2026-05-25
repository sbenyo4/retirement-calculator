import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { useDraggable } from '../../hooks/useDraggable';
import { getNowYM, matchIncrease } from './budgetUtils';
import { CATEGORIES, CAT_COLORS } from './constants';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    Title,
    Tooltip,
    Legend
);

export function BudgetStatsModal({
    isOpen,
    onClose,
    items,
    inputs,
    results,
    inflationRate,
    showInflation: showInflationProp,
    isLight,
    isHe,
    currency,
    t: _t,
    sliderConsumed,
    setSliderConsumed,
    showRetirementMode,
    setShowRetirementMode,
    isRetirementModeManual,
    getResolvedItemsForYear,
    retirementAdj,
    retirementModeByYear,
    defaultRetirementModeStartYear,
    retirementEndYear
}) {
    const { dragStyle, onDragMouseDown } = useDraggable(isOpen);
    const [localShowInflation, setLocalShowInflation] = useState(showInflationProp);
    const [selectedYearIdx, setSelectedYearIdx] = useState(null);
    const [showSavings, setShowSavings] = useState(false);
    const barDivRef = useRef(null);
    // Each time isOpen transitions false→true, increment this counter during render
    // so the <Doughnut> and <Bar> receive a new key and React creates fresh canvas
    // elements — Chart.js never sees a "canvas already in use" error.
    const chartOpenCountRef = useRef(0);
    const prevIsOpenRef = useRef(false);
    if (isOpen && !prevIsOpenRef.current) chartOpenCountRef.current += 1;
    prevIsOpenRef.current = isOpen;

    // Sync with parent toggle when modal opens
    useEffect(() => {
        if (isOpen) {
            setLocalShowInflation(showInflationProp);
            setSelectedYearIdx(null);
            setShowSavings(false);
        }
    }, [isOpen, showInflationProp]);

    // Prevent body scroll while modal is open
    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [isOpen]);

    // Auto-focus the bar div when modal opens so arrow keys work immediately
    useEffect(() => {
        if (isOpen) {
            const t = setTimeout(() => barDivRef.current?.focus(), 50);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    // ── Shared year geometry (used by both pie and bar) ──
    const yearGeom = useMemo(() => {
        const retStart   = parseFloat(inputs.retirementStartAge) || 67;
        const retEnd     = parseFloat(inputs.retirementEndAge)   || 90;
        const curAge     = parseFloat(inputs.currentAge)         || 30;
        const yearsToRet = Math.max(0, retStart - curAge);
        const retYears   = Math.max(1, Math.round(retEnd - retStart));
        const nowYM      = getNowYM();
        const retYM      = nowYM + Math.round(yearsToRet * 12);
        const ages       = Array.from({ length: retYears }, (_, yi) => Math.round(retStart) + yi);
        return { yearsToRet, retYM, ages };
    }, [inputs]);

    // ── Helper: compute per-category totals for a given year index ──
    const computeCatTotals = useCallback((yi) => {
        const { yearsToRet } = yearGeom;
        const currentYear = new Date().getFullYear();
        const targetYear = currentYear + yearsToRet + yi;
        const yearsFromNow = yearsToRet + yi;
        const inflFactor   = localShowInflation ? Math.pow(1 + inflationRate, yearsFromNow) : 1;

        const resolvedItems = getResolvedItemsForYear ? getResolvedItemsForYear(targetYear) : items;

        return CATEGORIES.map((cat, i) => {
            const catItems = resolvedItems.filter(it => it.categoryId === cat.id && it.enabled !== false);
            const total = catItems.reduce((s, it) => {
                if (it.type === 'loan') {
                    return s + (it.tracks || []).reduce((ts, tr) => {
                        return ts + (tr.amount || 0) * (localShowInflation && tr.inflationAffected ? inflFactor : 1);
                    }, 0);
                }
                const monthly = it.frequency === 'annual' ? (it.amount || 0) / 12 : (it.amount || 0);
                return s + monthly * inflFactor;
            }, 0);

            const defaultShowRet = targetYear >= defaultRetirementModeStartYear && targetYear <= retirementEndYear;
            const showRetMode = retirementAdj
                ? (retirementModeByYear?.[targetYear] ?? defaultShowRet)
                : false;

            let retDelta = 0;
            if (showRetMode && retirementAdj) {
                const additions = (retirementAdj.additions || [])
                    .filter(a => a.categoryId === cat.id)
                    .reduce((s, a) => s + (a.monthlyAmount || 0), 0);
                const increases = (retirementAdj.increases || [])
                    .filter(inc => inc.categoryId === cat.id)
                    .reduce((s, inc) => {
                        const matched = catItems.some(i => matchIncrease(i.label, inc.itemLabel));
                        return s + (matched ? (inc.increaseAmount || 0) : 0);
                    }, 0);
                retDelta = (additions + increases) * inflFactor;
            }

            return { cat, total: Math.round(total + retDelta), color: CAT_COLORS[i] };
        }).filter(c => c.total > 0);
    }, [yearGeom, getResolvedItemsForYear, items, localShowInflation, inflationRate, retirementAdj, retirementModeByYear, defaultRetirementModeStartYear, retirementEndYear]);

    // ── Default pie year: current age if already retired, else retirement start ──
    const defaultYearIdx = useMemo(() => {
        const retStart = parseFloat(inputs.retirementStartAge) || 67;
        const curAge   = parseFloat(inputs.currentAge)         || 30;
        const { ages } = yearGeom;
        if (curAge <= retStart) return 0;
        const idx = Math.round(curAge - retStart);
        return Math.min(idx, ages.length - 1);
    }, [inputs, yearGeom]);

    // ── Pie: category distribution for the selected year ──
    const pieData = useMemo(() => {
        const yi   = selectedYearIdx ?? defaultYearIdx;
        const cats = computeCatTotals(yi);
        const grandTotal = cats.reduce((s, c) => s + c.total, 0);
        return {
            labels: cats.map(c => `${c.cat.icon} ${isHe ? c.cat.labelHe : c.cat.labelEn}`),
            datasets: [{ data: cats.map(c => c.total), backgroundColor: cats.map(c => c.color), borderWidth: 0 }],
            grandTotal,
            cats,
        };
    }, [computeCatTotals, selectedYearIdx, defaultYearIdx, isHe]);

    // ── Bar: monthly expenses per retirement year, stacked by category ──
    const barData = useMemo(() => {
        const { ages, yearsToRet, retYM } = yearGeom;
        const baseTarget = Math.round(results?.initialNetWithdrawal ?? parseFloat(inputs.monthlyNetIncomeDesired) ?? 0);
        const nowYear = new Date().getFullYear();
        const curAge  = parseFloat(inputs.currentAge) || 30;
        const years   = ages.map(a => nowYear + Math.round(a - curAge));

        const datasets = CATEGORIES.map((cat, ci) => {
            const data = ages.map((_, yi) => {
                const targetYear = nowYear + Math.round(ages[yi] - curAge);
                const yearsFromNow = yearsToRet + yi;
                const inflFactor   = localShowInflation ? Math.pow(1 + inflationRate, yearsFromNow) : 1;

                const resolvedItems = getResolvedItemsForYear ? getResolvedItemsForYear(targetYear) : items;
                const catItems = resolvedItems.filter(it => it.categoryId === cat.id && it.enabled !== false);
                
                const total = catItems.reduce((s, it) => {
                    if (it.type === 'loan') {
                        return s + (it.tracks || []).reduce((ts, tr) => {
                            return ts + (tr.amount || 0) * (localShowInflation && tr.inflationAffected ? inflFactor : 1);
                        }, 0);
                    }
                    const monthly = it.frequency === 'annual' ? (it.amount || 0) / 12 : (it.amount || 0);
                    return s + monthly * inflFactor;
                }, 0);

                const defaultShowRet = targetYear >= defaultRetirementModeStartYear && targetYear <= retirementEndYear;
                const showRetMode = retirementAdj
                    ? (retirementModeByYear?.[targetYear] ?? defaultShowRet)
                    : false;

                let retDelta = 0;
                if (showRetMode && retirementAdj) {
                    const additions = (retirementAdj.additions || [])
                        .filter(a => a.categoryId === cat.id)
                        .reduce((s, a) => s + (a.monthlyAmount || 0), 0);
                    const increases = (retirementAdj.increases || [])
                        .filter(inc => inc.categoryId === cat.id)
                        .reduce((s, inc) => {
                            const matched = catItems.some(i => matchIncrease(i.label, inc.itemLabel));
                            return s + (matched ? (inc.increaseAmount || 0) : 0);
                        }, 0);
                    retDelta = (additions + increases) * inflFactor;
                }

                return Math.round(total + retDelta);
            });

            if (data.every(v => v === 0)) return null;
            const baseColor = CAT_COLORS[ci];
            return {
                label: `${cat.icon} ${isHe ? cat.labelHe : cat.labelEn}`,
                data,
                backgroundColor: ages.map((_, yi) => {
                    const activeIdx = selectedYearIdx ?? defaultYearIdx;
                    return yi === activeIdx ? baseColor : baseColor + '44';
                }),
                stack: 'total',
                borderRadius: 2,
                borderSkipped: false,
            };
        }).filter(Boolean);

        const yearlyIncomeOverrides = inputs.yearlyIncomeOverrides && typeof inputs.yearlyIncomeOverrides === 'object'
            ? inputs.yearlyIncomeOverrides
            : {};
        const targets = years.map(year => {
            const override = parseFloat(yearlyIncomeOverrides[year]);
            return !isNaN(override) && override > 0 ? override : baseTarget;
        });
        const expenseTotals = ages.map((_, yi) =>
            datasets.filter(ds => ds.stack === 'total').reduce((s, ds) => s + (ds.data[yi] || 0), 0)
        );
        const maxTarget = Math.max(0, ...targets);

        // Savings fill above bars up to the target for each year
        let totalSavings = 0;
        if (showSavings && maxTarget > 0) {
            const savingsData = expenseTotals.map((t, yi) => Math.max(0, (targets[yi] || 0) - t));
            totalSavings = Math.round(savingsData.reduce((s, v) => s + v * 12, 0));
            if (savingsData.some(v => v > 0)) {
                const activeIdx = selectedYearIdx ?? defaultYearIdx;
                datasets.push({
                    label: isHe ? 'חיסכון' : 'Savings',
                    data: savingsData,
                    backgroundColor: ages.map((_, yi) =>
                        yi === activeIdx ? 'rgba(34,197,94,0.35)' : 'rgba(34,197,94,0.15)'
                    ),
                    borderColor: 'rgba(34,197,94,0.5)',
                    borderWidth: 1,
                    stack: 'total',
                    borderRadius: 2,
                    borderSkipped: false,
                    trend: savingsData[savingsData.length - 1] > savingsData[0] * 1.03 ? '↑'
                         : savingsData[savingsData.length - 1] < savingsData[0] * 0.97 ? '↓' : '→',
                });
            }
        }

        // Target line drawn manually in plugin (spans full chart width)

        // Add trend arrow to each category dataset
        datasets.forEach(ds => {
            if (ds.type === 'line') return;
            const vals = ds.data.filter(v => typeof v === 'number');
            const first = vals[0] || 0;
            const last  = vals[vals.length - 1] || 0;
            ds.trend = last > first * 1.03 ? '↑' : last < first * 0.97 ? '↓' : '→';
        });

        // Loan end vertical markers
        const loanEndMap = new Map(); // yi → [label, ...]
        items.filter(it => it.enabled !== false && it.type === 'loan').forEach(it => {
            (it.tracks || []).forEach(tr => {
                if (!tr.endDate || !(tr.amount > 0)) return;
                const [y, m] = tr.endDate.split('-').map(Number);
                const endYM = y * 12 + (m - 1);
                const yi = ages.findIndex((_, i) => retYM + i * 12 > endYM);
                if (yi > 0 && yi < ages.length) {
                    const label = tr.label || it.label || '';
                    if (!loanEndMap.has(yi)) loanEndMap.set(yi, []);
                    loanEndMap.get(yi).push(label);
                }
            });
        });
        const loanEndIndices = [...loanEndMap.entries()].map(([yi, labels]) => ({ yi, label: labels.join(', ') }));

        return { labels: ages.map(a => `${isHe ? 'גיל' : 'Age'} ${a}`), datasets, target: maxTarget, targets, expenseTotals, ages, years, loanEndIndices, totalSavings };
    }, [items, inputs, yearGeom, inflationRate, localShowInflation, isHe, selectedYearIdx, defaultYearIdx, showSavings, getResolvedItemsForYear, results, retirementAdj, retirementModeByYear, defaultRetirementModeStartYear, retirementEndYear]);

    const textColor   = isLight ? '#475569' : '#94a3b8';
    const gridColor   = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';

    const pluginStateRef = useRef({});
    pluginStateRef.current = { barData, selectedYearIdx, defaultYearIdx, currency, textColor, isLight, showSavings };

    const yearLabelPlugin = useMemo(() => ({
        id: 'yearLabels',
        afterRender(chart) {
            const { barData, selectedYearIdx, defaultYearIdx, currency, textColor, isLight, showSavings } = pluginStateRef.current;
            const { ctx, scales: { x }, chartArea } = chart;

            // 0. Target line — full width
            const targets = barData.targets || [];
            if (targets.some(v => v > 0) && chart.scales.y) {
                ctx.save();
                ctx.setLineDash([6, 3]);
                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 2;
                ctx.beginPath();
                targets.forEach((target, i) => {
                    if (!(target > 0)) return;
                    const yPos = chart.scales.y.getPixelForValue(target);
                    const xPos = x.getPixelForTick(i);
                    if (i === 0) ctx.moveTo(xPos, yPos);
                    else ctx.lineTo(xPos, yPos);
                });
                ctx.stroke();
                ctx.restore();
            }

            // 1. Year labels at bottom
            if (barData.years) {
                ctx.font = `9px sans-serif`;
                ctx.fillStyle = '#60a5fa99';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                barData.years.forEach((yr, i) => {
                    if (yr == null) return;
                    ctx.fillText(String(yr), x.getPixelForTick(i), chart.height - 4);
                });
            }

            // 2. Value above selected bar
            const activeIdx = selectedYearIdx ?? defaultYearIdx;
            const allStackDs = chart.data.datasets
                .map((ds, i) => ({ ds, meta: chart.getDatasetMeta(i) }))
                .filter(({ ds }) => ds.type !== 'line' && ds.stack === 'total');
            if (allStackDs.length > 0) {
                const savingsDs = allStackDs.find(({ ds }) => ds.label === 'חיסכון' || ds.label === 'Savings');
                const nonSavingsDs = allStackDs.filter(({ ds }) => ds.label !== 'חיסכון' && ds.label !== 'Savings');
                let displayValue, color;
                if (showSavings && savingsDs) {
                    displayValue = Math.round(savingsDs.ds.data[activeIdx] || 0);
                    color = '#22c55e';
                } else {
                    displayValue = nonSavingsDs.reduce((s, { ds }) => s + (ds.data[activeIdx] || 0), 0);
                    color = textColor;
                }
                const topYs = allStackDs.map(({ meta }) => meta.data[activeIdx]?.y).filter(v => v != null && isFinite(v));
                if (displayValue > 0 && topYs.length) {
                    const topY = Math.min(...topYs);
                    ctx.font = `bold 9px sans-serif`;
                    ctx.fillStyle = color;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(`${currency}${Math.round(displayValue).toLocaleString()}`, x.getPixelForTick(activeIdx), topY - 3);
                }
            }

            // 3. Vertical loan-end lines with label
            (barData.loanEndIndices || []).forEach(({ yi, label }) => {
                if (yi <= 0 || yi >= (barData.ages?.length ?? 0)) return;
                const x0 = x.getPixelForTick(yi - 1);
                const x1 = x.getPixelForTick(yi);
                const xLine = (x0 + x1) / 2;
                ctx.save();
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = isLight ? '#f59e0bcc' : '#fbbf24cc';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(xLine, chartArea.top);
                ctx.lineTo(xLine, chartArea.bottom);
                ctx.stroke();
                // Label above the chart, horizontal
                if (label) {
                    ctx.setLineDash([]);
                    ctx.font = `9px sans-serif`;
                    ctx.fillStyle = isLight ? '#b45309' : '#fbbf24';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(label.length > 14 ? label.slice(0, 13) + '…' : label, xLine, chartArea.top - 4);
                }
                ctx.restore();
            });
        },
    }), []);

    const barOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { bottom: 11, top: 22 } },
        onClick: (_, elements) => {
            if (!elements.length) return;
            const idx = elements.find(el => el.datasetIndex !== undefined && el.index !== undefined)?.index;
            if (idx == null) return;
            setSelectedYearIdx(prev => prev === idx ? null : idx);
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: ctx => ` ${ctx.dataset.label}: ${currency}${ctx.parsed.y.toLocaleString()}`,
                    footer: items => {
                        const barTotal = items.filter(i => i.dataset.type !== 'line').reduce((s, i) => s + i.parsed.y, 0);
                        return barTotal > 0 ? `${isHe ? 'סה"כ' : 'Total'}: ${currency}${barTotal.toLocaleString()}` : '';
                    },
                },
            },
        },
        scales: {
            x: {
                stacked: true,
                ticks: { color: textColor, font: { size: 10 }, maxRotation: 45 },
                grid: { display: false },
            },
            y: {
                stacked: true,
                suggestedMax: barData.target > 0 ? barData.target * 1.08 : undefined,
                ticks: {
                    color: textColor, font: { size: 10 },
                    callback: v => `${currency}${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`,
                },
                grid: { color: gridColor },
            },
        },
    }), [currency, textColor, gridColor, isHe, barData.target]);

    const targetPercentData = useMemo(() => {
        const percentages = (barData.expenseTotals || []).map((total, yi) => {
            const target = barData.targets?.[yi] || 0;
            return target > 0 ? Math.round((total / target) * 100) : 0;
        });
        return {
            labels: barData.years?.map(String) || [],
            datasets: [{
                label: isHe ? 'אחוז מהיעד' : 'Percent of target',
                data: percentages,
                borderColor: isLight ? '#0891b2' : '#22d3ee',
                backgroundColor: isLight ? 'rgba(8,145,178,0.12)' : 'rgba(34,211,238,0.14)',
                pointBackgroundColor: percentages.map((pct, yi) => {
                    const activeIdx = selectedYearIdx ?? defaultYearIdx;
                    if (yi === activeIdx) return isLight ? '#0e7490' : '#67e8f9';
                    return pct > 100 ? '#ef4444' : pct >= 90 ? '#f59e0b' : '#22c55e';
                }),
                pointBorderColor: isLight ? '#ffffff' : '#0f172a',
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.25,
                fill: true,
            }],
        };
    }, [barData.expenseTotals, barData.targets, barData.years, isHe, isLight, selectedYearIdx, defaultYearIdx]);

    const targetPercentOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: ctx => `${isHe ? 'אחוז מהיעד' : 'Percent of target'}: ${ctx.parsed.y}%`,
                    afterLabel: ctx => {
                        const yi = ctx.dataIndex;
                        const total = barData.expenseTotals?.[yi] || 0;
                        const target = barData.targets?.[yi] || 0;
                        return `${isHe ? 'הוצאות' : 'Expenses'}: ${currency}${Math.round(total).toLocaleString()} / ${isHe ? 'יעד' : 'Target'}: ${currency}${Math.round(target).toLocaleString()}`;
                    },
                },
            },
        },
        scales: {
            x: {
                ticks: { color: textColor, font: { size: 10 }, maxRotation: 45 },
                grid: { display: false },
            },
            y: {
                suggestedMin: 0,
                suggestedMax: Math.max(100, ...((targetPercentData.datasets?.[0]?.data || []).map(v => v + 8))),
                ticks: { color: textColor, font: { size: 10 }, callback: v => `${v}%` },
                grid: { color: gridColor },
            },
        },
    }), [barData.expenseTotals, barData.targets, currency, gridColor, isHe, targetPercentData, textColor]);

    // ── Savings slider ─────────────────────────────────────────────────────────

    const savingsSliderData = useMemo(() => {
        const Fend = results?.balanceAtEnd;
        const F0   = results?.balanceAtRetirement;
        const targets = barData.targets || [];
        const maxTarget = Math.max(0, ...targets);
        const { ages } = yearGeom;
        const N = ages.length;
        if (Fend == null || !F0 || F0 <= 0 || !maxTarget || !N || !barData.datasets.length) return null;

        const savingsLabel = isHe ? 'חיסכון' : 'Savings';
        const barTotals = ages.map((_, yi) =>
            barData.datasets
                .filter(ds => ds.stack === 'total' && ds.label !== savingsLabel)
                .reduce((s, ds) => s + (ds.data[yi] || 0), 0)
        );
        if (barTotals[0] >= (targets[0] || 0)) return null;

        // Decumulation rate
        const realRate = (results?.effectiveRetirementRate ?? 0) / 100;
        const rAnnual  = localShowInflation
            ? (1 + realRate) * (1 + inflationRate) - 1
            : realRate;
        const rMonthly = rAnnual > 0 ? Math.pow(1 + rAnnual, 1 / 12) - 1 : 0;

        // Per-year savings and their FV to end of retirement — anchored to Fend
        let totalSavings = 0;
        let FV_bonus = 0;
        for (let yi = 0; yi < N; yi++) {
            const monthlySaved = Math.max(0, (targets[yi] || 0) - barTotals[yi]);
            if (monthlySaved <= 0) continue;
            totalSavings += monthlySaved * 12;
            // FV of 12 monthly deposits, then grown for remaining (N-1-yi) full years
            const fvYear = rMonthly > 0
                ? monthlySaved * (Math.pow(1 + rMonthly, 12) - 1) / rMonthly
                : monthlySaved * 12;
            const growthFactor = rAnnual > 0 ? Math.pow(1 + rAnnual, N - 1 - yi) : 1;
            FV_bonus += fvYear * growthFactor;
        }
        if (totalSavings <= 0) return null;

        // Fmax guaranteed anchored: at S=0 → Fend+FV_bonus, at S=totalSavings → Fend exactly
        const Fmax = Fend + FV_bonus;

        const STEP = 10000;
        const totalSavingsRounded = Math.round(totalSavings / STEP) * STEP;
        return { totalSavings: totalSavingsRounded, FV_bonus, Fend, Fmax };
    }, [results, barData, yearGeom, inflationRate, localShowInflation, isHe]);

    // Clamp slider when data changes (e.g. budget edited) so it stays in range
    useEffect(() => {
        if (savingsSliderData) setSliderConsumed(v => Math.min(v, savingsSliderData.totalSavings));
    }, [savingsSliderData, setSliderConsumed]);

    const doughnutOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: ctx => {
                        const pct = pieData.grandTotal > 0
                            ? ((ctx.parsed / pieData.grandTotal) * 100).toFixed(1) : 0;
                        return ` ${currency}${ctx.parsed.toLocaleString()} (${pct}%)`;
                    },
                },
            },
        },
    }), [currency, pieData.grandTotal]);

    const pieAge    = barData.ages?.[selectedYearIdx ?? defaultYearIdx];
    const pieYear   = barData.years?.[selectedYearIdx ?? defaultYearIdx];
    const pieLabel  = pieAge != null
        ? (isHe ? `גיל ${pieAge}${pieYear != null ? ` (${pieYear})` : ''}` : `Age ${pieAge}${pieYear != null ? ` (${pieYear})` : ''}`)
        : (isHe ? 'גיל פרישה' : 'At retirement');

    if (!isOpen) return null;

    const hasData = pieData.grandTotal > 0;

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
                className={`relative w-full max-w-2xl max-h-[94vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ring-1 ${isLight ? 'bg-white ring-gray-300' : 'ring-white/20'}`}
                style={dragStyle}
                dir={isHe ? 'rtl' : 'ltr'}
            >
                {!isLight && <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-950" />}

                {/* Header */}
                <div
                    className={`relative z-10 flex items-center justify-between px-5 py-4 border-b cursor-grab active:cursor-grabbing shrink-0 ${isLight ? 'border-slate-100' : 'border-white/10'}`}
                    onMouseDown={onDragMouseDown}
                >
                    <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg ${isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/20 text-blue-400'}`}>
                            <BarChart3 size={17} />
                        </div>
                        <span className={`font-bold text-base ${isLight ? 'text-slate-800' : 'text-white'}`}>
                            {isHe ? 'סטטיסטיקות תקציב' : 'Budget Statistics'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setLocalShowInflation(v => !v)}
                            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors shrink-0 ${localShowInflation
                                ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500 bg-amber-900/20 text-amber-400')
                                : (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-white/20 bg-white/5 text-gray-500')}`}
                            title={isHe ? 'הקרנת אינפלציה' : 'Inflation projection'}
                        >
                            {localShowInflation ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                            {isHe ? 'אינפלציה' : 'Inflation'}
                        </button>
                        {retirementAdj && (
                            <button
                                onClick={() => {
                                    if (isRetirementModeManual) {
                                        setShowRetirementMode(v => !v);
                                    }
                                }}
                                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors shrink-0 ${
                                    !isRetirementModeManual ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                } ${showRetirementMode
                                    ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500 bg-amber-900/20 text-amber-300')
                                    : (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-white/20 bg-white/5 text-gray-500')}`}
                                title={!isRetirementModeManual
                                    ? (isHe ? 'מצב חישוב אוטומטי (לא ניתן לשינוי ידני)' : 'Automatic calculation mode (cannot be toggled)')
                                    : (isHe ? 'תצוגת פרישה' : 'Retirement view')
                                }
                            >
                                {showRetirementMode ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                                🔮 {isHe ? 'פרישה' : 'Retirement'}
                            </button>
                        )}
                        <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isLight ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/10 text-gray-400'}`}>
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div
                    className="relative z-10 overflow-y-auto custom-scrollbar scrollbar-right p-5 space-y-7"
                    onClickCapture={() => {
                        setTimeout(() => {
                            const tag = document.activeElement?.tagName;
                            if (!['INPUT','TEXTAREA','SELECT'].includes(tag)) barDivRef.current?.focus();
                        }, 0);
                    }}
                >

                    {!hasData ? (
                        <div className={`text-center py-12 text-sm ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                            {isHe ? 'אין נתוני הוצאות להצגה' : 'No expense data to display'}
                        </div>
                    ) : (<>

                    {/* ── Pie section ── */}
                    <div>
                        <div className="flex items-center justify-between mb-4 gap-2">
                            <h3 className={`text-sm font-semibold ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                {isHe ? 'התפלגות הוצאות לפי קטגוריה' : 'Expenses by Category'}
                                {' '}<span className={`text-xs font-normal ${localShowInflation ? (isLight ? 'text-amber-600' : 'text-amber-400') : (isLight ? 'text-slate-400' : 'text-gray-500')}`}>— {pieLabel}{localShowInflation ? ` · ${(inflationRate * 100).toFixed(1)}%` : ''}</span>
                            </h3>
                            {(barData.targets?.[selectedYearIdx ?? defaultYearIdx] || 0) > 0 && (() => {
                                const activeTarget = barData.targets[selectedYearIdx ?? defaultYearIdx] || 0;
                                const gap = activeTarget - pieData.grandTotal;
                                const isPos = gap >= 0;
                                return (
                                    <span dir="ltr" className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-baseline gap-1.5 ${isPos
                                        ? (isLight ? 'bg-green-50 text-green-600 border border-green-300' : 'bg-green-900/20 text-green-400 border border-green-700')
                                        : (isLight ? 'bg-red-50 text-red-600 border border-red-300' : 'bg-red-900/20 text-red-400 border border-red-700')}`}>
                                        <span>{isPos ? '+' : ''}{currency}{Math.abs(Math.round(gap)).toLocaleString()}</span>
                                        <span className="font-normal opacity-70">/ {isHe ? 'חו׳' : 'mo'}</span>
                                        <span className="opacity-40">·</span>
                                        <span>{isPos ? '+' : ''}{currency}{Math.abs(Math.round(gap * 12)).toLocaleString()}</span>
                                        <span className="font-normal opacity-70">/ {isHe ? 'שנה' : 'yr'}</span>
                                    </span>
                                );
                            })()}
                        </div>
                        <div className="flex items-center gap-6">
                            {/* Doughnut */}
                            <div className="relative shrink-0" style={{ width: 170, height: 170 }}>
                                <Doughnut key={chartOpenCountRef.current} data={pieData} options={doughnutOptions} />
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className={`text-[10px] ${localShowInflation ? (isLight ? 'text-amber-600' : 'text-amber-400') : (isLight ? 'text-slate-400' : 'text-gray-500')}`}>
                                        {isHe ? 'סה"כ חודשי' : 'Monthly'}
                                    </span>
                                    <span className={`text-sm font-bold ${localShowInflation ? (isLight ? 'text-amber-600' : 'text-amber-400') : (isLight ? 'text-slate-700' : 'text-white')}`} dir="ltr">
                                        {currency}{Math.round(pieData.grandTotal).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                            {/* Legend */}
                            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5">
                                {pieData.cats.map(({ cat, total, color }) => {
                                    const pct = pieData.grandTotal > 0 ? ((total / pieData.grandTotal) * 100).toFixed(1) : 0;
                                    return (
                                        <div key={cat.id} className="flex items-center gap-1.5 min-w-0">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                                            <span className={`text-xs truncate ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                                {cat.icon} {isHe ? cat.labelHe : cat.labelEn}
                                            </span>
                                            <span className={`text-xs font-semibold shrink-0 ms-auto ${isLight ? 'text-slate-500' : 'text-gray-400'}`} dir="ltr">
                                                {pct}%
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* ── Bar section ── */}
                    {barData.datasets.length > 0 && (
                        <div>
                            {(() => {
                                const activeIdx = selectedYearIdx ?? defaultYearIdx;
                                const savingsDs = showSavings
                                    ? barData.datasets.find(ds => ds.label === 'חיסכון' || ds.label === 'Savings')
                                    : null;
                                const cumulative = savingsDs
                                    ? Math.round(savingsDs.data.slice(0, activeIdx + 1).reduce((s, v) => s + (v || 0) * 12, 0))
                                    : 0;
                                return (
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <h3 className={`text-sm font-semibold ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                            {isHe ? 'הוצאות חודשיות לפי שנת פרישה' : 'Monthly Expenses by Retirement Year'}
                                        </h3>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {showSavings && cumulative > 0 && (() => {
                                                const withdrawalMonths = barData.target > 0 ? Math.floor(cumulative / barData.target) : 0;
                                                const totalMonths = (barData.ages?.length ?? 0) * 12;
                                                const withdrawalPct = totalMonths > 0 ? Math.round(withdrawalMonths / totalMonths * 100) : 0;
                                                const monthlySaved = savingsDs ? (savingsDs.data[activeIdx] || 0) : 0;
                                                const annualSaved = Math.round(monthlySaved * 12);
                                                return (
                                                    <span className={`text-[11px] font-semibold flex items-baseline gap-1 ${isLight ? 'text-green-700' : 'text-green-400'}`}>
                                                        <span className="font-normal opacity-70">{isHe ? 'מצטבר:' : 'Cumulative:'}</span>
                                                        <span dir="ltr">+{currency}{cumulative.toLocaleString()}</span>
                                                        {annualSaved > 0 && (
                                                            <>
                                                                <span className="opacity-40">·</span>
                                                                <span className="font-normal opacity-70">{isHe ? 'שנתי:' : 'Annual:'}</span>
                                                                <span dir="ltr">+{currency}{annualSaved.toLocaleString()}</span>
                                                            </>
                                                        )}
                                                        <span className="opacity-40">·</span>
                                                        {isHe ? (
                                                            <>
                                                                <span className="font-normal opacity-70">חו׳ משיכה</span>
                                                                <span dir="ltr">{withdrawalMonths}</span>
                                                                <span className="font-normal opacity-50" dir="ltr">({withdrawalPct}%)</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span dir="ltr">{withdrawalMonths}</span>
                                                                <span className="font-normal opacity-50" dir="ltr">({withdrawalPct}%)</span>
                                                                <span className="font-normal opacity-70">mo withdrawal</span>
                                                            </>
                                                        )}
                                                    </span>
                                                );
                                            })()}
                                            {barData.target > 0 && (
                                                <button
                                                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                                                    onClick={() => setShowSavings(v => !v)}
                                                    className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${showSavings
                                                        ? (isLight ? 'border-green-400 bg-green-50 text-green-700' : 'border-green-500 bg-green-900/20 text-green-400')
                                                        : (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-white/20 bg-white/5 text-gray-500')}`}
                                                >
                                                    {showSavings ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                                                    {isHe ? 'חיסכון' : 'Savings'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                            <p className={`text-xs mb-4 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {localShowInflation
                                    ? (isHe ? 'כולל השפעת אינפלציה וסיום הלוואות' : 'Includes inflation and loan payoffs')
                                    : (isHe ? 'במחירים של היום, ללא אינפלציה' : 'At today\'s prices, no inflation')}
                            </p>

                            {/* Stacked bar legend */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                                {barData.target > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-5 h-0 border-t-2 border-dashed shrink-0 border-amber-400" />
                                        <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                            {isHe ? 'יעד משיכה' : 'Withdrawal target'}
                                        </span>
                                    </div>
                                )}
                                {barData.datasets.map(ds => {
                                    const color = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[selectedYearIdx ?? defaultYearIdx] : ds.backgroundColor;
                                    return (
                                        <div key={ds.label} className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
                                            <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{ds.label}</span>
                                            {ds.trend && (
                                                <span className={`text-[11px] font-bold ${ds.trend === '↑' ? (isLight ? 'text-red-500' : 'text-red-400') : ds.trend === '↓' ? (isLight ? 'text-green-600' : 'text-green-400') : (isLight ? 'text-slate-400' : 'text-gray-500')}`}>{ds.trend}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div
                                ref={barDivRef}
                                style={{ height: 330, cursor: 'pointer', outline: 'none' }}
                                tabIndex={0}
                                onKeyDown={e => {
                                    const len = barData.ages?.length ?? 0;
                                    if (!len) return;
                                    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                                        e.preventDefault();
                                        const dir = e.key === 'ArrowRight' ? 1 : -1;
                                        setSelectedYearIdx(prev => {
                                            const cur = prev ?? defaultYearIdx;
                                            return (cur + dir + len) % len;
                                        });
                                    }
                                }}
                            >
                                <Bar key={chartOpenCountRef.current} data={barData} options={barOptions} plugins={[yearLabelPlugin]} />
                            </div>
                        </div>
                    )}

                    {barData.expenseTotals?.length > 0 && barData.targets?.some(v => v > 0) && (
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <h3 className={`text-sm font-semibold ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                    {isHe ? 'אחוז התקציב מהיעד לפי שנה' : 'Budget Percent of Target by Year'}
                                </h3>
                                <span className={`text-[11px] ${isLight ? 'text-cyan-700' : 'text-cyan-300'}`}>
                                    {isHe ? 'כולל יעד משיכה משתנה' : 'Variable targets included'}
                                </span>
                            </div>
                            <p className={`text-xs mb-3 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {isHe ? 'כל נקודה משווה את סך ההוצאות החודשי באותה שנה ליעד המשיכה של אותה שנה.' : 'Each point compares that year’s monthly expenses with that year’s withdrawal target.'}
                            </p>
                            <div style={{ height: 190 }}>
                                <Line key={`pct-${chartOpenCountRef.current}`} data={targetPercentData} options={targetPercentOptions} />
                            </div>
                        </div>
                    )}

                    {/* ── Savings slider ── */}
                    {savingsSliderData && (() => {
                        const { totalSavings, FV_bonus, Fend, Fmax } = savingsSliderData;
                        const frac = totalSavings > 0 ? sliderConsumed / totalSavings : 0;
                        // At frac=1 (use all) → Fend exactly; at frac=0 (use none) → Fend+FV_bonus=Fmax
                        const finalBal = Math.round(Fend + (1 - frac) * FV_bonus);
                        const formatM = v => {
                            const abs = Math.abs(v);
                            const sign = v < 0 ? '-' : '';
                            if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(2)}M`;
                            if (abs >= 1_000) return `${sign}${currency}${Math.round(abs / 1000).toLocaleString()}K`;
                            return `${sign}${currency}${abs.toLocaleString()}`;
                        };
                        return (
                            <div className="mt-6">
                                <h3 className={`text-sm font-semibold mb-0.5 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                    {isHe ? 'כמה מהחיסכון אני רוצה לנצל?' : 'How much of the savings to use?'}
                                </h3>
                                <div className={`flex items-baseline justify-between gap-2 flex-wrap mb-4 text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                    <span>
                                        {isHe
                                            ? `סה"כ חיסכון פוטנציאלי לתקופת הפרישה: ${currency}${totalSavings.toLocaleString()}`
                                            : `Total potential savings over retirement: ${currency}${totalSavings.toLocaleString()}`}
                                    </span>
                                    <span className="flex gap-3 shrink-0 text-[11px]" dir="ltr">
                                        <span>{isHe ? 'יתרה בסיסית' : 'Baseline'}: <span className={isLight ? 'text-slate-500' : 'text-gray-400'}>{formatM(Fend)}</span></span>
                                        <span>{isHe ? 'יתרה מקסימלית' : 'Max'}: <span className={isLight ? 'text-slate-500' : 'text-gray-400'}>{formatM(Fmax)}</span></span>
                                    </span>
                                </div>

                                <div dir="ltr" className={`flex justify-between text-[11px] mb-1 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                    <span>{isHe ? 'לא מנצל כלום' : 'Use nothing'}</span>
                                    <span>{isHe ? 'מנצל הכל' : 'Use all'}</span>
                                </div>
                                <div dir="ltr">
                                    <input
                                        type="range"
                                        min={0}
                                        max={totalSavings}
                                        step={10000}
                                        value={sliderConsumed}
                                        onChange={e => setSliderConsumed(+e.target.value)}
                                        className="w-full accent-purple-500 outline-none focus:outline-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-4">
                                    {(() => {
                                        const N = yearGeom.ages.length;
                                        const W = barData.targets?.length
                                            ? barData.targets.reduce((s, v) => s + (v || 0), 0) / barData.targets.length
                                            : 0;
                                        // Monthly from savings portion (based on slider)
                                        const monthlyFromSavings = N > 0 ? Math.round(sliderConsumed / (N * 12)) : 0;
                                        // Monthly from other sources (pension etc.) = target minus what savings covers at full utilization
                                        const monthlyFromOther = N > 0 ? Math.round(W - totalSavings / (N * 12)) : 0;
                                        // Total monthly income = other + savings portion chosen
                                        const totalMonthly = monthlyFromOther + monthlyFromSavings;
                                        const annualUsed = monthlyFromSavings * 12;
                                        return [
                                            {
                                                label: isHe ? 'מנצל מהחיסכון' : 'Using from savings',
                                                value: sliderConsumed,
                                                sub: sliderConsumed > 0 ? `(${currency}${annualUsed.toLocaleString()}${isHe ? '/שנה' : '/yr'})` : null,
                                                color: isLight ? 'text-orange-600' : 'text-orange-400',
                                            },
                                            {
                                                label: isHe ? 'משיכה חודשית ממוצעת' : 'Avg monthly withdrawal',
                                                mainValue: totalMonthly,
                                                fromSavings: monthlyFromSavings,
                                                fromOther: monthlyFromOther,
                                                color: isLight ? 'text-sky-600' : 'text-sky-400',
                                                isMonthly: true,
                                            },
                                            { label: isHe ? 'שומר בקרן' : 'Keeping in fund', value: totalSavings - sliderConsumed, sub: totalSavings > 0 ? `(${Math.round((totalSavings - sliderConsumed) / totalSavings * 100)}%)` : null, color: isLight ? 'text-green-700' : 'text-green-400' },
                                            { label: isHe ? 'יתרה סופית' : 'Final balance', value: finalBal, color: isLight ? 'text-purple-700' : 'text-purple-300', big: true },
                                        ];
                                    })().map((card) => (
                                        <div key={card.label} className={`rounded-xl p-3 text-center ${isLight ? 'bg-slate-100' : 'bg-white/5'}`}>
                                            <div className={`text-[10px] mb-1 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{card.label}</div>
                                            {card.isMonthly ? (
                                                <div dir="ltr">
                                                    <span className={`font-bold text-sm ${card.color}`}>
                                                        {card.mainValue > 0 ? `${currency}${card.mainValue.toLocaleString()}` : '—'}
                                                    </span>
                                                    {card.mainValue > 0 && <span className={`text-[10px] font-normal ms-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? '/חודש' : '/mo'}</span>}
                                                    {card.mainValue > 0 && (
                                                        <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`} dir="ltr">
                                                            <span className={isLight ? 'text-orange-500' : 'text-orange-400'}>{currency}{card.fromSavings.toLocaleString()}</span>
                                                            {isHe ? ' חיסכון' : ' savings'}
                                                            {card.fromOther > 0 && <> + <span className={isLight ? 'text-emerald-600' : 'text-emerald-400'}>{currency}{card.fromOther.toLocaleString()}</span>{isHe ? ' אחר' : ' other'}</>}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className={`font-bold ${card.big ? 'text-base' : 'text-sm'} ${card.color}`} dir="ltr">
                                                    {card.sub && <span className={`text-[10px] font-normal me-1 ${isLight ? 'text-sky-500' : 'text-sky-400'}`}>{card.sub}</span>}{formatM(card.value)}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                            </div>
                        );
                    })()}

                    </>)}
                </div>
            </div>
        </div>,
        document.body
    );
}
