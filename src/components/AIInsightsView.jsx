
import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Sparkles, AlertTriangle, CheckCircle, TrendingUp, Shield, Target, Brain } from 'lucide-react';
import { getAIInsights } from '../utils/ai-insights';

export default function AIInsightsView({ inputs, results, aiProvider, aiModel, apiKeyOverride, language = 'he', t, insightsData, onInsightsChange }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isHebrew = language === 'he';

    const [loading, setLoading] = useState(false);
    // Local state removed in favor of lifted state
    const [error, setError] = useState(null);

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getAIInsights(inputs, results, aiProvider, aiModel, apiKeyOverride, language);
            if (onInsightsChange) {
                onInsightsChange(data);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Use insightsData from props
    const insights = insightsData;

    // Styling
    const cardClass = isLight ? "bg-white border border-slate-300 shadow-md" : "bg-white/5 border border-white/10";
    const textPrimary = isLight ? "text-slate-900" : "text-white";
    const textSecondary = isLight ? "text-slate-600" : "text-gray-400";

    const safeT = (key, fallback) => t ? (t(key) || fallback) : fallback;

    // Error Parsing
    const getFriendlyError = (err) => {
        if (!err) return null;
        if (err.includes('429')) return {
            title: safeT('errorHighTraffic', 'High Traffic'),
            desc: safeT('errorHighTrafficDesc', 'Rate limit exceeded.')
        };
        if (err.includes('403') || err.includes('API key')) return {
            title: safeT('errorApiKey', 'API Key Issue'),
            desc: safeT('errorApiKeyDesc', 'Check settings.')
        };
        return {
            title: safeT('aiError', 'AI Error'),
            desc: null
        };
    };

    if (!insights && !loading && !error) {
        return (
            <div className={`flex flex-col items-center justify-center h-full p-8 text-center space-y-4 ${textSecondary}`}>
                <div className={`p-4 rounded-full ${isLight ? 'bg-purple-100' : 'bg-purple-900/30'}`}>
                    <Brain size={48} className="text-purple-500" />
                </div>
                <div>
                    <h3 className={`text-lg font-semibold ${textPrimary}`}>
                        {safeT('getAiInsights', 'Get AI Insights')}
                    </h3>
                    <p className="text-sm max-w-xs mx-auto mt-2">
                        {safeT('getAiInsightsDesc', 'Use AI to analyze your financial situation and get personalized recommendations.')}
                    </p>
                </div>
                <button
                    onClick={handleGenerate}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-full font-medium shadow-lg transition-all"
                >
                    <Sparkles size={18} />
                    {safeT('analyzeNow', 'Analyze Now')}
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Brain size={24} className="text-purple-600 animate-pulse" />
                    </div>
                </div>
                <p className={`${textSecondary} animate-pulse`}>
                    {safeT('processingInsights', 'Processing data and generating insights...')}
                </p>
            </div>
        );
    }

    const errorObj = error ? getFriendlyError(error) : null;

    return (
        // Force LTR for scrollbar position, then set direction back for content
        // max-h-[600px] limits the height to prevent expanding the dashboard indefinitely
        <div className="max-h-[600px] h-full overflow-y-auto px-1 custom-scrollbar" dir="ltr">
            <div className={`p-4 space-y-6 ${isHebrew ? 'rtl' : 'ltr'}`} dir={isHebrew ? 'rtl' : 'ltr'}>
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl relative overflow-hidden">
                        <div className="flex flex-col gap-3 relative z-10">
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-red-500/20 rounded-full shrink-0">
                                    <AlertTriangle size={24} className="text-red-500" />
                                </div>
                                <div className="flex-1">
                                    <h3 className={`font-bold text-lg ${isLight ? 'text-red-800' : 'text-red-200'}`}>
                                        {errorObj.title}
                                    </h3>
                                    {errorObj.desc && (
                                        <p className={`text-sm ${isLight ? 'text-red-700' : 'text-red-300'} mb-2`}>
                                            {errorObj.desc}
                                        </p>
                                    )}
                                    <details className="text-xs opacity-70 cursor-pointer mt-2">
                                        <summary className="hover:opacity-100 transition-opacity mb-1">
                                            {safeT('errorDetails', 'Show Error Details')}
                                        </summary>
                                        <pre className="p-2 bg-black/20 rounded overflow-x-auto whitespace-pre-wrap">
                                            {error}
                                        </pre>
                                    </details>
                                </div>
                            </div>
                            <div className="flex justify-end mt-2">
                                <button
                                    onClick={handleGenerate}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                                >
                                    {safeT('tryAgain', 'Try Again')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {insights && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Header Score Section */}
                        <div className={`${cardClass} rounded-xl p-6 relative overflow-hidden`}>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>

                            <div className="flex items-center gap-6">
                                <div className="relative flex-shrink-0">
                                    <svg className="w-24 h-24 transform -rotate-90">
                                        <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className={isLight ? "text-gray-200" : "text-white/10"} />
                                        <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                                            strokeDasharray={251.2}
                                            strokeDashoffset={251.2 - (251.2 * insights.readinessScore / 100)}
                                            className={`${insights.readinessScore > 75 ? 'text-green-500' : insights.readinessScore > 50 ? 'text-yellow-500' : 'text-red-500'} transition-all duration-1000 ease-out`}
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                                        <span className={`text-2xl font-bold ${textPrimary}`}>{insights.readinessScore}</span>
                                    </div>
                                </div>
                                <div>
                                    <h2 className={`text-xl font-bold ${textPrimary} mb-2`}>
                                        {safeT('readinessScore', 'Readiness Score')}
                                    </h2>
                                    <p className={`text-sm ${textSecondary} leading-relaxed`}>
                                        {insights.executiveSummary}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Analysis Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Strengths */}
                            <div className={`${cardClass} rounded-xl p-4 border-l-4 border-l-green-500`}>
                                <h3 className={`flex items-center gap-2 font-semibold ${textPrimary} mb-3`}>
                                    <CheckCircle size={18} className="text-green-500" />
                                    {safeT('strengths', 'Strengths')}
                                </h3>
                                <ul className="space-y-2">
                                    {insights.analysis.strengths.map((str, i) => (
                                        <li key={i} className={`text-sm ${textSecondary} flex items-start gap-2`}>
                                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                                            {str}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Weaknesses */}
                            <div className={`${cardClass} rounded-xl p-4 border-l-4 border-l-red-500`}>
                                <h3 className={`flex items-center gap-2 font-semibold ${textPrimary} mb-3`}>
                                    <AlertTriangle size={18} className="text-red-500" />
                                    {safeT('attentionNeeded', 'Attention Needed')}
                                </h3>
                                <ul className="space-y-2">
                                    {insights.analysis.weaknesses.map((weak, i) => (
                                        <li key={i} className={`text-sm ${textSecondary} flex items-start gap-2`}>
                                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                            {weak}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Market Dependency */}
                        <div className={`${cardClass} rounded-xl p-4`}>
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp size={18} className="text-blue-500" />
                                <h3 className={`font-semibold ${textPrimary}`}>
                                    {safeT('marketDependency', 'Market Dependency')}
                                </h3>
                            </div>
                            <p className={`text-sm ${textSecondary}`}>
                                {insights.analysis.marketDependency}
                            </p>
                        </div>

                        {/* Recommendations */}
                        <div>
                            <h3 className={`text-lg font-bold ${textPrimary} mb-4 flex items-center gap-2`}>
                                <Target size={20} className="text-purple-500" />
                                {safeT('recommendations', 'Recommendations')}
                            </h3>
                            <div className="grid gap-4">
                                {insights.recommendations.map((rec, i) => (
                                    <div key={i} className={`${cardClass} rounded-xl p-4 hover:border-purple-500/30 transition-colors`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className={`font-semibold ${textPrimary}`}>{rec.title}</h4>
                                            <span className="text-[10px] uppercase font-bold tracking-wider text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded">
                                                {safeT('impact', 'Impact')}
                                            </span>
                                        </div>
                                        <p className={`text-sm ${textSecondary} mb-2`}>{rec.description}</p>
                                        <div className="flex items-center gap-1 text-xs font-medium text-purple-600/80">
                                            <Shield size={12} />
                                            <span>{rec.impact}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Conclusion */}
                        <div className={`p-4 rounded-xl bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-200/20`}>
                            <p className={`text-sm font-medium ${isLight ? 'text-blue-900' : 'text-blue-100'} text-center italic`}>
                                "{insights.conclusion}"
                            </p>
                        </div>

                        <div className="text-center pt-4">
                            <button
                                onClick={handleGenerate}
                                className={`text-xs ${textSecondary} hover:text-purple-500 underline transition-colors`}
                            >
                                {safeT('regenerateInsights', 'Regenerate Insights')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
