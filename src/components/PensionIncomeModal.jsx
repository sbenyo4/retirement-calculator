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
    Landmark,
    Settings,
    Table,
    AlertTriangle
} from 'lucide-react';
import {
    calculateNationalInsurance,
    calculatePensionTax,
    calculateIncomeAtAge,
    calculateRetirementIncomeSummary,
    createDefaultIncomeSources,
    PENSION_TAX_BRACKETS
} from '../utils/pensionCalculator';
import { FiscalUpdateModal } from './FiscalUpdateModal';

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
                <span className="text-[10px] font-normal ms-1 opacity-60">
                    {source.isTaxable !== false ? (language === 'he' ? '(ברוטו)' : '(Gross)') : ''}
                </span>
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

                    {/* Income Test Warning - HIDDEN as per user request */}

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
export function PensionIncomeModal({ inputs, results, onClose, onSave, t, language, aiProvider, aiModel, apiKeyOverride, fiscalParameters, familyStatus, onUpdateFiscalData }) {
    console.log('PensionIncomeModal results:', results);
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const [showFiscalModal, setShowFiscalModal] = useState(false);
    const [showBracketTable, setShowBracketTable] = useState(false);

    // Helper to calculate NI with income test and 67 vs 70 logic
    const calculateEffectiveNI = useCallback((sources, currentRetirementStartAge) => {
        const nonNISources = sources.filter(s => s.type !== 'nationalInsurance' && !s.isLumpSum && s.enabled !== false);
        const otherIncomeAt67 = nonNISources.reduce((sum, s) => {
            const isActiveAt67 = 67 >= s.startAge && (s.endAge === null || 67 < s.endAge);
            return sum + (isActiveAt67 ? (parseFloat(s.amount) || 0) : 0);
        }, 0);

        // ALWAYS pass 0 as otherIncome to bypass the income test logic as per user request
        // This ensures the displayed start age is 67, not 70
        const niCalc = calculateNationalInsurance(67, inputs.contributionYears || 35, fiscalParameters, familyStatus, 0);

        // If fail income test at 67, effective start age is 70 (when test no longer applies)
        let effectiveStartAge = 67;
        let displayAmount = niCalc.totalMonthly;

        if (niCalc.incomeTest.applied && niCalc.totalMonthly === 0) {
            effectiveStartAge = 70;
            // At 70, the test doesn't apply, so recalculate without otherIncome
            const niAt70 = calculateNationalInsurance(70, 35, fiscalParameters, familyStatus, 0);
            displayAmount = niAt70.totalMonthly;
        }

        const finalStartAge = Math.max(effectiveStartAge, currentRetirementStartAge);
        return { amount: displayAmount, startAge: finalStartAge, calculationDetails: niCalc };
    }, [fiscalParameters, familyStatus]);

    // Income sources state
    // Initialize from saved inputs if available, otherwise create defaults
    // Helper to get safe sources with NI guaranteed
    const getSafeSources = useCallback(() => {
        let sources = inputs.pensionIncomeSources || createDefaultIncomeSources(inputs);
        const niExists = sources.some(s => s.type === 'nationalInsurance');

        // Ensure NI exists
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

        // Recalculate NI with current parameters using the same dynamic logic as the editor
        const retStartAge = parseFloat(inputs.retirementStartAge) || 67;
        sources = sources.map(s => {
            if (s.type === 'nationalInsurance' && s.autoCalculated) {
                const { amount, startAge, calculationDetails } = calculateEffectiveNI(sources, retStartAge);
                return {
                    ...s,
                    amount,
                    startAge,
                    calculationDetails
                };
            }
            return s;
        });

        return sources;
    }, [inputs, fiscalParameters, familyStatus, calculateEffectiveNI]);

    const [incomeSources, setIncomeSources] = useState(getSafeSources);
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

    // Update National Insurance when age changes or income sources change
    const nonNISourcesKey = JSON.stringify(incomeSources.filter(s => s.type !== 'nationalInsurance').map(s => ({ id: s.id, amount: s.amount, startAge: s.startAge, endAge: s.endAge, enabled: s.enabled })));

    useEffect(() => {
        setIncomeSources(prev => {
            const niSource = prev.find(s => s.type === 'nationalInsurance');
            if (niSource && niSource.autoCalculated) {
                const { amount, startAge, calculationDetails } = calculateEffectiveNI(prev, retirementStartAge);

                // Only update if something actually changed to avoid extra renders
                if (niSource.amount !== amount || niSource.startAge !== startAge) {
                    return prev.map(s =>
                        s.type === 'nationalInsurance'
                            ? { ...s, amount, startAge, calculationDetails }
                            : s
                    );
                }
            }
            return prev;
        });
    }, [retirementStartAge, nonNISourcesKey, calculateEffectiveNI]);

    // Calculate summary
    const summary = useMemo(() => {
        return calculateRetirementIncomeSummary({
            incomeSources,
            retirementStartAge,
            retirementEndAge,
            capital: capitalAtRetirement,
            monthlyExpenses,
            capitalReturnRate,
            parameters: fiscalParameters
                ? { ...fiscalParameters, retirementAge: retirementStartAge, familyStatus, ignoreIncomeTest: true }
                : { familyStatus, retirementAge: retirementStartAge, ignoreIncomeTest: true }
        });
    }, [incomeSources, retirementStartAge, retirementEndAge, capitalAtRetirement, monthlyExpenses, capitalReturnRate, fiscalParameters, familyStatus]);

    // Local state for stable editing
    const calculatedThreshold = React.useMemo(() => {
        return Math.round(calculateNationalInsurance(67, 35, fiscalParameters, familyStatus).incomeTest.threshold);
    }, [fiscalParameters, familyStatus]);

    // Baseline threshold (system default, ignoring user overrides) for comparison
    const baselineThreshold = React.useMemo(() => {
        const isCouple = familyStatus && familyStatus.includes('couple');
        return isCouple ? 26968 : 20226; // Hardcoded system defaults from pensionCalculator.js
    }, [familyStatus]);

    // Initialize editing state
    const [editThreshold, setEditThreshold] = useState(calculatedThreshold.toString());
    const [isEditing, setIsEditing] = useState(false);

    // Check if manually modified (compare against BASELINE, not overridden value)
    const isModified = React.useMemo(() => {
        const val = parseInt(editThreshold.replace(/[^\d]/g, ''), 10) || 0;
        return val !== baselineThreshold;
    }, [editThreshold, baselineThreshold]);

    // Sync local state ONLY when fiscalParameters actually changes from external source
    // Use a ref to track if WE initiated the change (to prevent resetting our own edits)
    const lastCommittedValue = React.useRef(calculatedThreshold);

    React.useEffect(() => {
        // Only update if the external value changed AND we're not editing
        if (!isEditing && calculatedThreshold !== lastCommittedValue.current) {
            setEditThreshold(calculatedThreshold.toString());
            lastCommittedValue.current = calculatedThreshold;
        }
    }, [calculatedThreshold, isEditing]);

    const handleThresholdCommit = () => {
        setIsEditing(false);
        if (!onUpdateFiscalData) return;

        // Remove commas or non-digits before parsing
        const val = parseInt(editThreshold.replace(/[^\d]/g, ''), 10) || 0;

        // Don't update if value hasn't effectively changed
        if (val === calculatedThreshold) return;

        // Update the ref to prevent the sync useEffect from reverting our change
        lastCommittedValue.current = val;

        const currentParams = fiscalParameters || {};
        const isCouple = familyStatus && familyStatus.includes('couple');
        const field = isCouple ? 'couple' : 'single';

        const newParams = JSON.parse(JSON.stringify(currentParams));
        if (!newParams.nationalInsurance) newParams.nationalInsurance = {};
        // Ensure baseRates exists with defaults if missing
        if (!newParams.nationalInsurance.baseRates) {
            newParams.nationalInsurance.baseRates = {
                single: 1838,
                single_child: 2419,
                couple: 2762,
                couple_child: 3343,
                seniorityAdditionPerYear: 2
            };
        }
        if (!newParams.nationalInsurance.incomeTestThreshold) {
            newParams.nationalInsurance.incomeTestThreshold = { single: 20226, couple: 26968 };
        }

        newParams.nationalInsurance.incomeTestThreshold[field] = val;

        onUpdateFiscalData({ parameters: newParams, familyStatus });
    };

    const handleThresholdChange = (e) => {
        // Allow only numbers
        const val = e.target.value.replace(/[^\d]/g, '');
        setEditThreshold(val);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur(); // Triggers handleThresholdCommit via onBlur
        }
    };

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

    // Total gross annuity income (excluding lump sums) at age 67 for National Insurance income test
    const incomeAtNIStart = useMemo(() => {
        const annuitySources = incomeSources.filter(s => !s.isLumpSum);
        // We calculate specifically at age 67 because that's when the income test begins for Old Age pension
        return calculateIncomeAtAge(annuitySources, 67, fiscalParameters ? { ...fiscalParameters, retirementAge: retirementStartAge, familyStatus } : { familyStatus, retirementAge: retirementStartAge });
    }, [incomeSources, fiscalParameters, retirementStartAge, familyStatus]);

    // NI calculation for summary display (at age 67 OR 70 based on income test)
    // NI calculation for summary display (at age 67, ignoring income test as per user request)
    const niCalc = useMemo(() => {
        // ALWAYS pass 0 as otherIncome to bypass the income test logic
        // User requested to "cancel the income test entirely" and assume eligibility at 67
        return calculateNationalInsurance(67, 35, fiscalParameters, familyStatus, 0);
    }, [fiscalParameters, familyStatus]);

    // Total gross annuity income (excluding lump sums) at pension period end
    const incomeAtPensionAge = useMemo(() => {
        // Filter only annuity sources (not lump sums)
        const annuitySources = incomeSources.filter(s => !s.isLumpSum);
        return calculateIncomeAtAge(annuitySources, retirementEndAge, fiscalParameters ? { ...fiscalParameters, retirementAge: retirementStartAge, familyStatus } : { familyStatus, retirementAge: retirementStartAge });
    }, [incomeSources, retirementEndAge, fiscalParameters, retirementStartAge, familyStatus]);

    // Track changes
    const initialIncomeSources = useMemo(() => getSafeSources(), [getSafeSources]);
    const hasChanges = useMemo(() => {
        const clean = (sources) => sources.map(s => {
            const { calculationDetails, ...rest } = s;
            return rest;
        });
        return JSON.stringify(clean(incomeSources)) !== JSON.stringify(clean(initialIncomeSources));
    }, [incomeSources, initialIncomeSources]);

    return (
        <>
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
                                <div className="flex items-center gap-2">
                                    <h2 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                        {t('pensionIncome') || 'הכנסות פנסיוניות'}
                                    </h2>
                                    <button
                                        onClick={() => setShowFiscalModal(true)}
                                        className={`p-1.5 rounded-full transition-colors ${isLight ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                                        title={t('fiscalSettings') || 'הגדרות מיסוי'}
                                    >
                                        <Settings size={14} />
                                    </button>
                                    <button
                                        onClick={() => setShowBracketTable(true)}
                                        className={`p-1.5 rounded-full transition-colors ${isLight ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                                        title={t('viewTaxBrackets') || 'צפה במדרגות המס'}
                                    >
                                        <Table size={14} />
                                    </button>
                                </div>
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
                                <div className={`text-xs ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                                    {t('totalGrossPension') || 'קצבה ברוטו'}
                                    <span className="text-[10px] opacity-60 ms-1 font-normal">(ברוטו)</span>
                                </div>
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
                                onClick={() => {
                                    onSave(incomeSources);
                                    onClose();
                                }}
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

                <FiscalUpdateModal
                    isOpen={showFiscalModal}
                    onClose={() => setShowFiscalModal(false)}
                    onSave={onUpdateFiscalData}
                    currentParameters={fiscalParameters}
                    currentFamilyStatus={familyStatus}
                    t={t}
                    language={language}
                    aiProvider={aiProvider}
                    aiModel={aiModel}
                    apiKeyOverride={apiKeyOverride}
                />

                {/* Bracket Overlay Viewer */}
                {showBracketTable && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowBracketTable(false)} />
                        <div className={`relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden border ${isLight ? 'bg-white border-slate-200' : 'bg-gray-900 border-white/10'}`}>
                            <div className={`p-4 border-b flex justify-between items-center ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                                <h3 className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                    {language === 'he' ? 'מדרגות מס ופטור פנסיוני 2026' : 'Tax Brackets & Exemptions 2026'}
                                </h3>
                                <button onClick={() => setShowBracketTable(false)} className="p-1 hover:bg-black/10 rounded-full transition-colors">
                                    <X size={20} className={isLight ? 'text-slate-500' : 'text-gray-400'} />
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto max-h-[85vh] custom-scrollbar">
                                <div className="space-y-6">
                                    {/* Income Tax Brackets */}
                                    <div>
                                        <h4 className="text-sm font-bold mb-3 flex items-center gap-2 text-indigo-500">
                                            <TrendingUp size={14} />
                                            {language === 'he' ? 'מדרגות מס הכנסה (חודשי)' : 'Income Tax Brackets (Monthly)'}
                                        </h4>
                                        <table className="w-full text-xs text-left">
                                            <thead>
                                                <tr className={isLight ? 'text-slate-500' : 'text-gray-400'}>
                                                    <th className="pb-2 font-medium">{language === 'he' ? 'עד הכנסה' : 'Limit'}</th>
                                                    <th className="pb-2 font-medium text-center">{language === 'he' ? 'שיעור מס' : 'Rate'}</th>
                                                </tr>
                                            </thead>
                                            <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-white/5'}`}>
                                                {(fiscalParameters?.taxBrackets || PENSION_TAX_BRACKETS).map((b, i) => (
                                                    <tr key={i} className={isLight ? 'text-slate-700' : 'text-gray-300'}>
                                                        <td className="py-2">{(b.limit === Infinity || b.limit === null) ? (language === 'he' ? 'ומעלה' : 'and above') : formatCurrency(b.limit)}</td>
                                                        <td className="py-2 text-center font-bold">{Math.round(b.rate * 100)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* NI Rates */}
                                    <div>
                                        <h4 className="text-sm font-bold mb-3 flex items-center gap-2 text-blue-500">
                                            <Shield size={14} />
                                            {language === 'he' ? 'קצבת זקנה - ביטוח לאומי' : 'National Insurance - Old Age'}
                                        </h4>
                                        <div className={`p-3 rounded-lg text-xs ${isLight ? 'bg-blue-50 text-blue-800' : 'bg-blue-500/10 text-blue-300'}`}>
                                            <div className="flex justify-between mb-1">
                                                <span>{language === 'he' ? 'סטטוס נוכחי:' : 'Current Status:'}</span>
                                                <span className="font-bold">
                                                    {(!familyStatus || familyStatus === 'single') ? (language === 'he' ? 'יחיד/ה' : 'Single') :
                                                        familyStatus === 'single_child' ? (language === 'he' ? 'יחיד/ה + ילד' : 'Single + Child') :
                                                            familyStatus === 'couple' ? (language === 'he' ? 'זוג' : 'Couple') :
                                                                familyStatus === 'couple_child' ? (language === 'he' ? 'זוג + ילד' : 'Couple + Child') : familyStatus}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>{language === 'he' ? 'סכום בסיס:' : 'Base Amount:'}</span>
                                                <span className="font-bold">{formatCurrency(niCalc.basePension)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>{language === 'he' ? 'תוספת ותק:' : 'Seniority Bonus:'}</span>
                                                <span dir="ltr" className="font-bold flex items-center gap-1.5">
                                                    <span>{Math.round(niCalc.seniorityBonusPercent)}%</span>
                                                    <span className="opacity-70 text-[10px] font-normal">({formatCurrency(niCalc.seniorityBonus)})</span>
                                                </span>
                                            </div>

                                            {/* Deferral Bonus - Only show if deferred to 70 */}
                                            {niCalc.deferralBonusPercent > 0 && (
                                                <div className="flex justify-between text-blue-600 font-medium">
                                                    <span>{language === 'he' ? 'תוספת דחייה (גיל 70):' : 'Deferral Bonus (Age 70):'}</span>
                                                    <span dir="ltr" className="font-bold flex items-center gap-1.5">
                                                        <span>{Math.round(niCalc.deferralBonusPercent)}%</span>
                                                        <span className="opacity-70 text-[10px] font-normal">({formatCurrency(niCalc.deferralBonus)})</span>
                                                    </span>
                                                </div>
                                            )}

                                            <div className={`flex justify-between border-t mt-1 pt-1 font-bold ${isLight ? 'border-blue-200' : 'border-blue-500/30'}`}>
                                                <span>
                                                    {language === 'he'
                                                        ? (niCalc.age >= 70 ? 'סה"כ קצבה (מגיל 70):' : 'סה"כ קצבה (מגיל 67):')
                                                        : (niCalc.age >= 70 ? 'Total (from age 70):' : 'Total (from age 67):')}
                                                </span>
                                                <span>
                                                    {formatCurrency(niCalc.totalMonthly || calculateNationalInsurance(70, 35, fiscalParameters, familyStatus).totalMonthly)}
                                                </span>
                                            </div>

                                            {/* Income Test Status - HIDDEN as per user request (Step 4469) */}
                                        </div>
                                    </div>
                                </div>

                                {/* Ptor Mezake Exemption */}
                                <div>
                                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2 text-emerald-500">
                                        <Shield size={14} />
                                        {language === 'he' ? 'פטור מזכה (מעודכן 2026)' : 'Qualified Exemption (2026)'}
                                    </h4>
                                    <div className={`p-3 rounded-lg text-xs ${isLight ? 'bg-emerald-50 text-emerald-800' : 'bg-emerald-500/10 text-emerald-300'}`}>
                                        <p className="mb-2">
                                            {language === 'he'
                                                ? 'החל מגיל פרישה, 57.5% מקצבת הפנסיה פטורים ממס, עד לתקרה חודשית.'
                                                : 'Starting at retirement age, 57.5% of pension income is tax-exempt, up to a monthly cap.'}
                                        </p>
                                        <div className="flex justify-between mb-1">
                                            <span>{language === 'he' ? 'שיעור פטור:' : 'Exemption Rate:'}</span>
                                            <span className="font-bold">57.5%</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>{language === 'he' ? 'תקרת פטור חודשית:' : 'Monthly Cap:'}</span>
                                            <span className="font-bold">{formatCurrency(5422)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

export default PensionIncomeModal;
