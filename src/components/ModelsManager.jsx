import React, { useState, useEffect } from 'react';
import { RefreshCw, Check, X, AlertCircle, Download, RotateCcw, Settings } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { fetchAllAvailableModels, compareModels } from '../utils/ai-models-fetcher';
import { AI_MODELS_CONFIG } from '../config/ai-models';

export function ModelsManager({ apiKeys, onClose, onModelsUpdated, t, language }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [selectedModels, setSelectedModels] = useState({});

    const [expandedProvider, setExpandedProvider] = useState(null);

    const handleRefresh = async () => {
        setLoading(true);
        setError(null);

        try {
            const fetched = await fetchAllAvailableModels(apiKeys);

            // Get current config from localStorage if available, otherwise use static config
            let currentConfig = AI_MODELS_CONFIG;
            try {
                const override = localStorage.getItem('ai_models_override');
                if (override) {
                    const parsed = JSON.parse(override);
                    // Merge localStorage models into config structure
                    currentConfig = {};
                    Object.keys(AI_MODELS_CONFIG).forEach(providerId => {
                        currentConfig[providerId] = {
                            ...AI_MODELS_CONFIG[providerId],
                            models: parsed[providerId] || AI_MODELS_CONFIG[providerId].models
                        };
                    });
                }
            } catch (e) {
                console.error('Failed to load localStorage models:', e);
            }

            const comparison = compareModels(fetched, currentConfig);
            setResults(comparison);

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

    const handleApplyUpdates = () => {
        // Save only selected models to localStorage
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

        console.log('Saving models to localStorage:', modelsToSave);
        localStorage.setItem('ai_models_override', JSON.stringify(modelsToSave));

        // Verify save
        const saved = localStorage.getItem('ai_models_override');
        console.log('Verified save:', saved);

        // Trigger refresh in parent component
        onModelsUpdated?.();

        // Show success message (no reload needed!)
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
    };

    const handleReset = () => {
        localStorage.removeItem('ai_models_override');

        // Trigger refresh in parent component
        onModelsUpdated?.();

        // Show success message
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
    };

    const handleToggleExpand = (providerId) => {
        setExpandedProvider(prev => prev === providerId ? null : providerId);
    };

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isLight ? 'bg-black/50' : 'bg-black/70'}`}>
            <div className={`w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl ${isLight ? 'bg-white' : 'bg-gray-900 border border-white/20'}`}>
                {/* Header - Fixed */}
                <div className={`p-4 border-b flex-shrink-0 ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-white/20'}`}>
                    <div className="flex items-center justify-between">
                        <h2 className={`text-xl font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                            {(t && t('manageModels')) || 'AI Models Manager'}
                        </h2>
                        <button
                            onClick={onClose}
                            className={`p-2 rounded-lg ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
                        >
                            <X size={20} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
                        </button>
                    </div>
                </div>

                {/* Scrollable Content - Scrollbar on Right */}
                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0" dir="ltr">
                    <div className="p-4 space-y-4" dir={language === 'he' ? 'rtl' : 'ltr'}>
                        <div className="space-y-4">
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
                        </div>
                    </div>
                </div>
            </div>
        </div>
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

    const { new: newModels, removed, existing, updated } = data;
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
                                    const isExisting = existing.some(m => m.id === model.id);
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
