import React, { useState, useMemo, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { calculateRetirementProjection } from '../utils/calculator';
import { AmortizationTable, AmortizationTableButton, AmortizationTableModal } from './AmortizationTable';
import { SensitivityRangeChart, SensitivityRangeButton, SensitivityRangeModal } from './SensitivityRangeChart';
import { SensitivityHeatmapButton, SensitivityHeatmapModal } from './SensitivityHeatmap';
import { InflationButton, InflationModal } from './InflationRealityCheck';
import { PensionIncomeButton, PensionIncomeModal } from './PensionIncomeModal';
import { WITHDRAWAL_STRATEGIES } from '../constants';
import { LayoutDashboard, BrainCircuit } from 'lucide-react';
import AIInsightsView from './AIInsightsView';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

export function ResultsDashboard({ results, inputs, setInputs, t, language, calculationMode, aiResults, simulationResults, aiLoading, aiError, simulationType, profiles, selectedProfileIds, setSelectedProfileIds, profileResults, showInterestSensitivity, setShowInterestSensitivity, showIncomeSensitivity, setShowIncomeSensitivity, showAgeSensitivity, setShowAgeSensitivity, aiProvider, aiModel, apiKeyOverride, aiInsightsData, setAiInsightsData }) {
    // ALL HOOKS MUST BE AT THE TOP - React rules of hooks
    const { theme } = useTheme();
    const isLight = theme === 'light';
    // State hooks
    const [orderedSelections, setOrderedSelections] = useState([]);
    const [showSensitivityModal, setShowSensitivityModal] = useState(false);
    const [showHeatmapModal, setShowHeatmapModal] = useState(false);
    const [showAmortizationModal, setShowAmortizationModal] = useState(false);
    const [showInflationModal, setShowInflationModal] = useState(false);
    const [showPensionModal, setShowPensionModal] = useState(false);
    const [activeTab, setActiveTab] = useState('numerical'); // 'numerical' | 'insights'
    // Note: showInterestSensitivity and showIncomeSensitivity are now received as props

    // Determine which results to display
    let activeResults = results;
    let isAiMode = calculationMode === 'ai';
    let isSimMode = calculationMode === 'simulations';
    let isCompareMode = calculationMode === 'compare';
    let isMathMode = calculationMode === 'mathematical';

    // Dynamic strategy in math mode should use simulation results
    const isDynamicInMathMode = isMathMode && inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.DYNAMIC;
    if (isDynamicInMathMode && simulationResults) {
        isSimMode = true;  // Treat as simulation mode for display
    }

    // Toggle function that maintains order AND syncs selectedProfileIds for profiles
    const toggleSelection = (type) => {
        const isCurrentlySelected = orderedSelections.includes(type);

        // Update orderedSelections
        if (isCurrentlySelected) {
            setOrderedSelections(prev => prev.filter(t => t !== type));
        } else {
            setOrderedSelections(prev => [...prev, type]);
        }

        // Sync selectedProfileIds for profiles (outside the setState callback)
        if (type.startsWith('profile_')) {
            const profileId = type.replace('profile_', '');
            if (isCurrentlySelected) {
                setSelectedProfileIds(ids => ids.filter(id => id !== profileId));
            } else {
                setSelectedProfileIds(ids => [...ids, profileId]);
            }
        }
    };

    // Check if a type is selected
    const isSelected = (type) => orderedSelections.includes(type);

    // Get ordered columns for display (combines basic selections and profile selections)
    const orderedColumns = useMemo(() => {
        try {
            const columns = [];

            orderedSelections.forEach(sel => {
                if (sel === 'math') {
                    columns.push({ type: 'math', data: results, name: t('mathematical'), color: '#60a5fa', bgClass: 'bg-blue-500/5' });
                } else if (sel === 'sim') {
                    columns.push({ type: 'sim', data: simulationResults, name: t('simulations'), color: '#f472b6', bgClass: 'bg-pink-500/5' });
                } else if (sel === 'ai') {
                    columns.push({ type: 'ai', data: aiResults, name: t('aiMode'), color: '#a78bfa', bgClass: 'bg-purple-500/5' });
                } else if (sel.startsWith('profile_')) {
                    const profileId = sel.replace('profile_', '');
                    const pr = profileResults?.find(p => p.id === profileId);
                    if (pr) {
                        const idx = profileResults.findIndex(p => p.id === profileId);
                        columns.push({
                            type: 'profile',
                            id: profileId,
                            data: pr.results,
                            name: pr.name,
                            color: `hsl(${idx * 137.5 % 360}, 70%, 60%)`,
                            bgClass: 'bg-white/5',
                            profileData: profiles?.find(p => p.id === profileId)?.data
                        });
                    }
                }
            });

            return columns;
        } catch (error) {
            // Silently handle expected errors during profile loading
            return [];
        }
    }, [orderedSelections, results, simulationResults, aiResults, profileResults, profiles, t]);

    // Sensitivity toggle handlers (for compare mode)
    const handleInterestToggle = (checked) => {
        setShowInterestSensitivity(checked);
        if (checked) {
            setShowIncomeSensitivity(false);
            setShowAgeSensitivity(false);
        }
    };

    const handleIncomeToggle = (checked) => {
        setShowIncomeSensitivity(checked);
        if (checked) {
            setShowInterestSensitivity(false);
            setShowAgeSensitivity(false);
        }
    };

    const handleAgeToggle = (checked) => {
        setShowAgeSensitivity(checked);
        if (checked) {
            setShowInterestSensitivity(false);
            setShowIncomeSensitivity(false);
        }
    };

    const sensitivityResults = useMemo(() => {
        try {
            if (!showInterestSensitivity && !showIncomeSensitivity && !showAgeSensitivity) return null;

            let baseInputs, baseName, color;

            if (isCompareMode) {
                // Use the first visible column for sensitivity
                if (orderedColumns.length === 0) return null;

                const firstCol = orderedColumns[0];
                color = firstCol.color;
                baseName = firstCol.name;

                if (firstCol.type === 'math') {
                    baseInputs = inputs;
                } else if (firstCol.type === 'sim' || firstCol.type === 'ai') {
                    baseInputs = inputs; // Simulations and AI are based on same inputs
                } else if (firstCol.type === 'profile' && firstCol.profileData) {
                    baseInputs = firstCol.profileData;
                } else {
                    return null;
                }
            } else if (isMathMode) {
                // Use current inputs for mathematical mode
                baseInputs = inputs;
                baseName = t('currentInputs') || 'Current';
                color = '#60a5fa'; // Blue like math mode
            } else {
                return null; // Sensitivity not supported in other modes
            }

            let inputsMinus, inputsPlus, minusLabel, plusLabel, canShowMinus = true;

            if (showInterestSensitivity) {
                inputsMinus = { ...baseInputs, annualReturnRate: parseFloat(baseInputs.annualReturnRate) - 1 };
                inputsPlus = { ...baseInputs, annualReturnRate: parseFloat(baseInputs.annualReturnRate) + 1 };
                minusLabel = t('returnMinus1');
                plusLabel = t('returnPlus1');
            } else if (showIncomeSensitivity) {
                inputsMinus = { ...baseInputs, monthlyNetIncomeDesired: parseFloat(baseInputs.monthlyNetIncomeDesired) - 1000 };
                inputsPlus = { ...baseInputs, monthlyNetIncomeDesired: parseFloat(baseInputs.monthlyNetIncomeDesired) + 1000 };
                minusLabel = t('incomeMinus1000');
                plusLabel = t('incomePlus1000');
            } else if (showAgeSensitivity) {
                const currentAge = parseFloat(baseInputs.currentAge);
                const retireAge = parseFloat(baseInputs.retirementStartAge);
                // Can only show -1 if retirement age - 1 > current age
                canShowMinus = (retireAge - 1) > currentAge;
                if (canShowMinus) {
                    inputsMinus = { ...baseInputs, retirementStartAge: retireAge - 1 };
                }
                inputsPlus = { ...baseInputs, retirementStartAge: retireAge + 1 };
                minusLabel = t('retireMinus1');
                plusLabel = t('retirePlus1');
            }

            return {
                minus: canShowMinus && inputsMinus ? calculateRetirementProjection(inputsMinus, t) : null,
                plus: calculateRetirementProjection(inputsPlus, t),
                baseName,
                minusLabel,
                plusLabel,
                color,
                canShowMinus
            };
        } catch (error) {
            // Silently return null for expected validation errors during profile loading
            return null;
        }
    }, [showInterestSensitivity, showIncomeSensitivity, showAgeSensitivity, isCompareMode, isMathMode, orderedColumns, inputs, t]);

    if (isAiMode && aiResults) {
        activeResults = aiResults;
    } else if (isSimMode && simulationResults) {
        activeResults = simulationResults;
    }
    // In compare mode, we stick with 'results' (Math) as the primary active set for the summary cards (if shown) 
    // or just use all 3 for the table/chart.

    // IMPORTANT: All hooks must be called BEFORE any early returns!
    // Memoized currency formatter for performance
    const currencyFormatter = useMemo(() => {
        return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: language === 'he' ? 'ILS' : 'USD',
            maximumFractionDigits: 0
        });
    }, [language]);

    const formatCurrency = useCallback((value) => {
        return currencyFormatter.format(value);
    }, [currencyFormatter]);

    // Memoized Chart Data for performance
    const chartData = useMemo(() => {
        try {
            return {
                labels: activeResults?.history?.map(h => `Age ${Math.floor(h.age)}`) || [],
                datasets: [
                    // In compare mode, use orderedColumns for datasets
                    ...(isCompareMode ? orderedColumns.map((col, i) => ({
                        label: col.name,
                        data: col.data?.history?.map(h => h.balance) || [],
                        borderColor: col.color,
                        borderDash: col.type !== 'math' ? [2, 2] : undefined,
                        backgroundColor: i === 0 ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
                        fill: i === 0,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHitRadius: 10,
                    })) : [{
                        // Non-compare mode: single line
                        label: t('wealthProjection'),
                        data: activeResults?.history?.map(h => h.balance) || [],
                        borderColor: isAiMode ? '#a78bfa' : (isSimMode ? '#f472b6' : '#60a5fa'),
                        backgroundColor: isAiMode ? 'rgba(167, 139, 250, 0.1)' : (isSimMode ? 'rgba(244, 114, 182, 0.1)' : 'rgba(96, 165, 250, 0.1)'),
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHitRadius: 10,
                    }]),

                    // Sensitivity Datasets
                    ...(sensitivityResults?.minus?.history && sensitivityResults?.plus?.history ? [
                        {
                            label: `${sensitivityResults.baseName} (${sensitivityResults.minusLabel})`,
                            data: sensitivityResults.minus.history.map(h => h.balance),
                            borderColor: sensitivityResults.color,
                            borderDash: [5, 5],
                            backgroundColor: 'transparent',
                            fill: false,
                            tension: 0.4,
                            pointRadius: 0,
                            pointHitRadius: 10,
                            borderWidth: 1
                        },
                        {
                            label: `${sensitivityResults.baseName} (${sensitivityResults.plusLabel})`,
                            data: sensitivityResults.plus.history.map(h => h.balance),
                            borderColor: sensitivityResults.color,
                            borderDash: [10, 5],
                            backgroundColor: 'transparent',
                            fill: false,
                            tension: 0.4,
                            pointRadius: 0,
                            pointHitRadius: 10,
                            borderWidth: 1
                        }
                    ] : []),

                    {
                        label: t('accumulatedWithdrawals'),
                        data: activeResults?.history?.map(h => h.accumulatedWithdrawals) || [],
                        borderColor: '#facc15',
                        backgroundColor: 'rgba(250, 204, 21, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHitRadius: 10,
                    }
                ]
            };
        } catch (error) {
            // Silently handle expected errors during profile loading
            return { labels: [], datasets: [] };
        }
    }, [activeResults?.history, isCompareMode, isAiMode, isSimMode, orderedColumns, sensitivityResults, t]);

    // NOW we can have early returns (after all hooks are called)
    // Loading State
    if (aiLoading) {
        return (
            <div className="p-8 text-center space-y-4 bg-white/5 rounded-2xl border border-white/10 animate-pulse">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                <p className="text-gray-300">{t('calculatingWithAI')}</p>
            </div>
        );
    }

    // Error State
    if (aiError) {
        return (
            <div className="p-6 text-center space-y-2 bg-red-500/10 rounded-2xl border border-red-500/30">
                <div className="text-red-400 font-bold text-lg">{t('aiError')}</div>
                <p className="text-red-200 text-sm">{aiError}</p>
            </div>
        );
    }

    if (!activeResults) return null;

    const {
        history,
        balanceAtRetirement,
        balanceAtEnd,
        ranOutAtAge,
        requiredCapitalAtRetirement,
        requiredCapitalForPerpetuity,
        surplus,
        pvOfDeficit,
        initialGrossWithdrawal,
        initialNetWithdrawal,
        averageGrossWithdrawal,
        averageNetWithdrawal,
        simulationRange // Only present in Monte Carlo
    } = activeResults;

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: (context) => {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += formatCurrency(context.parsed.y);
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#9ca3af', maxTicksLimit: 8 }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#9ca3af', callback: (val) => (val / 1000) + 'k' }
            }
        },
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
        }
    };

    // Calculate projected years for display
    const currentYear = new Date().getFullYear();
    const getProjectedYear = (targetAge) => {
        if (!targetAge || !inputs.currentAge) return null;
        const target = parseFloat(targetAge);
        const current = parseFloat(inputs.currentAge);
        if (isNaN(target) || isNaN(current)) return null;

        if (inputs.birthdate) {
            return new Date(inputs.birthdate).getFullYear() + target;
        }
        return Math.floor(currentYear + (target - current));
    };
    const startYear = getProjectedYear(inputs.retirementStartAge);
    const endYear = getProjectedYear(inputs.retirementEndAge);

    // Calculate inputs for sensitivity tools (Heatmap/Range)
    // In comparison mode, use the first selected profile/scenario. Fallback to current inputs.
    const sensitivityInputs = useMemo(() => {
        if (!isCompareMode) return inputs;

        if (orderedColumns.length > 0) {
            const firstCol = orderedColumns[0];
            if (firstCol.type === 'profile' && firstCol.profileData) {
                return firstCol.profileData;
            }
            // For math/sim/ai types, they use the current 'inputs' prop
            return inputs;
        }

        return inputs;
    }, [isCompareMode, inputs, orderedColumns]);

    const sensitivitySourceName = useMemo(() => {
        if (!isCompareMode) return t('currentInputs') || 'Current Inputs';

        if (orderedColumns.length > 0) {
            return orderedColumns[0].name;
        }

        return t('currentInputs') || 'Current Inputs';
    }, [isCompareMode, orderedColumns, t]);

    return (
        <div className="space-y-3 h-full flex flex-col min-h-0">
            {/* View Toggle */}
            <div className={`flex p-1 rounded-lg shrink-0 ${isLight ? 'bg-white border border-slate-200' : 'bg-white/5'}`}>
                <button
                    onClick={() => setActiveTab('numerical')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'numerical'
                        ? 'bg-blue-600 text-white shadow-md'
                        : (isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200')
                        }`}
                >
                    <LayoutDashboard size={16} />
                    {t('numericalResults') || 'Numerical Results'}
                </button>
                <button
                    onClick={() => setActiveTab('insights')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'insights'
                        ? 'bg-purple-600 text-white shadow-md'
                        : (isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200')
                        }`}
                >
                    <BrainCircuit size={16} />
                    {t('aiInsights') || 'AI Insights'}
                </button>
            </div>

            {activeTab === 'insights' ? (
                <div className="flex-1 min-h-0 overflow-hidden">
                    <AIInsightsView
                        inputs={inputs}
                        results={results}
                        aiProvider={aiProvider}
                        aiModel={aiModel}
                        apiKeyOverride={apiKeyOverride}
                        language={language}
                        t={t}
                        insightsData={aiInsightsData}
                        onInsightsChange={setAiInsightsData}
                    />
                </div>
            ) : (
                <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
                    {/* Status Message - Hero Card - Fixed height for consistent UI */}
                    {!isCompareMode && (
                        <div className={`mx-1 md:mx-0 px-3 md:px-4 py-3 rounded-xl border shadow-lg min-h-[72px] flex items-center ${ranOutAtAge ? 'bg-red-500/20 border-red-500/50' : 'bg-green-500/20 border-green-500/50'}`}>
                            <div className="flex justify-between items-center w-full gap-4">
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm md:text-lg font-bold ${ranOutAtAge ? (isLight ? 'text-red-700' : 'text-red-200') : (isLight ? 'text-green-700' : 'text-green-200')}`}>
                                        {ranOutAtAge ? `⚠️ ${t('warningRunOut')} ${ranOutAtAge.toFixed(1)}` : `✓ ${t('onTrack')}`}
                                    </span>
                                    {(isAiMode || isSimMode) && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${isAiMode ? 'bg-purple-500/20 border-purple-500/50 text-purple-200' : 'bg-pink-500/20 border-pink-500/50 text-pink-200'}`}>
                                            {isAiMode ? 'AI' : 'SIM'}
                                        </span>
                                    )}
                                </div>
                                <div className={`px-4 py-2 rounded-lg border ${isLight ? 'bg-white/50 border-slate-200' : 'bg-black/20 border-white/10'}`}>
                                    <div className="flex items-baseline gap-2">
                                        <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('balanceAtEnd')}:</span>
                                        <span className={`text-2xl font-bold ${ranOutAtAge ? (isLight ? 'text-red-600' : 'text-red-300') : (isLight ? 'text-slate-900' : 'text-white')}`}>
                                            {formatCurrency(balanceAtEnd)}
                                        </span>
                                    </div>
                                    <div className={`text-[10px] text-gray-400 mt-0.5 ${!simulationRange ? 'invisible' : ''}`}>
                                        {simulationRange
                                            ? `${t('range')}: ${formatCurrency(simulationRange.p25Balance)} - ${formatCurrency(simulationRange.p75Balance)}`
                                            : '\u00A0'
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Comparison View or Standard Summary Cards */}
                    {isCompareMode ? (
                        <div className={orderedColumns.length > 1 ? "overflow-x-auto" : "overflow-x-hidden"}>
                            {/* Profile Selection for Comparison - Compact View */}
                            {/* Profile Selection for Comparison - Compact View */}
                            {/* Profile Selection for Comparison - Compact View */}
                            {/* Profile Selection for Comparison - Compact View */}
                            <div className={`mb-2 p-2 rounded-xl border ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-white/5 border-white/10'}`}>
                                <div className="flex flex-col md:flex-row gap-4 items-start">
                                    {/* Controls Column */}
                                    <div className="flex flex-col gap-2 shrink-0 border-b md:border-b-0 md:border-e border-white/10 pb-4 md:pb-0 md:pe-4 w-full md:w-auto">
                                        {/* Basic Scenarios */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`${isLight ? 'text-slate-500' : 'text-gray-400'} text-xs font-medium uppercase tracking-wider whitespace-nowrap`}>{t('basicScenarios')}</span>

                                            <button
                                                onClick={() => toggleSelection('math')}
                                                className={`px-2 py-1.5 rounded-lg text-xs transition-colors border ${isSelected('math')
                                                    ? 'bg-blue-600 border-blue-500 text-white'
                                                    : (isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-white/5 border-white/20 text-gray-300 hover:bg-white/10')
                                                    }`}
                                            >
                                                {t('mathematical')}
                                            </button>
                                            <button
                                                onClick={() => toggleSelection('sim')}
                                                className={`px-2 py-1.5 rounded-lg text-xs transition-colors border ${isSelected('sim')
                                                    ? 'bg-pink-600 border-pink-500 text-white'
                                                    : (isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-white/5 border-white/20 text-gray-300 hover:bg-white/10')
                                                    }`}
                                            >
                                                {t('simulations')}
                                            </button>
                                            <button
                                                onClick={() => toggleSelection('ai')}
                                                disabled={!aiResults}
                                                className={`px-2 py-1.5 rounded-lg text-xs transition-colors border ${isSelected('ai')
                                                    ? 'bg-purple-600 border-purple-500 text-white'
                                                    : (isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-white/5 border-white/20 text-gray-300 hover:bg-white/10')
                                                    } ${!aiResults ? 'opacity-40 cursor-not-allowed' : ''}`}
                                            >
                                                {t('aiMode')}
                                            </button>

                                            {/* Sensitivity Icons - Pushed to the end (Left in RTL) */}
                                            <div className="flex gap-1 ms-auto mt-1 md:mt-0">
                                                <SensitivityRangeButton
                                                    onClick={() => setShowSensitivityModal(true)}
                                                    t={t}
                                                />
                                                <SensitivityHeatmapButton
                                                    onClick={() => setShowHeatmapModal(true)}
                                                    t={t}
                                                />
                                                <InflationButton
                                                    onClick={() => setShowInflationModal(true)}
                                                    t={t}
                                                />
                                                <PensionIncomeButton
                                                    onClick={() => setShowPensionModal(true)}
                                                    t={t}
                                                />
                                            </div>
                                        </div>

                                        {/* Sensitivity Toggles - Disabled if AI is first in comparison */}
                                        {orderedSelections[0] !== 'ai' && (
                                            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 md:mt-0">
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <div className="relative">
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only peer"
                                                            checked={showInterestSensitivity}
                                                            onChange={(e) => handleInterestToggle(e.target.checked)}
                                                        />
                                                        <div className={`w-9 h-5 ${isLight ? 'bg-slate-200' : 'bg-white/10'} peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600`}></div>
                                                    </div>
                                                    <span className={`text-xs ${isLight ? 'text-slate-700 group-hover:text-slate-900' : 'text-gray-400 group-hover:text-gray-200'} transition-colors whitespace-nowrap`}>
                                                        {t('interestSensitivity')}
                                                    </span>
                                                </label>

                                                {/* Income Sensitivity Toggle */}
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <div className="relative">
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only peer"
                                                            checked={showIncomeSensitivity}
                                                            onChange={(e) => handleIncomeToggle(e.target.checked)}
                                                        />
                                                        <div className={`w-9 h-5 ${isLight ? 'bg-slate-200' : 'bg-white/10'} peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600`}></div>
                                                    </div>
                                                    <span className={`text-xs ${isLight ? 'text-slate-700 group-hover:text-slate-900' : 'text-gray-400 group-hover:text-gray-200'} transition-colors whitespace-nowrap`}>
                                                        {t('incomeSensitivity')}
                                                    </span>
                                                </label>

                                                {/* Age Sensitivity Toggle */}
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <div className="relative">
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only peer"
                                                            checked={showAgeSensitivity}
                                                            onChange={(e) => handleAgeToggle(e.target.checked)}
                                                        />
                                                        <div className={`w-9 h-5 ${isLight ? 'bg-slate-200' : 'bg-white/10'} peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600`}></div>
                                                    </div>
                                                    <span className={`text-xs ${isLight ? 'text-slate-700 group-hover:text-slate-900' : 'text-gray-400 group-hover:text-gray-200'} transition-colors whitespace-nowrap`}>
                                                        {t('ageSensitivity')}
                                                    </span>
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    {/* Saved Profiles */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`${isLight ? 'text-slate-500' : 'text-gray-400'} text-xs font-medium uppercase tracking-wider`}>{t('selectProfiles')}</span>
                                            <div className="flex flex-wrap gap-1">
                                                {profiles && profiles.map(profile => (
                                                    <button
                                                        key={profile.id}
                                                        onClick={() => toggleSelection(`profile_${profile.id}`)}
                                                        title={profile.name}
                                                        className={`px-2 py-1 rounded text-xs transition-colors border max-w-[120px] truncate ${isSelected(`profile_${profile.id}`)
                                                            ? 'bg-emerald-600 border-emerald-500 text-white'
                                                            : (isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-white/5 border-white/20 text-gray-300 hover:bg-white/10')
                                                            }`}
                                                    >
                                                        {profile.name}
                                                    </button>
                                                ))}
                                                {(!profiles || profiles.length === 0) && (
                                                    <span className={`${isLight ? 'text-slate-400' : 'text-gray-500'} text-xs italic`}>{t('noSavedProfiles')}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <table className={`w-full border-collapse ${language === 'he' ? 'text-right' : 'text-left'}`}>
                                <thead>
                                    <tr>
                                        <th className={`p-2 text-sm font-semibold border-b ${isLight ? 'text-slate-600 border-slate-200' : 'text-gray-400 border-white/10'}`}>{t('metric')}</th>
                                        {orderedColumns.map((col, i) => (
                                            <React.Fragment key={col.type === 'profile' ? col.id : col.type}>
                                                {/* Sensitivity -1 (Only for first column and if canShowMinus) */}
                                                {i === 0 && sensitivityResults && sensitivityResults.canShowMinus && sensitivityResults.minus && (
                                                    <th className="p-2 text-sm font-semibold border-b border-white/10 bg-white/5 rounded-t-lg opacity-70" style={{ color: sensitivityResults.color }}>
                                                        {sensitivityResults.minusLabel}
                                                    </th>
                                                )}

                                                {/* Column Header */}
                                                <th className={`p-2 text-sm font-semibold border-b ${isLight ? 'border-slate-200' : 'border-white/10'} ${col.bgClass} rounded-t-lg`} style={{ color: col.color }}>
                                                    {col.name}
                                                </th>

                                                {/* Sensitivity +1% (Only for first column) */}
                                                {i === 0 && sensitivityResults && (
                                                    <th className="p-2 text-sm font-semibold border-b border-white/10 bg-white/5 rounded-t-lg opacity-70" style={{ color: sensitivityResults.color }}>
                                                        {sensitivityResults.plusLabel}
                                                    </th>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-white/5'}`}>
                                    {[
                                        { label: t('balanceAtRetirement'), key: 'balanceAtRetirement' },
                                        { label: t('requiredCapital'), key: 'requiredCapitalAtRetirement' },
                                        { label: t('surplus') + '/' + t('deficit'), key: 'surplus' },
                                        { label: t('neededToday'), key: 'pvOfDeficit', highlightColor: 'orange' },
                                        { label: t('balanceAtEnd'), key: 'balanceAtEnd', highlightColor: 'emerald' },
                                        { label: t('capitalPreservation'), key: 'requiredCapitalForPerpetuity', highlightColor: 'cyan' },
                                        { label: t('neededToday'), key: 'pvOfCapitalPreservation', highlightColor: 'orange' },
                                    ].map((row, idx) => {
                                        const getRowStyles = (color) => {
                                            if (color === 'orange') return { bg: isLight ? 'bg-orange-50' : 'bg-orange-500/10', text: isLight ? 'text-orange-700 font-bold' : 'text-orange-300 font-bold' };
                                            if (color === 'emerald') return { bg: isLight ? 'bg-emerald-50' : 'bg-emerald-500/10', text: isLight ? 'text-emerald-700 font-bold' : 'text-emerald-300 font-bold' };
                                            if (color === 'cyan') return { bg: isLight ? 'bg-cyan-50' : 'bg-cyan-500/10', text: isLight ? 'text-cyan-700 font-bold' : 'text-cyan-300 font-bold' };
                                            // Zebra striping for light mode
                                            const zebraBg = isLight ? (idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100') : 'hover:bg-white/5';
                                            return { bg: zebraBg, text: isLight ? 'text-slate-700' : 'text-gray-300' };
                                        };
                                        const styles = getRowStyles(row.highlightColor);
                                        const valueTextClass = row.highlightColor ? styles.text : (isLight ? 'text-slate-900' : 'text-white');

                                        return (
                                            <tr key={idx} className={`transition-colors ${styles.bg}`}>
                                                <td className={`p-2 text-sm ${styles.text}`}>{row.label}</td>

                                                {orderedColumns.map((col, i) => (
                                                    <React.Fragment key={col.type === 'profile' ? col.id : col.type}>
                                                        {/* Sensitivity -1 (Only for first column and if canShowMinus) */}
                                                        {i === 0 && sensitivityResults && sensitivityResults.canShowMinus && sensitivityResults.minus && (
                                                            <td className={`p-2 text-sm font-medium ${valueTextClass} bg-white/5 opacity-70`}>
                                                                {formatCurrency(row.key === 'surplus' ? Math.abs(sensitivityResults.minus[row.key]) : sensitivityResults.minus[row.key])}
                                                            </td>
                                                        )}

                                                        {/* Column Data */}
                                                        <td className={`p-2 text-sm font-medium ${valueTextClass} ${col.bgClass}`}>
                                                            {col.data ? (
                                                                formatCurrency(row.key === 'surplus' ? Math.abs(col.data[row.key]) : col.data[row.key])
                                                            ) : (
                                                                <span className="text-gray-600">-</span>
                                                            )}
                                                        </td>

                                                        {/* Sensitivity +1% (Only for first column) */}
                                                        {i === 0 && sensitivityResults && (
                                                            <td className={`p-2 text-sm font-medium ${valueTextClass} bg-white/5 opacity-70`}>
                                                                {formatCurrency(row.key === 'surplus' ? Math.abs(sensitivityResults.plus[row.key]) : sensitivityResults.plus[row.key])}
                                                            </td>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div
                            className="grid grid-cols-2 lg:grid-cols-3 gap-2"
                        >
                            <SummaryCard
                                label={t('balanceAtRetirement')}
                                value={formatCurrency(balanceAtRetirement)}
                                subtext={t('projectedSavings')}
                                color="text-blue-400"
                            />
                            <SummaryCard
                                label={t('requiredCapital')}
                                value={formatCurrency(requiredCapitalAtRetirement)}
                                subtext={t('toEndWithZero')}
                                color="text-purple-400"
                            />
                            <SummaryCard
                                label={t('capitalPreservation')}
                                value={formatCurrency(requiredCapitalForPerpetuity)}
                                subtext={t('preservePrincipal')}
                                color="text-emerald-400"
                                extraContent={
                                    <div className="mt-1 pt-1 border-t border-white/10">
                                        <span className="text-xs text-orange-300 font-medium block">{t('neededToday')}:</span>
                                        <span className="text-lg font-bold text-orange-300">{formatCurrency(activeResults.pvOfCapitalPreservation)}</span>
                                    </div>
                                }
                            />
                            <SummaryCard
                                label={surplus >= 0 ? t('surplus') : t('deficit')}
                                value={formatCurrency(Math.abs(surplus))}
                                subtext={surplus >= 0 ? t('onTrack') : t('capitalNeeded')}
                                color={surplus >= 0 ? "text-green-400" : "text-red-400"}
                                extraContent={surplus < 0 && (
                                    <div className="mt-1 pt-1 border-t border-white/10">
                                        <span className="text-xs text-orange-300 font-medium block">{t('neededToday')}:</span>
                                        <span className="text-lg font-bold text-orange-300">{formatCurrency(pvOfDeficit)}</span>
                                    </div>
                                )}
                            />
                            <SummaryCard
                                label={t('estGrossWithdrawal')}
                                value={formatCurrency(averageGrossWithdrawal || initialGrossWithdrawal)}
                                color="text-yellow-400"
                                extraContent={
                                    <div className="mt-1 pt-1 border-t border-white/10">
                                        <span className="text-xs text-green-300 font-medium block">
                                            {t('netWithdrawal')} {language === 'he' ? '(ממוצע)' : '(Avg)'}:
                                        </span>
                                        <span className="text-lg font-bold text-green-300">{formatCurrency(averageNetWithdrawal || initialNetWithdrawal || 0)}</span>
                                    </div>
                                }
                            />
                            <SummaryCard
                                label={t('timeHorizon')}
                                value={`${(inputs.retirementStartAge - inputs.currentAge).toFixed(1)} / ${(inputs.retirementEndAge - inputs.retirementStartAge).toFixed(1)}`}
                                subtext={`${t('yearsUntilRetirement')} / ${t('yearsOfRetirement')}`}
                                color="text-orange-400"
                                extraContent={
                                    <div className="mt-1 pt-1 border-t border-white/10">
                                        <span className="text-xs text-orange-300 font-medium block">{t('years')}:</span>
                                        <span className="text-lg font-bold text-orange-300">{startYear} - {endYear}</span>
                                    </div>
                                }
                            />
                        </div>
                    )
                    }

                    {/* Chart */}
                    <div className={`backdrop-blur-md border rounded-2xl p-4 shadow-xl ${isLight ? 'bg-white border-slate-300 shadow-md' : 'bg-white/10 border-white/40'}`}>
                        {/* Chart Title with Custom Legend */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <h3 className={`text-lg font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{t('wealthProjection')}</h3>
                                {/* Year-by-Year Progress Button */}
                                {!isCompareMode && history && (
                                    <AmortizationTableButton
                                        onClick={() => setShowAmortizationModal(true)}
                                        t={t}
                                    />
                                )}
                            </div>
                            <div className="flex gap-6">
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-3 h-3 inline-block ${isAiMode ? 'bg-[#a78bfa]' : (isSimMode ? 'bg-[#f472b6]' : 'bg-[#60a5fa]')}`}></span>
                                    <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-white'}`}>{t('wealthProjection')}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 bg-[#facc15] inline-block"></span>
                                    <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-white'}`}>{t('accumulatedWithdrawals')}</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-52">
                            <Line data={chartData} options={options} />
                        </div>
                    </div>

                    {/* Amortization Table Modal */}
                    <AmortizationTableModal
                        isOpen={showAmortizationModal}
                        onClose={() => setShowAmortizationModal(false)}
                        history={history}
                        t={t}
                        language={language}
                    />

                    <SensitivityRangeModal
                        isOpen={showSensitivityModal}
                        onClose={() => setShowSensitivityModal(false)}
                        inputs={sensitivityInputs}
                        t={t}
                        language={language}
                    />

                    <SensitivityHeatmapModal
                        isOpen={showHeatmapModal}
                        onClose={() => setShowHeatmapModal(false)}
                        inputs={sensitivityInputs}
                        t={t}
                        language={language}
                        sourceName={sensitivitySourceName}
                    />

                    <InflationModal
                        isOpen={showInflationModal}
                        onClose={() => setShowInflationModal(false)}
                        t={t}
                        language={language}
                    />

                    {showPensionModal && (
                        <PensionIncomeModal
                            inputs={selectedProfileIds.length === 1
                                ? profiles.find(p => p.id === selectedProfileIds[0])?.data || inputs
                                : inputs
                            }
                            results={
                                // If in Compare Mode AND exactly one profile is selected, show that profile's data.
                                // Otherwise (including normal mode, sim mode, etc.), show the ACTIVE Dashboard results.
                                isCompareMode && selectedProfileIds.length === 1
                                    ? profileResults?.find(r => r.id === selectedProfileIds[0])?.results || activeResults
                                    : activeResults
                            }
                            onClose={() => setShowPensionModal(false)}
                            onSave={(newIncomeSources) => {
                                setInputs(prev => ({
                                    ...prev,
                                    pensionIncomeSources: newIncomeSources
                                }));
                                // Don't close modal on save
                            }}
                            t={t}
                            language={language}
                        />
                    )}
                </div >
            )}
        </div>
    );
}

function SummaryCard({ label, value, subtext, color, extraContent }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';

    return (
        <div className={`${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-white/10 border-white/40'} backdrop-blur-md border rounded-xl p-2 md:p-3`}>
            <p className={`${isLight ? 'text-slate-500' : 'text-gray-400'} text-xs md:text-sm truncate`}>{label}</p>
            <p className={`text-lg md:text-2xl font-bold ${color} my-0.5 md:my-1 truncate`}>{value}</p>
            <p className={`${isLight ? 'text-slate-400' : 'text-gray-500'} text-[10px] md:text-xs truncate`}>{subtext}</p>
            {extraContent}
        </div>
    );
}


