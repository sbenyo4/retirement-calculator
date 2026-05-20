import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, RotateCcw, Save, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useDraggable } from '../hooks/useDraggable';

export function IncomeScheduleModal({ isOpen, onClose, inputs, setInputs, language, currency, startYear, endYear }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const { dragStyle, overlayStyle, onDragMouseDown, bringToFront } = useDraggable(isOpen, { constrainToViewport: true, viewportMargin: 16 });
    const isHe = language === 'he';
    const baseIncome = parseFloat(inputs.monthlyNetIncomeDesired) || 0;
    const sourceOverrides = useMemo(() => (
        inputs.yearlyIncomeOverrides && typeof inputs.yearlyIncomeOverrides === 'object'
            ? inputs.yearlyIncomeOverrides
            : {}
    ), [inputs.yearlyIncomeOverrides]);
    const [draft, setDraft] = useState({});

    const years = useMemo(() => {
        const fallbackStart = new Date().getFullYear();
        const from = Number.isFinite(startYear) ? startYear : fallbackStart;
        const to = Number.isFinite(endYear) && endYear >= from ? endYear : from + 30;
        return Array.from({ length: to - from + 1 }, (_, idx) => from + idx);
    }, [startYear, endYear]);

    useEffect(() => {
        if (!isOpen) return;
        const next = {};
        years.forEach(year => {
            const override = parseFloat(sourceOverrides[year]);
            next[year] = !isNaN(override) && override > 0 ? String(Math.round(override)) : String(Math.round(baseIncome));
        });
        setDraft(next);
    }, [isOpen, years, sourceOverrides, baseIncome]);

    if (!isOpen) return null;

    const format = (value) => `${currency}${Math.round(value || 0).toLocaleString()}`;
    const changedCount = years.filter(year => Math.abs((parseFloat(draft[year]) || 0) - baseIncome) > 0.001).length;
    const averageIncome = years.length
        ? years.reduce((sum, year) => sum + (parseFloat(draft[year]) || baseIncome), 0) / years.length
        : baseIncome;

    const updateYear = (year, value) => {
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            setDraft(prev => ({ ...prev, [year]: value }));
        }
    };

    const resetYear = (year) => {
        setDraft(prev => ({ ...prev, [year]: String(Math.round(baseIncome)) }));
    };

    const resetAll = () => {
        const next = {};
        years.forEach(year => { next[year] = String(Math.round(baseIncome)); });
        setDraft(next);
    };

    const save = () => {
        const overrides = {};
        years.forEach(year => {
            const amount = parseFloat(draft[year]);
            if (!isNaN(amount) && amount > 0 && Math.abs(amount - baseIncome) > 0.001) {
                overrides[year] = amount;
            }
        });
        setInputs(prev => ({ ...prev, yearlyIncomeOverrides: overrides }));
        onClose();
    };

    return createPortal(
        <div
            className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            style={overlayStyle}
            dir={isHe ? 'rtl' : 'ltr'}
            onMouseDown={bringToFront}
        >
            <div
                data-draggable-modal
                className={`relative w-full max-w-2xl h-[min(calc(100vh-2rem),760px)] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${
                    isLight ? 'bg-white ring-1 ring-gray-300 text-gray-900' : 'ring-1 ring-white/30 text-white'
                }`}
                style={dragStyle}
            >
                {!isLight && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                        <div className="absolute inset-0 bg-white/10" />
                    </>
                )}
                <div
                    className={`relative z-10 flex items-center justify-between gap-3 p-4 border-b cursor-grab active:cursor-grabbing ${
                        isLight ? 'border-gray-200' : 'border-white/10'
                    }`}
                    onMouseDown={onDragMouseDown}
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isLight ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h2 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                {isHe
                                    ? `הכנסה לפי שנים · ממוצע ${format(averageIncome)}`
                                    : `Income by Year · Avg ${format(averageIncome)}`}
                            </h2>
                            <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                {isHe
                                    ? `מקור: ${format(baseIncome)} לחודש · ${changedCount} שנים שונו`
                                    : `Source: ${format(baseIncome)}/mo · ${changedCount} changed years`}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className={`p-1.5 rounded-lg transition-colors ${
                            isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                        aria-label={isHe ? 'סגור' : 'Close'}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className={`relative z-10 grid grid-cols-[0.7fr_1fr_1fr_auto] gap-2 px-4 py-2 text-[11px] font-medium border-b ${
                    isLight ? 'text-slate-500 border-slate-200 bg-slate-50' : 'text-gray-400 border-white/10 bg-white/5'
                }`}>
                    <span>{isHe ? 'שנה' : 'Year'}</span>
                    <span>{isHe ? 'מקור' : 'Source'}</span>
                    <span>{isHe ? 'הכנסה' : 'Income'}</span>
                    <span className="sr-only">{isHe ? 'איפוס' : 'Reset'}</span>
                </div>

                <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar px-4 py-2 space-y-1">
                    {years.map(year => {
                        const value = parseFloat(draft[year]) || 0;
                        const changed = Math.abs(value - baseIncome) > 0.001;
                        return (
                            <div
                                key={year}
                                className={`grid grid-cols-[0.7fr_1fr_1fr_auto] gap-2 items-center rounded-lg px-2 py-1.5 border ${
                                    changed
                                        ? (isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/25')
                                        : (isLight ? 'bg-slate-50 border-transparent' : 'bg-white/5 border-transparent')
                                }`}
                            >
                                <span className="text-xs font-medium">{year}</span>
                                <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>{format(baseIncome)}</span>
                                <div className="relative">
                                    <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs ${isLight ? 'text-gray-400' : 'text-gray-400'}`}>{currency}</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={draft[year] ?? ''}
                                        onChange={e => updateYear(year, e.target.value)}
                                        className={`w-full rounded-lg border py-1 pl-5 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                                            isLight
                                                ? 'bg-white border-gray-300 text-gray-900'
                                                : 'bg-black/20 border-white/30 text-white'
                                        }`}
                                    />
                                </div>
                                <button
                                    onClick={() => resetYear(year)}
                                    disabled={!changed}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                        changed
                                            ? (isLight ? 'text-emerald-700 hover:bg-emerald-100' : 'text-emerald-300 hover:bg-white/10')
                                            : 'text-gray-400 opacity-50 cursor-not-allowed'
                                    }`}
                                    title={isHe ? 'החזר למקור' : 'Reset to source'}
                                >
                                    <RotateCcw size={14} />
                                </button>
                            </div>
                        );
                    })}
                </div>

                <div className={`relative z-10 flex items-center justify-between gap-2 p-4 border-t ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'}`}>
                    <button
                        onClick={resetAll}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                            isLight ? 'text-gray-600 hover:bg-gray-200' : 'text-gray-300 hover:bg-white/10'
                        }`}
                    >
                        <RotateCcw size={14} />
                        {isHe ? 'החזר הכל למקור' : 'Reset all'}
                    </button>
                    <button
                        onClick={save}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
                    >
                        <Save size={14} />
                        {isHe ? 'שמור' : 'Save'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
