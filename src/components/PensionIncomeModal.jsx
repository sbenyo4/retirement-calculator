import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import {
    X,
    Wallet,
    Plus,
    Trash2,
    Edit3,
    Check,
    Calculator,
    TrendingUp,
    Shield,
    Building,
    Coins,
    ChevronDown,
    ChevronUp,
    Info,
    Landmark
} from 'lucide-react';
import {
    calculateNationalInsurance,
    calculatePensionTax,
    calculateIncomeAtAge,
    calculateRetirementIncomeSummary,
    createDefaultIncomeSources
} from '../utils/pensionCalculator';

/**
 * Pension Income Button - placed in toolbar
 */
export function PensionIncomeButton({ onClick, t, disabled = false }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={t('pensionIncomeBtn') || 'Pension Income'}
            className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-medium
                ${disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : isLight
                        ? 'bg-white border border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 shadow-sm'
                        : 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/40 hover:text-indigo-200'
                }`}
        >
            <Wallet size={14} />
            <span className="hidden sm:inline">{t('pensionIncomeBtn') || 'פנסיה'}</span>
        </button>
    );
}

/**
 * Income Source Type Icons
 */
const INCOME_TYPE_ICONS = {
    pension: TrendingUp,
    nationalInsurance: Shield,
    rent: Building,
    capital: Landmark,
    other: Coins
};

/**
 * Income Source Editor Row
 */
function IncomeSourceRow({ source, onUpdate, onDelete, t, language, isLight }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValues, setEditValues] = useState(source);
    const Icon = INCOME_TYPE_ICONS[source.type] || Coins;

    const handleSave = () => {
        // Convert string values to numbers when saving
        onUpdate(source.id, {
            ...editValues,
            amount: parseFloat(editValues.amount) || 0,
            startAge: parseFloat(editValues.startAge) || 0
        });
        setIsEditing(false);
    };

    const displayName = language === 'he' ? source.name : (source.nameEn || source.name);

    const formatCurrency = (val) => {
        return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: language === 'he' ? 'ILS' : 'USD',
            maximumFractionDigits: 0
        }).format(val);
    };

    // Handle numeric input - allow empty string and valid numbers
    const handleNumberChange = (field) => (e) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            setEditValues(prev => ({ ...prev, [field]: value }));
        }
    };

    if (isEditing) {
        return (
            <div className={`p-2 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
                <div className="flex flex-wrap gap-2 items-center">
                    <input
                        type="text"
                        value={editValues.name}
                        onChange={(e) => setEditValues(prev => ({ ...prev, name: e.target.value }))}
                        className={`flex-1 min-w-[100px] px-2 py-1.5 rounded text-sm ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white'} border`}
                        placeholder={t('description') || 'Description'}
                    />
                    <div className="flex items-center gap-1">
                        <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>₪</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={editValues.amount}
                            onChange={handleNumberChange('amount')}
                            className={`w-24 px-2 py-1.5 rounded text-sm no-spinner ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white'} border text-end`}
                            placeholder="0"
                        />
                    </div>
                    <div className="flex items-center gap-1">
                        <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('startAge') || 'מגיל'}</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={editValues.startAge}
                            onChange={handleNumberChange('startAge')}
                            className={`w-14 px-2 py-1.5 rounded text-sm no-spinner ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white'} border text-center`}
                        />
                    </div>
                    <button onClick={handleSave} className="p-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600">
                        <Check size={14} />
                    </button>
                    <button onClick={() => setIsEditing(false)} className={`p-1.5 rounded ${isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
                        <X size={14} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-2 p-2 rounded-lg ${source.enabled !== false ? '' : 'opacity-50'} ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'} transition-colors group`}>
            <div className={`p-1.5 rounded ${isLight ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-500/20 text-emerald-400'}`}>
                <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {displayName}
                    {source.autoCalculated && (
                        <span className={`text-[10px] ms-1 px-1 py-0.5 rounded ${isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/20 text-blue-400'}`}>
                            {t('autoCalculated') || 'אוטומטי'}
                        </span>
                    )}
                </div>
                <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    {t('fromAge') || 'מגיל'} {source.startAge}
                    {source.endAge && ` ${t('toAge') || 'עד'} ${source.endAge}`}
                </div>
            </div>
            <div className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {formatCurrency(source.amount)}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {source.isEditable !== false && (
                    <>
                        <button onClick={() => setIsEditing(true)} className={`p-1 rounded ${isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-gray-400'}`}>
                            <Edit3 size={12} />
                        </button>
                        <button onClick={() => onDelete(source.id)} className={`p-1 rounded ${isLight ? 'hover:bg-red-100 text-red-500' : 'hover:bg-red-500/20 text-red-400'}`}>
                            <Trash2 size={12} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * Age Milestone Summary Card
 */
function MilestoneSummary({ milestone, t, language, isLight, isExpanded, onToggle }) {
    const formatCurrency = (val) => {
        return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: language === 'he' ? 'ILS' : 'USD',
            maximumFractionDigits: 0
        }).format(val);
    };

    const { age, income, accumulatedCapital, monthlyDeficit, monthlySurplus, ageAtDepletion } = milestone;
    const isPositive = monthlySurplus > 0 || monthlyDeficit === 0;

    return (
        <div className={`rounded-lg border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
            <button
                onClick={onToggle}
                className={`w-full flex items-center justify-between p-3 ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'} transition-colors`}
            >
                <div className="flex items-center gap-3">
                    <div className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {t('age') || 'גיל'} {age}
                    </div>
                    <div className={`px-2 py-0.5 rounded text-xs font-medium ${isPositive
                        ? (isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-400')
                        : (isLight ? 'bg-red-100 text-red-700' : 'bg-red-500/20 text-red-400')
                        }`}>
                        {isPositive
                            ? (monthlySurplus > 0 ? `+${formatCurrency(monthlySurplus)}${t('perMonth') || '/חו׳'}` : t('balanced') || 'מאוזן')
                            : `-${formatCurrency(monthlyDeficit)}${t('perMonth') || '/חו׳'}`
                        }
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`text-sm ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`}>
                        {t('accumulatedCapitalAtAge') || 'הון'}: <span className="font-bold">{formatCurrency(accumulatedCapital || 0)}</span>
                    </div>
                    <div className={`text-sm ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                        {t('netIncome') || 'נטו'}: <span className="font-bold">{formatCurrency(income.totalNet)}</span>
                    </div>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </button>

            {isExpanded && (
                <div className={`p-3 border-t ${isLight ? 'border-slate-100 bg-slate-50' : 'border-white/5 bg-black/20'}`}>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                            <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('accumulatedCapitalAtAge') || 'הון צבור'}</div>
                            <div className={`font-medium ${isLight ? 'text-indigo-700' : 'text-indigo-400'}`}>{formatCurrency(accumulatedCapital || 0)}</div>
                        </div>
                        <div>
                            <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('totalGrossPension') || 'ברוטו'}</div>
                            <div className={`font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{formatCurrency(income.totalGross)}</div>
                        </div>
                        <div>
                            <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('totalNetPension') || 'נטו'}</div>
                            <div className={`font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{formatCurrency(income.totalNet)}</div>
                        </div>
                        <div>
                            <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('effectiveTaxRate') || 'מס אפקטיבי'}</div>
                            <div className={`font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{income.effectiveTaxRate}%</div>
                        </div>
                        <div>
                            <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('capitalLastsUntil') || 'הון יספיק עד גיל'}</div>
                            <div className={`font-medium ${ageAtDepletion ? (isLight ? 'text-orange-600' : 'text-orange-400') : (isLight ? 'text-emerald-600' : 'text-emerald-400')}`}>
                                {ageAtDepletion ? ageAtDepletion : '∞'}
                            </div>
                        </div>
                    </div>

                    {income.sources.length > 0 && (
                        <div className={`mt-3 pt-3 border-t ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                            <div className={`text-xs font-medium mb-2 ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                {t('activeIncomeSources') || 'מקורות הכנסה פעילים'}:
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {income.sources.map(source => (
                                    <span key={source.id} className={`text-xs px-2 py-1 rounded ${isLight ? 'bg-slate-200 text-slate-700' : 'bg-white/10 text-gray-300'}`}>
                                        {language === 'he' ? source.name : (source.nameEn || source.name)}: {formatCurrency(source.amount)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Main Pension Income Modal
 */
export function PensionIncomeModal({ inputs, results, onClose, onSave, t, language }) {
    console.log('PensionIncomeModal results:', results);
    const { theme } = useTheme();
    const isLight = theme === 'light';

    // Income sources state
    // Initialize from saved inputs if available, otherwise create defaults
    // Income sources state
    // Initialize from saved inputs if available, otherwise create defaults
    const [incomeSources, setIncomeSources] = useState(() => {
        let sources = inputs.pensionIncomeSources || createDefaultIncomeSources(inputs);

        // Safety check: Ensure National Insurance exists
        const niExists = sources.some(s => s.type === 'nationalInsurance');
        if (!niExists) {
            try {
                const defaults = createDefaultIncomeSources(inputs);
                const niSource = defaults.find(s => s.type === 'nationalInsurance');
                if (niSource) {
                    sources = [...sources, niSource];
                }
            } catch (e) {
                console.error('Error adding default NI:', e);
            }
        }
        return sources;
    });
    const [showIncomeSources, setShowIncomeSources] = useState(true);
    const [expandedMilestone, setExpandedMilestone] = useState(null);

    // Lock body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    // Monthly expenses from profile
    const monthlyExpenses = parseFloat(inputs.monthlyNetIncomeDesired) || 10000;
    const retirementStartAge = parseFloat(inputs.retirementStartAge) || 67;
    const retirementEndAge = parseFloat(inputs.retirementEndAge) || 90;

    // Use Balance at End of Period as requested by user
    const capitalAtRetirement = useMemo(() => {
        // Strict check: if balanceAtEnd exists (even if 0), use it.
        // It matches the dashboard's "Balance at End" box.
        if (results && typeof results.balanceAtEnd !== 'undefined') {
            return results.balanceAtEnd;
        }
        return results?.balanceAtRetirement || 0;
    }, [results]);

    const capitalReturnRate = parseFloat(inputs.annualReturnRate) || 4;

    // Update National Insurance when age changes
    useEffect(() => {
        setIncomeSources(prev => {
            const niSource = prev.find(s => s.type === 'nationalInsurance');
            if (niSource && niSource.autoCalculated) {
                const niCalc = calculateNationalInsurance(Math.max(67, retirementStartAge), 35);
                return prev.map(s =>
                    s.type === 'nationalInsurance'
                        ? { ...s, amount: niCalc.totalMonthly, startAge: Math.max(67, retirementStartAge), calculationDetails: niCalc }
                        : s
                );
            }
            return prev;
        });
    }, [retirementStartAge]);

    // Calculate summary
    const summary = useMemo(() => {
        return calculateRetirementIncomeSummary({
            incomeSources,
            retirementStartAge,
            retirementEndAge,
            capital: capitalAtRetirement,
            monthlyExpenses,
            capitalReturnRate
        });
    }, [incomeSources, retirementStartAge, retirementEndAge, capitalAtRetirement, monthlyExpenses, capitalReturnRate]);

    // Add new income source
    const addIncomeSource = (type = 'other') => {
        const getSourceName = () => {
            switch (type) {
                case 'pension': return { name: 'קצבה', nameEn: 'Annuity' };
                case 'capital': return { name: 'הון נוסף', nameEn: 'Capital Addition' };
                default: return { name: 'קצבה', nameEn: 'Annuity' };
            }
        };
        const names = getSourceName();
        const newSource = {
            id: `income_${Date.now()}`,
            type, // 'pension' acts as general annuity, 'capital' as lump sum
            name: names.name,
            nameEn: names.nameEn,
            amount: 0,
            startAge: retirementEndAge, // Default to pension age
            endAge: null,
            isTaxable: type !== 'capital', // Capital usually not taxed as income
            isLumpSum: type === 'capital', // Mark as lump sum (not monthly)
            enabled: true,
            isEditable: true
        };
        setIncomeSources(prev => [...prev, newSource]);
    };

    // Update income source
    const updateIncomeSource = (id, updates) => {
        setIncomeSources(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    // Delete income source
    const deleteIncomeSource = (id) => {
        setIncomeSources(prev => prev.filter(s => s.id !== id));
    };

    // Format currency
    const formatCurrency = useCallback((val) => {
        return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: language === 'he' ? 'ILS' : 'USD',
            maximumFractionDigits: 0
        }).format(val);
    }, [language]);

    // Calculate total accumulated capital (base + lump sums)
    const totalAccumulatedCapital = useMemo(() => {
        const lumpSumTotal = incomeSources
            .filter(s => s.isLumpSum && s.enabled !== false)
            .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
        return capitalAtRetirement + lumpSumTotal;
    }, [incomeSources, capitalAtRetirement]);

    // Total gross annuity income (excluding lump sums) at pension age
    const incomeAtPensionAge = useMemo(() => {
        // Filter only annuity sources (not lump sums)
        const annuitySources = incomeSources.filter(s => !s.isLumpSum);
        return calculateIncomeAtAge(annuitySources, retirementEndAge);
    }, [incomeSources, retirementEndAge]);

    // Track changes
    const initialIncomeSources = useMemo(() => inputs.pensionIncomeSources || createDefaultIncomeSources(inputs), [inputs]);
    const hasChanges = useMemo(() => {
        const clean = (sources) => sources.map(s => {
            const { calculationDetails, ...rest } = s;
            return rest;
        });
        return JSON.stringify(clean(incomeSources)) !== JSON.stringify(clean(initialIncomeSources));
    }, [incomeSources, initialIncomeSources]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className={`relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${isLight ? 'bg-white' : 'bg-gray-900'}`}>
                {/* Header */}
                <div className={`flex items-center justify-between p-4 border-b ${isLight ? 'border-slate-200 bg-gradient-to-r from-emerald-50 to-teal-50' : 'border-white/10 bg-gradient-to-r from-emerald-900/30 to-teal-900/30'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isLight ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            <Wallet size={20} />
                        </div>
                        <div>
                            <h2 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                {t('pensionIncome') || 'הכנסות פנסיוניות'}
                            </h2>
                            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                {t('pensionIncomeDesc') || 'סיכום הכנסות בפרישה לפי גיל'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-lg transition-colors ${isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content - Fixed Height Main Container with Flex Layout */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-4 space-y-4">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className={`p-3 rounded-lg ${isLight ? 'bg-blue-50 border border-blue-100' : 'bg-blue-500/10 border border-blue-500/20'}`}>
                            <div className={`text-xs ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>{t('capitalAtRetirement') || 'הון בפרישה'}</div>
                            <div className={`text-lg font-bold ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>{formatCurrency(capitalAtRetirement)}</div>
                        </div>
                        <div className={`p-3 rounded-lg ${isLight ? 'bg-emerald-50 border border-emerald-100' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                            <div className={`text-xs ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>{t('totalGrossPension') || 'קצבה ברוטו'}</div>
                            <div className={`text-lg font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>{formatCurrency(incomeAtPensionAge.totalGross)}</div>
                        </div>
                        <div className={`p-3 rounded-lg ${isLight ? 'bg-purple-50 border border-purple-100' : 'bg-purple-500/10 border border-purple-500/20'}`}>
                            <div className={`text-xs ${isLight ? 'text-purple-600' : 'text-purple-400'}`}>{t('totalNetPension') || 'קצבה נטו'}</div>
                            <div className={`text-lg font-bold ${isLight ? 'text-purple-700' : 'text-purple-300'}`}>{formatCurrency(incomeAtPensionAge.totalNet)}</div>
                        </div>
                        <div className={`p-3 rounded-lg ${isLight ? 'bg-orange-50 border border-orange-100' : 'bg-orange-500/10 border border-orange-500/20'}`}>
                            <div className={`text-xs ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>{t('monthlyExpenses') || 'הוצאות חודשיות'}</div>
                            <div className={`text-lg font-bold ${isLight ? 'text-orange-700' : 'text-orange-300'}`}>{formatCurrency(monthlyExpenses)}</div>
                        </div>
                    </div>

                    {/* Income Sources */}
                    <div className={`rounded-xl border transition-all duration-300 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                        <div
                            className={`flex items-center justify-between p-3 cursor-pointer ${showIncomeSources ? (isLight ? 'border-b border-slate-200' : 'border-b border-white/10') : ''}`}
                            onClick={() => setShowIncomeSources(!showIncomeSources)}
                        >
                            <div className="flex items-center gap-2">
                                <button className={`p-1 rounded-full transition-colors ${isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}>
                                    {showIncomeSources ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                                <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                    {t('incomeSources') || 'מקורות הכנסה'}
                                </h3>
                                {!showIncomeSources && (
                                    <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                        ({incomeSources.length})
                                    </span>
                                )}
                            </div>

                            {showIncomeSources && (
                                <div className="flex gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => addIncomeSource('pension')}
                                        className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 ${isLight ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}
                                    >
                                        <Plus size={14} />
                                        {t('addAnnuity') || 'הוסף קצבה'}
                                    </button>
                                    <button
                                        onClick={() => addIncomeSource('capital')}
                                        className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 ${isLight ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'}`}
                                    >
                                        <Plus size={14} />
                                        {t('addCapital') || 'הוסף הון'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {showIncomeSources && (
                            <div className="p-2 space-y-1 max-h-44 overflow-y-auto custom-scrollbar scrollbar-right animate-in slide-in-from-top-2 fade-in duration-200">
                                {incomeSources.map(source => (
                                    <IncomeSourceRow
                                        key={source.id}
                                        source={source}
                                        onUpdate={updateIncomeSource}
                                        onDelete={deleteIncomeSource}
                                        t={t}
                                        language={language}
                                        isLight={isLight}
                                    />
                                ))}
                                {incomeSources.length === 0 && (
                                    <div className={`text-center py-4 text-sm ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                                        {t('noIncomeSources') || 'לא הוגדרו מקורות הכנסה'}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Age Milestones */}
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                {t('incomeByAge') || 'הכנסה לפי גיל'}
                            </h3>
                            <div className={`flex items-center gap-1.5 text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                <Info size={12} />
                                <span>{t('pensionDisclaimer') || 'הערכה בלבד (2026)'}</span>
                            </div>
                        </div>
                        <div className="space-y-2 overflow-y-auto custom-scrollbar scrollbar-right -mr-2 pr-2">
                            {summary.milestones.map((milestone, idx) => (
                                <MilestoneSummary
                                    key={milestone.age}
                                    milestone={milestone}
                                    t={t}
                                    language={language}
                                    isLight={isLight}
                                    isExpanded={expandedMilestone === idx}
                                    onToggle={() => setExpandedMilestone(expandedMilestone === idx ? null : idx)}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className={`flex justify-end gap-3 p-4 border-t ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-black/20'}`}>
                    <button
                        onClick={onClose}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                        {t('close') || 'סגור'}
                    </button>
                    {onSave && (
                        <button
                            onClick={() => onSave(incomeSources)}
                            disabled={!hasChanges}
                            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 relative
                                ${hasChanges
                                    ? (isLight ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md transform hover:-translate-y-0.5' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20')
                                    : (isLight ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-gray-500 cursor-not-allowed')
                                }`}
                        >
                            <Check size={16} className={hasChanges ? "animate-pulse" : ""} />
                            {t('save') || 'שמור'}
                            {hasChanges && <span className="absolute top-0 right-0 -mt-1 -mr-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>}
                            {hasChanges && <span className="absolute top-0 right-0 -mt-1 -mr-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}

export default PensionIncomeModal;
