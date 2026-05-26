import React, { useState, useMemo, useRef, useCallback } from 'react';
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
import { applyChartScenarioInput, calculateChartScenarioProjection } from '../utils/chartScenarioInputs';
import { findGoalSeekResultForTargetEndBalance } from '../utils/calculators/goalSeek';
import { X, Sparkles, Loader2, ChevronDown, ChevronUp, AlertCircle, WifiOff, KeyRound, CreditCard, FileX } from 'lucide-react';
import { CustomSelect } from './common/CustomSelect';
import { getRangeAIInsights, getGlobalRangeAIInsights, classifyAiError } from '../utils/ai-insights';

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
    RETIREMENT_AGE: 'retirementAge',
    INFLATION: 'inflation',
    TARGET_END_BALANCE: 'targetEndBalance'
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
    },
    [PARAMETER_TYPES.INFLATION]: {
        min: 0,
        max: 8,
        step: 0.5,
        defaultRange: [0, 5],
        inputKey: 'inflationRate',
        format: (v) => `${v}%`,
        unit: '%'
    },
    [PARAMETER_TYPES.TARGET_END_BALANCE]: {
        min: 0,
        max: 8000000,
        step: 500000,
        defaultRange: [0, 8000000],
        inputKey: 'targetEndBalance',
        format: (v, lang) => lang === 'he' ? `${(v / 1000000).toFixed(1)}M₪` : `$${(v / 1000000).toFixed(1)}M`,
        unit: '',
        isInverse: true // This parameter shows withdrawal needed for target balance
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
export function SensitivityRangeModal({ isOpen, onClose, inputs, t, language, aiProvider, aiModel, apiKeyOverride }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const [aiInsights, setAiInsights] = useState({}); // keyed by parameterType
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [globalInsight, setGlobalInsight] = useState(null);
    const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
    const [globalError, setGlobalError] = useState(null);
    const [globalPanelVisible, setGlobalPanelVisible] = useState(false);
    const [aiPanelCollapsed, setAiPanelCollapsed] = useState(false);
    const [globalPanelCollapsed, setGlobalPanelCollapsed] = useState(false);
    const aiAbortRef = useRef(null);
    const globalAbortRef = useRef(null);
    const aiCacheRef = useRef({}); // keyed by parameterType
    const globalCacheRef = useRef(null);
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
    }, [inputs.enableBuckets, parameterType]);

    // Lock background scroll when modal is open
    React.useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = ''; };
        }
    }, [isOpen]);

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

        if ([PARAMETER_TYPES.INTEREST, PARAMETER_TYPES.ACCUMULATION_RATE, PARAMETER_TYPES.SAFE_RATE, PARAMETER_TYPES.SURPLUS_RATE, PARAMETER_TYPES.INFLATION].includes(newType)) {
            setRangeMin(Math.max(newConfig.min, newCurrentValue - 4));
            setRangeMax(Math.min(newConfig.max, newCurrentValue + 4));
        } else if (newType === PARAMETER_TYPES.INCOME) {
            setRangeMin(Math.max(newConfig.min, newCurrentValue - 5000));
            setRangeMax(Math.min(newConfig.max, newCurrentValue + 5000));
        } else if (newType === PARAMETER_TYPES.TARGET_END_BALANCE) {
            // For target end balance, use fixed range from 0 to 8M
            setRangeMin(0);
            setRangeMax(8000000);
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

        // Special handling for TARGET_END_BALANCE - find withdrawal needed for each target
        if (parameterType === PARAMETER_TYPES.TARGET_END_BALANCE) {
            for (let targetBalance = effectiveMin; targetBalance <= effectiveMax; targetBalance += stepSize) {
                const seekResult = findGoalSeekResultForTargetEndBalance(inputs, targetBalance);
                const requiredWithdrawal = seekResult?.effectiveWithdrawal ?? 0;
                const userTarget = parseFloat(inputs.targetEndBalance);
                const hasTarget = !isNaN(userTarget) && inputs.targetEndBalance !== '';
                const isCurrentTarget = hasTarget && Math.abs(targetBalance - userTarget) < stepSize / 2;

                results.push({
                    value: targetBalance,
                    label: config.format(targetBalance, language),
                    balanceAtEnd: requiredWithdrawal ?? 0, // Store withdrawal in balanceAtEnd for chart display
                    withdrawal: requiredWithdrawal ?? 0,
                    surplus: 0,
                    isCurrent: isCurrentTarget
                });
            }
            return results;
        }

        // Standard parameter handling
        for (let value = effectiveMin; value <= effectiveMax; value += stepSize) {
            const modifiedInputs = applyChartScenarioInput(inputs, config.inputKey, value);

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
    }, [inputs, rangeMin, rangeMax, stepSize, parameterType, config, currentValue, language, t]);

    // Helper to calculate Average Impact over the FULL VALID RANGE
    // This answers: "On average, how much does the balance change per 1 unit step across the whole likely range?"
    const calculateAverageImpact = (baseInputs, key, configKey, customStep = null) => {
        const conf = PARAMETER_CONFIG[configKey];
        if (!conf) return 0;

        let totalDiff = 0;
        let count = 0;
        const step = customStep || conf.step;

        // Define Range: Use defaultRange to be representative
        // This addresses user request to calculate "Average according to min/max"
        let start = conf.defaultRange[0];
        let end = conf.defaultRange[1];

        // Validations for Age
        if (configKey === PARAMETER_TYPES.RETIREMENT_AGE) {
            const currentAge = parseFloat(baseInputs.currentAge) || 0;
            // Can't start retirement before current age
            if (start <= currentAge) start = Math.ceil(currentAge + 1);
            // Ensure we have at least some range to test
            if (end <= start) end = start + 5;
        }

        // Loop through range from Start to End
        for (let val = start; val < end; val += step) {
            const val1 = val;
            const val2 = val + step;

            // Skip invalid ages (redundant check but safe)
            if (configKey === PARAMETER_TYPES.RETIREMENT_AGE) {
                const curAge = parseFloat(baseInputs.currentAge) || 0;
                if (val1 <= curAge) continue;
            }

            try {
                const res1 = calculateChartScenarioProjection(baseInputs, key, val1);
                const res2 = calculateChartScenarioProjection(baseInputs, key, val2);
                totalDiff += Math.abs(res1.balanceAtEnd - res2.balanceAtEnd);
                count++;
            } catch {
                // Ignore
            }
        }

        return count > 0 ? (totalDiff / count) : 0;
    };

    // Calculate "Most Impactful Bucket Rate" (Impactful Rate)
    const impactfulRate = useMemo(() => {
        if (!inputs.enableBuckets) return null;

        try {
            const accumDiff = calculateAverageImpact(inputs, 'annualReturnRate', PARAMETER_TYPES.ACCUMULATION_RATE);
            const safeDiff = calculateAverageImpact(inputs, 'bucketSafeRate', PARAMETER_TYPES.SAFE_RATE);
            const surplusDiff = calculateAverageImpact(inputs, 'bucketSurplusRate', PARAMETER_TYPES.SURPLUS_RATE);

            // Find winner
            let winnerLabel = t('accumulationRate') || 'Accumulation Rate';
            let maxDiff = accumDiff;
            let stepLabel = `${PARAMETER_CONFIG[PARAMETER_TYPES.ACCUMULATION_RATE].step}%`;

            if (safeDiff > maxDiff) {
                maxDiff = safeDiff;
                winnerLabel = t('safeRate') || 'Safe Rate';
                stepLabel = `${PARAMETER_CONFIG[PARAMETER_TYPES.SAFE_RATE].step}%`;
            }
            if (surplusDiff > maxDiff) {
                maxDiff = surplusDiff;
                winnerLabel = t('surplusRate') || 'Surplus Rate';
                stepLabel = `${PARAMETER_CONFIG[PARAMETER_TYPES.SURPLUS_RATE].step}%`;
            }

            return { label: winnerLabel, diff: maxDiff, step: stepLabel };
        } catch {
            return null;
        }
    }, [inputs, t]);

    // Calculate "Most Impactful Global Factor"
    const impactfulGlobalFactor = useMemo(() => {
        try {
            let maxDiff = -1;
            let winnerLabel = null;
            let winnerStep = null;

            // Define candidates
            const candidates = [];

            // 1. Rates
            if (inputs.enableBuckets) {
                candidates.push({ key: 'annualReturnRate', configKey: PARAMETER_TYPES.ACCUMULATION_RATE, label: t('accumulationRate') || 'Accumulation Rate' });
                candidates.push({ key: 'bucketSafeRate', configKey: PARAMETER_TYPES.SAFE_RATE, label: t('safeRate') || 'Safe Rate' });
                candidates.push({ key: 'bucketSurplusRate', configKey: PARAMETER_TYPES.SURPLUS_RATE, label: t('surplusRate') || 'Surplus Rate' });
            } else {
                candidates.push({ key: 'annualReturnRate', configKey: PARAMETER_TYPES.INTEREST, label: t('interestRate') || 'Interest Rate' });
            }

            // 2. Income
            candidates.push({ key: 'monthlyNetIncomeDesired', configKey: PARAMETER_TYPES.INCOME, label: t('monthlyIncome') || 'Monthly Income' });

            // 3. Age
            candidates.push({ key: 'retirementStartAge', configKey: PARAMETER_TYPES.RETIREMENT_AGE, label: t('retirementAge') || 'Retirement Age' });

            // 4. Inflation
            candidates.push({ key: 'inflationRate', configKey: PARAMETER_TYPES.INFLATION, label: t('inflationRate') || 'Inflation Rate' });


            // Calculate Impact
            candidates.forEach(cand => {
                const conf = PARAMETER_CONFIG[cand.configKey];
                // Always use default step for fair comparison
                const step = conf.step;

                // Format Step Label
                let thisStepLabel = '';
                if (cand.configKey === PARAMETER_TYPES.INCOME) {
                    thisStepLabel = `${step.toLocaleString()}`; // e.g. "1,000"
                } else if (cand.configKey === PARAMETER_TYPES.RETIREMENT_AGE) {
                    const unit = step === 1 ? (t('year') || 'Year') : (t('years') || 'Years');
                    thisStepLabel = `${step} ${unit}`;
                } else {
                    thisStepLabel = `${step}%`;
                }

                // Calculate Average Global Impact (always use default step for fair comparison)
                const avgDiff = calculateAverageImpact(inputs, cand.key, cand.configKey);

                if (avgDiff > maxDiff) {
                    maxDiff = avgDiff;
                    winnerLabel = cand.label;
                    winnerStep = thisStepLabel;
                }
            });

            return winnerLabel ? { label: winnerLabel, diff: maxDiff, step: winnerStep } : null;

        } catch (e) {
            console.error(e);
            return null;
        }
    }, [inputs, t]);

    // Chart data
    const chartData = useMemo(() => {
        const isTargetBalance = parameterType === PARAMETER_TYPES.TARGET_END_BALANCE;
        const chartLabel = isTargetBalance
            ? (t('requiredWithdrawal') || 'Required Withdrawal')
            : (t('balanceAtEndShort') || 'End Balance');

        return {
            labels: rangeResults.map(r => r.label),
            datasets: [{
                label: chartLabel,
                data: rangeResults.map(r => r.balanceAtEnd),
                backgroundColor: rangeResults.map(r =>
                    r.isCurrent
                        ? 'rgba(250, 204, 21, 0.8)' // Yellow for current
                        : isTargetBalance
                            ? 'rgba(99, 102, 241, 0.7)' // Indigo for target balance mode
                            : r.balanceAtEnd >= 0
                                ? 'rgba(52, 211, 153, 0.7)' // Green
                                : 'rgba(248, 113, 113, 0.7)' // Red
                ),
                borderColor: rangeResults.map(r =>
                    r.isCurrent
                        ? 'rgb(250, 204, 21)'
                        : isTargetBalance
                            ? 'rgb(99, 102, 241)'
                            : r.balanceAtEnd >= 0
                                ? 'rgb(52, 211, 153)'
                                : 'rgb(248, 113, 113)'
                ),
                borderWidth: rangeResults.map(r => r.isCurrent ? 3 : 1),
                borderRadius: 4,
            }]
        };
    }, [rangeResults, t, parameterType]);

    // Calculate Average Change per Step
    const avgChange = useMemo(() => {
        if (!rangeResults || rangeResults.length < 2) return 0;

        let totalDiff = 0;
        let count = 0;

        for (let i = 1; i < rangeResults.length; i++) {
            const diff = Math.abs(rangeResults[i].balanceAtEnd - rangeResults[i - 1].balanceAtEnd);
            totalDiff += diff;
            count++;
        }

        const avgPerIndex = count > 0 ? totalDiff / count : 0;

        // For TARGET_END_BALANCE, show the average withdrawal change per step
        // For others, show the balance change per step
        return avgPerIndex;
    }, [rangeResults]);

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
                        const labelText = parameterType === PARAMETER_TYPES.TARGET_END_BALANCE
                            ? (t('requiredWithdrawal') || 'Required Withdrawal')
                            : (t('balanceAtEndShort') || 'End Balance');
                        return `${labelText}: ${formatted}`;
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
                color: (context) => {
                    const idx = context.dataIndex;
                    if (rangeResults[idx]?.isCurrent) return '#facc15'; // Yellow for current
                    return theme === 'light' ? '#1f2937' : '#f3f4f6';
                },
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
                    color: (context) => {
                        const idx = context.index;
                        if (rangeResults[idx]?.isCurrent) return '#facc15'; // Yellow for current
                        return '#9ca3af';
                    },
                    font: (context) => {
                        const idx = context.index;
                        if (rangeResults[idx]?.isCurrent) return { weight: '900' };
                        return {};
                    },
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
        { value: PARAMETER_TYPES.RETIREMENT_AGE, label: t('retirementAge') || 'Retirement Age' },
        { value: PARAMETER_TYPES.INFLATION, label: t('inflationRate') || 'Inflation Rate' },
        { value: PARAMETER_TYPES.TARGET_END_BALANCE, label: t('targetEndBalance') || 'Target End Balance' }
    ] : [
        { value: PARAMETER_TYPES.INTEREST, label: t('interestRate') || 'Interest Rate' },
        { value: PARAMETER_TYPES.INCOME, label: t('monthlyIncome') || 'Monthly Income' },
        { value: PARAMETER_TYPES.RETIREMENT_AGE, label: t('retirementAge') || 'Retirement Age' },
        { value: PARAMETER_TYPES.INFLATION, label: t('inflationRate') || 'Inflation Rate' },
        { value: PARAMETER_TYPES.TARGET_END_BALANCE, label: t('targetEndBalance') || 'Target End Balance' }
    ];

    const currentParamLabel = [...(inputs.enableBuckets ? [
        { value: PARAMETER_TYPES.ACCUMULATION_RATE, label: t('accumulationRate') || 'Accumulation Rate' },
        { value: PARAMETER_TYPES.SAFE_RATE, label: t('safeRate') || 'Safe Rate' },
        { value: PARAMETER_TYPES.SURPLUS_RATE, label: t('surplusRate') || 'Surplus Rate' },
    ] : [
        { value: PARAMETER_TYPES.INTEREST, label: t('interestRate') || 'Interest Rate' },
    ]), ...[
        { value: PARAMETER_TYPES.INCOME, label: t('monthlyIncome') || 'Monthly Income' },
        { value: PARAMETER_TYPES.RETIREMENT_AGE, label: t('retirementAge') || 'Retirement Age' },
        { value: PARAMETER_TYPES.INFLATION, label: t('inflationRate') || 'Inflation Rate' },
        { value: PARAMETER_TYPES.TARGET_END_BALANCE, label: t('targetEndBalance') || 'Target End Balance' },
    ]].find(o => o.value === parameterType)?.label || parameterType;

    // Current param's cached insight
    const currentInsight = aiInsights[parameterType] ?? null;

    // Auto-show/hide per-param panel when switching parameters
    React.useEffect(() => {
        setAiError(null);
    }, [parameterType]);

    const runAIAnalysis = useCallback(async () => {
        if (!aiProvider || isLoadingAI || rangeResults.length === 0) return;
        const cacheKey = JSON.stringify({ rangeResults, parameterType, aiProvider, aiModel });
        if (cacheKey === aiCacheRef.current[parameterType] && aiInsights[parameterType]) return;
        aiAbortRef.current?.abort();
        const controller = new AbortController();
        aiAbortRef.current = controller;
        setIsLoadingAI(true);
        setAiError(null);
        try {
            const result = await getRangeAIInsights(
                rangeResults, currentParamLabel, config.format(currentValue, language),
                aiProvider, aiModel, apiKeyOverride, language, { signal: controller.signal }
            );
            aiCacheRef.current[parameterType] = cacheKey;
            setAiInsights(prev => ({ ...prev, [parameterType]: result }));
        } catch (err) {
            if (err.name !== 'AbortError') setAiError(classifyAiError(err));
        } finally {
            setIsLoadingAI(false);
        }
    }, [aiProvider, aiModel, apiKeyOverride, rangeResults, parameterType, currentParamLabel, currentValue, config, language, isLoadingAI, aiInsights]);

    const runGlobalAnalysis = useCallback(async () => {
        if (!aiProvider || isLoadingGlobal) return;
        // Build summary data for each parameter type
        const allParamTypes = inputs.enableBuckets
            ? [PARAMETER_TYPES.ACCUMULATION_RATE, PARAMETER_TYPES.SAFE_RATE, PARAMETER_TYPES.SURPLUS_RATE, PARAMETER_TYPES.INCOME, PARAMETER_TYPES.RETIREMENT_AGE, PARAMETER_TYPES.INFLATION]
            : [PARAMETER_TYPES.INTEREST, PARAMETER_TYPES.INCOME, PARAMETER_TYPES.RETIREMENT_AGE, PARAMETER_TYPES.INFLATION];
        const allParamData = allParamTypes.map(pt => {
            const cfg = PARAMETER_CONFIG[pt];
            const curVal = parseFloat(inputs[cfg.inputKey]) || cfg.defaultRange[0];
            const results = [];
            const effectiveMin = cfg.defaultRange[0], effectiveMax = cfg.defaultRange[1];
            for (let v = effectiveMin; v <= effectiveMax; v += cfg.step) {
                try {
                    const r = calculateChartScenarioProjection(inputs, cfg.inputKey, v);
                    results.push({ value: v, label: cfg.format(v, language), balanceAtEnd: r.balanceAtEnd, isCurrent: Math.abs(v - curVal) < cfg.step / 2 });
                } catch { /* skip */ }
            }
            if (!results.length) return null;
            const positive = results.filter(r => r.balanceAtEnd >= 0);
            let breakEven = null;
            for (let i = 1; i < results.length; i++) {
                if (results[i - 1].balanceAtEnd < 0 && results[i].balanceAtEnd >= 0) { breakEven = results[i].label; break; }
            }
            const cur = results.find(r => r.isCurrent);
            const best = results.reduce((a, b) => b.balanceAtEnd > a.balanceAtEnd ? b : a, results[0]);
            const worst = results.reduce((a, b) => b.balanceAtEnd < a.balanceAtEnd ? b : a, results[0]);
            const paramLabels = { [PARAMETER_TYPES.INTEREST]: t('interestRate') || 'Interest Rate', [PARAMETER_TYPES.ACCUMULATION_RATE]: t('accumulationRate') || 'Accum. Rate', [PARAMETER_TYPES.SAFE_RATE]: t('safeRate') || 'Safe Rate', [PARAMETER_TYPES.SURPLUS_RATE]: t('surplusRate') || 'Surplus Rate', [PARAMETER_TYPES.INCOME]: t('monthlyIncome') || 'Monthly Income', [PARAMETER_TYPES.RETIREMENT_AGE]: t('retirementAge') || 'Retirement Age', [PARAMETER_TYPES.INFLATION]: t('inflationRate') || 'Inflation Rate' };
            return { label: paramLabels[pt] || pt, currentValue: cfg.format(curVal, language), currentBalance: cur?.balanceAtEnd ?? 0, breakEven, safeCount: positive.length, totalCount: results.length, bestBalance: best.balanceAtEnd, worstBalance: worst.balanceAtEnd };
        }).filter(Boolean);
        const cacheKey = JSON.stringify({ allParamData, aiProvider, aiModel });
        if (cacheKey === globalCacheRef.current && globalInsight) { setGlobalPanelVisible(true); return; }
        globalAbortRef.current?.abort();
        const controller = new AbortController();
        globalAbortRef.current = controller;
        setGlobalPanelVisible(true);
        setIsLoadingGlobal(true);
        setGlobalError(null);
        setGlobalInsight(null);
        try {
            const result = await getGlobalRangeAIInsights(allParamData, aiProvider, aiModel, apiKeyOverride, language, { signal: controller.signal });
            globalCacheRef.current = cacheKey;
            setGlobalInsight(result);
        } catch (err) {
            if (err.name !== 'AbortError') setGlobalError(classifyAiError(err));
        } finally {
            setIsLoadingGlobal(false);
        }
    }, [aiProvider, aiModel, apiKeyOverride, inputs, language, t, isLoadingGlobal, globalInsight]);

    if (!isOpen) return null;

    // Theme-aware classes
    const modalBg = theme === 'light' ? 'bg-white' : '';
    const borderColor = theme === 'light' ? 'border-gray-200' : 'border-white/30';
    const headerBorder = theme === 'light' ? 'border-gray-200' : 'border-white/10';
    const titleColor = theme === 'light' ? 'text-gray-900' : 'text-white';
    const labelColor = theme === 'light' ? 'text-gray-600' : 'text-gray-400';
    const inputBg = theme === 'light' ? 'bg-white' : 'bg-white/10';
    const inputBorder = theme === 'light' ? 'border-slate-400 shadow-sm' : 'border-white/20';
    const inputText = theme === 'light' ? 'text-gray-900' : 'text-white';
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
                <div className={`flex flex-col p-4 border-b ${headerBorder} relative z-10 shrink-0`}>
                    {/* Title row with buttons */}
                    <div className="flex items-center justify-between">
                        <h2 className={`text-lg font-semibold ${titleColor} flex items-center gap-2`}>
                            <span>📊</span>
                            <span>{t('sensitivityRangeChart') || 'Sensitivity Range Chart'}</span>
                        </h2>
                        <div className="flex items-center gap-2">
                            {aiProvider && (
                                <>
                                    <button
                                        onClick={runAIAnalysis}
                                        disabled={isLoadingAI || rangeResults.length === 0}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${isLoadingAI ? 'opacity-60 cursor-wait' : ''} ${isLight ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'}`}
                                        title={language === 'he' ? 'ניתוח AI לגרף הנוכחי' : 'AI analysis for current chart'}
                                    >
                                        {isLoadingAI ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                        <span>{language === 'he' ? 'ניתוח' : 'Analyze'}</span>
                                    </button>
                                    <button
                                        onClick={runGlobalAnalysis}
                                        disabled={isLoadingGlobal}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${isLoadingGlobal ? 'opacity-60 cursor-wait' : ''} ${isLight ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'}`}
                                        title={language === 'he' ? 'ניתוח גלובלי של כל הפרמטרים' : 'Global analysis of all parameters'}
                                    >
                                        {isLoadingGlobal ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                        <span>{language === 'he' ? 'גלובלי' : 'Global'}</span>
                                    </button>
                                </>
                            )}
                            <button onClick={onClose} className="p-1.5 hover:bg-black/10 rounded-lg transition-colors">
                                <X size={20} className={theme === 'light' ? 'text-gray-600' : 'text-gray-400'} />
                            </button>
                        </div>
                    </div>
                    {/* Insights Badges */}
                    {(impactfulGlobalFactor || (impactfulRate && inputs.enableBuckets)) && (
                        <div className="flex gap-2 mt-1">
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
                    )}
                </div>

                {/* Content */}
                <div className="p-4 space-y-4 overflow-y-auto scrollbar-hide flex-1 relative z-10">
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
                                    [PARAMETER_TYPES.INTEREST, PARAMETER_TYPES.ACCUMULATION_RATE, PARAMETER_TYPES.SAFE_RATE, PARAMETER_TYPES.SURPLUS_RATE, PARAMETER_TYPES.INFLATION].includes(parameterType) ? [
                                        { value: 0.5, label: "0.5%" },
                                        { value: 1, label: "1%" },
                                        { value: 2, label: "2%" }
                                    ] : parameterType === PARAMETER_TYPES.INCOME ? [
                                        { value: 500, label: "500" },
                                        { value: 1000, label: "1,000" },
                                        { value: 2000, label: "2,000" },
                                        { value: 5000, label: "5,000" }
                                    ] : parameterType === PARAMETER_TYPES.TARGET_END_BALANCE ? [
                                        { value: 250000, label: "250K" },
                                        { value: 500000, label: "500K" },
                                        { value: 1000000, label: "1M" }
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

                    {/* Chart Indicators: Current Value & Average Change */}
                    <div className={`flex items-center justify-between text-sm ${labelColor} px-1 md:px-0 mt-2`}>
                        {/* Average Change */}
                        <div className="flex items-center gap-2">
                            <div className={`flex items-center justify-center w-5 h-5 rounded-full ${theme === 'light' ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/50 text-blue-400'}`}>
                                <span className="text-xs font-bold">∑</span>
                            </div>
                            <span className="font-medium">{t('averageChange') || 'Avg Change'}: <span className="font-bold">{formatCompactNumber(avgChange)}</span></span>
                        </div>

                        {/* Current Value Indicator - hidden for TARGET_END_BALANCE when no target is set */}
                        {!(parameterType === PARAMETER_TYPES.TARGET_END_BALANCE && (inputs.targetEndBalance === '' || inputs.targetEndBalance === undefined)) && (
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 bg-yellow-400 rounded-sm"></span>
                                <span className="font-medium">{t('currentValue') || 'Current Value'}: <span className="font-bold">{config.format(currentValue, language)}</span></span>
                            </div>
                        )}
                    </div>

                    {/* Chart */}
                    <div className="h-72">
                        <Bar data={chartData} options={options} plugins={[ChartDataLabels]} />
                    </div>

                    {/* Per-param AI Panel */}
                    {(currentInsight || isLoadingAI || aiError) && (
                        <div className={`rounded-xl border ${isLight ? 'bg-purple-50 border-purple-200' : 'bg-purple-900/20 border-purple-500/30'}`}>
                            <button
                                onClick={() => setAiPanelCollapsed(c => !c)}
                                className="flex items-center justify-between w-full px-3 py-2 text-left"
                            >
                                <div className="flex items-center gap-1.5">
                                    <Sparkles size={12} className={isLight ? 'text-purple-600' : 'text-purple-400'} />
                                    <span className={`text-xs font-bold ${isLight ? 'text-purple-700' : 'text-purple-300'}`}>
                                        {language === 'he' ? `ניתוח AI — ${currentParamLabel}` : `AI Analysis — ${currentParamLabel}`}
                                    </span>
                                </div>
                                {aiPanelCollapsed
                                    ? <ChevronDown size={14} className={isLight ? 'text-purple-500' : 'text-purple-400'} />
                                    : <ChevronUp size={14} className={isLight ? 'text-purple-500' : 'text-purple-400'} />
                                }
                            </button>
                            {!aiPanelCollapsed && (
                                <div className="px-3 pb-3 space-y-2 max-h-52 overflow-y-auto custom-scrollbar scrollbar-right">
                                    {isLoadingAI && (
                                        <div className="flex items-center gap-2 py-1">
                                            <Loader2 size={13} className="animate-spin text-purple-400" />
                                            <span className={`text-xs ${isLight ? 'text-purple-600' : 'text-purple-300'}`}>{language === 'he' ? 'סורק טווח...' : 'Scanning range...'}</span>
                                        </div>
                                    )}
                                    {aiError && (() => {
                                        const isHe = language === 'he';
                                        const cfg = {
                                            balance: { Icon: CreditCard,  color: 'amber',  title: isHe ? 'אין קרדיט API'     : 'Insufficient API Credits', body: isHe ? 'יש להוסיף קרדיט לחשבון ספק ה-AI'            : 'Add credits to your AI provider account' },
                                            quota:   { Icon: WifiOff,     color: 'orange', title: isHe ? 'חריגה ממכסת API'   : 'API Quota Exceeded',       body: isHe ? 'הגעת למגבלת הבקשות — נסה שוב בעוד כמה דקות' : 'Rate limit reached — try again in a few minutes' },
                                            auth:    { Icon: KeyRound,    color: 'red',    title: isHe ? 'מפתח API שגוי'     : 'Invalid API Key',          body: isHe ? 'בדוק את מפתח ה-API בהגדרות'                  : 'Check your API key in Settings' },
                                            context: { Icon: FileX,       color: 'purple', title: isHe ? 'הבקשה ארוכה מדי'   : 'Request Too Long',         body: isHe ? 'נסה עם טווח קטן יותר'                        : 'Try a smaller range' },
                                            network: { Icon: WifiOff,     color: 'red',    title: isHe ? 'שגיאת תקשורת'      : 'Network Error',            body: isHe ? 'בדוק את החיבור לאינטרנט'                     : 'Check your internet connection' },
                                            unknown: { Icon: AlertCircle, color: 'red',    title: isHe ? 'שגיאה'             : 'Error',                    body: aiError.raw },
                                        }[aiError.type] || { Icon: AlertCircle, color: 'red', title: 'Error', body: aiError.raw };
                                        return (
                                            <div className={`rounded-lg border px-3 py-2 flex items-start gap-2 bg-${cfg.color}-500/10 border-${cfg.color}-500/30`}>
                                                <cfg.Icon size={14} className={`mt-0.5 shrink-0 text-${cfg.color}-400`} />
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-xs font-semibold text-${cfg.color}-300`}>{cfg.title}</p>
                                                    <p className={`text-[11px] text-${cfg.color}-400 mt-0.5 break-words`}>{cfg.body}</p>
                                                </div>
                                                <button onClick={() => setAiError(null)} className={`shrink-0 text-${cfg.color}-500 hover:text-${cfg.color}-300`}><X size={12} /></button>
                                            </div>
                                        );
                                    })()}
                                    {currentInsight && (
                                        <div className="space-y-1.5 text-xs" dir={language === 'he' ? 'rtl' : 'ltr'}>
                                            {currentInsight.headline && <p className={`font-semibold ${isLight ? 'text-slate-800' : 'text-white'}`}>{currentInsight.headline}</p>}
                                            {[
                                                { key: 'currentPosition', label: language === 'he' ? 'מצב נוכחי' : 'Current Position' },
                                                { key: 'breakEven',       label: language === 'he' ? 'נקודת איזון' : 'Break-Even' },
                                                { key: 'safeZone',        label: language === 'he' ? 'אזור בטוח' : 'Safe Zone' },
                                                { key: 'riskZone',        label: language === 'he' ? 'אזור סיכון' : 'Risk Zone' },
                                                { key: 'sensitivity',     label: language === 'he' ? 'רגישות' : 'Sensitivity' },
                                                { key: 'recommendation',  label: language === 'he' ? 'המלצה' : 'Recommendation' },
                                            ].filter(f => currentInsight[f.key]).map(f => (
                                                <div key={f.key}>
                                                    <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{f.label}: </span>
                                                    <span className={isLight ? 'text-slate-600' : 'text-gray-300'}>{currentInsight[f.key]}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Global AI Panel */}
                    {globalPanelVisible && (globalInsight || isLoadingGlobal || globalError) && (
                        <div className={`rounded-xl border ${isLight ? 'bg-indigo-50 border-indigo-200' : 'bg-indigo-900/20 border-indigo-500/30'}`}>
                            <div className="flex items-center justify-between px-3 py-2">
                                <button
                                    onClick={() => setGlobalPanelCollapsed(c => !c)}
                                    className="flex items-center gap-1.5 flex-1 text-left"
                                >
                                    <Sparkles size={12} className={isLight ? 'text-indigo-600' : 'text-indigo-400'} />
                                    <span className={`text-xs font-bold ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
                                        {language === 'he' ? 'ניתוח גלובלי' : 'Global Analysis'}
                                    </span>
                                    {globalPanelCollapsed
                                        ? <ChevronDown size={14} className={isLight ? 'text-indigo-500' : 'text-indigo-400'} />
                                        : <ChevronUp size={14} className={isLight ? 'text-indigo-500' : 'text-indigo-400'} />
                                    }
                                </button>
                                <button onClick={() => setGlobalPanelVisible(false)} className={`p-0.5 rounded ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}>
                                    <X size={12} />
                                </button>
                            </div>
                            {!globalPanelCollapsed && (
                                <div className="px-3 pb-3 space-y-2 max-h-52 overflow-y-auto custom-scrollbar scrollbar-right">
                                    {isLoadingGlobal && (
                                        <div className="flex items-center gap-2 py-1">
                                            <Loader2 size={13} className="animate-spin text-indigo-400" />
                                            <span className={`text-xs ${isLight ? 'text-indigo-600' : 'text-indigo-300'}`}>{language === 'he' ? 'מנתח את כל הפרמטרים...' : 'Analyzing all parameters...'}</span>
                                        </div>
                                    )}
                                    {globalError && (() => {
                                        const isHe = language === 'he';
                                        const cfg = {
                                            balance: { Icon: CreditCard,  color: 'amber',  title: isHe ? 'אין קרדיט API'     : 'Insufficient API Credits', body: isHe ? 'יש להוסיף קרדיט לחשבון ספק ה-AI'            : 'Add credits to your AI provider account' },
                                            quota:   { Icon: WifiOff,     color: 'orange', title: isHe ? 'חריגה ממכסת API'   : 'API Quota Exceeded',       body: isHe ? 'הגעת למגבלת הבקשות — נסה שוב בעוד כמה דקות' : 'Rate limit reached — try again in a few minutes' },
                                            auth:    { Icon: KeyRound,    color: 'red',    title: isHe ? 'מפתח API שגוי'     : 'Invalid API Key',          body: isHe ? 'בדוק את מפתח ה-API בהגדרות'                  : 'Check your API key in Settings' },
                                            context: { Icon: FileX,       color: 'purple', title: isHe ? 'הבקשה ארוכה מדי'   : 'Request Too Long',         body: isHe ? 'נסה עם פחות פרמטרים'                         : 'Try with fewer parameters' },
                                            network: { Icon: WifiOff,     color: 'red',    title: isHe ? 'שגיאת תקשורת'      : 'Network Error',            body: isHe ? 'בדוק את החיבור לאינטרנט'                     : 'Check your internet connection' },
                                            unknown: { Icon: AlertCircle, color: 'red',    title: isHe ? 'שגיאה'             : 'Error',                    body: globalError.raw },
                                        }[globalError.type] || { Icon: AlertCircle, color: 'red', title: 'Error', body: globalError.raw };
                                        return (
                                            <div className={`rounded-lg border px-3 py-2 flex items-start gap-2 bg-${cfg.color}-500/10 border-${cfg.color}-500/30`}>
                                                <cfg.Icon size={14} className={`mt-0.5 shrink-0 text-${cfg.color}-400`} />
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-xs font-semibold text-${cfg.color}-300`}>{cfg.title}</p>
                                                    <p className={`text-[11px] text-${cfg.color}-400 mt-0.5 break-words`}>{cfg.body}</p>
                                                </div>
                                                <button onClick={() => setGlobalError(null)} className={`shrink-0 text-${cfg.color}-500 hover:text-${cfg.color}-300`}><X size={12} /></button>
                                            </div>
                                        );
                                    })()}
                                    {globalInsight && (
                                        <div className="space-y-1.5 text-xs" dir={language === 'he' ? 'rtl' : 'ltr'}>
                                            {globalInsight.overallRisk && (
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{language === 'he' ? 'רמת סיכון כללית:' : 'Overall Risk:'}</span>
                                                    <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${globalInsight.overallRisk === 'low' ? 'bg-emerald-500/20 text-emerald-400' : globalInsight.overallRisk === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                                                        {globalInsight.overallRisk === 'low' ? (language === 'he' ? 'נמוך' : 'Low') : globalInsight.overallRisk === 'medium' ? (language === 'he' ? 'בינוני' : 'Medium') : (language === 'he' ? 'גבוה' : 'High')}
                                                    </span>
                                                </div>
                                            )}
                                            {[
                                                { key: 'overallRiskExplanation', label: language === 'he' ? 'הסבר' : 'Explanation' },
                                                { key: 'mostCriticalParameter',  label: language === 'he' ? 'פרמטר קריטי' : 'Most Critical' },
                                                { key: 'safestParameter',        label: language === 'he' ? 'פרמטר יציב' : 'Most Stable' },
                                                { key: 'currentSituation',       label: language === 'he' ? 'מצב נוכחי' : 'Current Situation' },
                                                { key: 'topRecommendation',      label: language === 'he' ? 'המלצה עיקרית' : 'Top Recommendation' },
                                            ].filter(f => globalInsight[f.key]).map(f => (
                                                <div key={f.key}>
                                                    <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{f.label}: </span>
                                                    <span className={isLight ? 'text-slate-600' : 'text-gray-300'}>{globalInsight[f.key]}</span>
                                                </div>
                                            ))}
                                            {globalInsight.keyInsights?.length > 0 && (
                                                <div>
                                                    <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{language === 'he' ? 'תובנות מפתח:' : 'Key Insights:'}</span>
                                                    <ul className="mt-0.5 space-y-0.5">
                                                        {globalInsight.keyInsights.map((ins, i) => (
                                                            <li key={i} className={isLight ? 'text-slate-600' : 'text-gray-300'}>• {ins}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
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
