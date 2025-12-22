import React, { useMemo, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { calculateRetirementProjection } from '../utils/calculator';
import { X, ExternalLink, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { createPortal } from 'react-dom';

export function SensitivityHeatmapButton({ onClick, t }) {
    return (
        <button
            onClick={onClick}
            title={t('sensitivityHeatmapBtn') || 'Heatmap'}
            className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 text-orange-200 hover:from-orange-500/30 hover:to-red-500/30"
        >
            <span>🔥</span>
            <span className="hidden md:inline">{t('sensitivityHeatmapBtn') || 'Heatmap'}</span>
        </button>
    );
}

export function SensitivityHeatmapModal({ isOpen, onClose, inputs, t, language }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isRTL = language === 'he';

    // Local state for "What-If" scenarios inside the modal
    const [localInputs, setLocalInputs] = useState(inputs);

    // Sync local state when modal opens or inputs change (reset)
    React.useEffect(() => {
        if (isOpen) {
            setLocalInputs(inputs);
        }
    }, [isOpen, inputs]);

    if (!isOpen) return null;

    const handleAgeChange = (e) => {
        setLocalInputs(prev => ({ ...prev, retirementStartAge: parseFloat(e.target.value) }));
    };

    const handleEndAgeChange = (e) => {
        let val = parseFloat(e.target.value);
        if (val <= localInputs.retirementStartAge) val = localInputs.retirementStartAge + 1;
        setLocalInputs(prev => ({ ...prev, retirementEndAge: val }));
    };

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl animate-in zoom-in-95 duration-200 ${isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-white/10 text-white'}`}>

                {/* Header */}
                <div className={`flex items-center justify-between p-3 border-b shrink-0 ${isLight ? 'border-slate-300' : 'border-white/10'}`}>
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <span>🔥</span>
                            {t('sensitivityHeatmap')}
                        </h2>
                        <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('heatmapDesc')}
                        </p>
                    </div>
                    <button onClick={onClose} className={`p-1.5 rounded-full transition-colors ${isLight ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>
                        <X size={18} />
                    </button>
                </div>

                {/* Scenarios Controls (Sliders) */}
                <div className={`px-4 py-3 border-b shrink-0 flex flex-col md:flex-row gap-4 md:items-center ${isLight ? 'bg-slate-100/50 border-slate-200' : 'bg-slate-800/50 border-white/5'}`}>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold whitespace-nowrap">{t('heatmapScenarioControls')}:</span>
                    </div>

                    <div className="flex flex-wrap gap-6 md:gap-8">
                        {/* Retirement Age Slider */}
                        <div className="flex flex-col gap-1 w-40">
                            <div className="flex justify-between text-xs">
                                <span className={isLight ? 'text-slate-600' : 'text-gray-400'}>{t('adjustRetirementAge')}</span>
                                <span className={`font-bold ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>{localInputs.retirementStartAge}</span>
                            </div>
                            <input
                                type="range"
                                min={Math.ceil(inputs.currentAge || 20)}
                                max="70"
                                step="1"
                                value={localInputs.retirementStartAge}
                                onChange={handleAgeChange}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-500"
                            />
                        </div>

                        {/* End Age Slider */}
                        <div className="flex flex-col gap-1 w-40">
                            <div className="flex justify-between text-xs">
                                <span className={isLight ? 'text-slate-600' : 'text-gray-400'}>{t('adjustRetirementEndAge')}</span>
                                <span className={`font-bold ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>{localInputs.retirementEndAge}</span>
                            </div>
                            <input
                                type="range"
                                min={Math.floor(localInputs.retirementStartAge) + 1}
                                max="70"
                                step="1"
                                value={localInputs.retirementEndAge}
                                onChange={handleEndAgeChange}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-500"
                            />
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-3 mt-4 md:mt-0 md:ms-auto border-t md:border-t-0 md:border-s pt-3 md:pt-0 md:ps-4 border-slate-300/50 dark:border-white/10">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">{t('heatmapLegend')}:</span>
                        <div className="flex gap-2">
                            <div className="flex items-center gap-1.5" title="Perpetuity">
                                <div className={`w-3 h-3 rounded ${isLight ? 'bg-teal-400' : 'bg-teal-500'}`}></div>
                                <span className="text-[10px] font-medium opacity-80">{t('livingOffInterest')}</span>
                            </div>
                            <div className="flex items-center gap-1.5" title="> 2M">
                                <div className={`w-3 h-3 rounded ${isLight ? 'bg-emerald-400' : 'bg-emerald-500'}`}></div>
                                <span className="text-[10px] font-medium opacity-80">{t('surplusHigh')}</span>
                            </div>
                            <div className="flex items-center gap-1.5" title="0.5M - 2M">
                                <div className={`w-3 h-3 rounded ${isLight ? 'bg-emerald-300' : 'bg-emerald-700'}`}></div>
                                <span className="text-[10px] font-medium opacity-80">{t('surplusMedium')}</span>
                            </div>
                            <div className="flex items-center gap-1.5" title="< 0.5M">
                                <div className={`w-3 h-3 rounded ${isLight ? 'bg-emerald-100' : 'bg-emerald-900'}`}></div>
                                <span className="text-[10px] font-medium opacity-80">{t('surplusLow')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-2 md:p-4 overflow-y-auto flex-1 min-h-0">
                    <SensitivityHeatmapGrid
                        inputs={localInputs}
                        originalInputs={inputs}
                        onReset={() => setLocalInputs(inputs)}
                        t={t}
                        language={language}
                        isLight={isLight}
                    />
                </div>
            </div>
        </div>,
        document.body
    );
}

function SensitivityHeatmapGrid({ inputs, originalInputs, onReset, t, language, isLight }) {
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
                return { x: xVal, y: yVal, result };
            });
        });

        return { xValues, yValues, grid };
    }, [inputs, xSteps, ySteps, xStepSize, yStepSize, xOffsetState, yOffsetState]);

    // Memoized formatters for performance
    const currencyFormatter = useMemo(() => new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: language === 'he' ? 'ILS' : 'USD',
        maximumFractionDigits: 1,
        notation: 'compact',
        compactDisplay: 'short'
    }), [language]);

    // Detailed formatter for Tooltip (Full precision, no compact)
    const detailedFormatter = useMemo(() => new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: language === 'he' ? 'ILS' : 'USD',
        maximumFractionDigits: 0,
    }), [language]);

    const formatCurrency = (val) => currencyFormatter.format(val);
    const formatExactCurrency = (val) => detailedFormatter.format(val);
    const isRTL = language === 'he';

    // Check if reset is needed
    const isModified = xOffsetState !== 0 ||
        yOffsetState !== 0 ||
        (originalInputs && (
            inputs.retirementStartAge !== originalInputs.retirementStartAge ||
            inputs.retirementEndAge !== originalInputs.retirementEndAge
        ));

    return (
        <div className="flex flex-col items-center w-full h-full">
            {/* 1. Top Controls for Y-Axis (Income) - Unified Bar */}
            <div className="flex items-center justify-between w-full mb-2 px-1">
                <span className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    {t('heatmapYAxis')}
                </span>
                <div className="flex items-center gap-1 bg-white/5 rounded-lg border border-white/10 p-0.5">
                    <button
                        onClick={() => setYOffsetState(p => p - 1)}
                        className={`flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors ${isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-gray-300'}`}
                        title={t('heatmapLowerIncome')}
                    >
                        <ChevronDown size={14} />
                        <span className="hidden md:inline text-[10px] md:text-xs font-medium">{t('heatmapLowerIncome')}</span>
                    </button>
                    <div className={`w-px h-3 ${isLight ? 'bg-slate-200' : 'bg-white/10'}`}></div>
                    <button
                        onClick={() => setYOffsetState(p => p + 1)}
                        className={`flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors ${isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-gray-300'}`}
                        title={t('heatmapHigherIncome')}
                    >
                        <span className="hidden md:inline text-[10px] md:text-xs font-medium">{t('heatmapHigherIncome')}</span>
                        <ChevronUp size={14} />
                    </button>
                </div>
            </div>

            {/* 2. Split Layout Container (Fixed Left Col + Scrollable Right Grid) */}
            <div className={`flex flex-row w-full overflow-hidden border rounded-xl ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-slate-900/50'}`}>

                {/* Left Column: Fixed Y-Axis Headers */}
                <div className={`flex flex-col shrink-0 z-20 border-e ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-white/10'}`}>
                    {/* Corner Spacer */}
                    <div className="h-8 flex items-center justify-center border-b border-transparent">
                        {isModified && (
                            <button
                                onClick={() => {
                                    setXOffsetState(0);
                                    setYOffsetState(0);
                                    if (onReset) onReset();
                                }}
                                className={`p-1 rounded-full transition-colors ${isLight ? 'text-blue-500 hover:bg-blue-50' : 'text-blue-400 hover:bg-white/10'}`}
                                title={t('reset')}
                            >
                                <RotateCcw size={12} />
                            </button>
                        )}
                    </div>

                    {/* Y-Axis Labels Loop */}
                    {gridData.yValues.map((yVal, i) => (
                        <div key={`y-head-${i}`} className="h-9 md:h-12 flex items-center justify-center px-1 border-b border-transparent">
                            <span className={`whitespace-nowrap text-[9px] md:text-xs font-semibold px-1.5 py-0.5 rounded-md ${Math.abs(yVal - parseFloat(inputs.monthlyNetIncomeDesired)) < 1 ? (isLight ? 'bg-blue-100 text-blue-800' : 'bg-blue-900/50 text-blue-100') : (isLight ? 'text-slate-500' : 'text-gray-400')}`}>
                                {formatCurrency(yVal)}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Right Area: Grid (No Scroll - Forced Fit) */}
                <div className="flex-1 min-w-0">
                    <div className="grid w-full" style={{ gridTemplateColumns: `repeat(${xSteps}, minmax(0, 1fr))` }}>
                        {/* X-Axis Headers Row */}
                        {gridData.xValues.map((xVal, i) => {
                            const isSelected = Math.abs(xVal - parseFloat(inputs.annualReturnRate)) < 0.01;
                            return (
                                <div key={`x-head-${i}`} className={`h-8 flex items-center justify-center border-b ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
                                    <span className={`px-1 py-0.5 rounded text-[9px] md:text-xs ${isSelected ? (isLight ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-blue-900/50 text-blue-100 font-bold') : (isLight ? 'text-slate-600 font-medium' : 'text-gray-400 font-medium')}`}>
                                        {xVal.toFixed(1)}%
                                    </span>
                                </div>
                            );
                        })}

                        {/* Grid Cells (Flat Rendering) */}
                        {gridData.grid.map((row, rowIndex) => (
                            <React.Fragment key={`row-frag-${rowIndex}`}>
                                {row.map((cell, colIndex) => {
                                    const { balanceAtEnd, surplus, balanceAtRetirement, requiredCapitalForPerpetuity } = cell.result;
                                    const isPositive = balanceAtEnd > 0;
                                    const isPerpetuity = balanceAtRetirement >= requiredCapitalForPerpetuity;

                                    // Color Logic
                                    let bgClass = '';
                                    if (isPositive) {
                                        if (isPerpetuity) {
                                            bgClass = isLight ? 'bg-teal-400' : 'bg-teal-500';
                                        } else {
                                            // Use balanceAtEnd for positive values to match the displayed numbers
                                            if (balanceAtEnd > 2000000) bgClass = isLight ? 'bg-emerald-400' : 'bg-emerald-500';
                                            else if (balanceAtEnd > 500000) bgClass = isLight ? 'bg-emerald-300' : 'bg-emerald-700';
                                            else bgClass = isLight ? 'bg-emerald-100' : 'bg-emerald-900';
                                        }
                                    } else {
                                        const deficit = Math.abs(surplus);
                                        if (deficit > 2000000) bgClass = isLight ? 'bg-red-500' : 'bg-red-950/90';
                                        else if (deficit > 500000) bgClass = isLight ? 'bg-red-400' : 'bg-red-900/80';
                                        else bgClass = isLight ? 'bg-red-300' : 'bg-red-800/60';
                                    }

                                    const isCurrentInput = Math.abs(cell.x - parseFloat(inputs.annualReturnRate)) < 0.01 &&
                                        Math.abs(cell.y - parseFloat(inputs.monthlyNetIncomeDesired)) < 1;

                                    // REMOVED: isCurrentInput background override. 
                                    // Selection is now handled purely via border/ring to preserve heatmap data visualization.

                                    const borderClass = isCurrentInput
                                        ? 'ring-2 ring-blue-500 z-10'
                                        : 'border border-white/5 hover:border-white/20';

                                    // Smart Tooltip Positioning
                                    let tooltipXPosition = 'left-1/2 -translate-x-1/2'; // Default Center
                                    const isFirstCol = colIndex === 0;
                                    const isLastCol = colIndex === xSteps - 1;

                                    if (isFirstCol) {
                                        // Align Start (LTR: Left, RTL: Right)
                                        tooltipXPosition = isRTL ? 'right-0 translate-x-0' : 'left-0 translate-x-0';
                                    } else if (isLastCol) {
                                        // Align End (LTR: Right, RTL: Left)
                                        tooltipXPosition = isRTL ? 'left-0 translate-x-0' : 'right-0 translate-x-0';
                                    }

                                    const tooltipYPosition = rowIndex === 0 ? 'top-full mt-1' : 'bottom-full mb-1';

                                    // Combine
                                    const tooltipPositionClass = `${tooltipYPosition} ${tooltipXPosition}`;

                                    return (
                                        <div
                                            key={`cell-${rowIndex}-${colIndex}`}
                                            className={`
                                                relative h-9 md:h-12 flex flex-col items-center justify-center p-0.5
                                                transition-all hover:brightness-110 cursor-help group hover:z-[60]
                                                ${bgClass} ${borderClass}
                                                ${isLight ? (isCurrentInput ? 'text-slate-900' : 'text-white') : (isCurrentInput ? 'text-white' : 'text-white/60')}
                                            `}
                                        >
                                            <span
                                                className={`${isCurrentInput ? 'text-[10px] md:text-sm font-bold' : 'text-[9px] md:text-[11px] font-bold'} transition-all text-center leading-tight w-full`}
                                                style={{ color: (isLight && isCurrentInput) ? '#2d4a66' : undefined }}
                                            >
                                                {formatCurrency(balanceAtEnd)}
                                            </span>
                                            {cell.result.ranOutAtAge && (
                                                <span className={`text-[8px] md:text-[9px] px-1 md:px-1.5 rounded-full font-bold mt-0.5 shadow-sm whitespace-nowrap ${isLight ? 'bg-white/90 text-red-700' : 'bg-black/50 text-red-400 border border-red-500/20'}`}>
                                                    {t('age')} {cell.result.ranOutAtAge.toFixed(0)}
                                                </span>
                                            )}

                                            {/* Tooltip */}
                                            <div
                                                className={`absolute opacity-0 group-hover:opacity-100 ${tooltipPositionClass} min-w-[120px] w-max max-w-[180px] rounded-lg p-2 pointer-events-none z-[100] transition-opacity text-start text-xs border ${isLight ? 'bg-white text-slate-800 border-slate-200 shadow-xl' : 'bg-slate-800 text-gray-100 border-white/10 shadow-2xl'}`}
                                                dir={isRTL ? 'rtl' : 'ltr'}
                                            >
                                                <div className={`grid grid-cols-2 gap-x-2 gap-y-0.5 mb-1.5 border-b pb-1.5 ${isLight ? 'border-slate-100' : 'border-white/10'}`}>
                                                    <span className={`${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('annualReturnRate')}:</span>
                                                    <span className="font-bold ltr:text-right rtl:text-left" dir="ltr">{cell.x.toFixed(1)}%</span>

                                                    <span className={`${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('monthlyIncome')}:</span>
                                                    <span className="font-bold ltr:text-right rtl:text-left">{formatExactCurrency(cell.y)}</span>

                                                    {/* Age & Duration in Tooltip */}
                                                    <span className={`${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('adjustRetirementAge')}:</span>
                                                    <span className="font-bold ltr:text-right rtl:text-left">{inputs.retirementStartAge}</span>

                                                    <span className={`${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('adjustRetirementEndAge')}:</span>
                                                    <span className="font-bold ltr:text-right rtl:text-left">{inputs.retirementEndAge}</span>
                                                </div>
                                                <div className="mb-0.5 flex justify-between items-center gap-2">
                                                    <span className={`${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('balanceAtEndShort')}:</span>
                                                    <span className={`font-bold ${isPositive ? (isLight ? 'text-emerald-600' : 'text-emerald-400') : (isLight ? 'text-red-600' : 'text-red-400')}`}>{formatExactCurrency(balanceAtEnd)}</span>
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
                </div>
            </div>

            {/* 3. X-Axis Controls - Fixed Logic & Removed Rotation */}
            <div className="flex items-center justify-center gap-4 mt-2">
                <button
                    onClick={() => setXOffsetState(p => p - 1)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-gray-300'}`}
                    title={t('heatmapLowerReturn')}
                >
                    <ChevronLeft size={16} />
                    <span className="hidden md:inline text-[10px] md:text-xs font-medium">{t('heatmapLowerReturn')}</span>
                </button>
                <span className={`text-[10px] md:text-xs font-medium ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>{t('heatmapXAxis')}</span>
                <button
                    onClick={() => setXOffsetState(p => p + 1)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-gray-300'}`}
                    title={t('heatmapHigherReturn')}
                >
                    <span className="hidden md:inline text-[10px] md:text-xs font-medium">{t('heatmapHigherReturn')}</span>
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
}
