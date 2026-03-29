import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDraggable } from '../hooks/useDraggable';
import { useDebouncedValue } from '../hooks/useDebounce';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useTheme } from '../contexts/ThemeContext';
import { useThemeClasses } from '../hooks/useThemeClasses';
import { X, Dices, ArrowDown, Calculator, RotateCcw, TrendingUp, TrendingDown, Shuffle, StepForward } from 'lucide-react';
import { calculateRetirementProjection } from '../utils/calculator';
import { formatCurrency as formatCurrencyUtil } from '../utils/formatters';
import { generateRandomRates as generateRandomRatesUtil, applyBalancedSort } from '../utils/variableRatesUtils';

export default function VariableRatesModal({
    isOpen,
    onClose,
    onCancel,
    onPreview,
    startYear,
    endYear,
    retirementStartYear,
    retirementEndYear,
    currentRate,
    variableRates,
    bucketType = 'accumulation', // 'accumulation', 'safe', or 'surplus'
    onSave,
    language,
    t,
    inputs
}) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    useBodyScrollLock(isOpen);
    const classes = useThemeClasses();

    const { dragStyle, onDragMouseDown } = useDraggable(isOpen);

    // Internal state for rates
    const [rates, setRates] = useState({});
    const debouncedRates = useDebouncedValue(rates, 300);
    const [averageRate, setAverageRate] = useState(currentRate);
    const [showStepForm, setShowStepForm] = useState(false);
    const [stepYears, setStepYears] = useState(5);
    const [stepTargetRate, setStepTargetRate] = useState(currentRate);
    const [activeScope, setActiveScope] = useState('all'); // 'all' | 'a' | 'b'
    const [activeSort, setActiveSort] = useState(null); // 'optimistic' | 'balanced' | 'pessimistic' | 'shuffle' | 'random' | 'reset' | 'fill'

    // Guard: don't fire onPreview during initial population of rates
    const previewReadyRef = useRef(false);

    // Initialize rates on open only — not on every prop change, which would
    // cause a re-init loop when onPreview updates inputs (and thus variableRates prop)
    useEffect(() => {
        if (!isOpen) { previewReadyRef.current = false; return; }
        const newCurrentRate = parseFloat(currentRate) || 0;
        const years = [];
        for (let y = startYear; y <= endYear; y++) years.push(y);

        const existingRates = { ...variableRates };
        years.forEach(y => { if (existingRates[y] === undefined) existingRates[y] = newCurrentRate; });

        // If existing rates have a significantly different weighted average than the new
        // currentRate, regenerate them centered on the new target using balanced ordering.
        // (getMonthsForYear and generateRandomRates are defined below but accessible at runtime)
        const hasExisting = Object.keys(variableRates).length > 0;
        let finalRates = existingRates;
        if (hasExisting) {
            let tw = 0, tm = 0;
            years.forEach(y => {
                const parsed = parseFloat(existingRates[y]);
                if (isNaN(parsed)) return;
                const m = getMonthsForYear(y);
                tw += parsed * m;
                tm += m;
            });
            const existingAvg = tm > 0 ? tw / tm : 0;

            if (Math.abs(existingAvg - newCurrentRate) > 0.25) {
                const weights = years.map(y => getMonthsForYear(y));
                const generated = generateRandomRatesUtil(years, newCurrentRate, weights);
                finalRates = applyBalancedSort(years, generated);
            }
        }

        setRates(finalRates);
        setAverageRate(newCurrentRate);
        setStepTargetRate(newCurrentRate);
        setShowStepForm(false);
        setActiveScope('all');
        setActiveSort(null);
        // Allow preview after React flushes the state updates above
        setTimeout(() => { previewReadyRef.current = true; }, 0);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // Live preview: push debounced rates to parent so the chart updates immediately
    useEffect(() => {
        if (!isOpen || !onPreview || !previewReadyRef.current) return;
        onPreview(debouncedRates);
    }, [debouncedRates]); // eslint-disable-line react-hooks/exhaustive-deps

    // Helper: Calculate months in year for weighting
    const getMonthsForYear = (year) => {
        const bDate = inputs?.birthDate || inputs?.birthdate;

        // 1. First Year of simulation
        if (year === startYear) {
            // If this is also retirement start year, use birth month (retirement starts on birthday)
            if (startYear === retirementStartYear && inputs && bDate) {
                const birthMonth = new Date(bDate).getMonth(); // 0-11
                return 12 - birthMonth; // Months remaining in year after birthday
            }
            // Otherwise (accumulation phase), use current month
            const currentMonth = new Date().getMonth(); // 0-11
            return 12 - currentMonth;
        }

        // 2. Last Year (End of Simulation)
        if (year === endYear) {
            // For accumulation bucket (ends before retirement), use retirementStartAge
            // For retirement buckets, use retirementEndAge
            const isAccumulation = endYear < retirementStartYear;
            const targetAge = isAccumulation ? inputs.retirementStartAge : inputs.retirementEndAge;

            if (inputs && bDate && targetAge) {
                const birthMonth = new Date(bDate).getMonth();
                const ageMonths = (parseFloat(targetAge) % 1) * 12;
                const endMonthIndex = Math.floor((birthMonth + ageMonths) % 12);
                return endMonthIndex + 1;
            }
            return 12; // Fallback
        }

        // 3. Intermediate Years
        return 12;
    };

    // Helper: Get month name for display
    // Helper to format month name without day-overflow bug
    const formatMonthName = (monthIndex) => {
        // Use a fixed date (1st of month) to avoid overflow when current day > 28
        const date = new Date(2000, monthIndex, 1);
        return new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-US', { month: 'short' }).format(date);
    };

    const getMonthName = (year) => {
        const bDate = inputs?.birthDate || inputs?.birthdate;

        // Retirement Start Year - show birth month (retirement starts on birthday)
        // Check this FIRST, before startYear, because they might be the same
        if (year === retirementStartYear && inputs && bDate) {
            const birthMonth = new Date(bDate).getMonth();
            return formatMonthName(birthMonth);
        }

        // Start Year (accumulation phase only) - show current month
        // Only if NOT the same as retirement year
        if (year === startYear && startYear !== retirementStartYear) {
            const currentMonth = new Date().getMonth();
            return formatMonthName(currentMonth);
        }

        // End Year - show end month based on target age
        if (year === endYear && inputs && bDate) {
            const isAccumulation = endYear < retirementStartYear;
            const targetAge = isAccumulation ? inputs.retirementStartAge : inputs.retirementEndAge;
            if (targetAge) {
                const birthMonth = new Date(bDate).getMonth();
                const ageMonths = (parseFloat(targetAge) % 1) * 12;
                const endMonthIndex = Math.floor((birthMonth + ageMonths) % 12);
                return formatMonthName(endMonthIndex);
            }
        }
        return '';
    };

    // Scope helpers for split mode
    const splitPoint = useMemo(() => {
        const total = endYear - startYear + 1;
        const parsed = parseInt(stepYears, 10);
        return Math.max(0, Math.min(total, isNaN(parsed) ? 5 : parsed));
    }, [stepYears, startYear, endYear]);

    const getScopeYears = () => {
        const allYears = [];
        for (let y = startYear; y <= endYear; y++) allYears.push(y);
        if (activeScope === 'all' || !showStepForm) return allYears;
        if (activeScope === 'a') return allYears.slice(0, splitPoint);
        return allYears.slice(splitPoint);
    };

    const getScopeBaseRate = () => {
        if (activeScope === 'b' && showStepForm) return parseFloat(stepTargetRate) || 0;
        if (activeScope === 'a' && showStepForm) return parseFloat(currentRate) || 0;
        return averageRate;
    };

    // Calculate time-weighted average
    const calculatedAverage = useMemo(() => {
        let totalWeightedRate = 0;
        let totalMonths = 0;

        // Only iterate over years within the current startYear-endYear range
        for (let y = startYear; y <= endYear; y++) {
            const parsed = parseFloat(rates[y]);
            if (isNaN(parsed)) continue;
            const months = getMonthsForYear(y);
            totalWeightedRate += parsed * months;
            totalMonths += months;
        }

        return totalMonths > 0 ? (totalWeightedRate / totalMonths) : 0;
    }, [rates, startYear, endYear, retirementStartYear, inputs]);

    // Step 4: Live Calculation Logic
    const { projectedBalance, averageBalance, gap, minBalance, maxBalance, minGap, maxGap, spread } = useMemo(() => {
        const zeroResult = { projectedBalance: 0, averageBalance: 0, gap: 0, minBalance: 0, maxBalance: 0, minGap: 0, maxGap: 0, spread: 0 };
        if (!inputs) return zeroResult;

        try {
            // 1. Current Sequence - set the correct variable rates key based on bucket type
            const ratesKey = bucketType === 'accumulation' ? 'variableRates' :
                bucketType === 'safe' ? 'safeVariableRates' : 'surplusVariableRates';
            const scenarioInputs = {
                ...inputs,
                variableRatesEnabled: true,
                [ratesKey]: debouncedRates
            };
            const projection = calculateRetirementProjection(scenarioInputs);
            const finalBal = projection.balanceAtEnd || 0;

            // 2. Average (Benchmark)
            const avgScenarioInputs = {
                ...inputs,
                variableRatesEnabled: false,
                annualReturnRate: calculatedAverage
            };
            const avgProjection = calculateRetirementProjection(avgScenarioInputs);
            const avgBal = avgProjection.balanceAtEnd || 0;

            // 3. Bounds Calculation (Optimistic vs Pessimistic)
            // Extract values
            const years = [];
            const values = [];
            for (let y = startYear; y <= endYear; y++) {
                years.push(y);
                values.push(debouncedRates[y] !== undefined ? parseFloat(debouncedRates[y]) : calculatedAverage);
            }

            // Optimistic (Best First - Descending)
            const valuesOpt = [...values].sort((a, b) => b - a);
            const ratesOpt = {};
            years.forEach((y, i) => ratesOpt[y] = valuesOpt[i]);
            const optInputs = { ...inputs, variableRatesEnabled: true, [ratesKey]: ratesOpt };
            const optProj = calculateRetirementProjection(optInputs);
            const maxBal = optProj.balanceAtEnd || 0;

            // Pessimistic (Worst First - Ascending)
            const valuesPess = [...values].sort((a, b) => a - b);
            const ratesPess = {};
            years.forEach((y, i) => ratesPess[y] = valuesPess[i]);
            const pessInputs = { ...inputs, variableRatesEnabled: true, [ratesKey]: ratesPess };
            const pessProj = calculateRetirementProjection(pessInputs);
            const minBal = pessProj.balanceAtEnd || 0;

            return {
                projectedBalance: finalBal,
                averageBalance: avgBal,
                gap: finalBal - avgBal,
                minBalance: minBal,
                maxBalance: maxBal,
                minGap: minBal - avgBal,
                maxGap: maxBal - avgBal,
                spread: maxBal - minBal
            };
        } catch (error) {
            console.warn("Calculation error (likely invalid inputs):", error.message);
            return zeroResult;
        }
    }, [debouncedRates, inputs, calculatedAverage, startYear, endYear]);

    const formatCurrency = (val) => formatCurrencyUtil(val, language);

    // ... handlers ...

    const handleRateChange = (year, value) => {
        // Allow empty string, minus sign, or valid number
        if (value === '' || value === '-' || !isNaN(parseFloat(value))) {
            setRates(prev => ({ ...prev, [year]: value }));
            setActiveSort(null);
        }
    };

    // Thin wrapper around the shared utility, preserving scope/base-rate API
    const generateRandomRates = (scopeYears = null, baseRate = null) => {
        const years = scopeYears || (() => {
            const y = [];
            for (let yr = startYear; yr <= endYear; yr++) y.push(yr);
            return y;
        })();
        const targetAvg = baseRate !== null ? baseRate : averageRate;
        const weights = years.map(y => getMonthsForYear(y));
        return generateRandomRatesUtil(years, targetAvg, weights);
    };

    // All handlers are scope-aware: when split mode is active and a scope
    // is selected (A or B), operations only affect that group's years.
    const handleRandomize = () => {
        const scopeYears = getScopeYears();
        const baseRate = getScopeBaseRate();
        const randomRates = generateRandomRates(scopeYears, baseRate);
        if (Object.keys(randomRates).length > 0) {
            setRates(prev => ({ ...prev, ...randomRates }));
            setActiveSort('random');
        }
    };

    const handleReset = () => {
        const scopeYears = getScopeYears();
        const baseRate = getScopeBaseRate();
        setRates(prev => {
            const newRates = { ...prev };
            scopeYears.forEach(y => { newRates[y] = baseRate; });
            return newRates;
        });
        setActiveSort('reset');
    };

    const handleFillDown = () => {
        const scopeYears = getScopeYears();
        if (scopeYears.length === 0) return;
        const firstVal = rates[scopeYears[0]];
        setRates(prev => {
            const newRates = { ...prev };
            scopeYears.forEach(y => { newRates[y] = firstVal; });
            return newRates;
        });
        setActiveSort('fill');
    };

    const handleSortOptimistic = () => {
        const scopeYears = getScopeYears();
        const baseRate = getScopeBaseRate();
        const values = scopeYears.map(y => parseFloat(rates[y]) || 0);

        const isFlat = values.every(v => Math.abs(v - values[0]) < 0.1);
        let sortedValues;
        if (isFlat) {
            const randomRates = generateRandomRates(scopeYears, baseRate);
            sortedValues = scopeYears.map(y => parseFloat(randomRates[y]) || baseRate);
        } else {
            sortedValues = [...values];
        }
        sortedValues.sort((a, b) => b - a);

        setRates(prev => {
            const newRates = { ...prev };
            scopeYears.forEach((y, i) => { newRates[y] = sortedValues[i]; });
            return newRates;
        });
        setActiveSort('optimistic');
    };

    const handleSortPessimistic = () => {
        const scopeYears = getScopeYears();
        const baseRate = getScopeBaseRate();
        const values = scopeYears.map(y => parseFloat(rates[y]) || 0);

        const isFlat = values.every(v => Math.abs(v - values[0]) < 0.1);
        let sortedValues;
        if (isFlat) {
            const randomRates = generateRandomRates(scopeYears, baseRate);
            sortedValues = scopeYears.map(y => parseFloat(randomRates[y]) || baseRate);
        } else {
            sortedValues = [...values];
        }
        sortedValues.sort((a, b) => a - b);

        setRates(prev => {
            const newRates = { ...prev };
            scopeYears.forEach((y, i) => { newRates[y] = sortedValues[i]; });
            return newRates;
        });
        setActiveSort('pessimistic');
    };

    const handleShuffle = () => {
        const scopeYears = getScopeYears();
        const values = scopeYears.map(y => parseFloat(rates[y]) || 0);

        const isFlat = values.every(v => Math.abs(v - values[0]) < 0.1);
        if (isFlat) {
            handleRandomize();
            return;
        }

        // Fisher-Yates Shuffle on scope values only
        for (let i = values.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [values[i], values[j]] = [values[j], values[i]];
        }

        setRates(prev => {
            const newRates = { ...prev };
            scopeYears.forEach((y, i) => { newRates[y] = values[i]; });
            return newRates;
        });
        setActiveSort('shuffle');
    };

    const handleSortBalanced = () => {
        const scopeYears = getScopeYears();
        const baseRate = getScopeBaseRate();
        const values = scopeYears.map(y => parseFloat(rates[y]) || 0);

        const isFlat = values.every(v => Math.abs(v - values[0]) < 0.1);
        let sortedValues;
        if (isFlat) {
            const randomRates = generateRandomRates(scopeYears, baseRate);
            sortedValues = scopeYears.map(y => parseFloat(randomRates[y]) || baseRate);
        } else {
            sortedValues = [...values];
        }
        sortedValues.sort((a, b) => b - a);

        // Interleave: [Best, Worst, 2nd Best, 2nd Worst, ...]
        const balancedValues = [];
        let left = 0;
        let right = sortedValues.length - 1;
        while (left <= right) {
            balancedValues.push(sortedValues[left]);
            if (left < right) balancedValues.push(sortedValues[right]);
            left++;
            right--;
        }

        setRates(prev => {
            const newRates = { ...prev };
            scopeYears.forEach((y, i) => { newRates[y] = balancedValues[i]; });
            return newRates;
        });
        setActiveSort('balanced');
    };

    const handleApplyStepRate = () => {
        const years = [];
        for (let y = startYear; y <= endYear; y++) years.push(y);
        const parsed = parseInt(stepYears, 10);
        const n = Math.max(0, Math.min(years.length, isNaN(parsed) ? 5 : parsed));
        const base = parseFloat(currentRate) || 0;
        const target = parseFloat(stepTargetRate) || 0;
        const newRates = {};
        years.forEach((year, i) => { newRates[year] = i < n ? base : target; });
        setRates(newRates);
    };

    const handleSave = () => {
        onSave(rates);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4" onClick={onCancel ?? onClose}>
            <div
                className={`rounded-2xl w-full max-w-sm h-[700px] shadow-xl flex flex-col relative overflow-hidden ${isLight ? 'bg-white border border-gray-200' : 'border border-white/30'}`}
                onClick={e => e.stopPropagation()}
                dir={language === 'he' ? 'rtl' : 'ltr'}
                style={dragStyle}
            >
                {!isLight && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                        <div className="absolute inset-0 bg-white/10" />
                    </>
                )}

                {/* Header */}
                <div className="relative z-10 flex-none flex items-center justify-between p-4 border-b border-gray-200 dark:border-white/10 cursor-grab active:cursor-grabbing" onMouseDown={onDragMouseDown}>
                    <h3 className={`text-lg font-semibold ${classes.headerLabel}`}>
                        {language === 'he' ? 'תשואות משתנות' : 'Variable Returns'}
                        {bucketType !== 'accumulation' && (
                            <span className={`text-sm font-normal mx-2 px-2 py-0.5 rounded-full ${bucketType === 'safe'
                                ? (isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300')
                                : (isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-500/20 text-purple-300')
                                }`}>
                                {bucketType === 'safe'
                                    ? (language === 'he' ? 'דלי בטוח' : 'Safe Bucket')
                                    : (language === 'he' ? 'דלי עודף' : 'Surplus Bucket')
                                }
                            </span>
                        )}
                    </h3>
                    <button onClick={onCancel ?? onClose} className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 ${classes.icon}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Actions Toolbar */}
                <div className="relative z-10 flex-none p-2 border-b border-gray-200 dark:border-white/10 flex gap-2 justify-center bg-white/5">
                    <button
                        onClick={handleRandomize}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeSort === 'random' ? (isLight ? 'bg-purple-300 text-purple-900' : 'bg-purple-500/50 text-purple-100') : (isLight ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30')}`}
                        title={language === 'he' ? 'צור אקראיות' : 'Randomize'}
                    >
                        <Dices size={14} />
                        {language === 'he' ? 'אקראי' : 'Random'}
                    </button>
                    <button
                        onClick={handleReset}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeSort === 'reset' ? (isLight ? 'bg-gray-300 text-gray-900' : 'bg-white/30 text-white') : (isLight ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-white/10 text-gray-300 hover:bg-white/20')}`}
                        title={language === 'he' ? 'אפס לממוצע קבוע' : 'Reset to Constant Average'}
                    >
                        <RotateCcw size={14} />
                        {language === 'he' ? 'איפוס/ממוצע' : 'Reset/Avg'}
                    </button>
                    <button
                        onClick={handleFillDown}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeSort === 'fill' ? (isLight ? 'bg-blue-300 text-blue-900' : 'bg-blue-500/50 text-blue-100') : (isLight ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30')}`}
                        title={language === 'he' ? 'החל על כולם' : 'Fill Down'}
                    >
                        <ArrowDown size={14} />
                        {language === 'he' ? 'החל' : 'Fill'}
                    </button>
                </div>

                {/* Sequence Analysis Toolbar (New) */}
                <div className="relative z-10 flex-none p-2 border-b border-gray-200 dark:border-white/10 flex gap-1.5 justify-center bg-white/5">
                    <button
                        onClick={handleSortOptimistic}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${activeSort === 'optimistic' ? (isLight ? 'bg-green-300 text-green-900' : 'bg-green-500/50 text-green-100') : (isLight ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-green-500/20 text-green-300 hover:bg-green-500/30')}`}
                        title={language === 'he' ? 'מיין: מהטוב לגרוע' : 'Sort: Best First'}
                    >
                        <TrendingUp size={12} />
                        {language === 'he' ? 'אופטימי' : 'Optimistic'}
                    </button>
                    <button
                        onClick={handleSortBalanced}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${activeSort === 'balanced' ? (isLight ? 'bg-indigo-300 text-indigo-900' : 'bg-indigo-500/50 text-indigo-100') : (isLight ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30')}`}
                        title={language === 'he' ? 'פזר: טוב, גרוע, טוב, גרוע...' : 'Balanced: Pair best with worst'}
                    >
                        <Calculator size={12} />
                        {language === 'he' ? 'מאוזן' : 'Balanced'}
                    </button>
                    <button
                        onClick={handleSortPessimistic}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${activeSort === 'pessimistic' ? (isLight ? 'bg-red-300 text-red-900' : 'bg-red-500/50 text-red-100') : (isLight ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-red-500/20 text-red-300 hover:bg-red-500/30')}`}
                        title={language === 'he' ? 'מיין: מהגרוע לטוב' : 'Sort: Worst First'}
                    >
                        <TrendingDown size={12} />
                        {language === 'he' ? 'פסימי' : 'Pessimistic'}
                    </button>
                    <button
                        onClick={handleShuffle}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${activeSort === 'shuffle' ? (isLight ? 'bg-amber-300 text-amber-900' : 'bg-amber-500/50 text-amber-100') : (isLight ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30')}`}
                        title={language === 'he' ? 'ערבב סדר קיים' : 'Shuffle Order'}
                    >
                        <Shuffle size={12} />
                        {language === 'he' ? 'ערבב' : 'Shuffle'}
                    </button>
                    <button
                        onClick={() => setShowStepForm(prev => !prev)}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                            showStepForm
                                ? (isLight ? 'bg-teal-200 text-teal-800' : 'bg-teal-500/30 text-teal-200')
                                : (isLight ? 'bg-teal-100 text-teal-700 hover:bg-teal-200' : 'bg-teal-500/20 text-teal-300 hover:bg-teal-500/30')
                        }`}
                        title={language === 'he' ? 'ריבית מדורגת' : 'Step Rate'}
                    >
                        <StepForward size={12} />
                        {language === 'he' ? 'מדורג' : 'Step'}
                    </button>
                </div>

                {/* Step Rate Inline Form + Scope Selector */}
                {showStepForm && (
                    <div className="relative z-10 flex-none px-3 py-2 border-b border-gray-200 dark:border-white/10 bg-white/5 animate-in fade-in slide-in-from-top-1 space-y-1.5">
                        <div className="flex items-center gap-1.5 justify-center">
                            <input
                                type="number"
                                min="0"
                                max={endYear - startYear + 1}
                                value={stepYears}
                                onChange={(e) => setStepYears(e.target.value)}
                                className={`w-12 text-center text-xs py-1 rounded-md border no-spinner ${
                                    isLight
                                        ? 'bg-white border-gray-300 text-gray-900'
                                        : 'bg-black/30 border-white/20 text-white'
                                } focus:outline-none focus:ring-1 focus:ring-teal-500`}
                            />
                            <span className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                {language === 'he' ? 'שנים' : 'yrs'} @
                            </span>
                            <span className={`text-xs font-bold ${isLight ? 'text-gray-700' : 'text-gray-200'}`}>
                                {currentRate}%
                            </span>
                            <span className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                {language === 'he' ? 'ואז' : 'then'}
                            </span>
                            <input
                                type="number"
                                step="0.5"
                                value={stepTargetRate}
                                onChange={(e) => setStepTargetRate(e.target.value)}
                                className={`w-14 text-center text-xs py-1 rounded-md border no-spinner ${
                                    isLight
                                        ? 'bg-white border-gray-300 text-gray-900'
                                        : 'bg-black/30 border-white/20 text-white'
                                } focus:outline-none focus:ring-1 focus:ring-teal-500`}
                            />
                            <span className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>%</span>
                            <button
                                onClick={handleApplyStepRate}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                                    isLight
                                        ? 'bg-teal-600 text-white hover:bg-teal-700'
                                        : 'bg-teal-500 text-white hover:bg-teal-400'
                                }`}
                            >
                                {language === 'he' ? 'החל' : 'Apply'}
                            </button>
                        </div>
                        {/* Scope selector — controls which group the toolbar buttons affect */}
                        <div className="flex items-center gap-1 justify-center">
                            <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                                {language === 'he' ? 'טווח:' : 'Scope:'}
                            </span>
                            {[
                                { id: 'all', label: language === 'he' ? 'הכל' : 'All' },
                                { id: 'a', label: `${language === 'he' ? 'א' : 'A'} (${startYear}–${startYear + splitPoint - 1})` },
                                { id: 'b', label: `${language === 'he' ? 'ב' : 'B'} (${startYear + splitPoint}–${endYear})` },
                            ].map(scope => (
                                <button
                                    key={scope.id}
                                    onClick={() => setActiveScope(scope.id)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                        activeScope === scope.id
                                            ? (scope.id === 'a'
                                                ? (isLight ? 'bg-teal-600 text-white' : 'bg-teal-500 text-white')
                                                : scope.id === 'b'
                                                    ? (isLight ? 'bg-orange-500 text-white' : 'bg-orange-500 text-white')
                                                    : (isLight ? 'bg-gray-700 text-white' : 'bg-gray-400 text-gray-900'))
                                            : (isLight ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-white/10 text-gray-400 hover:bg-white/20')
                                    }`}
                                >
                                    {scope.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Summary Stats */}
                <div className="relative z-10 flex-none px-4 py-2 flex justify-between items-center text-xs">
                    <span className={classes.label}>
                        {language === 'he' ? 'ממוצע מחושב:' : 'Avg:'}
                        <span className={`mx-1 font-bold ${Math.abs(calculatedAverage - averageRate) < 0.1 ? 'text-green-500' : 'text-blue-500'}`}>
                            {calculatedAverage.toFixed(2)}%
                        </span>
                    </span>
                    <span className={classes.label}>
                        {language === 'he' ? 'טווח שנים:' : 'Years:'} {startYear}-{endYear}
                    </span>
                </div>

                {/* Scrollable List - Force scrollbar to right (LTR) but keep content RTL if needed */}
                <div className="relative z-10 flex-grow overflow-y-auto px-4 py-2 custom-scrollbar" dir="ltr">
                    <div className="space-y-1" dir={language === 'he' ? 'rtl' : 'ltr'}>
                        {Array.from({ length: endYear - startYear + 1 }, (_, i) => {
                            const year = startYear + i;
                            const rate = rates[year] !== undefined ? rates[year] : averageRate;
                            const isGroupA = showStepForm && i < splitPoint;
                            const isGroupB = showStepForm && i >= splitPoint;
                            const isSplitBoundary = showStepForm && i === splitPoint;
                            return (
                                <div key={year}>
                                {isSplitBoundary && (
                                    <div className="border-t-2 border-dashed border-orange-400/40 my-1.5" />
                                )}
                                <div className={`flex items-center gap-2 ${
                                    isGroupA ? 'border-l-2 border-teal-400/60 pl-1' :
                                    isGroupB ? 'border-l-2 border-orange-400/60 pl-1' : ''
                                }`}>
                                    <div className="w-16 flex flex-col items-start justify-center">
                                        <span className={`text-xs font-mono font-bold ${year === retirementStartYear
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : (year === retirementEndYear
                                                ? 'text-amber-600 dark:text-amber-400'
                                                : (isLight ? 'text-gray-600' : 'text-gray-400 opacity-70'))
                                            }`}>
                                            {year}
                                        </span>
                                        {year === retirementStartYear && (
                                            <span className={`text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-full mt-0.5 whitespace-nowrap ${isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'}`}>
                                                {language === 'he' ? 'פרישה' : 'Retire'} {getMonthName(year) && <span className="opacity-75">({getMonthName(year)})</span>}
                                            </span>
                                        )}
                                        {year === startYear && startYear !== retirementStartYear && getMonthName(year) && (
                                            <span className={`text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-full mt-0.5 whitespace-nowrap ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300'}`}>
                                                {language === 'he' ? 'התחלה' : 'Start'} <span className="opacity-75">({getMonthName(year)})</span>
                                            </span>
                                        )}
                                        {year === endYear && getMonthName(year) && (
                                            <span className={`text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-full mt-0.5 whitespace-nowrap ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-300'}`}>
                                                {language === 'he' ? 'סיום' : 'End'} <span className="opacity-75">({getMonthName(year)})</span>
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 relative">
                                        <input
                                            dir="ltr"
                                            type="text"
                                            inputMode="decimal"
                                            value={rate}
                                            onChange={(e) => handleRateChange(year, e.target.value)}
                                            className={`w-full text-right px-3 py-1.5 rounded text-sm no-spinner
                                                ${rate < 0 ? 'text-red-500' : (rate > 8 ? 'text-green-500' : (isLight ? 'text-gray-900' : 'text-white'))}
                                                ${isLight ? 'bg-gray-50 border border-gray-300 focus:ring-blue-500' : 'bg-black/20 border border-white/20 focus:ring-blue-500'}
                                                focus:outline-none focus:ring-1 transition-all
                                            `}
                                        />
                                        <span className={`absolute ${language === 'he' ? 'left-2' : 'right-2'} top-1/2 -translate-y-1/2 text-xs opacity-50`}>%</span>
                                    </div>
                                    {/* Visual Bar */}
                                    <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${rate < 0 ? 'bg-red-500' : 'bg-green-500'}`}
                                            style={{ width: `${Math.min(100, Math.abs(rate) * 5)}%` }} // Scale visuals
                                        />
                                    </div>
                                </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="relative z-10 flex-none p-3 border-t border-gray-200 dark:border-white/10 bg-white/5 space-y-2">

                    {/* Range Analysis (New) */}
                    <div className="flex justify-between items-center px-1">
                        <span className={`text-xs ${classes.label}`}>
                            {language === 'he' ? 'טווח אפשרי (לפי סדר התשואות):' : 'Possible Range (Sequence Risk):'}
                        </span>
                        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${isLight ? 'bg-orange-100 text-orange-700' : 'bg-orange-900/40 text-orange-300'}`}>
                            {language === 'he' ? 'פער:' : 'Spread:'} {formatCurrency(spread)}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        {/* Pessimistic Card */}
                        <div className={`flex-1 rounded-lg p-2 border ${isLight ? 'bg-red-50 border-red-100' : 'bg-red-950/40 border-red-500/30'}`}>
                            <div className="flex justify-between items-baseline mb-0.5">
                                <span className={`text-[10px] uppercase font-bold ${isLight ? 'text-red-600/70' : 'text-red-300/70'}`}>
                                    {language === 'he' ? 'התרחיש הגרוע' : 'Worst Case'}
                                </span>
                                <span className={`text-[10px] font-mono ${isLight ? 'text-red-600/60' : 'text-red-300/50'}`} dir="ltr">
                                    {minGap > 0 ? '+' : ''}{formatCurrency(minGap)}
                                </span>
                            </div>
                            <div className={`text-sm font-bold font-mono ${isLight ? 'text-red-700' : 'text-red-200'}`}>
                                {formatCurrency(minBalance)}
                            </div>
                        </div>

                        {/* Optimistic Card */}
                        <div className={`flex-1 rounded-lg p-2 border ${isLight ? 'bg-green-50 border-green-100' : 'bg-green-950/40 border-green-500/30'}`}>
                            <div className="flex justify-between items-baseline mb-0.5">
                                <span className={`text-[10px] uppercase font-bold ${isLight ? 'text-green-600/70' : 'text-green-300/70'}`}>
                                    {language === 'he' ? 'התרחיש הטוב' : 'Best Case'}
                                </span>
                                <span className={`text-[10px] font-mono ${isLight ? 'text-green-600/60' : 'text-green-300/50'}`} dir="ltr">
                                    {maxGap > 0 ? '+' : ''}{formatCurrency(maxGap)}
                                </span>
                            </div>
                            <div className={`text-sm font-bold font-mono ${isLight ? 'text-green-700' : 'text-green-200'}`}>
                                {formatCurrency(maxBalance)}
                            </div>
                        </div>
                    </div>

                    {/* Live Sequence Analysis Summary (Step 3) */}
                    <div className={`rounded-xl p-2 flex justify-between items-center ${isLight ? 'bg-indigo-50 border border-indigo-100' : 'bg-black/20 border border-white/10'}`}>
                        <div className="flex flex-col">
                            <span className="text-[10px] opacity-70 uppercase tracking-wider font-semibold">
                                {language === 'he' ? 'צפי סיום (רצף נבחר)' : 'Projected End Balance'}
                            </span>
                            <span className={`text-lg font-bold font-mono ${gap > 0 ? 'text-green-500' : (gap < 0 ? 'text-red-400' : (isLight ? 'text-gray-900' : 'text-white'))}`}>
                                {formatCurrency(projectedBalance)}
                            </span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] opacity-70 uppercase tracking-wider font-semibold">
                                {language === 'he' ? 'פער מהממוצע' : 'Gap from Avg'}
                            </span>
                            <span className={`text-sm font-bold font-mono ${gap > 0 ? 'text-green-500' : (gap < 0 ? 'text-red-400' : (isLight ? 'text-gray-500' : 'text-gray-400'))}`} dir="ltr">
                                {gap > 0 ? '+' : ''}{formatCurrency(gap)}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={handleSave}
                        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        {language === 'he' ? 'שמור שינויים' : 'Save Changes'}
                        <ArrowDown size={16} />
                    </button>
                </div>
            </div>
        </div >
    );
}
