import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Check, X, AlertCircle, Download, RotateCcw, ChevronDown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { fetchAllAvailableModels, compareModels } from '../utils/ai-models-fetcher';
import { AI_MODELS_CONFIG } from '../config/ai-models';
import { getUserSettings, setUserSettings } from '../utils/db';
import { SmartAlertsPanel } from './SmartAlertsPanel';

const ALL_ALERTS = [
    { id: 'ran_out',          severity: 'critical', labelHe: 'כסף נגמר לפני סוף התקופה',                  labelEn: 'Funds run out before end of period' },
    { id: 'capital_deficit',  severity: 'critical', labelHe: 'חסר הון ביום הפרישה',                        labelEn: 'Capital shortfall at retirement' },
    { id: 'withdrawal_gap',   severity: 'warning',  labelHe: 'משיכה חודשית נמוכה מהיעד',                   labelEn: 'Monthly withdrawal below target' },
    { id: 'near_retirement',  severity: 'warning',  labelHe: 'פחות מ-5 שנים לפרישה',                       labelEn: 'Less than 5 years to retirement' },
    { id: 'short_horizon',    severity: 'info',     labelHe: 'גיל סיום תכנון נמוך מ-85',                   labelEn: 'Planning end age below 85' },
    { id: 'late_retirement',  severity: 'info',     labelHe: 'גיל פרישה מאוחר (מעל 70)',                   labelEn: 'Late retirement age (above 70)' },
];

function readAppState() {
    try {
        const budget = JSON.parse(sessionStorage.getItem('rc-budget-summary') || '{}');
        const calc = JSON.parse(sessionStorage.getItem('rc-calc-summary') || '{}');
        const categoryTotals = {};
        (budget.categories || []).forEach(c => {
            if (c.labelHe) categoryTotals[c.labelHe] = c.total;
            if (c.labelEn) categoryTotals[c.labelEn] = c.total;
        });
        return {
            totalMonthly: budget.totalMonthly || 0,
            totalAnnual: budget.totalAnnual || 0,
            target: budget.incomeTarget || 0,
            budgetGap: budget.gap ?? null,
            householdSize: budget.householdSize ?? null,
            perPerson: budget.perPerson ?? null,
            inflationRate: budget.inflation?.rate ?? null,
            inflationProjectedMonthly: budget.inflation?.projectedMonthly ?? null,
            categoryTotals,
            loanTracks: budget.loanTracks || [],
            balanceAtRetirement: calc.balanceAtRetirement ?? null,
            balanceAtEnd: calc.balanceAtEnd ?? null,
            surplus: calc.surplus ?? null,
            pvOfDeficit: calc.pvOfDeficit ?? null,
            pvOfCapitalPreservation: calc.pvOfCapitalPreservation ?? null,
            ranOutAtAge: calc.ranOutAtAge ?? null,
            requiredCapitalAtRetirement: calc.requiredCapitalAtRetirement ?? null,
            requiredCapitalForPerpetuity: calc.requiredCapitalForPerpetuity ?? null,
            initialNetWithdrawal: calc.initialNetWithdrawal ?? null,
            averageNetWithdrawal: calc.averageNetWithdrawal ?? null,
            maxSustainableNetWithdrawal: calc.maxSustainableNetWithdrawal ?? null,
            pensionGrossAtNI: calc.pensionGrossAtNI ?? null,
            pensionNetAtNI: calc.pensionNetAtNI ?? null,
            pensionNonWorkAtNI: calc.pensionNonWorkAtNI ?? null,
            niThreshold: calc.niThreshold ?? null,
            monthlyNetIncomeDesired: calc.monthlyNetIncomeDesired || 0,
            retirementStartAge: calc.retirementStartAge || null,
            retirementEndAge: calc.retirementEndAge || null,
            currentAge: calc.currentAge || null,
            monthlyContribution: calc.monthlyContribution || 0,
            retirementDate: calc.retirementDate || null,
        };
    } catch { return { totalMonthly: 0, target: 0, categoryTotals: {}, loanTracks: [] }; }
}

export function ModelsManager({ apiKeys, onClose, onModelsUpdated, t, language, uid, idleTimeoutEnabled = true, onIdleTimeoutEnabledChange, idleTimeoutMinutes = 5, onIdleTimeoutChange, fourPercentMode = 'net', onFourPercentModeChange, disabledAlerts = [], onToggleAlert, aiProvider, aiModel, apiKeyOverride }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [collapsed, setCollapsed] = useState({});
    const toggleSection = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
    const [selectedModels, setSelectedModels] = useState({});

    const [expandedProvider, setExpandedProvider] = useState(null);
    const abortRef = useRef(null);
    const modalRef = useRef(null);
    const [dragPos, setDragPos] = useState(null); // null = CSS-centered
    const dragOrigin = useRef(null);

    const handleDragStart = useCallback((e) => {
        if (e.button !== 0) return;
        const rect = modalRef.current?.getBoundingClientRect();
        if (!rect) return;
        dragOrigin.current = { startX: e.clientX - rect.left, startY: e.clientY - rect.top };
        const onMove = (e) => {
            setDragPos({ x: e.clientX - dragOrigin.current.startX, y: e.clientY - dragOrigin.current.startY });
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            dragOrigin.current = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        e.preventDefault();
    }, []);
    const [appState, setAppState] = useState(readAppState);
    useEffect(() => {
        const update = () => setAppState(readAppState());
        window.addEventListener('rc-budget-updated', update);
        window.addEventListener('rc-calc-updated', update);
        return () => {
            window.removeEventListener('rc-budget-updated', update);
            window.removeEventListener('rc-calc-updated', update);
        };
    }, []);

    useEffect(() => {
        return () => { abortRef.current?.abort(); };
    }, []);

    const handleRefresh = async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const fetched = await fetchAllAvailableModels(apiKeys, { signal: controller.signal });

            // Get current config from Firestore if available, otherwise use static config
            let currentConfig = AI_MODELS_CONFIG;
            let override = null;
            if (uid) {
                try {
                    const settings = await getUserSettings(uid);
                    override = settings?.aiModelsOverride || null;
                } catch (err) {
                    console.error('Error loading model override:', err);
                }
            }
            if (override) {
                // Merge saved models into config structure
                currentConfig = {};
                Object.keys(AI_MODELS_CONFIG).forEach(providerId => {
                    currentConfig[providerId] = {
                        ...AI_MODELS_CONFIG[providerId],
                        models: override[providerId] || AI_MODELS_CONFIG[providerId].models
                    };
                });
            }

            // Fallback: Use currentConfig for fetched providers that didn't have an API key (are null/error)
            // This prevents "Check Models" from vanishing Gemini when the user hasn't put in an API key.
            const validFetched = { ...fetched };
            Object.keys(currentConfig).forEach(providerId => {
                if (!validFetched[providerId]) {
                    validFetched[providerId] = [...currentConfig[providerId].models];
                }
            });

            const comparison = compareModels(validFetched, currentConfig);
            setResults(comparison);
            
            // Auto expand Gemini so the user has immediate visual feedback that models were fetched
            if (comparison['gemini']?.status === 'success') {
                setExpandedProvider('gemini');
            } else {
                setExpandedProvider(Object.keys(comparison)[0]);
            }

            // Initialize selection state: only existing models selected by default
            const initialSelection = {};
            Object.keys(comparison).forEach(providerId => {
                if (comparison[providerId].status === 'success') {
                    initialSelection[providerId] = {};
                    const { existing } = comparison[providerId];

                    // Select only existing models (not new ones)
                    existing.forEach(m => {
                        initialSelection[providerId][m.id] = true;
                    });
                }
            });
            setSelectedModels(initialSelection);
        } catch (err) {
            if (err.name === 'AbortError') return;
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleModel = (providerId, modelId) => {
        setSelectedModels(prev => ({
            ...prev,
            [providerId]: {
                ...prev[providerId],
                [modelId]: !prev[providerId]?.[modelId]
            }
        }));
    };

    const handleSelectAll = (providerId) => {
        if (!results[providerId] || results[providerId].status !== 'success') return;

        const allModels = results[providerId].updated;
        const newSelection = {};
        allModels.forEach(m => {
            newSelection[m.id] = true;
        });

        setSelectedModels(prev => ({
            ...prev,
            [providerId]: newSelection
        }));
    };

    const handleDeselectAll = (providerId) => {
        setSelectedModels(prev => ({
            ...prev,
            [providerId]: {}
        }));
    };

    const handleApplyUpdates = async () => {
        // Save only selected models to Firestore
        const modelsToSave = {};
        Object.keys(results).forEach(providerId => {
            if (results[providerId].status === 'success' && selectedModels[providerId]) {
                const allModels = results[providerId].updated;
                const selected = allModels.filter(m => selectedModels[providerId][m.id]);
                if (selected.length > 0) {
                    modelsToSave[providerId] = selected;
                }
            }
        });

        try {
            if (uid) {
                await setUserSettings(uid, { aiModelsOverride: modelsToSave });
            }
        } catch (err) {
            setError('Failed to save models: ' + err.message);
            return;
        }

        // Trigger refresh in parent component
        onModelsUpdated?.();

        // Show success message (no reload needed!)
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
    };

    const handleReset = async () => {
        try {
            if (uid) {
                await setUserSettings(uid, { aiModelsOverride: null });
            }
        } catch (err) {
            setError('Failed to reset models: ' + err.message);
            return;
        }

        // Trigger refresh in parent component
        onModelsUpdated?.();

        // Show success message
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
    };

    const handleToggleExpand = (providerId) => {
        setExpandedProvider(prev => prev === providerId ? null : providerId);
    };

    const modalStyle = dragPos
        ? { position: 'fixed', left: dragPos.x, top: dragPos.y, transform: 'none', zIndex: 50 }
        : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 50 };

    return (
        <>
        <div className={`fixed inset-0 z-40 ${isLight ? 'bg-black/50' : 'bg-black/70'}`} onClick={onClose} />
        <div
            ref={modalRef}
            style={modalStyle}
            className={`w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl ${isLight ? 'bg-white' : 'bg-gray-900 border border-white/20'}`}
        >
                {/* Header - draggable */}
                <div
                    onMouseDown={handleDragStart}
                    className={`p-4 border-b flex-shrink-0 cursor-grab active:cursor-grabbing select-none ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-white/20'}`}
                >
                    <div className="flex items-center justify-between">
                        <h2 className={`text-xl font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                            {language === 'he' ? 'הגדרות' : 'Settings'}
                        </h2>
                        <button
                            onClick={onClose}
                            onMouseDown={e => e.stopPropagation()}
                            className={`p-2 rounded-lg ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
                        >
                            <X size={20} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
                        </button>
                    </div>
                </div>

                {/* Scrollable Content - Scrollbar on Right */}
                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0" dir="ltr">
                    <div className="p-4 space-y-4" dir={language === 'he' ? 'rtl' : 'ltr'}>

                        {/* General Settings */}
                        <div className={`rounded-xl overflow-hidden ${isLight ? 'bg-gray-50 border border-gray-200' : 'bg-white/5 border border-white/10'}`}>
                            <button onClick={() => toggleSection('general')} className={`w-full flex items-center justify-between px-4 py-3 text-start ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/5'} transition-colors`}>
                                <h3 className={`text-sm font-semibold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                                    {language === 'he' ? 'הגדרות כלליות' : 'General Settings'}
                                </h3>
                                <ChevronDown size={15} className={`transition-transform ${collapsed['general'] ? '' : 'rotate-180'} ${isLight ? 'text-gray-400' : 'text-gray-500'}`} />
                            </button>
                            {!collapsed['general'] && <div className="px-4 pt-2 pb-4 space-y-3">
                                {/* Idle timeout */}
                                <div className="flex items-center gap-3">
                                    <span className={`text-sm flex-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                                        {language === 'he' ? 'ניתוק אוטומטי לאחר חוסר פעילות' : 'Auto-logout after inactivity'}
                                    </span>
                                    <button
                                        onClick={() => onIdleTimeoutEnabledChange?.(!idleTimeoutEnabled)}
                                        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${idleTimeoutEnabled ? 'bg-blue-600' : (isLight ? 'bg-gray-300' : 'bg-gray-600')}`}
                                    >
                                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${idleTimeoutEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                    </button>
                                    <input
                                        type="number"
                                        min={1}
                                        max={120}
                                        value={idleTimeoutMinutes}
                                        disabled={!idleTimeoutEnabled}
                                        onChange={e => onIdleTimeoutChange?.(Math.max(1, Math.min(120, Number(e.target.value) || 5)))}
                                        className={`w-14 h-8 text-center rounded-lg px-2 text-sm border transition-opacity ${!idleTimeoutEnabled ? 'opacity-40 cursor-not-allowed' : ''} ${isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-800 border-gray-600 text-white'}`}
                                    />
                                    <span className={`text-sm w-6 transition-opacity ${!idleTimeoutEnabled ? 'opacity-40' : ''} ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                        {language === 'he' ? 'דק׳' : 'min'}
                                    </span>
                                </div>

                                {/* 4% Rule Mode */}
                                <div className={`pt-3 border-t ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={`text-sm font-medium ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                                            {(t && t('fourPercentModeLabel')) || (language === 'he' ? 'מצב כלל 4%' : '4% Rule Mode')}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onFourPercentModeChange?.('net')}
                                            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${fourPercentMode === 'net'
                                                ? 'bg-emerald-600 text-white'
                                                : (isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-white/10 text-gray-300 hover:bg-white/20')}`}
                                        >
                                            {(t && t('fourPercentModeNet')) || (language === 'he' ? 'נטו (מקבל 4%)' : 'Net (take-home = 4%)')}
                                        </button>
                                        <button
                                            onClick={() => onFourPercentModeChange?.('gross')}
                                            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${fourPercentMode === 'gross'
                                                ? 'bg-blue-600 text-white'
                                                : (isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-white/10 text-gray-300 hover:bg-white/20')}`}
                                        >
                                            {(t && t('fourPercentModeGross')) || (language === 'he' ? 'ברוטו (תיק מתרוקן 4%)' : 'Gross (portfolio depletes at 4%)')}
                                        </button>
                                    </div>
                                    <p className={`text-[11px] mt-1.5 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                        {fourPercentMode === 'net'
                                            ? ((t && t('fourPercentModeNetDesc')) || (language === 'he' ? 'מקבל 4%/שנה נטו. התיק מתרוקן מהר יותר בגלל גיוס ברוטו למס.' : 'You receive 4%/year net after tax. Portfolio actually depletes faster.'))
                                            : ((t && t('fourPercentModeGrossDesc')) || (language === 'he' ? 'התיק מושך בדיוק 4% ברוטו/שנה. אחרי מס רווחי הון מקבל פחות.' : 'Portfolio withdraws exactly 4% gross/year. You receive less after capital gains tax.'))}
                                    </p>
                                </div>
                            </div>}
                        </div>

                        {/* Alerts Settings */}
                        <div className={`rounded-xl overflow-hidden ${isLight ? 'bg-gray-50 border border-gray-200' : 'bg-white/5 border border-white/10'}`}>
                            <button onClick={() => toggleSection('alerts')} className={`w-full flex items-center justify-between px-4 py-3 text-start ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/5'} transition-colors`}>
                                <h3 className={`text-sm font-semibold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                                    {language === 'he' ? 'התראות' : 'Alerts'}
                                </h3>
                                <ChevronDown size={15} className={`transition-transform ${collapsed['alerts'] ? '' : 'rotate-180'} ${isLight ? 'text-gray-400' : 'text-gray-500'}`} />
                            </button>
                            {!collapsed['alerts'] && <div className="pt-2 pb-4 space-y-3">
                                <div className="px-4 space-y-2">
                                {ALL_ALERTS.map(alert => {
                                    const isDisabled = disabledAlerts.includes(alert.id);
                                    const dotColor = alert.severity === 'critical' ? 'bg-red-500' : alert.severity === 'warning' ? 'bg-amber-400' : 'bg-blue-400';
                                    return (
                                        <div key={alert.id} className="flex items-center gap-3">
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${isDisabled ? 'opacity-30' : ''}`} />
                                            <span className={`text-sm flex-1 transition-opacity ${isDisabled ? 'opacity-40' : ''} ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                                                {language === 'he' ? alert.labelHe : alert.labelEn}
                                            </span>
                                            <button
                                                onClick={() => onToggleAlert?.(alert.id)}
                                                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${!isDisabled ? 'bg-blue-600' : (isLight ? 'bg-gray-300' : 'bg-gray-600')}`}
                                            >
                                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${!isDisabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                    );
                                })}
                                </div>
                                <div className="px-4">
                                    <SmartAlertsPanel
                                        isHe={language === 'he'}
                                        isLight={isLight}
                                        appState={appState}
                                        aiProvider={aiProvider}
                                        aiModel={aiModel}
                                        apiKeyOverride={apiKeyOverride}
                                    />
                                </div>
                            </div>}
                        </div>

                        <div className={`rounded-xl overflow-hidden ${isLight ? 'bg-gray-50 border border-gray-200' : 'bg-white/5 border border-white/10'}`}>
                            <button onClick={() => toggleSection('models')} className={`w-full flex items-center justify-between px-4 py-3 text-start ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/5'} transition-colors`}>
                                <div className="flex items-center gap-2 min-w-0">
                                    <h3 className={`text-sm font-semibold shrink-0 ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                                        {language === 'he' ? 'מודלי AI' : 'AI Models'}
                                    </h3>
                                    {aiModel && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full truncate max-w-[180px] ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300'}`}>
                                            {aiModel}
                                        </span>
                                    )}
                                </div>
                                <ChevronDown size={15} className={`shrink-0 transition-transform ${collapsed['models'] ? '' : 'rotate-180'} ${isLight ? 'text-gray-400' : 'text-gray-500'}`} />
                            </button>
                            {!collapsed['models'] && <div className="px-4 pt-2 pb-4 space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <p className={`text-sm ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                                    {(t && t('modelsManagerDesc')) || 'Check for available models from each AI provider and update your list.'}
                                </p>
                                <button
                                    onClick={handleRefresh}
                                    disabled={loading}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap ${loading
                                        ? 'opacity-50 cursor-not-allowed bg-gray-400'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                                        }`}
                                >
                                    <RefreshCw className={loading ? 'animate-spin' : ''} size={16} />
                                    {loading ? ((t && t('checking')) || 'Checking...') : ((t && t('checkModels')) || 'Check Models')}
                                </button>
                            </div>

                            {saveSuccess && (
                                <div className={`rounded-lg p-3 flex items-center gap-2 ${isLight ? 'bg-green-50 border border-green-200' : 'bg-green-500/20 border border-green-500'}`}>
                                    <Check size={20} className="text-green-500" />
                                    <span className={isLight ? 'text-green-700 font-medium' : 'text-green-200 font-medium'}>
                                        {(t && t('modelsUpdated')) || 'Models updated successfully!'}
                                    </span>
                                </div>
                            )}

                            {error && (
                                <div className={`rounded-lg p-3 flex items-center gap-2 ${isLight ? 'bg-red-50 border border-red-200' : 'bg-red-500/20 border border-red-500'}`}>
                                    <AlertCircle size={20} className="text-red-500" />
                                    <span className={isLight ? 'text-red-700' : 'text-red-200'}>{error}</span>
                                </div>
                            )}

                            {results && (
                                <div className="space-y-3">
                                    {Object.entries(results).map(([providerId, data]) => (
                                        <ProviderResults
                                            key={providerId}
                                            providerId={providerId}
                                            data={data}
                                            isLight={isLight}
                                            t={t}
                                            selectedModels={selectedModels[providerId] || {}}
                                            onToggleModel={(modelId) => handleToggleModel(providerId, modelId)}
                                            onSelectAll={() => handleSelectAll(providerId)}
                                            onDeselectAll={() => handleDeselectAll(providerId)}
                                            language={language}
                                            expanded={expandedProvider === providerId}
                                            onToggleExpand={() => handleToggleExpand(providerId)}
                                        />
                                    ))}

                                    <div className="flex gap-2 pt-2">
                                        <button
                                            onClick={handleApplyUpdates}
                                            disabled={!Object.values(results).some(r => r.status === 'success')}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Download size={16} />
                                            {(t && t('applyUpdates')) || 'Apply Updates'}
                                        </button>
                                        <button
                                            onClick={handleReset}
                                            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium ${isLight ? 'bg-gray-200 hover:bg-gray-300 text-gray-800' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                                        >
                                            <RotateCcw size={16} />
                                            {(t && t('resetToDefault')) || 'Reset'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

function ProviderResults({ providerId, data, isLight, t, selectedModels, onToggleModel, onSelectAll, onDeselectAll, language, expanded, onToggleExpand }) {
    // Removed local expanded state

    if (data.status === 'error') {
        return (
            <div className={`rounded-lg p-3 border ${isLight ? 'border-gray-300 bg-gray-50' : 'border-red-500/30 bg-red-500/10'}`}>
                <h4 className={`font-semibold capitalize ${isLight ? 'text-gray-900' : 'text-red-400'}`}>
                    {providerId === 'gemini' ? 'Google Gemini' : providerId === 'openai' ? 'OpenAI' : 'Anthropic'}
                </h4>
                <p className={`text-sm mt-1 ${isLight ? 'text-gray-600' : 'text-red-300'}`}>
                    {data.message}
                </p>
            </div>
        );
    }

    const { new: newModels, updated } = data;
    const allModels = updated || [];
    const selectedCount = Object.values(selectedModels).filter(Boolean).length;

    return (
        <div className={`rounded-lg p-3 border ${isLight ? 'border-gray-300 bg-gray-50' : 'border-white/20 bg-white/5'}`}>
            <div className="flex items-center justify-between mb-2">
                <h4 className={`font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                    {providerId === 'gemini' ? 'Google Gemini' : providerId === 'openai' ? 'OpenAI' : 'Anthropic'}
                    <span className={`text-sm font-normal mx-2 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                        ({selectedCount}/{allModels.length} {(t && t('selected')) || 'selected'})
                    </span>
                </h4>
                <div className="flex gap-2">
                    <button
                        onClick={onSelectAll}
                        className={`text-xs px-2 py-1 rounded ${isLight ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}
                    >
                        {(t && t('selectAll')) || 'Select All'}
                    </button>
                    <button
                        onClick={onDeselectAll}
                        className={`text-xs px-2 py-1 rounded ${isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                    >
                        {(t && t('deselectAll')) || 'Deselect All'}
                    </button>
                    <button
                        onClick={onToggleExpand}
                        className={`text-xs px-2 py-1 rounded ${isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                    >
                        {expanded ? '▼' : '▶'}
                    </button>
                </div>
            </div>

            {expanded && (
                <div className={`mt-2 border rounded-lg overflow-hidden ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
                    {/* Inner Scroll Container - Forces Scrollbar to Right */}
                    <div className="max-h-[40vh] overflow-y-auto custom-scrollbar p-1" dir="ltr">
                        {/* Content Container - Restores correct text direction */}
                        <div dir={language === 'he' ? 'rtl' : 'ltr'} className="space-y-1">
                            {allModels
                                // Sort: selected models first, then unselected
                                .sort((a, b) => {
                                    const aSelected = selectedModels[a.id] ? 1 : 0;
                                    const bSelected = selectedModels[b.id] ? 1 : 0;
                                    return bSelected - aSelected; // Selected (1) before unselected (0)
                                })
                                .map(model => {
                                    const isNew = newModels.some(m => m.id === model.id);
                                    const isSelected = selectedModels[model.id];

                                    return (
                                        <label
                                            key={model.id}
                                            className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${isSelected
                                                ? (isLight ? 'bg-blue-50 hover:bg-blue-100' : 'bg-blue-500/10 hover:bg-blue-500/20')
                                                : (isLight ? 'hover:bg-gray-100' : 'hover:bg-white/5')
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => onToggleModel(model.id)}
                                                className="w-4 h-4 rounded border-gray-300"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-medium truncate ${isLight ? 'text-gray-900' : 'text-white'}`}>
                                                        {model.name}
                                                    </span>
                                                    {isNew && (
                                                        <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-600 dark:text-green-400 rounded">
                                                            {(t && t('new')) || 'New'}
                                                        </span>
                                                    )}
                                                    {model.recommended && (
                                                        <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded">
                                                            ⭐
                                                        </span>
                                                    )}
                                                </div>
                                                <p className={`text-xs truncate ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                                    {model.id}
                                                </p>
                                            </div>
                                        </label>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
