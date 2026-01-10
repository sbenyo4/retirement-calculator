import React, { useState, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { calculateRetirementProjection } from '../utils/calculator';
import { X } from 'lucide-react';
import { CustomSelect } from './common/CustomSelect';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

const PARAMETER_TYPES = {
    INTEREST: 'interest',
    ACCUMULATION_RATE: 'accumulationRate',
    SAFE_RATE: 'safeRate',
    SURPLUS_RATE: 'surplusRate',
    INCOME: 'income',
    RETIREMENT_AGE: 'retirementAge'
};

const PARAMETER_CONFIG = {
    [PARAMETER_TYPES.INTEREST]: {
        min: 1,
        max: 12,
        step: 1,
        defaultRange: [2, 10],
        inputKey: 'annualReturnRate',
        format: (v) => `${v}%`,
        unit: '%'
    },
    [PARAMETER_TYPES.ACCUMULATION_RATE]: {
        min: 1,
        max: 12,
        step: 1,
        defaultRange: [2, 10],
        inputKey: 'annualReturnRate',
        format: (v) => `${v}%`,
        unit: '%'
    },
    [PARAMETER_TYPES.SAFE_RATE]: {
        min: 0,
        max: 10,
        step: 0.5,
        defaultRange: [1, 6],
        inputKey: 'bucketSafeRate',
        format: (v) => `${v}%`,
        unit: '%'
    },
    [PARAMETER_TYPES.SURPLUS_RATE]: {
        min: 0,
        max: 15,
        step: 1,
        defaultRange: [3, 10],
        inputKey: 'bucketSurplusRate',
        format: (v) => `${v}%`,
        unit: '%'
    },
    [PARAMETER_TYPES.INCOME]: {
        min: 1000,
        max: 50000,
        step: 1000,
        defaultRange: [5000, 25000],
        inputKey: 'monthlyNetIncomeDesired',
        format: (v, lang) => lang === 'he' ? `${v.toLocaleString()}₪` : `$${v.toLocaleString()}`,
        unit: ''
    },
    [PARAMETER_TYPES.RETIREMENT_AGE]: {
        min: 45,
        max: 75,
        step: 1,
        defaultRange: [50, 67],
        inputKey: 'retirementStartAge',
        format: (v) => `${v}`,
        unit: ''
    }
};

// Format number with proper decimals (e.g., 3.2M, 0.25M, 500k)
function formatCompactNumber(value) {
    const absValue = Math.abs(value);
    if (absValue >= 1000000) {
        const millions = value / 1000000;
        // Use 2 decimals for small millions (< 10), 1 decimal otherwise
        const decimals = absValue < 10000000 ? 2 : 1;
        return millions.toFixed(decimals) + 'M';
    }
    if (absValue >= 1000) {
        const thousands = value / 1000;
        const decimals = absValue < 100000 ? 1 : 0;
        return thousands.toFixed(decimals) + 'k';
    }
    return value.toFixed(0);
}

// Button to open the modal
export function SensitivityRangeButton({ onClick, t }) {
    return (
        <button
            onClick={onClick}
            title={t('sensitivityRangeBtn') || 'Range'}
            className="px-2 md:px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1 md:gap-1.5 shadow-lg"
        >
            <span>📊</span>
            <span className="hidden md:inline">{t('sensitivityRangeBtn') || 'Range'}</span>
        </button>
    );
}

// Modal component
export function SensitivityRangeModal({ isOpen, onClose, inputs, t, language }) {
    const { theme } = useTheme();
    const [parameterType, setParameterType] = useState(() => {
        // Default to Interest (or Accumulation if buckets enabled)
        return inputs.enableBuckets ? PARAMETER_TYPES.ACCUMULATION_RATE : PARAMETER_TYPES.INTEREST;
    });

    // Reset parameter type if buckets toggle changes while open
    React.useEffect(() => {
        if (inputs.enableBuckets && parameterType === PARAMETER_TYPES.INTEREST) {
            setParameterType(PARAMETER_TYPES.ACCUMULATION_RATE);
        } else if (!inputs.enableBuckets && [PARAMETER_TYPES.ACCUMULATION_RATE, PARAMETER_TYPES.SAFE_RATE, PARAMETER_TYPES.SURPLUS_RATE].includes(parameterType)) {
            setParameterType(PARAMETER_TYPES.INTEREST);
        }
    }, [inputs.enableBuckets]);

    // Get config for current parameter
    const config = PARAMETER_CONFIG[parameterType];

    // Dynamic range based on current input value
    const currentValue = parseFloat(inputs[config.inputKey]) || config.defaultRange[0];

    // State for range controls
    const [rangeMin, setRangeMin] = useState(() => {
        if ([PARAMETER_TYPES.INTEREST, PARAMETER_TYPES.ACCUMULATION_RATE, PARAMETER_TYPES.SAFE_RATE, PARAMETER_TYPES.SURPLUS_RATE].includes(parameterType)) {
            return Math.max(config.min, currentValue - 4);
        }
        return config.defaultRange[0];
    });
    const [rangeMax, setRangeMax] = useState(() => {
        if ([PARAMETER_TYPES.INTEREST, PARAMETER_TYPES.ACCUMULATION_RATE, PARAMETER_TYPES.SAFE_RATE, PARAMETER_TYPES.SURPLUS_RATE].includes(parameterType)) {
            return Math.min(config.max, currentValue + 4);
        }
        return config.defaultRange[1];
    });
    const [stepSize, setStepSize] = useState(config.step);

    // Update range when parameter type changes
    const handleParameterChange = (newType) => {
        setParameterType(newType);
        const newConfig = PARAMETER_CONFIG[newType];
        const newCurrentValue = parseFloat(inputs[newConfig.inputKey]) || newConfig.defaultRange[0];

        if ([PARAMETER_TYPES.INTEREST, PARAMETER_TYPES.ACCUMULATION_RATE, PARAMETER_TYPES.SAFE_RATE, PARAMETER_TYPES.SURPLUS_RATE].includes(newType)) {
            setRangeMin(Math.max(newConfig.min, newCurrentValue - 4));
            setRangeMax(Math.min(newConfig.max, newCurrentValue + 4));
        } else if (newType === PARAMETER_TYPES.INCOME) {
            setRangeMin(Math.max(newConfig.min, newCurrentValue - 5000));
            setRangeMax(Math.min(newConfig.max, newCurrentValue + 5000));
        } else {
            setRangeMin(Math.max(newConfig.min, newCurrentValue - 5));
            setRangeMax(Math.min(newConfig.max, newCurrentValue + 5));
        }
        setStepSize(newConfig.step);
    };

    // Calculate results for each value in range
    const rangeResults = useMemo(() => {
        const results = [];

        // Validation: Verify basic age constraints before looping
        // This prevents console spam/crashes when user is modifying age inputs
        const currentAge = parseFloat(inputs.currentAge);
        const retirementStartAge = parseFloat(inputs.retirementStartAge);
        const retirementEndAge = parseFloat(inputs.retirementEndAge);

        if (isNaN(currentAge) || isNaN(retirementStartAge) || isNaN(retirementEndAge) ||
            currentAge < 0 || retirementStartAge <= currentAge || retirementEndAge <= retirementStartAge) {
            return results; // Return empty results if basic logic is violated
        }

        const effectiveMin = Math.max(config.min, rangeMin);
        const effectiveMax = Math.min(config.max, rangeMax);

        for (let value = effectiveMin; value <= effectiveMax; value += stepSize) {
            const modifiedInputs = {
                ...inputs,
                [config.inputKey]: value
            };

            // For retirement age, ensure it's valid
            if (parameterType === PARAMETER_TYPES.RETIREMENT_AGE) {
                const currentAge = parseFloat(inputs.currentAge);
                if (value <= currentAge) continue;
            }

            try {
                const result = calculateRetirementProjection(modifiedInputs, t);
                results.push({
                    value,
                    label: config.format(value, language),
                    balanceAtEnd: result.balanceAtEnd,
                    surplus: result.surplus,
                    isCurrent: Math.abs(value - currentValue) < stepSize / 2
                });
            } catch (e) {
                console.error('Error calculating for value:', value, e);
            }
        }

        return results;
    }, [inputs, rangeMin, rangeMax, stepSize, parameterType, config, currentValue, language]);

    // Calculate "Most Impactful Bucket Rate" (Impactful Rate)
    // Only strictly relevant when Buckets are ENABLED, as a specific "Bucket/Rate" insight.
    const impactfulRate = useMemo(() => {
        if (!inputs.enableBuckets) return null;

        try {
            const baseResult = calculateRetirementProjection(inputs);
            const baseBalance = baseResult.balanceAtEnd;

            // Determine steps for each
            const accumStep = (parameterType === PARAMETER_TYPES.ACCUMULATION_RATE) ? stepSize : 1;
            const safeStep = (parameterType === PARAMETER_TYPES.SAFE_RATE) ? stepSize : 1;
            const surplusStep = (parameterType === PARAMETER_TYPES.SURPLUS_RATE) ? stepSize : 1;

            // check Accumulation
            const accumInputs = { ...inputs, annualReturnRate: (parseFloat(inputs.annualReturnRate) || 0) + accumStep };
            const accumResult = calculateRetirementProjection(accumInputs);
            const accumDiff = Math.abs(accumResult.balanceAtEnd - baseBalance);

            // check Safe Rate
            const safeInputs = { ...inputs, bucketSafeRate: (parseFloat(inputs.bucketSafeRate) || 0) + safeStep };
            const safeResult = calculateRetirementProjection(safeInputs);
            const safeDiff = Math.abs(safeResult.balanceAtEnd - baseBalance);

            // check Surplus Rate
            const surplusInputs = { ...inputs, bucketSurplusRate: (parseFloat(inputs.bucketSurplusRate) || 0) + surplusStep };
            const surplusResult = calculateRetirementProjection(surplusInputs);
            const surplusDiff = Math.abs(surplusResult.balanceAtEnd - baseBalance);

            // Find winner
            let winnerLabel = t('accumulationRate') || 'Accumulation Rate';
            let maxDiff = accumDiff;
            let stepLabel = `${accumStep}%`;

            if (safeDiff > maxDiff) {
                maxDiff = safeDiff;
                winnerLabel = t('safeRate') || 'Safe Rate';
                stepLabel = `${safeStep}%`;
            }
            if (surplusDiff > maxDiff) {
                maxDiff = surplusDiff;
                winnerLabel = t('surplusRate') || 'Surplus Rate';
                stepLabel = `${surplusStep}%`;
            }

            return { label: winnerLabel, diff: maxDiff, step: stepLabel };
        } catch (e) {
            return null;
        }
    }, [inputs, t, stepSize, parameterType]);

    // Calculate "Most Impactful Global Factor"
    // Compares: Rates (Int/Acc/Safe/Surp) vs Income vs Age
    // Normalizes "Impact": 
    // Rates: +1%
    // Income: +1000 
    // Age: +1 Year
    const impactfulGlobalFactor = useMemo(() => {
        try {
            const baseResult = calculateRetirementProjection(inputs);
            const baseBalance = baseResult.balanceAtEnd;
            let maxDiff = -1;
            let winnerLabel = null;
            let winnerStep = null;

            // Define candidates based on mode
            const candidates = [];

            // 1. Rates
            if (inputs.enableBuckets) {
                candidates.push({ key: 'annualReturnRate', type: 'rate', label: t('accumulationRate') || 'Accumulation Rate' });
                candidates.push({ key: 'bucketSafeRate', type: 'rate', label: t('safeRate') || 'Safe Rate' });
                candidates.push({ key: 'bucketSurplusRate', type: 'rate', label: t('surplusRate') || 'Surplus Rate' });
            } else {
                candidates.push({ key: 'annualReturnRate', type: 'rate', label: t('interestRate') || 'Interest Rate' });
            }

            // 2. Income
            candidates.push({ key: 'monthlyNetIncomeDesired', type: 'income', label: t('monthlyIncome') || 'Monthly Income' });

            // 3. Age
            candidates.push({ key: 'retirementStartAge', type: 'age', label: t('retirementAge') || 'Retirement Age' });


            // Calculate Impact
            candidates.forEach(cand => {
                let modifiedInputs = { ...inputs };
                let currentVal = parseFloat(inputs[cand.key]) || 0;

                // Determine Step Size
                let thisStep = 0;
                let thisStepLabel = '';

                // Check if this is the currently viewed parameter
                const isCurrent = (
                    (cand.key === 'annualReturnRate' && (parameterType === PARAMETER_TYPES.INTEREST || parameterType === PARAMETER_TYPES.ACCUMULATION_RATE)) ||
                    (cand.key === 'bucketSafeRate' && parameterType === PARAMETER_TYPES.SAFE_RATE) ||
                    (cand.key === 'bucketSurplusRate' && parameterType === PARAMETER_TYPES.SURPLUS_RATE) ||
                    (cand.key === 'monthlyNetIncomeDesired' && parameterType === PARAMETER_TYPES.INCOME) ||
                    (cand.key === 'retirementStartAge' && parameterType === PARAMETER_TYPES.RETIREMENT_AGE)
                );

                if (isCurrent) {
                    thisStep = stepSize;
                } else {
                    // Default steps
                    if (cand.type === 'rate') thisStep = 1;
                    else if (cand.type === 'income') thisStep = 1000;
                    else if (cand.type === 'age') thisStep = 1;
                }

                // Format Step Label
                if (cand.type === 'rate') {
                    thisStepLabel = `${thisStep}%`;
                } else if (cand.type === 'income') {
                    thisStepLabel = `${thisStep}`;
                } else if (cand.type === 'age') {
                    const unit = thisStep === 1 ? (t('year') || 'Year') : (t('years') || 'Years');
                    thisStepLabel = `${thisStep} ${unit}`;
                }

                // Calculate Diff
                modifiedInputs[cand.key] = currentVal + thisStep;
                const res = calculateRetirementProjection(modifiedInputs);
                const diff = Math.abs(res.balanceAtEnd - baseBalance);

                if (diff > maxDiff) {
                    maxDiff = diff;
                    winnerLabel = cand.label;
                    winnerStep = thisStepLabel;
                }
            });

            return winnerLabel ? { label: winnerLabel, diff: maxDiff, step: winnerStep } : null;

        } catch (e) {
            console.error(e);
            return null;
        }
    }, [inputs, t, stepSize, parameterType]);

    // Chart data
    const chartData = useMemo(() => {
        return {
            labels: rangeResults.map(r => r.label),
            datasets: [{
                label: t('balanceAtEndShort') || 'End Balance',
                data: rangeResults.map(r => r.balanceAtEnd),
                backgroundColor: rangeResults.map(r =>
                    r.isCurrent
                        ? 'rgba(250, 204, 21, 0.8)' // Yellow for current
                        : r.balanceAtEnd >= 0
                            ? 'rgba(52, 211, 153, 0.7)' // Green
                            : 'rgba(248, 113, 113, 0.7)' // Red
                ),
                borderColor: rangeResults.map(r =>
                    r.isCurrent
                        ? 'rgb(250, 204, 21)'
                        : r.balanceAtEnd >= 0
                            ? 'rgb(52, 211, 153)'
                            : 'rgb(248, 113, 113)'
                ),
                borderWidth: rangeResults.map(r => r.isCurrent ? 3 : 1),
                borderRadius: 4,
            }]
        };
    }, [rangeResults, t]);

    // Chart options
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: {
                top: 25  // Space for labels above bars
            }
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        const value = context.parsed.y;
                        const formatted = new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
                            style: 'currency',
                            currency: language === 'he' ? 'ILS' : 'USD',
                            maximumFractionDigits: 0
                        }).format(value);
                        return `${t('balanceAtEndShort') || 'End Balance'}: ${formatted}`;
                    },
                    title: (items) => {
                        const idx = items[0].dataIndex;
                        const result = rangeResults[idx];
                        if (result?.isCurrent) {
                            return `${items[0].label} (${t('currentValue') || 'Current'})`;
                        }
                        return items[0].label;
                    }
                }
            },
            datalabels: {
                anchor: 'end',
                align: 'top',
                offset: 6,
                clip: false,
                textAlign: 'center',
                color: theme === 'light' ? '#1f2937' : '#f3f4f6',  // Dark in light mode, light in dark mode
                font: {
                    size: 10,
                    weight: '700'
                },
                formatter: (value) => formatCompactNumber(value)
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    color: '#9ca3af',
                    maxRotation: 45,
                    minRotation: 0
                }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: {
                    color: '#9ca3af',
                    callback: (val) => formatCompactNumber(val)
                }
            }
        }
    };

    const parameterOptions = inputs.enableBuckets ? [
        { value: PARAMETER_TYPES.ACCUMULATION_RATE, label: t('accumulationRate') || 'Accumulation Rate' },
        { value: PARAMETER_TYPES.SAFE_RATE, label: t('safeRate') || 'Safe Rate' },
        { value: PARAMETER_TYPES.SURPLUS_RATE, label: t('surplusRate') || 'Surplus Rate' },
        { value: PARAMETER_TYPES.INCOME, label: t('monthlyIncome') || 'Monthly Income' },
        { value: PARAMETER_TYPES.RETIREMENT_AGE, label: t('retirementAge') || 'Retirement Age' }
    ] : [
        { value: PARAMETER_TYPES.INTEREST, label: t('interestRate') || 'Interest Rate' },
        { value: PARAMETER_TYPES.INCOME, label: t('monthlyIncome') || 'Monthly Income' },
        { value: PARAMETER_TYPES.RETIREMENT_AGE, label: t('retirementAge') || 'Retirement Age' }
    ];

    if (!isOpen) return null;

    // Theme-aware classes
    // Theme-aware classes
    const modalBg = theme === 'light' ? 'bg-white' : '';
    const borderColor = theme === 'light' ? 'border-gray-200' : 'border-white/30';
    const headerBorder = theme === 'light' ? 'border-gray-200' : 'border-white/10';
    const titleColor = theme === 'light' ? 'text-gray-900' : 'text-white';
    const labelColor = theme === 'light' ? 'text-gray-600' : 'text-gray-400';
    const inputBg = theme === 'light' ? 'bg-white' : 'bg-white/10';
    const inputBorder = theme === 'light' ? 'border-slate-400 shadow-sm' : 'border-white/20';
    const inputText = theme === 'light' ? 'text-gray-900' : 'text-white';
    const optionBg = theme === 'light' ? 'bg-white text-gray-900' : 'bg-slate-800 text-white';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 backdrop-blur-md bg-black/50"
                onClick={onClose}
            />

            {/* Modal */}
            <div className={`relative ${modalBg} border ${borderColor} rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden`}>
                {theme !== 'light' && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                        <div className="absolute inset-0 bg-white/10" />
                    </>
                )}
                {/* Header */}
                <div className={`flex items-center justify-between p-4 border-b ${headerBorder} relative z-10 shrink-0`}>
                    <div className="flex flex-col gap-1">
                        <h2 className={`text-lg font-semibold ${titleColor} flex items-center gap-2`}>
                            <span>📊</span>
                            <span>{t('sensitivityRangeChart') || 'Sensitivity Range Chart'}</span>
                        </h2>
                        {/* Insights Badges */}
                        <div className="flex gap-2">
                            {impactfulGlobalFactor && (
                                <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full border ${theme === 'light' ? 'bg-blue-100 border-blue-300 text-blue-900' : 'bg-blue-500/20 border-blue-400/50 text-blue-100'}`}>
                                    {t('mostImpactfulFactor') || 'Top Factor'}: <strong>{impactfulGlobalFactor.label} ({impactfulGlobalFactor.step} - {formatCompactNumber(impactfulGlobalFactor.diff)})</strong>
                                </span>
                            )}
                            {impactfulRate && inputs.enableBuckets && (
                                <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full border ${theme === 'light' ? 'bg-orange-100 border-orange-300 text-orange-900' : 'bg-orange-500/20 border-orange-400/50 text-orange-100'}`}>
                                    {t('mostImpactfulRate') || 'Top Rate'}: <strong>{impactfulRate.label} ({impactfulRate.step} - {formatCompactNumber(impactfulRate.diff)})</strong>
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-black/10 rounded-lg transition-colors"
                    >
                        <X size={20} className={theme === 'light' ? 'text-gray-600' : 'text-gray-400'} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4 overflow-y-auto flex-1 relative z-10">
                    {/* Controls Row */}
                    <div className="flex flex-wrap gap-4 items-end">
                        {/* Parameter Selector */}
                        <div className="flex-1 min-w-[150px]">
                            <label className={`block text-xs ${labelColor} mb-1`}>
                                {t('selectParameter') || 'Parameter'}
                            </label>
                            <CustomSelect
                                value={parameterType}
                                onChange={(val) => handleParameterChange(val)}
                                options={parameterOptions}
                                className="w-full"
                            />
                        </div>

                        {/* Range Min */}
                        <div className="w-24">
                            <label className={`block text-xs ${labelColor} mb-1`}>
                                {t('rangeMin') || 'Min'}
                            </label>
                            <input
                                type="number"
                                value={rangeMin}
                                onChange={(e) => setRangeMin(Math.max(config.min, parseFloat(e.target.value) || config.min))}
                                min={config.min}
                                max={rangeMax - stepSize}
                                step={stepSize}
                                className={`w-full px-3 py-2 ${inputBg} border ${inputBorder} rounded-lg ${inputText} text-sm focus:outline-none focus:border-blue-500`}
                            />
                        </div>

                        {/* Range Max */}
                        <div className="w-24">
                            <label className={`block text-xs ${labelColor} mb-1`}>
                                {t('rangeMax') || 'Max'}
                            </label>
                            <input
                                type="number"
                                value={rangeMax}
                                onChange={(e) => setRangeMax(Math.min(config.max, parseFloat(e.target.value) || config.max))}
                                min={rangeMin + stepSize}
                                max={config.max}
                                step={stepSize}
                                className={`w-full px-3 py-2 ${inputBg} border ${inputBorder} rounded-lg ${inputText} text-sm focus:outline-none focus:border-blue-500`}
                            />
                        </div>

                        {/* Step Size */}
                        <div className="w-24">
                            <label className={`block text-xs ${labelColor} mb-1`}>
                                {t('step') || 'Step'}
                            </label>
                            <CustomSelect
                                value={stepSize}
                                onChange={(val) => setStepSize(parseFloat(val))}
                                options={
                                    [PARAMETER_TYPES.INTEREST, PARAMETER_TYPES.ACCUMULATION_RATE, PARAMETER_TYPES.SAFE_RATE, PARAMETER_TYPES.SURPLUS_RATE].includes(parameterType) ? [
                                        { value: 0.5, label: "0.5%" },
                                        { value: 1, label: "1%" },
                                        { value: 2, label: "2%" }
                                    ] : parameterType === PARAMETER_TYPES.INCOME ? [
                                        { value: 500, label: "500" },
                                        { value: 1000, label: "1,000" },
                                        { value: 2000, label: "2,000" },
                                        { value: 5000, label: "5,000" }
                                    ] : [
                                        { value: 1, label: `1 ${t('year') || 'year'}` },
                                        { value: 2, label: `2 ${t('years') || 'years'}` },
                                        { value: 5, label: `5 ${t('years') || 'years'}` }
                                    ]
                                }
                                className="w-full"
                            />
                        </div>
                    </div>

                    {/* Current Value Indicator */}
                    <div className={`flex items-center gap-2 text-xs ${labelColor}`}>
                        <span className="w-3 h-3 bg-yellow-400 rounded-sm"></span>
                        <span>{t('currentValue') || 'Current Value'}: {config.format(currentValue, language)}</span>
                    </div>

                    {/* Chart */}
                    <div className="h-72">
                        <Bar data={chartData} options={options} plugins={[ChartDataLabels]} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Legacy component for backward compatibility (now just a wrapper)
export function SensitivityRangeChart({ inputs, t, language }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <div className="bg-white/5 rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">
                        {t('sensitivityRangeChart') || 'Sensitivity Range Chart'}
                    </span>
                    <SensitivityRangeButton onClick={() => setIsOpen(true)} t={t} />
                </div>
            </div>
            <SensitivityRangeModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                inputs={inputs}
                t={t}
                language={language}
            />
        </>
    );
}
