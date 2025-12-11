import React, { useRef, useEffect, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { getAvailableProviders, getAvailableModels, generatePrompt } from '../utils/ai-calculator';
import { SIMULATION_TYPES } from '../utils/simulation-calculator';
import { Calculator, Sparkles, Split, Dices, Cpu, Server, Bot, Eye, Settings, X, Check, Calendar, TrendingUp, Coins, BarChart3, Landmark } from 'lucide-react';
import { CustomSelect } from './common/CustomSelect';

export default function InputForm({
    inputs, setInputs, t, language,
    grossWithdrawal, neededToday, capitalPreservation, capitalPreservationNeededToday,
    calculationMode, setCalculationMode,
    aiProvider, setAiProvider,
    aiModel, setAiModel,
    apiKeyOverride, setApiKeyOverride,
    simulationType, setSimulationType,
    onAiCalculate, aiInputsChanged, aiLoading,
    showInterestSensitivity, setShowInterestSensitivity,
    showIncomeSensitivity, setShowIncomeSensitivity
}) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const currency = t('currency');

    // Theme-aware styles
    const containerClass = isLight ? "bg-white border border-gray-200 shadow-sm" : "bg-white/5 border border-white/10";
    const labelClass = isLight ? "text-gray-600" : "text-gray-400"; // For secondary labels
    const headerLabelClass = isLight ? "text-gray-900" : "text-white";
    // SIMPLIFIED SELECT CLASS: Removed ring/border color classes here as they are handled by global CSS '!important'
    const selectClass = isLight
        ? "bg-white text-gray-900"
        : "bg-black/20 border border-white/30 text-white";
    const optionClass = isLight ? "bg-white text-gray-900" : "bg-gray-800 text-white";
    const iconClass = isLight ? "text-gray-500" : "text-gray-400";
    const inputClass = isLight
        ? "bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-blue-500 shadow-sm"
        : "bg-black/20 border border-white/50 text-white placeholder-gray-500";

    // Store whether buttons should be visible (persist across re-renders)
    const showNeededTodayBtn = useRef(false);
    const showCapitalPreservationBtn = useRef(false);
    const [showApiKey, setShowApiKey] = useState(false);

    // Update button visibility based on values
    useEffect(() => {
        if (neededToday > 0) showNeededTodayBtn.current = true;
        if (capitalPreservationNeededToday > 0 || capitalPreservation > 0) showCapitalPreservationBtn.current = true;
    }, [neededToday, capitalPreservationNeededToday, capitalPreservation]);

    const formatCurrency = (value) => {
        return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: language === 'he' ? 'ILS' : 'USD',
            maximumFractionDigits: 0
        }).format(value);
    };

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

    const handleBirthdateChange = (e) => {
        const date = e.target.value;
        const birthDateObj = new Date(date);
        const today = new Date();

        // Calculate precise age including decimals
        let age = (today - birthDateObj) / (1000 * 60 * 60 * 24 * 365.25);

        // Only update if age is reasonable (0-120)
        if (age >= 0 && age <= 120) {
            setInputs(prev => ({
                ...prev,
                birthdate: date,
                currentAge: age.toFixed(2) // Keep as string for input
            }));
        } else {
            // Just update birthdate but don't update age
            setInputs(prev => ({
                ...prev,
                birthdate: date
            }));
        }
    };

    const availableProviders = getAvailableProviders();
    const availableModels = aiProvider ? getAvailableModels(aiProvider) : [];

    return (
        <div>
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
                                        className="w-1/3 min-w-0"
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
                    <div className={`${containerClass} rounded-xl p-2 space-y-1 animate-in fade-in slide-in-from-top-2 relative z-[50]`}>
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
                                className={`p-1.5 rounded-lg transition-all flex items-center justify-center self-end ${aiInputsChanged
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
                            <p className={`text-[10px] ${labelClass} text-right px-1`}>
                                {simulationType === SIMULATION_TYPES.CONSERVATIVE && t('conservativeDesc')}
                                {simulationType === SIMULATION_TYPES.OPTIMISTIC && t('optimisticDesc')}
                                {simulationType === SIMULATION_TYPES.MONTE_CARLO && t('monteCarloDesc')}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 3.666V14m-3.75-4.333a4.5 4.5 0 00-9 0V16.5A2.25 2.25 0 005.25 18.75h13.5A2.25 2.25 0 0021 16.5v-3.833a4.5 4.5 0 00-9 0v-2.667z" />
                </svg>
                <h2 className="text-sm font-semibold text-white">{t('parameters')}</h2>
            </div>

            <div className="space-y-1">
                <div className="grid grid-cols-2 gap-1">
                    <InputGroup
                        label={t('birthdate')}
                        name="birthdate"
                        type="date"
                        value={inputs.birthdate}
                        onChange={handleBirthdateChange}
                        icon={<Calendar size={14} />}
                    />
                    <InputGroup
                        label={t('currentAge')}
                        name="currentAge"
                        value={inputs.currentAge}
                        onChange={handleChange}
                        icon={<Calendar size={14} />}
                    />
                </div>

                <div className="grid grid-cols-2 gap-1">
                    <InputGroup
                        label={t('startAge')}
                        name="retirementStartAge"
                        value={inputs.retirementStartAge}
                        onChange={handleChange}
                        icon={<TrendingUp size={14} />}
                    />
                    <InputGroup
                        label={t('endAge')}
                        name="retirementEndAge"
                        value={inputs.retirementEndAge}
                        onChange={handleChange}
                        icon={<Calendar size={14} />}
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
                    value={inputs.monthlyNetIncomeDesired}
                    onChange={handleChange}
                    prefix={currency}
                    icon={<span className="text-green-400">{currency}</span>}
                    extraLabel={grossWithdrawal ? `(${t('gross')}: ${formatCurrency(grossWithdrawal)})` : null}
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
            </div>
        </div >
    );
}

function InputGroup({ label, name, value, onChange, icon, prefix, type = "text", extraLabel, extraContent, titleActions }) {
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
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                        {prefix}
                    </span>
                )}
                <input
                    type={type}
                    name={name}
                    value={value}
                    onChange={onChange}
                    className={`w-full rounded-lg py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${prefix ? 'pl-5' : ''} ${extraContent ? 'pr-16' : ''} ${isLight
                        ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400'
                        : 'bg-black/20 border border-white/50 text-white placeholder-gray-500'}`}
                />
                {extraContent}
            </div>
        </div>
    );
}
