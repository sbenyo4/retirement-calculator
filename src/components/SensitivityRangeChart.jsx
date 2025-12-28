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
    const [parameterType, setParameterType] = useState(PARAMETER_TYPES.INTEREST);

    // Get config for current parameter
    const config = PARAMETER_CONFIG[parameterType];

    // Dynamic range based on current input value
    const currentValue = parseFloat(inputs[config.inputKey]) || config.defaultRange[0];

    // State for range controls
    const [rangeMin, setRangeMin] = useState(() => {
        if (parameterType === PARAMETER_TYPES.INTEREST) {
            return Math.max(config.min, currentValue - 4);
        }
        return config.defaultRange[0];
    });
    const [rangeMax, setRangeMax] = useState(() => {
        if (parameterType === PARAMETER_TYPES.INTEREST) {
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

        if (newType === PARAMETER_TYPES.INTEREST) {
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

    const parameterOptions = [
        { value: PARAMETER_TYPES.INTEREST, label: t('interestRate') || 'Interest Rate' },
        { value: PARAMETER_TYPES.INCOME, label: t('monthlyIncome') || 'Monthly Income' },
        { value: PARAMETER_TYPES.RETIREMENT_AGE, label: t('retirementAge') || 'Retirement Age' }
    ];

    if (!isOpen) return null;

    // Theme-aware classes
    // Theme-aware classes
    const modalBg = theme === 'light' ? 'bg-white' : 'bg-slate-900';
    const borderColor = theme === 'light' ? 'border-gray-200' : 'border-white/20';
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
            <div className={`relative ${modalBg} border ${borderColor} rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto`}>
                {/* Header */}
                <div className={`flex items-center justify-between p-4 border-b ${headerBorder}`}>
                    <h2 className={`text-lg font-semibold ${titleColor} flex items-center gap-2`}>
                        📊 {t('sensitivityRangeChart') || 'Sensitivity Range Chart'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-black/10 rounded-lg transition-colors"
                    >
                        <X size={20} className={theme === 'light' ? 'text-gray-600' : 'text-gray-400'} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
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
                                    parameterType === PARAMETER_TYPES.INTEREST ? [
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
