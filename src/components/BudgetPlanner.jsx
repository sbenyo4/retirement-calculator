import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Plus, Trash2, Target, RotateCcw, BrainCircuit, Loader2, Search, X, History, Clock, ToggleLeft, ToggleRight, MessageSquare, Bell, Save, BarChart3, Calculator, RefreshCw, Copy, Undo2, Redo2, TrendingUp, Lock, Unlock, Globe, Car, PiggyBank } from 'lucide-react';
import { MaintenanceCalcPanel } from './MaintenanceCalcPanel';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from 'chart.js';
ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);
import { silenceReminder, syncComponentReminders, nextOccurrenceOf, nextOccurrenceByInterval } from '../hooks/useReminders';
import { useAuth } from '../contexts/AuthContext';
import { getBudgetItems, setBudgetItems, getBudgetAiInsight, setBudgetAiInsight, getUserSettings, setUserSettings } from '../utils/db';
import { getChatResponse } from '../utils/ai-chat';
import { useDraggable } from '../hooks/useDraggable';

const SAVE_DEBOUNCE_MS = 1000;

// ─── AI insight renderer ──────────────────────────────────────────────────────
function renderInline(text, isLight) {
    // Parse **bold** spans
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
            return <strong key={i} className={isLight ? 'text-slate-900 font-semibold' : 'text-white font-semibold'}>{p.slice(2, -2)}</strong>;
        }
        return p;
    });
}

function InsightRenderer({ text, isLight }) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) { i++; continue; } // skip blank lines (handled via spacing)

        // Heading: starts with ## or ### or is ALL-CAPS short line or ends with :
        const isHeading = /^#{1,3}\s/.test(trimmed)
            || (/^[^•\-*]/.test(trimmed) && trimmed.endsWith(':') && trimmed.length < 60);
        if (isHeading) {
            const headText = trimmed.replace(/^#{1,3}\s*/, '').replace(/:$/, '');
            elements.push(
                <div key={i} className={`flex items-center gap-2 mt-4 mb-1.5 first:mt-0 pb-1 border-b ${isLight ? 'border-slate-100' : 'border-white/10'}`}>
                    <span className="w-1 h-4 rounded-full bg-purple-400 shrink-0" />
                    <span className={`text-xs font-bold uppercase tracking-wide ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                        {renderInline(headText, isLight)}
                    </span>
                </div>
            );
            i++; continue;
        }

        // Bullet: starts with -, •, *, or digit+.
        if (/^[-•*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
            const bulletText = trimmed.replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, '');
            elements.push(
                <div key={i} className="flex gap-2 items-start py-0.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                    <span className={`text-sm leading-relaxed ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                        {renderInline(bulletText, isLight)}
                    </span>
                </div>
            );
            i++; continue;
        }

        // Plain paragraph
        elements.push(
            <p key={i} className={`text-sm leading-relaxed mt-2 first:mt-0 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                {renderInline(trimmed, isLight)}
            </p>
        );
        i++;
    }
    return <div className="space-y-0.5">{elements}</div>;
}

// ─── Category metadata ────────────────────────────────────────────────────────
const CATEGORIES = [
    { id: 'housing',       icon: '🏠', labelHe: 'דיור',     labelEn: 'Housing'       },
    { id: 'food',          icon: '🛒', labelHe: 'מזון',     labelEn: 'Food'          },
    { id: 'health',        icon: '🏥', labelHe: 'בריאות',   labelEn: 'Health'        },
    { id: 'transport',     icon: '🚗', labelHe: 'תחבורה',   labelEn: 'Transport'     },
    { id: 'entertainment', icon: '🎭', labelHe: 'בילויים',  labelEn: 'Entertainment' },
    { id: 'personal',      icon: '👤', labelHe: 'אישי',     labelEn: 'Personal'      },
    { id: 'family',        icon: '👨‍👩‍👧', labelHe: 'משפחה',   labelEn: 'Family'        },
    { id: 'misc',          icon: '🔧', labelHe: 'שונות',    labelEn: 'Misc'          },
];

const DEFAULT_ITEMS = [
    { id: 'h-arnona',      categoryId: 'housing',       label: 'ארנונה',               amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-vaad',        categoryId: 'housing',       label: 'ועד בית',              amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-electricity', categoryId: 'housing',       label: 'חשמל',                 amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-water',       categoryId: 'housing',       label: 'מים',                  amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-gas',         categoryId: 'housing',       label: 'גז',                   amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-internet',    categoryId: 'housing',       label: 'אינטרנט + סלולר',      amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-insurance',   categoryId: 'housing',       label: 'ביטוח דירה',           amount: 0, frequency: 'annual',  enabled: true },
    { id: 'h-maintenance', categoryId: 'housing',       label: 'תחזוקת דירה',          amount: 0, frequency: 'annual',  enabled: true, type: 'maintenance-calc' },
    { id: 'f-grocery',     categoryId: 'food',          label: 'קניות וסופר',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 'f-restaurants', categoryId: 'food',          label: 'מסעדות ובתי קפה',      amount: 0, frequency: 'monthly', enabled: true },
    { id: 'hlth-ins',      categoryId: 'health',        label: 'ביטוח בריאות משלים',   amount: 0, frequency: 'monthly', enabled: true },
    { id: 'hlth-doctors',  categoryId: 'health',        label: 'רופאים ותרופות',       amount: 0, frequency: 'monthly', enabled: true },
    { id: 'hlth-dental',   categoryId: 'health',        label: 'שיניים',               amount: 0, frequency: 'annual',  enabled: true },
    { id: 'hlth-optics',   categoryId: 'health',        label: 'אופטיקה',              amount: 0, frequency: 'annual',  enabled: true },
    { id: 't-car-ins',     categoryId: 'transport',     label: 'ביטוח + רישוי רכב',    amount: 0, frequency: 'annual',  enabled: true },
    { id: 't-fuel',        categoryId: 'transport',     label: 'דלק / טעינה',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 't-public',      categoryId: 'transport',     label: 'תחבורה ציבורית',       amount: 0, frequency: 'monthly', enabled: true },
    { id: 'e-sport',       categoryId: 'entertainment', label: 'ספורט וכושר',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 'e-culture',     categoryId: 'entertainment', label: 'תרבות ובידור',         amount: 0, frequency: 'monthly', enabled: true },
    { id: 'e-travel',      categoryId: 'entertainment', label: 'חופשות ונסיעות',       amount: 0, frequency: 'annual',  enabled: true },
    { id: 'p-clothing',    categoryId: 'personal',      label: 'ביגוד והנעלה',         amount: 0, frequency: 'annual',  enabled: true },
    { id: 'p-grooming',    categoryId: 'personal',      label: 'טיפוח ויופי',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 'fam-gifts',     categoryId: 'family',        label: 'מתנות',                amount: 0, frequency: 'monthly', enabled: true },
    { id: 'fam-support',   categoryId: 'family',        label: 'תמיכה בילדים / נכדים', amount: 0, frequency: 'monthly', enabled: true },
    { id: 'm-home',        categoryId: 'misc',          label: 'כלי בית וציוד',        amount: 0, frequency: 'annual',  enabled: true },
    { id: 'm-other',       categoryId: 'misc',          label: 'שונות',                amount: 0, frequency: 'monthly', enabled: true },
];


const getNowYM = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };

// ─── Fixed/Variable classification ───────────────────────────────────────────
const FIXED_BY_DEFAULT_IDS = new Set([
    'h-arnona', 'h-vaad', 'h-internet', 'h-insurance', 'h-maintenance',
    'hlth-ins', 'hlth-dental', 'hlth-optics',
    't-car-ins', 'e-sport', 'fam-support',
]);
function defaultIsFixed(item) {
    if (item.type === 'loan') return true;
    return FIXED_BY_DEFAULT_IDS.has(item.id);
}
function effectiveIsFixed(item) {
    return item.isFixed !== undefined ? item.isFixed : defaultIsFixed(item);
}

// ─── Retirement-adjustment helpers ───────────────────────────────────────────
const RET_JSON_START = '---RETIREMENT_JSON_START---';
const RET_JSON_END   = '---RETIREMENT_JSON_END---';

function parseRetirementAdj(text) {
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

function stripRetirementJson(text) {
    if (!text) return text;
    const s = text.indexOf(RET_JSON_START);
    if (s === -1) return text;
    const e = text.indexOf(RET_JSON_END);
    if (e === -1) return text;
    return (text.slice(0, s) + text.slice(e + RET_JSON_END.length)).trim();
}

function matchIncrease(itemLabel, incLabel) {
    const a = itemLabel.toLowerCase().trim();
    const b = incLabel.toLowerCase().trim();
    return a === b || a.includes(b) || b.includes(a);
}

// Colors aligned with CATEGORIES order
const CAT_COLORS = ['#3b82f6','#22c55e','#ef4444','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#6b7280'];

// ─── Budget Statistics Modal ─────────────────────────────────────────────────
function BudgetStatsModal({ isOpen, onClose, items, inputs, results, inflationRate, showInflation: showInflationProp, isLight, isHe, currency, t: _t, sliderConsumed, setSliderConsumed, retirementAdj, showRetirementMode, setShowRetirementMode }) {
    const { dragStyle, onDragMouseDown } = useDraggable(isOpen);
    const [localShowInflation, setLocalShowInflation] = useState(showInflationProp);
    const [selectedYearIdx, setSelectedYearIdx] = useState(null);
    const [showSavings, setShowSavings] = useState(false);
    const barDivRef = useRef(null);

    // Sync with parent toggle when modal opens
    useEffect(() => {
        if (isOpen) { setLocalShowInflation(showInflationProp); setSelectedYearIdx(null); setShowSavings(false); }
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

    // Per-category retirement delta (today's ₪, inflated when applied)
    const retDeltaByCat = useMemo(() => {
        if (!showRetirementMode || !retirementAdj) return {};
        const map = {};
        (retirementAdj.additions || []).forEach(a => {
            map[a.categoryId] = (map[a.categoryId] || 0) + (a.monthlyAmount || 0);
        });
        (retirementAdj.increases || []).forEach(inc => {
            map[inc.categoryId] = (map[inc.categoryId] || 0) + (inc.increaseAmount || 0);
        });
        return map;
    }, [showRetirementMode, retirementAdj]);

    // ── Helper: compute per-category totals for a given year index ──
    const computeCatTotals = useCallback((yi) => {
        const { yearsToRet, retYM } = yearGeom;
        const yearsFromNow = yearsToRet + yi;
        const inflFactor   = localShowInflation ? Math.pow(1 + inflationRate, yearsFromNow) : 1;
        const atYM         = retYM + yi * 12;

        return CATEGORIES.map((cat, i) => {
            const catItems = items.filter(it => it.categoryId === cat.id && it.enabled !== false);
            const base = catItems.reduce((s, it) => {
                if (it.type === 'loan') {
                    return s + (it.tracks || []).reduce((ts, tr) => {
                        if (!tr.endDate) return ts + (tr.amount || 0);
                        const [y, m] = tr.endDate.split('-').map(Number);
                        if (atYM <= y * 12 + (m - 1))
                            return ts + (tr.amount || 0) * (localShowInflation && tr.inflationAffected ? inflFactor : 1);
                        return ts;
                    }, 0);
                }
                const monthly = it.frequency === 'annual' ? (it.amount || 0) / 12 : (it.amount || 0);
                return s + monthly * inflFactor;
            }, 0);
            const retDelta = (retDeltaByCat[cat.id] || 0) * inflFactor;
            const total = Math.round(base + retDelta);
            return { cat, total, color: CAT_COLORS[i] };
        }).filter(c => c.total > 0);
    }, [items, yearGeom, inflationRate, localShowInflation, retDeltaByCat]);

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
        const target = parseFloat(inputs.monthlyNetIncomeDesired) || 0;

        const datasets = CATEGORIES.map((cat, ci) => {
            const catItems = items.filter(it => it.categoryId === cat.id && it.enabled !== false);
            if (!catItems.length) return null;

            const catRetDelta = retDeltaByCat[cat.id] || 0;
            const data = ages.map((_, yi) => {
                const yearsFromNow = yearsToRet + yi;
                const inflFactor   = localShowInflation ? Math.pow(1 + inflationRate, yearsFromNow) : 1;
                const atYM         = retYM + yi * 12;
                const base = catItems.reduce((s, it) => {
                    if (it.type === 'loan') {
                        return s + (it.tracks || []).reduce((ts, tr) => {
                            if (!tr.endDate) return ts + (tr.amount || 0);
                            const [y, m] = tr.endDate.split('-').map(Number);
                            if (atYM <= y * 12 + (m - 1))
                                return ts + (tr.amount || 0) * (localShowInflation && tr.inflationAffected ? inflFactor : 1);
                            return ts;
                        }, 0);
                    }
                    const monthly = it.frequency === 'annual' ? (it.amount || 0) / 12 : (it.amount || 0);
                    return s + monthly * inflFactor;
                }, 0);
                return Math.round(base + catRetDelta * inflFactor);
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

        // Savings fill above bars up to target
        let totalSavings = 0;
        if (showSavings && target > 0) {
            const barTotals = ages.map((_, yi) =>
                datasets.filter(ds => ds.stack === 'total').reduce((s, ds) => s + (ds.data[yi] || 0), 0)
            );
            const savingsData = barTotals.map(t => Math.max(0, target - t));
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

        const nowYear = new Date().getFullYear();
        const curAge  = parseFloat(inputs.currentAge) || 30;
        const years   = ages.map(a => nowYear + Math.round(a - curAge));
        return { labels: ages.map(a => `${isHe ? 'גיל' : 'Age'} ${a}`), datasets, target, ages, years, loanEndIndices, totalSavings };
    }, [items, inputs, yearGeom, inflationRate, localShowInflation, isHe, selectedYearIdx, defaultYearIdx, showSavings, retDeltaByCat]);

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
            const { target } = barData;
            if (target > 0 && chart.scales.y) {
                const yPos = chart.scales.y.getPixelForValue(target);
                if (yPos >= chartArea.top && yPos <= chartArea.bottom) {
                    ctx.save();
                    ctx.setLineDash([6, 3]);
                    ctx.strokeStyle = '#f59e0b';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(chartArea.left, yPos);
                    ctx.lineTo(chartArea.right, yPos);
                    ctx.stroke();
                    ctx.restore();
                }
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

    // ── Savings slider ─────────────────────────────────────────────────────────

    const savingsSliderData = useMemo(() => {
        const Fend = results?.balanceAtEnd;
        const F0   = results?.balanceAtRetirement;
        const W    = barData.target;
        const { ages } = yearGeom;
        const N = ages.length;
        if (Fend == null || !F0 || F0 <= 0 || !W || !N || !barData.datasets.length) return null;

        const savingsLabel = isHe ? 'חיסכון' : 'Savings';
        const barTotals = ages.map((_, yi) =>
            barData.datasets
                .filter(ds => ds.stack === 'total' && ds.label !== savingsLabel)
                .reduce((s, ds) => s + (ds.data[yi] || 0), 0)
        );
        if (barTotals[0] >= W) return null;

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
            const monthlySaved = Math.max(0, W - barTotals[yi]);
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
    }, [savingsSliderData]);

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
                                onClick={() => setShowRetirementMode(v => !v)}
                                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors shrink-0 ${showRetirementMode
                                    ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500 bg-amber-900/20 text-amber-300')
                                    : (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-white/20 bg-white/5 text-gray-500')}`}
                                title={isHe ? 'תצוגת פרישה' : 'Retirement view'}
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
                            {barData.target > 0 && (() => {
                                const gap = barData.target - pieData.grandTotal;
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
                                <Doughnut data={pieData} options={doughnutOptions} />
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
                                                return (
                                                    <span className={`text-[11px] font-semibold flex items-baseline gap-1 ${isLight ? 'text-green-700' : 'text-green-400'}`}>
                                                        <span className="font-normal opacity-70">{isHe ? 'מצטבר:' : 'Cumulative:'}</span>
                                                        <span dir="ltr">+{currency}{cumulative.toLocaleString()}</span>
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
                                <Bar data={barData} options={barOptions} plugins={[yearLabelPlugin]} />
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
                                        const W = barData.target || 0;
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

// ─── Backup display helper ────────────────────────────────────────────────────
const MAX_BACKUP_SLOTS = 3;

function backupAge(savedAt, isHe) {
    const mins = Math.round((Date.now() - savedAt) / 60000);
    if (mins < 1) return isHe ? 'עכשיו' : 'just now';
    if (mins < 60) return isHe ? `לפני ${mins} דק׳` : `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return isHe ? `לפני ${h} שע׳` : `${h}h ago`;
    return isHe ? `לפני ${Math.floor(h / 24)} ימים` : `${Math.floor(h / 24)}d ago`;
}

const trackActive = (track) => {
    if (!track.endDate) return true;
    const [y, m] = track.endDate.split('-').map(Number);
    return y * 12 + (m - 1) >= getNowYM();
};

const toMonthly = (item) => {
    if (item.type === 'loan') {
        return (item.tracks || []).filter(trackActive).reduce((s, tr) => s + (tr.amount || 0), 0);
    }
    return item.frequency === 'annual' ? (item.amount || 0) / 12 : (item.amount || 0);
};

const isBudgetItemPaused = (item) => item?.status === 'paused' || item?.enabled === false;

function normalizeBudgetItem(item) {
    if (!item) return item;
    const paused = isBudgetItemPaused(item);
    return {
        ...item,
        status: paused ? 'paused' : 'active',
        enabled: !paused
    };
}

function withReminderPausedState(item, enabled) {
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

function mergeBudgetItemUpdate(currentItem, updatedItem) {
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

const trackActiveInFuture = (track, projYears) => {
    if (!track.endDate) return true;
    const [y, m] = track.endDate.split('-').map(Number);
    return y * 12 + (m - 1) >= getNowYM() + Math.round(projYears * 12);
};

const trackActiveInYear = (track, year) => {
    if (!track.endDate) return true;
    return parseInt(track.endDate.split('-')[0]) >= year;
};

// Projected monthly cost accounting for loan end dates and per-track inflation flag
const toProjectedMonthly = (item, projFactor, projYears) => {
    if (item.enabled === false) return 0;
    if (item.type === 'loan') {
        return (item.tracks || [])
            .filter(tr => trackActive(tr) && trackActiveInFuture(tr, projYears))
            .reduce((s, tr) => s + (tr.amount || 0) * (tr.inflationAffected ? projFactor : 1), 0);
    }
    return toMonthly(item) * projFactor;
};

function genId() {
    return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Single item row ──────────────────────────────────────────────────────────
function BudgetItemRow({ item, isHe, isLight, currency, t, onChange, onDelete, onToggleEnabled, projFactor, showInflation, extraActionButton: _extraActionButton, labelAdornment, currentAge, retirementEndAge }) {
    const [editingLabel, setEditingLabel] = useState(false);
    const [labelDraft, setLabelDraft] = useState(item.label);
    const [amountDraft, setAmountDraft] = useState(item.amount === 0 ? '' : String(item.amount));
    const amountFocusedRef = useRef(false);
    useEffect(() => {
        if (!amountFocusedRef.current) {
            setAmountDraft(item.amount === 0 ? '' : String(item.amount));
        }
    }, [item.amount]);
    const [showNote, setShowNote] = useState(false);
    const [noteDraft, setNoteDraft] = useState(item.note || '');
    const [showReminder, setShowReminder] = useState(false);
    const [reminderDate, setReminderDate] = useState(item.reminder?.date || '');
    const [reminderText, setReminderText] = useState(item.reminder?.text || '');
    const [reminderType, setReminderType] = useState(() => item.reminder?.recurring ? (item.reminder?.recurringType || 'monthly') : 'none');
    const [reminderDay, setReminderDay] = useState(item.reminder?.recurringDay || 10);
    const [reminderInterval, setReminderInterval] = useState(item.reminder?.recurringInterval || 7);

    const [showContinuous, setShowContinuous] = useState(false);
    const [continuousDraft, setContinuousDraft] = useState({
        isContinuous: !!item.isContinuous,
        endYear: item.endYear || '',
        growthType: item.growthType || 'fixed',
        growthValue: item.growthValue || ''
    });
    const continuousDirty = continuousDraft.isContinuous !== !!item.isContinuous ||
        continuousDraft.endYear !== (item.endYear || '') ||
        continuousDraft.growthType !== (item.growthType || 'fixed') ||
        continuousDraft.growthValue !== (item.growthValue || '');

    const commitLabel = () => {
        setEditingLabel(false);
        if (labelDraft.trim()) onChange({ ...item, label: labelDraft.trim() });
        else setLabelDraft(item.label);
    };

    const commitAmount = () => {
        const val = parseFloat(amountDraft) || 0;
        setAmountDraft(val === 0 ? '' : String(val));
        onChange({ ...item, amount: val });
    };

    const monthly = toMonthly({ ...item, amount: parseFloat(amountDraft) || 0 });
    const showMonthlyHint = item.frequency === 'annual' && (parseFloat(amountDraft) || 0) > 0;

    const commitNote = () => {
        const trimmed = noteDraft.trim();
        if (trimmed !== (item.note || '').trim()) onChange({ ...item, note: trimmed || undefined });
    };
    const noteDirty = noteDraft.trim() !== (item.note || '').trim();

    return (
        <div id={`budget-item-${item.id}`} className={`relative flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm ${item.enabled !== false ? '' : 'opacity-40'} ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/10'}`}
            dir={isHe ? 'rtl' : 'ltr'}>

            {/* Enable toggle */}
            <button
                onClick={() => onToggleEnabled
                    ? onToggleEnabled(item.id, !(item.enabled !== false))
                    : onChange(withReminderPausedState(item, !(item.enabled !== false)))
                }
                className="shrink-0 p-0.5"
                title={item.enabled !== false ? (isHe ? 'השהה' : 'Pause') : (isHe ? 'הפעל' : 'Enable')}
            >
                {item.enabled !== false
                    ? <ToggleRight size={18} className="text-blue-500" />
                    : <ToggleLeft size={18} className={isLight ? 'text-slate-400' : 'text-gray-400'} />}
            </button>

            {/* Label */}
            {editingLabel ? (
                <input
                    autoFocus
                    value={labelDraft}
                    onChange={e => setLabelDraft(e.target.value)}
                    onBlur={commitLabel}
                    onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setEditingLabel(false); setLabelDraft(item.label); } }}
                    className={`flex-1 min-w-0 text-sm px-1 rounded border ${isLight ? 'border-blue-400 bg-white text-slate-800' : 'border-blue-500 bg-white/10 text-white'} outline-none`}
                />
            ) : (
                <span
                    className="flex-1 min-w-0 truncate cursor-pointer"
                    title={t('budgetClickToEdit')}
                    onClick={() => { setEditingLabel(true); setLabelDraft(item.label); }}
                >
                    {item.label}
                </span>
            )}
            {item.isContinuous && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded border leading-none shrink-0 cursor-default ${isLight ? 'bg-purple-50 border-purple-200 text-purple-600' : 'bg-purple-500/20 border-purple-500/30 text-purple-300'}`}
                      title={isHe ? 'פריט מתמשך עם הגדרות גידול' : 'Continuous item with growth settings'}>
                    {(() => {
                        const parts = [];
                        if (item.growthType === 'fixed') parts.push(`+${currency}${item.growthValue || 0}`);
                        else if (item.growthType === 'percent') parts.push(`+${item.growthValue || 0}%`);
                        else if (item.growthType === 'categoryPercent') parts.push(`+${item.growthValue || 0}% ${isHe ? 'מקטגוריה' : 'cat'}`);
                        if (item.endYear) parts.push(`${isHe ? 'עד (כולל)' : 'till (incl)'} ${item.endYear}`);
                        return parts.join(' | ') || (isHe ? 'מתמשך' : 'Continuous');
                    })()}
                </span>
            )}
            {labelAdornment}

            {/* Amount + annual hint + inflation projection */}
            <div className="flex items-center gap-1 shrink-0" dir="ltr">
                <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{currency}</span>
                <input
                    type="number"
                    min="0"
                    value={amountDraft}
                    placeholder="0"
                    onChange={e => setAmountDraft(e.target.value)}
                    onFocus={() => { amountFocusedRef.current = true; }}
                    onBlur={() => { amountFocusedRef.current = false; commitAmount(); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
                    className={`w-24 text-sm text-end px-1.5 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                />
                {showInflation && monthly > 0 && (
                    <span className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                        → {Math.round(monthly * projFactor)}
                    </span>
                )}
                {showMonthlyHint && (
                    <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                        ≈{Math.round(monthly)}/{t('budgetMonthly')}
                    </span>
                )}
            </div>

            {/* Frequency toggle */}
            <div className={`flex rounded text-xs shrink-0 border ${isLight ? 'border-slate-200' : 'border-white/20'}`}>
                <button
                    onClick={() => onChange({ ...item, frequency: 'monthly' })}
                    className={`px-1.5 py-0.5 rounded-s transition-colors ${item.frequency === 'monthly'
                        ? 'bg-blue-600 text-white'
                        : (isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-gray-400 hover:bg-white/10')}`}
                >
                    {t('budgetMonthly')}
                </button>
                <button
                    onClick={() => onChange({ ...item, frequency: 'annual' })}
                    className={`px-1.5 py-0.5 rounded-e transition-colors ${item.frequency === 'annual'
                        ? 'bg-blue-600 text-white'
                        : (isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-gray-400 hover:bg-white/10')}`}
                >
                    {t('budgetAnnual')}
                </button>
            </div>

            {/* Reminder button */}
            <button
                onMouseDown={e => { e.preventDefault(); setShowReminder(v => !v); setShowNote(false); setShowContinuous(false); }}
                className={`shrink-0 p-0.5 rounded transition-colors ${showReminder
                    ? (isLight ? 'text-blue-600 bg-blue-100' : 'text-blue-400 bg-blue-500/20')
                    : item.reminder?.date
                        ? (isLight ? 'text-blue-500 hover:text-blue-600' : 'text-blue-400 hover:text-blue-300')
                        : (isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400')}`}
                title={isHe ? 'תזכורת' : 'Reminder'}
            >
                <Bell size={13} />
            </button>

            {/* Note button — toggle */}
            <button
                onMouseDown={e => { e.preventDefault(); setShowNote(v => !v); setShowReminder(false); setShowContinuous(false); }}
                className={`shrink-0 p-0.5 rounded transition-colors ${showNote
                    ? (isLight ? 'text-amber-600 bg-amber-100' : 'text-amber-400 bg-amber-500/20')
                    : item.note
                        ? (isLight ? 'text-amber-500 hover:text-amber-600' : 'text-amber-400 hover:text-amber-300')
                        : (isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400')}`}
                title={isHe ? 'הערה' : 'Note'}
            >
                <MessageSquare size={13} />
            </button>

            {/* Delete */}
            <button
                onClick={onDelete}
                className={`shrink-0 p-0.5 rounded transition-colors ${isLight ? 'text-slate-300 hover:text-red-500 hover:bg-red-50' : 'text-gray-600 hover:text-red-400 hover:bg-red-900/20'}`}
            >
                <Trash2 size={13} />
            </button>

            {/* Continuous Settings button */}
            <button
                onMouseDown={e => { e.preventDefault(); setShowContinuous(v => !v); setShowNote(false); setShowReminder(false); }}
                className={`shrink-0 p-0.5 rounded transition-colors ${showContinuous
                    ? (isLight ? 'text-purple-600 bg-purple-100' : 'text-purple-400 bg-purple-500/20')
                    : item.isContinuous
                        ? (isLight ? 'text-purple-500 hover:text-purple-600' : 'text-purple-400 hover:text-purple-300')
                        : (isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400')}`}
                title={isHe ? 'הגדרות מתמשכות (סיום/גידול)' : 'Continuous settings (end/growth)'}
            >
                <TrendingUp size={13} />
            </button>

            {/* Fixed/Variable toggle */}
            <button
                onClick={() => onChange({ ...item, isFixed: !effectiveIsFixed(item) })}
                className={`shrink-0 p-0.5 rounded transition-colors ${effectiveIsFixed(item)
                    ? (isLight ? 'text-orange-500 hover:text-orange-600' : 'text-orange-400 hover:text-orange-300')
                    : (isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400')}`}
                title={effectiveIsFixed(item)
                    ? (isHe ? 'קבוע — לחץ לסמן כמשתנה' : 'Fixed — click to mark variable')
                    : (isHe ? 'משתנה — לחץ לסמן כקבוע' : 'Variable — click to mark fixed')}
            >
                {effectiveIsFixed(item) ? <Lock size={13} /> : <Unlock size={13} />}
            </button>

            {/* Floating reminder panel */}
            {showReminder && (
                <div
                    className={`absolute z-[9999] top-full mt-1 w-52 rounded-lg border shadow-lg overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                    style={{ [isHe ? 'right' : 'left']: '4rem' }}
                    dir={isHe ? 'rtl' : 'ltr'}
                >
                    <div className={`flex items-center justify-between px-2.5 py-2 border-b ${isLight ? 'bg-blue-50 border-blue-100' : 'bg-blue-500/10 border-white/10'}`}>
                        <div className="flex items-center gap-1.5">
                            <Bell size={12} className={isLight ? 'text-blue-500' : 'text-blue-400'} />
                            <span className={`text-[11px] font-semibold ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>
                                {isHe ? `תזכורת — ${item.label}` : `Reminder — ${item.label}`}
                            </span>
                        </div>
                        {item.reminder?.date && (
                            <button
                                onMouseDown={e => { e.preventDefault(); onChange({ ...item, reminder: undefined }); setReminderDate(''); setReminderText(''); setReminderType('none'); setShowReminder(false); }}
                                className={`transition-colors ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}
                                title={isHe ? 'מחק תזכורת' : 'Delete reminder'}
                            ><Trash2 size={11} /></button>
                        )}
                    </div>
                    <div className="p-2.5 space-y-2">
                        <div className="space-y-1.5">
                            <div className={`flex rounded-lg overflow-hidden border text-[10px] font-semibold ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                                {[
                                    { val: 'none', label: isHe ? 'תאריך' : 'Date' },
                                    { val: 'monthly', label: isHe ? 'חודשי' : 'Monthly', icon: true },
                                    { val: 'interval', label: isHe ? 'כל X ימים' : 'Every X days', icon: true },
                                ].map(opt => (
                                    <button key={opt.val} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setReminderType(opt.val)}
                                        className={`flex-1 flex items-center justify-center gap-0.5 py-1.5 transition-colors ${reminderType === opt.val ? (isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-500/30 text-purple-300') : (isLight ? 'bg-white text-slate-400 hover:bg-slate-50' : 'bg-transparent text-gray-500 hover:bg-white/5')}`}>
                                        {opt.icon && <RefreshCw size={8} />}{opt.label}
                                    </button>
                                ))}
                            </div>
                            {reminderType === 'monthly' ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'כל ה-' : 'Day'}</span>
                                    <input type="number" min={1} max={28} value={reminderDay} onChange={e => setReminderDay(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
                                        className={`w-14 px-1.5 py-1 text-xs rounded border outline-none text-center ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/20 bg-white/10 text-gray-200'}`} />
                                    <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'לחודש' : 'of month'}</span>
                                </div>
                            ) : reminderType === 'interval' ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'כל' : 'Every'}</span>
                                    <input type="number" min={1} max={365} value={reminderInterval} onChange={e => setReminderInterval(Math.min(365, Math.max(1, parseInt(e.target.value) || 1)))}
                                        className={`w-14 px-1.5 py-1 text-xs rounded border outline-none text-center ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/20 bg-white/10 text-gray-200'}`} />
                                    <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'ימים' : 'days'}</span>
                                </div>
                            ) : (
                                <input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)}
                                    className={`w-full text-xs px-2 py-1 rounded border outline-none ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/20 bg-white/10 text-gray-200'}`} />
                            )}
                        </div>
                        <div>
                            <label className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'טקסט (אופציונלי)' : 'Note (optional)'}</label>
                            <input
                                type="text"
                                value={reminderText}
                                onChange={e => setReminderText(e.target.value)}
                                placeholder={isHe ? 'למשל: לבדוק מחיר...' : 'e.g. check price...'}
                                className={`mt-0.5 w-full text-xs px-2 py-1 rounded border outline-none ${isLight ? 'border-slate-200 bg-white text-slate-700 placeholder-slate-300' : 'border-white/20 bg-white/10 text-gray-200 placeholder-gray-600'}`}
                            />
                        </div>
                        <button
                            onMouseDown={e => {
                                e.preventDefault();
                                const computedDate = reminderType === 'monthly' ? nextOccurrenceOf(reminderDay) : reminderType === 'interval' ? nextOccurrenceByInterval(reminderInterval) : reminderDate;
                                if (!computedDate) return;
                                silenceReminder(item.id);
                                onChange({ ...item, reminder: {
                                    date: computedDate,
                                    text: reminderText.trim(),
                                    ...(reminderType !== 'none' ? { recurring: true, recurringType: reminderType, ...(reminderType === 'monthly' ? { recurringDay: reminderDay } : { recurringInterval: reminderInterval }) } : {}),
                                }});
                                setShowReminder(false);
                            }}
                            disabled={reminderType === 'none' && !reminderDate}
                            className={`w-full text-xs py-1.5 rounded font-medium transition-colors ${(reminderType !== 'none' || reminderDate)
                                ? (isLight ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-blue-600 text-white hover:bg-blue-500')
                                : (isLight ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-gray-600 cursor-not-allowed')}`}
                        >
                            {isHe ? 'שמור תזכורת' : 'Save reminder'}
                        </button>
                    </div>
                </div>
            )}

            {/* Floating note panel — no layout shift */}
            {showNote && (
                <div
                    className={`absolute z-50 top-full mt-1 w-48 rounded-lg border shadow-lg border-s-4 border-s-amber-400 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-white/20'}`}
                    style={{ [isHe ? 'right' : 'left']: '2rem' }}
                    dir={isHe ? 'rtl' : 'ltr'}
                >
                    {/* Note header with delete */}
                    <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5">
                        <span className={`text-[10px] font-medium truncate ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {isHe ? `הערה ל${item.label}` : `Note: ${item.label}`}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0 ms-1">
                            <button
                                onMouseDown={e => {
                                    e.preventDefault();
                                    if (!noteDirty) return;
                                    commitNote();
                                    setShowNote(false);
                                }}
                                disabled={!noteDirty}
                                className={`transition-colors ${noteDirty
                                    ? (isLight ? 'text-emerald-600 hover:text-emerald-700' : 'text-emerald-400 hover:text-emerald-300')
                                    : (isLight ? 'text-slate-200 cursor-not-allowed' : 'text-gray-600 cursor-not-allowed')}`}
                                title={isHe ? 'שמור הערה' : 'Save note'}
                            >
                                <Save size={11} />
                            </button>
                            {noteDraft && (
                                <button
                                    onMouseDown={e => { e.preventDefault(); setNoteDraft(''); onChange({ ...item, note: undefined }); setShowNote(false); }}
                                    className={`transition-colors ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}
                                    title={isHe ? 'מחק הערה' : 'Delete note'}
                                >
                                    <Trash2 size={11} />
                                </button>
                            )}
                        </div>
                    </div>
                    <textarea
                        autoFocus
                        rows={4}
                        value={noteDraft}
                        onChange={e => setNoteDraft(e.target.value)}
                        onBlur={() => { commitNote(); setShowNote(false); }}
                        onKeyDown={e => { if (e.key === 'Escape') { setNoteDraft(item.note || ''); setShowNote(false); } if (e.key === 'Enter' && e.ctrlKey) { commitNote(); setShowNote(false); } }}
                        placeholder={isHe ? 'הערה חופשית...' : 'Free note...'}
                        className={`w-full text-xs px-2 pb-2 resize-none outline-none leading-relaxed bg-transparent ${isLight ? 'text-slate-700 placeholder-slate-300' : 'text-gray-200 placeholder-gray-600'}`}
                    />
                </div>
            )}

            {/* Floating continuous panel */}
            {showContinuous && (
                <div
                    className={`absolute z-[9999] top-full mt-1 w-56 rounded-lg border shadow-lg overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                    style={{ [isHe ? 'right' : 'left']: '5rem' }}
                    dir={isHe ? 'rtl' : 'ltr'}
                >
                    <div className={`flex items-center justify-between px-2.5 py-2 border-b ${isLight ? 'bg-purple-50 border-purple-100' : 'bg-purple-500/10 border-white/10'}`}>
                        <div className="flex items-center gap-1.5">
                            <TrendingUp size={12} className={isLight ? 'text-purple-500' : 'text-purple-400'} />
                            <span className={`text-[11px] font-semibold ${isLight ? 'text-purple-700' : 'text-purple-300'}`}>
                                {isHe ? `מתמשך — ${item.label}` : `Continuous — ${item.label}`}
                            </span>
                        </div>
                        <label className="flex items-center gap-1 cursor-pointer">
                            <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'פעיל' : 'Active'}</span>
                            <input
                                type="checkbox"
                                checked={continuousDraft.isContinuous}
                                onChange={e => setContinuousDraft(d => ({ ...d, isContinuous: e.target.checked }))}
                                className={`rounded text-purple-500 focus:ring-purple-500 outline-none ${isLight ? 'border-slate-300' : 'border-white/20 bg-white/10'}`}
                            />
                        </label>
                    </div>
                    {continuousDraft.isContinuous && (
                        <div className="p-2.5 space-y-3">
                            <div>
                                <label className={`block text-[10px] font-medium mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'שנת סיום (אופציונלי, כולל)' : 'End Year (optional, inclusive)'}</label>
                                <input
                                    type="number"
                                    value={continuousDraft.endYear}
                                    onChange={e => setContinuousDraft(d => ({ ...d, endYear: e.target.value ? parseInt(e.target.value) || '' : '' }))}
                                    onKeyDown={e => {
                                        if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            setContinuousDraft(d => {
                                                const currentYear = new Date().getFullYear();
                                                const maxYear = currentYear + Math.max(1, Math.round(retirementEndAge - currentAge));
                                                let current = d.endYear ? parseInt(d.endYear) : currentYear;
                                                return { ...d, endYear: Math.min(maxYear, current + 1) };
                                            });
                                        } else if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            setContinuousDraft(d => {
                                                const currentYear = new Date().getFullYear();
                                                const minYear = currentYear + 1;
                                                let current = d.endYear ? parseInt(d.endYear) : minYear + 1;
                                                return { ...d, endYear: Math.max(minYear, current - 1) };
                                            });
                                        }
                                    }}
                                    placeholder={isHe ? 'למשל: 2035' : 'e.g. 2035'}
                                    className={`w-full text-xs px-2 py-1 rounded border outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isLight ? 'border-slate-200 bg-white text-slate-700 placeholder-slate-300' : 'border-white/20 bg-slate-800 text-gray-200 placeholder-gray-600'}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-[10px] font-medium mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'סוג גידול משנה לשנה' : 'Yearly Growth Type'}</label>
                                <select
                                    value={continuousDraft.growthType}
                                    onChange={e => setContinuousDraft(d => ({ ...d, growthType: e.target.value }))}
                                    className={`w-full text-xs px-2 py-1 rounded border outline-none ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/20 bg-slate-800 text-gray-200'}`}
                                >
                                    <option value="fixed" className={isLight ? 'bg-white' : 'bg-slate-800'}>{isHe ? 'סכום קבוע' : 'Fixed amount'}</option>
                                    <option value="percent" className={isLight ? 'bg-white' : 'bg-slate-800'}>{isHe ? 'אחוז קבוע' : 'Fixed percentage'}</option>
                                    <option value="categoryPercent" className={isLight ? 'bg-white' : 'bg-slate-800'}>{isHe ? 'אחוז מהקטגוריה' : 'Percentage of category'}</option>
                                </select>
                            </div>
                            <div>
                                <label className={`block text-[10px] font-medium mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'ערך גידול' : 'Growth Value'}</label>
                                <input
                                    type="number"
                                    value={continuousDraft.growthValue}
                                    onChange={e => setContinuousDraft(d => ({ ...d, growthValue: e.target.value ? parseFloat(e.target.value) || 0 : '' }))}
                                    placeholder={continuousDraft.growthType === 'fixed' ? '0.00' : '0%'}
                                    className={`w-full text-xs px-2 py-1 rounded border outline-none ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/20 bg-slate-800 text-gray-200'}`}
                                />
                            </div>
                        </div>
                    )}
                    <div className="p-2.5 pt-0 mt-2">
                        <button
                            onMouseDown={e => {
                                e.preventDefault();
                                onChange({ ...item, 
                                    isContinuous: continuousDraft.isContinuous,
                                    endYear: continuousDraft.endYear || undefined,
                                    growthType: continuousDraft.growthType,
                                    growthValue: continuousDraft.growthValue !== '' ? continuousDraft.growthValue : undefined
                                });
                                setShowContinuous(false);
                            }}
                            disabled={!continuousDirty}
                            className={`w-full text-xs py-1.5 rounded font-medium transition-colors ${continuousDirty
                                ? (isLight ? 'bg-purple-500 text-white hover:bg-purple-600' : 'bg-purple-600 text-white hover:bg-purple-500')
                                : (isLight ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-gray-600 cursor-not-allowed')}`}
                        >
                            {isHe ? 'שמור שינויים' : 'Save changes'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Loan / Mortgage item (multi-track) ──────────────────────────────────────
function LoanItemRow({ item, isHe, isLight, currency, t, onChange, onDelete, onToggleEnabled, projFactor, projYears, showInflation }) {
    const [open, setOpen] = useState((item.tracks || []).length <= 1); // open by default when freshly created
    const [editingLabel, setEditingLabel] = useState(false);
    const [labelDraft, setLabelDraft] = useState(item.label);
    const [trackDrafts, setTrackDrafts] = useState(() =>
        Object.fromEntries((item.tracks || []).map(tr => [tr.id, { label: tr.label, amount: tr.amount === 0 ? '' : String(tr.amount) }]))
    );

    // Sync drafts when a new track is added externally
    useEffect(() => {
        setTrackDrafts(prev => {
            const next = { ...prev };
            (item.tracks || []).forEach(tr => {
                if (!next[tr.id]) next[tr.id] = { label: tr.label, amount: tr.amount === 0 ? '' : String(tr.amount) };
            });
            return next;
        });
    }, [item.tracks]);

    const monthsLeft = (endDate) => {
        if (!endDate) return null;
        const [y, m] = endDate.split('-').map(Number);
        return y * 12 + (m - 1) - getNowYM();
    };

    const activeMonthly = (item.tracks || []).filter(trackActive).reduce((s, tr) => s + (tr.amount || 0), 0);

    const updateTrack = (trackId, changes) =>
        onChange({ ...item, tracks: (item.tracks || []).map(tr => tr.id === trackId ? { ...tr, ...changes } : tr) });

    const deleteTrack = (trackId) =>
        onChange({ ...item, tracks: (item.tracks || []).filter(tr => tr.id !== trackId) });

    const addTrack = () => {
        const newTrack = { id: genId(), label: t('budgetTrack'), amount: 0, endDate: '', inflationAffected: false };
        setTrackDrafts(prev => ({ ...prev, [newTrack.id]: { label: newTrack.label, amount: '' } }));
        onChange({ ...item, tracks: [...(item.tracks || []), newTrack] });
    };

    const commitLabel = () => {
        setEditingLabel(false);
        if (labelDraft.trim()) onChange({ ...item, label: labelDraft.trim() });
        else setLabelDraft(item.label);
    };

    return (
        <div id={`budget-item-${item.id}`} className={`rounded-lg border my-1 ${item.enabled !== false ? '' : 'opacity-40'} ${isLight ? 'border-indigo-100 bg-indigo-50/40' : 'border-indigo-500/20 bg-indigo-900/10'}`}>
            {/* Header — click chevron area to toggle tracks */}
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm" dir={isHe ? 'rtl' : 'ltr'}>
                <button
                    onClick={() => onToggleEnabled
                        ? onToggleEnabled(item.id, !(item.enabled !== false))
                        : onChange(withReminderPausedState(item, !(item.enabled !== false)))
                    }
                    className="shrink-0 p-0.5"
                    title={item.enabled !== false ? (isHe ? 'השהה' : 'Pause') : (isHe ? 'הפעל' : 'Enable')}
                >
                    {item.enabled !== false
                        ? <ToggleRight size={18} className="text-blue-500" />
                        : <ToggleLeft size={18} className={isLight ? 'text-slate-400' : 'text-gray-400'} />}
                </button>
                <span className="shrink-0">🏦</span>
                {editingLabel ? (
                    <input autoFocus value={labelDraft}
                        onChange={e => setLabelDraft(e.target.value)}
                        onBlur={commitLabel}
                        onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setEditingLabel(false); setLabelDraft(item.label); } }}
                        className={`flex-1 text-sm px-1 rounded border ${isLight ? 'border-blue-400 bg-white text-slate-800' : 'border-blue-500 bg-white/10 text-white'} outline-none`}
                    />
                ) : (
                    <span className="flex-1 font-medium cursor-pointer truncate" onClick={() => { setEditingLabel(true); setLabelDraft(item.label); }}>
                        {item.label}
                    </span>
                )}
                {showInflation && (() => {
                    const activeTracks = (item.tracks || []).filter(trackActive);
                    const linkedCount = activeTracks.filter(tr => tr.inflationAffected).length;
                    const allLinked = activeTracks.length > 0 && linkedCount === activeTracks.length;
                    const partial = linkedCount > 0 && linkedCount < activeTracks.length;
                    const label = allLinked ? (isHe ? 'צמוד' : 'CPI') : partial ? (isHe ? 'צמוד חלקי' : 'partial CPI') : (isHe ? 'קבוע' : 'fixed');
                    const colorClass = allLinked
                        ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500 bg-amber-900/20 text-amber-400')
                        : partial
                        ? (isLight ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-orange-400 bg-orange-900/20 text-orange-400')
                        : (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-white/20 bg-white/5 text-gray-500');
                    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${colorClass}`}>{label}</span>;
                })()}
                {activeMonthly > 0 && (
                    <span className="flex items-baseline gap-1 shrink-0" dir="ltr">
                        <span className={`text-sm font-semibold ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
                            {currency}{Math.round(activeMonthly).toLocaleString()}/{t('budgetMonthly')}
                        </span>
                        {showInflation && (() => {
                            const proj = toProjectedMonthly(item, projFactor, projYears);
                            return (
                                <span className={`text-xs font-normal ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {proj > 0 ? `${currency}${Math.round(proj).toLocaleString()}` : (isHe ? 'יסתיים' : 'ends')}
                                </span>
                            );
                        })()}
                    </span>
                )}
                <button onClick={() => setOpen(o => !o)}
                    className={`shrink-0 p-0.5 rounded transition-colors ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}>
                    {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button
                    onClick={() => onChange({ ...item, isFixed: !effectiveIsFixed(item) })}
                    className={`shrink-0 p-0.5 rounded transition-colors ${effectiveIsFixed(item)
                        ? (isLight ? 'text-orange-500 hover:text-orange-600' : 'text-orange-400 hover:text-orange-300')
                        : (isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400')}`}
                    title={effectiveIsFixed(item)
                        ? (isHe ? 'קבוע — לחץ לסמן כמשתנה' : 'Fixed — click to mark variable')
                        : (isHe ? 'משתנה — לחץ לסמן כקבוע' : 'Variable — click to mark fixed')}
                >
                    {effectiveIsFixed(item) ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                <button onClick={onDelete} className={`shrink-0 p-0.5 rounded ${isLight ? 'text-slate-300 hover:text-red-500 hover:bg-red-50' : 'text-gray-600 hover:text-red-400 hover:bg-red-900/20'}`}>
                    <Trash2 size={13} />
                </button>
            </div>

            {/* Tracks list — collapsible */}
            {open && <div className="px-2 pb-2 space-y-1">
                {(item.tracks || []).map(track => {
                    const active = trackActive(track);
                    const ml = monthsLeft(track.endDate);
                    const draft = trackDrafts[track.id] || { label: track.label, amount: String(track.amount || '') };
                    return (
                        <div key={track.id} dir={isHe ? 'rtl' : 'ltr'}
                            className={`flex flex-wrap items-center gap-1.5 text-xs px-1.5 py-1 rounded border ${
                                active
                                    ? (isLight ? 'border-slate-100 bg-white' : 'border-white/10 bg-white/5')
                                    : (isLight ? 'border-slate-100 bg-slate-50 opacity-50' : 'border-white/5 bg-white/5 opacity-50')
                            }`}>
                            {/* Track label */}
                            <input
                                value={draft.label}
                                onChange={e => setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], label: e.target.value } }))}
                                onBlur={() => { const l = (trackDrafts[track.id]?.label || '').trim(); if (l) updateTrack(track.id, { label: l }); }}
                                onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                                className={`w-20 px-1 py-0.5 rounded border text-xs ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                            />
                            {/* Monthly amount */}
                            <div className="flex items-center gap-0.5 shrink-0">
                                <span className={`${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{currency}</span>
                                <input type="number" min="0" value={draft.amount} placeholder="0"
                                    onChange={e => setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], amount: e.target.value } }))}
                                    onBlur={() => {
                                        const val = parseFloat(trackDrafts[track.id]?.amount) || 0;
                                        updateTrack(track.id, { amount: val });
                                        setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], amount: val === 0 ? '' : String(val) } }));
                                    }}
                                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                                    className={`w-20 text-end px-1 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                                />
                                <span className={`shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>/{t('budgetMonthly')}</span>
                            </div>
                            {/* End date */}
                            <div className="flex items-center gap-0.5 flex-1 min-w-0">
                                <span className={`shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{t('budgetEndDate')}:</span>
                                <input type="month" value={track.endDate || ''}
                                    onChange={e => updateTrack(track.id, { endDate: e.target.value })}
                                    className={`flex-1 min-w-0 px-1 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-600' : 'border-white/20 bg-white/10 text-gray-300'} outline-none focus:border-blue-400`}
                                />
                            </div>
                            {/* Status badge */}
                            {track.endDate && (
                                <span className={`shrink-0 px-1.5 py-0.5 rounded-full font-medium ${active
                                    ? 'bg-emerald-500/20 text-emerald-600'
                                    : 'bg-red-500/20 text-red-500'}`}>
                                    {active
                                        ? (ml !== null ? `${ml}m` : '∞')
                                        : t('budgetLoanDone')}
                                </span>
                            )}
                            {showInflation && (
                                <button
                                    onClick={() => updateTrack(track.id, { inflationAffected: !track.inflationAffected })}
                                    className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 transition-colors ${track.inflationAffected
                                        ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500 bg-amber-900/20 text-amber-400')
                                        : (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-white/20 bg-white/5 text-gray-500')}`}
                                    title={isHe ? (track.inflationAffected ? 'צמוד מדד' : 'קבוע') : (track.inflationAffected ? 'CPI-linked' : 'Fixed rate')}
                                >
                                    {isHe ? (track.inflationAffected ? 'צמוד' : 'קבוע') : (track.inflationAffected ? 'CPI' : 'fixed')}
                                </button>
                            )}
                            <button onClick={() => deleteTrack(track.id)}
                                className={`shrink-0 p-0.5 rounded ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}>
                                <Trash2 size={11} />
                            </button>
                        </div>
                    );
                })}
                <button onClick={addTrack} dir={isHe ? 'rtl' : 'ltr'}
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${isLight ? 'text-indigo-600 hover:bg-indigo-50' : 'text-indigo-400 hover:bg-indigo-900/20'}`}>
                    <Plus size={11} />
                    {t('budgetAddTrack')}
                </button>
            </div>}
        </div>
    );
}

// ─── Housing Maintenance Calculator item ─────────────────────────────────────
function MaintenanceCalcItemRow({ item, isHe, isLight, currency, t, onChange, onDelete, onToggleEnabled, projFactor, showInflation, householdSize, aiProvider, aiModel, apiKeyOverride }) {
    const [showCalc, setShowCalc] = useState(false);

    const calcButton = (
        <button
            onMouseDown={e => { e.preventDefault(); setShowCalc(v => !v); }}
            className={`shrink-0 p-0.5 rounded transition-colors ${
                showCalc
                    ? (isLight ? 'text-teal-600 bg-teal-100' : 'text-teal-400 bg-teal-500/20')
                    : item.calcInputs?.sqm
                        ? (isLight ? 'text-teal-500 hover:text-teal-600' : 'text-teal-400 hover:text-teal-300')
                        : (isLight ? 'text-slate-300 hover:text-teal-500' : 'text-gray-600 hover:text-teal-400')
            }`}
            title={isHe ? 'מחשבון תחזוקה' : 'Maintenance calculator'}
        >
            <Calculator size={13} />
        </button>
    );

    return (
        <div>
            <BudgetItemRow
                item={item}
                isHe={isHe}
                isLight={isLight}
                currency={currency}
                t={t}
                onChange={onChange}
                onDelete={onDelete}
                onToggleEnabled={onToggleEnabled}
                projFactor={projFactor}
                showInflation={showInflation}
                labelAdornment={calcButton}
            />
            {showCalc && (
                <MaintenanceCalcPanel
                    item={item}
                    isHe={isHe}
                    isLight={isLight}
                    currency={currency}
                    householdSize={householdSize}
                    aiProvider={aiProvider}
                    aiModel={aiModel}
                    apiKeyOverride={apiKeyOverride}
                    onApply={({ amount, calcInputs }) => {
                        onChange({ ...item, amount, frequency: 'annual', calcInputs });
                        setShowCalc(false);
                    }}
                />
            )}
        </div>
    );
}

// ─── Category accordion ───────────────────────────────────────────────────────
function CategorySection({ category, items, isHe, isLight, currency, t, open, onToggle, onChangeItem, onDeleteItem, onToggleItemEnabled, onAddItem, onAddLoanItem, onAddMaintenanceItem, onToggleAll, projFactor, projYears, showInflation, totalMonthly, householdSize, aiProvider, aiModel, apiKeyOverride, retirementOverlay, currentAge, retirementEndAge }) {
    const label = isHe ? category.labelHe : category.labelEn;
    const enabledItems = items.filter(i => i.enabled !== false);
    const categoryTotal = enabledItems.reduce((s, i) => s + toMonthly(i), 0);
    const categoryProjected = enabledItems.reduce((s, i) => s + toProjectedMonthly(i, projFactor, projYears), 0);

    const retAdditions = retirementOverlay?.additions?.filter(a => a.categoryId === category.id) ?? [];
    const retIncreases = retirementOverlay?.increases?.filter(inc => inc.categoryId === category.id) ?? [];
    const retDelta = retirementOverlay
        ? retAdditions.reduce((s, a) => s + (a.monthlyAmount || 0), 0) +
          retIncreases.reduce((s, inc) => s + (inc.increaseAmount || 0), 0)
        : 0;
    const disabledCount = items.length - enabledItems.length;
    const allDisabled = items.length > 0 && enabledItems.length === 0;
    const notesCount = items.filter(i => i.note?.trim()).length;
    const remindersCount = items.filter(i => i.enabled !== false && i.reminder?.date).length;

    return (
        <div className={`rounded-xl border transition-opacity ${allDisabled ? 'opacity-50' : ''} ${isLight ? 'border-slate-200 bg-white' : 'border-white/20 bg-white/10'}`}>
            <div
                className={`sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium backdrop-blur-md ${isLight ? 'bg-white' : 'bg-white/10'}`}
                dir={isHe ? 'rtl' : 'ltr'}
            >
                <button tabIndex={-1} onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-start select-none outline-none focus:outline-none">
                    <span className="text-base shrink-0">{category.icon}</span>
                    <span className="flex-1 min-w-0 truncate">
                        {label} <span className="font-normal opacity-60">({items.length})</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        {notesCount > 0 && (
                            <span className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-400'}`} title={isHe ? 'הערות' : 'Notes'}>
                                <MessageSquare size={10} />
                                {notesCount}
                            </span>
                        )}
                        {remindersCount > 0 && (
                            <span className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'}`} title={isHe ? 'תזכורות' : 'Reminders'}>
                                <Bell size={10} />
                                {remindersCount}
                            </span>
                        )}
                    </div>
                </button>
                {disabledCount > 0 && (
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isLight ? 'bg-amber-100 text-amber-600' : 'bg-amber-500/20 text-amber-400'}`}>
                        {isHe ? `${disabledCount} מושהה` : `${disabledCount} paused`}
                    </span>
                )}
                {categoryTotal > 0 && (
                    <span className="flex items-baseline gap-1 shrink-0" dir="ltr">
                        <span className={`text-sm font-semibold ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                            {currency}{Math.round(categoryTotal).toLocaleString()}
                        </span>
                        {totalMonthly > 0 && (
                            <span className={`text-xs font-medium ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                ({Math.round(categoryTotal / totalMonthly * 100)}%)
                            </span>
                        )}
                        {showInflation && (
                            <span className={`text-xs font-normal ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                → {currency}{Math.round(categoryProjected).toLocaleString()}
                            </span>
                        )}
                        {retDelta > 0 && (
                            <span className={`text-xs font-semibold px-1 py-0.5 rounded ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-300'}`}>
                                +{currency}{Math.round(retDelta).toLocaleString()}
                            </span>
                        )}
                    </span>
                )}
                <button
                    onClick={e => { e.stopPropagation(); onToggleAll(); }}
                    title={allDisabled ? (isHe ? 'הפעל הכל' : 'Enable all') : (isHe ? 'השהה הכל' : 'Pause all')}
                    className="shrink-0 p-0.5"
                >
                    {allDisabled
                        ? <ToggleLeft size={18} className={isLight ? 'text-slate-400' : 'text-gray-400'} />
                        : <ToggleRight size={18} className="text-blue-500" />}
                </button>
                <button onClick={onToggle} className="shrink-0 opacity-50">
                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
            </div>

            {open && (
                <div className="px-2 pb-2 space-y-0.5">
                    {items.map(item => {
                        const inc = retIncreases.find(r => matchIncrease(item.label, r.itemLabel));
                        const retBadge = inc && item.enabled !== false ? (
                            <span className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isLight ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`} dir="ltr">
                                🔮 +{currency}{(inc.increaseAmount || 0).toLocaleString()}
                                {inc.increasePercent ? ` (+${inc.increasePercent}%)` : ''}
                            </span>
                        ) : null;
                        if (item.type === 'loan') return (
                            <LoanItemRow
                                key={item.id}
                                item={item}
                                isHe={isHe}
                                isLight={isLight}
                                currency={currency}
                                t={t}
                                onChange={onChangeItem}
                                onDelete={() => onDeleteItem(item.id)}
                                onToggleEnabled={onToggleItemEnabled}
                                projFactor={projFactor}
                                projYears={projYears}
                                showInflation={showInflation}
                            />
                        );
                        if (item.type === 'maintenance-calc') return (
                            <MaintenanceCalcItemRow
                                key={item.id}
                                item={item}
                                isHe={isHe}
                                isLight={isLight}
                                currency={currency}
                                t={t}
                                onChange={onChangeItem}
                                onDelete={() => onDeleteItem(item.id)}
                                onToggleEnabled={onToggleItemEnabled}
                                projFactor={projFactor}
                                showInflation={showInflation}
                                householdSize={householdSize}
                                aiProvider={aiProvider}
                                aiModel={aiModel}
                                apiKeyOverride={apiKeyOverride}
                            />
                        );
                        return (
                            <BudgetItemRow
                                key={item.id}
                                item={item}
                                isHe={isHe}
                                isLight={isLight}
                                currency={currency}
                                t={t}
                                onChange={onChangeItem}
                                onDelete={() => onDeleteItem(item.id)}
                                onToggleEnabled={onToggleItemEnabled}
                                projFactor={projFactor}
                                showInflation={showInflation}
                                labelAdornment={retBadge}
                                currentAge={currentAge}
                                retirementEndAge={retirementEndAge}
                            />
                        );
                    })}
                    {retAdditions.map(a => (
                        <div key={`ret-add-${a.label}`} className={`flex items-center justify-between px-3 py-2 rounded-lg border-2 border-dashed text-sm ${isLight ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-amber-500/50 bg-amber-500/10 text-amber-300'}`} dir={isHe ? 'rtl' : 'ltr'}>
                            <span className="flex items-center gap-2 min-w-0">
                                <span className="opacity-60 shrink-0">🔮</span>
                                <span className="font-medium truncate">{a.label}</span>
                                {a.note && <span className="text-[10px] opacity-60 truncate hidden sm:inline">{a.note}</span>}
                            </span>
                            <span className="font-bold shrink-0 ms-2" dir="ltr">+{currency}{(a.monthlyAmount || 0).toLocaleString()}</span>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 mt-1 flex-wrap" dir={isHe ? 'rtl' : 'ltr'}>
                        <button
                            onClick={onAddItem}
                            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg transition-colors ${isLight ? 'text-blue-600 hover:bg-blue-50' : 'text-blue-400 hover:bg-blue-900/20'}`}
                        >
                            <Plus size={12} />
                            {t('budgetAddItem')}
                        </button>
                        <button
                            onClick={onAddLoanItem}
                            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg transition-colors ${isLight ? 'text-indigo-600 hover:bg-indigo-50' : 'text-indigo-400 hover:bg-indigo-900/20'}`}
                        >
                            <Plus size={12} />
                            {t('budgetAddLoan')}
                        </button>
                        {category.id === 'housing' && onAddMaintenanceItem && (
                            <button
                                onClick={onAddMaintenanceItem}
                                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg transition-colors ${isLight ? 'text-teal-600 hover:bg-teal-50' : 'text-teal-400 hover:bg-teal-900/20'}`}
                            >
                                <Plus size={12} />
                                <Calculator size={11} />
                                {isHe ? 'תחזוקת דירה' : 'Maintenance'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
// ─── Location suggestions modal ───────────────────────────────────────────────

const COST_KEYS = [
    { key: 'rent',          labelHe: 'דיור',     labelEn: 'Housing'       },
    { key: 'food',          labelHe: 'אוכל',     labelEn: 'Food'          },
    { key: 'transport',     labelHe: 'תחבורה',   labelEn: 'Transport'     },
    { key: 'entertainment', labelHe: 'בילויים',  labelEn: 'Entertainment' },
    { key: 'flights',       labelHe: 'טיסה לטיול בודד', labelEn: 'Flight for one trip' },
    { key: 'carRental',     labelHe: 'שכירת רכב', labelEn: 'Car rental'    },
    { key: 'other',         labelHe: 'אחרים',    labelEn: 'Other'         },
];
const TIER_META = {
    cheap:     { labelHe: 'זול',    labelEn: 'Budget',  color: 'green'  },
    medium:    { labelHe: 'בינוני', labelEn: 'Medium',  color: 'blue'   },
    expensive: { labelHe: 'יקר',    labelEn: 'Premium', color: 'purple' },
};

const LOCATION_CARD_STYLES = [
    {
        card: { light: 'bg-gradient-to-br from-sky-50 to-blue-100 border-sky-200', dark: 'bg-gradient-to-br from-sky-500/15 to-blue-600/20 border-sky-400/25' },
        chip: { light: 'bg-sky-100 text-sky-700', dark: 'bg-sky-400/15 text-sky-200' },
    },
    {
        card: { light: 'bg-gradient-to-br from-emerald-50 to-teal-100 border-emerald-200', dark: 'bg-gradient-to-br from-emerald-500/15 to-teal-600/20 border-emerald-400/25' },
        chip: { light: 'bg-emerald-100 text-emerald-700', dark: 'bg-emerald-400/15 text-emerald-200' },
    },
    {
        card: { light: 'bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200', dark: 'bg-gradient-to-br from-amber-500/15 to-orange-600/20 border-amber-400/25' },
        chip: { light: 'bg-amber-100 text-amber-700', dark: 'bg-amber-400/15 text-amber-200' },
    },
    {
        card: { light: 'bg-gradient-to-br from-rose-50 to-pink-100 border-rose-200', dark: 'bg-gradient-to-br from-rose-500/15 to-pink-600/20 border-rose-400/25' },
        chip: { light: 'bg-rose-100 text-rose-700', dark: 'bg-rose-400/15 text-rose-200' },
    },
    {
        card: { light: 'bg-gradient-to-br from-violet-50 to-fuchsia-100 border-violet-200', dark: 'bg-gradient-to-br from-violet-500/15 to-fuchsia-600/20 border-violet-400/25' },
        chip: { light: 'bg-violet-100 text-violet-700', dark: 'bg-violet-400/15 text-violet-200' },
    },
    {
        card: { light: 'bg-gradient-to-br from-cyan-50 to-lime-100 border-cyan-200', dark: 'bg-gradient-to-br from-cyan-500/15 to-lime-600/20 border-cyan-400/25' },
        chip: { light: 'bg-cyan-100 text-cyan-700', dark: 'bg-cyan-400/15 text-cyan-200' },
    },
];

const COST_OF_LIVING_PRICE_CONTEXT = `
Use real 2026 market ranges and return every numeric amount in Israeli shekels (ILS/NIS), not USD/EUR/THB.
Currency anchors for conversion: USD ~= ILS 2.9, EUR ~= ILS 3.4, THB ~= ILS 0.09.
Do not confuse local currency with shekels. Cheap long-haul airfare is never a few hundred shekels; convert local prices before returning JSON.
costs.rent is HOUSING: a realistic monthly housing cost for the selected lifestyle tier. Add housingType and housingLevel to explain whether this is an apartment, serviced apartment, hotel/guesthouse, and what standard/location it assumes.
For the requested trip length, also return tripHousingCost and tripFoodCost when possible:
- For short stays (1-14 nights), tripHousingCost should be the actual total accommodation cost for those nights, using realistic short-stay options for the tier: hostel/private room/simple guesthouse/budget hotel/short-stay apartment as appropriate. Do not derive it only by dividing monthly rent by 30.
- For medium stays (15-27 nights), use realistic weekly/short monthly discounts when available.
- For 28+ nights, monthly apartment rent can be appropriate.
- tripFoodCost should reflect the requested trip length and tier: groceries/local meals for budget, mixed groceries/restaurants for moderate, more restaurants for premium. Do not simply divide monthly food if the trip length implies tourist eating patterns.
Food, transport, entertainment and other in costs should still be monthly living costs.
costs.flights is NOT monthly. It must be the current economy round-trip airfare for ONE TRIP from Tel Aviv (TLV) to the nearest practical airport, per adult, in ILS.
flightRoundTrip must equal costs.flights.
If car rental is requested, treat it as "consider car rental", not mandatory. Set costs.carRental to 0 when a car is not useful for that destination (dense/traffic-heavy cities, strong public transport, high parking cost, unsafe driving, or mostly city stay). Add car rental only for places where it materially improves the trip, such as island/coastal/rural destinations, road-trip bases, or spread-out areas. Examples: use 0 for Bangkok city; consider a car for Larnaca/Cyprus day trips. When included, costs.carRental must be a realistic total car rental cost for the requested car days in ILS, including basic insurance and local taxes. If car rental is not requested, return 0.
If airfare is uncertain, use conservative annual round-trip anchors from TLV: nearby Middle East ILS 700-1,800; Europe/North Africa/Caucasus ILS 900-2,800; Gulf/Central Asia ILS 1,200-3,200; South/East/Southeast Asia ILS 2,200-5,500; Africa beyond North Africa ILS 2,500-6,000; North America ILS 2,600-6,000; Latin America/Australia/New Zealand ILS 4,000-8,500.
Lifestyle tiers:
- budget-friendly: lower-cost but still safe/local standard for that specific destination. Housing = modest studio/room/small apartment or simple guesthouse in a safe non-luxury area, not the most central/high-demand neighborhood. Food = mostly groceries, markets and local inexpensive restaurants, very few western/tourist restaurants. Transport = public transport, walking, shared rides or local taxis only when needed. Entertainment = low-cost local activities, limited paid attractions/nightlife. Other = basic phone/internet/laundry/small essentials. This tier should feel frugal but livable, not unsafe or unrealistic.
- moderate: normal comfortable long-stay standard for that specific destination. Housing = comfortable private one-bedroom/studio or serviced apartment in a convenient but not top luxury area, with reliable internet/utilities. Food = groceries plus regular cafes/restaurants, including some international options. Transport = good public transport plus occasional taxis/rideshare. Entertainment = regular gym/cafes/activities and a few paid attractions. Other = comfortable routine expenses and small buffers. This tier should feel practical and comfortable, not premium.
- premium: high-comfort local market for that specific destination. Housing = central/high-demand area or high-quality apartment/serviced apartment/hotel-standard stay. Food = frequent restaurants, cafes and higher-quality groceries. Transport = taxis/rideshare often or car budget when normal for that city. Entertainment = frequent paid activities, nightlife, tours, wellness/gym/coworking where relevant. Other = higher service level and convenience buffers. This tier should feel clearly above moderate but not absurd ultra-luxury.
The selected lifestyle tier must be based on the local market of each city, not a universal global cap. For the same destination, budget-friendly should be clearly cheaper than moderate, and moderate clearly cheaper than premium because housing type/location, food choices, transport and entertainment assumptions change.
For each location, costs.rent, food, transport, entertainment and other must all match the selected tier. In housingType/housingLevel and note, briefly describe the assumptions that justify the tier and trip length, such as hotel/private room/apartment, central vs non-central area, mostly local food vs frequent restaurants, and public transport vs taxis.
For the chosen tier, choose cities where the requested stay length including one round-trip flight is plausible within the budget if possible. If not possible, return the closest realistic options and explain the mismatch in budgetNote.
Return 8 diverse city options across different regions when possible, mixing places that fit the budget and aspirational places that may only fit for a shorter stay.
total must equal monthly living costs only: rent + food + transport + entertainment + other. The app will add costs.flights, tripHousingCost/tripFoodCost when relevant, and costs.carRental to check whether the trip fits the budget.
`;

const TIER_PRICE_FLOORS = {
    cheap:     { rent: 900,  food: 700,  transport: 120, entertainment: 250, other: 250 },
    medium:    { rent: 1600, food: 1100, transport: 220, entertainment: 550, other: 450 },
    expensive: { rent: 3000, food: 1800, transport: 450, entertainment: 1200, other: 900 },
};

const SHORT_STAY_HOUSING_MIN_NIGHTLY = {
    cheap: 160,
    medium: 300,
    expensive: 650,
};

const SHORT_STAY_HOUSING_FACTOR = {
    cheap: 2.1,
    medium: 2.35,
    expensive: 2.7,
};

const DEFAULT_TRIP_DAYS = 30;

function normalizeTripDays(value) {
    const days = Math.floor(numberOrZero(value));
    if (!days) return DEFAULT_TRIP_DAYS;
    return Math.max(1, Math.min(DEFAULT_TRIP_DAYS, days));
}

function normalizeTripBudget(value, fallback) {
    const budget = Math.round(numberOrZero(value));
    return budget > 0 ? budget : Math.max(0, Math.round(numberOrZero(fallback)));
}

function normalizeCarRentalDays(value, tripDays) {
    const days = Math.floor(numberOrZero(value));
    if (!days) return tripDays;
    return Math.max(1, Math.min(tripDays, days));
}

function normalizeTierLivingCost(key, value, selectedTier) {
    if (key === 'flights' || key === 'carRental') return value;
    const raw = Math.max(0, Math.round(value || 0));
    if (!raw) return 0;
    const floor = TIER_PRICE_FLOORS[selectedTier]?.[key] ?? 0;
    return Math.max(floor, raw);
}

function housingNightlyCost(costs, selectedTier, nights) {
    const monthlyRent = Math.max(0, Math.round(costs?.rent || 0));
    const monthlyNightly = monthlyRent > 0 ? monthlyRent / DEFAULT_TRIP_DAYS : 0;
    if (nights <= 14) {
        const factor = SHORT_STAY_HOUSING_FACTOR[selectedTier] ?? SHORT_STAY_HOUSING_FACTOR.medium;
        const floor = SHORT_STAY_HOUSING_MIN_NIGHTLY[selectedTier] ?? SHORT_STAY_HOUSING_MIN_NIGHTLY.medium;
        return Math.max(floor, Math.ceil(monthlyNightly * factor));
    }
    if (nights <= 21) return Math.ceil(monthlyNightly * 1.55);
    return Math.ceil(monthlyNightly);
}

function tripHousingCostFor(locOrCosts, selectedTier, nights) {
    const explicit = numberOrZero(locOrCosts?.tripHousingCost);
    if (explicit > 0) return Math.round(explicit);
    return housingNightlyCost(locOrCosts?.costs || locOrCosts, selectedTier, nights) * nights;
}

function tripFoodCostFor(locOrCosts, nights) {
    const explicit = numberOrZero(locOrCosts?.tripFoodCost);
    if (explicit > 0) return Math.round(explicit);
    const costs = locOrCosts?.costs || locOrCosts;
    return Math.ceil((costs?.food || 0) / DEFAULT_TRIP_DAYS) * nights;
}

function nonHousingDailyCost(costs) {
    return ['transport', 'entertainment', 'other']
        .reduce((sum, key) => sum + Math.ceil((costs?.[key] || 0) / DEFAULT_TRIP_DAYS), 0);
}

function tripLivingCost(costs, selectedTier, nights, explicit = {}) {
    return tripHousingCostFor({ ...explicit, costs }, selectedTier, nights)
        + tripFoodCostFor({ ...explicit, costs }, nights)
        + nonHousingDailyCost(costs) * nights;
}

function parseAiJsonObject(reply) {
    const text = String(reply || '')
        .replace(/^\uFEFF/, '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
        throw new Error('AI response did not include a JSON object');
    }
    const jsonText = text
        .slice(start, end + 1)
        .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(jsonText);
}

async function getParsedAiJson(messages, systemPrompt, aiProvider, aiModel, apiKeyOverride, fallbackMessages = null) {
    try {
        return parseAiJsonObject(await getChatResponse(messages, systemPrompt, aiProvider, aiModel, apiKeyOverride));
    } catch (firstError) {
        if (!fallbackMessages) throw firstError;
        try {
            return parseAiJsonObject(await getChatResponse(fallbackMessages, systemPrompt, aiProvider, aiModel, apiKeyOverride));
        } catch (secondError) {
            secondError.message = `${secondError.message || 'AI JSON failed'}; first attempt: ${firstError.message || firstError}`;
            throw secondError;
        }
    }
}

function aiErrorMessage(err, isHe) {
    const raw = String(err?.message || err || '');
    if (/missing api key/i.test(raw)) return isHe ? 'חסר API key לספק ה-AI שנבחר' : 'Missing API key for the selected AI provider';
    if (/quota|rate|429/i.test(raw)) return isHe ? 'הספק החזיר מגבלת שימוש או עומס. נסה שוב עוד רגע' : 'The AI provider returned a rate/quota limit. Try again shortly';
    if (/json|object|parse|unexpected|unterminated/i.test(raw)) return isHe ? 'ה-AI החזיר תשובה לא תקינה במקום JSON מלא. נסה שוב' : 'The AI returned an invalid or incomplete JSON response. Try again';
    if (/candidate|safety|blocked|finish/i.test(raw)) return isHe ? 'הספק חסם או חתך את התשובה. נסה שוב או החלף מודל' : 'The provider blocked or truncated the response. Try again or switch model';
    return isHe ? `שגיאה בטעינת ההמלצות: ${raw.slice(0, 120)}` : `Error loading suggestions: ${raw.slice(0, 120)}`;
}

const AIRFARE_REGIONS = [
    {
        floor: 4000,
        typical: [4000, 8500],
        re: /(argentina|buenos aires|chile|santiago|peru|lima|brazil|rio|sao paulo|colombia|bogota|ecuador|uruguay|montevideo|australia|sydney|melbourne|new zealand|auckland|wellington|fiji|tahiti)/,
    },
    {
        floor: 2600,
        typical: [2600, 6000],
        re: /(usa|united states|canada|toronto|vancouver|montreal|new york|miami|los angeles|san francisco|chicago|boston|washington|seattle|mexico|cancun|mexico city)/,
    },
    {
        floor: 2500,
        typical: [2500, 6000],
        re: /(south africa|cape town|johannesburg|kenya|nairobi|tanzania|zanzibar|ethiopia|ghana|senegal|mauritius|seychelles|uganda|rwanda|namibia|botswana)/,
    },
    {
        floor: 2200,
        typical: [2200, 5500],
        re: /(thailand|bangkok|chiang mai|phuket|vietnam|hanoi|ho chi minh|da nang|bali|indonesia|malaysia|kuala lumpur|philippines|manila|singapore|cambodia|laos|japan|tokyo|osaka|korea|seoul|china|beijing|shanghai|hong kong|taiwan|taipei|india|delhi|mumbai|goa|sri lanka|colombo|nepal|kathmandu)/,
    },
    {
        floor: 1200,
        typical: [1200, 3200],
        re: /(uae|dubai|abu dhabi|qatar|doha|bahrain|oman|muscat|saudi|riyadh|jeddah|uzbekistan|tashkent|kazakhstan|almaty|azerbaijan|baku|armenia|yerevan)/,
    },
    {
        floor: 900,
        typical: [900, 2800],
        re: /(greece|athens|cyprus|larnaca|paphos|portugal|lisbon|porto|spain|madrid|barcelona|italy|rome|milan|france|paris|germany|berlin|munich|austria|vienna|netherlands|amsterdam|belgium|brussels|switzerland|zurich|poland|warsaw|krakow|hungary|budapest|czech|prague|romania|bucharest|bulgaria|sofia|serbia|belgrade|croatia|zagreb|montenegro|albania|georgia|tbilisi|morocco|marrakesh|casablanca|egypt|cairo|tunisia)/,
    },
    {
        floor: 700,
        typical: [700, 1800],
        re: /(jordan|amman|turkey|istanbul|antalya)/,
    },
];

const CAR_RENTAL_AVOID_RE = /(bangkok|בנגקוק|tokyo|טוקיו|osaka|אוסקה|seoul|סיאול|singapore|סינגפור|hong kong|הונג קונג|taipei|טאיפיי|paris|פריז|london|לונדון|new york|ניו יורק|istanbul|איסטנבול|cairo|קהיר|marrakesh|מרקש|amsterdam|אמסטרדם|berlin|ברלין|madrid|מדריד|barcelona|ברצלונה|rome|רומא|lisbon|ליסבון|athens|אתונה)/i;
const CAR_RENTAL_USEFUL_RE = /(larnaca|לרנקה|paphos|פאפוס|cyprus|קפריסין|crete|כרתים|rhodes|רודוס|tuscany|טוסקנה|algarve|אלגרבה|madeira|מדיירה|azores|איים האזוריים|sicily|סיציליה|sardinia|סרדיניה|zanzibar|זנזיבר|mauritius|מאוריציוס|seychelles|סיישל|bali|באלי|phuket|פוקט|chiang mai|צ'יאנג מאי|cape town|קייפטאון|georgia|גאורגיה|tbilisi|טביליסי|montenegro|מונטנגרו|croatia|קרואטיה|slovenia|סלובניה|iceland|איסלנד)/i;

function shouldIncludeCarRental(loc) {
    const text = `${loc?.city || ''} ${loc?.country || ''} ${loc?.countryEn || ''}`.toLowerCase();
    if (CAR_RENTAL_USEFUL_RE.test(text)) return true;
    if (CAR_RENTAL_AVOID_RE.test(text)) return false;
    return false;
}

function recalcLocationTrip(loc, availableAmount, useCar) {
    const costs = { ...(loc.costs || {}) };
    const carRentalCost = useCar ? Math.max(0, Math.round(loc.carRentalOriginalCost || costs.carRental || 0)) : 0;
    const carRentalDays = useCar ? (loc.carRentalOriginalDays || loc.carRentalDays || loc.tripDays || 0) : 0;
    costs.carRental = carRentalCost;

    const selectedTier = loc.tier || 'medium';
    const tripDays = loc.tripDays || DEFAULT_TRIP_DAYS;
    const roundTrip = loc.flightRoundTrip || costs.flights || 0;
    const explicitTripCosts = { tripHousingCost: loc.tripHousingCost, tripFoodCost: loc.tripFoodCost };
    const stayCost = tripLivingCost(costs, selectedTier, tripDays, explicitTripCosts);
    const fullTripCost = stayCost + roundTrip + carRentalCost;
    const carDailyCost = useCar && carRentalDays > 0 ? Math.ceil(carRentalCost / carRentalDays) : 0;

    let daysAffordable = 0;
    for (let d = 1; d <= tripDays; d += 1) {
        const carDaysForStay = useCar ? Math.min(d, carRentalDays) : 0;
        const proportionalExplicit = {
            tripHousingCost: loc.tripHousingCost ? Math.round(loc.tripHousingCost * (d / tripDays)) : 0,
            tripFoodCost: loc.tripFoodCost ? Math.round(loc.tripFoodCost * (d / tripDays)) : 0,
        };
        const candidateCost = roundTrip + tripLivingCost(costs, selectedTier, d, proportionalExplicit) + carDailyCost * carDaysForStay;
        if (candidateCost <= availableAmount) daysAffordable = d;
    }

    const monthFits = availableAmount ? fullTripCost <= availableAmount : true;
    const affordableTripCost = monthFits
        ? fullTripCost
        : (daysAffordable > 0 ? roundTrip + tripLivingCost(costs, selectedTier, daysAffordable, {
            tripHousingCost: loc.tripHousingCost ? Math.round(loc.tripHousingCost * (daysAffordable / tripDays)) : 0,
            tripFoodCost: loc.tripFoodCost ? Math.round(loc.tripFoodCost * (daysAffordable / tripDays)) : 0,
        }) + carDailyCost * Math.min(daysAffordable, carRentalDays) : 0);
    const dailyCost = monthFits
        ? Math.ceil(fullTripCost / tripDays)
        : (daysAffordable > 0 ? Math.ceil(affordableTripCost / daysAffordable) : 0);

    return {
        ...loc,
        costs,
        total: affordableTripCost,
        fullTripCost,
        dailyCost,
        daysAffordable,
        monthFits,
        includeCarRental: useCar,
        carRentalDays,
    };
}

function getLocationTripNights(loc) {
    return loc?.monthFits ? (loc.tripDays || DEFAULT_TRIP_DAYS) : (loc.daysAffordable || 0);
}

function tripBreakdownFor(loc) {
    const costs = loc?.costs || {};
    const nights = getLocationTripNights(loc);
    const breakdown = {};
    const requestedNights = loc?.tripDays || nights || DEFAULT_TRIP_DAYS;
    breakdown.rent = tripHousingCostFor({
        costs,
        tripHousingCost: loc?.tripHousingCost && nights !== requestedNights
            ? Math.round(loc.tripHousingCost * (nights / requestedNights))
            : loc?.tripHousingCost,
    }, loc?.tier || 'medium', nights);
    breakdown.food = tripFoodCostFor({
        costs,
        tripFoodCost: loc?.tripFoodCost && nights !== requestedNights
            ? Math.round(loc.tripFoodCost * (nights / requestedNights))
            : loc?.tripFoodCost,
    }, nights);
    ['transport', 'entertainment', 'other'].forEach((key) => {
        breakdown[key] = Math.ceil((costs[key] || 0) / DEFAULT_TRIP_DAYS) * nights;
    });
    breakdown.flights = costs.flights || 0;
    breakdown.carRental = loc?.includeCarRental ? (costs.carRental || 0) : 0;
    return { nights, breakdown };
}

const numberOrZero = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(/[^\d.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const COUNTRY_CODE_LOOKUP = {
    'מצרים': 'EG', 'egypt': 'EG',
    'תאילנד': 'TH', 'thailand': 'TH',
    'פורטוגל': 'PT', 'portugal': 'PT',
    'יוון': 'GR', 'greece': 'GR',
    'קפריסין': 'CY', 'cyprus': 'CY',
    'ספרד': 'ES', 'spain': 'ES',
    'איטליה': 'IT', 'italy': 'IT',
    'צרפת': 'FR', 'france': 'FR',
    'גרמניה': 'DE', 'germany': 'DE',
    'אוסטריה': 'AT', 'austria': 'AT',
    'הולנד': 'NL', 'netherlands': 'NL',
    'בלגיה': 'BE', 'belgium': 'BE',
    'שוויץ': 'CH', 'switzerland': 'CH',
    'פולין': 'PL', 'poland': 'PL',
    'הונגריה': 'HU', 'hungary': 'HU',
    'צ׳כיה': 'CZ', 'צכיה': 'CZ', 'czechia': 'CZ', 'czech republic': 'CZ',
    'רומניה': 'RO', 'romania': 'RO',
    'בולגריה': 'BG', 'bulgaria': 'BG',
    'סרביה': 'RS', 'serbia': 'RS',
    'קרואטיה': 'HR', 'croatia': 'HR',
    'מונטנגרו': 'ME', 'montenegro': 'ME',
    'אלבניה': 'AL', 'albania': 'AL',
    'גאורגיה': 'GE', 'גרוזיה': 'GE', 'georgia': 'GE',
    'מרוקו': 'MA', 'morocco': 'MA',
    'טורקיה': 'TR', 'turkey': 'TR',
    'ירדן': 'JO', 'jordan': 'JO',
    'איחוד האמירויות': 'AE', 'איחוד אמירויות': 'AE', 'uae': 'AE', 'united arab emirates': 'AE',
    'קטאר': 'QA', 'qatar': 'QA',
    'אומן': 'OM', 'עומאן': 'OM', 'oman': 'OM',
    'ערב הסעודית': 'SA', 'saudi arabia': 'SA',
    'וייטנאם': 'VN', 'vietnam': 'VN',
    'אינדונזיה': 'ID', 'indonesia': 'ID',
    'מלזיה': 'MY', 'malaysia': 'MY',
    'פיליפינים': 'PH', 'philippines': 'PH',
    'סינגפור': 'SG', 'singapore': 'SG',
    'קמבודיה': 'KH', 'cambodia': 'KH',
    'לאוס': 'LA', 'laos': 'LA',
    'יפן': 'JP', 'japan': 'JP',
    'דרום קוריאה': 'KR', 'קוריאה': 'KR', 'south korea': 'KR', 'korea': 'KR',
    'סין': 'CN', 'china': 'CN',
    'הונג קונג': 'HK', 'hong kong': 'HK',
    'טאיוואן': 'TW', 'taiwan': 'TW',
    'הודו': 'IN', 'india': 'IN',
    'סרי לנקה': 'LK', 'sri lanka': 'LK',
    'נפאל': 'NP', 'nepal': 'NP',
    'ארצות הברית': 'US', 'ארהב': 'US', 'ארה״ב': 'US', 'united states': 'US', 'usa': 'US',
    'קנדה': 'CA', 'canada': 'CA',
    'מקסיקו': 'MX', 'mexico': 'MX',
    'ברזיל': 'BR', 'brazil': 'BR',
    'ארגנטינה': 'AR', 'argentina': 'AR',
    'צ׳ילה': 'CL', 'צילה': 'CL', 'chile': 'CL',
    'קולומביה': 'CO', 'colombia': 'CO',
    'פרו': 'PE', 'peru': 'PE',
    'אוסטרליה': 'AU', 'australia': 'AU',
    'ניו זילנד': 'NZ', 'new zealand': 'NZ',
    'דרום אפריקה': 'ZA', 'south africa': 'ZA',
    'קניה': 'KE', 'kenya': 'KE',
    'טנזניה': 'TZ', 'tanzania': 'TZ',
    'אתיופיה': 'ET', 'ethiopia': 'ET',
    'מאוריציוס': 'MU', 'mauritius': 'MU',
    'סיישל': 'SC', 'seychelles': 'SC',
};

function countryCodeFor(loc) {
    const directCode = (loc?.countryCode || loc?.country_code || '').trim();
    if (/^[A-Za-z]{2,3}$/.test(directCode)) return directCode.slice(0, 2).toUpperCase();
    const lookupKey = (loc?.country || loc?.countryEn || loc?.countryEnglish || '').trim().toLowerCase();
    if (COUNTRY_CODE_LOOKUP[lookupKey]) return COUNTRY_CODE_LOOKUP[lookupKey];
    return '';
}

function countryInitials(loc) {
    const code = countryCodeFor(loc);
    if (code) return code;
    const source = (loc?.countryEn || loc?.countryEnglish || loc?.country || loc?.city || '').trim();
    if (!source) return '??';
    const words = source
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z\s-]/g, ' ')
        .split(/[\s-]+/)
        .filter(Boolean);
    if (!words.length) return 'NA';
    if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
    return words[0].slice(0, 2).toUpperCase();
}

function flagImageUrlFor(loc) {
    const code = countryCodeFor(loc);
    return code ? `https://flagcdn.com/w40/${code.toLowerCase()}.png` : '';
}

function locationKeyFor(loc) {
    return `${loc?.city || ''} ${loc?.country || loc?.countryEn || ''}`
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function airfareRegionFor(loc) {
    const text = `${loc?.city || ''} ${loc?.country || ''}`.toLowerCase();
    return AIRFARE_REGIONS.find(region => region.re.test(text)) || { floor: 1200, typical: [1200, 3500] };
}

function normalizeLocationSuggestions(data, selectedTier, availableAmount, isHe, tripDays, includeCarRental, carRentalDaysInput, dailyTarget = 0) {
    const locations = Array.isArray(data?.locations) ? data.locations : [];
    const floors = TIER_PRICE_FLOORS[selectedTier] || TIER_PRICE_FLOORS.medium;
    const requestedDays = normalizeTripDays(tripDays);
    const requestedCarDays = includeCarRental ? normalizeCarRentalDays(carRentalDaysInput, requestedDays) : 0;
    let overBudgetCount = 0;
    return {
        budgetFits: selectedTier,
        budgetNote: '',
        locations: (() => {
            const normalizedLocations = locations.map(raw => {
            const costs = {};
            COST_KEYS.forEach(({ key }) => {
                costs[key] = normalizeTierLivingCost(key, numberOrZero(raw?.costs?.[key]), selectedTier);
            });

            Object.entries(floors).forEach(([key, floor]) => {
                if (costs[key] > 0 && costs[key] < floor) costs[key] = floor;
            });

            const region = airfareRegionFor(raw);
            const aiRoundTrip = numberOrZero(raw?.flightRoundTrip ?? raw?.singleTripFlight ?? raw?.flightsRoundTrip ?? raw?.flightsAnnualRoundTrip ?? raw?.annualRoundTripFlight);
            const roundTrip = Math.max(region.floor, Math.round(aiRoundTrip || costs.flights || region.floor));
            costs.flights = roundTrip;

            const carRentalUseful = includeCarRental && shouldIncludeCarRental(raw);
            if (!carRentalUseful) costs.carRental = 0;
            const explicitTripCosts = {
                tripHousingCost: numberOrZero(raw?.tripHousingCost ?? raw?.housingTripCost ?? raw?.accommodationTripCost),
                tripFoodCost: numberOrZero(raw?.tripFoodCost ?? raw?.foodTripCost),
            };

            const livingMonthly = COST_KEYS
                .filter(({ key }) => key !== 'flights' && key !== 'carRental')
                .reduce((sum, { key }) => sum + costs[key], 0);
            const livingDailyCost = livingMonthly > 0 ? Math.ceil(tripLivingCost(costs, selectedTier, requestedDays, explicitTripCosts) / requestedDays) : 0;
            const stayCost = tripLivingCost(costs, selectedTier, requestedDays, explicitTripCosts);
            const carRentalCost = carRentalUseful ? Math.max(0, Math.round(costs.carRental || 0)) : 0;
            const carRentalIncluded = carRentalUseful && carRentalCost > 0;
            costs.carRental = carRentalCost;
            const fullTripCost = stayCost + roundTrip + carRentalCost;
            if (availableAmount && fullTripCost > availableAmount) overBudgetCount += 1;
            const carDailyCost = carRentalIncluded && requestedCarDays > 0 ? Math.ceil(carRentalCost / requestedCarDays) : 0;
            let daysAffordable = 0;
            for (let d = 1; d <= requestedDays; d += 1) {
                const carDaysForStay = carRentalIncluded ? Math.min(d, requestedCarDays) : 0;
                const proportionalExplicit = {
                    tripHousingCost: explicitTripCosts.tripHousingCost ? Math.round(explicitTripCosts.tripHousingCost * (d / requestedDays)) : 0,
                    tripFoodCost: explicitTripCosts.tripFoodCost ? Math.round(explicitTripCosts.tripFoodCost * (d / requestedDays)) : 0,
                };
                const candidateCost = roundTrip + tripLivingCost(costs, selectedTier, d, proportionalExplicit) + carDailyCost * carDaysForStay;
                if (candidateCost <= availableAmount) daysAffordable = d;
            }
            const monthFits = availableAmount ? fullTripCost <= availableAmount : true;
            const affordableTripCost = monthFits
                ? fullTripCost
                : (daysAffordable > 0 ? roundTrip + tripLivingCost(costs, selectedTier, daysAffordable, {
                    tripHousingCost: explicitTripCosts.tripHousingCost ? Math.round(explicitTripCosts.tripHousingCost * (daysAffordable / requestedDays)) : 0,
                    tripFoodCost: explicitTripCosts.tripFoodCost ? Math.round(explicitTripCosts.tripFoodCost * (daysAffordable / requestedDays)) : 0,
                }) + carDailyCost * Math.min(daysAffordable, requestedCarDays) : 0);
            const displayDailyCost = monthFits
                ? Math.ceil(fullTripCost / requestedDays)
                : (daysAffordable > 0 ? Math.ceil(affordableTripCost / daysAffordable) : 0);
            const defaultHousingType = isHe
                ? (selectedTier === 'expensive' ? 'דירה איכותית במיקום מרכזי' : selectedTier === 'cheap' ? 'דירה צנועה או סטודיו באזור בטוח' : 'דירת חדר נוחה להשכרה ארוכה')
                : (selectedTier === 'expensive' ? 'high-quality apartment in a central area' : selectedTier === 'cheap' ? 'modest apartment or studio in a safe area' : 'comfortable long-term one-bedroom apartment');
            return {
                city: raw?.city || '',
                country: raw?.country || '',
                countryCode: raw?.countryCode || raw?.country_code || '',
                countryEn: raw?.countryEn || raw?.countryEnglish || '',
                flag: raw?.flag || '🌍',
                note: raw?.note || '',
                total: affordableTripCost,
                fullTripCost,
                livingMonthly,
                tripDays: requestedDays,
                tier: selectedTier,
                includeCarRental: carRentalIncluded,
                carRentalRequested: includeCarRental,
                carRentalDays: carRentalIncluded ? requestedCarDays : 0,
                carRentalUseful,
                carRentalToggleable: carRentalIncluded,
                carRentalOriginalCost: carRentalCost,
                carRentalOriginalDays: carRentalIncluded ? requestedCarDays : 0,
                costs,
                tripHousingCost: Math.round(explicitTripCosts.tripHousingCost || 0),
                tripFoodCost: Math.round(explicitTripCosts.tripFoodCost || 0),
                housingType: raw?.housingType || raw?.accommodationType || defaultHousingType,
                housingLevel: raw?.housingLevel || raw?.housingStandard || (isHe ? TIER_META[selectedTier]?.labelHe : TIER_META[selectedTier]?.labelEn),
                flightRoundTrip: roundTrip,
                airfareTypicalRange: region.typical,
                livingDailyCost,
                dailyCost: displayDailyCost,
                daysAffordable,
                monthFits,
            };
            }).filter(loc => loc.monthFits || loc.daysAffordable > 0);
            const target = Math.max(0, Math.round(numberOrZero(dailyTarget)));
            const relevant = target > 0
                ? normalizedLocations.filter(loc => loc.dailyCost <= target)
                : normalizedLocations;
            const withinTripBudget = normalizedLocations.filter(loc =>
                loc.monthFits && !relevant.includes(loc)
            );
            const close = target > 0
                ? normalizedLocations.filter(loc =>
                    loc.dailyCost > target
                    && loc.dailyCost <= Math.ceil(target * 1.15)
                    && !withinTripBudget.includes(loc)
                )
                : [];
            const pool = relevant.length >= 4
                ? [...relevant, ...withinTripBudget]
                : [...relevant, ...withinTripBudget, ...close];
            return pool
                .sort((a, b) => {
                    const aTier = a.dailyCost <= target ? 0 : a.monthFits ? 1 : 2;
                    const bTier = b.dailyCost <= target ? 0 : b.monthFits ? 1 : 2;
                    if (aTier !== bTier) return aTier - bTier;
                    if (b.daysAffordable !== a.daysAffordable) return b.daysAffordable - a.daysAffordable;
                    return a.dailyCost - b.dailyCost;
                });
        })(),
        ...(overBudgetCount > 0 && availableAmount ? {
            budgetNote: data?.budgetNote || (isHe
                ? `${overBudgetCount} הצעות לא נכנסות לחודש מלא כולל טיסה; מוצג כמה לילות כן נכנסים בתקציב.`
                : `${overBudgetCount} suggested location(s) do not fit a full month including flight; affordable nights are shown.`),
        } : {}),
    };
}

function LocationSuggestModal({ isOpen, onClose, availableAmount, userMonthlyCost, monthlySavingsAmount, withdrawalMonthlyAmount, year, currency, isHe, isLight, aiProvider, aiModel, apiKeyOverride }) {
    const { dragStyle, onDragMouseDown } = useDraggable(isOpen, { constrainToViewport: true, viewportMargin: 16 });
    const [tier, setTier] = useState(null);
    const [tripDaysInput, setTripDaysInput] = useState('');
    const [includeMonthlySavings, setIncludeMonthlySavings] = useState(false);
    const [includeCarRental, setIncludeCarRental] = useState(false);
    const [carRentalDaysInput, setCarRentalDaysInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [replacingLocation, setReplacingLocation] = useState(false);
    const [deletedLocations, setDeletedLocations] = useState([]);
    const [parsed, setParsed] = useState(null);
    const [error, setError] = useState(null);
    const [openCards, setOpenCards] = useState(new Set());

    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [isOpen]);

    const toggleCard = i => setOpenCards(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

    const fmtAmt = v => {
        const abs = Math.abs(v || 0);
        if (abs >= 1_000_000) return `${currency}${(abs / 1_000_000).toFixed(1)}M`;
        if (abs >= 1_000) return `${currency}${(abs / 1000).toFixed(1)}K`;
        return `${currency}${Math.round(abs).toLocaleString()}`;
    };
    const fmtTripSummary = loc => {
        const amount = fmtAmt(loc.total);
        if (loc.monthFits) return isHe ? `${loc.tripDays} לילות · ${amount}` : `${amount} / ${loc.tripDays} nights`;
        return isHe ? `${loc.daysAffordable} לילות · ${amount}` : `${amount} / ${loc.daysAffordable} nights`;
    };
    const withdrawalDailyBudget = Math.ceil(Math.max(0, numberOrZero(withdrawalMonthlyAmount)) / DEFAULT_TRIP_DAYS);
    const monthlySavingsBudget = Math.max(0, Math.round(numberOrZero(monthlySavingsAmount)));
    const tripBudgetForDays = useCallback((daysValue) => {
        const days = normalizeTripDays(daysValue);
        const baseBudget = withdrawalDailyBudget > 0 ? withdrawalDailyBudget * days : normalizeTripBudget('', availableAmount);
        return Math.max(0, baseBudget + (includeMonthlySavings ? monthlySavingsBudget : 0));
    }, [availableAmount, includeMonthlySavings, monthlySavingsBudget, withdrawalDailyBudget]);

    const toggleLocationCarRental = useCallback((idx) => {
        setParsed(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                locations: (prev.locations || []).map((loc, i) => {
                    if (i !== idx) return loc;
                    if (!loc.carRentalOriginalCost) return loc;
                    return recalcLocationTrip(loc, tripBudgetForDays(loc.tripDays), !loc.includeCarRental);
                }),
            };
        });
    }, [tripBudgetForDays]);

    const fetchReplacementLocation = useCallback(async (selectedTier, excludedLocations) => {
        const tripDays = normalizeTripDays(tripDaysInput);
        const carRentalDays = normalizeCarRentalDays(carRentalDaysInput, tripDays);
        const tripBudget = tripBudgetForDays(tripDays);
        const dailyWithdrawalTarget = Math.ceil(Math.max(0, numberOrZero(withdrawalMonthlyAmount)) / DEFAULT_TRIP_DAYS);
        const tierHe = { cheap: 'זולה', medium: 'בינונית', expensive: 'יוקרתית' }[selectedTier];
        const tierEn = { cheap: 'budget-friendly', medium: 'moderate', expensive: 'premium' }[selectedTier];
        const amtStr = `${currency}${Math.round(tripBudget).toLocaleString()}`;
        const nowYear = new Date().getFullYear();
        const yearCtxHe = year > nowYear
            ? `שנת יעד: ${year} (בעוד ${year - nowYear} שנים). הצמד עלויות לשנה זו עם אינפלציה צפויה.`
            : `שנת הפניה: ${year}.`;
        const yearCtxEn = year > nowYear
            ? `Target year: ${year} (${year - nowYear} years from now). Adjust costs for expected inflation.`
            : `Reference year: ${year}.`;
        const carCtxHe = includeCarRental ? ` שקול שכירת רכב ל-${carRentalDays} ימים רק אם זה באמת מועיל ליעד; אם העיר פקוקה/עירונית עם תחבורה טובה החזר carRental=0.` : ' אל תכלול שכירת רכב.';
        const carCtxEn = includeCarRental ? ` Consider car rental for ${carRentalDays} days only if it is genuinely useful for the destination; for dense city stays with good transport return carRental=0.` : ' Do not include car rental.';
        const nearbyCtxHe = tripDays < 10
            ? 'מאחר שהשהייה פחות מ-10 ימים, הצע יעדים קרובים בלבד: מזרח תיכון, צפון אפריקה ואירופה קרובה (יוון, קפריסין, טורקיה, איטליה, ספרד, פורטוגל, איחוד האמירויות).'
            : 'הצע יעדים מכל העולם, מאזורים שונים ככל האפשר.';
        const nearbyCtxEn = tripDays < 10
            ? 'Since the stay is under 10 days, suggest only nearby destinations: Middle East, North Africa, and close Europe (Greece, Cyprus, Turkey, Italy, Spain, Portugal, UAE).'
            : 'Suggest destinations from any region worldwide.';
        const excludedText = excludedLocations
            .map(loc => `${loc.city || ''}${loc.country ? `, ${loc.country}` : ''}`.trim())
            .filter(Boolean)
            .join('; ');
        const schema = `{"budgetFits":"cheap|medium|expensive","budgetNote":"one sentence","locations":[{"city":"","country":"","countryCode":"ISO 3166 alpha-2 country code in English letters","countryEn":"country name in English","flag":"🏳","total":0,"note":"one sentence","housingType":"apartment/hotel/private room/guesthouse etc.","housingLevel":"short standard/location description","tripHousingCost":0,"tripFoodCost":0,"flightRoundTrip":0,"costs":{"rent":0,"food":0,"transport":0,"entertainment":0,"flights":0,"carRental":0,"other":0}}]}`;
        const systemPrompt = `You are a global cost-of-living advisor. Respond ONLY with valid JSON, no markdown, no explanation outside the JSON.\n${COST_OF_LIVING_PRICE_CONTEXT}`;
        const userMsg = isHe
            ? `${yearCtxHe} תקציב לטיול: ${amtStr}. תקציב יומי לפי המשיכה שלי: ${currency}${dailyWithdrawalTarget}. משך שהייה לבדיקה: ${tripDays} לילות. מצא 12 ערים חלופיות לאורח חיים ${tierHe}. ${nearbyCtxHe} קודם חפש יעדים שבהם העלות היומית הכוללת נמוכה או שווה לתקציב היומי לפי המשיכה; רק אם אין מספיק, הצע יעדים שקרובים אליו ולא רחוקים מדי. חשב את רמת המחיה לפי השוק המקומי של כל יעד. בחר דיור שמתאים למשך: לכמה לילות השתמש במלון/חדר/גסטהאוס/דירה קצרה לפי הרמה, ולשהייה חודשית בדירה חודשית. החזר tripHousingCost ו-tripFoodCost לתקופה המבוקשת. פרט ב-housingLevel וב-note את ההנחות שמצדיקות את הרמה. ${carCtxHe} אסור להציע אף אחד מהיעדים האלה: ${excludedText || 'אין'}. החזר רק JSON בסכמה: ${schema}. שמות והערות בעברית.`
            : `${yearCtxEn} Trip budget: ${amtStr}. My daily budget from monthly withdrawal: ${currency}${dailyWithdrawalTarget}. Stay length to evaluate: ${tripDays} nights. Suggest 12 replacement cities for a ${tierEn} lifestyle. ${nearbyCtxEn} First prioritize destinations where total daily trip cost is at or below my daily withdrawal budget; only if there are not enough, include close options that are not far above it. Price the lifestyle tier relative to each destination's local market. Choose accommodation suitable for the duration: hotel/private room/guesthouse/short-stay apartment for short trips, monthly apartment for month stays. Return tripHousingCost and tripFoodCost for the requested stay. In housingLevel and note, explain the assumptions that justify the tier.${carCtxEn} Do not suggest any of these locations: ${excludedText || 'none'}. Return ONLY JSON matching schema: ${schema}.`;
        const fallbackMsg = isHe
            ? `החזר JSON בלבד. מצא 8 ערים חלופיות לאורח חיים ${tierHe}, ${tripDays} לילות, תקציב ${amtStr}. ${nearbyCtxHe} החזר tripHousingCost ו-tripFoodCost לתקופה, עם דיור מתאים למשך. אל תציע: ${excludedText || 'אין'}. סכימה: ${schema}`
            : `Return JSON only. Suggest 8 replacement cities for a ${tierEn} lifestyle, ${tripDays} nights, budget ${amtStr}. ${nearbyCtxEn} Return tripHousingCost and tripFoodCost for the stay, with duration-appropriate accommodation. Exclude: ${excludedText || 'none'}. Schema: ${schema}`;
        const normalized = normalizeLocationSuggestions(
            await getParsedAiJson(
                [{ role: 'user', content: userMsg }],
                systemPrompt,
                aiProvider,
                aiModel,
                apiKeyOverride,
                [{ role: 'user', content: fallbackMsg }]
            ),
            selectedTier,
            tripBudget,
            isHe,
            tripDays,
            includeCarRental,
            carRentalDays,
            dailyWithdrawalTarget
        );
        const excludedKeys = new Set(excludedLocations.map(locationKeyFor).filter(Boolean));
        const replacement = (normalized.locations || []).find(loc => !excludedKeys.has(locationKeyFor(loc)));
        if (!replacement) throw new Error('No non-duplicate replacement returned');
        return replacement;
    }, [withdrawalMonthlyAmount, year, currency, isHe, aiProvider, aiModel, apiKeyOverride, tripDaysInput, includeCarRental, carRentalDaysInput, tripBudgetForDays]);

    const deleteLocation = useCallback(async (idx) => {
        if (!parsed?.locations?.[idx] || !tier || replacingLocation) return;
        const removed = parsed.locations[idx];
        const remaining = parsed.locations.filter((_, i) => i !== idx);
        const excluded = [...deletedLocations, removed, ...remaining];
        setDeletedLocations(prev => [...prev, removed]);
        setParsed(prev => prev ? { ...prev, locations: remaining } : prev);
        setOpenCards(new Set());
        setReplacingLocation(true);
        try {
            const replacement = await fetchReplacementLocation(tier, excluded);
            if (replacement) {
                setParsed(prev => {
                    if (!prev) return prev;
                    const existingKeys = new Set((prev.locations || []).map(locationKeyFor).filter(Boolean));
                    if (existingKeys.has(locationKeyFor(replacement))) return prev;
                    return {
                        ...prev,
                        locations: [...(prev.locations || []), replacement].sort((a, b) => {
                            if (b.daysAffordable !== a.daysAffordable) return b.daysAffordable - a.daysAffordable;
                            return a.dailyCost - b.dailyCost;
                        }),
                    };
                });
            }
        } catch {
            setError(isHe ? 'היעד נמחק, אבל לא הצלחתי להביא חלופה כרגע' : 'Location removed, but no replacement could be loaded right now');
        } finally {
            setReplacingLocation(false);
        }
    }, [parsed, tier, replacingLocation, deletedLocations, fetchReplacementLocation, isHe]);

    const fetchSuggestions = useCallback(async (selectedTier) => {
        if (!selectedTier) {
            setError(isHe ? 'בחר רמת מחיה לפני החיפוש' : 'Choose a lifestyle level before searching');
            return;
        }
        setTier(selectedTier);
        setLoading(true);
        setReplacingLocation(false);
        setDeletedLocations([]);
        setParsed(null);
        setError(null);
        setOpenCards(new Set());
        const tripDays = normalizeTripDays(tripDaysInput);
        const carRentalDays = normalizeCarRentalDays(carRentalDaysInput, tripDays);
        const tripBudget = tripBudgetForDays(tripDays);
        const dailyWithdrawalTarget = Math.ceil(Math.max(0, numberOrZero(withdrawalMonthlyAmount)) / DEFAULT_TRIP_DAYS);
        const tierHe = { cheap: 'זולה', medium: 'בינונית', expensive: 'יוקרתית' }[selectedTier];
        const tierEn = { cheap: 'budget-friendly', medium: 'moderate', expensive: 'premium' }[selectedTier];
        const amtStr = `${currency}${Math.round(tripBudget).toLocaleString()}`;
        const nowYear = new Date().getFullYear();
        const yearCtxHe = year > nowYear
            ? `שנת יעד: ${year} (בעוד ${year - nowYear} שנים). הצמד עלויות לשנה זו עם אינפלציה צפויה.`
            : `שנת הפניה: ${year}.`;
        const yearCtxEn = year > nowYear
            ? `Target year: ${year} (${year - nowYear} years from now). Adjust costs for expected inflation.`
            : `Reference year: ${year}.`;
        const systemPrompt = `You are a global cost-of-living advisor. Respond ONLY with valid JSON, no markdown, no explanation outside the JSON.\n${COST_OF_LIVING_PRICE_CONTEXT}`;
        const carCtxHe = includeCarRental ? ` שקול שכירת רכב ל-${carRentalDays} ימים רק אם זה באמת מועיל ליעד; אם העיר פקוקה/עירונית עם תחבורה טובה החזר carRental=0.` : ' אל תכלול שכירת רכב.';
        const carCtxEn = includeCarRental ? ` Consider car rental for ${carRentalDays} days only if it is genuinely useful for the destination; for dense city stays with good transport return carRental=0.` : ' Do not include car rental.';
        const nearbyCtxHe = tripDays < 10
            ? 'מאחר שהשהייה פחות מ-10 ימים, הצע יעדים קרובים בלבד: מזרח תיכון, צפון אפריקה ואירופה קרובה (יוון, קפריסין, טורקיה, איטליה, ספרד, פורטוגל, איחוד האמירויות).'
            : 'הצע יעדים מכל העולם, מאזורים שונים ככל האפשר.';
        const nearbyCtxEn = tripDays < 10
            ? 'Since the stay is under 10 days, suggest only nearby destinations: Middle East, North Africa, and close Europe (Greece, Cyprus, Turkey, Italy, Spain, Portugal, UAE).'
            : 'Suggest destinations from any region worldwide.';
        const schema = `{"budgetFits":"cheap|medium|expensive","budgetNote":"one sentence","locations":[{"city":"","country":"","countryCode":"ISO 3166 alpha-2 country code in English letters","countryEn":"country name in English","flag":"🏳","total":0,"note":"one sentence","housingType":"apartment/hotel/private room/guesthouse etc.","housingLevel":"short standard/location description","tripHousingCost":0,"tripFoodCost":0,"flightRoundTrip":0,"costs":{"rent":0,"food":0,"transport":0,"entertainment":0,"flights":0,"carRental":0,"other":0}}]}`;
        const userMsg = isHe
            ? `${yearCtxHe} תקציב לטיול: ${amtStr}. תקציב יומי לפי המשיכה שלי: ${currency}${dailyWithdrawalTarget}. משך שהייה לבדיקה: ${tripDays} לילות. הצע 8 ערים לאורח חיים ${tierHe}. ${nearbyCtxHe} קודם חפש יעדים שבהם העלות היומית הכוללת נמוכה או שווה לתקציב היומי לפי המשיכה; רק אם אין מספיק, הצע יעדים שקרובים אליו ולא רחוקים מדי. חשב את הרמה לפי השוק המקומי של כל יעד: דיור, מיקום, אוכל, תחבורה ובילויים חייבים לשקף את הרמה שנבחרה בעיר הזו. בחר דיור שמתאים למשך: לכמה לילות מלון/חדר/גסטהאוס/דירה קצרה לפי הרמה, ולחודש דירה חודשית. החזר tripHousingCost ו-tripFoodCost לתקופה המבוקשת. פרט ב-housingLevel וב-note את ההנחות שמצדיקות את הרמה. ${carCtxHe} כלול יעדים שנכנסים בתקציב וגם יעדים יקרים יותר שמתאימים לפחות לילות. החזר JSON בלבד בסכמה: ${schema}. budgetFits = הרמה שהתקציב הזה מאפשר באופן כללי. הערות ושם עיר/מדינה/הערה בעברית.`
            : `${yearCtxEn} Trip budget: ${amtStr}. My daily budget from monthly withdrawal: ${currency}${dailyWithdrawalTarget}. Stay length to evaluate: ${tripDays} nights. Suggest 8 cities for a ${tierEn} lifestyle. ${nearbyCtxEn} First prioritize destinations where total daily trip cost is at or below my daily withdrawal budget; only if there are not enough, include close options that are not far above it. Price the tier relative to each destination's local market: housing, neighborhood, food, transport and entertainment must reflect the selected tier in that city. Choose accommodation suitable for the duration: hotel/private room/guesthouse/short-stay apartment for short trips, monthly apartment for month stays. Return tripHousingCost and tripFoodCost for the requested stay. In housingLevel and note, explain the assumptions that justify the tier.${carCtxEn} Include options that fit and more expensive options that fit fewer nights. Return ONLY JSON matching schema: ${schema}. budgetFits = overall tier this budget supports globally.`;
        const fallbackMsg = isHe
            ? `החזר JSON בלבד, בלי טקסט נוסף. הצע 8 ערים לאורח חיים ${tierHe}, ${tripDays} לילות, תקציב ${amtStr}. ${nearbyCtxHe} החזר tripHousingCost ו-tripFoodCost לתקופה, עם דיור מתאים למשך. כל המחירים בשקלים. סכימה: ${schema}`
            : `Return JSON only, no extra text. Suggest 8 cities for a ${tierEn} lifestyle, ${tripDays} nights, budget ${amtStr}. ${nearbyCtxEn} Return tripHousingCost and tripFoodCost for the stay, with duration-appropriate accommodation. All prices in ILS. Schema: ${schema}`;
        try {
            setParsed(normalizeLocationSuggestions(
                await getParsedAiJson(
                    [{ role: 'user', content: userMsg }],
                    systemPrompt,
                    aiProvider,
                    aiModel,
                    apiKeyOverride,
                    [{ role: 'user', content: fallbackMsg }]
                ),
                selectedTier,
                tripBudget,
                isHe,
                tripDays,
                includeCarRental,
                carRentalDays,
                dailyWithdrawalTarget
            ));
        } catch (err) {
            console.error('Location suggestions failed', err);
            setError(aiErrorMessage(err, isHe));
        } finally {
            setLoading(false);
        }
    }, [withdrawalMonthlyAmount, year, currency, isHe, aiProvider, aiModel, apiKeyOverride, tripDaysInput, includeCarRental, carRentalDaysInput, tripBudgetForDays]);

    useEffect(() => {
        if (!isOpen) return;
        setTier(null);
        setParsed(null);
        setError(null);
        setReplacingLocation(false);
        setDeletedLocations([]);
        setIncludeMonthlySavings(false);
        setOpenCards(new Set());
    }, [isOpen]);

    if (!isOpen) return null;

    const fitsColorMap = { green: isLight ? 'bg-green-50 border-green-200 text-green-700' : 'bg-green-500/10 border-green-500/30 text-green-400', blue: isLight ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-blue-500/10 border-blue-500/30 text-blue-400', purple: isLight ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-purple-500/10 border-purple-500/30 text-purple-400' };

    return createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div data-draggable-modal className={`relative w-full max-w-lg max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${isLight ? 'bg-white' : ''}`} style={dragStyle} dir={isHe ? 'rtl' : 'ltr'}>
                {!isLight && <><div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-indigo-900" /><div className="absolute inset-0 bg-white/5" /></>}
                {/* Header */}
                <div className={`relative z-10 flex items-center gap-3 px-5 py-4 border-b shrink-0 cursor-grab active:cursor-grabbing ${isLight ? 'border-slate-200' : 'border-white/10'}`} onMouseDown={onDragMouseDown}>
                    <div className={`p-1.5 rounded-lg shrink-0 ${isLight ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/20 text-indigo-400'}`}><Globe size={16} /></div>
                    <div className="flex-1 min-w-0">
                        <div className={`font-bold text-sm ${isLight ? 'text-slate-800' : 'text-white'}`}>{isHe ? 'מקומות מגורים מומלצים' : 'Recommended Living Locations'}</div>
                        <div className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {isHe ? 'פנוי למחיה: ' : 'Available: '}<span dir={isHe ? 'rtl' : 'ltr'}>{fmtAmt(availableAmount)}<span className="font-normal opacity-60">{isHe ? '/חו׳' : '/mo'}</span></span>{year && <span className="ms-1.5 opacity-60">· {year}</span>}
                        </div>
                    </div>
                    <button
                        onClick={() => fetchSuggestions(tier)}
                        onMouseDown={e => e.stopPropagation()}
                        disabled={!tier || loading}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed shrink-0 ${isLight ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-500 text-white hover:bg-indigo-400'}`}
                    >
                        {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                        {isHe ? 'חפש' : 'Search'}
                    </button>
                    <button onClick={onClose} onMouseDown={e => e.stopPropagation()} className={`p-1.5 rounded-lg transition-colors shrink-0 ${isLight ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/10 text-gray-400'}`}><X size={16} /></button>
                </div>
                {/* Tier tabs */}
                <div className={`relative z-10 px-5 py-3 border-b shrink-0 space-y-3 ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                    <div className="flex gap-2">
                    {Object.entries(TIER_META).map(([id, meta]) => {
                        const active = tier === id;
                        const activeClass = meta.color === 'green' ? 'bg-green-500 text-white' : meta.color === 'blue' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white';
                        return (
                            <button key={id} onClick={() => { setTier(id); setError(null); }} disabled={loading}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${active ? activeClass : isLight ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                                {isHe ? meta.labelHe : meta.labelEn}
                            </button>
                        );
                    })}
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                        <label className={`min-w-0 rounded-lg px-2.5 py-1.5 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/5 border border-white/10'}`}>
                            <span className={`block text-[10px] mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'מס׳ לילות' : 'Nights'}</span>
                            <input
                                type="number"
                                min="1"
                                max="30"
                                value={tripDaysInput}
                                onChange={e => setTripDaysInput(e.target.value)}
                                placeholder="30"
                                className={`w-full bg-transparent outline-none text-sm font-semibold ${isLight ? 'text-slate-800 placeholder:text-slate-400' : 'text-white placeholder:text-gray-500'}`}
                            />
                        </label>
                        <div className={`min-w-0 rounded-lg px-2.5 py-1.5 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/5 border border-white/10'}`}>
                            <span className={`block text-[10px] mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'תקציב מחושב' : 'Auto budget'}</span>
                            <div className={`w-full text-sm font-semibold truncate ${isLight ? 'text-slate-800' : 'text-white'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                {fmtAmt(tripBudgetForDays(tripDaysInput))}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIncludeMonthlySavings(v => !v)}
                            disabled={monthlySavingsBudget <= 0}
                            title={isHe ? `הוסף חיסכון חודשי: ${fmtAmt(monthlySavingsBudget)}` : `Add monthly savings: ${fmtAmt(monthlySavingsBudget)}`}
                            className={`min-w-0 rounded-lg px-2.5 py-1.5 border flex items-center justify-center gap-1.5 text-start transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${includeMonthlySavings
                                ? (isLight ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-amber-500/15 border-amber-400/30 text-amber-200')
                                : (isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-white/5 border-white/10 text-gray-400')}`}
                        >
                            <PiggyBank size={14} className="shrink-0" />
                            <span className="text-xs font-semibold truncate">{isHe ? 'חיסכון' : 'Savings'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setIncludeCarRental(v => !v)}
                                className={`min-w-0 rounded-lg px-2.5 py-1.5 border flex items-center justify-center gap-1.5 text-start transition-colors ${includeCarRental
                                    ? (isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200')
                                    : (isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-white/5 border-white/10 text-gray-400')}`}
                            >
                            <Car size={14} className="shrink-0" />
                            <span className="text-xs font-semibold">{isHe ? 'שקול רכב' : 'Consider car'}</span>
                        </button>
                            <label className={`min-w-0 rounded-lg px-2.5 py-1.5 border ${includeCarRental ? (isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-400/20') : (isLight ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white/5 border-white/10 opacity-60')}`}>
                                <span className={`block text-[10px] mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'ימי רכב' : 'Car days'}</span>
                                <input
                                    type="number"
                                    min="1"
                                    max={normalizeTripDays(tripDaysInput)}
                                    value={carRentalDaysInput}
                                    onChange={e => setCarRentalDaysInput(e.target.value)}
                                    disabled={!includeCarRental}
                                    placeholder={isHe ? 'כל התקופה' : 'Full stay'}
                                    className={`w-full bg-transparent outline-none text-sm font-semibold disabled:cursor-not-allowed ${isLight ? 'text-slate-800 placeholder:text-slate-400' : 'text-white placeholder:text-gray-500'}`}
                                />
                            </label>
                    </div>
                </div>
                {/* Body */}
                <div className="relative z-10 overflow-y-auto custom-scrollbar scrollbar-right p-4 flex-1 space-y-3">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 size={24} className={`animate-spin ${isLight ? 'text-indigo-500' : 'text-indigo-400'}`} />
                            <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'מחפש המלצות...' : 'Finding recommendations...'}</p>
                        </div>
                    )}
                    {error && <p className={`text-sm text-center py-8 ${isLight ? 'text-red-500' : 'text-red-400'}`}>{error}</p>}
                    {!parsed && !loading && !error && (
                        <div className={`text-center py-12 px-4 rounded-xl border border-dashed ${isLight ? 'border-slate-200 text-slate-500' : 'border-white/10 text-gray-400'}`}>
                            <Search size={22} className="mx-auto mb-3 opacity-60" />
                            <p className="text-sm font-semibold">{isHe ? 'בחר רמת מחיה ולחץ חפש' : 'Choose a lifestyle level and search'}</p>
                            <p className="text-xs mt-1 opacity-75">{isHe ? 'אפשר להגביל לילות/תקציב ולהוסיף שכירת רכב לפני החיפוש.' : 'You can limit nights/budget and add car rental before searching.'}</p>
                        </div>
                    )}
                    {parsed && !loading && (<>
                        {/* Budget assessment banner */}
                        {parsed.budgetNote && (
                            <div className={`rounded-xl px-4 py-2.5 border text-xs ${fitsColorMap[(TIER_META[parsed.budgetFits] || TIER_META.medium).color]}`}>
                                <span className="opacity-85">{parsed.budgetNote}</span>
                            </div>
                        )}
                        {replacingLocation && (
                            <div className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 border text-xs ${isLight ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-indigo-500/10 border-indigo-400/25 text-indigo-200'}`}>
                                <Loader2 size={13} className="animate-spin" />
                                <span>{isHe ? 'מחפש יעד חלופי...' : 'Finding a replacement location...'}</span>
                            </div>
                        )}
                        {/* Location cards */}
                        {(parsed.locations || []).map((loc, i) => {
                            const open = openCards.has(i);
                            const palette = LOCATION_CARD_STYLES[i % LOCATION_CARD_STYLES.length];
                            const cardClass = isLight ? palette.card.light : palette.card.dark;
                            const chipClass = isLight ? palette.chip.light : palette.chip.dark;
                            const initials = countryInitials(loc);
                            const flagUrl = flagImageUrlFor(loc);
                            const tripCostView = tripBreakdownFor(loc);
                            const actualDailyCost = Math.ceil(Math.max(0, numberOrZero(userMonthlyCost)) / DEFAULT_TRIP_DAYS);
                            const withdrawalDailyCost = Math.ceil(Math.max(0, numberOrZero(withdrawalMonthlyAmount)) / DEFAULT_TRIP_DAYS);
                            const actualDailyDiff = actualDailyCost - (loc.dailyCost || 0);
                            const withdrawalDailyDiff = withdrawalDailyCost - (loc.dailyCost || 0);
                            return (
                                <div key={`${loc.city}-${i}`} className={`rounded-xl border overflow-hidden shadow-sm ${cardClass}`}>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className="w-full flex items-center gap-2 px-4 py-3 cursor-pointer"
                                        onClick={() => toggleCard(i)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                toggleCard(i);
                                            }
                                        }}
                                    >
                                        <span className={`shrink-0 rounded-full w-9 h-9 inline-flex items-center justify-center text-[11px] font-semibold leading-none tracking-normal ${chipClass}`}>
                                            {initials}
                                        </span>
                                        <div className="flex-1 flex items-baseline gap-1.5 min-w-0 overflow-hidden">
                                            <span className={`font-semibold text-sm truncate ${isLight ? 'text-slate-800' : 'text-white'}`}>{loc.city}</span>
                                            <span className={`text-xs shrink-0 inline-flex items-center gap-2 ${isLight ? 'text-slate-400' : 'text-gray-400'}`}>
                                                <span>{loc.country}</span>
                                                {flagUrl && (
                                                    <img
                                                        src={flagUrl}
                                                        alt=""
                                                        className="w-5 h-3.5 rounded-[2px] object-cover shadow-sm"
                                                        loading="lazy"
                                                    />
                                                )}
                                            </span>
                                        </div>
                                        <span className={`${isHe ? 'order-2' : 'order-1'} text-sm font-normal shrink-0 ${isLight ? 'text-slate-700' : 'text-white'} ${isHe ? 'text-right' : 'text-left'}`} dir={isHe ? 'rtl' : 'ltr'}>{fmtTripSummary(loc)}</span>
                                        {withdrawalDailyCost > 0 && (
                                            <span
                                                className={`${isHe ? 'order-1' : 'order-2'} shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${withdrawalDailyDiff >= 0
                                                    ? (isLight ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-green-500/15 text-green-200 border border-green-400/20')
                                                    : (isLight ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-red-500/15 text-red-200 border border-red-400/20')}`}
                                                title={isHe ? 'הפרש מול תקציב יומי לפי המשיכה החודשית' : 'Difference vs daily budget from monthly withdrawal'}
                                                dir={isHe ? 'rtl' : 'ltr'}
                                            >
                                                {withdrawalDailyDiff >= 0 ? '+' : '-'}{fmtAmt(Math.abs(withdrawalDailyDiff))}
                                            </span>
                                        )}
                                        {loc.carRentalOriginalCost > 0 && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleLocationCarRental(i);
                                                }}
                                                className={`${isHe ? 'order-0' : 'order-3'} shrink-0 inline-flex items-center justify-center p-0.5 transition-colors ${loc.includeCarRental
                                                    ? (isLight ? 'text-emerald-700 hover:text-emerald-800' : 'text-emerald-200 hover:text-emerald-100')
                                                    : (isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300')}`}
                                                title={loc.includeCarRental
                                                    ? (isHe ? 'בטל עלות שכירת רכב' : 'Remove car rental cost')
                                                    : (isHe ? 'החזר עלות שכירת רכב' : 'Restore car rental cost')}
                                                aria-label={loc.includeCarRental
                                                    ? (isHe ? 'בטל עלות שכירת רכב' : 'Remove car rental cost')
                                                    : (isHe ? 'החזר עלות שכירת רכב' : 'Restore car rental cost')}
                                            >
                                                <Car size={13} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteLocation(i);
                                            }}
                                            disabled={replacingLocation}
                                            className={`order-4 shrink-0 inline-flex items-center justify-center p-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isLight ? 'text-slate-400 hover:text-red-600' : 'text-gray-500 hover:text-red-300'}`}
                                            title={isHe ? 'מחק יעד והבא חלופה' : 'Remove and replace location'}
                                            aria-label={isHe ? 'מחק יעד והבא חלופה' : 'Remove and replace location'}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                        {open ? <ChevronUp size={13} className={`order-5 shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`} /> : <ChevronDown size={13} className={`order-5 shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`} />}
                                    </div>
                                    {open && (
                                        <div className={`px-4 pb-3 border-t space-y-1.5 ${isLight ? 'border-slate-100' : 'border-white/10'}`}>
                                            {loc.note && <p className={`text-[11px] pt-2.5 pb-0.5 leading-relaxed ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{loc.note}</p>}
                                            {(loc.housingType || loc.housingLevel) && (
                                                <div className={`text-[11px] pt-2.5 pb-0.5 leading-relaxed ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                                    <span className="font-semibold">{isHe ? 'דיור: ' : 'Housing: '}</span>
                                                    {[loc.housingType, loc.housingLevel].filter(Boolean).join(' · ')}
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 gap-1.5 pt-1.5">
                                                <div className={`rounded-md px-2 py-1.5 ${isLight ? 'bg-white/75 ring-1 ring-white/80' : 'bg-black/15 ring-1 ring-white/10'} ${isHe ? 'text-right' : 'text-left'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'עלות ללילה' : 'Nightly cost'}</div>
                                                    <div className={`text-xs font-bold ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir={isHe ? 'rtl' : 'ltr'}>{fmtAmt(loc.dailyCost)}</div>
                                                </div>
                                                <div className={`rounded-md px-2 py-1.5 ${isLight ? 'bg-white/75 ring-1 ring-white/80' : 'bg-black/15 ring-1 ring-white/10'} ${isHe ? 'text-right' : 'text-left'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{loc.includeCarRental ? (isHe ? 'כולל טיסה ורכב' : 'Incl. flight + car') : (isHe ? 'כולל טיסה' : 'Incl. flight')}</div>
                            <div className={`text-xs font-bold ${loc.monthFits ? (isLight ? 'text-green-700' : 'text-green-300') : (isLight ? 'text-amber-700' : 'text-amber-300')}`}>
                                {loc.monthFits ? (isHe ? `${loc.tripDays} לילות נכנסים` : `${loc.tripDays} nights fit`) : (isHe ? `${loc.daysAffordable} לילות` : `${loc.daysAffordable} nights`)}
                            </div>
                            {loc.includeCarRental && (
                                <div className={`text-[10px] mt-0.5 ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                                    {isHe ? `רכב ${loc.carRentalDays} ימים` : `Car ${loc.carRentalDays} days`}
                                </div>
                            )}
                                                </div>
                                            </div>
                                            <div className={`grid grid-cols-2 gap-1.5 rounded-lg px-2 py-2 border ${isLight ? 'bg-white/65 border-white/80' : 'bg-black/10 border-white/10'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                <div className={isHe ? 'text-right' : 'text-left'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'עלות יומית יעד' : 'Destination daily'}</div>
                                                    <div className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir={isHe ? 'rtl' : 'ltr'}>{fmtAmt(loc.dailyCost)}</div>
                                                </div>
                                                <div className={isHe ? 'text-right' : 'text-left'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'הוצאה יומית שלי' : 'My actual daily'}</div>
                                                    <div className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir={isHe ? 'rtl' : 'ltr'}>{fmtAmt(actualDailyCost)}</div>
                                                </div>
                                                <div className={isHe ? 'text-right' : 'text-left'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'תקציב יומי ממשיכה' : 'Daily from withdrawal'}</div>
                                                    <div className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir={isHe ? 'rtl' : 'ltr'}>{fmtAmt(withdrawalDailyCost)}</div>
                                                </div>
                                                <div className={isHe ? 'text-right' : 'text-left'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'הפרש מול הוצאה' : 'Vs actual'}</div>
                                                    <div className={`text-xs font-semibold ${actualDailyDiff >= 0 ? (isLight ? 'text-green-700' : 'text-green-300') : (isLight ? 'text-red-600' : 'text-red-300')}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                        {actualDailyDiff >= 0 ? '+' : '-'}{fmtAmt(Math.abs(actualDailyDiff))}
                                                    </div>
                                                </div>
                                                <div className={isHe ? 'text-right' : 'text-left'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'הפרש מול משיכה' : 'Vs withdrawal'}</div>
                                                    <div className={`text-xs font-semibold ${withdrawalDailyDiff >= 0 ? (isLight ? 'text-blue-700' : 'text-blue-300') : (isLight ? 'text-amber-700' : 'text-amber-300')}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                        {withdrawalDailyDiff >= 0 ? '+' : '-'}{fmtAmt(Math.abs(withdrawalDailyDiff))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`pt-2 text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                                {isHe
                                                    ? `פירוט לתקופה: ${tripCostView.nights} לילות. דיור מחושב כלינה קצרה; שאר המחיה יחסית לחודש מלא.`
                                                    : `Trip-period breakdown: ${tripCostView.nights} nights. Housing uses short-stay pricing; other living costs are prorated from a full month.`}
                                            </div>
                                            <div className="space-y-1 pt-1">
                                                {COST_KEYS.map(({ key, labelHe, labelEn }) => {
                                                    const val = tripCostView.breakdown?.[key];
                                                    if (!val) return null;
                                                    const lbl = <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? labelHe : labelEn}</span>;
                                                    const amt = <span className={`text-xs font-medium tabular-nums ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir="ltr">{fmtAmt(val)}</span>;
                                                    return (
                                                        <div key={key} className="flex items-center justify-between gap-4">
                                                            {isHe ? <>{lbl}{amt}</> : <>{lbl}{amt}</>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className={`flex items-center justify-between gap-4 px-3 py-2 mt-1.5 rounded-lg border ${isLight ? 'bg-slate-900/5 border-slate-900/10' : 'bg-white/10 border-white/15'}`}>
                                                <span className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                                    {loc.monthFits
                                                        ? (isHe ? `סה״כ ${loc.tripDays} לילות כולל טיסה${loc.includeCarRental ? ' ורכב' : ''}` : `${loc.tripDays} nights incl. flight${loc.includeCarRental ? ' + car' : ''}`)
                                                        : (isHe ? `סה״כ ${loc.daysAffordable} לילות כולל טיסה${loc.includeCarRental ? ' ורכב' : ''}` : `${loc.daysAffordable} nights incl. flight${loc.includeCarRental ? ' + car' : ''}`)}
                                                </span>
                                                <span className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-white'}`} dir="ltr">{fmtAmt(loc.total)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </>)}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Fixed vs Variable analysis modal ────────────────────────────────────────
const CURRENT_YEAR = new Date().getFullYear();

function FixedVarModal({ isOpen, onClose, items, isHe, isLight, currency, monthlyIncome, maxYear, initialYear, aiProvider, aiModel, apiKeyOverride }) {
    const { dragStyle, onDragMouseDown } = useDraggable(isOpen);
    const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
    const [showLocations, setShowLocations] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [isOpen]);

    useEffect(() => { if (isOpen) setSelectedYear(initialYear ?? CURRENT_YEAR); }, [isOpen]);

    const monthlyForYear = useCallback((item, year) => {
        if (item.type === 'loan') {
            return (item.tracks || [])
                .filter(tr => trackActiveInYear(tr, year))
                .reduce((s, tr) => s + (tr.amount || 0), 0);
        }
        return item.frequency === 'annual' ? (item.amount || 0) / 12 : (item.amount || 0);
    }, []);

    const { fixedGroups, varGroups, fixedTotal, variableTotal } = useMemo(() => {
        if (!isOpen) return { fixedGroups: [], varGroups: [], fixedTotal: 0, variableTotal: 0 };
        const fixed = [], variable = [];
        items.filter(it => it.enabled !== false).forEach(it => {
            const monthly = monthlyForYear(it, selectedYear);
            if (monthly <= 0) return;
            (effectiveIsFixed(it) ? fixed : variable).push({ ...it, monthly });
        });
        const group = list => {
            const map = {};
            list.forEach(it => {
                const cat = CATEGORIES.find(c => c.id === it.categoryId) || { id: it.categoryId, icon: '📋', labelHe: it.categoryId, labelEn: it.categoryId };
                if (!map[cat.id]) map[cat.id] = { cat, items: [], total: 0 };
                map[cat.id].items.push(it);
                map[cat.id].total += it.monthly;
            });
            return Object.values(map).sort((a, b) => b.total - a.total);
        };
        return {
            fixedGroups: group(fixed),
            varGroups: group(variable),
            fixedTotal: fixed.reduce((s, it) => s + it.monthly, 0),
            variableTotal: variable.reduce((s, it) => s + it.monthly, 0),
        };
    }, [isOpen, items, selectedYear, monthlyForYear]);

    const [openCats, setOpenCats] = useState(() => new Set());
    useEffect(() => { if (isOpen) setOpenCats(new Set()); }, [isOpen]);
    const toggleCat = id => setOpenCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    if (!isOpen) return null;

    const total = fixedTotal + variableTotal;
    const fixedPct = total > 0 ? Math.round(fixedTotal / total * 100) : 0;
    const fmt = v => {
        const abs = Math.abs(v);
        if (abs >= 1_000_000) return `${currency}${(abs / 1_000_000).toFixed(1)}M`;
        if (abs >= 1_000) return `${currency}${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
        return `${currency}${Math.round(abs).toLocaleString()}`;
    };

    const renderSection = ({ groups, total: sTotal, Icon, iconColor, label, cardBg, totalColor, sectionKey }) => (
        <div>
            <div className="flex items-center gap-2 mb-2.5">
                <Icon size={12} className={iconColor} />
                <h3 className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>{label}</h3>
                <span className={`ms-auto text-xs font-bold ${totalColor}`} dir={isHe ? 'rtl' : 'ltr'}>{fmt(sTotal)}<span className={`text-[10px] font-normal ms-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? '/חו׳' : '/mo'}</span></span>
            </div>
            <div className="space-y-1.5">
                {groups.map(({ cat, items: catItems, total: catTotal }) => {
                    const key = `${sectionKey}:${cat.id}`;
                    const open = openCats.has(key);
                    return (
                        <div key={cat.id} className={`rounded-lg overflow-hidden ${cardBg}`}>
                            <button
                                className="w-full flex items-center justify-between px-3 py-2"
                                onClick={() => toggleCat(key)}
                            >
                                <span className={`text-[11px] font-semibold ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                    {cat.icon} {isHe ? cat.labelHe : cat.labelEn}
                                    <span className={`ms-1.5 text-[10px] font-normal ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>({catItems.length})</span>
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[11px] font-bold ${totalColor}`} dir="ltr">{fmt(catTotal)}</span>
                                    {open
                                        ? <ChevronUp size={11} className={isLight ? 'text-slate-400' : 'text-gray-500'} />
                                        : <ChevronDown size={11} className={isLight ? 'text-slate-400' : 'text-gray-500'} />}
                                </div>
                            </button>
                            {open && (
                                <div className={`px-3 pb-2 space-y-0.5 border-t ${isLight ? 'border-slate-100' : 'border-white/10'}`}>
                                    {catItems.map(it => (
                                        <div key={it.id} className="flex items-center justify-between pt-1.5">
                                            <span className={`text-[10px] truncate me-2 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{it.label}</span>
                                            <span className={`text-[10px] font-medium shrink-0 ${isLight ? 'text-slate-600' : 'text-gray-300'}`} dir="ltr">{fmt(it.monthly)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const available = monthlyIncome - fixedTotal;
    return (
      <>
        {createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
                className={`relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${isLight ? 'bg-white border-slate-300 text-slate-800' : 'border-white/30 text-white'}`}
                style={dragStyle}
                dir={isHe ? 'rtl' : 'ltr'}
            >
                {!isLight && (<><div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" /><div className="absolute inset-0 bg-white/10" /></>)}

                {/* Header */}
                <div className={`relative z-10 flex items-center gap-3 px-5 py-4 border-b shrink-0 cursor-grab active:cursor-grabbing ${isLight ? 'border-slate-200' : 'border-white/10'}`} onMouseDown={onDragMouseDown}>
                    <div className={`p-1.5 rounded-lg shrink-0 ${isLight ? 'bg-orange-50 text-orange-600' : 'bg-orange-500/20 text-orange-400'}`}><Lock size={16} /></div>
                    <span className={`font-bold text-base flex-1 min-w-0 truncate ${isLight ? 'text-slate-800' : 'text-white'}`}>
                        {isHe ? 'הוצאות קבועות מול משתנות' : 'Fixed vs Variable Expenses'}
                    </span>
                    {/* Year navigation */}
                    <div className="flex items-center gap-1 shrink-0" onMouseDown={e => e.stopPropagation()}>
                        <button
                            onClick={() => setSelectedYear(y => y <= CURRENT_YEAR ? maxYear : y - 1)}
                            className={`p-1 rounded transition-colors ${isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}
                        ><ChevronUp size={14} /></button>
                        <span className={`text-sm font-semibold tabular-nums w-10 text-center ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{selectedYear}</span>
                        <button
                            onClick={() => setSelectedYear(y => y >= maxYear ? CURRENT_YEAR : y + 1)}
                            className={`p-1 rounded transition-colors ${isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}
                        ><ChevronDown size={14} /></button>
                    </div>
                    <button onClick={onClose} onMouseDown={e => e.stopPropagation()} className={`p-1.5 rounded-lg transition-colors shrink-0 ${isLight ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/10 text-gray-400'}`}>
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="relative z-10 overflow-y-auto custom-scrollbar scrollbar-right p-5 space-y-5">
                    {total === 0 ? (
                        <p className={`text-center py-8 text-sm ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                            {isHe ? 'אין הוצאות פעילות להצגה' : 'No active expenses to display'}
                        </p>
                    ) : (<>
                        {/* Summary */}
                        <div className={`rounded-xl p-4 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/5 border border-white/10'}`}>
                            {/* Bar — LTR: orange=fixed on left, blue=variable on right, proportional */}
                            <div className="flex w-full h-2.5 rounded-full overflow-hidden mb-3" dir="ltr">
                                <div className="h-full bg-orange-500 transition-all" style={{ width: `${fixedPct}%` }} />
                                <div className="h-full bg-blue-500 flex-1" />
                            </div>
                            {/* Data columns — LTR layout: fixed anchored left, variable anchored right */}
                            <div className="flex items-start" dir="ltr">
                                {/* Fixed — left-aligned */}
                                <div className="flex-1 text-left">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Lock size={11} className={isLight ? 'text-orange-500' : 'text-orange-400'} />
                                        <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'קבוע' : 'Fixed'}</span>
                                        <span className={`text-[10px] font-bold ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>{fixedPct}%</span>
                                    </div>
                                    <div className={`text-xl font-bold leading-tight ${isLight ? 'text-slate-800' : 'text-white'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                        {fmt(fixedTotal)}<span className={`text-[10px] font-normal ms-1 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? '/חו׳' : '/mo'}</span>
                                    </div>
                                </div>
                                {/* Variable — right-aligned */}
                                <div className="flex-1 text-right">
                                    <div className="flex items-center justify-end gap-1.5 mb-1">
                                        <span className={`text-[10px] font-bold ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>{100 - fixedPct}%</span>
                                        <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'משתנה' : 'Variable'}</span>
                                        <Unlock size={11} className={isLight ? 'text-blue-500' : 'text-blue-400'} />
                                    </div>
                                    {(() => {
                                        const spare = monthlyIncome > 0 ? monthlyIncome - fixedTotal - variableTotal : null;
                                        const spareOk = spare !== null && spare >= 0;
                                        const varSpan = (
                                            <span className={`text-xl font-bold leading-tight ${isLight ? 'text-slate-800' : 'text-white'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                {fmt(variableTotal)}<span className={`text-[10px] font-normal ms-1 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? '/חו׳' : '/mo'}</span>
                                            </span>
                                        );
                                        const spareSpan = spare !== null ? (
                                            <span className={`text-sm font-bold ${spareOk ? (isLight ? 'text-green-600' : 'text-green-400') : (isLight ? 'text-red-500' : 'text-red-400')}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                {spareOk ? '+' : ''}{fmt(spare)}<span className={`text-[10px] font-normal ms-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? '/חו׳' : '/mo'}</span>
                                            </span>
                                        ) : null;
                                        return (
                                            <div className="flex items-baseline justify-end gap-2">
                                                {isHe ? <>{spareSpan}{varSpan}</> : <>{varSpan}{spareSpan}</>}
                                            </div>
                                        );
                                    })()}
                                    {monthlyIncome > 0 && (() => {
                                        const available = monthlyIncome - fixedTotal;
                                        const label = <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'פנוי למחיה' : 'Available'}</span>;
                                        const amount = <span className={`text-base font-bold ${isLight ? 'text-sky-600' : 'text-sky-400'}`} dir={isHe ? 'rtl' : 'ltr'}>{fmt(available)}<span className={`text-[10px] font-normal ms-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? '/חו׳' : '/mo'}</span></span>;
                                        const globeBtn = (
                                            <button onClick={() => setShowLocations(true)} title={isHe ? 'המלצות מגורים' : 'Living suggestions'}
                                                className={`p-0.5 rounded transition-colors shrink-0 ${isLight ? 'text-indigo-400 hover:text-indigo-600' : 'text-indigo-400 hover:text-indigo-300'}`}>
                                                <Globe size={13} />
                                            </button>
                                        );
                                        return (
                                            <div className={`mt-2 pt-2 border-t flex items-center justify-end gap-1.5 ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                                                {isHe ? <>{globeBtn}{amount}{label}</> : <>{amount}{label}{globeBtn}</>}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        {fixedGroups.length > 0 && renderSection({
                            groups: fixedGroups, total: fixedTotal,
                            Icon: Lock, iconColor: isLight ? 'text-orange-500' : 'text-orange-400',
                            label: isHe ? 'הוצאות קבועות' : 'Fixed Expenses',
                            cardBg: isLight ? 'bg-orange-50 border border-orange-100' : 'bg-orange-500/10 border border-orange-500/15',
                            totalColor: isLight ? 'text-orange-600' : 'text-orange-400',
                            sectionKey: 'fixed',
                        })}

                        {varGroups.length > 0 && renderSection({
                            groups: varGroups, total: variableTotal,
                            Icon: Unlock, iconColor: isLight ? 'text-blue-500' : 'text-blue-400',
                            label: isHe ? 'הוצאות משתנות' : 'Variable Expenses',
                            cardBg: isLight ? 'bg-blue-50 border border-blue-100' : 'bg-blue-500/10 border border-blue-500/15',
                            totalColor: isLight ? 'text-blue-600' : 'text-blue-400',
                            sectionKey: 'var',
                        })}

                    </>)}
                </div>
            </div>
        </div>,
        document.body
    )}
    <LocationSuggestModal
        isOpen={showLocations}
        onClose={() => setShowLocations(false)}
        availableAmount={available}
        userMonthlyCost={total}
        monthlySavingsAmount={Math.max(0, monthlyIncome - total)}
        withdrawalMonthlyAmount={monthlyIncome}
        year={selectedYear}
        currency={currency}
        isHe={isHe}
        isLight={isLight}
        aiProvider={aiProvider}
        aiModel={aiModel}
        apiKeyOverride={apiKeyOverride}
    />
  </>
);
}

// Budget is stored globally in Firestore per user — not per-profile.
// setInputs is only called when the user explicitly clicks "adopt as income target".
export default function BudgetPlanner({ inputs, setInputs, results, t, language, isLight, aiProvider, aiModel, apiKeyOverride }) {
    const isHe = language === 'he';
    const currency = isHe ? '₪' : '$';
    // Use actual calculated net withdrawal if available (reflects withdrawal strategy), else use the manual input
    const target = Math.round(results?.initialNetWithdrawal ?? parseFloat(inputs.monthlyNetIncomeDesired) ?? 0);
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;

    const [items, setItems] = useState(() => DEFAULT_ITEMS.map(normalizeBudgetItem));
    const [householdSize, setHouseholdSize] = useState(2);
    const [showInflation, setShowInflation] = useState(false);
    const [projYears, setProjYears] = useState(5);

    // Effective annual inflation rate: use inputs if set, else country default
    const inflationRate = inputs.inflationRate > 0
        ? inputs.inflationRate / 100
        : (isHe ? 0.035 : 0.025);
    const projFactor = Math.pow(1 + inflationRate, projYears);
    const [loaded, setLoaded] = useState(false);
    const saveAllowedRef = useRef(false); // only true after successful Firestore load
    const saveTimerRef = useRef(null);
    const confirmedRef = useRef(null);   // last successfully saved snapshot
    const latestStateRef = useRef({ items, householdSize }); // always-current ref for closures
    const backupSlotsRef = useRef([]);   // in-memory mirror of Firestore backupSlots
    const pauseStateFingerprintRef = useRef(null);
    const [backups, setBackups] = useState([]);
    const [showRestore, setShowRestore] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState(null); // { type: 'restore'|'reset', backup? }
    const [openCategoryId, setOpenCategoryId] = useState(null);
    const [aiInsight, setAiInsight] = useState(null);
    const [aiInsightStale, setAiInsightStale] = useState(false);
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [showRetirementMode, setShowRetirementMode] = useState(false);
    const aiInsightRef = useRef(null);      // cached insight text (survives modal close)
    const aiInsightStaleRef = useRef(false); // mirror of aiInsightStale for use inside callbacks
    const aiStaleInitRef = useRef(false);   // true after the first post-load render
    const { dragStyle: aiDragStyle, onDragMouseDown: onAiDragMouseDown } = useDraggable(aiModalOpen);
    const [searchQuery, setSearchQuery] = useState('');
    const [showStats, setShowStats] = useState(false);
    const [showFixedVar, setShowFixedVar] = useState(false);
    const [sliderConsumed, setSliderConsumed] = useState(0);
    const currentYear = new Date().getFullYear();
    const retirementEndYear = currentYear + Math.max(0, Math.round(
        parseFloat(inputs.retirementEndAge || 90) - parseFloat(inputs.currentAge || 40)
    ));
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [yearAmounts, setYearAmounts] = useState({});
    const yearAmountsRef = useRef({});
    // Undo / redo
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const historyRef = useRef({ past: [], future: [] });
    const beforeChangeRef = useRef(null);
    const historyDebounceRef = useRef(null);
    // Copy-from dropdown
    const [copyDropdownOpen, setCopyDropdownOpen] = useState(false);
    const copyDropdownRef = useRef(null);
    const [copiedStateByYear, setCopiedStateByYear] = useState({});

    // Close copy dropdown on outside click
    useEffect(() => {
        if (!copyDropdownOpen) return;
        const handler = (e) => {
            if (copyDropdownRef.current && !copyDropdownRef.current.contains(e.target)) {
                setCopyDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [copyDropdownOpen]);

    // Keyboard navigation for years
    useEffect(() => {
        const handleKeyDown = (e) => {
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
            
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setSelectedYear(y => isHe
                    ? (y <= currentYear ? retirementEndYear : y - 1)
                    : (y >= retirementEndYear ? currentYear : y + 1));
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setSelectedYear(y => isHe
                    ? (y >= retirementEndYear ? currentYear : y + 1)
                    : (y <= currentYear ? retirementEndYear : y - 1));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isHe, currentYear, retirementEndYear]);

    // Load slider value from Firestore on login
    useEffect(() => {
        if (!uid) return;
        getUserSettings(uid).then(s => {
            if (s?.budgetSliderConsumed != null) setSliderConsumed(s.budgetSliderConsumed);
        }).catch(() => {});
    }, [uid]);

    // Debounced save of slider value to Firestore
    useEffect(() => {
        if (!uid) return;
        const t = setTimeout(() => {
            setUserSettings(uid, { budgetSliderConsumed: sliderConsumed }).catch(() => {});
        }, 800);
        return () => clearTimeout(t);
    }, [uid, sliderConsumed]);

    useEffect(() => {
        const handler = (e) => {
            if (e.detail === 'open:budgetAI')    setAiModalOpen(true);
            if (e.detail === 'open:budgetStats') setShowStats(true);
        };
        window.addEventListener('app:command', handler);
        window.addEventListener('app:budgetCommand', handler);
        return () => {
            window.removeEventListener('app:command', handler);
            window.removeEventListener('app:budgetCommand', handler);
        };
    }, []);

    // Always-current refs so closures always see latest state
    latestStateRef.current = { items, householdSize, yearAmounts };
    yearAmountsRef.current = yearAmounts;
    aiInsightStaleRef.current = aiInsightStale;

    // Derive clean display text and structured retirement adjustments from raw AI insight
    const insightText    = useMemo(() => stripRetirementJson(aiInsight), [aiInsight]);
    const retirementAdj  = useMemo(() => parseRetirementAdj(aiInsight),  [aiInsight]);

    const updateItems = useCallback((updater) => {
        setItems(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            if (!Array.isArray(next)) return next;
            return next.map(normalizeBudgetItem);
        });
    }, []);

    // History helpers — capture state before changes for undo/redo
    const prepareHistoryCapture = useCallback(() => {
        if (!beforeChangeRef.current) {
            beforeChangeRef.current = {
                items: latestStateRef.current.items,
                yearAmounts: { ...yearAmountsRef.current },
            };
        }
        clearTimeout(historyDebounceRef.current);
        historyDebounceRef.current = setTimeout(() => {
            if (beforeChangeRef.current) {
                historyRef.current.past.push(beforeChangeRef.current);
                if (historyRef.current.past.length > 50) historyRef.current.past.shift();
                historyRef.current.future = [];
                beforeChangeRef.current = null;
                setCanUndo(true);
                setCanRedo(false);
            }
        }, 1200);
    }, []);

    const pushHistoryNow = useCallback(() => {
        clearTimeout(historyDebounceRef.current);
        beforeChangeRef.current = null;
        historyRef.current.past.push({
            items: latestStateRef.current.items,
            yearAmounts: { ...yearAmountsRef.current },
        });
        if (historyRef.current.past.length > 50) historyRef.current.past.shift();
        historyRef.current.future = [];
        setCanUndo(true);
        setCanRedo(false);
    }, []);

    const handleUndo = useCallback(() => {
        clearTimeout(historyDebounceRef.current);
        beforeChangeRef.current = null;
        const { past, future } = historyRef.current;
        if (!past.length) return;
        future.push({ items: latestStateRef.current.items, yearAmounts: { ...yearAmountsRef.current } });
        const prev = past.pop();
        setItems(prev.items.map(normalizeBudgetItem));
        setYearAmounts(prev.yearAmounts || {});
        setCanUndo(past.length > 0);
        setCanRedo(true);
    }, []);

    const handleRedo = useCallback(() => {
        clearTimeout(historyDebounceRef.current);
        beforeChangeRef.current = null;
        const { past, future } = historyRef.current;
        if (!future.length) return;
        past.push({ items: latestStateRef.current.items, yearAmounts: { ...yearAmountsRef.current } });
        const next = future.pop();
        setItems(next.items.map(normalizeBudgetItem));
        setYearAmounts(next.yearAmounts || {});
        setCanUndo(true);
        setCanRedo(future.length > 0);
    }, []);

    const persistBudgetSnapshot = useCallback((withBackup = true) => {
        if (!uid || !loaded || !saveAllowedRef.current) return;

        const { items: latestItems, householdSize: latestHouseholdSize, yearAmounts: latestYearAmounts } = latestStateRef.current;
        const normalizedItems = Array.isArray(latestItems) ? latestItems.map(normalizeBudgetItem) : latestItems;
        const prev = confirmedRef.current;
        let newSlots = backupSlotsRef.current;

        if (withBackup && prev?.items?.some(i => i.enabled !== false && toMonthly(i) > 0)) {
            const isDup = newSlots[0] && JSON.stringify(newSlots[0].items) === JSON.stringify(prev.items);
            if (!isDup) {
                newSlots = [
                    {
                        items: prev.items,
                        householdSize: prev.householdSize,
                        totalMonthly: prev.items.filter(i => i.enabled !== false).reduce((s, i) => s + toMonthly(i), 0),
                        savedAt: prev.savedAt
                    },
                    ...newSlots,
                ].slice(0, MAX_BACKUP_SLOTS);
            }
        }

        const snap = { items: normalizedItems, householdSize: latestHouseholdSize, savedAt: Date.now() };
        setBudgetItems(uid, normalizedItems, latestHouseholdSize, withBackup ? newSlots : undefined, latestYearAmounts || {})
            .then(() => {
                confirmedRef.current = snap;
                if (withBackup) {
                    backupSlotsRef.current = newSlots;
                    setBackups(newSlots);
                }
            })
            .catch(err => console.error('[Budget save]', err));
    }, [uid, loaded]);

    // Listen for confirmed reminders and remove them from items
    useEffect(() => {
        const handler = (e) => {
            const { id } = e.detail;
            window.__rc_handling_reminder_confirm = id;
            updateItems(prev => prev.map(i => i.id === id ? { ...i, reminder: undefined } : i));
            setTimeout(() => {
                if (window.__rc_handling_reminder_confirm === id) {
                    window.__rc_handling_reminder_confirm = null;
                }
            }, 1000);
        };
        window.addEventListener('rc-reminder-confirmed', handler);
        return () => window.removeEventListener('rc-reminder-confirmed', handler);
    }, [updateItems]);

    // Handle incoming navigation to a specific budget item
    useEffect(() => {
        const handleScroll = (e) => {
            const { id } = e.detail;
            const state = latestStateRef.current;
            const item = state.items.find(i => i.id === id || (i.tracks && i.tracks.some(tr => tr.id === id)));
            if (item) {
                // Ensure the category is open
                setOpenCategoryId(item.categoryId);
                
                // Allow time for the category to render and expand if it was closed
                setTimeout(() => {
                    const el = document.getElementById(`budget-item-${item.id}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        const oldBg = el.style.backgroundColor;
                        const oldTransition = el.style.transition;
                        el.style.transition = 'background-color 0.5s';
                        el.style.backgroundColor = 'rgba(234, 179, 8, 0.3)'; // Highlight with yellow for 2s
                        setTimeout(() => {
                            el.style.backgroundColor = oldBg;
                            setTimeout(() => { el.style.transition = oldTransition; }, 500);
                        }, 2000);
                    }
                }, 100);
            }
        };
        window.addEventListener('rc-scroll-to-budget-item', handleScroll);
        return () => window.removeEventListener('rc-scroll-to-budget-item', handleScroll);
    }, []);



    const pauseStateFingerprint = useMemo(
        () => items
            .map(i => `${i.id}:${i.enabled === false ? '0' : '1'}:${i.reminder?.date || ''}:${i.pausedReminder?.date || ''}`)
            .join('|'),
        [items]
    );

    // Helper to calculate continuous item values dynamically from currentYear to targetYear
    const getResolvedItemsForYear = useCallback((targetYear) => {
        let result = [];
        if (targetYear <= currentYear) {
            const yearData = yearAmounts[targetYear] || {};
            result = items.map(item => {
                if (item.type === 'loan') {
                    const filteredTracks = (item.tracks || []).filter(tr => trackActiveInYear(tr, targetYear));
                    return { ...item, tracks: filteredTracks };
                }
                const override = yearData[item.id];
                if (override) return { ...item, ...override };
                return item;
            });
        } else {
            let prevYearItems = items.map(item => {
                if (item.type === 'loan') {
                    const filteredTracks = (item.tracks || []).filter(tr => trackActiveInYear(tr, currentYear));
                    return { ...item, tracks: filteredTracks };
                }
                const override = yearAmounts[currentYear]?.[item.id];
                return override ? { ...item, ...override } : item;
            });

            for (let y = currentYear + 1; y <= targetYear; y++) {
                const categoryTotals = {};
                prevYearItems.forEach(item => {
                    if (item.enabled !== false && item.type !== 'loan') {
                        categoryTotals[item.categoryId] = (categoryTotals[item.categoryId] || 0) + (item.frequency === 'annual' ? item.amount / 12 : item.amount);
                    }
                });

                const currentYearItems = prevYearItems.map((prevItem, idx) => {
                    const baseItem = items[idx];
                    if (baseItem.type === 'loan') {
                        const filteredTracks = (baseItem.tracks || []).filter(tr => trackActiveInYear(tr, y));
                        return { ...baseItem, tracks: filteredTracks };
                    }

                    let nextItem = { ...prevItem };
                    
                    if (baseItem.isContinuous) {
                        if (baseItem.endYear && y > baseItem.endYear) {
                            nextItem.amount = 0;
                        } else {
                            let growth = 0;
                            if (baseItem.growthType === 'fixed') {
                                growth = baseItem.growthValue || 0;
                            } else if (baseItem.growthType === 'percent') {
                                growth = prevItem.amount * ((baseItem.growthValue || 0) / 100);
                            } else if (baseItem.growthType === 'categoryPercent') {
                                const catTotalMonthly = categoryTotals[baseItem.categoryId] || 0;
                                const catTotalForFreq = nextItem.frequency === 'annual' ? catTotalMonthly * 12 : catTotalMonthly;
                                growth = catTotalForFreq * ((baseItem.growthValue || 0) / 100);
                            }
                            nextItem.amount = Math.round(prevItem.amount + growth);
                        }
                    }

                    const override = yearAmounts[y]?.[baseItem.id];
                    if (override) {
                        if (baseItem.isContinuous) {
                            const { amount, frequency, ...restOverride } = override;
                            nextItem = { ...nextItem, ...restOverride };
                        } else {
                            nextItem = { ...nextItem, ...override };
                        }
                    }

                    return nextItem;
                });
                prevYearItems = currentYearItems;
            }
            result = prevYearItems;
        }

        return result.filter(item => {
            const baseItem = items.find(i => i.id === item.id);
            if (!baseItem) return true;
            if (baseItem.type === 'loan' && (baseItem.tracks || []).length > 0 && (item.tracks || []).length === 0) return false;
            if (baseItem.isContinuous && baseItem.endYear && targetYear > baseItem.endYear) return false;
            return true;
        });
    }, [items, yearAmounts, currentYear]);

    // Per-year display items: base items with yearAmounts[selectedYear] overrides and loan tracks filtered by year
    const displayItems = useMemo(() => getResolvedItemsForYear(selectedYear), [selectedYear, getResolvedItemsForYear]);

    const searchResults = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return null;
        return displayItems.filter(item => {
            const hay = [
                item.label,
                ...(item.tracks || []).map(tr => tr.label),
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [searchQuery, displayItems]);

    useEffect(() => {
        pauseStateFingerprintRef.current = null;
    }, [uid]);

    // Load from Firestore on mount
    useEffect(() => {
        if (!uid) return;
        getBudgetItems(uid).then(saved => {
            let loadedItems = null;
            let loadedHouseholdSize = 2;
            let loadedYearAmounts = null;
            if (saved) {
                if (Array.isArray(saved)) { loadedItems = saved; } // legacy format
                else {
                    if (Array.isArray(saved.items)) loadedItems = saved.items;
                    if (saved.householdSize) loadedHouseholdSize = saved.householdSize;
                    if (saved.yearAmounts && typeof saved.yearAmounts === 'object') loadedYearAmounts = saved.yearAmounts;
                }
            }
            if (loadedItems) {
                let normalizedLoadedItems = loadedItems.map(normalizeBudgetItem);
                const slots = Array.isArray(saved?.backupSlots) ? saved.backupSlots : [];

                // Inject any DEFAULT_ITEMS missing from saved data (e.g. newly added defaults).
                // Each missing item is inserted after the last existing item of the same category.
                const loadedIds = new Set(normalizedLoadedItems.map(i => i.id));
                const missingDefaults = DEFAULT_ITEMS
                    .filter(d => !loadedIds.has(d.id))
                    .map(normalizeBudgetItem);
                if (missingDefaults.length > 0) {
                    const merged = [...normalizedLoadedItems];
                    missingDefaults.forEach(missing => {
                        let insertAt = merged.length;
                        for (let i = merged.length - 1; i >= 0; i--) {
                            if (merged[i].categoryId === missing.categoryId) { insertAt = i + 1; break; }
                        }
                        merged.splice(insertAt, 0, missing);
                    });
                    normalizedLoadedItems = merged;
                    setBudgetItems(uid, normalizedLoadedItems, loadedHouseholdSize, slots)
                        .catch(err => console.error('[Budget defaults injection]', err));
                } else if (JSON.stringify(normalizedLoadedItems) !== JSON.stringify(loadedItems)) {
                    setBudgetItems(uid, normalizedLoadedItems, loadedHouseholdSize, slots)
                        .catch(err => console.error('[Budget status migration]', err));
                }

                setItems(normalizedLoadedItems);
                setHouseholdSize(loadedHouseholdSize);
                if (loadedYearAmounts) {
                    setYearAmounts(loadedYearAmounts);
                    yearAmountsRef.current = loadedYearAmounts;
                }
                confirmedRef.current = { items: normalizedLoadedItems, householdSize: loadedHouseholdSize, savedAt: Date.now() };
                backupSlotsRef.current = slots;
                setBackups(slots);
            }
            saveAllowedRef.current = true;
            setLoaded(true);
        }).catch(err => {
            console.error('[Budget load error]', err);
            // Do NOT allow saves if load failed — prevents overwriting Firestore with DEFAULT_ITEMS
            setLoaded(true);
        });
    }, [uid]);

    // Load AI insight from its own dedicated Firestore document — completely isolated from budget items
    useEffect(() => {
        if (!uid) return;
        aiStaleInitRef.current = false; // reset so the stale effect skips the first post-load fire
        getBudgetAiInsight(uid).then(saved => {
            if (saved?.insight) {
                aiInsightRef.current = saved.insight;
                setAiInsight(saved.insight);
                setAiInsightStale(false);
            }
        }).catch(err => console.error('[Budget AI insight load error]', err));
    }, [uid]);

    // Persist pause/unpause state immediately so it survives quick logout/login cycles.
    useEffect(() => {
        if (!uid || !loaded || !saveAllowedRef.current) return;
        if (pauseStateFingerprintRef.current === null) {
            pauseStateFingerprintRef.current = pauseStateFingerprint;
            return;
        }
        if (pauseStateFingerprintRef.current === pauseStateFingerprint) return;

        pauseStateFingerprintRef.current = pauseStateFingerprint;
        clearTimeout(saveTimerRef.current);
        persistBudgetSnapshot(false);
    }, [uid, loaded, pauseStateFingerprint, persistBudgetSnapshot]);

    // Debounced save to Firestore whenever items or yearAmounts change (after initial load)
    useEffect(() => {
        if (!uid || !loaded || !saveAllowedRef.current) return;
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            persistBudgetSnapshot(true);
        }, SAVE_DEBOUNCE_MS);
        return () => clearTimeout(saveTimerRef.current);
    }, [uid, items, householdSize, yearAmounts, loaded, persistBudgetSnapshot]);

    // Mark AI insight as stale when items, householdSize, or the calculator profile changes after initial load
    useEffect(() => {
        if (!loaded) return;
        if (!aiStaleInitRef.current) { aiStaleInitRef.current = true; return; } // skip the load-triggered fire
        if (aiInsightRef.current) setAiInsightStale(true);
    }, [items, householdSize, results, loaded]);

    // Keep sessionStorage in sync so AI chat and AI insights can read the budget
    useEffect(() => {
        if (!loaded) return;
        try {
            const monthlyBase = displayItems.filter(i => i.enabled !== false).reduce((s, i) => s + toMonthly(i), 0);
            const retDelta = showRetirementMode && retirementAdj
                ? (retirementAdj.additions || []).reduce((s, a) => s + (a.monthlyAmount || 0), 0)
                  + (retirementAdj.increases || []).reduce((s, inc) => {
                      const matched = displayItems.filter(i => i.enabled !== false).some(i => matchIncrease(i.label, inc.itemLabel));
                      return s + (matched ? (inc.increaseAmount || 0) : 0);
                  }, 0)
                : 0;
            const monthly = monthlyBase + retDelta;
            const incomeTarget = Math.round(results?.initialNetWithdrawal ?? parseFloat(inputs.monthlyNetIncomeDesired) ?? 0);
            const perPerson = householdSize > 0 ? Math.round(monthly / householdSize) : 0;

            const SCALABLE_CATS = new Set(['food', 'health', 'personal', 'family', 'entertainment']);
            const categories = CATEGORIES.map(cat => {
                const catItems = displayItems.filter(i => i.categoryId === cat.id && i.enabled !== false && toMonthly(i) > 0);
                const catTotal = Math.round(catItems.reduce((s, i) => s + toMonthly(i), 0));
                return {
                    labelHe: cat.labelHe,
                    labelEn: cat.labelEn,
                    total: catTotal,
                    perPerson: householdSize > 0 ? Math.round(catTotal / householdSize) : null,
                    scalesWithPeople: SCALABLE_CATS.has(cat.id),
                    empty: catItems.length === 0,
                    items: catItems.map(i => ({
                        label: i.label,
                        amount: Math.round(toMonthly(i)),
                        ...(i.type === 'maintenance-calc' && i.calcInputs ? { note: 'חושב ממחשבון תחזוקה', calcInputs: i.calcInputs } : {}),
                    })),
                };
            });

            const loanTracks = displayItems.filter(i => i.type === 'loan' && i.enabled !== false)
                .flatMap(i => (i.tracks || []).filter(tr => tr.endDate && tr.amount > 0).map(tr => {
                    const [y, m] = tr.endDate.split('-').map(Number);
                    const ml = y * 12 + (m - 1) - getNowYM();
                    return { loan: i.label, track: tr.label, amount: tr.amount, endDate: tr.endDate, monthsLeft: ml, active: ml >= 0 };
                }));

            const projectedMonthly = displayItems.filter(i => i.enabled !== false).reduce((s, i) => s + toProjectedMonthly(i, projFactor, projYears), 0);

            sessionStorage.setItem('rc-budget-summary', JSON.stringify({
                totalMonthly: Math.round(monthly),
                totalAnnual: Math.round(monthly * 12),
                incomeTarget,
                gap: Math.round(incomeTarget - monthly),
                householdSize,
                perPerson,
                selectedYear,
                categories,
                loanTracks: loanTracks.length ? loanTracks : undefined,
                inflation: showInflation ? {
                    rate: inflationRate,
                    years: projYears,
                    projectedMonthly: Math.round(projectedMonthly),
                    projectedAnnual: Math.round(projectedMonthly * 12),
                } : undefined,
            }));
            window.dispatchEvent(new Event('rc-budget-updated'));
        } catch {}
    }, [displayItems, loaded, inputs.monthlyNetIncomeDesired, results, householdSize, showInflation, inflationRate, projFactor, projYears, showRetirementMode, retirementAdj, selectedYear]);

    // Keep budget reminders in sync immediately from local state (before DB debounce/save).
    useEffect(() => {
        if (!loaded) return;
        const budgetReminders = items
            .filter(i => i?.enabled !== false && i?.reminder?.date)
            .map(i => ({
                id: String(i.id),
                label: i.label || i.title || i.id,
                reminder: { date: i.reminder.date, text: i.reminder.text || '' }
            }));
        syncComponentReminders('budget', budgetReminders, true);
    }, [items, loaded]);

    // totalMonthly must be declared before any callbacks that reference it
    const totalMonthlyBase = useMemo(
        () => displayItems.filter(i => i.enabled !== false).reduce((s, i) => s + toMonthly(i), 0),
        [displayItems]
    );
    const retirementDeltaTotal = useMemo(() => {
        if (!showRetirementMode || !retirementAdj) return 0;
        const additions = (retirementAdj.additions || []).reduce((s, a) => s + (a.monthlyAmount || 0), 0);
        const increases = (retirementAdj.increases || []).reduce((s, inc) => {
            // only count increase if there's a matching enabled item
            const matched = displayItems.filter(i => i.enabled !== false).some(i => matchIncrease(i.label, inc.itemLabel));
            return s + (matched ? (inc.increaseAmount || 0) : 0);
        }, 0);
        return additions + increases;
    }, [showRetirementMode, retirementAdj, displayItems]);
    const totalMonthly = showRetirementMode ? totalMonthlyBase + retirementDeltaTotal : totalMonthlyBase;
    const fullMonthly = useMemo(
        () => displayItems.reduce((s, i) => s + toMonthly(i), 0),
        [displayItems]
    );
    const pausedMonthly = fullMonthly - totalMonthly;
    const totalProjectedMonthly = useMemo(
        () => displayItems.filter(i => i.enabled !== false).reduce((s, i) => s + toProjectedMonthly(i, projFactor, projYears), 0),
        [displayItems, projFactor, projYears]
    );


    const visibleCategories = useMemo(() => {
        const allCategoryIds = CATEGORIES.map(c => c.id);
        const customCategoryIds = [...new Set(
            items.filter(i => !allCategoryIds.includes(i.categoryId)).map(i => i.categoryId)
        )];
        const all = [
            ...CATEGORIES,
            ...customCategoryIds.map(id => ({ id, icon: '📋', labelHe: id, labelEn: id })),
        ];
        // Fully-disabled categories sink to the bottom; within each group sort by enabled monthly cost desc
        return all.sort((a, b) => {
            const catItemsA = displayItems.filter(i => i.categoryId === a.id);
            const catItemsB = displayItems.filter(i => i.categoryId === b.id);
            const allOffA = catItemsA.length > 0 && catItemsA.every(i => i.enabled === false);
            const allOffB = catItemsB.length > 0 && catItemsB.every(i => i.enabled === false);
            if (allOffA !== allOffB) return allOffA ? 1 : -1;
            const totalA = catItemsA.filter(i => i.enabled !== false).reduce((s, i) => s + toMonthly(i), 0);
            const totalB = catItemsB.filter(i => i.enabled !== false).reduce((s, i) => s + toMonthly(i), 0);
            return totalB - totalA;
        });
    }, [items, displayItems]);

    const applyStatusItemsWithImmediateSave = useCallback((nextItems) => {
        const normalizedNextItems = Array.isArray(nextItems) ? nextItems.map(normalizeBudgetItem) : [];
        setItems(normalizedNextItems);
        const { householdSize: nextHouseholdSize, yearAmounts: nextYearAmounts } = latestStateRef.current;
        latestStateRef.current = { items: normalizedNextItems, householdSize: nextHouseholdSize, yearAmounts: nextYearAmounts };

        if (!uid || !loaded || !saveAllowedRef.current) return;
        clearTimeout(saveTimerRef.current);
        setBudgetItems(uid, normalizedNextItems, nextHouseholdSize, undefined, nextYearAmounts || {})
            .then(() => {
                confirmedRef.current = { items: normalizedNextItems, householdSize: nextHouseholdSize, savedAt: Date.now() };
            })
            .catch(err => console.error('[Budget status immediate save]', err));
    }, [uid, loaded]);

    const handleChangeItem = useCallback((updated) => {
        const isLoan = updated.type === 'loan';
        const hasAmountOrFreq = 'amount' in updated || 'frequency' in updated;
        const baseItem = latestStateRef.current.items.find(i => i.id === updated.id);

        if (!isLoan && hasAmountOrFreq && !baseItem?.isContinuous) {
            // Store amount/frequency as a per-year override
            const currentOverride = yearAmountsRef.current[selectedYear]?.[updated.id] || {};
            prepareHistoryCapture();
            setYearAmounts(prev => ({
                ...prev,
                [selectedYear]: {
                    ...(prev[selectedYear] || {}),
                    [updated.id]: {
                        amount: 'amount' in updated ? (updated.amount ?? 0) : (currentOverride.amount ?? baseItem?.amount ?? 0),
                        frequency: 'frequency' in updated ? (updated.frequency ?? 'monthly') : (currentOverride.frequency ?? baseItem?.frequency ?? 'monthly'),
                    }
                }
            }));
            // Update structural fields only (strip amount/frequency so items stays as template)
            const { amount: _a, frequency: _f, ...withoutAmounts } = updated;
            if (Object.keys(withoutAmounts).length > 1) { // more than just 'id'
                updateItems(prev => prev.map(i => i.id === updated.id ? mergeBudgetItemUpdate(i, withoutAmounts) : i));
            }
        } else {
            // Loan items or pure structural changes → update items directly
            prepareHistoryCapture();
            updateItems(prev => prev.map(i => i.id === updated.id ? mergeBudgetItemUpdate(i, updated) : i));
        }
    }, [updateItems, selectedYear, prepareHistoryCapture]);

    const handleToggleItemEnabled = useCallback((itemId, nextEnabled) => {
        const currentItems = Array.isArray(latestStateRef.current.items) ? latestStateRef.current.items : [];
        const nextItems = currentItems.map(i => String(i.id) === String(itemId) ? withReminderPausedState(i, nextEnabled) : i);
        applyStatusItemsWithImmediateSave(nextItems);
    }, [applyStatusItemsWithImmediateSave]);

    const handleDeleteItem = useCallback((id) => {
        pushHistoryNow();
        updateItems(prev => prev.filter(i => i.id !== id));
        setYearAmounts(prev => {
            const next = {};
            for (const [yr, amounts] of Object.entries(prev)) {
                const { [id]: _removed, ...rest } = amounts;
                next[yr] = rest;
            }
            return next;
        });
    }, [updateItems, pushHistoryNow]);

    const handleAddItem = useCallback((categoryId) => {
        pushHistoryNow();
        const newItem = { id: genId(), categoryId, label: t('budgetNewItem'), amount: 0, frequency: 'monthly', enabled: true };
        updateItems(prev => [...prev, newItem]);
    }, [updateItems, t, pushHistoryNow]);

    const handleAddLoanItem = useCallback((categoryId) => {
        pushHistoryNow();
        const firstTrack = { id: genId(), label: t('budgetTrack'), amount: 0, endDate: '' };
        const newItem = { id: genId(), categoryId, label: t('budgetAddLoan'), type: 'loan', tracks: [firstTrack], enabled: true };
        updateItems(prev => [...prev, newItem]);
        setOpenCategoryId(categoryId);
    }, [updateItems, t, pushHistoryNow]);

    const handleAddMaintenanceItem = useCallback((categoryId) => {
        pushHistoryNow();
        const newItem = { id: genId(), categoryId, label: isHe ? 'תחזוקת דירה' : 'Home Maintenance', type: 'maintenance-calc', amount: 0, frequency: 'annual', enabled: true };
        updateItems(prev => [...prev, newItem]);
        setOpenCategoryId(categoryId);
    }, [updateItems, isHe, pushHistoryNow]);

    const handleRestore = useCallback((backup) => {
        setPendingConfirm({ type: 'restore', backup });
    }, []);

    const handleConfirmAction = useCallback(() => {
        if (!pendingConfirm) return;
        pushHistoryNow();
        if (pendingConfirm.type === 'restore') {
            const { backup } = pendingConfirm;
            if (Array.isArray(backup.items)) setItems(backup.items.map(normalizeBudgetItem));
            if (backup.householdSize) setHouseholdSize(backup.householdSize);
            setShowRestore(false);
        } else if (pendingConfirm.type === 'reset') {
            updateItems(DEFAULT_ITEMS);
            setAiInsight(null);
            aiInsightRef.current = null;
            setAiInsightStale(false);
            if (uid) setBudgetAiInsight(uid, null).catch(err => console.error('[Budget AI insight reset error]', err));
        }
        setPendingConfirm(null);
    }, [pendingConfirm, updateItems, uid, pushHistoryNow]);

    const handleAddCategory = useCallback(() => {
        const name = prompt(t('budgetCategoryName'));
        if (!name?.trim()) return;
        const catId = name.trim().toLowerCase().replace(/\s+/g, '-');
        const newItem = { id: genId(), categoryId: catId, label: t('budgetNewItem'), amount: 0, frequency: 'monthly', enabled: true };
        updateItems(prev => [...prev, newItem]);
    }, [updateItems, t]);

    const handleAdoptAsTarget = useCallback(() => {
        setInputs(prev => ({ ...prev, monthlyNetIncomeDesired: Math.round(totalMonthly) }));
    }, [setInputs, totalMonthly]);

    const handleToggleCategoryItems = useCallback((categoryId) => {
        const currentItems = Array.isArray(latestStateRef.current.items) ? latestStateRef.current.items : [];
            const catItems = currentItems.filter(i => i.categoryId === categoryId);
            const allEnabled = catItems.every(i => i.enabled !== false);
            // If all enabled → disable all; otherwise → enable all
            const nextItems = currentItems.map(i => i.categoryId === categoryId ? withReminderPausedState(i, !allEnabled) : i);
            applyStatusItemsWithImmediateSave(nextItems);
    }, [applyStatusItemsWithImmediateSave]);

    const handleReset = useCallback(() => {
        setPendingConfirm({ type: 'reset' });
    }, []);

    const handleAiInsight = useCallback(async () => {
        if (!aiProvider || !aiModel) return;

        setAiModalOpen(true);
        if (aiInsightRef.current && !aiInsightStaleRef.current) return; // cached and data unchanged — show as-is

        setAiLoading(true);
        setAiError(null);
        try {
            const cur = isHe ? '₪' : '$';
            // Categories whose total scales with number of people
            const SCALABLE_CATS = new Set(['food', 'health', 'personal', 'family', 'entertainment']);
            const catLabels = Object.fromEntries(CATEGORIES.map(c => [c.id, isHe ? c.labelHe : c.labelEn]));

            const emptyCatNames = [];
            const lines = CATEGORIES.map(cat => {
                const catItems = displayItems.filter(i => i.categoryId === cat.id && i.enabled !== false);
                const activeItems = catItems.filter(i => {
                    if (i.type === 'loan') return (i.tracks || []).some(tr => !tr.endDate || parseInt(tr.endDate.split('-')[0]) >= selectedYear);
                    return i.amount > 0;
                });
                if (!activeItems.length) {
                    emptyCatNames.push(catLabels[cat.id] || cat.id);
                    return null;
                }
                const catTotal = activeItems.reduce((s, i) => s + toMonthly(i), 0);
                const catPerPerson = householdSize > 0 ? Math.round(catTotal / householdSize) : 0;
                const scaleTag = SCALABLE_CATS.has(cat.id)
                    ? (isHe ? ` | ${cur}${catPerPerson}/נפש [משתנה לפי נפשות]` : ` | ${cur}${catPerPerson}/person [scales with people]`)
                    : (isHe ? ` [קבועה — לא תלויה בנפשות]` : ` [fixed — doesn't scale]`);
                const itemLines = activeItems.map(i => {
                    if (i.type === 'loan') {
                        const allTracks = (i.tracks || []);
                        const trackLines = allTracks.map(tr => {
                            const active = trackActive(tr);
                            const ml = tr.endDate ? (() => { const [y, m] = tr.endDate.split('-').map(Number); return y * 12 + (m - 1) - getNowYM(); })() : null;
                            const status = !tr.endDate ? (isHe ? 'ללא תאריך סיום' : 'no end date')
                                : active ? (isHe ? `נגמר בעוד ${ml} חודשים (${tr.endDate})` : `ends in ${ml}mo (${tr.endDate})`)
                                : (isHe ? `הסתיים (${tr.endDate})` : `expired (${tr.endDate})`);
                            return `    · ${tr.label}: ${cur}${tr.amount}/mo — ${status}`;
                        }).join('\n');
                        return `  - ${i.label} (loan) ${cur}${Math.round(toMonthly(i))}/mo:\n${trackLines}`;
                    }
                    const suffix = i.type === 'maintenance-calc' && i.calcInputs
                        ? (isHe ? ' [חושב ממחשבון תחזוקה]' : ' [from maintenance calculator]')
                        : '';
                    return `  - ${i.label}: ${cur}${Math.round(toMonthly(i))}/mo${suffix}`;
                }).join('\n');
                return `${catLabels[cat.id] || cat.id} (${cur}${Math.round(catTotal)}/mo${scaleTag}):\n${itemLines}`;
            }).filter(Boolean).join('\n');

            const missingSection = emptyCatNames.length
                ? (isHe
                    ? `\nקטגוריות ריקות (₪0 — ייתכן שחסרות הוצאות): ${emptyCatNames.join(', ')}`
                    : `\nEmpty categories (₪0 — possibly missing expenses): ${emptyCatNames.join(', ')}`)
                : '';

            // Build a summary of future savings from expiring loan tracks (from all years, not filtered)
            const futureSavings = items.filter(i => i.type === 'loan' && i.enabled !== false)
                .flatMap(i => (i.tracks || []).filter(tr => tr.endDate && trackActive(tr) && tr.amount > 0)
                    .map(tr => {
                        const [y, m] = tr.endDate.split('-').map(Number);
                        const ml = y * 12 + (m - 1) - getNowYM();
                        return isHe
                            ? `- "${tr.label}" של "${i.label}": ${cur}${tr.amount}/חודש יסתיים בעוד ${ml} חודשים (${tr.endDate})`
                            : `- "${tr.label}" of "${i.label}": ${cur}${tr.amount}/mo ends in ${ml} months (${tr.endDate})`;
                    })
                );

            const futureSavingsSection = futureSavings.length
                ? (isHe
                    ? `\nשינויים עתידיים בהוצאות (מסלולי הלוואה שייגמרו):\n${futureSavings.join('\n')}`
                    : `\nFuture expense reductions (loan tracks ending):\n${futureSavings.join('\n')}`)
                : '';

            const perPerson = householdSize > 0 ? Math.round(totalMonthly / householdSize) : 0;

            const retirementAge = parseFloat(inputs.retirementStartAge) || 67;
            const retirementEndAge = parseFloat(inputs.retirementEndAge) || 90;
            const currentAge    = parseFloat(inputs.currentAge) || 0;
            const isPreRetirement = currentAge < retirementAge;
            const NI_PENSION_AGE = 67;
            const isRetirementBeforeNI = retirementAge < NI_PENSION_AGE;

            const systemPrompt = isHe
                ? `אתה יועץ פיננסי בכיר המתמחה בתכנון פרישה בישראל. נתח את תקציב ההוצאות החודשי. המשתמש הזין ${householdSize} נפש/ות. הוצאה לנפש: ${cur}${perPerson.toLocaleString()}/חודש.

**מבנה התשובה הנדרש (עד 400 מילה):**

⚠️ התראות לפי נפשות:
עבור כל קטגוריה המסומנת [משתנה לפי נפשות] — בדוק אם הסכום לנפש הגיוני. ציין במפורש: גבוה מדי / נמוך מדי / סביר, עם הסבר קצר. עבור קטגוריות [קבועות] — בדוק אם הסכום הכולל הגיוני ללא תלות בנפשות.

➕ הוצאות חסרות:
סקור את הקטגוריות הריקות שצוינו. ציין אילו מהן כנראה חסרות הוצאות אמיתיות (לפי גיל פרישה ומשפחה ישראלית), ואת ההוצאה הצפויה הממוצעת. גם הצע הוצאות שאינן ברשימה כלל אך חשובות לגיל זה.
${isPreRetirement ? `
🔮 שינויים בהוצאות בפרישה:
התקציב הנוכחי הוא לפני גיל פרישה (${retirementAge}). המשתמש מתכוון להפסיק לעבוד בגיל ${retirementAge} ולחיות מחסכונות עד גיל ${retirementEndAge}.
${isRetirementBeforeNI ? `
⚠️ שים לב: גיל הפרישה (${retirementAge}) הוא לפני גיל הזכאות לפנסיה/ביטוח לאומי (67). לכן יש להבחין בין שתי תקופות:

תקופה א' — מגיל ${retirementAge} עד גיל 67 (לפני גמלאות):
המשתמש מוגדר כ"מי שאינו עובד שכיר ואינו עובד עצמאי". בתקופה זו משלמים דמי ביטוח לאומי ודמי ביטוח בריאות כ"מי שאינו עובד" — לפי שיעורים מינימליים על בסיס 25% מהשכר הממוצע במשק (כ-₪185–220/חודש נכון ל-2024, כולל ביטוח בריאות). אין "דמי בריאות לגמלאי" בתקופה זו. יש לציין את הסכום הנכון לתקופה זו בלבד.

תקופה ב' — מגיל 67 ואילך (גמלאי):
מגיל 67 חלים כללים שונים לביטוח לאומי — הזכאות לגמלת הזקנה מתחילה ודמי הביטוח הלאומי עשויים לרדת או להשתנות בהתאם להכנסה מפנסיה.
` : ''}
חלק לשני תתי-סעיפים:

א) הוצאות חדשות שיתווספו בתקופת הפרישה${isRetirementBeforeNI ? ` (גיל ${retirementAge}–67)` : ''}: ${isRetirementBeforeNI ? 'דמי ביטוח לאומי ובריאות כ"מי שאינו עובד" (לא דמי בריאות לגמלאי),' : 'ביטוח לאומי (דמי בריאות לגמלאי),'} שינוי בביטוח רפואי פרטי, תרופות וטיפולים רפואיים נוספים, פנאי ונסיעות גדולות יותר, עזרה בבית, ועוד — עם סכום חודשי משוער.

ב) הוצאות קיימות שיגדלו: בפרישה נמצאים יותר זמן בבית ולא עובדים, לכן בדוק מהקטגוריות הקיימות מה צפוי לגדול — למשל צריכת מזון (יותר ארוחות בבית), חשמל וגז (יותר שעות בבית), תקשורת ובידור, ועוד. ציין את אחוז הגידול הצפוי לכל סעיף ואת התוספת החודשית המשוערת.

בסוף תשובתך (אחרי הסיכום) הוסף בלוק JSON בפורמט המדויק הזה ואל תשנה את המבנה. categoryId חייב להיות אחד מ: housing, food, health, transport, entertainment, personal, family, misc. itemLabel חייב להיות זהה לשם הפריט בתקציב שהוזן. ${isRetirementBeforeNI ? 'השתמש בסכום המתאים לתקופה לפני גיל 67 (דמי ביטוח לאומי כ"מי שאינו עובד"), לא לגמלאי.' : ''}

---RETIREMENT_JSON_START---
{"additions":[{"categoryId":"health","label":"ביטוח לאומי ובריאות (לא עובד)","monthlyAmount":210,"note":"דמי ביטוח לאומי ובריאות כמי שאינו עובד, לפני גיל 67"}],"increases":[{"categoryId":"food","itemLabel":"קניות וסופר","increaseAmount":500,"increasePercent":20,"note":"יותר ארוחות בבית"}]}
---RETIREMENT_JSON_END---` : ''}

📊 סיכום:
פער מהיעד ומה אפשר לייעל.`
                : `You are a senior financial advisor specializing in retirement planning. The user has ${householdSize} person${householdSize !== 1 ? 's' : ''} in the household. Per-person spending: ${cur}${perPerson.toLocaleString()}/mo.

**Required response structure (under 400 words):**

⚠️ Per-person anomalies:
For each category tagged [scales with people] — check if the per-person amount is reasonable. State explicitly: too high / too low / reasonable, with a brief reason. For [fixed] categories — check if the total amount makes sense regardless of household size.

➕ Missing expenses:
Review the empty categories listed. State which ones likely have real expenses missing (for a retired household), with expected typical amounts. Also suggest important expenses not in the list at all for this life stage.
${isPreRetirement ? `
🔮 Retirement budget changes:
This budget is pre-retirement (retirement age: ${retirementAge}). The user plans to stop working at age ${retirementAge} and live off savings until age ${retirementEndAge}.
${isRetirementBeforeNI ? `
⚠️ Important: retirement age (${retirementAge}) is before the NI pension eligibility age (67). Distinguish between two periods:

Period 1 — age ${retirementAge} to 67 (pre-pension):
The user is classified as a "non-employed, non-self-employed person". They pay National Insurance and health insurance as a "non-worker" at minimum rates based on 25% of the average wage (approx. ₪185–220/month in 2024, inclusive of health insurance). Do NOT suggest "pensioner health contributions" for this period. Use the correct non-worker rate.

Period 2 — age 67+ (pensioner):
From age 67, different NI rules apply — pension-age entitlements begin and NI contributions may decrease or change based on pension income.
` : ''}
Split into two sub-sections:

a) New expenses added during retirement${isRetirementBeforeNI ? ` (age ${retirementAge}–67)` : ''}: ${isRetirementBeforeNI ? 'NI and health insurance as a non-worker (NOT pensioner rates),' : 'national insurance (pensioner health contributions),'} changes in private medical insurance, additional medications and treatments, more leisure and travel, home help, etc. — with estimated monthly amounts.

b) Existing expenses that will increase: being home all day instead of working means certain costs rise — check the existing categories and flag which ones will grow, e.g. food (more meals at home), electricity and gas (more hours at home), communication and entertainment, etc. Estimate the percentage increase and additional monthly cost for each.

At the end of your response (after the summary) include a JSON block in exactly this format. categoryId must be one of: housing, food, health, transport, entertainment, personal, family, misc. itemLabel must match the budget item name exactly as entered. ${isRetirementBeforeNI ? 'Use the amount applicable to a non-worker before age 67, not the pensioner rate.' : ''}

---RETIREMENT_JSON_START---
{"additions":[{"categoryId":"health","label":"NI & Health (non-worker)","monthlyAmount":210,"note":"NI and health insurance as non-worker, before age 67"}],"increases":[{"categoryId":"food","itemLabel":"קניות וסופר","increaseAmount":500,"increasePercent":20,"note":"more meals at home"}]}
---RETIREMENT_JSON_END---` : ''}

📊 Summary:
Gap vs target and what can be optimized.`;

            const householdLine = isHe
                ? `נפשות בבית: ${householdSize} | הוצאה לנפש: ${cur}${perPerson.toLocaleString()}/חודש`
                : `Household: ${householdSize} person${householdSize !== 1 ? 's' : ''} | Per-person: ${cur}${perPerson.toLocaleString()}/mo`;
            const ageContext = currentAge > 0
                ? (isHe
                    ? `\nגיל נוכחי: ${currentAge} | גיל פרישה: ${retirementAge} | גיל סיום תכנון: ${retirementEndAge}${isRetirementBeforeNI ? ` | גיל ביטוח לאומי/פנסיה: 67 (${Math.round(NI_PENSION_AGE - retirementAge)} שנים לאחר הפרישה)` : ''}${isPreRetirement ? ` | שנים לפרישה: ${Math.round(retirementAge - currentAge)}` : ' | כבר בפרישה'}`
                    : `\nCurrent age: ${currentAge} | Retirement age: ${retirementAge} | Planning end age: ${retirementEndAge}${isRetirementBeforeNI ? ` | NI/pension age: 67 (${Math.round(NI_PENSION_AGE - retirementAge)} years after retirement)` : ''}${isPreRetirement ? ` | Years to retirement: ${Math.round(retirementAge - currentAge)}` : ' | Already retired'}`)
                : '';

            // Retirement portfolio context from calculator results
            const balAtRet  = results?.balanceAtRetirement ?? null;
            const balAtEnd  = results?.balanceAtEnd ?? null;
            const netWd     = results?.initialNetWithdrawal ?? null;
            const reqCap    = results?.requiredCapitalAtRetirement ?? null;
            const surplusAmt = results?.surplus ?? null;
            const ranOut    = results?.ranOutAtAge ?? null;
            const wdRate    = (balAtRet && netWd) ? (netWd * 12) / balAtRet : null;

            const calcContext = isHe
                ? (() => {
                    const lines2 = [];
                    if (balAtRet != null) lines2.push(`יתרה צבורה בגיל פרישה: ${cur}${Math.round(balAtRet).toLocaleString()}`);
                    if (reqCap  != null) lines2.push(`הון נדרש לפרישה: ${cur}${Math.round(reqCap).toLocaleString()}`);
                    if (surplusAmt != null) lines2.push(`עודף / גירעון: ${surplusAmt >= 0 ? '+' : ''}${cur}${Math.round(surplusAmt).toLocaleString()}`);
                    if (wdRate   != null) lines2.push(`אחוז משיכה מהתיק: ${(wdRate * 100).toFixed(1)}% לשנה`);
                    if (balAtEnd != null) lines2.push(`יתרה בסוף תקופת הפרישה: ${cur}${Math.round(balAtEnd).toLocaleString()}`);
                    if (ranOut   != null) lines2.push(`⚠️ הכסף נגמר בגיל: ${ranOut.toFixed(1)}`);
                    return lines2.length ? `\nנתוני חישוב פרישה:\n${lines2.join('\n')}` : '';
                })()
                : (() => {
                    const lines2 = [];
                    if (balAtRet != null) lines2.push(`Portfolio at retirement: ${cur}${Math.round(balAtRet).toLocaleString()}`);
                    if (reqCap  != null) lines2.push(`Required capital: ${cur}${Math.round(reqCap).toLocaleString()}`);
                    if (surplusAmt != null) lines2.push(`Surplus / deficit: ${surplusAmt >= 0 ? '+' : ''}${cur}${Math.round(surplusAmt).toLocaleString()}`);
                    if (wdRate   != null) lines2.push(`Withdrawal rate: ${(wdRate * 100).toFixed(1)}%/yr`);
                    if (balAtEnd != null) lines2.push(`Balance at end of retirement: ${cur}${Math.round(balAtEnd).toLocaleString()}`);
                    if (ranOut   != null) lines2.push(`⚠️ Funds run out at age: ${ranOut.toFixed(1)}`);
                    return lines2.length ? `\nRetirement calculation data:\n${lines2.join('\n')}` : '';
                })();

            const userMsg = isHe
                ? `${householdLine}${ageContext}${calcContext}\nיעד הכנסה חודשית: ${cur}${Math.round(target)}\nסה"כ הוצאות: ${cur}${Math.round(totalMonthly)}\nפער: ${cur}${Math.round(target - totalMonthly)}\n\nפירוט:\n${lines || 'אין הוצאות מוזנות'}${missingSection}${futureSavingsSection}`
                : `${householdLine}${ageContext}${calcContext}\nMonthly income target: ${cur}${Math.round(target)}\nTotal expenses: ${cur}${Math.round(totalMonthly)}\nGap: ${cur}${Math.round(target - totalMonthly)}\n\nBreakdown:\n${lines || 'No expenses entered'}${missingSection}${futureSavingsSection}`;

            const reply = await getChatResponse(
                [{ role: 'user', content: userMsg }],
                systemPrompt,
                aiProvider, aiModel, apiKeyOverride
            );
            aiInsightRef.current = reply;
            setAiInsight(reply);
            setAiInsightStale(false);
            if (uid) setBudgetAiInsight(uid, reply).catch(err => console.error('[Budget AI insight save error]', err));
        } catch (err) {
            if (err.name !== 'AbortError') setAiError(err.message || 'Error');
        } finally {
            setAiLoading(false);
        }
    }, [aiProvider, aiModel, apiKeyOverride, items, displayItems, target, totalMonthly, householdSize, isHe, uid, selectedYear]);

    const pct = target > 0 ? Math.min(totalMonthly / target, 1.5) : 0;
    const projectedPct = target > 0 ? Math.min(totalProjectedMonthly / target, 1.5) : 0;
    const gap = target - totalMonthly;
    const statusColor = pct > 1 ? 'text-red-500' : pct > 0.9 ? 'text-amber-500' : 'text-emerald-500';
    const barColor   = pct > 1 ? 'bg-red-500'   : pct > 0.9 ? 'bg-amber-500'   : 'bg-emerald-500';
    const pctColor   = pct > 0.9 ? 'text-red-500' : pct > 0.8 ? 'text-amber-400' : 'text-emerald-500';

    return (
        <>
        <div className="space-y-3" dir={isHe ? 'rtl' : 'ltr'}>

            {/* ── Retirement mode banner ── */}
            {showRetirementMode && retirementAdj && (() => {
                const totalDelta = (retirementAdj.additions || []).reduce((s, a) => s + (a.monthlyAmount || 0), 0)
                    + (retirementAdj.increases || []).reduce((s, inc) => s + (inc.increaseAmount || 0), 0);
                return (
                    <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-medium border mb-1 ${isLight ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-amber-500/10 border-amber-500/40 text-amber-300'}`} dir={isHe ? 'rtl' : 'ltr'}>
                        <span className="flex items-center gap-1.5">
                            <span>🔮</span>
                            <span>{isHe ? 'תצוגת תקציב פרישה' : 'Retirement budget view'}</span>
                        </span>
                        <span dir="ltr" className="font-bold">
                            {isHe ? 'תוספת צפויה:' : 'Expected addition:'} +{currency}{Math.round(totalDelta).toLocaleString()}{isHe ? '/חודש' : '/mo'}
                        </span>
                    </div>
                );
            })()}

            {/* ── Summary banner — sticky ── */}
            <div className={`sticky top-0 z-20 rounded-xl p-3 border backdrop-blur-md ${isLight ? 'bg-white border-slate-200' : 'bg-white/10 border-white/20'}`}>
                {/* Year navigation — integrated into summary header */}
                <div className={`flex items-center pt-1 pb-3 mb-2 border-b ${isLight ? 'border-slate-100' : 'border-white/10'}`} dir="ltr">
                    {/* Left arrow: decrease in LTR, increase in Hebrew — wraps around */}
                    <button
                        onClick={() => setSelectedYear(y => isHe
                            ? (y >= retirementEndYear ? currentYear : y + 1)
                            : (y <= currentYear ? retirementEndYear : y - 1))}
                        className={`w-7 h-7 flex items-center justify-center shrink-0 rounded transition-colors focus:outline-none focus:ring-0 ${isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}
                    >
                        <ChevronDown size={14} className="rotate-90" />
                    </button>
                    {/* Center: year + copy dropdown icon */}
                    <div className={`flex-1 flex items-center justify-center gap-2 ${isHe ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className="flex items-center justify-center gap-1.5" dir={isHe ? 'rtl' : 'ltr'}>
                            <span className={`text-xl font-bold leading-none tabular-nums ${selectedYear === currentYear ? (isLight ? 'text-slate-700' : 'text-gray-200') : (isLight ? 'text-indigo-700' : 'text-indigo-300')}`}>
                                {selectedYear}
                            </span>
                            {(() => {
                                const st = copiedStateByYear[selectedYear];
                                const hasEdits = Object.keys(yearAmounts[selectedYear] || {}).length > 0;
                                if (st && JSON.stringify(yearAmounts[selectedYear] || {}) === st.amountsStr) {
                                    return (
                                        <span className={`text-[10px] px-1.5 rounded-full border leading-none tracking-wide py-0.5 ${isLight ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50'}`}>
                                            {isHe ? `העתק מ-${st.sourceYear}` : `Copied from ${st.sourceYear}`}
                                        </span>
                                    );
                                } else if (selectedYear !== currentYear && !hasEdits) {
                                    return (
                                        <span className={`text-[10px] px-1.5 rounded-full border leading-none tracking-wide py-0.5 ${isLight ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50'}`}>
                                            {isHe ? 'העתק משנה נוכחית' : 'Copied from current year'}
                                        </span>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        {selectedYear === currentYear ? (
                            <span className={`text-[10px] leading-none ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {isHe ? 'שנה נוכחית' : 'current year'}
                            </span>
                        ) : (
                            <div className="relative" ref={copyDropdownRef}>
                                <button
                                    onClick={() => setCopyDropdownOpen(o => !o)}
                                    title={isHe ? 'העתק מ...' : 'Copy from year...'}
                                    className={`w-7 h-7 flex items-center justify-center shrink-0 rounded transition-colors focus:outline-none focus:ring-0 ${isLight ? 'text-indigo-500 hover:bg-indigo-50' : 'text-indigo-400 hover:bg-indigo-900/20'} ${copyDropdownOpen ? (isLight ? 'bg-indigo-50' : 'bg-indigo-900/20') : ''}`}
                                >
                                    <Copy size={12} />
                                </button>
                                {copyDropdownOpen && (
                                    <div className={`absolute top-full mt-1 z-50 rounded-lg shadow-lg border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-white/20'}`}
                                        style={{ [isHe ? 'right' : 'left']: 0, minWidth: '7rem' }}
                                    >
                                        <div className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wide border-b ${isLight ? 'text-slate-400 border-slate-100' : 'text-gray-500 border-white/10'}`}>
                                            {isHe ? 'העתק מ-' : 'Copy from'}
                                        </div>
                                        <div className="max-h-40 overflow-y-auto custom-scrollbar scrollbar-right">
                                            {Array.from({ length: retirementEndYear - currentYear + 1 }, (_, i) => currentYear + i)
                                                .filter(y => y !== selectedYear)
                                                .map(y => (
                                                    <button
                                                        key={y}
                                                        onClick={() => {
                                                            pushHistoryNow();
                                                            const srcAmounts = yearAmountsRef.current[y] || {};
                                                            const newAmountsForSelectedYear = { ...(yearAmountsRef.current[selectedYear] || {}), ...srcAmounts };
                                                            setYearAmounts(prev => ({
                                                                ...prev,
                                                                [selectedYear]: newAmountsForSelectedYear
                                                            }));
                                                            setCopiedStateByYear(prev => ({
                                                                ...prev,
                                                                [selectedYear]: { sourceYear: y, amountsStr: JSON.stringify(newAmountsForSelectedYear) }
                                                            }));
                                                            setCopyDropdownOpen(false);
                                                        }}
                                                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${isLight ? 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700' : 'text-gray-300 hover:bg-indigo-900/30 hover:text-indigo-300'}`}
                                                    >
                                                        {y}{y === currentYear ? (isHe ? ' (נוכחית)' : ' (current)') : ''}
                                                    </button>
                                                ))
                                            }
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Right arrow: increase in LTR, decrease in Hebrew — wraps around */}
                    <button
                        onClick={() => setSelectedYear(y => isHe
                            ? (y <= currentYear ? retirementEndYear : y - 1)
                            : (y >= retirementEndYear ? currentYear : y + 1))}
                        className={`w-7 h-7 flex items-center justify-center shrink-0 rounded transition-colors focus:outline-none focus:ring-0 ${isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}
                    >
                        <ChevronDown size={14} className="-rotate-90" />
                    </button>
                </div>
                <div className="flex items-end justify-between mb-2 gap-4">
                    <div className="text-right">
                        <div className={`text-sm font-medium mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetIncomeTarget')}
                        </div>
                        <div className={`text-lg font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                            {currency}{target.toLocaleString()}
                        </div>
                        <div className={`text-xs mt-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                            {currency}{(target * 12).toLocaleString()} {isHe ? '/ שנה' : '/ yr'}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className={`text-sm font-medium mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetTotalExpenses')}
                        </div>
                        <div className="flex items-baseline justify-end gap-2" dir="ltr">
                            {pausedMonthly > 0 && (
                                <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                    (+{currency}{Math.round(pausedMonthly).toLocaleString()})
                                </span>
                            )}
                            <span className={`text-lg font-semibold ${statusColor}`}>
                                {currency}{Math.round(totalMonthly).toLocaleString()}
                            </span>
                            {showInflation && (
                                <span className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {currency}{Math.round(totalProjectedMonthly).toLocaleString()}
                                </span>
                            )}
                        </div>
                        <div className="flex items-baseline justify-end gap-1.5 mt-0.5" dir="ltr">
                            <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {currency}{Math.round(totalMonthly * 12).toLocaleString()} {isHe ? '/ שנה' : '/ yr'}
                            </span>
                            {showInflation && (
                                <span className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {currency}{Math.round(totalProjectedMonthly * 12).toLocaleString()}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className={`text-sm font-medium mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetGap')}
                        </div>
                        <div className="flex items-baseline justify-end gap-2" dir="ltr">
                            <span className={`text-lg font-semibold ${gap >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {gap >= 0 ? '+' : ''}{currency}{Math.round(gap).toLocaleString()}
                            </span>
                            {showInflation && (
                                <span className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {(() => { const pg = target - Math.round(totalProjectedMonthly); return `${pg >= 0 ? '+' : ''}${currency}${Math.abs(pg).toLocaleString()}`; })()}
                                </span>
                            )}
                        </div>
                        <div className="flex items-baseline justify-end gap-1.5 mt-0.5" dir="ltr">
                            <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {currency}{Math.round(Math.abs(gap * 12)).toLocaleString()}{gap >= 0 ? '+' : '-'} {isHe ? '/ שנה' : '/ yr'}
                            </span>
                            {showInflation && (() => { const pg = target - Math.round(totalProjectedMonthly); return (
                                <span className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {currency}{Math.round(Math.abs(pg * 12)).toLocaleString()}{pg >= 0 ? '+' : '-'}
                                </span>
                            ); })()}
                        </div>
                    </div>
                </div>
                {/* Household size + inflation controls */}
                <div className={`flex items-center gap-3 mb-2 text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    <span>👥</span>
                    <span>{isHe ? 'נפשות:' : 'Household:'}</span>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setHouseholdSize(s => Math.max(1, s - 1))} className={`w-5 h-5 rounded flex items-center justify-center font-bold transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}>−</button>
                        <span className={`w-5 text-center font-semibold ${isLight ? 'text-slate-700' : 'text-white'}`}>{householdSize}</span>
                        <button onClick={() => setHouseholdSize(s => Math.min(10, s + 1))} className={`w-5 h-5 rounded flex items-center justify-center font-bold transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}>+</button>
                    </div>
                    <div className="flex-1" />
                    {/* Inflation projection controls — always visible, no layout shift */}
                    <button
                        onClick={() => setShowInflation(v => !v)}
                        className="shrink-0 p-0.5 transition-colors"
                        title={isHe ? (showInflation ? 'הסתר הקרנת אינפלציה' : 'הצג הקרנת אינפלציה') : (showInflation ? 'Hide inflation projection' : 'Show inflation projection')}
                    >
                        {showInflation
                            ? <ToggleRight size={18} className="text-blue-500" />
                            : <ToggleLeft size={18} className={isLight ? 'text-slate-400' : 'text-gray-400'} />}
                    </button>
                    <span className={`shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>📈 {isHe ? 'אינפלציה' : 'Inflation'} {(inflationRate * 100).toFixed(1)}%</span>
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setProjYears(y => Math.max(1, y - 1))} className={`w-5 h-5 rounded flex items-center justify-center font-bold transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}>−</button>
                        <span className={`w-7 text-center font-semibold tabular-nums ${isLight ? 'text-slate-700' : 'text-white'}`}>{projYears}{isHe ? 'ש' : 'y'}</span>
                        <button onClick={() => setProjYears(y => Math.min(30, y + 1))} className={`w-5 h-5 rounded flex items-center justify-center font-bold transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}>+</button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className={`flex-1 h-2 rounded-full overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-white/10'}`}>
                        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                    </div>
                    {target > 0 && (
                        <div className="flex items-center gap-1.5 shrink-0" dir="ltr">
                            <span className={`text-xs font-medium ${pctColor}`}>
                                {Math.round(pct * 100)}% {t('budgetOfTarget')}
                            </span>
                            {showInflation && (
                                <span className={`text-xs font-medium ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {Math.round(projectedPct * 100)}%
                                </span>
                            )}
                        </div>
                    )}
                </div>

            </div>

            {/* ── Search + Stats ── */}
            <div className="flex items-center gap-2">
                <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-white/10 border-white/20'}`}>
                    <Search size={13} className={isLight ? 'text-slate-400 shrink-0' : 'text-gray-500 shrink-0'} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={isHe ? 'חפש פריט… (למשל: סיעוד, ביטוח)' : 'Search item… (e.g. insurance, mortgage)'}
                        className={`flex-1 bg-transparent text-xs outline-none placeholder:text-gray-400 ${isLight ? 'text-slate-800' : 'text-white'}`}
                        dir={isHe ? 'rtl' : 'ltr'}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className={isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}>
                            <X size={13} />
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0" dir="ltr">
                    <button
                        onClick={handleUndo}
                        disabled={!canUndo}
                        title={isHe ? 'בטל' : 'Undo'}
                        className={`p-2 rounded-xl border transition-colors disabled:opacity-30 ${isLight ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-white/10 border-white/20 text-gray-400 hover:bg-white/20'}`}
                    >
                        <Undo2 size={14} />
                    </button>
                    <button
                        onClick={handleRedo}
                        disabled={!canRedo}
                        title={isHe ? 'חזור' : 'Redo'}
                        className={`p-2 rounded-xl border transition-colors disabled:opacity-30 ${isLight ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-white/10 border-white/20 text-gray-400 hover:bg-white/20'}`}
                    >
                        <Redo2 size={14} />
                    </button>
                </div>
                <button
                    onClick={() => setShowStats(true)}
                    title={isHe ? 'סטטיסטיקות' : 'Statistics'}
                    className={`shrink-0 p-2 rounded-xl border transition-colors ${isLight ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100 hover:border-blue-300' : 'bg-blue-500/20 border-blue-500/40 text-blue-400 hover:bg-blue-500/30'}`}
                >
                    <BarChart3 size={14} />
                </button>
                <button
                    onClick={() => setShowFixedVar(true)}
                    title={isHe ? 'קבוע מול משתנה' : 'Fixed vs Variable'}
                    className={`shrink-0 p-2 rounded-xl border transition-colors ${isLight ? 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100 hover:border-orange-300' : 'bg-orange-500/20 border-orange-500/40 text-orange-400 hover:bg-orange-500/30'}`}
                >
                    <Lock size={14} />
                </button>
                {retirementAdj && (
                    <button
                        onClick={() => setShowRetirementMode(v => !v)}
                        title={isHe ? 'תצוגת תקציב פרישה' : 'Retirement budget view'}
                        className={`shrink-0 px-2 py-1.5 rounded-xl border text-xs font-medium transition-colors ${showRetirementMode
                            ? (isLight ? 'bg-amber-100 border-amber-400 text-amber-700' : 'bg-amber-500/20 border-amber-400 text-amber-300')
                            : (isLight ? 'bg-slate-50 border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-600' : 'bg-white/5 border-white/20 text-gray-500 hover:border-amber-400 hover:text-amber-400')}`}
                    >
                        🔮
                    </button>
                )}
            </div>

            {/* ── Search results ── */}
            {searchResults && (
                <div className={`rounded-xl border ${isLight ? 'border-slate-200 bg-white' : 'border-white/20 bg-white/10'}`}>
                    <div className={`px-3 py-2 text-xs font-medium border-b ${isLight ? 'text-slate-500 border-slate-100' : 'text-gray-400 border-white/10'}`} dir={isHe ? 'rtl' : 'ltr'}>
                        {searchResults.length > 0
                            ? (isHe ? `${searchResults.length} תוצאות` : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`)
                            : (isHe ? 'אין תוצאות' : 'No results')}
                    </div>
                    {searchResults.map(item => {
                        const cat = visibleCategories.find(c => c.id === item.categoryId);
                        const monthly = toMonthly(item);
                        return (
                            <div key={item.id} className={`flex items-center gap-2 px-3 py-2 border-b last:border-0 text-sm ${item.enabled !== false ? '' : 'opacity-40'} ${isLight ? 'border-slate-100' : 'border-white/5'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                <span className="text-base shrink-0">{cat?.icon ?? '📋'}</span>
                                <div className="flex-1 min-w-0">
                                    <div className={`font-medium truncate ${isLight ? 'text-slate-800' : 'text-white'}`}>{item.label}</div>
                                    <div className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? (cat?.labelHe ?? item.categoryId) : (cat?.labelEn ?? item.categoryId)}</div>
                                </div>
                                {monthly > 0 && (
                                    <span className={`text-xs font-semibold shrink-0 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                        {currency}{Math.round(monthly).toLocaleString()}/{isHe ? 'חודש' : 'mo'}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Categories ── */}
            {visibleCategories.map(cat => {
                const catItems = displayItems.filter(i => i.categoryId === cat.id);
                if (catItems.length === 0 && !CATEGORIES.find(c => c.id === cat.id)) return null;
                return (
                    <CategorySection
                        key={cat.id}
                        category={cat}
                        items={catItems}
                        isHe={isHe}
                        isLight={isLight}
                        currency={currency}
                        t={t}
                        open={openCategoryId === cat.id}
                        onToggle={() => setOpenCategoryId(prev => prev === cat.id ? null : cat.id)}
                        onChangeItem={handleChangeItem}
                        onDeleteItem={handleDeleteItem}
                        onToggleItemEnabled={handleToggleItemEnabled}
                        onAddItem={() => handleAddItem(cat.id)}
                        onAddLoanItem={() => handleAddLoanItem(cat.id)}
                        onAddMaintenanceItem={() => handleAddMaintenanceItem(cat.id)}
                        onToggleAll={() => handleToggleCategoryItems(cat.id)}
                        projFactor={projFactor}
                        projYears={projYears}
                        showInflation={showInflation}
                        totalMonthly={totalMonthly}
                        householdSize={householdSize}
                        aiProvider={aiProvider}
                        aiModel={aiModel}
                        apiKeyOverride={apiKeyOverride}
                        retirementOverlay={showRetirementMode ? retirementAdj : null}
                        currentAge={parseFloat(inputs.currentAge) || 30}
                        retirementEndAge={parseFloat(inputs.retirementEndAge) || 90}
                    />
                );
            })}

            {/* ── Restore panel ── */}
            {showRestore && (
                <div className={`rounded-xl border p-3 space-y-2 ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/20 border-amber-500/30'}`}>
                    <div className={`text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'text-amber-800' : 'text-amber-300'}`}>
                        <History size={13} />
                        {isHe ? 'שחזור מגיבוי' : 'Restore from backup'}
                    </div>
                    {backups.length === 0 ? (
                        <p className={`text-xs ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{isHe ? 'אין גיבויים זמינים' : 'No backups available'}</p>
                    ) : backups.map((bk, i) => (
                        <div key={i} className={`flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg ${isLight ? 'bg-white border border-amber-100' : 'bg-white/5 border border-white/10'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                                <Clock size={11} className={isLight ? 'text-amber-500 shrink-0' : 'text-amber-400 shrink-0'} />
                                <div>
                                    <div className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{backupAge(bk.savedAt, isHe)}</div>
                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {isHe ? `סה"כ ${currency}${Math.round(bk.totalMonthly).toLocaleString()}/חודש` : `Total ${currency}${Math.round(bk.totalMonthly).toLocaleString()}/mo`}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRestore(bk)}
                                className={`shrink-0 px-2 py-1 rounded text-[10px] font-bold transition-colors ${isLight ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-amber-500 text-white hover:bg-amber-400'}`}
                            >
                                {isHe ? 'שחזר' : 'Restore'}
                            </button>
                        </div>
                    ))}
                    <button onClick={() => setShowRestore(false)} className={`text-[10px] ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}>
                        {isHe ? 'סגור' : 'Close'}
                    </button>
                </div>
            )}

            {/* ── Inline confirmation banner ── */}
            {pendingConfirm && (
                <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/20 border-red-500/30'}`}>
                    <span className={`text-xs font-medium ${isLight ? 'text-red-800' : 'text-red-300'}`}>
                        {pendingConfirm.type === 'reset'
                            ? (isHe ? 'לאפס את כל הנתונים?' : 'Reset all budget data?')
                            : (isHe ? `לשחזר גיבוי מ-${backupAge(pendingConfirm.backup.savedAt, isHe)}?` : `Restore backup from ${backupAge(pendingConfirm.backup.savedAt, isHe)}?`)}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => setPendingConfirm(null)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${isLight ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-white/10 border border-white/20 text-gray-300 hover:bg-white/20'}`}
                        >
                            {isHe ? 'ביטול' : 'Cancel'}
                        </button>
                        <button
                            onClick={handleConfirmAction}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                            {isHe ? 'כן, המשך' : 'Yes, proceed'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Bottom actions — Reset pinned to left, rest on right ── */}
            <div className="flex items-center justify-between gap-2 pt-1" dir="ltr">
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={handleReset}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${isLight ? 'border-slate-200 text-slate-500 hover:bg-slate-50' : 'border-white/20 text-gray-400 hover:bg-white/10'}`}
                    >
                        <RotateCcw size={13} />
                        {t('budgetReset')}
                    </button>
                    <button
                        onClick={() => setShowRestore(v => !v)}
                        title={isHe ? 'שחזור מגיבוי' : 'Restore from backup'}
                        className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${showRestore ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500/50 bg-amber-900/20 text-amber-400') : (isLight ? 'border-slate-200 text-slate-400 hover:bg-slate-50' : 'border-white/20 text-gray-500 hover:bg-white/10')}`}
                    >
                        <History size={13} />
                    </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end" dir={isHe ? 'rtl' : 'ltr'}>
                    <button
                        onClick={handleAddCategory}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-white/20 text-gray-400 hover:bg-white/10'}`}
                    >
                        <Plus size={13} />
                        {t('budgetAddCategory')}
                    </button>
                    <button
                        onClick={handleAdoptAsTarget}
                        disabled={totalMonthly === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Target size={13} />
                        {t('budgetAdoptTarget')}
                    </button>
                    {aiProvider && aiModel && (
                        <button
                            onClick={handleAiInsight}
                            disabled={aiLoading || totalMonthly === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <BrainCircuit size={13} />}
                            {isHe ? 'תובנות AI' : 'AI Insights'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── AI Insight modal ── */}
            {aiModalOpen && (
                <div
                    className={`fixed z-[9999] w-[480px] rounded-2xl shadow-2xl border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                    style={{ top: 72, right: 16, ...aiDragStyle }}
                >
                    {/* Header — draggable */}
                    <div
                        className={`flex items-center justify-between px-4 py-3 border-b cursor-grab active:cursor-grabbing select-none ${isLight ? 'border-slate-100' : 'border-white/10'}`}
                        onMouseDown={onAiDragMouseDown}
                    >
                        <div className="flex items-center gap-2">
                            <BrainCircuit size={15} className="text-purple-400" />
                            <span className={`font-semibold text-sm ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                {isHe ? 'תובנות AI על התקציב' : 'AI Budget Insights'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {aiInsightStale && !aiLoading && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isLight ? 'bg-amber-100 text-amber-600' : 'bg-amber-500/20 text-amber-400'}`}>
                                    {isHe ? 'לא עדכני' : 'stale'}
                                </span>
                            )}
                            {aiInsight && !aiLoading && (
                                <button
                                    onClick={() => { aiInsightRef.current = null; setAiInsight(null); setAiInsightStale(false); handleAiInsight(); }}
                                    title={isHe ? 'רענן ניתוח' : 'Refresh analysis'}
                                    className={`p-1 rounded transition-colors ${isLight ? 'text-purple-400 hover:text-purple-700 hover:bg-purple-100' : 'text-purple-500 hover:text-purple-300 hover:bg-purple-500/20'}`}
                                >
                                    <RotateCcw size={13} />
                                </button>
                            )}
                            <button
                                onClick={() => setAiModalOpen(false)}
                                className={`text-lg leading-none opacity-40 hover:opacity-80 transition-opacity ${isLight ? 'text-slate-600' : 'text-gray-300'}`}
                            >✕</button>
                        </div>
                    </div>
                    {/* Body */}
                    <div className="px-4 py-4 max-h-[80vh] overflow-y-auto custom-scrollbar scrollbar-right" dir={isHe ? 'rtl' : 'ltr'}>
                        {aiLoading && (
                            <div className={`flex items-center gap-2 text-sm mb-3 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                <Loader2 size={15} className="animate-spin text-purple-400" />
                                {isHe ? 'מעדכן ניתוח...' : 'Updating analysis...'}
                            </div>
                        )}
                        {aiError && !aiLoading && (
                            <p className="text-sm text-red-500">{aiError}</p>
                        )}
                        {insightText && (
                            <InsightRenderer text={insightText} isLight={isLight} />
                        )}
                        {!aiLoading && !aiError && !aiInsight && (
                            <p className={`text-sm ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {isHe ? 'לחץ על הכפתור למעלה להפעלת הניתוח' : 'Click the button above to generate analysis'}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>

        <BudgetStatsModal
            isOpen={showStats}
            onClose={() => setShowStats(false)}
            items={items}
            inputs={inputs}
            results={results}
            inflationRate={inflationRate}
            showInflation={showInflation}
            isLight={isLight}
            isHe={isHe}
            currency={currency}
            t={t}
            sliderConsumed={sliderConsumed}
            setSliderConsumed={setSliderConsumed}
            retirementAdj={retirementAdj}
            showRetirementMode={showRetirementMode}
            setShowRetirementMode={setShowRetirementMode}
        />
        <FixedVarModal
            isOpen={showFixedVar}
            onClose={() => setShowFixedVar(false)}
            items={items}
            isHe={isHe}
            isLight={isLight}
            currency={currency}
            monthlyIncome={parseFloat(inputs?.monthlyNetIncomeDesired) || 0}
            maxYear={retirementEndYear}
            initialYear={selectedYear}
            aiProvider={aiProvider}
            aiModel={aiModel}
            apiKeyOverride={apiKeyOverride}
        />
        </>
    );
}
