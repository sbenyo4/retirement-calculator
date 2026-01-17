import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useThemeClasses } from '../hooks/useThemeClasses';
import { X, Dices, ArrowDown, Calculator, RotateCcw, TrendingUp, TrendingDown, Shuffle } from 'lucide-react';
import { calculateRetirementProjection } from '../utils/calculator';

export default function VariableRatesModal({
    isOpen,
    onClose,
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
    inputs // Step 4: Receive inputs
}) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const classes = useThemeClasses();

    // Internal state for rates
    const [rates, setRates] = useState({});
    const [averageRate, setAverageRate] = useState(currentRate);

    // Initialize rates when modal opens or defaults change
    useEffect(() => {
        if (isOpen) {
            const initialRates = { ...variableRates };
            // Ensure all years exist
            for (let y = startYear; y <= endYear; y++) {
                if (initialRates[y] === undefined) {
                    initialRates[y] = currentRate;
                }
            }
            setRates(initialRates);
            setAverageRate(parseFloat(currentRate) || 0);
        }
    }, [isOpen, startYear, endYear, currentRate, variableRates]);

    // Helper: Calculate months in year for weighting
    const getMonthsForYear = (year) => {
        // 1. First Year (Current Year)
        // Assume simulation starts "Now", so months remaining in current year.
        if (year === startYear) {
            const currentMonth = new Date().getMonth(); // 0-11
            return 12 - currentMonth;
        }

        // 2. Last Year (End of Simulation)
        if (year === endYear) {
            // For accumulation bucket (ends before retirement), use retirementStartAge
            // For retirement buckets, use retirementEndAge
            const bDate = inputs?.birthDate || inputs?.birthdate;
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
    const getMonthName = (year) => {
        const bDate = inputs?.birthDate || inputs?.birthdate;

        // Start Year - show current month
        if (year === startYear) {
            const currentMonth = new Date().getMonth();
            const date = new Date();
            date.setMonth(currentMonth);
            return new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-US', { month: 'short' }).format(date);
        }

        // End Year - show end month based on target age
        if (year === endYear && inputs && bDate) {
            const isAccumulation = endYear < retirementStartYear;
            const targetAge = isAccumulation ? inputs.retirementStartAge : inputs.retirementEndAge;
            if (targetAge) {
                const birthMonth = new Date(bDate).getMonth();
                const ageMonths = (parseFloat(targetAge) % 1) * 12;
                const endMonthIndex = Math.floor((birthMonth + ageMonths) % 12);
                const date = new Date();
                date.setMonth(endMonthIndex);
                return new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-US', { month: 'short' }).format(date);
            }
        }
        return '';
    };

    // Calculate time-weighted average
    const calculatedAverage = useMemo(() => {
        let totalWeightedRate = 0;
        let totalMonths = 0;

        // Only iterate over years within the current startYear-endYear range
        for (let y = startYear; y <= endYear; y++) {
            const rate = parseFloat(rates[y]) || 0;
            const months = getMonthsForYear(y);

            totalWeightedRate += rate * months;
            totalMonths += months;
        }

        return totalMonths > 0 ? (totalWeightedRate / totalMonths) : 0;
    }, [rates, startYear, endYear, inputs]);

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
                [ratesKey]: rates
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
                values.push(rates[y] !== undefined ? parseFloat(rates[y]) : calculatedAverage);
            }

            // Optimistic (Best First - Descending)
            const valuesOpt = [...values].sort((a, b) => b - a);
            const ratesOpt = {};
            years.forEach((y, i) => ratesOpt[y] = valuesOpt[i]);
            const optInputs = { ...inputs, variableRatesEnabled: true, variableRates: ratesOpt };
            const optProj = calculateRetirementProjection(optInputs);
            const maxBal = optProj.balanceAtEnd || 0;

            // Pessimistic (Worst First - Ascending)
            const valuesPess = [...values].sort((a, b) => a - b);
            const ratesPess = {};
            years.forEach((y, i) => ratesPess[y] = valuesPess[i]);
            const pessInputs = { ...inputs, variableRatesEnabled: true, variableRates: ratesPess };
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
    }, [rates, inputs, calculatedAverage, startYear, endYear]);

    const formatCurrency = (val) => {
        return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-IL', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0
        }).format(val);
    };

    // ... handlers ...

    const handleRateChange = (year, value) => {
        // Allow empty string, minus sign, or valid number
        if (value === '' || value === '-' || !isNaN(parseFloat(value))) {
            setRates(prev => ({ ...prev, [year]: value }));
        }
    };

    // Helper to generate random volatile rates (Time-Weighted)
    const generateRandomRates = () => {
        const years = [];
        const weights = []; // Store month counts
        let totalMonths = 0;

        for (let y = startYear; y <= endYear; y++) {
            years.push(y);
            const m = getMonthsForYear(y);
            weights.push(m);
            totalMonths += m;
        }

        const count = years.length;
        if (count === 0 || totalMonths === 0) return {};

        // 1. Generate random volatility (roughly -10% to +10% spread)
        let rawRates = years.map(() => {
            const variance = (Math.random() * 20) - 10;
            return averageRate + variance;
        });

        // 2. Adjust mean to match exactly the target 'averageRate' (Weighted)
        // Adding a constant C to all rates changes the Weighted Average by exactly C.
        // NewAvg = Sum((R+C)*W) / Sum(W) = (Sum(RW) + C*Sum(W)) / Sum(W) = OldAvg + C.
        // So C = TargetAvg - OldAvg.

        let currentWeightedSum = 0;
        rawRates.forEach((r, i) => {
            currentWeightedSum += r * weights[i];
        });

        const currentWeightedAvg = currentWeightedSum / totalMonths;
        const correction = averageRate - currentWeightedAvg;

        rawRates = rawRates.map(r => r + correction);

        // 3. Quantize to 0.5
        let quantizedRates = rawRates.map(r => Math.round(r * 2) / 2);

        // 4. Final Adjustment to maintain reasonable weighted average after rounding
        // Note: With partial weights, we might not be able to hit the EXACT average with 0.5 steps.
        // We will try to minimize the weighted drift.

        let finalWeightedSum = 0;
        quantizedRates.forEach((r, i) => {
            finalWeightedSum += r * weights[i];
        });

        const targetWeightedSum = averageRate * totalMonths;
        let weightedDrift = targetWeightedSum - finalWeightedSum;

        // We iterate to reduce drift.
        // Each step changes a rate by 0.5. The impact on Sum is 0.5 * weight[i].
        let attempts = 0;
        while (Math.abs(weightedDrift) > 1 && attempts < 200) { // Threshold > 1 month-percent
            const idx = Math.floor(Math.random() * count);
            const weight = weights[idx];
            const change = 0.5 * weight;

            if (weightedDrift > 0) {
                // Need to increase sum
                quantizedRates[idx] += 0.5;
                weightedDrift -= change;
            } else {
                // Need to decrease sum
                quantizedRates[idx] -= 0.5;
                weightedDrift += change;
            }
            attempts++;
        }

        // 5. Clamp rates to be within absolute -10% to +10%
        const minRate = -10;
        const maxRate = 10;
        quantizedRates = quantizedRates.map(r => Math.max(minRate, Math.min(maxRate, r)));

        const newRates = {};
        years.forEach((year, i) => {
            newRates[year] = quantizedRates[i];
        });
        return newRates;
    };

    const handleRandomize = () => {
        const newRates = generateRandomRates();
        if (Object.keys(newRates).length > 0) setRates(newRates);
    };

    const handleReset = () => { // Reset to Constant Average
        const newRates = {};
        for (let y = startYear; y <= endYear; y++) {
            newRates[y] = averageRate;
        }
        setRates(newRates);
    };

    const handleFillDown = () => {
        const keys = Object.keys(rates).sort();
        if (keys.length === 0) return;
        const firstVal = rates[keys[0]];
        const newRates = {};
        for (let y = startYear; y <= endYear; y++) {
            newRates[y] = firstVal;
        }
        setRates(newRates);
    };

    const handleSortOptimistic = () => {
        let currentRates = { ...rates };
        const values = Object.values(rates).map(parseFloat);

        // If all values are the same (variance is 0), generate random complexity first
        const isFlat = values.every(v => Math.abs(v - values[0]) < 0.1);
        if (isFlat) {
            currentRates = generateRandomRates();
        }

        const years = [];
        const sortedValues = [];
        for (let y = startYear; y <= endYear; y++) {
            years.push(y);
            sortedValues.push(currentRates[y] !== undefined ? parseFloat(currentRates[y]) : averageRate);
        }

        // Sort Descending
        sortedValues.sort((a, b) => b - a);

        const newRates = {};
        years.forEach((year, i) => {
            newRates[year] = sortedValues[i];
        });
        setRates(newRates);
    };

    const handleSortPessimistic = () => {
        let currentRates = { ...rates };
        const values = Object.values(rates).map(parseFloat);

        // If all values are the same (variance is 0), generate random complexity first
        const isFlat = values.every(v => Math.abs(v - values[0]) < 0.1);
        if (isFlat) {
            currentRates = generateRandomRates();
        }

        const years = [];
        const sortedValues = [];
        for (let y = startYear; y <= endYear; y++) {
            years.push(y);
            sortedValues.push(currentRates[y] !== undefined ? parseFloat(currentRates[y]) : averageRate);
        }

        // Sort Ascending
        sortedValues.sort((a, b) => a - b);

        const newRates = {};
        years.forEach((year, i) => {
            newRates[year] = sortedValues[i];
        });
        setRates(newRates);
    };

    const handleShuffle = () => {
        let values = Object.values(rates).map(parseFloat);

        // If all values are the same (variance is 0), generate random complexity first
        // Otherwise a shuffle does nothing visible
        const isFlat = values.every(v => Math.abs(v - values[0]) < 0.1);
        if (isFlat) {
            handleRandomize();
            return;
        }

        // True Fisher-Yates Shuffle (Permutation)
        // Keeps the exact same set of numbers, just changes order.
        // This ensures Best/Worst case bounds remain identical.
        for (let i = values.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [values[i], values[j]] = [values[j], values[i]];
        }

        const years = [];
        for (let y = startYear; y <= endYear; y++) {
            years.push(y);
        }

        const newRates = {};
        years.forEach((year, i) => {
            newRates[year] = values[i];
        });
        setRates(newRates);
    };



    const handleSave = () => {
        onSave(rates);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4" onClick={onClose}>
            <div
                className={`rounded-2xl w-full max-w-sm h-[700px] shadow-xl flex flex-col relative overflow-hidden ${isLight ? 'bg-white border border-gray-200' : 'border border-white/30'}`}
                onClick={e => e.stopPropagation()}
                dir={language === 'he' ? 'rtl' : 'ltr'}
            >
                {!isLight && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                        <div className="absolute inset-0 bg-white/10" />
                    </>
                )}

                {/* Header */}
                <div className="relative z-10 flex-none flex items-center justify-between p-4 border-b border-gray-200 dark:border-white/10">
                    <h3 className={`text-lg font-semibold ${classes.headerLabel}`}>
                        {language === 'he' ? 'תשואות משתנות' : 'Variable Returns'}
                    </h3>
                    <button onClick={onClose} className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 ${classes.icon}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Actions Toolbar */}
                <div className="relative z-10 flex-none p-2 border-b border-gray-200 dark:border-white/10 flex gap-2 justify-center bg-white/5">
                    <button
                        onClick={handleRandomize}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isLight ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'}`}
                        title={language === 'he' ? 'צור אקראיות' : 'Randomize'}
                    >
                        <Dices size={14} />
                        {language === 'he' ? 'אקראי' : 'Random'}
                    </button>
                    <button
                        onClick={handleReset}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isLight ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                        title={language === 'he' ? 'אפס לממוצע' : 'Reset'}
                    >
                        <RotateCcw size={14} />
                        {language === 'he' ? 'אפס' : 'Reset'}
                    </button>
                    <button
                        onClick={handleFillDown}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isLight ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'}`}
                        title={language === 'he' ? 'החל על כולם' : 'Fill Down'}
                    >
                        <ArrowDown size={14} />
                        {language === 'he' ? 'החל' : 'Fill'}
                    </button>
                </div>

                {/* Sequence Analysis Toolbar (New) */}
                <div className="relative z-10 flex-none p-2 border-b border-gray-200 dark:border-white/10 flex gap-2 justify-center bg-white/5">
                    <button
                        onClick={handleSortOptimistic}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isLight ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'}`}
                        title={language === 'he' ? 'מיין: מהטוב לגרוע' : 'Sort: Best First'}
                    >
                        <TrendingUp size={14} />
                        {language === 'he' ? 'אופטימי' : 'Optimistic'}
                    </button>
                    <button
                        onClick={handleSortPessimistic}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isLight ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'}`}
                        title={language === 'he' ? 'מיין: מהגרוע לטוב' : 'Sort: Worst First'}
                    >
                        <TrendingDown size={14} />
                        {language === 'he' ? 'פסימי' : 'Pessimistic'}
                    </button>
                    <button
                        onClick={handleShuffle}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isLight ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'}`}
                        title={language === 'he' ? 'ערבב סדר קיים' : 'Shuffle Order'}
                    >
                        <Shuffle size={14} />
                        {language === 'he' ? 'ערבב' : 'Shuffle'}
                    </button>
                </div>

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
                            return (
                                <div key={year} className="flex items-center gap-2">
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
                                            <span className={`text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-full mt-0.5 ${isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'}`}>
                                                {language === 'he' ? 'פרישה' : 'Start'}
                                            </span>
                                        )}
                                        {year === startYear && getMonthName(year) && (
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
