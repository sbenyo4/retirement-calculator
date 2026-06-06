import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, X, Lock, Unlock, Globe } from 'lucide-react';
import { useDraggable } from '../../hooks/useDraggable';
import { effectiveIsFixed, trackActiveInYear, matchIncrease, retirementAdditionMonthly, retirementIncreaseMonthly } from './budgetUtils';
import { CATEGORIES } from './constants';
const CURRENT_YEAR = new Date().getFullYear();

export function FixedVarModal({
    isOpen,
    onClose,
    items,
    isHe,
    isLight,
    currency,
    maxYear,
    initialYear,
    aiProvider,
    aiModel,
    apiKeyOverride,
    LocationSuggestModal,
    results,
    inputs,
    retirementAdj,
    retirementModeByYear,
    defaultRetirementModeStartYear,
    retirementEndYear,
    getResolvedItemsForYear
}) {
    const { dragStyle, onDragMouseDown } = useDraggable(isOpen);
    const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
    const [showLocations, setShowLocations] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [isOpen]);

    useEffect(() => { if (isOpen) setSelectedYear(initialYear ?? CURRENT_YEAR); }, [isOpen, initialYear]);

    const activeIncome = useMemo(() => {
        const baseTarget = Math.round(results?.initialNetWithdrawal ?? parseFloat(inputs?.monthlyNetIncomeDesired) ?? 0);
        const override = parseFloat(inputs?.yearlyIncomeOverrides?.[selectedYear]);
        return !isNaN(override) && override > 0 ? override : baseTarget;
    }, [results, inputs, selectedYear]);

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
        
        const resolvedItems = getResolvedItemsForYear ? getResolvedItemsForYear(selectedYear) : items;

        const defaultShowRet = selectedYear >= defaultRetirementModeStartYear && selectedYear <= retirementEndYear;
        const showRetMode = retirementAdj
            ? (retirementModeByYear?.[selectedYear] ?? defaultShowRet)
            : false;

        const categoryItemsMap = {};
        CATEGORIES.forEach(cat => {
            categoryItemsMap[cat.id] = resolvedItems.filter(it => it.categoryId === cat.id && it.enabled !== false);
        });

        resolvedItems.filter(it => it.enabled !== false).forEach(it => {
            const monthly = monthlyForYear(it, selectedYear);
            if (monthly <= 0) return;
            (effectiveIsFixed(it) ? fixed : variable).push({ ...it, monthly: Math.round(monthly) });
        });

        if (showRetMode && retirementAdj) {
            const yearsSinceRetirement = Math.max(0, selectedYear - defaultRetirementModeStartYear);
            (retirementAdj.additions || []).forEach(a => {
                const monthly = retirementAdditionMonthly(a, yearsSinceRetirement);
                if (monthly <= 0) return;
                variable.push({
                    id: `ret-add-${a.label}`,
                    label: `🔮 ${a.label}`,
                    categoryId: a.categoryId,
                    monthly: Math.round(monthly)
                });
            });

            (retirementAdj.increases || []).forEach(inc => {
                const catItems = categoryItemsMap[inc.categoryId] || [];
                const matchedItems = catItems.filter(i => matchIncrease(i.label, inc.itemLabel));
                const monthly = retirementIncreaseMonthly(inc, matchedItems, yearsSinceRetirement);
                if (monthly <= 0) return;
                const matchedItem = matchedItems[0];
                if (matchedItem) {
                    const isFixed = effectiveIsFixed(matchedItem);
                    (isFixed ? fixed : variable).push({
                        id: `ret-inc-${inc.itemLabel}`,
                        label: `🔮 ${matchedItem.label} (${isHe ? 'תוספת' : 'increase'})`,
                        categoryId: inc.categoryId,
                        monthly: Math.round(monthly)
                    });
                } else {
                    variable.push({
                        id: `ret-inc-${inc.itemLabel}`,
                        label: `🔮 ${inc.itemLabel} (${isHe ? 'תוספת' : 'increase'})`,
                        categoryId: inc.categoryId,
                        monthly: Math.round(monthly)
                    });
                }
            });
        }

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
    }, [isOpen, items, selectedYear, monthlyForYear, getResolvedItemsForYear, retirementAdj, retirementModeByYear, defaultRetirementModeStartYear, retirementEndYear, isHe]);

    const [openCats, setOpenCats] = useState(() => new Set());
    useEffect(() => { if (isOpen) setOpenCats(new Set()); }, [isOpen]);
    const toggleCat = id => setOpenCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    if (!isOpen) return null;

    const total = fixedTotal + variableTotal;
    const fixedPct = total > 0 ? Math.round(fixedTotal / total * 100) : 0;
    const spare = activeIncome > 0 ? activeIncome - total : null;
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
                            <div className="flex w-full h-2.5 rounded-full overflow-hidden mb-3" dir="ltr">
                                <div className="h-full bg-orange-500 transition-all" style={{ width: `${fixedPct}%` }} />
                                <div className="h-full bg-blue-500 flex-1" />
                            </div>
                            <div className="flex items-start" dir="ltr">
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
                                <div className="flex-1 text-right">
                                    <div className="flex items-center justify-end gap-1.5 mb-1">
                                        <span className={`text-[10px] font-bold ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>{100 - fixedPct}%</span>
                                        <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'משתנה' : 'Variable'}</span>
                                        <Unlock size={11} className={isLight ? 'text-blue-500' : 'text-blue-400'} />
                                    </div>
                                    <div className="flex items-baseline justify-end gap-2">
                                        <span className={`text-xl font-bold leading-tight ${isLight ? 'text-slate-800' : 'text-white'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                            {fmt(variableTotal)}<span className={`text-[10px] font-normal ms-1 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? '/חו׳' : '/mo'}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {activeIncome > 0 && (
                                <div className={`mt-3 pt-2 border-t space-y-1.5 text-xs ${isLight ? 'border-slate-200 text-slate-500' : 'border-white/10 text-gray-400'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>{isHe ? 'יעד הכנסה' : 'Income target'}</span>
                                        <span className={`font-bold ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir="ltr">{fmt(activeIncome)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>{isHe ? 'סה"כ הוצאות' : 'Total expenses'}</span>
                                        <span className={`font-bold ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir="ltr">{fmt(total)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>{spare >= 0 ? (isHe ? 'עודף' : 'Surplus') : (isHe ? 'פער' : 'Gap')}</span>
                                        <span className="inline-grid grid-cols-[auto_1.25rem] items-center gap-1.5" dir="ltr">
                                            <span className={`font-bold text-right ${spare >= 0 ? (isLight ? 'text-green-600' : 'text-green-400') : (isLight ? 'text-red-500' : 'text-red-400')}`}>
                                                {spare >= 0 ? '+' : ''}{fmt(spare ?? 0)}
                                            </span>
                                            <span className="w-5 flex items-center justify-center">
                                                {spare !== null && spare > 0 && LocationSuggestModal && (
                                                <button
                                                    onClick={() => setShowLocations(true)}
                                                    title={isHe ? 'המלצות מקומות לפי העודף' : 'Location suggestions based on surplus'}
                                                    className={`p-0.5 rounded transition-colors shrink-0 ${isLight ? 'text-indigo-400 hover:text-indigo-600' : 'text-indigo-400 hover:text-indigo-300'}`}
                                                >
                                                    <Globe size={13} />
                                                </button>
                                                )}
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            )}
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
    {LocationSuggestModal && (
        <LocationSuggestModal
            isOpen={showLocations}
            onClose={() => setShowLocations(false)}
            availableAmount={Math.max(0, spare ?? 0)}
            userMonthlyCost={total}
            monthlySavingsAmount={Math.max(0, spare ?? 0)}
            withdrawalMonthlyAmount={activeIncome}
            year={selectedYear}
            currency={currency}
            isHe={isHe}
            isLight={isLight}
            aiProvider={aiProvider}
            aiModel={aiModel}
            apiKeyOverride={apiKeyOverride}
        />
    )}
    </>
    );
}
