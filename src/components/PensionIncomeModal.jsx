import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Tooltip,
    Legend
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { useDraggable } from '../hooks/useDraggable';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency as formatCurrencyUtil } from '../utils/formatters';
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
    AlertTriangle,
    Sparkles,
    Loader2,
    AlertCircle,
    WifiOff,
    KeyRound,
    CreditCard,
    FileX,
    Clock,
    Upload,
    BarChart3,
    Undo2,
    Redo2
} from 'lucide-react';
import { getPensionAIInsights, classifyAiError } from '../utils/ai-insights';
import { addImpliedRatesToMaslekaSummary, getCompanyLogoUrl, parseMaslekaWorkbook } from '../utils/maslekaParser';
import {
    calculateNationalInsurance,
    calculateIncomeAtAge,
    calculateRetirementIncomeSummary,
    createDefaultIncomeSources,
    projectCurrentPensionSource,
    PENSION_TAX_BRACKETS
} from '../utils/pensionCalculator';
import { FiscalUpdateModal } from './FiscalUpdateModal';
import { CustomSelect } from './common/CustomSelect';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

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

const CURRENT_ASSET_LABELS = {
    pension: { he: 'פנסיה קיימת', en: 'Current Pension' },
    provident: { he: 'גמל קיים', en: 'Current Provident Fund' },
    severance: { he: 'פיצויים קיימים', en: 'Current Severance' }
};

const getCurrentAssetLabel = (kind, language) =>
    CURRENT_ASSET_LABELS[kind]?.[language === 'he' ? 'he' : 'en'] || CURRENT_ASSET_LABELS.pension[language === 'he' ? 'he' : 'en'];

function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatCurrentAssetDate(dateString, language) {
    if (!dateString) return '';

    const [year, month, day] = String(dateString).split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    if (isNaN(date.getTime())) return dateString;

    return new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(date);
}

function getDatedCurrentAsset(currentAsset, currentAge) {
    return {
        ...currentAsset,
        asOfDate: currentAsset?.asOfDate || getTodayDateString(),
        ageAtDate: currentAsset?.ageAtDate ?? currentAge ?? ''
    };
}

function getCurrentAssetEditKey(source) {
    if (!source?.currentAsset) return '';

    return JSON.stringify({
        name: source.name || '',
        startAge: source.startAge ?? '',
        endAge: source.endAge ?? '',
        currentAsset: {
            kind: source.currentAsset.kind || '',
            balance: source.currentAsset.balance ?? '',
            coefficient: source.currentAsset.coefficient ?? '',
            targetAnnuity: source.currentAsset.targetAnnuity ?? '',
            returnRate: source.currentAsset.returnRate ?? '',
            asOfDate: source.currentAsset.asOfDate || '',
            ageAtDate: source.currentAsset.ageAtDate ?? ''
        }
    });
}

function getDisplayedPensionCoefficient(source) {
    if (source.type !== 'pension' || (!source.currentAsset && !source.pensionCoefficient)) {
        return null;
    }

    const savedCoefficient = parseFloat(source.pensionCoefficient);
    if (savedCoefficient > 0) return savedCoefficient;

    const manualCoefficient = parseFloat(source.currentAsset?.coefficient);
    if (manualCoefficient > 0) return manualCoefficient;

    const startAge = parseFloat(source.startAge);
    const endAge = parseFloat(source.endAge);
    if (!isNaN(startAge) && !isNaN(endAge) && endAge > startAge) {
        return Math.round((endAge - startAge) * 12);
    }

    if (!isNaN(startAge)) {
        return Math.round((Math.max(startAge + 20, 87) - startAge) * 12);
    }

    return null;
}

function buildCalculatedSourceDraft(source, defaultReturnRate, currentAge) {
    if (source.currentAsset) {
        return {
            ...source,
            currentAsset: getDatedCurrentAsset(source.currentAsset, currentAge)
        };
    }

    const isPension = source.type === 'pension';
    const coefficient = isPension ? getDisplayedPensionCoefficient(source) : null;
    return {
        ...source,
        currentAsset: {
            kind: isPension ? 'pension' : (source.nameEn?.includes('Severance') ? 'severance' : 'provident'),
            // Legacy calculated rows only kept the computed output. Reopen them with
            // the computed target value and 0% return so editing does not compound it again.
            balance: isPension && coefficient
                ? Math.round((parseFloat(source.amount) || 0) * coefficient)
                : (parseFloat(source.amount) || 0),
            coefficient: isPension && coefficient ? coefficient : '',
            returnRate: 0,
            legacyCalculatedDraft: true,
            asOfDate: getTodayDateString(),
            ageAtDate: currentAge ?? ''
        },
        ...(isPension && coefficient ? { pensionCoefficient: coefficient } : {}),
        calculated: true,
        autoCalculated: true,
        defaultReturnRate
    };
}

function formatPercentValue(value) {
    if (value === null || value === undefined || isNaN(Number(value))) return '—';
    return `${Number(value).toFixed(2)}%`;
}


function formatMaslekaCurrency(value, language) {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: 'ILS',
        maximumFractionDigits: 0
    }).format(amount);
}

function _getCompanyLogoDomain(company = '') {
    const normalized = String(company).trim();
    const domains = [
        { match: /מגדל|migdal/i, domain: 'migdal.co.il' },
        { match: /כלל|clal/i, domain: 'clalbit.co.il' },
        { match: /הראל|harel/i, domain: 'harel-group.co.il' },
        { match: /מנורה|מבטחים|menora/i, domain: 'menoramivt.co.il' },
        { match: /הפניקס|phoenix|fnx/i, domain: 'fnx.co.il' },
        { match: /איילון|ayalon/i, domain: 'ayalon-ins.co.il' },
        { match: /מיטב|meitav/i, domain: 'meitav.co.il' },
        { match: /מור|more/i, domain: 'moreinvest.co.il' },
        { match: /אנליסט|analyst/i, domain: 'analyst.co.il' },
        { match: /אלטשולר|altshuler/i, domain: 'as-invest.co.il' },
        { match: /ילין|לפידות|yelin/i, domain: 'yelin.co.il' },
        { match: /הכשרה|hcsra/i, domain: 'hcsra.co.il' },
        { match: /פסגות|psagot/i, domain: 'psagot.co.il' },
        { match: /אינפיניטי|infinity/i, domain: 'infinity.co.il' },
        { match: /איי\.?\s*די\.?\s*איי|IDI/i, domain: '555.co.il' },
        { match: /\bibi\b|איביאי/i, domain: 'ibi.co.il' }
    ];
    return domains.find(config => config.match.test(normalized))?.domain || '';
}

function getMaslekaDisplaySummary(summary, currentAge, retirementAge) {
    if (!summary) return null;
    const yearsToRetirement = Math.max(0, (parseFloat(retirementAge) || 0) - (parseFloat(currentAge) || 0));
    return addImpliedRatesToMaslekaSummary(summary, yearsToRetirement);
}

/**
 * Income Source Editor Row
 */
function IncomeSourceRow({ source, currentAge, defaultStartAge, defaultReturnRate, onUpdate, onEditCalculated, onDelete, onOpenStats, t, language, isLight }) {
    const [isEditing, setIsEditing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [editValues, setEditValues] = useState(source);
    const Icon = INCOME_TYPE_ICONS[source.type] || Coins;
    const displayedCoefficient = getDisplayedPensionCoefficient(source);
    const projectedSource = source.currentAsset
        ? projectCurrentPensionSource(source, currentAge, defaultStartAge, defaultReturnRate)
        : null;

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
    const formatCurrency = (val) => formatCurrencyUtil(val, language);
    const providentAnnuityAmount = source.currentAsset?.kind === 'provident'
        ? parseFloat(source.providentAnnuityAmount) || 0
        : 0;



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
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
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
        <>
        <div className={`flex items-center gap-2 p-2 rounded-lg ${source.enabled !== false ? '' : 'opacity-50'} ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'} transition-colors group`}>
            <div className={`p-1.5 rounded ${isLight ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-500/20 text-emerald-400'}`}>
                <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex min-w-0 items-center gap-1">
                    <span className={`min-w-0 truncate text-sm font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {displayName}
                    </span>
                    {(source.autoCalculated || source.calculated) && (
                        <span className={`shrink-0 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'}`}>
                            {language === 'he' ? 'מחושב' : 'Calculated'}
                        </span>
                    )}
                    {displayedCoefficient && (
                        <span className={`shrink-0 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/20 text-indigo-300'}`}>
                            {language === 'he' ? 'מקדם' : 'Coef.'} {displayedCoefficient}
                        </span>
                    )}
                    {providentAnnuityAmount > 0 && (
                        <span className={`shrink-0 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300'}`}>
                            {language === 'he' ? 'קצבה' : 'Annuity'} {formatCurrency(providentAnnuityAmount)}
                        </span>
                    )}
                </div>
                <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    {t('fromAge') || 'מגיל'} {source.startAge}
                    {source.endAge && ` ${t('toAge') || 'עד'} ${source.endAge}`}
                </div>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {source.currentAsset && (
                    <button onClick={() => onOpenStats(source)} className={`p-1 rounded ${isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-gray-400'}`} title={language === 'he' ? 'סטטיסטיקה' : 'Statistics'}>
                        <BarChart3 size={12} />
                    </button>
                )}
                {source.isEditable !== false && (
                    <>
                        <button onClick={() => source.currentAsset || source.calculated ? onEditCalculated(source) : setIsEditing(true)} className={`p-1 rounded ${isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-gray-400'}`}>
                            <Edit3 size={12} />
                        </button>
                        <button onClick={() => onDelete(source.id)} className={`p-1 rounded ${isLight ? 'hover:bg-red-100 text-red-500' : 'hover:bg-red-500/20 text-red-400'}`}>
                            <Trash2 size={12} />
                        </button>
                    </>
                )}
            </div>
            <div className={`shrink-0 text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {formatCurrency(source.amount)}
                <span className="text-[10px] font-normal ms-1 opacity-60">
                    {source.isTaxable !== false ? (language === 'he' ? '(ברוטו)' : '(Gross)') : ''}
                </span>
            </div>
            <button
                onClick={() => projectedSource && setIsExpanded(prev => !prev)}
                disabled={!projectedSource}
                title={language === 'he' ? 'פרטי מקור' : 'Source details'}
                className={`p-1 rounded ${projectedSource ? (isLight ? 'text-slate-500 hover:bg-slate-200' : 'text-gray-400 hover:bg-white/10') : 'text-transparent cursor-default'}`}
            >
                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
        </div>
        {isExpanded && projectedSource && (
            <div className={`mx-2 mb-2 grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-md p-2 text-[11px] ${isLight ? 'bg-white border border-slate-200 text-slate-600' : 'bg-black/20 border border-white/10 text-gray-300'}`}>
                <div>
                    <div className="opacity-70">{language === 'he' ? 'סכום נוכחי' : 'Current'}</div>
                    <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{formatCurrency(projectedSource.currentAsset.balance)}</div>
                </div>
                <div>
                    <div className="opacity-70">{language === 'he' ? 'נכון לתאריך' : 'As of'}</div>
                    <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{formatCurrentAssetDate(projectedSource.currentAsset.asOfDate, language) || '—'}</div>
                </div>
                <div>
                    <div className="opacity-70">{language === 'he' ? 'סכום סופי ללא הפקדות' : 'Final, no deposits'}</div>
                    <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{formatCurrency(projectedSource.projectedBalance || 0)}</div>
                </div>
                <div>
                    <div className="opacity-70">{language === 'he' ? 'ריבית' : 'Return'}</div>
                    <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{projectedSource.appliedReturnRate ?? 0}%</div>
                </div>
                {(projectedSource.appliedCoefficient || projectedSource.providentAnnuityCoefficient) && (
                    <div>
                        <div className="opacity-70">{language === 'he' ? 'מקדם' : 'Coefficient'}</div>
                        <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{projectedSource.appliedCoefficient || projectedSource.providentAnnuityCoefficient}</div>
                    </div>
                )}
                {projectedSource.amount > 0 && !projectedSource.isLumpSum && (
                    <div>
                        <div className="opacity-70">{language === 'he' ? 'קצבה חודשית' : 'Monthly annuity'}</div>
                        <div className={`font-semibold ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>{formatCurrency(projectedSource.amount)}</div>
                    </div>
                )}
            </div>
        )}
        </>
    );
}

function CurrentAssetForm({ source, projectedSource, currentAge, defaultReturnRate, canSave, onUpdate, onAdd, onCancel, maslekaCategories, maslekaAsOfDate, language, isLight }) {
    const isPension = source.currentAsset.kind === 'pension';
    const isProvident = source.currentAsset.kind === 'provident';
    const label = getCurrentAssetLabel(source.currentAsset.kind, language);
    const numberValue = (value) => value === null || value === undefined ? '' : value;
    const updateAsset = (updates) => onUpdate({
        currentAsset: { ...source.currentAsset, ...updates }
    });
    const updateNumber = (field) => (e) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            onUpdate({ [field]: value });
        }
    };
    const updateAssetNumber = (field) => (e) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            updateAsset({ [field]: value });
        }
    };
    const updateAssetInteger = (field) => (e) => {
        const value = e.target.value;
        if (value === '' || /^\d*$/.test(value)) {
            updateAsset({ [field]: value });
        }
    };
    const getSteppedNumber = (value, step, direction) => {
        const currentValue = parseFloat(value);
        const startValue = Number.isFinite(currentValue) ? currentValue : 0;
        const precision = String(step).split('.')[1]?.length || 0;
        const nextValue = Math.max(0, startValue + (step * direction));

        if (!precision) return String(Math.round(nextValue));

        return nextValue.toFixed(precision).replace(/\.?0+$/, '');
    };
    const handleNumberStep = (value, step, update) => (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

        e.preventDefault();
        update(getSteppedNumber(value, step, e.key === 'ArrowUp' ? 1 : -1));
    };
    const formatCurrency = (val) => formatCurrencyUtil(val, language);
    const setAssetDateToToday = () => updateAsset({
        asOfDate: getTodayDateString(),
        ageAtDate: currentAge ?? ''
    });
    const canSubmit = Boolean(projectedSource.amount || projectedSource.providentAnnuityAmount) && canSave;

    return (
        <div className={`rounded-lg border p-2.5 space-y-2 ${isLight ? 'bg-white border-slate-200' : 'bg-black/10 border-white/10'}`}>
            <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded ${isPension ? (isLight ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-500/20 text-emerald-400') : (isLight ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-500/20 text-indigo-400')}`}>
                    {isPension ? <TrendingUp size={14} /> : <Coins size={14} />}
                </div>
                <input
                    type="text"
                    value={source.name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    className={`min-w-0 flex-1 px-2 py-1.5 rounded text-sm border ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white'}`}
                    aria-label={language === 'he' ? 'שם נתון פנסיוני' : 'Pension asset name'}
                />
                <span className={`text-[10px] px-1.5 py-1 rounded ${isLight ? 'bg-slate-100 text-slate-600' : 'bg-white/10 text-gray-300'}`}>{label}</span>
                <button
                    onClick={onCancel}
                    title={language === 'he' ? 'מחק' : 'Delete'}
                    className={`p-1.5 rounded ${isLight ? 'text-red-500 hover:bg-red-50' : 'text-red-400 hover:bg-red-500/20'}`}
                >
                    <X size={13} />
                </button>
            </div>

            <div className={`flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5 text-[11px] ${isLight ? 'bg-slate-50 text-slate-500' : 'bg-white/5 text-gray-400'}`}>
                <span>
                    {language === 'he' ? 'תאריך נתונים' : 'Data date'}: <strong className={isLight ? 'text-slate-700' : 'text-gray-200'}>{formatCurrentAssetDate(source.currentAsset.asOfDate, language)}</strong>
                </span>
                <button
                    type="button"
                    onClick={setAssetDateToToday}
                    disabled={source.currentAsset.asOfDate === getTodayDateString()}
                    className={`px-2 py-1 rounded transition-colors ${source.currentAsset.asOfDate === getTodayDateString()
                        ? (isLight ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-gray-500 cursor-not-allowed')
                        : (isLight ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30')}`}
                >
                    {language === 'he' ? 'עדכן להיום' : 'Set to today'}
                </button>
            </div>

            {maslekaCategories?.length > 0 && (
                <div className={`rounded px-2 py-1.5 space-y-1 ${isLight ? 'bg-indigo-50 border border-indigo-100' : 'bg-indigo-500/10 border border-indigo-500/20'}`}>
                    <div className={`text-[10px] font-medium ${isLight ? 'text-indigo-600' : 'text-indigo-300'}`}>
                        {language === 'he' ? 'בחר יתרה מהמסלקה' : 'Pick balance from Masleka'}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {maslekaCategories.map(cat => (
                            <button
                                key={cat.key}
                                type="button"
                                onClick={() => updateAsset({
                                    balance: String(Math.round(cat.currentBalance)),
                                    ...(maslekaAsOfDate ? { asOfDate: maslekaAsOfDate } : {}),
                                    ...(cat.impliedNoDepositRate != null ? { returnRate: String(Math.round(cat.impliedNoDepositRate)) } : {}),
                                    ...(isPension && cat.projectedNoContribAnnuity > 0 ? { coefficient: String(Math.round(cat.projectedNoContribBalance / cat.projectedNoContribAnnuity)) } : {})
                                })}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${isLight ? 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50' : 'bg-white/10 border border-white/10 text-gray-200 hover:bg-white/15'}`}
                            >
                                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                                <span className="font-medium">{language === 'he' ? cat.labelHe : cat.labelEn}</span>
                                <span className={`tabular-nums ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{formatCurrency(cat.currentBalance)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className={`grid gap-2 ${isPension || isProvident ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3'}`}>
                <label className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    <span className="block mb-1">{language === 'he' ? 'יתרה בתאריך' : 'Balance at date'}</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={numberValue(source.currentAsset.balance)}
                        onChange={updateAssetNumber('balance')}
                        className={`w-full px-2 py-1.5 rounded text-sm no-spinner border text-center ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white'}`}
                    />
                </label>
                <label className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    <span className="block mb-1">{isPension ? (language === 'he' ? 'גיל תחילת קצבה' : 'Annuity age') : (language === 'he' ? 'גיל קבלה' : 'Access age')}</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={numberValue(source.startAge)}
                        onChange={updateNumber('startAge')}
                        onKeyDown={handleNumberStep(source.startAge, 1, (value) => onUpdate({ startAge: value }))}
                        className={`w-full px-2 py-1.5 rounded text-sm no-spinner border text-center ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white'}`}
                    />
                </label>
                <label className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    <span className="block mb-1">{language === 'he' ? 'ריבית למקור' : 'Source return'}</span>
                    <div className="relative">
                        <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={numberValue(source.currentAsset.returnRate)}
                            onChange={updateAssetInteger('returnRate')}
                            onKeyDown={handleNumberStep(source.currentAsset.returnRate, 1, (value) => updateAsset({ returnRate: value }))}
                            placeholder={String(defaultReturnRate)}
                            className={`w-full px-2 py-1.5 pe-5 rounded text-sm no-spinner border text-center ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white'}`}
                        />
                        <span className={`absolute end-2 top-1.5 text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>%</span>
                    </div>
                </label>
                {(isPension || isProvident) && (
                    <label className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                        <span className="block mb-1">{language === 'he' ? 'גיל סיום' : 'End age'}</span>
                        <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={numberValue(source.endAge)}
                            onChange={updateNumber('endAge')}
                            onKeyDown={handleNumberStep(source.endAge, 1, (value) => onUpdate({ endAge: value }))}
                            className={`w-full px-2 py-1.5 rounded text-sm no-spinner border text-center ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white'}`}
                        />
                    </label>
                )}
                {isProvident && (
                    <label className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                        <span className="block mb-1">{language === 'he' ? 'קצבת יעד' : 'Target annuity'}</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={numberValue(source.currentAsset.targetAnnuity)}
                            onChange={updateAssetNumber('targetAnnuity')}
                            className={`w-full px-2 py-1.5 rounded text-sm no-spinner border text-center ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white'}`}
                        />
                    </label>
                )}
                {(isPension || isProvident) && (
                    <label className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                        <span className="block mb-1">{language === 'he' ? 'מקדם, לפי גיל' : 'Coefficient, by age'}</span>
                        <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={numberValue(source.currentAsset.coefficient)}
                            onChange={updateAssetNumber('coefficient')}
                            onKeyDown={handleNumberStep(source.currentAsset.coefficient, 1, (value) => updateAsset({ coefficient: value }))}
                            placeholder={projectedSource.appliedCoefficient || projectedSource.providentAnnuityCoefficient
                                ? String(projectedSource.appliedCoefficient || projectedSource.providentAnnuityCoefficient)
                                : ''}
                            className={`w-full px-2 py-1.5 rounded text-sm no-spinner border text-center ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white'}`}
                        />
                    </label>
                )}
            </div>

            <div className={`flex flex-wrap gap-x-3 gap-y-1 text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                <span>{language === 'he' ? 'ערך מחושב בגיל היעד' : 'Projected value at target age'}: <strong className={isLight ? 'text-slate-700' : 'text-gray-200'}>{formatCurrency(projectedSource.projectedBalance || 0)}</strong></span>
                {isPension && (
                    <span>
                        {language === 'he' ? 'קצבה מחושבת' : 'Calculated annuity'}: <strong className={isLight ? 'text-emerald-700' : 'text-emerald-300'}>{formatCurrency(projectedSource.amount || 0)}</strong>
                        {projectedSource.appliedCoefficient ? ` / ${language === 'he' ? 'מקדם' : 'coefficient'} ${projectedSource.appliedCoefficient}` : ''}
                    </span>
                )}
                {isProvident && projectedSource.providentAnnuityAmount > 0 && (
                    <>
                        <span>
                            {language === 'he' ? 'קצבה מהגמל' : 'Provident annuity'}: <strong className={isLight ? 'text-emerald-700' : 'text-emerald-300'}>{formatCurrency(projectedSource.providentAnnuityAmount)}</strong>
                            {projectedSource.providentAnnuityCoefficient ? ` / ${language === 'he' ? 'מקדם' : 'coefficient'} ${projectedSource.providentAnnuityCoefficient}` : ''}
                        </span>
                        <span>{language === 'he' ? 'הון שהוקצה לקצבה' : 'Capital allocated to annuity'}: <strong className={isLight ? 'text-slate-700' : 'text-gray-200'}>{formatCurrency(projectedSource.providentAnnuityCapitalUsed || 0)}</strong></span>
                    </>
                )}
                {!isPension && <span>{language === 'he' ? 'יתרה שנשארת כהון' : 'Capital left invested'}: <strong className={isLight ? 'text-indigo-700' : 'text-indigo-300'}>{formatCurrency(projectedSource.amount || 0)}</strong></span>}
                <span>{language === 'he' ? 'ריבית בחישוב' : 'Return used'}: {projectedSource.appliedReturnRate ?? defaultReturnRate}%</span>
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className={`px-2.5 py-1.5 rounded text-xs ${isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/10 text-gray-200 hover:bg-white/20'}`}>
                    {language === 'he' ? 'בטל' : 'Cancel'}
                </button>
                <button
                    onClick={onAdd}
                    disabled={!canSubmit}
                    className={`px-2.5 py-1.5 rounded text-xs flex items-center gap-1 ${canSubmit
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : (isLight ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-gray-500 cursor-not-allowed')}`}
                >
                    <Check size={12} />
                    {source.id.startsWith('current_asset_')
                        ? (language === 'he' ? 'הוסף לרשימה' : 'Add to list')
                        : (language === 'he' ? 'עדכן מקור' : 'Update source')}
                </button>
            </div>
        </div>
    );
}

function SourceStatsModal({ source, sources = [], currentAge, defaultStartAge, defaultReturnRate, language, isLight, onSelectSource, onClose }) {
    const { dragStyle, overlayStyle, onDragMouseDown, bringToFront } = useDraggable(true, { constrainToViewport: true });
    const formatCurrency = (val) => formatCurrencyUtil(val, language);
    // Compute each source's own effective target age — falls back to global only when the source has no explicit startAge
    const effectiveStartAge = parseFloat(source.startAge) || defaultStartAge;
    const baseProjection = projectCurrentPensionSource({ ...source, startAge: effectiveStartAge }, currentAge, effectiveStartAge, defaultReturnRate);
    const baseRate = Number(baseProjection.appliedReturnRate ?? defaultReturnRate) || 0;
    const [rateStep, setRateStep] = useState(1);
    const [rateMin, setRateMin] = useState(() => Math.round((baseRate - 4) * 10) / 10);
    const [rateMax, setRateMax] = useState(() => Math.round((baseRate + 4) * 10) / 10);
    const [activeMetric, setActiveMetric] = useState('balance');
    const baseCoefficient = baseProjection.appliedCoefficient || baseProjection.providentAnnuityCoefficient || 240;
    const coefficients = [...new Set([180, 200, 220, baseCoefficient, 240, 260, 280]
        .map(coefficient => Math.round(Number(coefficient))))]
        .filter(coefficient => coefficient > 0)
        .sort((a, b) => a - b);
    const displayName = language === 'he' ? source.name : (source.nameEn || source.name);
    const hasManualCoefficient = parseFloat(source.currentAsset?.coefficient) > 0;
    const showCoefficientSensitivity = source.currentAsset?.kind === 'pension' && !hasManualCoefficient;
    const statsSources = sources.filter(item => item.currentAsset);
    const isBaseRate = (rate) => Math.abs(Number(rate) - Number(baseProjection.appliedReturnRate ?? baseRate)) < 0.0001;
    const isBaseCoefficient = (coefficient) => Math.abs(Number(coefficient) - Number(baseProjection.appliedCoefficient ?? baseCoefficient)) < 0.0001;

    useEffect(() => {
        setRateMin(Math.round((baseRate - 4) * 10) / 10);
        setRateMax(Math.round((baseRate + 4) * 10) / 10);
        setRateStep(1);
        setActiveMetric('balance');
    }, [source.id, baseRate, effectiveStartAge]);

    const rates = (() => {
        const step = Math.max(0.1, Number(rateStep) || 1);
        const min = Math.min(Number(rateMin), Number(rateMax));
        const max = Math.max(Number(rateMin), Number(rateMax));
        const values = [];
        for (let value = min; value <= max + 0.0001 && values.length < 17; value += step) {
            values.push(Math.round(value * 10) / 10);
        }
        values.push(Math.round(baseRate * 10) / 10);
        return [...new Set(values)].sort((a, b) => a - b);
    })();

    const projectWith = (returnRate, coefficient) => projectCurrentPensionSource({
        ...source,
        startAge: effectiveStartAge,
        currentAsset: {
            ...source.currentAsset,
            returnRate,
            ...(coefficient ? { coefficient } : {})
        }
    }, currentAge, effectiveStartAge, defaultReturnRate);
    const formatCompact = (value) => {
        const amount = Math.abs(Number(value) || 0);
        const prefix = language === 'he' ? '₪' : '$';
        if (amount >= 1000000) return `${prefix}${(Number(value) / 1000000).toFixed(amount >= 10000000 ? 1 : 2)}M`;
        if (amount >= 1000) return `${prefix}${Math.round(Number(value) / 1000)}K`;
        return `${prefix}${Math.round(Number(value)).toLocaleString()}`;
    };
    const rateRows = rates.map(rate => ({ rate, projected: projectWith(rate) }));
    const heatmapRows = showCoefficientSensitivity
        ? coefficients.map(coefficient => rates.map(rate => ({ rate, coefficient, projected: projectWith(rate, coefficient) })))
        : [];
    const heatValues = heatmapRows.flat().map(cell => cell.projected.amount || 0);
    const heatMin = Math.min(...heatValues, 0);
    const heatMax = Math.max(...heatValues, 1);
    const heatColor = (value) => {
        const ratio = heatMax === heatMin ? 0.6 : (value - heatMin) / (heatMax - heatMin);
        const hue = 170 - ratio * 18;
        const lightness = isLight ? 84 - ratio * 34 : 28 + ratio * 20;
        return `hsl(${hue} 76% ${lightness}%)`;
    };
    const textColor = isLight ? '#475569' : '#cbd5e1';
    const gridColor = isLight ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.18)';
    const chartLabelColor = isLight ? '#334155' : '#cbd5e1';
    const makeBarData = (rows, label, valueGetter, highlightGetter) => ({
        labels: rows.map(row => row.label),
        datasets: [{
            label,
            data: rows.map(valueGetter),
            backgroundColor: rows.map(row => highlightGetter(row) ? 'rgba(250, 204, 21, 0.82)' : 'rgba(45, 212, 191, 0.72)'),
            borderColor: rows.map(row => highlightGetter(row) ? 'rgb(250, 204, 21)' : 'rgb(52, 211, 153)'),
            borderWidth: rows.map(row => highlightGetter(row) ? 3 : 1),
            borderRadius: 4,
            categoryPercentage: 0.68,
            barPercentage: 0.62
        }]
    });
    const makeBarOptions = (rows, currentText) => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 32, left: 4, right: 4 } },
        plugins: {
            legend: { display: false },
            tooltip: {
                rtl: language === 'he',
                textDirection: language === 'he' ? 'rtl' : 'ltr',
                callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y || 0)}`,
                    title: (items) => rows[items[0].dataIndex]?.isCurrent
                        ? `${items[0].label} (${currentText})`
                        : items[0].label
                }
            },
            datalabels: {
                anchor: 'end',
                align: 'top',
                offset: 6,
                clamp: true,
                clip: false,
                textAlign: 'center',
                color: (ctx) => rows[ctx.dataIndex]?.isCurrent ? '#facc15' : chartLabelColor,
                font: { weight: '700', size: 10 },
                formatter: (value) => formatCompact(value)
            }
        },
        scales: {
            x: {
                ticks: {
                    color: (ctx) => rows[ctx.index]?.isCurrent ? '#facc15' : textColor,
                    font: (ctx) => rows[ctx.index]?.isCurrent ? { size: 12, weight: '900' } : { size: 12, weight: '700' }
                },
                grid: { display: false }
            },
            y: {
                beginAtZero: true,
                ticks: { color: textColor, callback: (value) => formatCompact(value) },
                grid: { color: gridColor }
            }
        }
    });
    const balanceRows = rateRows.map(row => ({
        ...row,
        label: `${row.rate}%`,
        isCurrent: isBaseRate(row.rate)
    }));
    const annuityRows = rateRows.map(row => ({
        ...row,
        label: `${row.rate}%`,
        isCurrent: isBaseRate(row.rate)
    }));
    const coefficientRows = showCoefficientSensitivity
        ? coefficients.map(coefficient => ({
            coefficient,
            label: String(coefficient),
            isCurrent: isBaseCoefficient(coefficient),
            projected: projectWith(baseProjection.appliedReturnRate ?? baseRate, coefficient)
        }))
        : [];
    const chartData = {
        labels: balanceRows.map(row => row.label),
        datasets: [{
            label: language === 'he' ? 'סכום סופי ללא הפקדות' : 'Final balance, no deposits',
            data: balanceRows.map(row => row.projected.projectedBalance || 0),
            backgroundColor: balanceRows.map(row => row.isCurrent ? 'rgba(250, 204, 21, 0.82)' : 'rgba(45, 212, 191, 0.72)'),
            borderColor: balanceRows.map(row => row.isCurrent ? 'rgb(250, 204, 21)' : 'rgb(52, 211, 153)'),
            borderWidth: balanceRows.map(row => row.isCurrent ? 3 : 1),
            borderRadius: 4,
            categoryPercentage: 0.68,
            barPercentage: 0.62
        }]
    };
    const chartOptions = makeBarOptions(balanceRows, language === 'he' ? 'נוכחי' : 'current');
    const annuityChartData = makeBarData(
        annuityRows,
        language === 'he' ? 'קצבה חודשית' : 'Monthly annuity',
        row => row.projected.amount || 0,
        row => row.isCurrent
    );
    const annuityChartOptions = makeBarOptions(annuityRows, language === 'he' ? 'נוכחי' : 'current');
    const coefficientChartData = makeBarData(
        coefficientRows,
        language === 'he' ? 'קצבה חודשית' : 'Monthly annuity',
        row => row.projected.amount || 0,
        row => row.isCurrent
    );
    const coefficientChartOptions = makeBarOptions(coefficientRows, language === 'he' ? 'מקדם בסיס' : 'base coefficient');

    const canShowAnnuity = !baseProjection.isLumpSum && baseProjection.amount > 0;
    const metricOptions = [
        { value: 'balance', label: language === 'he' ? 'סכום סופי ללא הפקדות' : 'Final balance, no deposits' },
        ...(canShowAnnuity ? [{ value: 'annuity', label: language === 'he' ? 'קצבה לפי ריבית' : 'Annuity by return' }] : []),
        ...(showCoefficientSensitivity ? [{ value: 'coefficient', label: language === 'he' ? 'קצבה לפי מקדם' : 'Annuity by coefficient' }] : [])
    ];
    const selectedMetric = metricOptions.some(option => option.value === activeMetric) ? activeMetric : 'balance';
    const activeRows = selectedMetric === 'coefficient' ? coefficientRows : selectedMetric === 'annuity' ? annuityRows : balanceRows;
    const activeLabel = metricOptions.find(option => option.value === selectedMetric)?.label || metricOptions[0].label;
    const activeValueGetter = selectedMetric === 'balance'
        ? (row) => row.projected.projectedBalance || 0
        : (row) => row.projected.amount || 0;
    const activeChartData = makeBarData(activeRows, activeLabel, activeValueGetter, row => row.isCurrent);
    const activeChartOptions = makeBarOptions(activeRows, language === 'he' ? 'נוכחי' : 'current');
    const activeAvgChange = activeRows.slice(1).reduce((sum, row, index) => (
        sum + Math.abs(activeValueGetter(row) - activeValueGetter(activeRows[index]))
    ), 0) / Math.max(activeRows.length - 1, 1);
    const activeCurrentValue = activeRows.find(row => row.isCurrent);

    return ReactDOM.createPortal(
        <div
            className="fixed inset-0 flex items-center justify-center bg-black/85 p-4"
            style={overlayStyle}
            onMouseDown={bringToFront}
            onClick={onClose}
        >
            <div
                data-draggable-modal
                className={`w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border shadow-2xl ${isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-gradient-to-br from-gray-900 to-blue-900 border-white/30 text-white'}`}
                style={dragStyle}
                onClick={e => e.stopPropagation()}
                dir={language === 'he' ? 'rtl' : 'ltr'}
            >
                <div
                    className={`flex items-center justify-between gap-3 p-3 border-b cursor-grab active:cursor-grabbing ${isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}
                    onMouseDown={onDragMouseDown}
                >
                    <div className="min-w-0">
                        <h3 className={`text-sm font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {language === 'he' ? 'סטטיסטיקת מקור צובר' : 'Accumulating Source Statistics'}
                        </h3>
                        <p className={`text-xs truncate ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{displayName}</p>
                    </div>
                    <button onClick={onClose} className={`p-1.5 rounded ${isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-gray-300'}`}>
                        <X size={16} />
                    </button>
                </div>
                {statsSources.length > 1 && (
                    <div className={`px-4 py-3 border-b overflow-x-auto custom-scrollbar ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                        <div className="flex gap-2 min-w-max">
                            {statsSources.map(item => {
                                const itemName = language === 'he' ? item.name : (item.nameEn || item.name);
                                const isActive = item.id === source.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => onSelectSource?.(item)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${isActive
                                            ? (isLight ? 'bg-sky-100 border-sky-300 text-sky-800' : 'bg-sky-500/25 border-sky-400/40 text-sky-100')
                                            : (isLight ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10')}`}
                                    >
                                        {itemName}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
                <div className={`px-4 py-3 border-b ${isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex flex-wrap gap-4 items-end">
                        <div className="flex-1 min-w-[190px]">
                            <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                {language === 'he' ? 'פרמטר' : 'Parameter'}
                            </label>
                            <CustomSelect
                                value={selectedMetric}
                                onChange={(value) => setActiveMetric(value)}
                                options={metricOptions}
                                className="w-full"
                            />
                        </div>
                        <label className={`w-24 text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            <span className="block mb-1">{language === 'he' ? 'מינימום' : 'Minimum'}</span>
                            <input
                                type="number"
                                value={rateMin}
                                step={rateStep}
                                onChange={(e) => setRateMin(parseFloat(e.target.value) || 0)}
                                disabled={selectedMetric === 'coefficient'}
                                className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold text-end ${selectedMetric === 'coefficient' ? 'opacity-50 cursor-not-allowed' : ''} ${isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/10 border-white/20 text-white'}`}
                            />
                        </label>
                        <label className={`w-24 text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            <span className="block mb-1">{language === 'he' ? 'מקסימום' : 'Maximum'}</span>
                            <input
                                type="number"
                                value={rateMax}
                                step={rateStep}
                                onChange={(e) => setRateMax(parseFloat(e.target.value) || 0)}
                                disabled={selectedMetric === 'coefficient'}
                                className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold text-end ${selectedMetric === 'coefficient' ? 'opacity-50 cursor-not-allowed' : ''} ${isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/10 border-white/20 text-white'}`}
                            />
                        </label>
                        <label className={`w-24 text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            <span className="block mb-1">{language === 'he' ? 'צעד' : 'Step'}</span>
                            <select
                                value={rateStep}
                                onChange={(e) => setRateStep(parseFloat(e.target.value))}
                                disabled={selectedMetric === 'coefficient'}
                                className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold ${selectedMetric === 'coefficient' ? 'opacity-50 cursor-not-allowed' : ''} ${isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-white/20 text-white'}`}
                            >
                                <option value={0.5}>0.5%</option>
                                <option value={1}>1%</option>
                                <option value={2}>2%</option>
                            </select>
                        </label>
                        <div className={`rounded-full border px-3 py-2 text-sm font-bold text-center ${isLight ? 'bg-sky-50 border-sky-200 text-sky-800' : 'bg-sky-500/15 border-sky-400/30 text-sky-100'}`}>
                            {language === 'he' ? 'ריבית בסיס' : 'Base rate'}: {baseProjection.appliedReturnRate ?? baseRate}%
                        </div>
                    </div>
                </div>
                <div className={`p-3 overflow-y-auto custom-scrollbar max-h-[72vh] space-y-3 ${isLight ? 'bg-white' : 'bg-transparent'}`}>
                    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                        <div className={`rounded-lg p-2 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
                            <div className="opacity-70">{language === 'he' ? 'סכום נוכחי' : 'Current'}</div>
                            <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{formatCurrency(source.currentAsset.balance)}</div>
                        </div>
                        <div className={`rounded-lg p-2 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
                            <div className="opacity-70">{language === 'he' ? 'גיל יעד' : 'Target age'}</div>
                            <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{effectiveStartAge}</div>
                        </div>
                        <div className={`rounded-lg p-2 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
                            <div className="opacity-70">{language === 'he' ? 'סכום בסיס ללא הפקדות' : 'Base final, no deposits'}</div>
                            <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{formatCurrency(baseProjection.projectedBalance || 0)}</div>
                        </div>
                        <div className={`rounded-lg p-2 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
                            <div className="opacity-70">{language === 'he' ? 'ריבית בסיס' : 'Base return'}</div>
                            <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{baseProjection.appliedReturnRate ?? 0}%</div>
                        </div>
                    </div>

                    <div>
                        <div className={`flex items-center justify-between text-sm ${isLight ? 'text-slate-500' : 'text-gray-400'} px-1 md:px-0`}>
                            <div className="flex items-center gap-2">
                                <div className={`flex items-center justify-center w-5 h-5 rounded-full ${isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/50 text-blue-400'}`}>
                                    <span className="text-xs font-bold">Σ</span>
                                </div>
                                <span className="font-medium">
                                    {language === 'he' ? 'ממוצע שינוי לצעד' : 'Average change'}: <span className="font-bold">{formatCompact(activeAvgChange)}</span>
                                </span>
                            </div>
                            {activeCurrentValue && (
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 bg-yellow-400 rounded-sm"></span>
                                    <span className="font-medium">
                                        {language === 'he' ? 'ערך נוכחי' : 'Current value'}: <span className="font-bold">{activeCurrentValue.label}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="h-72 mt-2" dir="ltr">
                            <Bar data={activeChartData} options={activeChartOptions} plugins={[ChartDataLabels]} />
                        </div>
                    </div>

                    {false && (
                    <>
                    <div className="hidden">
                        <h4 className={`text-xs font-semibold mb-2 ${isLight ? 'text-slate-800' : 'text-gray-100'}`}>
                            {language === 'he' ? 'השפעת ריבית על סכום סופי ללא הפקדות' : 'Return sensitivity, no deposits'}
                        </h4>
                        <div className={`mb-3 rounded-xl p-3 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/5 border border-white/10'}`}>
                            <div className="h-64" dir="ltr">
                                <Bar data={chartData} options={chartOptions} plugins={[ChartDataLabels]} />
                            </div>
                        </div>
                        {!baseProjection.isLumpSum && baseProjection.amount > 0 && (
                            <div className={`mb-3 rounded-xl p-3 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/5 border border-white/10'}`}>
                                <h4 className={`text-xs font-semibold mb-2 ${isLight ? 'text-slate-800' : 'text-gray-100'}`}>
                                    {language === 'he' ? 'השפעת ריבית על הקצבה החודשית' : 'Return impact on monthly annuity'}
                                </h4>
                                <div className="h-56" dir="ltr">
                                    <Bar data={annuityChartData} options={annuityChartOptions} plugins={[ChartDataLabels]} />
                                </div>
                            </div>
                        )}
                        <div className={`hidden overflow-x-auto rounded-lg border ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                            <table className="w-full min-w-[420px] text-xs">
                                <thead className={isLight ? 'bg-slate-50 text-slate-500' : 'bg-white/5 text-gray-400'}>
                                    <tr>
                                        <th className="p-2 text-start">{language === 'he' ? 'ריבית' : 'Return'}</th>
                                        <th className="p-2 text-start">{language === 'he' ? 'סכום סופי ללא הפקדות' : 'Final balance, no deposits'}</th>
                                        <th className="p-2 text-start">{language === 'he' ? 'קצבה/סכום חודשי' : 'Monthly amount'}</th>
                                    </tr>
                                </thead>
                                <tbody className={isLight ? 'text-slate-700' : 'text-gray-200'}>
                                    {rates.map(rate => {
                                        const projected = projectWith(rate);
                                        return (
                                            <tr key={rate} className={isLight ? 'border-t border-slate-100' : 'border-t border-white/10'}>
                                                <td className="p-2 font-semibold">{rate}%</td>
                                                <td className="p-2">{formatCurrency(projected.projectedBalance || 0)}</td>
                                                <td className="p-2">{projected.isLumpSum ? '—' : formatCurrency(projected.amount || 0)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {showCoefficientSensitivity && (
                        <div>
                            <h4 className={`text-xs font-semibold mb-2 ${isLight ? 'text-slate-800' : 'text-gray-100'}`}>
                                {language === 'he' ? 'השפעת מקדם על פנסיה ללא מקדם מובטח' : 'Coefficient sensitivity'}
                            </h4>
                            <div className={`mb-3 rounded-xl p-3 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/5 border border-white/10'}`}>
                                <h4 className={`text-xs font-semibold mb-2 ${isLight ? 'text-slate-800' : 'text-gray-100'}`}>
                                    {language === 'he' ? 'גרף השפעת מקדם על הקצבה' : 'Coefficient impact on monthly annuity'}
                                </h4>
                                <div className="h-56" dir="ltr">
                                    <Bar data={coefficientChartData} options={coefficientChartOptions} plugins={[ChartDataLabels]} />
                                </div>
                            </div>
                            <div className={`mb-3 overflow-x-auto rounded-xl p-3 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/5 border border-white/10'}`}>
                                <div className="min-w-[560px]">
                                    <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `72px repeat(${rates.length}, minmax(72px, 1fr))` }}>
                                        <div />
                                        {rates.map(rate => (
                                            <div key={rate} className={`text-center text-xs font-bold ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{rate}%</div>
                                        ))}
                                    </div>
                                    <div className="grid gap-1" style={{ gridTemplateColumns: `72px repeat(${rates.length}, minmax(72px, 1fr))` }}>
                                        {heatmapRows.map((row, rowIndex) => (
                                            <React.Fragment key={coefficients[rowIndex]}>
                                                <div className={`flex items-center justify-center rounded-md text-xs font-bold ${isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-950 text-gray-300'}`}>
                                                    {coefficients[rowIndex]}
                                                </div>
                                                {row.map(cell => {
                                                    const isBaseCell = cell.rate === baseProjection.appliedReturnRate && cell.coefficient === baseProjection.appliedCoefficient;
                                                    return (
                                                        <div
                                                            key={`${cell.rate}-${cell.coefficient}`}
                                                            className={`min-h-14 rounded-md flex items-center justify-center text-sm font-bold ${isBaseCell ? 'ring-4 ring-blue-500' : ''}`}
                                                            style={{ backgroundColor: heatColor(cell.projected.amount || 0), color: isLight ? '#0f172a' : '#f8fafc' }}
                                                            title={`${cell.rate}% / ${cell.coefficient}: ${formatCurrency(cell.projected.amount || 0)}`}
                                                        >
                                                            {formatCompact(cell.projected.amount || 0)}
                                                        </div>
                                                    );
                                                })}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    <div className={`mt-2 text-xs text-center ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                        {language === 'he' ? 'שורות: מקדם | עמודות: ריבית שנתית' : 'Rows: coefficient | Columns: annual return'}
                                    </div>
                                </div>
                            </div>
                            <div className={`hidden overflow-x-auto rounded-lg border ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                                <table className="w-full min-w-[420px] text-xs">
                                    <thead className={isLight ? 'bg-slate-50 text-slate-500' : 'bg-white/5 text-gray-400'}>
                                        <tr>
                                            <th className="p-2 text-start">{language === 'he' ? 'מקדם' : 'Coefficient'}</th>
                                            <th className="p-2 text-start">{language === 'he' ? 'סכום סופי ללא הפקדות' : 'Final balance, no deposits'}</th>
                                            <th className="p-2 text-start">{language === 'he' ? 'קצבה חודשית' : 'Monthly annuity'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className={isLight ? 'text-slate-700' : 'text-gray-200'}>
                                        {coefficients.map(coefficient => {
                                            const projected = projectWith(baseProjection.appliedReturnRate ?? 0, coefficient);
                                            return (
                                                <tr key={coefficient} className={isLight ? 'border-t border-slate-100' : 'border-t border-white/10'}>
                                                    <td className="p-2 font-semibold">{coefficient}</td>
                                                    <td className="p-2">{formatCurrency(projected.projectedBalance || 0)}</td>
                                                    <td className="p-2">{formatCurrency(projected.amount || 0)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

/**
 * Age Milestone Summary Card
 */
function MilestoneSummary({ milestone, t, language, isLight, isExpanded, onToggle, pensionInterestRate }) {
    const formatCurrency = (val) => formatCurrencyUtil(val, language);


    const { age, income, accumulatedCapital, monthlyDeficit, monthlySurplus, ageAtDepletion } = milestone;
    const isPositive = monthlySurplus > 0 || monthlyDeficit === 0;
    const incomeSourcesByAmount = [...income.sources].sort((a, b) =>
        (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0)
    );

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
                        <div>
                            <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{t('interestOnlyIncome') || 'קצבה מריבית בלבד'}</div>
                            <div className={`font-medium ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                {formatCurrency(Math.round((accumulatedCapital || 0) * (pensionInterestRate / 100) / 12))}
                                <span className={`text-[10px] opacity-60 ms-1`}>({pensionInterestRate}%)</span>
                            </div>
                        </div>
                    </div>

                    {/* Income Test Warning - HIDDEN as per user request */}

                    {income.sources.length > 0 && (
                        <div className={`mt-3 pt-3 border-t ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                            <div className={`text-xs font-medium mb-2 ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                {t('activeIncomeSources') || 'מקורות הכנסה פעילים'}:
                            </div>
                            <div className="flex flex-wrap gap-1" dir={language === 'he' ? 'rtl' : 'ltr'}>
                                {incomeSourcesByAmount.map(source => (
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

const AVATAR_COLORS = ['#1D4ED8','#0891B2','#059669','#B91C1C','#D97706','#7C3AED','#BE185D','#0369A1','#047857','#92400E'];
function companyAvatarColor(name) {
    if (!name) return AVATAR_COLORS[0];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFF;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function CompanyLogo({ company, className = 'w-6 h-6' }) {
    const logoUrl = getCompanyLogoUrl(company);
    const initial = company ? company.trim().charAt(0) : '?';
    const color = companyAvatarColor(company);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [logoUrl]);

    if (logoUrl && !failed) {
        return (
            <span
                className={`${className} inline-flex shrink-0 items-center justify-center overflow-hidden rounded bg-white p-[2px] ring-1 ring-black/5`}
                title={company}
            >
                <img
                    src={logoUrl}
                    alt=""
                    className="block h-full w-full object-contain"
                    onError={() => setFailed(true)}
                />
            </span>
        );
    }
    return (
        <span
            className={`${className} inline-flex items-center justify-center rounded font-bold text-white text-[10px] shrink-0`}
            style={{ backgroundColor: color }}
            title={company}
        >
            {initial}
        </span>
    );
}

/**
 * Main Pension Income Modal
 */
export function PensionIncomeModal({ inputs, results, onClose, onSave, t, language, aiProvider, aiModel, apiKeyOverride, geminiApiKey, fiscalParameters, familyStatus, onUpdateFiscalData, getCachedAIAnalysis, onCacheAIAnalysis }) {

    const { theme } = useTheme();
    const isLight = theme === 'light';
    const { dragStyle, onDragMouseDown } = useDraggable(true);
    const [showFiscalModal, setShowFiscalModal] = useState(false);
    const [showBracketTable, setShowBracketTable] = useState(false);
    const [aiInsight, setAiInsight] = useState(null);
    const [aiPanelVisible, setAiPanelVisible] = useState(false);
    const [aiPanelCollapsed, setAiPanelCollapsed] = useState(true);
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [aiError, setAiError] = useState(null);
    const aiAbortRef = useRef(null);
    const maslekaFileInputRef = useRef(null);
    const [maslekaAsOfDate, setMaslekaAsOfDate] = useState(() => inputs.pensionMaslekaSummary?.asOfDate || getTodayDateString());
    const [maslekaSummary, setMaslekaSummary] = useState(() => inputs.pensionMaslekaSummary || null);
    const [maslekaError, setMaslekaError] = useState(null);
    const [maslekaProductTypeFilter, setMaslekaProductTypeFilter] = useState('all');
    const [maslekaCompanyFilter, setMaslekaCompanyFilter] = useState('all');
    const [maslekaStatusFilter, setMaslekaStatusFilter] = useState('all');
    const [showMaslekaSummary, setShowMaslekaSummary] = useState(false);
    const [maslekaOpenCategory, setMaslekaOpenCategory] = useState(null);

    // Helper to calculate NI with income test and 67 vs 70 logic
    const calculateEffectiveNI = useCallback((sources, currentRetirementStartAge, extraDeferralYears = 0) => {
        // ALWAYS pass 0 as otherIncome to bypass the income test logic as per user request
        // This ensures the displayed start age is 67, not 70
        const contributionYears = inputs.contributionYears || 35;
        const niCalc = calculateNationalInsurance(67, contributionYears, fiscalParameters, familyStatus, 0);

        // If fail income test at 67, effective start age is 70 (when test no longer applies)
        let effectiveStartAge = 67;
        let displayAmount = niCalc.totalMonthly;

        if (niCalc.incomeTest.applied && niCalc.totalMonthly === 0) {
            effectiveStartAge = 70;
            // At 70, the test doesn't apply, so recalculate without otherIncome
            const niAt70 = calculateNationalInsurance(70, contributionYears, fiscalParameters, familyStatus, 0);
            displayAmount = niAt70.totalMonthly;
        }

        const finalStartAge = Math.max(effectiveStartAge, currentRetirementStartAge) + extraDeferralYears;
        const deferredCalc = extraDeferralYears > 0
            ? calculateNationalInsurance(finalStartAge, contributionYears, fiscalParameters, familyStatus, 0)
            : niCalc;

        return {
            amount: extraDeferralYears > 0 ? deferredCalc.totalMonthly : displayAmount,
            startAge: finalStartAge,
            calculationDetails: deferredCalc
        };
    }, [inputs.contributionYears, fiscalParameters, familyStatus]);

    // Income sources state
    // Initialize from saved inputs if available, otherwise create defaults
    // Helper to get safe sources with NI guaranteed
    const getSafeSources = useCallback(() => {
        let sources = inputs.pensionIncomeSources || createDefaultIncomeSources(inputs);
        const pensionRate = inputs.pensionInterestRate !== undefined ? parseFloat(inputs.pensionInterestRate) : 4;
        const currentAge = parseFloat(inputs.currentAge) || 0;
        const defaultPensionAge = parseFloat(inputs.retirementEndAge) || 67;
        sources = sources.map(source => {
            if (!source.currentAsset) return source;
            const projected = projectCurrentPensionSource(source, currentAge, defaultPensionAge, pensionRate);
            const {
                projectedBalance: _projectedBalance,
                appliedCoefficient: _appliedCoefficient,
                appliedReturnRate: _appliedReturnRate,
                coefficientCalculated: _coefficientCalculated,
                ...projectedSource
            } = projected;
            return {
                ...projectedSource,
                calculated: true,
                ...(projected.type === 'pension' && projected.appliedCoefficient
                    ? { pensionCoefficient: projected.appliedCoefficient }
                    : {})
            };
        });
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
                const { amount, startAge, calculationDetails } = calculateEffectiveNI(sources, retStartAge, s.niDeferralYears || 0);
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
    }, [inputs, calculateEffectiveNI]);

    // Income-sources undo/redo history
    const sourcesHistory = useRef([]);
    const sourcesHistoryIdx = useRef(-1);
    const [sourcesHistoryVersion, setSourcesHistoryVersion] = useState(0);

    const [incomeSources, setIncomeSources] = useState(() => {
        const initial = getSafeSources();
        sourcesHistory.current = [initial];
        sourcesHistoryIdx.current = 0;
        return initial;
    });

    // Tracked setter: records a history snapshot for user-initiated mutations
    const setIncomeSourcesTracked = useCallback((updater) => {
        setIncomeSources(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            const trimmed = sourcesHistory.current.slice(0, sourcesHistoryIdx.current + 1);
            trimmed.push(next);
            if (trimmed.length > 40) trimmed.shift();
            sourcesHistory.current = trimmed;
            sourcesHistoryIdx.current = trimmed.length - 1;
            return next;
        });
        setSourcesHistoryVersion(v => v + 1);
    }, []);

    const undoSources = useCallback(() => {
        if (sourcesHistoryIdx.current <= 0) return;
        sourcesHistoryIdx.current--;
        setIncomeSources(sourcesHistory.current[sourcesHistoryIdx.current]);
        setSourcesHistoryVersion(v => v + 1);
    }, []);

    const redoSources = useCallback(() => {
        if (sourcesHistoryIdx.current >= sourcesHistory.current.length - 1) return;
        sourcesHistoryIdx.current++;
        setIncomeSources(sourcesHistory.current[sourcesHistoryIdx.current]);
        setSourcesHistoryVersion(v => v + 1);
    }, []);

    const canUndoSources = sourcesHistoryIdx.current > 0;
    const canRedoSources = sourcesHistoryIdx.current < sourcesHistory.current.length - 1;
    void sourcesHistoryVersion; // consumed only to trigger re-render
    const [showIncomeSources, setShowIncomeSources] = useState(false);
    const [expandedMilestone, setExpandedMilestone] = useState(null);
    const [pensionInterestRate, setPensionInterestRate] = useState(() => inputs.pensionInterestRate !== undefined ? parseFloat(inputs.pensionInterestRate) : 4);
    const [showRateTooltip, setShowRateTooltip] = useState(false);
    const rateTooltipRef = useRef(null);
    const [deferralYears, setDeferralYears] = useState(() => {
        const savedNiSource = inputs.pensionIncomeSources?.find(source => source.type === 'nationalInsurance');
        return parseInt(savedNiSource?.niDeferralYears, 10) || 0;
    });
    const [showDeferralPanel, setShowDeferralPanel] = useState(false);
    const closeAllSections = () => {
        setShowIncomeSources(false);
        setShowDeferralPanel(false);
        setShowMaslekaSummary(false);
        setExpandedMilestone(null);
        setAiPanelCollapsed(true);
    };
    const toggleIncomeSources = () => {
        const nextOpen = !showIncomeSources;
        closeAllSections();
        setShowIncomeSources(nextOpen);
    };

    // Keyboard undo/redo scoped to the modal (only when income sources panel is open)
    useEffect(() => {
        if (!showIncomeSources) return;
        const handler = (e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                if (e.shiftKey) redoSources(); else undoSources();
            } else if (e.key === 'y' || e.key === 'Y') {
                e.preventDefault();
                redoSources();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showIncomeSources, undoSources, redoSources]);
    const toggleDeferralPanel = () => {
        const nextOpen = !showDeferralPanel;
        closeAllSections();
        setShowDeferralPanel(nextOpen);
    };
    const toggleMaslekaSummary = () => {
        const nextOpen = !showMaslekaSummary;
        closeAllSections();
        setShowMaslekaSummary(nextOpen);
    };
    const toggleMilestone = (idx) => {
        const nextExpanded = expandedMilestone === idx ? null : idx;
        closeAllSections();
        setExpandedMilestone(nextExpanded);
    };

    const updateMaslekaAsOfDate = (value) => {
        setMaslekaAsOfDate(value);
        setMaslekaSummary(prev => prev
            ? { ...prev, asOfDate: value || prev.fileDataDates?.[0] || '', manualAsOfDate: value }
            : prev);
    };

    const handleMaslekaFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setMaslekaError(null);
            const arrayBuffer = await file.arrayBuffer();
            const parsed = parseMaslekaWorkbook(arrayBuffer, maslekaAsOfDate);
            setMaslekaSummary({ ...parsed, fileName: file.name });
            setShowMaslekaSummary(true);
        } catch (err) {
            setMaslekaSummary(null);
            setMaslekaError(err?.message || (language === 'he' ? 'לא ניתן לקרוא את קובץ המסלקה' : 'Could not read Masleka file'));
        } finally {
            event.target.value = '';
        }
    };

    // Lock body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    // Monthly expenses - use average from results (considers life events) if available
    // Falls back to initial value if no results yet
    const monthlyExpenses = results?.averageNetWithdrawal || parseFloat(inputs.monthlyNetIncomeDesired) || 10000;
    const retirementStartAge = parseFloat(inputs.retirementStartAge) || 67;
    const retirementEndAge = parseFloat(inputs.retirementEndAge) || 90;
    const maslekaDisplaySummary = useMemo(
        () => getMaslekaDisplaySummary(maslekaSummary, inputs.currentAge, retirementEndAge),
        [maslekaSummary, inputs.currentAge, retirementEndAge]
    );
    const maslekaCompanies = useMemo(() => {
        if (!maslekaDisplaySummary) return [];
        return [...new Set(maslekaDisplaySummary.products.map(product => product.company).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
    }, [maslekaDisplaySummary]);
    const filteredMaslekaProducts = useMemo(() => {
        if (!maslekaDisplaySummary) return [];
        const categoryOrder = Object.fromEntries(maslekaDisplaySummary.categories.map((c, i) => [c.key, i]));
        return maslekaDisplaySummary.products
            .filter(product => {
                if (maslekaProductTypeFilter !== 'all' && product.categoryKey !== maslekaProductTypeFilter) return false;
                if (maslekaCompanyFilter !== 'all' && product.company !== maslekaCompanyFilter) return false;
                if (maslekaStatusFilter === 'active' && product.status !== 'פעיל') return false;
                if (maslekaStatusFilter === 'inactive' && product.status === 'פעיל') return false;
                return true;
            })
            .sort((a, b) => (categoryOrder[a.categoryKey] ?? 99) - (categoryOrder[b.categoryKey] ?? 99));
    }, [maslekaDisplaySummary, maslekaProductTypeFilter, maslekaCompanyFilter, maslekaStatusFilter]);

    // Use Balance at End of Period as requested by user
    const capitalAtRetirement = useMemo(() => {
        // Strict check: if balanceAtEnd exists (even if 0), use it.
        // It matches the dashboard's "Balance at End" box.
        if (results && typeof results.balanceAtEnd !== 'undefined') {
            return results.balanceAtEnd;
        }
        return results?.balanceAtRetirement || 0;
    }, [results]);

    const capitalReturnRate = pensionInterestRate;

    // Update National Insurance when age changes or income sources change
    const nonNISourcesKey = JSON.stringify(incomeSources.filter(s => s.type !== 'nationalInsurance').map(s => ({ id: s.id, amount: s.amount, startAge: s.startAge, endAge: s.endAge, enabled: s.enabled })));

    useEffect(() => {
        setIncomeSources(prev => {
            const niSource = prev.find(s => s.type === 'nationalInsurance');
            if (niSource && niSource.autoCalculated) {
                const { amount, startAge, calculationDetails } = calculateEffectiveNI(prev, retirementStartAge, deferralYears);

                // Only update if something actually changed to avoid extra renders
                if (niSource.amount !== amount || niSource.startAge !== startAge || niSource.niDeferralYears !== deferralYears) {
                    return prev.map(s =>
                        s.type === 'nationalInsurance'
                            ? { ...s, amount, startAge, calculationDetails, niDeferralYears: deferralYears }
                            : s
                    );
                }
            }
            return prev;
        });
    }, [retirementStartAge, nonNISourcesKey, calculateEffectiveNI, deferralYears]);

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
        setIncomeSourcesTracked(prev => [...prev, newSource]);
    };

    const createCurrentAssetDraft = (kind = 'pension') => {
        const isPension = kind === 'pension';
        return {
            id: `current_asset_${Date.now()}`,
            type: isPension ? 'pension' : 'capital',
            name: getCurrentAssetLabel(kind, language),
            nameEn: getCurrentAssetLabel(kind, 'en'),
            amount: 0,
            startAge: retirementEndAge,
            endAge: isPension ? Math.max(retirementEndAge + 20, 87) : null,
            isTaxable: isPension,
            isLumpSum: !isPension,
            enabled: true,
            isEditable: true,
            autoCalculated: true,
            currentAsset: {
                kind,
                balance: 0,
                coefficient: '',
                targetAnnuity: '',
                returnRate: '',
                asOfDate: getTodayDateString(),
                ageAtDate: inputs.currentAge ?? ''
            }
        };
    };
    const [currentAssetDraft, setCurrentAssetDraft] = useState(null);
    const [currentAssetEditBaseline, setCurrentAssetEditBaseline] = useState(null);
    const [sourceStatsSource, setSourceStatsSource] = useState(null);
    const currentAssetFormRef = useRef(null);
    const shouldScrollToCurrentAssetFormRef = useRef(false);
    const currentAssetPreview = useMemo(() => currentAssetDraft
        ? projectCurrentPensionSource(currentAssetDraft, inputs.currentAge, retirementEndAge, pensionInterestRate)
        : null,
    [currentAssetDraft, inputs.currentAge, retirementEndAge, pensionInterestRate]);
    const currentAssetCanSave = useMemo(() => !currentAssetDraft || currentAssetDraft.id.startsWith('current_asset_') ||
        getCurrentAssetEditKey(currentAssetDraft) !== getCurrentAssetEditKey(currentAssetEditBaseline),
    [currentAssetDraft, currentAssetEditBaseline]);
    const openCurrentAssetForm = (kind) => {
        setCurrentAssetEditBaseline(null);
        setCurrentAssetDraft(createCurrentAssetDraft(kind));
    };
    const editCurrentAssetSource = (source) => {
        const draft = buildCalculatedSourceDraft(source, pensionInterestRate, inputs.currentAge);
        shouldScrollToCurrentAssetFormRef.current = true;
        setCurrentAssetEditBaseline(draft);
        setCurrentAssetDraft(draft);
    };
    useEffect(() => {
        if (!currentAssetDraft || !shouldScrollToCurrentAssetFormRef.current) return;

        shouldScrollToCurrentAssetFormRef.current = false;
        requestAnimationFrame(() => {
            currentAssetFormRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        });
    }, [currentAssetDraft]);
    const addCalculatedCurrentAsset = () => {
        if (!currentAssetPreview?.amount && !currentAssetPreview?.providentAnnuityAmount) return;
        const {
            projectedBalance: _projectedBalance,
            appliedCoefficient: _appliedCoefficient,
            appliedReturnRate: _appliedReturnRate,
            coefficientCalculated: _coefficientCalculated,
            autoCalculated: _autoCalculated,
            ...source
        } = currentAssetPreview;
        const calculatedSource = {
            ...source,
            calculated: true,
            ...(source.type === 'pension' && currentAssetPreview.appliedCoefficient
                ? { pensionCoefficient: currentAssetPreview.appliedCoefficient }
                : {}),
            id: source.id.startsWith('current_asset_') ? `income_${Date.now()}` : source.id
        };
        setIncomeSourcesTracked(prev => source.id.startsWith('current_asset_')
            ? [...prev, calculatedSource]
            : prev.map(existing => existing.id === source.id ? calculatedSource : existing));
        setCurrentAssetDraft(null);
        setCurrentAssetEditBaseline(null);
    };

    // Update income source
    const updateIncomeSource = (id, updates) => {
        setIncomeSourcesTracked(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    // Delete income source
    const deleteIncomeSource = (id) => {
        setIncomeSourcesTracked(prev => prev.filter(s => s.id !== id));
    };



    const formatCurrency = useCallback((val) => formatCurrencyUtil(val, language), [language]);

    const sortedIncomeSources = useMemo(() =>
        [...incomeSources].sort((a, b) => {
            const ageDelta = (parseFloat(a.startAge) || 0) - (parseFloat(b.startAge) || 0);
            if (ageDelta !== 0) return ageDelta;
            return (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0);
        }),
    [incomeSources]);

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

    const deferralCalc = useMemo(() => {
        const niSource = incomeSources.find(s => s.type === 'nationalInsurance' && s.enabled !== false);
        if (!niSource) return null;
        const baseNi = niSource.autoCalculated
            ? calculateEffectiveNI(incomeSources, retirementStartAge, 0)
            : {
                amount: parseFloat(niSource.amount) || 0,
                startAge: parseFloat(niSource.startAge) || 67
            };
        const deferredNi = niSource.autoCalculated
            ? calculateEffectiveNI(incomeSources, retirementStartAge, deferralYears)
            : niSource;
        const niStartAge = parseFloat(baseNi.startAge) || 67;
        const niGross = parseFloat(baseNi.amount) || 0;
        const deferredGross = parseFloat(deferredNi.amount) || niGross;
        // National Insurance is added to pension income as tax-exempt.
        const baseNet = niGross;
        const deferredNet = deferredGross;
        const deltaNet = deferredNet - baseNet;

        // Compute the baseline (no-deferral) portfolio balance at NI start age.
        // We can't use summary.milestones because those already reflect the current
        // deferral setting (NI startAge pushed forward), creating a circular dependency.
        // Instead, build a separate no-deferral summary to get the true baseline balance.
        const noDeferralSources = incomeSources.map(s =>
            s.type === 'nationalInsurance'
                ? { ...s, amount: niGross, startAge: niStartAge, niDeferralYears: 0 }
                : s
        );
        const noDeferralSummary = calculateRetirementIncomeSummary({
            incomeSources: noDeferralSources,
            retirementStartAge,
            retirementEndAge,
            capital: capitalAtRetirement,
            monthlyExpenses,
            capitalReturnRate,
            parameters: fiscalParameters
                ? { ...fiscalParameters, retirementAge: retirementStartAge, familyStatus, ignoreIncomeTest: true }
                : { familyStatus, retirementAge: retirementStartAge, ignoreIncomeTest: true }
        });
        const noDeferralMilestone = noDeferralSummary.milestones.find(m => m.age === niStartAge);
        const balAtNiAge = noDeferralMilestone?.accumulatedCapital ?? capitalAtRetirement;

        // Project the portfolio balance during deferral years.
        // During deferral, the user does NOT receive NI, so they must fund
        // the full expense gap from capital. We simulate: capital grows by
        // return, but the monthly deficit is higher by the missing NI amount.
        const returnRate = pensionInterestRate / 100;
        let projectedBalance = balAtNiAge;
        for (let y = 0; y < deferralYears; y++) {
            projectedBalance = projectedBalance * (1 + returnRate) - baseNet * 12;
        }
        const fundingCost = baseNet * 12 * deferralYears;
        const breakEvenAge = (deltaNet > 0 && deferralYears > 0)
            ? niStartAge + deferralYears + Math.ceil(fundingCost / deltaNet / 12)
            : null;
        return { niStartAge, niGross, deferredGross, baseNet, deferredNet, deltaNet, balAtNiAge, projectedBalance: Math.max(0, projectedBalance), fundingCost, breakEvenAge };
    }, [deferralYears, incomeSources, capitalAtRetirement, pensionInterestRate, calculateEffectiveNI, retirementStartAge, retirementEndAge, monthlyExpenses, capitalReturnRate, fiscalParameters, familyStatus]);

    // Track changes
    const initialIncomeSources = useMemo(() => getSafeSources(), [getSafeSources]);
    const hasChanges = useMemo(() => {
        const clean = (sources) => sources.map(s => {
            const { calculationDetails: _calculationDetails, ...rest } = s;
            return rest;
        });
        const initialRate = inputs.pensionInterestRate !== undefined ? parseFloat(inputs.pensionInterestRate) : 4;
        const sourcesChanged = JSON.stringify(clean(incomeSources)) !== JSON.stringify(clean(initialIncomeSources)) || pensionInterestRate !== initialRate;
        const aiChanged = aiInsight !== null && JSON.stringify(aiInsight) !== JSON.stringify(inputs.pensionAIInsight ?? null);
        const maslekaChanged = JSON.stringify(maslekaSummary ?? null) !== JSON.stringify(inputs.pensionMaslekaSummary ?? null);
        return sourcesChanged || aiChanged || maslekaChanged;
    }, [incomeSources, initialIncomeSources, pensionInterestRate, inputs, aiInsight, maslekaSummary]);

    const pensionAIInputs = useMemo(() => {
        const { pensionAIInsight: _omit, ...restInputs } = inputs;
        return { ...restInputs, capitalAtRetirement, monthlyNetIncomeDesired: monthlyExpenses, fiscalParameters };
    }, [inputs, capitalAtRetirement, monthlyExpenses, fiscalParameters]);
    const pensionAICacheKey = useMemo(() => JSON.stringify({
        incomeSources: inputs.pensionIncomeSources,
        summary: summary?.milestones,
        pensionInputs: pensionAIInputs,
        aiProvider,
        aiModel,
        language
    }), [inputs.pensionIncomeSources, summary, pensionAIInputs, aiProvider, aiModel, language]);

    useEffect(() => {
        const analysis = getCachedAIAnalysis?.(pensionAICacheKey) || inputs.pensionAIInsight || null;
        if (!analysis) {
            setAiInsight(null);
            setAiError(null);
            return;
        }
        setAiInsight(analysis);
        setAiError(null);
        setAiPanelVisible(true);
    }, [getCachedAIAnalysis, pensionAICacheKey, inputs.pensionAIInsight]);

    // Clear AI insight when user modifies data — stale insight shouldn't linger
    useEffect(() => {
        const clean = (sources) => sources.map(({ calculationDetails: _cd, ...rest }) => rest);
        const initialRate = inputs.pensionInterestRate !== undefined ? parseFloat(inputs.pensionInterestRate) : 4;
        const dataChanged =
            JSON.stringify(clean(incomeSources)) !== JSON.stringify(clean(initialIncomeSources)) ||
            pensionInterestRate !== initialRate;
        if (dataChanged) {
            setAiInsight(null);
            setAiError(null);
            setAiPanelVisible(false);
        }
    // Only re-run when user-editable state changes, not when derived baselines update
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [incomeSources, pensionInterestRate]);

    const runAIAnalysis = useCallback(async () => {
        if (!aiProvider || isLoadingAI) return;
        const cachedAnalysis = getCachedAIAnalysis?.(pensionAICacheKey);
        if (cachedAnalysis) {
            setAiInsight(cachedAnalysis);
            setAiError(null);
            setAiPanelVisible(true);
            return;
        }
        aiAbortRef.current?.abort();
        const controller = new AbortController();
        aiAbortRef.current = controller;
        setAiPanelVisible(true);
        setIsLoadingAI(true);
        setAiError(null);
        setAiInsight(null);
        try {
            const result = await getPensionAIInsights(
                incomeSources, summary, pensionAIInputs,
                aiProvider, aiModel, apiKeyOverride, language,
                { signal: controller.signal }
            );
            setAiInsight(result);
            onCacheAIAnalysis?.(pensionAICacheKey, result);
        } catch (err) {
            if (err.name !== 'AbortError') setAiError(classifyAiError(err));
        } finally {
            setIsLoadingAI(false);
        }
    }, [aiProvider, aiModel, apiKeyOverride, incomeSources, summary, pensionAIInputs, pensionAICacheKey, getCachedAIAnalysis, onCacheAIAnalysis, language, isLoadingAI]);
    const pensionAICardClass = isLight
        ? 'bg-white border-slate-300 shadow-md'
        : 'bg-white/5 border-white/10';
    const pensionAISectionClass = isLight
        ? 'bg-white border-slate-200'
        : 'bg-white/5 border-white/10';

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/50" onClick={onClose} />

                {/* Modal */}
                <div className={`relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl ${isLight ? 'bg-white' : ''} ring-1 ${isLight ? 'ring-gray-300' : 'ring-white/30'}`} style={{ ...dragStyle, overflow: 'hidden' }}>
                    {!isLight && (
                        <>
                            <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                            <div className="absolute inset-0 bg-white/10" />
                        </>
                    )}
                    {/* Header */}
                    <div className={`relative z-10 flex items-center justify-between p-4 border-b cursor-grab active:cursor-grabbing ${isLight ? 'border-slate-200 bg-gradient-to-r from-emerald-50 to-teal-50' : 'border-white/10 bg-gradient-to-r from-emerald-900/30 to-teal-900/30'}`} onMouseDown={onDragMouseDown}>
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
                                    {aiProvider && (
                                        <button
                                            onClick={runAIAnalysis}
                                            disabled={isLoadingAI}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-colors ${isLoadingAI ? 'opacity-60 cursor-wait' : ''} ${isLight ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'}`}
                                            title={language === 'he' ? 'ניתוח AI' : 'AI Analysis'}
                                        >
                                            {isLoadingAI ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                            <span>{language === 'he' ? 'ניתוח AI' : 'AI'}</span>
                                        </button>
                                    )}
                                    {/* Interest Rate Input */}
                                    <div className={`relative flex items-center gap-1.5 px-2 py-1 rounded-full ${isLight ? 'bg-amber-50 border border-amber-200' : 'bg-amber-500/10 border border-amber-500/20'}`}
                                        ref={rateTooltipRef}
                                        onMouseEnter={() => setShowRateTooltip(true)}
                                        onMouseLeave={() => setShowRateTooltip(false)}
                                    >
                                        <span className={`text-[10px] ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>{t('pensionInterestRate') || 'ריבית'}</span>
                                        <input
                                            type="range"
                                            value={pensionInterestRate}
                                            onChange={(e) => setPensionInterestRate(parseFloat(e.target.value) || 0)}
                                            className="w-14 h-3 accent-amber-500 cursor-pointer"
                                            min="0"
                                            max="12"
                                            step="0.5"
                                        />
                                        <input
                                            type="number"
                                            value={pensionInterestRate}
                                            onChange={(e) => setPensionInterestRate(parseFloat(e.target.value) || 0)}
                                            className={`w-12 px-1 py-0 rounded text-xs text-center no-spinner bg-transparent ${isLight ? 'text-amber-800' : 'text-amber-300'} font-bold border ${isLight ? 'border-amber-200' : 'border-amber-500/30'}`}
                                            min="0"
                                            max="100"
                                            step="0.5"
                                        />
                                        <span className={`text-[10px] ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>%</span>
                                    </div>
                                    {/* Tooltip via Portal - rendered at body level */}
                                    {showRateTooltip && rateTooltipRef.current && ReactDOM.createPortal(
                                        <div
                                            style={{
                                                position: 'fixed',
                                                zIndex: 99999,
                                                top: rateTooltipRef.current.getBoundingClientRect().bottom + 6,
                                                [language === 'he' ? 'right' : 'left']: language === 'he'
                                                    ? window.innerWidth - rateTooltipRef.current.getBoundingClientRect().right
                                                    : rateTooltipRef.current.getBoundingClientRect().left,
                                                width: 224,
                                                padding: '10px 12px',
                                                borderRadius: 8,
                                                fontSize: 11,
                                                lineHeight: 1.5,
                                                pointerEvents: 'none',
                                                backgroundColor: isLight ? '#ffffff' : '#111827',
                                                border: `1px solid ${isLight ? '#e2e8f0' : '#374151'}`,
                                                color: isLight ? '#475569' : '#d1d5db',
                                                boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.15)' : '0 4px 12px rgba(0,0,0,0.5)',
                                                direction: language === 'he' ? 'rtl' : 'ltr',
                                            }}
                                        >
                                            {language === 'he'
                                                ? 'שיעור התשואה השנתית על ההון הצבור בפרישה. משפיע על צמיחת ההון, גיל דלדול ההון, ועל שדה "קצבה מריבית בלבד" בפירוט לפי גיל.'
                                                : 'Annual return rate on accumulated capital in retirement. Affects capital growth, depletion age, and the "Interest-Only Income" field in age milestones.'
                                            }
                                        </div>,
                                        document.body
                                    )}
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
                    <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar scrollbar-right p-4 space-y-4">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className={`p-3 rounded-lg ${isLight ? 'bg-blue-50 border border-blue-100' : 'bg-blue-500/10 border border-blue-500/20'}`}>
                                <div className={`text-xs ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>{t('capitalAtRetirement') || 'הון בסיום התקופה'}</div>
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

                        {/* Masleka Upload Summary */}
                        <div className={`rounded-xl border ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-white/5 border-white/10'}`}>
                            <div
                                className={`flex flex-wrap items-center justify-between gap-3 p-3 cursor-pointer ${showMaslekaSummary && (maslekaSummary || maslekaError) ? (isLight ? 'border-b border-slate-200' : 'border-b border-white/10') : ''}`}
                                onClick={toggleMaslekaSummary}
                            >
                                <div className="flex min-w-0 items-center gap-2">
                                    <div className={`p-1 rounded ${isLight ? 'bg-cyan-100 text-cyan-700' : 'bg-cyan-500/20 text-cyan-300'}`}>
                                        <BarChart3 size={14} />
                                    </div>
                                    <div>
                                        <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                            {language === 'he' ? 'סיכום קובץ מסלקה' : 'Masleka file summary'}
                                        </h3>
                                        <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                            {language === 'he'
                                                ? 'העלאת התמונה המלאה והצגת צבירה/קצבה לפי סוג מוצר'
                                                : 'Upload the full picture file and summarize balances/annuities by product type'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2" onClick={e => e.stopPropagation()}>
                                    <label className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                        {language === 'he' ? 'נכון לתאריך' : 'As of'}
                                    </label>
                                    <input
                                        type="date"
                                        value={maslekaAsOfDate}
                                        onChange={(e) => updateMaslekaAsOfDate(e.target.value)}
                                        className={`rounded-lg border px-2 py-1 text-xs ${isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-black/20 border-white/20 text-white'}`}
                                    />
                                    <input
                                        ref={maslekaFileInputRef}
                                        type="file"
                                        accept=".xls,.xlsx,.csv"
                                        onChange={handleMaslekaFileChange}
                                        className="hidden"
                                    />
                                    <button
                                        onClick={() => maslekaFileInputRef.current?.click()}
                                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${isLight ? 'bg-cyan-600 text-white hover:bg-cyan-700' : 'bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30'}`}
                                    >
                                        <Upload size={14} />
                                        {language === 'he' ? 'העלה קובץ' : 'Upload'}
                                    </button>
                                    <button
                                        onClick={toggleMaslekaSummary}
                                        className={`p-1 rounded-full transition-colors ${isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}
                                    >
                                        {showMaslekaSummary ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                </div>
                            </div>

                            {showMaslekaSummary && maslekaError && (
                                <div className={`m-3 rounded-lg border px-3 py-2 text-xs ${isLight ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                                    {maslekaError}
                                </div>
                            )}

                            {showMaslekaSummary && maslekaDisplaySummary && (
                                    <div className="p-3 space-y-3">
                                        {/* Meta info row */}
                                        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                            <div className={`rounded-lg p-2 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
                                                <div className={isLight ? 'text-slate-500' : 'text-gray-400'}>{language === 'he' ? 'קובץ' : 'File'}</div>
                                                <div className="font-semibold truncate">{maslekaDisplaySummary.fileName}</div>
                                            </div>
                                            <div className={`rounded-lg p-2 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
                                                <div className={isLight ? 'text-slate-500' : 'text-gray-400'}>{language === 'he' ? 'נכונות' : 'As of'}</div>
                                                <div className="font-semibold">{maslekaDisplaySummary.asOfDate || '—'}</div>
                                            </div>
                                            <div className={`rounded-lg p-2 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
                                                <div className={isLight ? 'text-slate-500' : 'text-gray-400'}>{language === 'he' ? 'מוצרים' : 'Products'}</div>
                                                <div className="font-semibold">
                                                    {maslekaDisplaySummary.total.productCount}
                                                    {maslekaDisplaySummary.total.activeProductCount < maslekaDisplaySummary.total.productCount && (
                                                        <span className={`ms-1 font-normal text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                                            ({maslekaDisplaySummary.total.activeProductCount} {language === 'he' ? 'פעילים' : 'active'})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className={`rounded-lg p-2 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
                                                <div className={isLight ? 'text-slate-500' : 'text-gray-400'}>{language === 'he' ? 'הפקדות חודשיות' : 'Monthly deposits'}</div>
                                                <div className="font-semibold">{formatMaslekaCurrency(maslekaDisplaySummary.total.monthlyDeposits, language)}</div>
                                            </div>
                                        </div>

                                        {/* Grand total summary card */}
                                        <div className={`rounded-xl border overflow-hidden ${isLight ? 'border-indigo-200' : 'border-indigo-500/30'}`}>
                                            {/* Header row: title + current balance */}
                                            <div className={`flex items-center justify-between gap-4 px-4 py-2.5 ${isLight ? 'bg-indigo-50 border-b border-indigo-100' : 'bg-indigo-500/10 border-b border-indigo-500/20'}`}>
                                                <span className={`text-sm font-bold ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
                                                    {language === 'he' ? 'סיכום כולל' : 'Grand total'}
                                                </span>
                                                <span className="flex items-baseline gap-1.5 tabular-nums">
                                                    <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{language === 'he' ? 'נוכחי' : 'Current'}</span>
                                                    <span className={`text-base font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>{formatMaslekaCurrency(maslekaDisplaySummary.total.currentBalance, language)}</span>
                                                </span>
                                            </div>
                                            {/* Two-column: no-dep | with-dep */}
                                            <div className={`flex gap-2 p-2 ${isLight ? 'bg-white' : 'bg-indigo-500/5'}`}>
                                                {/* No deposits */}
                                                <div className={`flex-1 rounded-lg px-3 py-2.5 space-y-1.5 ${isLight ? 'bg-sky-50 border border-sky-100' : 'bg-sky-500/10 border border-sky-500/20'}`}>
                                                    <div className={`text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'text-sky-500' : 'text-sky-400'}`}>{language === 'he' ? 'ללא הפקדות' : 'No deposits'}</div>
                                                    {maslekaDisplaySummary.total.projectedNoContribAnnuity > 0 ? (
                                                        <div>
                                                            <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{language === 'he' ? 'קצבה חודשית' : 'Monthly annuity'}</div>
                                                            <div className={`text-2xl font-bold tabular-nums leading-tight ${isLight ? 'text-sky-700' : 'text-sky-300'}`}>{formatMaslekaCurrency(maslekaDisplaySummary.total.projectedNoContribAnnuity, language)}</div>
                                                        </div>
                                                    ) : null}
                                                    <div className={`flex items-center gap-3 tabular-nums text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                        <span>{language === 'he' ? 'צבירה' : 'Balance'}: <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{formatMaslekaCurrency(maslekaDisplaySummary.total.projectedNoContribBalance, language)}</span></span>
                                                        {maslekaDisplaySummary.total.impliedNoDepositRate !== null && (
                                                            <span>{language === 'he' ? 'ריבית' : 'Rate'}: <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{formatPercentValue(maslekaDisplaySummary.total.impliedNoDepositRate)}</span></span>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* With deposits */}
                                                <div className={`flex-1 rounded-lg px-3 py-2.5 space-y-1.5 ${isLight ? 'bg-emerald-50 border border-emerald-100' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                                                    <div className={`text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>{language === 'he' ? 'עם הפקדות' : 'With deposits'}</div>
                                                    {maslekaDisplaySummary.total.projectedWithContribAnnuity > 0 ? (
                                                        <div>
                                                            <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{language === 'he' ? 'קצבה חודשית' : 'Monthly annuity'}</div>
                                                            <div className={`text-2xl font-bold tabular-nums leading-tight ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{formatMaslekaCurrency(maslekaDisplaySummary.total.projectedWithContribAnnuity, language)}</div>
                                                        </div>
                                                    ) : null}
                                                    <div className={`flex items-center gap-3 tabular-nums text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                        <span>{language === 'he' ? 'צבירה' : 'Balance'}: <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{formatMaslekaCurrency(maslekaDisplaySummary.total.projectedWithContribBalance, language)}</span></span>
                                                        {maslekaDisplaySummary.total.impliedWithDepositRate !== null && maslekaDisplaySummary.total.monthlyDeposits > 0 && (
                                                            <span>{language === 'he' ? 'ריבית' : 'Rate'}: <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{formatPercentValue(maslekaDisplaySummary.total.impliedWithDepositRate)}</span></span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Category breakdown — accordion, one open at a time */}
                                        <div className="space-y-1.5">
                                            {maslekaDisplaySummary.categories.map(category => {
                                                const isOpen = maslekaOpenCategory === category.key;
                                                return (
                                                    <div key={category.key} className={`rounded-lg border overflow-hidden ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}>
                                                        {/* Clickable header — always visible */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setMaslekaOpenCategory(isOpen ? null : category.key)}
                                                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-start transition-colors ${isOpen ? (isLight ? 'border-b border-slate-100 bg-slate-50' : 'border-b border-white/10 bg-white/5') : ''} ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
                                                                <span className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                                                    {language === 'he' ? category.labelHe : category.labelEn}
                                                                </span>
                                                                <span className={`text-[10px] shrink-0 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                                    {category.productCount} {language === 'he' ? 'מוצרים' : 'products'}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {[...new Set(category.products.map(p => p.company))].slice(0, 4).map((company, i) => (
                                                                    <CompanyLogo key={company} company={company} className={`w-6 h-6 ${i > 0 ? '-ms-1' : ''}`} />
                                                                ))}
                                                                {category.monthlyDeposits > 0 && (
                                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'}`}>
                                                                        +{formatMaslekaCurrency(category.monthlyDeposits, language)}/{language === 'he' ? 'חו׳' : 'mo'}
                                                                    </span>
                                                                )}
                                                                <span className={`text-xs font-semibold tabular-nums ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                                                    {formatMaslekaCurrency(category.currentBalance, language)}
                                                                </span>
                                                                <ChevronDown size={14} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${isLight ? 'text-slate-400' : 'text-gray-500'}`} />
                                                            </div>
                                                        </button>

                                                        {/* Expandable body */}
                                                        {isOpen && (
                                                            <>
                                                                {/* 3-column data: current / no-dep / with-dep */}
                                                                <div className={`grid grid-cols-3 text-xs divide-x ${isLight ? 'divide-slate-100' : 'divide-white/10'}`}>
                                                                    <div className="px-3 py-2.5">
                                                                        <div className={`text-[10px] mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{language === 'he' ? 'נוכחי' : 'Current'}</div>
                                                                        <div className={`font-bold tabular-nums ${isLight ? 'text-slate-800' : 'text-white'}`}>{formatMaslekaCurrency(category.currentBalance, language)}</div>
                                                                    </div>
                                                                    <div className="px-3 py-2.5">
                                                                        <div className={`text-[10px] mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{language === 'he' ? 'ללא הפקדות' : 'No deposits'}</div>
                                                                        <div className={`font-bold tabular-nums ${isLight ? 'text-sky-700' : 'text-sky-300'}`}>{formatMaslekaCurrency(category.projectedNoContribBalance, language)}</div>
                                                                        {category.projectedNoContribAnnuity > 0 && (
                                                                            <div className={`text-[10px] mt-0.5 flex items-center gap-2 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                                                <span>{language === 'he' ? 'קצבה' : 'Ann.'}: <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-white'}`}>{formatMaslekaCurrency(category.projectedNoContribAnnuity, language)}</span></span>
                                                                                {category.projectedNoContribBalance > 0 && <span className={`${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{language === 'he' ? 'מקדם' : 'coef.'}: <span className={`font-semibold tabular-nums ${isLight ? 'text-slate-800' : 'text-white'}`}>{Math.round(category.projectedNoContribBalance / category.projectedNoContribAnnuity)}</span></span>}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="px-3 py-2.5">
                                                                        <div className={`text-[10px] mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{language === 'he' ? 'עם הפקדות' : 'With deposits'}</div>
                                                                        <div className="font-bold tabular-nums" style={{ color: category.color }}>{formatMaslekaCurrency(category.projectedWithContribBalance, language)}</div>
                                                                        {category.projectedWithContribAnnuity > 0 && (
                                                                            <div className={`text-[10px] mt-0.5 flex items-center gap-2 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                                                <span>{language === 'he' ? 'קצבה' : 'Ann.'}: <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-white'}`}>{formatMaslekaCurrency(category.projectedWithContribAnnuity, language)}</span></span>
                                                                                {category.projectedWithContribBalance > 0 && <span className={`${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{language === 'he' ? 'מקדם' : 'coef.'}: <span className={`font-semibold tabular-nums ${isLight ? 'text-slate-800' : 'text-white'}`}>{Math.round(category.projectedWithContribBalance / category.projectedWithContribAnnuity)}</span></span>}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {/* Footer: rates & fees */}
                                                                <div className={`px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] border-t ${isLight ? 'border-slate-100 bg-slate-50/70 text-slate-500' : 'border-white/10 bg-black/10 text-gray-400'}`}>
                                                                    {category.impliedNoDepositRate !== null && (
                                                                        <span>{language === 'he' ? 'ריבית ללא הפקדות' : 'Rate (no dep.)'}: <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{formatPercentValue(category.impliedNoDepositRate)}</span></span>
                                                                    )}
                                                                    {category.impliedWithDepositRate !== null && category.monthlyDeposits > 0 && (
                                                                        <span>{language === 'he' ? 'עם הפקדות' : 'Rate (with dep.)'}: <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{formatPercentValue(category.impliedWithDepositRate)}</span></span>
                                                                    )}
                                                                    {category.weightedYearlyReturn !== null && (
                                                                        <span>{language === 'he' ? 'תשואה שנ"נ' : 'YTD'}: <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{formatPercentValue(category.weightedYearlyReturn)}</span></span>
                                                                    )}
                                                                    {category.weightedFeesFromBalance !== null && (
                                                                        <span>{language === 'he' ? 'דמי ניהול' : 'Mgmt fee'}: <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{formatPercentValue(category.weightedFeesFromBalance)}</span></span>
                                                                    )}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Product details — expandable, with filters */}
                                        <details className={`rounded-lg border ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'}`}>
                                            <summary className={`relative cursor-pointer px-3 py-2 text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                                {language === 'he' ? 'פירוט מוצרים' : 'Product details'}
                                                <span className={`ms-2 font-normal ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                                    {(maslekaProductTypeFilter !== 'all' || maslekaCompanyFilter !== 'all' || maslekaStatusFilter !== 'all')
                                                        ? `(${filteredMaslekaProducts.length}/${maslekaDisplaySummary.products.length})`
                                                        : `(${maslekaDisplaySummary.products.length})`}
                                                </span>
                                                {filteredMaslekaProducts.length > 0 && (
                                                    <span className="absolute inset-y-0 end-3 flex items-center gap-3 tabular-nums pointer-events-none">
                                                        <span className={`text-[10px] ${isLight ? 'text-sky-600' : 'text-sky-300'}`}>
                                                            {language === 'he' ? 'ללא הפקדות' : 'No dep'}:{' '}
                                                            <span className="font-semibold">{formatMaslekaCurrency(filteredMaslekaProducts.reduce((s, p) => s + p.projectedNoContribBalance, 0), language)}</span>
                                                        </span>
                                                        <span className={`text-[10px] ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                                                            {language === 'he' ? 'עם הפקדות' : 'With dep'}:{' '}
                                                            <span className="font-semibold">{formatMaslekaCurrency(filteredMaslekaProducts.reduce((s, p) => s + p.projectedWithContribBalance, 0), language)}</span>
                                                        </span>
                                                    </span>
                                                )}
                                            </summary>
                                            <div className={`flex items-end gap-2 px-3 pt-2 pb-2 text-xs ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                                <label className="flex flex-col gap-1 flex-1 min-w-0">
                                                    <span className={isLight ? 'text-slate-500' : 'text-gray-400'}>{language === 'he' ? 'סוג' : 'Type'}</span>
                                                    <CustomSelect
                                                        value={maslekaProductTypeFilter}
                                                        onChange={setMaslekaProductTypeFilter}
                                                        options={[
                                                            { value: 'all', label: language === 'he' ? 'הכל' : 'All' },
                                                            ...maslekaDisplaySummary.categories.map(category => ({
                                                                value: category.key,
                                                                label: language === 'he' ? category.labelHe : category.labelEn
                                                            }))
                                                        ]}
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1 flex-1 min-w-0">
                                                    <span className={isLight ? 'text-slate-500' : 'text-gray-400'}>{language === 'he' ? 'חברה' : 'Company'}</span>
                                                    <CustomSelect
                                                        value={maslekaCompanyFilter}
                                                        onChange={setMaslekaCompanyFilter}
                                                        options={[
                                                            { value: 'all', label: language === 'he' ? 'הכל' : 'All' },
                                                            ...maslekaCompanies.map(company => ({
                                                                value: company,
                                                                label: company
                                                            }))
                                                        ]}
                                                    />
                                                </label>
                                                <div className="flex flex-col gap-1 shrink-0">
                                                    <span className={isLight ? 'text-slate-500' : 'text-gray-400'}>{language === 'he' ? 'סטטוס' : 'Status'}</span>
                                                    <div className={`flex gap-1 rounded-lg p-0.5 ${isLight ? 'bg-slate-100' : 'bg-white/10'}`}>
                                                        {[
                                                            { value: 'all', label: language === 'he' ? 'הכל' : 'All' },
                                                            { value: 'active', label: language === 'he' ? 'פעיל' : 'Active' },
                                                            { value: 'inactive', label: language === 'he' ? 'לא פעיל' : 'Inactive' }
                                                        ].map(opt => (
                                                            <button
                                                                key={opt.value}
                                                                type="button"
                                                                onClick={() => setMaslekaStatusFilter(opt.value)}
                                                                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${maslekaStatusFilter === opt.value
                                                                    ? opt.value === 'active'
                                                                        ? 'bg-emerald-500 text-white shadow-sm'
                                                                        : opt.value === 'inactive'
                                                                            ? (isLight ? 'bg-slate-400 text-white shadow-sm' : 'bg-slate-600 text-white shadow-sm')
                                                                            : (isLight ? 'bg-white text-slate-700 shadow-sm' : 'bg-white/20 text-white shadow-sm')
                                                                    : (isLight ? 'text-slate-500 hover:text-slate-700' : 'text-gray-400 hover:text-gray-200')
                                                                }`}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {(() => {
                                                    const hasFilter = maslekaProductTypeFilter !== 'all' || maslekaCompanyFilter !== 'all' || maslekaStatusFilter !== 'all';
                                                    return (
                                                        <button
                                                            disabled={!hasFilter}
                                                            onClick={() => { setMaslekaProductTypeFilter('all'); setMaslekaCompanyFilter('all'); setMaslekaStatusFilter('all'); }}
                                                            className={`self-end shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${hasFilter
                                                                ? (isLight ? 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100' : 'bg-white/10 text-gray-300 hover:bg-white/15')
                                                                : (isLight ? 'border border-slate-200 text-slate-300 cursor-default' : 'border border-white/10 text-gray-600 cursor-default')
                                                            }`}
                                                        >
                                                            {language === 'he' ? 'נקה' : 'Clear'}
                                                        </button>
                                                    );
                                                })()}
                                            </div>
                                            <table className={`w-full text-[10px] table-fixed ${isLight ? 'text-slate-500 bg-slate-100' : 'text-gray-400 bg-black/40'}`}>
                                                <colgroup>
                                                    <col style={{ width: '30%' }} />
                                                    <col style={{ width: '14%' }} />
                                                    <col style={{ width: '12%' }} />
                                                    <col style={{ width: '13%' }} />
                                                    <col style={{ width: '13%' }} />
                                                    <col style={{ width: '11%' }} />
                                                    <col style={{ width: '7%' }} />
                                                </colgroup>
                                                <thead>
                                                    <tr>
                                                        <th className="px-3 py-2 text-start">{language === 'he' ? 'מוצר' : 'Product'}</th>
                                                        <th className="px-3 py-2 text-start">{language === 'he' ? 'סוג' : 'Type'}</th>
                                                        <th className="px-3 py-2 text-end">{language === 'he' ? 'נוכחי' : 'Current'}</th>
                                                        <th className="px-3 py-2 text-end">{language === 'he' ? 'ללא הפקדות' : 'No dep.'}</th>
                                                        <th className="px-3 py-2 text-end">{language === 'he' ? 'עם הפקדות' : 'With dep.'}</th>
                                                        <th className="px-3 py-2 text-end">{language === 'he' ? 'קצבה' : 'Annuity'}</th>
                                                        <th className="px-3 py-2 text-end">{language === 'he' ? 'ריבית' : 'Rate'}</th>
                                                    </tr>
                                                </thead>
                                            </table>
                                            <div className="max-h-64 overflow-auto custom-scrollbar scrollbar-right">
                                                <table className="w-full text-[10px] table-fixed">
                                                    <colgroup>
                                                        <col style={{ width: '30%' }} />
                                                        <col style={{ width: '14%' }} />
                                                        <col style={{ width: '12%' }} />
                                                        <col style={{ width: '13%' }} />
                                                        <col style={{ width: '13%' }} />
                                                        <col style={{ width: '11%' }} />
                                                        <col style={{ width: '7%' }} />
                                                    </colgroup>
                                                    <tbody>
                                                        {filteredMaslekaProducts.map(product => (
                                                            <tr key={product.id} className={`border-t ${isLight ? 'border-slate-200 text-slate-700' : 'border-white/10 text-gray-200'}`}>
                                                                <td className="px-3 py-2">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <CompanyLogo company={product.company} className="w-6 h-6 shrink-0" />
                                                                        <div className="min-w-0">
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <span className="font-medium truncate">{product.productName}</span>
                                                                                <span className={`shrink-0 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold leading-none ${product.status === 'פעיל' ? (isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300') : (isLight ? 'bg-slate-200 text-slate-500' : 'bg-white/10 text-gray-400')}`}>
                                                                                    {product.status === 'פעיל' ? (language === 'he' ? 'פעיל' : 'Active') : (language === 'he' ? 'לא פעיל' : 'Inactive')}
                                                                                </span>
                                                                            </div>
                                                                            <div className={`truncate ${isLight ? 'text-slate-500' : 'text-gray-400'}`} title={product.company}>{product.company}</div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <span className="inline-flex items-center gap-1.5">
                                                                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: maslekaDisplaySummary.categories.find(c => c.key === product.categoryKey)?.color || '#64748B' }} />
                                                                        <span>{maslekaDisplaySummary.categories.find(c => c.key === product.categoryKey)?.[language === 'he' ? 'labelHe' : 'labelEn'] || product.categoryKey}</span>
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-end tabular-nums">{formatMaslekaCurrency(product.currentBalance, language)}</td>
                                                                <td className="px-3 py-2 text-end tabular-nums">{formatMaslekaCurrency(product.projectedNoContribBalance, language)}</td>
                                                                <td className="px-3 py-2 text-end tabular-nums">{formatMaslekaCurrency(product.projectedWithContribBalance, language)}</td>
                                                                <td className="px-3 py-2 text-end">
                                                                    <div className="tabular-nums">{formatMaslekaCurrency(product.projectedNoContribAnnuity, language)}</div>
                                                                    {product.projectedWithContribAnnuity > 0 && product.projectedWithContribAnnuity !== product.projectedNoContribAnnuity && (
                                                                        <div className={`tabular-nums ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>{formatMaslekaCurrency(product.projectedWithContribAnnuity, language)}</div>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2 text-end">
                                                                    <div className="tabular-nums">{formatPercentValue(product.impliedNoDepositRate)}</div>
                                                                    {product.impliedWithDepositRate !== null && product.monthlyDeposits > 0 && product.impliedWithDepositRate !== product.impliedNoDepositRate && (
                                                                        <div className={`tabular-nums ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>{formatPercentValue(product.impliedWithDepositRate)}</div>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {filteredMaslekaProducts.length === 0 && (
                                                            <tr className={`border-t ${isLight ? 'border-slate-200 text-slate-500' : 'border-white/10 text-gray-400'}`}>
                                                                <td colSpan={7} className="px-3 py-4 text-center">
                                                                    {language === 'he' ? 'אין מוצרים התואמים לסינון' : 'No products match the filters'}
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </details>
                                        <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                            {language === 'he'
                                                ? 'הקובץ מציג "תשואה מתחילת השנה"; אם קיימת הנחת ריבית פנימית אחרת לתחזית, היא אינה מופיעה כשדה נפרד בקובץ ולכן אינה ניתנת לחילוץ ודאי.'
                                                : 'The file exposes YTD return; if a separate projection interest assumption exists internally, it is not present as a dedicated field and cannot be extracted reliably.'}
                                        </p>
                                    </div>
                            )}
                        </div>

                        {/* AI Analysis Panel */}
                        {aiPanelVisible && (aiInsight || isLoadingAI || aiError) && (
                            <div className={`rounded-xl border transition-all duration-300 ${pensionAICardClass}`}>
                                <div
                                    className={`flex items-center justify-between gap-3 p-3 cursor-pointer ${!aiPanelCollapsed ? (isLight ? 'border-b border-slate-200' : 'border-b border-white/10') : ''}`}
                                    onClick={() => setAiPanelCollapsed(c => {
                                        if (c) { setShowIncomeSources(false); setShowDeferralPanel(false); setExpandedMilestone(null); }
                                        return !c;
                                    })}
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        <div className={`p-1 rounded ${isLight ? 'bg-purple-100 text-purple-600' : 'bg-purple-500/20 text-purple-400'}`}>
                                            <Sparkles size={14} />
                                        </div>
                                        <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                            {language === 'he' ? 'ניתוח AI' : 'AI Analysis'}
                                        </h3>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <button onClick={e => { e.stopPropagation(); setAiPanelVisible(false); }} className={`p-1 rounded-full transition-colors ${isLight ? 'hover:bg-slate-200 text-slate-400 hover:text-slate-600' : 'hover:bg-white/10 text-gray-500 hover:text-gray-300'}`}>
                                            <X size={14} />
                                        </button>
                                        <button className={`p-1 rounded-full transition-colors ${isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}>
                                            {aiPanelCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                        </button>
                                    </div>
                                </div>
                                {!aiPanelCollapsed && (
                                    <div className="p-4 space-y-3">
                                        {isLoadingAI && (
                                            <div className="flex items-center gap-2 py-1">
                                                <Loader2 size={16} className="animate-spin text-purple-400" />
                                                <span className={`text-sm ${isLight ? 'text-purple-600' : 'text-purple-300'}`}>{language === 'he' ? 'מנתח נתוני פנסיה...' : 'Analyzing pension data...'}</span>
                                            </div>
                                        )}
                                        {aiError && (() => {
                                            const isHe = language === 'he';
                                            const cfg = {
                                                balance: { Icon: CreditCard,  color: 'amber',  title: isHe ? 'אין קרדיט API'     : 'Insufficient API Credits', body: isHe ? 'יש להוסיף קרדיט לחשבון ספק ה-AI'            : 'Add credits to your AI provider account' },
                                                quota:   { Icon: WifiOff,     color: 'orange', title: isHe ? 'חריגה ממכסת API'   : 'API Quota Exceeded',       body: isHe ? 'הגעת למגבלת הבקשות — נסה שוב בעוד כמה דקות' : 'Rate limit reached — try again in a few minutes' },
                                                auth:    { Icon: KeyRound,    color: 'red',    title: isHe ? 'מפתח API שגוי'     : 'Invalid API Key',          body: isHe ? 'בדוק את מפתח ה-API בהגדרות'                  : 'Check your API key in Settings' },
                                                context: { Icon: FileX,       color: 'purple', title: isHe ? 'הבקשה ארוכה מדי'   : 'Request Too Long',         body: isHe ? 'נסה להסיר מקורות הכנסה'                      : 'Try removing some income sources' },
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
                                        {aiInsight && (
                                            <div className="space-y-3 text-sm leading-relaxed" dir={language === 'he' ? 'rtl' : 'ltr'}>
                                        {/* Period Scores */}
                                        {aiInsight.periodScores?.length > 0 && (
                                            <div className={`rounded-xl border-l-4 border-l-purple-500 border p-4 space-y-3 ${pensionAISectionClass}`}>
                                                <p className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{language === 'he' ? 'ציון לפי תקופה:' : 'Score by Period:'}</p>
                                                <div className="flex flex-col gap-3">
                                                    {aiInsight.periodScores.map((p, i) => {
                                                        const score = Math.min(100, Math.max(0, Math.round(p.score)));
                                                        const circumference = 2 * Math.PI * 40;
                                                        const offset = circumference - (score / 100) * circumference;
                                                        const ringColor = score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-amber-500' : 'text-red-500';
                                                        const labelColor = score >= 80 ? (isLight ? 'text-emerald-600' : 'text-emerald-400') : score >= 60 ? (isLight ? 'text-amber-600' : 'text-amber-400') : (isLight ? 'text-red-600' : 'text-red-400');
                                                        return (
                                                            <div key={i} className="flex items-center gap-3" title={p.note}>
                                                                <div className="relative flex-shrink-0">
                                                                    <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 96 96">
                                                                        <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className={isLight ? 'text-gray-200' : 'text-white/10'} />
                                                                        <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                                                                            strokeDasharray={circumference}
                                                                            strokeDashoffset={offset}
                                                                            strokeLinecap="round"
                                                                            className={`${ringColor} transition-all duration-700 ease-out`}
                                                                        />
                                                                    </svg>
                                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                                        <span className={`text-sm font-bold ${isLight ? 'text-slate-700' : 'text-white'}`}>{score}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                                                        {language === 'he' ? `גיל ${p.fromAge}–${p.toAge ?? '∞'}` : `Age ${p.fromAge}–${p.toAge ?? '∞'}`}
                                                                    </div>
                                                                    {p.label && <div className={`text-xs ${labelColor}`}>{p.label}</div>}
                                                                    {p.note && <div className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{p.note}</div>}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        {aiInsight.summary && <p className={`rounded-xl border-l-4 border-l-purple-500 border p-4 ${pensionAISectionClass} ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{aiInsight.summary}</p>}
                                        {aiInsight.incomeAnalysis && (
                                            <div className={`rounded-xl border-l-4 border-l-blue-500 border p-4 ${pensionAISectionClass}`}>
                                                <p className={`text-base font-semibold mb-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>{language === 'he' ? 'ניתוח הכנסות:' : 'Income Analysis:'}</p>
                                                <p className={isLight ? 'text-slate-600' : 'text-gray-300'}>{aiInsight.incomeAnalysis}</p>
                                            </div>
                                        )}
                                        {aiInsight.taxOptimization && (
                                            <div className={`rounded-xl border-l-4 border-l-emerald-500 border p-4 ${pensionAISectionClass}`}>
                                                <p className={`text-base font-semibold mb-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>{language === 'he' ? 'אופטימיזציית מס:' : 'Tax Optimization:'}</p>
                                                <p className={isLight ? 'text-slate-600' : 'text-gray-300'}>{aiInsight.taxOptimization}</p>
                                            </div>
                                        )}
                                        {aiInsight.gaps && (
                                            <div className={`rounded-xl border-l-4 border-l-red-500 border p-4 ${pensionAISectionClass}`}>
                                                <p className={`text-base font-semibold mb-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>{language === 'he' ? 'פערים:' : 'Gaps:'}</p>
                                                <p className={isLight ? 'text-slate-600' : 'text-gray-300'}>{aiInsight.gaps}</p>
                                            </div>
                                        )}
                                        {aiInsight.recommendations?.length > 0 && (
                                            <div>
                                                <p className={`text-base font-semibold mb-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>{language === 'he' ? 'המלצות:' : 'Recommendations:'}</p>
                                                <ul className="space-y-2">
                                                    {aiInsight.recommendations.map((r, i) => (
                                                        <li key={i} className={`p-4 rounded-xl border ${pensionAISectionClass}`}>
                                                            <span className={`text-base font-semibold ${isLight ? 'text-purple-700' : 'text-purple-300'}`}>{r.title}</span>
                                                            {r.description && <p className={`mt-0.5 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>{r.description}</p>}
                                                            {r.impact && <p className={`mt-0.5 font-medium ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>{r.impact}</p>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {aiInsight.conclusion && <p className={`italic ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{aiInsight.conclusion}</p>}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Income Sources */}
                        <div className={`rounded-xl border transition-all duration-300 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                            <div
                                className={`flex items-center justify-between gap-3 p-3 cursor-pointer ${showIncomeSources ? (isLight ? 'border-b border-slate-200' : 'border-b border-white/10') : ''}`}
                                onClick={toggleIncomeSources}
                            >
                                <div className="flex min-w-0 items-center gap-2">
                                    <div className={`p-1 rounded ${isLight ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                        <Wallet size={14} />
                                    </div>
                                    <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                        {t('incomeSources') || 'מקורות הכנסה'}
                                    </h3>
                                    {!showIncomeSources && (
                                        <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                            ({incomeSources.length})
                                        </span>
                                    )}
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    {showIncomeSources && (
                                        <div className="flex gap-1 flex-wrap items-center" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={undoSources}
                                            disabled={!canUndoSources}
                                            title="Undo (Ctrl+Z)"
                                            className={`p-1.5 rounded transition-colors ${canUndoSources ? (isLight ? 'text-slate-600 hover:bg-slate-200' : 'text-gray-300 hover:bg-white/10') : (isLight ? 'text-slate-300 cursor-not-allowed' : 'text-gray-600 cursor-not-allowed')}`}
                                        >
                                            <Undo2 size={14} />
                                        </button>
                                        <button
                                            onClick={redoSources}
                                            disabled={!canRedoSources}
                                            title="Redo (Ctrl+Y)"
                                            className={`p-1.5 rounded transition-colors ${canRedoSources ? (isLight ? 'text-slate-600 hover:bg-slate-200' : 'text-gray-300 hover:bg-white/10') : (isLight ? 'text-slate-300 cursor-not-allowed' : 'text-gray-600 cursor-not-allowed')}`}
                                        >
                                            <Redo2 size={14} />
                                        </button>
                                        <button
                                            onClick={() => setSourceStatsSource(sortedIncomeSources.find(s => s.currentAsset) || null)}
                                            disabled={!sortedIncomeSources.some(s => s.currentAsset)}
                                            className={`px-2 py-1.5 rounded text-xs flex items-center gap-1.5 ${sortedIncomeSources.some(s => s.currentAsset)
                                                ? (isLight ? 'bg-sky-100 text-sky-700 hover:bg-sky-200' : 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30')
                                                : (isLight ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-gray-500 cursor-not-allowed')}`}
                                        >
                                            <BarChart3 size={14} />
                                            {language === 'he' ? 'סטטיסטיקה' : 'Stats'}
                                        </button>
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
                                    <button className={`p-1 rounded-full transition-colors ${isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}>
                                        {showIncomeSources ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                </div>
                            </div>

                            {showIncomeSources && (
                                <div className="p-2 space-y-1 max-h-72 overflow-y-auto custom-scrollbar scrollbar-right animate-in slide-in-from-top-2 fade-in duration-200">
                                    {sortedIncomeSources.map(source => (
                                        <IncomeSourceRow
                                            key={source.id}
                                            source={source}
                                            currentAge={inputs.currentAge}
                                            defaultStartAge={retirementEndAge}
                                            defaultReturnRate={pensionInterestRate}
                                            onUpdate={updateIncomeSource}
                                            onEditCalculated={editCurrentAssetSource}
                                            onDelete={deleteIncomeSource}
                                            onOpenStats={setSourceStatsSource}
                                            t={t}
                                            language={language}
                                            isLight={isLight}
                                        />
                                    ))}
                                    <div className={`mt-2 pt-2 space-y-2 border-t ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <h4 className={`text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-gray-100'}`}>
                                                    {language === 'he' ? 'נתונים קיימים היום' : 'Balances that exist today'}
                                                </h4>
                                                <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                    {language === 'he'
                                                        ? 'מחושבים בחלון הפנסיה לפי גיל היעד והריבית למעלה.'
                                                        : 'Projected inside the pension window using the target age and rate above.'}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                <button onClick={() => openCurrentAssetForm('pension')} className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 ${isLight ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}>
                                                    <Plus size={12} />{language === 'he' ? 'פנסיה קיימת' : 'Pension'}
                                                </button>
                                                <button onClick={() => openCurrentAssetForm('provident')} className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 ${isLight ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'}`}>
                                                    <Plus size={12} />{language === 'he' ? 'גמל' : 'Provident'}
                                                </button>
                                                <button onClick={() => openCurrentAssetForm('severance')} className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 ${isLight ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'}`}>
                                                    <Plus size={12} />{language === 'he' ? 'פיצויים' : 'Severance'}
                                                </button>
                                            </div>
                                        </div>
                                        {currentAssetDraft && currentAssetPreview && (
                                            <div ref={currentAssetFormRef}>
                                                <CurrentAssetForm
                                                    source={currentAssetDraft}
                                                    projectedSource={currentAssetPreview}
                                                    currentAge={inputs.currentAge}
                                                    defaultReturnRate={pensionInterestRate}
                                                    canSave={currentAssetCanSave}
                                                    onUpdate={(updates) => setCurrentAssetDraft(prev => ({ ...prev, ...updates }))}
                                                    onAdd={addCalculatedCurrentAsset}
                                                    onCancel={() => {
                                                        setCurrentAssetDraft(null);
                                                        setCurrentAssetEditBaseline(null);
                                                    }}
                                                    maslekaCategories={maslekaDisplaySummary?.categories}
                                                    maslekaAsOfDate={maslekaDisplaySummary?.asOfDate}
                                                    language={language}
                                                    isLight={isLight}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {incomeSources.length === 0 && (
                                        <div className={`text-center py-4 text-sm ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                                            {t('noIncomeSources') || 'לא הוגדרו מקורות הכנסה'}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {sourceStatsSource && (
                            <SourceStatsModal
                                source={sourceStatsSource}
                                sources={sortedIncomeSources}
                                currentAge={inputs.currentAge}
                                defaultStartAge={retirementEndAge}
                                defaultReturnRate={pensionInterestRate}
                                language={language}
                                isLight={isLight}
                                onSelectSource={setSourceStatsSource}
                                onClose={() => setSourceStatsSource(null)}
                            />
                        )}

                        {/* NI Deferral Panel */}
                        {deferralCalc && (
                            <div className={`rounded-xl border transition-all duration-300 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                                <button
                                    onClick={toggleDeferralPanel}
                                    className={`w-full flex items-center justify-between gap-3 p-3 ${isLight ? 'hover:bg-slate-100' : 'hover:bg-white/5'} transition-colors`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1 rounded ${isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/20 text-blue-400'}`}>
                                            <Clock size={14} />
                                        </div>
                                        <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                            {language === 'he' ? 'דחיית ביטוח לאומי' : 'NI Deferral Analysis'}
                                        </h3>
                                        {deferralYears > 0 && (
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/20 text-blue-400'}`}>
                                                {deferralYears === 1 ? (language === 'he' ? 'שנה 1' : '1 year') : (language === 'he' ? `${deferralYears} שנים` : `${deferralYears} years`)}
                                            </span>
                                        )}
                                    </div>
                                    <span className={`shrink-0 p-1 rounded-full ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                        {showDeferralPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </span>
                                </button>

                                {showDeferralPanel && (
                                    <div className={`p-3 border-t space-y-3 ${isLight ? 'border-slate-200' : 'border-white/10'}`} dir={language === 'he' ? 'rtl' : 'ltr'}>
                                        {/* Slider */}
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                    {language === 'he' ? 'שנות דחייה' : 'Deferral years'}
                                                </span>
                                                <span className={`text-sm font-bold ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>
                                                    {deferralYears === 0
                                                        ? (language === 'he' ? 'ללא דחייה' : 'No deferral')
                                                        : (language === 'he' ? `${deferralYears} שנים` : `${deferralYears} years`)}
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="5"
                                                step="1"
                                                value={language === 'he' ? 5 - deferralYears : deferralYears}
                                                onChange={e => setDeferralYears(language === 'he' ? 5 - parseInt(e.target.value) : parseInt(e.target.value))}
                                                className="w-full accent-blue-500"
                                                style={language === 'he' ? { transform: 'scaleX(-1)' } : {}}
                                            />
                                            <div dir="ltr" className={`flex justify-between text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                                {language === 'he'
                                                    ? <><span>5</span><span>4</span><span>3</span><span>2</span><span>1</span><span>0</span></>
                                                    : <><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></>
                                                }
                                            </div>
                                        </div>

                                        {/* Comparison Table */}
                                        <div className={`rounded-lg overflow-hidden border ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                                            <div className={`grid grid-cols-3 text-[10px] font-semibold uppercase tracking-wide px-3 py-2 ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-white/5 text-gray-400'}`}>
                                                <span>{language === 'he' ? 'פרמטר' : 'Parameter'}</span>
                                                <span className="text-center">{language === 'he' ? 'ללא דחייה' : 'No deferral'}</span>
                                                <span className="text-center">{language === 'he' ? 'עם דחייה' : 'With deferral'}</span>
                                            </div>
                                            <div className={`divide-y text-xs ${isLight ? 'divide-slate-100' : 'divide-white/5'}`}>
                                                <div className={`grid grid-cols-3 px-3 py-2 ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}>
                                                    <span className={isLight ? 'text-slate-600' : 'text-gray-400'}>{language === 'he' ? 'קצבה חודשית (נטו)' : 'Monthly net'}</span>
                                                    <span className={`text-center font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{formatCurrency(Math.round(deferralCalc.baseNet))}</span>
                                                    <span className={`text-center font-medium ${deferralYears > 0 ? (isLight ? 'text-emerald-600' : 'text-emerald-400') : (isLight ? 'text-slate-900' : 'text-white')}`}>
                                                        {formatCurrency(Math.round(deferralCalc.deferredNet))}
                                                        {deferralYears > 0 && deferralCalc.deltaNet > 0 && (
                                                            <span className="text-[10px] ms-1 opacity-70">(+{formatCurrency(Math.round(deferralCalc.deltaNet))})</span>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className={`grid grid-cols-3 px-3 py-2 ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}>
                                                    <span className={isLight ? 'text-slate-600' : 'text-gray-400'}>{language === 'he' ? 'עלות מימון' : 'Funding cost'}</span>
                                                    <span className={`text-center font-medium ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>—</span>
                                                    <span className={`text-center font-medium ${deferralYears > 0 ? (isLight ? 'text-red-600' : 'text-red-400') : (isLight ? 'text-slate-400' : 'text-gray-500')}`}>
                                                        {deferralYears > 0 ? formatCurrency(Math.round(deferralCalc.fundingCost)) : '—'}
                                                    </span>
                                                </div>
                                                <div className={`grid grid-cols-3 px-3 py-2 ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}>
                                                    <span className={isLight ? 'text-slate-600' : 'text-gray-400'}>{language === 'he' ? 'יתרת תיק בתחילת קצבה' : 'Portfolio at pension start'}</span>
                                                    <span className={`text-center font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{formatCurrency(Math.round(deferralCalc.balAtNiAge))}</span>
                                                    <span className={`text-center font-medium ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`}>
                                                        {deferralYears > 0 ? formatCurrency(Math.round(deferralCalc.projectedBalance)) : '—'}
                                                    </span>
                                                </div>
                                                <div className={`grid grid-cols-3 px-3 py-2 ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}>
                                                    <span className={isLight ? 'text-slate-600' : 'text-gray-400'}>{language === 'he' ? 'גיל החזר השקעה' : 'Break-even age'}</span>
                                                    <span className={`text-center font-medium ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>—</span>
                                                    <span className={`text-center font-bold ${deferralCalc.breakEvenAge ? (isLight ? 'text-amber-600' : 'text-amber-400') : (isLight ? 'text-slate-400' : 'text-gray-500')}`}>
                                                        {deferralYears > 0
                                                            ? (deferralCalc.breakEvenAge ? `${language === 'he' ? 'גיל' : 'Age'} ${deferralCalc.breakEvenAge}` : '—')
                                                            : '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {deferralYears > 0 && deferralCalc.breakEvenAge && (
                                            <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                {language === 'he'
                                                    ? `דחייה כדאית אם תחיה מעבר לגיל ${deferralCalc.breakEvenAge}.`
                                                    : `Deferral pays off if you live past age ${deferralCalc.breakEvenAge}.`}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

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
                                        onToggle={() => toggleMilestone(idx)}
                                        pensionInterestRate={pensionInterestRate}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className={`relative z-10 flex justify-end gap-3 p-4 border-t ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-black/20'}`}>
                        <button
                            onClick={onClose}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            {t('close') || 'סגור'}
                        </button>
                        {onSave && (
                            <button
                                onClick={() => onSave(incomeSources, pensionInterestRate, aiInsight, maslekaSummary)}
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
                    geminiApiKey={geminiApiKey}
                />

                {/* Bracket Overlay Viewer */}
                {showBracketTable && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowBracketTable(false)} />
                        <div className={`relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden border ${isLight ? 'bg-white border-slate-200' : 'border-white/30'}`}>
                            {!isLight && (
                                <>
                                    <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                                    <div className="absolute inset-0 bg-white/10" />
                                </>
                            )}
                            <div className={`relative z-10 p-4 border-b flex justify-between items-center ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                                <h3 className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                    {language === 'he' ? 'מדרגות מס ופטור פנסיוני 2026' : 'Tax Brackets & Exemptions 2026'}
                                </h3>
                                <button onClick={() => setShowBracketTable(false)} className="p-1 hover:bg-black/10 rounded-full transition-colors">
                                    <X size={20} className={isLight ? 'text-slate-500' : 'text-gray-400'} />
                                </button>
                            </div>
                            <div className="relative z-10 p-6 overflow-y-auto max-h-[85vh] custom-scrollbar">
                                <div className="space-y-4">
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
                                                    <span className="opacity-70 text-[10px] font-normal">(₪ {Math.round(niCalc.seniorityBonus).toLocaleString()})</span>
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
                                <div className="mt-2">
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
