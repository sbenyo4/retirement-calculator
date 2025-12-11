import React, { useMemo, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { calculateRetirementProjection } from '../utils/calculator';
import { X, ExternalLink, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { createPortal } from 'react-dom';

export function SensitivityHeatmapButton({ onClick, t }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 text-orange-200 hover:from-orange-500/30 hover:to-red-500/30"
        >
            <span>🔥</span>
            <span>{t('sensitivityHeatmap') || 'Heatmap'}</span>
        </button>
    );
}

export function SensitivityHeatmapModal({ isOpen, onClose, inputs, t, language }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isRTL = language === 'he';

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl animate-in zoom-in-95 duration-200 ${isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-white/10 text-white'}`}>

                {/* Header - Fixed RTL alignment with explicit flex-row/reverse not needed if dir=rtl on parent */}
                <div className={`flex items-center justify-between p-4 border-b ${isLight ? 'border-slate-300' : 'border-white/10'}`}>
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <span>🔥</span>
                            {t('sensitivityHeatmap')}
                        </h2>
                        <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('heatmapDesc')}
                        </p>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-full transition-colors ${isLight ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-x-auto">
                    <SensitivityHeatmapGrid inputs={inputs} t={t} language={language} isLight={isLight} />
                </div>
            </div>
        </div>,
        document.body
    );
}

function SensitivityHeatmapGrid({ inputs, t, language, isLight }) {
    // Configuration
    const xSteps = 7; // Number of columns (Interest Rate)
    const ySteps = 7; // Number of rows (Income)
    const xStepSize = 0.5; // 0.5% per step
    const yStepSize = 1000; // 1000 currency units per step

    // State for scrolling/shifting range
    const [xOffsetState, setXOffsetState] = useState(0);
    const [yOffsetState, setYOffsetState] = useState(0);

    // Calculate grid data
    const gridData = useMemo(() => {
        const baseInterest = parseFloat(inputs.annualReturnRate) + (xOffsetState * xStepSize);
        const baseIncome = parseFloat(inputs.monthlyNetIncomeDesired) + (yOffsetState * yStepSize);

        // Calculate ranges centered on shifted base
        // X-Axis: Interest Rate
        const xValues = Array.from({ length: xSteps }, (_, i) => {
            const offset = i - Math.floor(xSteps / 2);
            return baseInterest + (offset * xStepSize);
        });

        // Y-Axis: Income
        // Top row = Highest Income (+3 steps), Bottom row = Lowest Income (-3 steps)
        const yValues = Array.from({ length: ySteps }, (_, i) => {
            const offset = Math.floor(ySteps / 2) - i; // Positive offset at index 0
            return baseIncome + (offset * yStepSize);
        });

        // Compute results for each cell
        const grid = yValues.map(yVal => {
            return xValues.map(xVal => {
                const simInputs = {
                    ...inputs,
                    annualReturnRate: xVal,
                    monthlyNetIncomeDesired: yVal
                };
                const result = calculateRetirementProjection(simInputs);
                return {
                    x: xVal,
                    y: yVal,
                    result
                };
            });
        });

        return { xValues, yValues, grid };
    }, [inputs, xSteps, ySteps, xStepSize, yStepSize, xOffsetState, yOffsetState]);

    // Formatters
    const currencyFormatter = new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: language === 'he' ? 'ILS' : 'USD',
        maximumFractionDigits: 1,
        notation: 'compact',
        compactDisplay: 'short'
    });

    // Detailed formatter for Tooltip (Full precision, no compact)
    const detailedFormatter = new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: language === 'he' ? 'ILS' : 'USD',
        maximumFractionDigits: 0,
    });

    const formatCurrency = (val) => currencyFormatter.format(val);
    const formatExactCurrency = (val) => detailedFormatter.format(val);
    const isRTL = language === 'he';

    return (
        <div className="flex flex-col items-center">
            <div className="flex flex-row">
                {/* Y-Axis Label & Controls */}
                <div className="flex flex-col items-center justify-center mr-2 gap-2 rtl:ml-2 rtl:mr-0">
                    <button
                        onClick={() => setYOffsetState(p => p + 1)}
                        className={`p-1.5 rounded-full transition-colors ${isLight ? 'text-blue-500 hover:bg-blue-50' : 'text-blue-400 hover:bg-white/10'}`}
                        title="Increase Income Range"
                    >
                        <ChevronUp size={16} />
                    </button>

                    <div className="flex items-center justify-center py-2" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                        <span className={`font-bold text-sm opacity-70 whitespace-nowrap ${isLight ? 'text-slate-800' : 'text-white/60'}`}>{t('heatmapYAxis')}</span>
                    </div>

                    <button
                        onClick={() => setYOffsetState(p => p - 1)}
                        className={`p-1.5 rounded-full transition-colors ${isLight ? 'text-blue-500 hover:bg-blue-50' : 'text-blue-400 hover:bg-white/10'}`}
                        title="Decrease Income Range"
                    >
                        <ChevronDown size={16} />
                    </button>
                </div>

                <div className="flex flex-col">
                    {/* Grid */}
                    <div className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(${xSteps}, minmax(80px, 1fr))` }}>

                        {/* Empty top-left corner */}
                        <div className="flex items-end justify-end p-1">
                            {/* Reset button if offsets are non-zero */}
                            {(xOffsetState !== 0 || yOffsetState !== 0) && (
                                <button
                                    onClick={() => { setXOffsetState(0); setYOffsetState(0); }}
                                    className={`p-1.5 rounded-full transition-colors ${isLight ? 'text-blue-500 hover:bg-blue-50' : 'text-blue-400 hover:bg-white/10'}`}
                                    title={t('reset')}
                                >
                                    <RotateCcw size={14} />
                                </button>
                            )}
                        </div>

                        {/* X-Axis Headers */}
                        {gridData.xValues.map((xVal, i) => {
                            const isSelected = Math.abs(xVal - parseFloat(inputs.annualReturnRate)) < 0.01;
                            return (
                                <div key={`x-head-${i}`} className={`text-center py-2 px-1 rounded transition-all ${isSelected ? (isLight ? 'bg-blue-100 text-blue-800 text-sm font-bold ring-1 ring-blue-200' : 'bg-blue-900/50 text-blue-100 text-sm font-bold') : (isLight ? 'text-slate-600 text-xs font-semibold' : 'text-gray-300 text-xs font-semibold')}`}>
                                    {xVal.toFixed(1)}%
                                </div>
                            );
                        })}

                        {/* Rows */}
                        {gridData.grid.map((row, rowIndex) => (
                            <React.Fragment key={`row-${rowIndex}`}>
                                {/* Row Header (Y-Axis Value) */}
                                <div className="flex items-center justify-end pr-2">
                                    <div className={`whitespace-nowrap transition-all px-3 py-1.5 rounded ${Math.abs(gridData.yValues[rowIndex] - parseFloat(inputs.monthlyNetIncomeDesired)) < 1 ? (isLight ? 'bg-blue-100 text-blue-800 text-sm font-bold ring-1 ring-blue-200' : 'bg-blue-900/50 text-blue-100 text-sm font-bold') : (isLight ? 'text-slate-600 text-xs font-semibold' : 'text-gray-400 text-xs font-semibold')}`}>
                                        {formatCurrency(gridData.yValues[rowIndex])}
                                    </div>
                                </div>

                                {/* Cells */}
                                {row.map((cell, colIndex) => {
                                    const { balanceAtEnd, surplus } = cell.result;
                                    const isPositive = balanceAtEnd > 0;

                                    // Determine background color
                                    // REFINED DARK MODE GREEN COLORS
                                    let bgClass = '';
                                    if (isPositive) {
                                        if (surplus > 2000000) bgClass = isLight ? 'bg-emerald-500' : 'bg-emerald-900'; // Darker base
                                        else if (surplus > 500000) bgClass = isLight ? 'bg-emerald-400' : 'bg-emerald-800/80';
                                        else bgClass = isLight ? 'bg-emerald-300' : 'bg-emerald-700/60';
                                    } else {
                                        // Negative/Run out
                                        const deficit = Math.abs(surplus);
                                        if (deficit > 2000000) bgClass = isLight ? 'bg-red-500' : 'bg-red-950/90';
                                        else if (deficit > 500000) bgClass = isLight ? 'bg-red-400' : 'bg-red-900/80';
                                        else bgClass = isLight ? 'bg-red-300' : 'bg-red-800/60';
                                    }

                                    // Highlight center (current selection - strictly adhering to INPUTS, not adjusted base)
                                    // Center cell highlights the User's Actual Inputs if they are visible in grid
                                    const isCurrentInput = Math.abs(cell.x - parseFloat(inputs.annualReturnRate)) < 0.01 &&
                                        Math.abs(cell.y - parseFloat(inputs.monthlyNetIncomeDesired)) < 1;

                                    if (isCurrentInput) {
                                        if (isPositive) {
                                            bgClass = isLight ? 'bg-emerald-600' : 'bg-emerald-950'; // Slightly darker Green
                                        } else {
                                            bgClass = isLight ? 'bg-red-600' : 'bg-red-950'; // Slightly darker Red
                                        }
                                    }

                                    const borderClass = isCurrentInput
                                        ? 'ring-2 ring-blue-500 z-10'
                                        : 'border border-white/5 hover:border-white/40';

                                    // Dynamic Tooltip Position: Flip down if in top 2 rows
                                    const tooltipPositionClass = rowIndex < 2
                                        ? 'top-full mt-2' // Flip Down
                                        : 'bottom-full mb-2'; // Standard Up

                                    return (
                                        <div
                                            key={`cell-${rowIndex}-${colIndex}`}
                                            className={`
                                                relative h-16 rounded-md flex flex-col items-center justify-center p-1 transition-transform hover:scale-105 cursor-help group
                                                ${bgClass} ${borderClass}
                                                ${isLight ? (isCurrentInput ? 'text-slate-900' : 'text-white') : (isCurrentInput ? 'text-white/70' : 'text-white/60')} shadow-sm hover:z-50
                                            `}
                                        >
                                            <span
                                                className={`${isCurrentInput ? 'text-sm font-bold' : 'text-xs font-bold'} transition-all`}
                                                style={{ color: (isLight && isCurrentInput) ? '#2d4a66' : undefined }}
                                            >
                                                {formatCurrency(balanceAtEnd)}
                                            </span>
                                            {cell.result.ranOutAtAge && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold mt-1 shadow-sm ${isLight ? 'bg-white/90 text-red-700' : 'bg-black/50 text-red-400 border border-red-500/20'}`}>
                                                    {t('age')} {cell.result.ranOutAtAge.toFixed(0)}
                                                </span>
                                            )}

                                            {/* Tooltip - Fixed Z-Index, Alignment, RTL, Language, Dynamic Flip, Theme-Aware Colors */}
                                            <div
                                                className={`absolute opacity-0 group-hover:opacity-100 ${tooltipPositionClass} left-1/2 -translate-x-1/2 w-48 rounded-lg p-3 pointer-events-none z-[100] transition-opacity text-start border ${isLight ? 'bg-white text-slate-800 border-slate-200 shadow-xl' : 'bg-slate-800 text-gray-100 border-white/10 shadow-2xl'}`}
                                                dir={isRTL ? 'rtl' : 'ltr'}
                                            >
                                                <div className={`grid grid-cols-2 gap-1 mb-2 border-b pb-2 ${isLight ? 'border-slate-100' : 'border-white/10'}`}>
                                                    <span className={`${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('annualReturnRate')}:</span> {/* Fixed Key */}
                                                    <span className="font-bold ltr:text-right rtl:text-left" dir="ltr">{cell.x.toFixed(1)}%</span>

                                                    <span className={`${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('monthlyIncome')}:</span>
                                                    <span className="font-bold ltr:text-right rtl:text-left">{formatExactCurrency(cell.y)}</span>
                                                </div>

                                                <div className="mb-1 flex justify-between items-center">
                                                    <span className={`${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('balanceAtEndShort')}:</span>
                                                    <span className={`font-bold ${isPositive
                                                        ? (isLight ? 'text-emerald-600' : 'text-emerald-400')
                                                        : (isLight ? 'text-red-600' : 'text-red-400')
                                                        }`}>{formatExactCurrency(balanceAtEnd)}</span>
                                                </div>

                                                <div className="mb-1 flex justify-between items-center text-[10px]">
                                                    <span className={`${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isPositive ? t('surplus') : t('deficit')}:</span>
                                                    <span className={`${isLight ? 'text-slate-500' : 'text-gray-300'}`}>{formatExactCurrency(surplus)}</span>
                                                </div>

                                                {cell.result.ranOutAtAge && (
                                                    <div className={`font-medium mt-1 border-t pt-1 ${isLight ? 'text-red-600 border-slate-100' : 'text-red-300 border-white/10'}`}>
                                                        {t('warningRunOut')} {cell.result.ranOutAtAge.toFixed(1)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* X-Axis Label & Controls */}
                    <div className="flex items-center justify-center gap-4 mt-2">
                        <button
                            onClick={() => setXOffsetState(p => p - (isRTL ? -1 : 1))}
                            className={`p-1 rounded ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-500' : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'} transition-colors`}
                            title="Decrease Return Rate"
                        >
                            <ChevronLeft size={16} className={isRTL ? 'rotate-180' : ''} />
                        </button>

                        <div className={`text-center font-bold text-sm opacity-70 min-w-[120px] ${isLight ? 'text-slate-800' : 'text-white/60'}`}>
                            {t('heatmapXAxis')}
                        </div>

                        <button
                            onClick={() => setXOffsetState(p => p + (isRTL ? -1 : 1))}
                            className={`p-1 rounded ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-500' : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'} transition-colors`}
                            title="Increase Return Rate"
                        >
                            <ChevronRight size={16} className={isRTL ? 'rotate-180' : ''} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
