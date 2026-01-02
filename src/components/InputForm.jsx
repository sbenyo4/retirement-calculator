import React, { useRef, useEffect, useState, useMemo, useCallback, memo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { getAvailableProviders, getAvailableModels, generatePrompt } from '../utils/ai-calculator';
import { SIMULATION_TYPES } from '../utils/simulation-calculator';
import { WITHDRAWAL_STRATEGIES } from '../constants';
import { Calculator, Sparkles, Split, Dices, Cpu, Server, Bot, Eye, Settings, X, Check, Calendar, TrendingUp, Coins, BarChart3, Landmark, PiggyBank, Wallet } from 'lucide-react';
import { CustomSelect } from './common/CustomSelect';
import LifeEventsManager from './LifeEventsManager';

const InputForm = memo(function InputForm({
    inputs,
    setInputs,
    t,
    language,
    grossWithdrawal,
    netWithdrawal,
    neededToday,
    capitalPreservation,
    capitalPreservationNeededToday,
    results,
    calculationMode,
    setCalculationMode,
    aiProvider,
    setAiProvider,
    aiModel,
    setAiModel,
    apiKeyOverride,
    setApiKeyOverride,
    simulationType,
    setSimulationType,
    onAiCalculate,
    aiInputsChanged,
    aiLoading,
    showInterestSensitivity,
    setShowInterestSensitivity,
    showIncomeSensitivity,
    setShowIncomeSensitivity,
    showAgeSensitivity,
    setShowAgeSensitivity
}) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const currency = language === 'he' ? '₪' : '$';

    // Theme-aware styles
    const containerClass = isLight ? "bg-white border border-gray-200 shadow-sm" : "bg-white/5 border border-white/10";
    const labelClass = isLight ? "text-gray-600" : "text-gray-400"; // For secondary labels
    const headerLabelClass = isLight ? "text-gray-900" : "text-white";
    // SIMPLIFIED SELECT CLASS: Removed ring/border color classes here as they are handled by global CSS '!important'
    const selectClass = isLight
        ? "bg-slate-50 border border-gray-300 text-gray-900"
        : "bg-black/20 border border-white/30 text-white";
    const optionClass = isLight ? "bg-white text-gray-900" : "bg-gray-800 text-white";
    const iconClass = isLight ? "text-gray-500" : "text-gray-400";
    const inputClass = isLight
        ? "bg-slate-50 border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-blue-500 shadow-sm"
        : "bg-black/20 border border-white/50 text-white placeholder-gray-500";

    // Store whether buttons should be visible (persist across re-renders)
    const showNeededTodayBtn = useRef(false);
    const showCapitalPreservationBtn = useRef(false);
    const [showApiKey, setShowApiKey] = useState(false);
    // View Toggle State: 'parameters' | 'events'
    const [activeView, setActiveView] = useState('parameters');

    // Update button visibility based on values
    useEffect(() => {
        if (neededToday > 0) showNeededTodayBtn.current = true;
        if (capitalPreservationNeededToday > 0 || capitalPreservation > 0) showCapitalPreservationBtn.current = true;
    }, [neededToday, capitalPreservationNeededToday, capitalPreservation]);

    // Memoized currency formatter for performance
    const currencyFormatter = useMemo(() => new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: language === 'he' ? 'ILS' : 'USD',
        maximumFractionDigits: 0
    }), [language]);

    const formatCurrency = useCallback((value) => {
        return currencyFormatter.format(value);
    }, [currencyFormatter]);

    // Validation errors
    const validationErrors = useMemo(() => {
        const errors = {};
        const currentAge = parseFloat(inputs.currentAge);
        const retirementStart = parseFloat(inputs.retirementStartAge);
        const retirementEnd = parseFloat(inputs.retirementEndAge);

        if (!isNaN(currentAge) && !isNaN(retirementStart) && retirementStart <= currentAge) {
            errors.retirementStartAge = language === 'he'
                ? 'צריך להיות גדול מהגיל הנוכחי'
                : 'Must be greater than current age';
        }
        if (!isNaN(retirementStart) && !isNaN(retirementEnd) && retirementEnd <= retirementStart) {
            errors.retirementEndAge = language === 'he'
                ? 'צריך להיות גדול מגיל הפרישה'
                : 'Must be greater than start age';
        }
        if (!isNaN(currentAge) && (currentAge < 0 || currentAge > 120)) {
            errors.currentAge = language === 'he' ? 'גיל לא תקין' : 'Invalid age';
        }

        return errors;
    }, [inputs.currentAge, inputs.retirementStartAge, inputs.retirementEndAge, language]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        // Allow empty string or valid number/decimal input
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            // For age-related fields, cap at 120
            let finalValue = value;
            if ((name === 'currentAge' || name === 'retirementStartAge' || name === 'retirementEndAge') && value !== '') {
                const numValue = parseFloat(value);
                if (numValue > 120) {
                    finalValue = '120';
                }
            }

            setInputs(prev => ({
                ...prev,
                [name]: finalValue
            }));
        }
    };

    const calculateAgeFromDate = useCallback((dateString) => {
        if (!dateString) return null;
        const birthDateObj = new Date(dateString);
        const today = new Date();
        const age = (today - birthDateObj) / (1000 * 60 * 60 * 24 * 365.25);
        return age;
    }, []);

    // Check if current age is manually set (differs from calculated age)
    const isAgeManual = useMemo(() => {
        if (!inputs.birthdate || !inputs.currentAge) return false;
        const calculated = calculateAgeFromDate(inputs.birthdate);
        if (calculated === null) return false;
        // If difference is significant (more than 0.01 years ~ 3.65 days)
        return Math.abs(parseFloat(inputs.currentAge) - calculated) > 0.01;
    }, [inputs.birthdate, inputs.currentAge, calculateAgeFromDate]);

    const handleBirthdateChange = (e) => {
        const date = e.target.value;
        const age = calculateAgeFromDate(date);

        // Only update if age is reasonable (0-120)
        if (age !== null && age >= 0 && age <= 120) {
            setInputs(prev => ({
                ...prev,
                birthdate: date,
                currentAge: age.toFixed(2) // Update age to match birthdate (Reset Manual Mode)
            }));
        } else {
            setInputs(prev => ({
                ...prev,
                birthdate: date
            }));
        }
    };

    const availableProviders = getAvailableProviders();
    const availableModels = aiProvider ? getAvailableModels(aiProvider) : [];

    // Calculate projected years
    const currentYear = new Date().getFullYear();
    const getProjectedYear = (targetAge) => {
        if (!targetAge || !inputs.currentAge) return null;
        const target = parseFloat(targetAge);
        const current = parseFloat(inputs.currentAge);
        if (isNaN(target) || isNaN(current)) return null;

        // Use birthdate for projection ONLY if age is NOT manual
        if (inputs.birthdate && !isAgeManual) {
            return new Date(inputs.birthdate).getFullYear() + target;
        }
        // Fallback or Manual Age: Use current year + age difference
        return Math.floor(currentYear + (target - current));
    };

    const startYear = getProjectedYear(inputs.retirementStartAge);
    const endYear = getProjectedYear(inputs.retirementEndAge);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Calculation Mode Selector */}
            <div className="mb-1 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                    <Cpu className={`h-4 w-4 ${isLight ? 'text-purple-600' : 'text-purple-400'}`} />
                    <h2 className={`text-sm font-semibold ${headerLabelClass}`}>{t('calculationMode')}</h2>
                </div>

                <div className={`grid grid-cols-4 gap-2 p-1 rounded-lg ${isLight ? 'bg-slate-200' : 'bg-black/20'}`}>
                    {[
                        { id: 'mathematical', icon: Calculator, label: t('mathematical') },
                        { id: 'ai', icon: Sparkles, label: t('aiMode') },
                        { id: 'simulations', icon: Dices, label: t('simulations') },
                        { id: 'compare', icon: Split, label: t('compare') }
                    ].map(mode => (
                        <button
                            key={mode.id}
                            onClick={() => setCalculationMode(mode.id)}
                            className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${calculationMode === mode.id
                                ? 'bg-blue-600 shadow-lg mode-btn-active text-white'
                                : (isLight
                                    ? 'bg-white text-slate-700 shadow-sm hover:bg-slate-50'
                                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200')
                                }`}
                            title={mode.label}
                        >
                            <mode.icon size={20} />
                            <span className="text-xs mt-1 font-medium hidden md:block">{mode.label}</span>
                        </button>
                    ))}
                </div>

                {/* Combined Settings for Compare Mode */}
                {calculationMode === 'compare' && (
                    <div className={`${containerClass} rounded-xl p-2 animate-in fade-in slide-in-from-top-2 relative z-[50]`}>
                        <div className="grid grid-cols-1 gap-2">
                            {/* AI Section */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                    <label className={`text-[10px] ${isLight ? 'text-purple-600' : 'text-purple-300'} flex items-center gap-1 font-medium`}>
                                        <Sparkles size={10} /> {t('aiMode')}
                                    </label>
                                    <div className="flex gap-1">
                                        <button onClick={() => { const prompt = generatePrompt(inputs); alert(prompt); }} className={`${iconClass} hover:text-blue-500`} title="Show Prompt"><Eye size={10} /></button>
                                        <div className="relative group">
                                            <button className={`${iconClass} hover:text-blue-500`} title="API Key"><Settings size={10} /></button>
                                            <div className={`absolute right-0 top-full mt-1 w-48 border rounded-lg p-2 shadow-xl hidden group-hover:block z-[100] ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-white/20'}`}>
                                                <input type="password" value={apiKeyOverride} onChange={(e) => setApiKeyOverride(e.target.value)} placeholder="API Key" className={`w-full rounded py-0.5 px-1 text-[10px] ${inputClass}`} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <CustomSelect
                                        value={aiProvider}
                                        onChange={(val) => {
                                            setAiProvider(val);
                                            const models = getAvailableModels(val);
                                            if (models.length > 0) setAiModel(models[0].id);
                                        }}
                                        options={availableProviders.map(p => ({ value: p.id, label: p.name }))}
                                        className="flex-[1.2] min-w-0"
                                    />
                                    <CustomSelect
                                        value={aiModel}
                                        onChange={(val) => setAiModel(val)}
                                        options={availableModels.map(m => ({ value: m.id, label: m.name }))}
                                        disabled={!aiProvider}
                                        className="flex-1 min-w-0"
                                    />
                                    <button onClick={onAiCalculate} disabled={aiLoading} className={`p-1 rounded transition-all ${aiInputsChanged ? 'bg-purple-600 text-white' : (isLight ? 'bg-gray-100 text-green-600' : 'bg-white/5 text-green-400')}`} title={t('generate')}>
                                        {aiLoading ? <div className={`w-2 h-2 border-2 ${isLight ? 'border-gray-300 border-t-blue-600' : 'border-white/30 border-t-white'} rounded-full animate-spin`} /> : <Sparkles size={10} />}
                                    </button>
                                </div>
                            </div>

                            {/* Divider */}
                            <div className={`border-t ${isLight ? 'border-gray-200' : 'border-white/5'}`}></div>

                            {/* Simulation Section */}
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between gap-2">
                                    <label className={`text-[10px] ${isLight ? 'text-pink-600' : 'text-pink-300'} flex items-center gap-1 font-medium whitespace-nowrap`}>
                                        <Dices size={10} /> {t('simulationType')}
                                    </label>
                                    <CustomSelect
                                        value={simulationType}
                                        onChange={(val) => setSimulationType(val)}
                                        options={[
                                            { value: SIMULATION_TYPES.MONTE_CARLO, label: t('monteCarlo') },
                                            { value: SIMULATION_TYPES.CONSERVATIVE, label: t('conservative') },
                                            { value: SIMULATION_TYPES.OPTIMISTIC, label: t('optimistic') }
                                        ]}
                                        className="flex-1"
                                    />
                                </div>
                                <p className={`text-[9px] text-right px-1 ${labelClass}`}>
                                    {simulationType === SIMULATION_TYPES.CONSERVATIVE && t('conservativeDesc')}
                                    {simulationType === SIMULATION_TYPES.OPTIMISTIC && t('optimisticDesc')}
                                    {simulationType === SIMULATION_TYPES.MONTE_CARLO && t('monteCarloDesc')}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Individual Settings (Only when NOT in Compare Mode) */}
                {calculationMode === 'ai' && (
                    <div className={`${containerClass} rounded-xl p-1.5 space-y-0.5 animate-in fade-in slide-in-from-top-2 relative z-[50]`}>
                        {/* Headers Row with Labels and Actions */}
                        <div className="flex items-center px-1 gap-2">
                            <div className="flex flex-[1.2] min-w-0">
                                <label className={`text-[10px] ${labelClass} flex items-center gap-1`}>
                                    <Server size={10} /> {t('selectProvider')}
                                </label>
                            </div>
                            <div className="flex flex-1 min-w-0">
                                <label className={`text-[10px] ${labelClass} flex items-center gap-1`}>
                                    <Bot size={10} /> {t('selectModel')}
                                </label>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const prompt = generatePrompt(inputs);
                                        alert(prompt);
                                    }}
                                    className={`${iconClass} hover:text-blue-500 transition-colors`}
                                    title="Show Prompt"
                                >
                                    <Eye size={12} />
                                </button>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className={`transition-colors ${showApiKey ? 'text-blue-500' : `${iconClass} hover:text-blue-500`}`}
                                        title="API Key Settings"
                                    >
                                        <Settings size={12} />
                                    </button>
                                    {/* Dropdown for API Key - High Z-Index */}
                                    {showApiKey && (
                                        <div className={`absolute right-0 top-full mt-1 w-64 border rounded-xl p-3 shadow-xl z-[100] ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-white/20'}`}>
                                            <div className="flex justify-between items-center mb-2">
                                                <label className={`text-[10px] ${labelClass} flex items-center gap-1`}>
                                                    <span className="text-yellow-400">🔑</span> API Key Override
                                                </label>
                                                <button onClick={() => setShowApiKey(false)} className={`${iconClass} hover:text-blue-500`}>
                                                    <X size={12} />
                                                </button>
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    type="password"
                                                    value={apiKeyOverride}
                                                    onChange={(e) => setApiKeyOverride(e.target.value)}
                                                    placeholder="Override .env key"
                                                    className={`flex-1 rounded-lg py-1 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ${inputClass}`}
                                                />
                                                <button
                                                    onClick={() => setShowApiKey(false)}
                                                    className="bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-600/50 rounded-lg px-2 flex items-center justify-center"
                                                    title="Done"
                                                >
                                                    <Check size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Controls Row */}
                        <div className="flex items-center gap-2">
                            <CustomSelect
                                value={aiProvider}
                                onChange={(val) => {
                                    setAiProvider(val);
                                    const models = getAvailableModels(val);
                                    if (models.length > 0) setAiModel(models[0].id);
                                }}
                                options={availableProviders.map(p => ({ value: p.id, label: p.name }))}
                                className="flex-[1.2] min-w-0"
                            />

                            <CustomSelect
                                value={aiModel}
                                onChange={(val) => setAiModel(val)}
                                options={availableModels.map(m => ({ value: m.id, label: m.name }))}
                                disabled={!aiProvider}
                                className="flex-1 min-w-0"
                            />

                            {/* Compact Calculate Button/Icon */}
                            <button
                                onClick={onAiCalculate}
                                disabled={aiLoading}
                                className={`p-1 rounded-lg transition-all flex items-center justify-center self-end ${aiInputsChanged
                                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg'
                                    : (isLight ? 'bg-gray-100 text-green-600 hover:bg-gray-200' : 'bg-white/5 text-green-400 hover:bg-white/10')
                                    }`}
                                title={t('generate')}
                            >
                                {aiLoading ? (
                                    <div className={`w-3 h-3 border-2 ${isLight ? 'border-gray-300 border-t-blue-600' : 'border-white/30 border-t-white'} rounded-full animate-spin`} />
                                ) : (
                                    <Sparkles size={14} className={!aiInputsChanged ? "opacity-70" : ""} />
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Simulation Settings (Only when NOT in Compare Mode) */}
                {calculationMode === 'simulations' && (
                    <div className={`${containerClass} rounded-xl p-2 space-y-1 animate-in fade-in slide-in-from-top-2`}>
                        <div className="space-y-1">
                            <label className={`text-[10px] ${labelClass} flex items-center gap-1`}>
                                <Dices size={10} /> {t('simulationType')}
                            </label>
                            <CustomSelect
                                value={simulationType}
                                onChange={(val) => setSimulationType(val)}
                                options={[
                                    { value: SIMULATION_TYPES.MONTE_CARLO, label: t('monteCarlo') },
                                    { value: SIMULATION_TYPES.CONSERVATIVE, label: t('conservative') },
                                    { value: SIMULATION_TYPES.OPTIMISTIC, label: t('optimistic') }
                                ]}
                                className="w-full"
                            />
                            <p className={`text-[10px] px-1 ${labelClass}`}>
                                {simulationType === SIMULATION_TYPES.CONSERVATIVE && t('conservativeDesc')}
                                {simulationType === SIMULATION_TYPES.OPTIMISTIC && t('optimisticDesc')}
                                {simulationType === SIMULATION_TYPES.MONTE_CARLO && t('monteCarloDesc')}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* View Toggle (Parameters / Events) */}
            <div className={`flex p-1 rounded-lg mb-2 ${isLight ? 'bg-gray-100' : 'bg-white/5'}`}>
                <button
                    onClick={() => setActiveView('parameters')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-all ${activeView === 'parameters'
                        ? (isLight ? 'bg-white text-blue-600 shadow-sm' : 'bg-blue-600 text-white shadow')
                        : (isLight ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200')
                        }`}
                >
                    <Settings size={14} />
                    {t('parameters')}
                </button>
                <button
                    onClick={() => setActiveView('events')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-all ${activeView === 'events'
                        ? (isLight ? 'bg-white text-blue-600 shadow-sm' : 'bg-blue-600 text-white shadow')
                        : (isLight ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200')
                        }`}
                >
                    <Calendar size={14} />
                    {t ? t('lifeEventsTimeline') || 'Life Events' : 'Life Events'}
                    {inputs.lifeEvents?.length > 0 && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeView === 'events'
                            ? 'bg-white/20 text-current'
                            : (isLight ? 'bg-gray-200 text-gray-600' : 'bg-gray-700 text-gray-300')
                            }`}>
                            {inputs.lifeEvents.length}
                        </span>
                    )}
                </button>
            </div>

            {activeView === 'parameters' ? (
                <div className="space-y-1 animate-in fade-in slide-in-from-left-2 duration-200 flex-1 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-1">
                        <InputGroup
                            label={t('birthdate')}
                            name="birthdate"
                            type="date"
                            value={inputs.birthdate}
                            onChange={handleBirthdateChange}
                            icon={<Calendar size={14} />}
                            extraContent={isAgeManual && (
                                <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] bg-yellow-500/20 text-yellow-500 px-1 rounded">
                                    {language === 'he' ? 'ידני' : 'Manual'}
                                </span>
                            )}
                            disabledStyle={isAgeManual} // Custom prop to style it as "ignored"
                        />
                        <InputGroup
                            label={t('currentAge')}
                            name="currentAge"
                            value={inputs.currentAge}
                            onChange={handleChange}
                            icon={<Calendar size={14} />}
                            error={validationErrors.currentAge}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                        <InputGroup
                            label={t('startAge')}
                            name="retirementStartAge"
                            value={inputs.retirementStartAge}
                            onChange={handleChange}
                            icon={<TrendingUp size={14} />}
                            error={validationErrors.retirementStartAge}
                            extraLabel={startYear ? `(${startYear})` : null}
                        />
                        <InputGroup
                            label={t('endAge')}
                            name="retirementEndAge"
                            value={inputs.retirementEndAge}
                            onChange={handleChange}
                            icon={<Calendar size={14} />}
                            error={validationErrors.retirementEndAge}
                            extraLabel={endYear ? `(${endYear})` : null}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                        <InputGroup
                            label={t('currentSavings')}
                            name="currentSavings"
                            value={inputs.currentSavings}
                            onChange={handleChange}
                            prefix={currency}
                            icon={<Coins size={14} />}
                            titleActions={
                                <>
                                    {showNeededTodayBtn.current && (
                                        <button
                                            onClick={() => {
                                                const current = parseFloat(inputs.currentSavings) || 0;
                                                setInputs(prev => ({ ...prev, currentSavings: Math.round(current + neededToday) }));
                                            }}
                                            disabled={neededToday <= 0}
                                            className={`p-1 hover:bg-white/10 rounded transition-colors ${neededToday <= 0
                                                ? 'text-gray-600 cursor-not-allowed opacity-50'
                                                : 'text-orange-400 hover:text-orange-300'
                                                }`}
                                            title={t('neededToday')}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                            </svg>
                                        </button>
                                    )}
                                    {showCapitalPreservationBtn.current && (
                                        <button
                                            onClick={() => {
                                                const current = parseFloat(inputs.currentSavings) || 0;
                                                const target = Math.max(0, capitalPreservationNeededToday || 0) || capitalPreservation;
                                                setInputs(prev => ({ ...prev, currentSavings: Math.round(current + target) }));
                                            }}
                                            disabled={(capitalPreservationNeededToday || capitalPreservation) <= 0}
                                            className={`p-1 hover:bg-white/10 rounded transition-colors ${(capitalPreservationNeededToday || capitalPreservation) <= 0
                                                ? 'text-gray-600 cursor-not-allowed opacity-50'
                                                : 'text-emerald-400 hover:text-emerald-300'
                                                }`}
                                            title={t('capitalPreservation')}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </button>
                                    )}
                                </>
                            }
                        />
                        <InputGroup
                            label={t('monthlyContribution')}
                            name="monthlyContribution"
                            value={inputs.monthlyContribution}
                            onChange={handleChange}
                            prefix={currency}
                            icon={<Coins size={14} />}
                        />
                    </div>

                    <InputGroup
                        label={t('monthlyNetIncomeDesired')}
                        name="monthlyNetIncomeDesired"
                        value={
                            // For strategies that calculate income, show calculated value
                            (inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.FOUR_PERCENT ||
                                inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.PERCENTAGE ||
                                inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.INTEREST_ONLY)
                                ? Math.round(netWithdrawal || 0)
                                : inputs.monthlyNetIncomeDesired
                        }
                        onChange={handleChange}
                        prefix={currency}
                        icon={<Wallet size={14} className="text-green-400" />}
                        extraLabel={grossWithdrawal ? `(${t('gross')}: ${formatCurrency(grossWithdrawal)})` : null}
                        disabled={
                            inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.FOUR_PERCENT ||
                            inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.PERCENTAGE ||
                            inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.INTEREST_ONLY
                        }
                    />

                    <div className="grid grid-cols-2 gap-1">
                        <InputGroup
                            label={t('annualReturnRate')}
                            name="annualReturnRate"
                            value={inputs.annualReturnRate}
                            onChange={handleChange}
                            icon={<BarChart3 size={14} />}
                        />
                        <InputGroup
                            label={t('taxRate')}
                            name="taxRate"
                            value={inputs.taxRate}
                            onChange={handleChange}
                            icon={<Landmark size={14} />}
                        />
                    </div>

                    {/* Withdrawal Strategy Selector */}
                    <div className={`${containerClass} rounded-xl p-2 space-y-1 mt-2`}>
                        <div className="flex items-center gap-1 mb-1">
                            <PiggyBank size={14} className={isLight ? 'text-emerald-600' : 'text-emerald-400'} />
                            <label className={`text-xs font-medium ${headerLabelClass}`}>{t('withdrawalStrategy')}</label>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                            {[
                                { id: WITHDRAWAL_STRATEGIES.FIXED, label: t('withdrawalFixed') },
                                { id: WITHDRAWAL_STRATEGIES.FOUR_PERCENT, label: t('withdrawalFourPercent') },
                                { id: WITHDRAWAL_STRATEGIES.PERCENTAGE, label: t('withdrawalPercentage') },
                                { id: WITHDRAWAL_STRATEGIES.DYNAMIC, label: t('withdrawalDynamic') },
                                { id: WITHDRAWAL_STRATEGIES.INTEREST_ONLY, label: t('withdrawalInterestOnly') }
                            ].map(strategy => (
                                <button
                                    key={strategy.id}
                                    onClick={() => setInputs(prev => ({ ...prev, withdrawalStrategy: strategy.id }))}
                                    className={`px-2 py-1.5 rounded-lg text-[10px] md:text-xs font-medium transition-all ${(inputs.withdrawalStrategy || WITHDRAWAL_STRATEGIES.FIXED) === strategy.id
                                        ? 'bg-emerald-600 text-white shadow-md'
                                        : (isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/5 text-gray-400 hover:bg-white/10')
                                        }`}
                                >
                                    {strategy.label}
                                </button>
                            ))}
                        </div>
                        <p className={`text-[10px] px-1 ${labelClass}`}>
                            {inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.FOUR_PERCENT && t('withdrawalFourPercentDesc')}
                            {inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.PERCENTAGE && t('withdrawalPercentageDesc')}
                            {inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.DYNAMIC && t('withdrawalDynamicDesc')}
                            {inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.INTEREST_ONLY && t('withdrawalInterestOnlyDesc')}
                            {(!inputs.withdrawalStrategy || inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.FIXED) && t('withdrawalFixedDesc')}
                        </p>
                        {/* Percentage Rate Input (only for percentage strategy) */}
                        {inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.PERCENTAGE && (
                            <InputGroup
                                label={t('withdrawalPercentageRate')}
                                name="withdrawalPercentage"
                                value={inputs.withdrawalPercentage || '4'}
                                onChange={handleChange}
                                icon={<BarChart3 size={14} />}
                            />
                        )}
                    </div>
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-right-2 duration-200 flex-1 flex flex-col min-h-0">
                    {/* Life Events Timeline */}
                    <LifeEventsManager
                        events={inputs.lifeEvents || []}
                        onChange={(newEvents) => setInputs(prev => ({ ...prev, lifeEvents: newEvents }))}
                        t={t}
                        language={language}
                        currentAge={parseFloat(inputs.currentAge) || 0}
                        retirementAge={parseFloat(inputs.retirementStartAge) || 67}
                        retirementEndAge={parseFloat(inputs.retirementEndAge) || 100}
                        birthDate={inputs.birthdate}
                        results={results}
                        setInputs={setInputs}
                        calculationMode={calculationMode}
                        simulationType={simulationType}
                    />
                </div>
            )}
        </div>

    );
});

export default InputForm;


function InputGroup({ label, name, value, onChange, icon, prefix, type = "text", extraLabel, extraContent, titleActions, disabled = false, error, disabledStyle = false }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';

    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex justify-between items-center min-h-6">
                <label className={`text-xs font-medium flex items-center gap-1 h-4 ${isLight ? 'text-gray-700' : 'text-gray-200'}`}>
                    {icon} {label}
                </label>
                {extraLabel && (
                    <span className="text-[10px] text-yellow-400 font-medium">
                        {extraLabel}
                    </span>
                )}
                {titleActions && (
                    <div className="flex items-center gap-1">
                        {titleActions}
                    </div>
                )}
            </div>
            <div className="relative">
                {prefix && (
                    <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs ${disabled ? 'text-gray-500' : 'text-gray-400'}`}>
                        {prefix}
                    </span>
                )}
                <input
                    type={type}
                    name={name}
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                    autoComplete="off"
                    className={`w-full rounded-lg py-1 px-2 text-xs transition-all ${prefix ? 'pl-5' : ''} ${extraContent ? 'pr-16' : ''} ${error
                        ? 'border-red-500 focus:ring-red-500'
                        : ''} ${disabled
                            ? (isLight
                                ? 'bg-gray-100 border border-gray-200 text-gray-500 cursor-not-allowed'
                                : 'bg-white/5 border border-white/20 text-gray-400 cursor-not-allowed')
                            : (isLight
                                ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
                                : 'bg-black/20 border border-white/50 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500')
                        } ${disabledStyle ? 'opacity-50 grayscale' : ''}`}
                />
                {extraContent}
            </div>
            {error && (
                <span className="text-[10px] text-red-400">{error}</span>
            )}
        </div>
    );
}
