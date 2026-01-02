import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useThemeClasses } from '../hooks/useThemeClasses';
import { EVENT_TYPES } from '../constants';
import { X, DollarSign, Calendar, TrendingUp, TrendingDown, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { CustomSelect } from './common/CustomSelect';

const MONTHS = [
    { value: 1, labelEn: 'January', labelHe: 'ינואר' },
    { value: 2, labelEn: 'February', labelHe: 'פברואר' },
    { value: 3, labelEn: 'March', labelHe: 'מרץ' },
    { value: 4, labelEn: 'April', labelHe: 'אפריל' },
    { value: 5, labelEn: 'May', labelHe: 'מאי' },
    { value: 6, labelEn: 'June', labelHe: 'יוני' },
    { value: 7, labelEn: 'July', labelHe: 'יולי' },
    { value: 8, labelEn: 'August', labelHe: 'אוגוסט' },
    { value: 9, labelEn: 'September', labelHe: 'ספטמבר' },
    { value: 10, labelEn: 'October', labelHe: 'אוקטובר' },
    { value: 11, labelEn: 'November', labelHe: 'נובמבר' },
    { value: 12, labelEn: 'December', labelHe: 'דצמבר' }
];

/**
 * AddEventModal - Modal for adding/editing life events
 */
export default function AddEventModal({
    event = null, // If editing, pass existing event
    onSave,
    onCancel,
    t,
    language,
    currentAge,
    retirementAge,
    retirementEndAge,
    onDelete // Optional callback for delete
}) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const classes = useThemeClasses();
    const currency = language === 'he' ? '₪' : '$';
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // Helper to calculate age based on selected year
    const getAgeAtYear = (year) => {
        if (!currentAge || !year) return null;
        return Math.floor(currentAge + (parseInt(year) - currentYear));
    };

    // Form state - using standard initializers
    const [eventType, setEventType] = useState(event?.type || EVENT_TYPES.ONE_TIME_INCOME);
    const [startYear, setStartYear] = useState(event?.startDate?.year || currentYear);
    const [startMonth, setStartMonth] = useState(event?.startDate?.month || currentMonth);
    const [hasEndDate, setHasEndDate] = useState(!!(event?.endDate && event.endDate.year));
    const [endYear, setEndYear] = useState(event?.endDate?.year || currentYear + 1);
    const [endMonth, setEndMonth] = useState(event?.endDate?.month || currentMonth);
    const [amount, setAmount] = useState(event?.amount || '');
    const [monthlyChange, setMonthlyChange] = useState(event?.monthlyChange || '');
    const [description, setDescription] = useState(event?.description || '');

    // Synchronize form state when event prop changes (crucial for modal reuse)
    useEffect(() => {
        setEventType(event?.type || EVENT_TYPES.ONE_TIME_INCOME);
        setStartYear(event?.startDate?.year || currentYear);
        setStartMonth(event?.startDate?.month || currentMonth);
        setHasEndDate(!!(event?.endDate && event.endDate.year));
        setEndYear(event?.endDate?.year || currentYear + 1);
        setEndMonth(event?.endDate?.month || currentMonth);
        setAmount(event?.amount || '');
        setMonthlyChange(event?.monthlyChange || '');
        setDescription(event?.description || '');
    }, [event, currentYear, currentMonth]);

    const isRecurring = eventType === EVENT_TYPES.INCOME_CHANGE || eventType === EVENT_TYPES.EXPENSE_CHANGE;
    const isOneTime = eventType === EVENT_TYPES.ONE_TIME_INCOME || eventType === EVENT_TYPES.ONE_TIME_EXPENSE;

    // Update fields when event type changes
    useEffect(() => {
        // When switching between one-time and recurring,  reset amounts
        if (isRecurring && amount) {
            setMonthlyChange(amount);
            setAmount('');
        } else if (isOneTime && monthlyChange) {
            setAmount(monthlyChange);
            setMonthlyChange('');
        }
    }, [eventType]);

    // Validation to prevent end date before start date
    useEffect(() => {
        if (hasEndDate && endYear && startYear) {
            const startYearNum = parseInt(startYear);
            const endYearNum = parseInt(endYear);
            const startMonthNum = parseInt(startMonth);
            const endMonthNum = parseInt(endMonth);

            if (endYearNum < startYearNum || (endYearNum === startYearNum && endMonthNum < startMonthNum)) {
                setEndYear(startYearNum);
                setEndMonth(startMonthNum);
            }
        }
    }, [startYear, startMonth, endYear, endMonth, hasEndDate]);

    const handleSave = () => {
        // Validation
        if (!startYear || !startMonth) {
            alert(t ? t('pleaseSelectStartDate') : 'Please select a start date');
            return;
        }

        if (isRecurring && hasEndDate && (!endYear || !endMonth)) {
            alert(t ? t('pleaseSelectEndDate') : 'Please select an end date');
            return;
        }

        if (isOneTime && (!amount || parseFloat(amount) <= 0)) {
            alert(t ? t('pleaseEnterAmount') : 'Please enter a valid amount');
            return;
        }

        if (isRecurring && (!monthlyChange || parseFloat(monthlyChange) === 0)) {
            alert(t ? t('pleaseEnterMonthlyChange') : 'Please enter a valid monthly change');
            return;
        }

        // Create event object
        const newEvent = {
            ...(event || {}), // Preserve ID and other fields if editing
            type: eventType,
            startDate: {
                year: parseInt(startYear),
                month: parseInt(startMonth)
            },
            endDate: isRecurring && hasEndDate ? {
                year: parseInt(endYear),
                month: parseInt(endMonth)
            } : null,
            amount: isOneTime ? parseFloat(amount) : null,
            monthlyChange: isRecurring ? parseFloat(monthlyChange) : null,
            description
        };

        onSave(newEvent);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4" onClick={onCancel}>
            <div
                className={`rounded-2xl w-full max-w-lg h-[600px] shadow-xl flex flex-col relative overflow-hidden ${isLight ? 'bg-white border border-gray-200' : 'border border-white/30'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {!isLight && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                        <div className="absolute inset-0 bg-white/10" />
                    </>
                )}
                {/* Unified Directional Container */}
                <div
                    className="relative z-10 w-full h-full flex flex-col"
                    dir={language === 'he' ? 'rtl' : 'ltr'}
                >
                    {/* Header */}
                    <div className="flex-none flex items-center justify-between p-4 border-b border-gray-200 dark:border-white/10">
                        <h3 className={`text-lg font-semibold ${classes.headerLabel}`}>
                            {event
                                ? (t ? t('editEvent') : 'Edit Event')
                                : (t ? t('addEvent') : 'Add Life Event')
                            }
                        </h3>
                        <button
                            onClick={onCancel}
                            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 ${classes.icon}`}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Scrollable Form Content */}
                    <div className="flex-grow overflow-y-auto custom-scrollbar" dir="ltr">
                        <div className="p-4 space-y-4" dir={language === 'he' ? 'rtl' : 'ltr'}>
                            {/* Event Type */}
                            <div className="space-y-2">
                                <label className={`text-xs font-medium ${classes.headerLabel}`}>
                                    {t ? t('eventType') : 'Event Type'}
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        {
                                            type: EVENT_TYPES.ONE_TIME_INCOME,
                                            icon: TrendingUp,
                                            label: t ? t('oneTimeIncome') : 'One-Time Income',
                                            color: 'text-green-500',
                                            activeClass: isLight ? 'bg-green-50 border-green-500 text-green-700' : 'bg-green-500/20 border-green-500 text-green-300'
                                        },
                                        {
                                            type: EVENT_TYPES.ONE_TIME_EXPENSE,
                                            icon: TrendingDown,
                                            label: t ? t('oneTimeExpense') : 'One-Time Expense',
                                            color: 'text-red-500',
                                            activeClass: isLight ? 'bg-red-50 border-red-500 text-red-700' : 'bg-red-500/20 border-red-500 text-red-300'
                                        },
                                        {
                                            type: EVENT_TYPES.INCOME_CHANGE,
                                            icon: null,
                                            label: t ? t('incomeChange') : 'Income Change',
                                            color: 'text-blue-500',
                                            activeClass: isLight ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-blue-500/20 border-blue-500 text-blue-300'
                                        },
                                        {
                                            type: EVENT_TYPES.EXPENSE_CHANGE,
                                            icon: null,
                                            label: t ? t('expenseChange') : 'Expense Change',
                                            color: 'text-orange-500',
                                            activeClass: isLight ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-orange-500/20 border-orange-500 text-orange-300'
                                        }
                                    ].map(({ type, icon: Icon, label, color, activeClass }) => (
                                        <button
                                            key={type}
                                            onClick={() => setEventType(type)}
                                            className={`p-2 rounded-xl border-2 transition-all shadow-sm ${eventType === type
                                                ? activeClass
                                                : `${isLight ? 'bg-white border-gray-200 hover:border-gray-300' : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'}`
                                                }`}
                                        >
                                            {Icon ? (
                                                <Icon className={`w-6 h-6 ${eventType === type ? 'text-current' : color} mx-auto mb-1.5`} />
                                            ) : (
                                                <div className={`w-6 h-6 ${eventType === type ? 'text-current' : color} mx-auto mb-1.5 text-lg font-bold flex items-center justify-center`}>
                                                    {currency}
                                                </div>
                                            )}
                                            <div className={`text-xs font-medium ${eventType === type ? 'text-current' : (isLight ? 'text-gray-700' : 'text-gray-200')}`}>{label}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Start Date */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className={`text-xs font-medium ${classes.headerLabel}`}>
                                        {t ? t('startDate') : 'Start Date'}
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const rAge = parseFloat(retirementAge);
                                                const cAge = parseFloat(currentAge);
                                                if (isNaN(rAge) || isNaN(cAge)) return;

                                                const yearsRemaining = rAge - cAge;
                                                const monthsRemaining = Math.floor(yearsRemaining * 12);

                                                const targetDate = new Date();
                                                targetDate.setMonth(targetDate.getMonth() + monthsRemaining);

                                                const newStartYear = targetDate.getFullYear();
                                                const newStartMonth = targetDate.getMonth() + 1;

                                                setStartYear(newStartYear);
                                                setStartMonth(newStartMonth);
                                            }}
                                            className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                                        >
                                            {language === 'he' ? 'בגיל פרישה' : 'At Retirement'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const rEndAge = parseFloat(retirementEndAge);
                                                const cAge = parseFloat(currentAge);
                                                if (isNaN(rEndAge) || isNaN(cAge)) return;

                                                const yearsRemaining = rEndAge - cAge;
                                                const monthsRemaining = Math.floor(yearsRemaining * 12);

                                                const targetDate = new Date();
                                                targetDate.setMonth(targetDate.getMonth() + monthsRemaining);

                                                const newStartYear = targetDate.getFullYear();
                                                const newStartMonth = targetDate.getMonth() + 1;

                                                setStartYear(newStartYear);
                                                setStartMonth(newStartMonth);
                                            }}
                                            className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                                        >
                                            {language === 'he' ? 'בגיל סיום' : 'At End Age'}
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <div className="flex justify-between items-baseline">
                                            <label className={`text-xs ${classes.label}`}>{t ? t('year') : 'Year'}</label>
                                            {getAgeAtYear(startYear) && (
                                                <span className="text-[10px] font-bold text-amber-500">
                                                    ({t ? t('age') : 'Age'} {getAgeAtYear(startYear)})
                                                </span>
                                            )}
                                        </div>
                                        <div className="relative mt-1">
                                            <input
                                                type="number"
                                                value={startYear}
                                                onChange={(e) => setStartYear(e.target.value)}
                                                min={currentYear}
                                                max={currentYear + 50}
                                                className={`w-full rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 no-spinner ${language === 'he' ? 'pl-6' : 'pr-6'} ${isLight ? 'bg-white border border-gray-300 text-gray-900' : 'bg-black/20 border border-white/50 text-white'}`}
                                            />

                                            <div className={`absolute top-1 bottom-0 flex flex-col justify-center gap-0 ${language === 'he' ? 'left-1' : 'right-1'}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => setStartYear(prev => Math.min(parseInt(prev || currentYear) + 1, currentYear + 50))}
                                                    className="text-gray-400 hover:text-blue-500 focus:outline-none h-3 flex items-center"
                                                >
                                                    <ChevronUp size={12} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setStartYear(prev => Math.max(parseInt(prev || currentYear) - 1, currentYear))}
                                                    className="text-gray-400 hover:text-blue-500 focus:outline-none h-3 flex items-center"
                                                >
                                                    <ChevronDown size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-baseline">
                                            <label className={`text-xs ${classes.label}`}>{t ? t('month') : 'Month'}</label>
                                        </div>
                                        <div className="mt-1">
                                            <CustomSelect
                                                value={Number(startMonth)}
                                                onChange={(val) => setStartMonth(Number(val))}
                                                options={MONTHS.map(m => ({
                                                    value: m.value,
                                                    label: language === 'he' ? m.labelHe : m.labelEn
                                                }))}
                                                className={`w-full ${language === 'he' ? 'text-right' : 'text-left'}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* End Date Checkbox (Placed under Start Date) */}
                            {isRecurring && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 py-1">
                                        <input
                                            type="checkbox"
                                            id="hasEndDate"
                                            checked={hasEndDate}
                                            onChange={(e) => {
                                                setHasEndDate(e.target.checked);
                                                if (e.target.checked && !endYear) {
                                                    setEndYear(parseInt(startYear) + 1);
                                                    setEndMonth(startMonth);
                                                }
                                            }}
                                            className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <label htmlFor="hasEndDate" className={`text-xs ${classes.headerLabel}`}>
                                            {t ? t('hasEndDate') : 'Specific End Date (uncheck for permanent)'}
                                        </label>
                                    </div>

                                    {/* End Date Header and Inputs (Visible only if checked) */}
                                    {hasEndDate && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className={`text-xs font-medium ${classes.headerLabel}`}>
                                                    {t ? t('endDate') : 'End Date (Optional)'}
                                                </label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const rAge = parseFloat(retirementAge);
                                                            const cAge = parseFloat(currentAge);
                                                            if (isNaN(rAge) || isNaN(cAge)) return;

                                                            const yearsRemaining = rAge - cAge;
                                                            const monthsRemaining = Math.floor(yearsRemaining * 12);

                                                            const targetDate = new Date();
                                                            targetDate.setMonth(targetDate.getMonth() + monthsRemaining);

                                                            // Ensure target date is not before start date
                                                            const targetYear = targetDate.getFullYear();
                                                            const targetMonth = targetDate.getMonth() + 1;
                                                            const startYearNum = parseInt(startYear);
                                                            const startMonthNum = parseInt(startMonth);

                                                            if (targetYear < startYearNum || (targetYear === startYearNum && targetMonth < startMonthNum)) {
                                                                setEndYear(startYearNum);
                                                                setEndMonth(startMonthNum);
                                                            } else {
                                                                setEndYear(targetYear);
                                                                setEndMonth(targetMonth);
                                                            }
                                                        }}
                                                        className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                                                    >
                                                        {language === 'he' ? 'בגיל פרישה' : 'At Retirement'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const rEndAge = parseFloat(retirementEndAge);
                                                            const cAge = parseFloat(currentAge);
                                                            if (isNaN(rEndAge) || isNaN(cAge)) return;

                                                            const yearsRemaining = rEndAge - cAge;
                                                            const monthsRemaining = Math.floor(yearsRemaining * 12);

                                                            const targetDate = new Date();
                                                            targetDate.setMonth(targetDate.getMonth() + monthsRemaining);

                                                            // Ensure target date is not before start date
                                                            const targetYear = targetDate.getFullYear();
                                                            const targetMonth = targetDate.getMonth() + 1;
                                                            const startYearNum = parseInt(startYear);
                                                            const startMonthNum = parseInt(startMonth);

                                                            if (targetYear < startYearNum || (targetYear === startYearNum && targetMonth < startMonthNum)) {
                                                                setEndYear(startYearNum);
                                                                setEndMonth(startMonthNum);
                                                            } else {
                                                                setEndYear(targetYear);
                                                                setEndMonth(targetMonth);
                                                            }
                                                        }}
                                                        className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                                                    >
                                                        {language === 'he' ? 'בגיל סיום' : 'At End Age'}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                                <div>
                                                    <div className="flex justify-between items-baseline">
                                                        <label className={`text-xs ${classes.label}`}>{t ? t('year') : 'Year'}</label>
                                                        {getAgeAtYear(endYear) && (
                                                            <span className="text-[10px] font-bold text-amber-500">
                                                                ({t ? t('age') : 'Age'} {getAgeAtYear(endYear)})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="relative mt-1">
                                                        <input
                                                            type="number"
                                                            value={endYear}
                                                            onChange={(e) => setEndYear(e.target.value)}
                                                            min={startYear}
                                                            max={currentYear + 50}
                                                            className={`w-full rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 no-spinner ${language === 'he' ? 'pl-6' : 'pr-6'} ${isLight ? 'bg-white border border-gray-300 text-gray-900' : 'bg-black/20 border border-white/50 text-white'}`}
                                                        />

                                                        <div className={`absolute top-1 bottom-0 flex flex-col justify-center gap-0 ${language === 'he' ? 'left-1' : 'right-1'}`}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEndYear(prev => Math.min(parseInt(prev || startYear) + 1, currentYear + 50))}
                                                                className="text-gray-400 hover:text-blue-500 focus:outline-none h-3 flex items-center"
                                                            >
                                                                <ChevronUp size={12} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEndYear(prev => Math.max(parseInt(prev || startYear) - 1, startYear))}
                                                                className="text-gray-400 hover:text-blue-500 focus:outline-none h-3 flex items-center"
                                                            >
                                                                <ChevronDown size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between items-baseline">
                                                        <label className={`text-xs ${classes.label}`}>{t ? t('month') : 'Month'}</label>
                                                    </div>
                                                    <div className="mt-1">
                                                        <CustomSelect
                                                            value={Number(endMonth)}
                                                            onChange={(val) => setEndMonth(val)}
                                                            options={MONTHS.map(m => ({
                                                                value: m.value,
                                                                label: language === 'he' ? m.labelHe : m.labelEn
                                                            }))}
                                                            className={`w-full ${language === 'he' ? 'text-right' : 'text-left'}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Amount / Monthly Change */}
                            <div className="space-y-2">
                                <label className={`text-xs font-medium ${classes.headerLabel}`}>
                                    {isOneTime
                                        ? (t ? t('amount') : 'Amount')
                                        : (t ? t('monthlyChange') : 'Monthly Change')
                                    }
                                </label>
                                <div className="relative">
                                    <div className={`absolute ${language === 'he' ? 'left-2' : 'left-2'} top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs pointer-events-none ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                        {language === 'he' ? (
                                            <>
                                                {!isOneTime && <span>{t ? t('perMonth') : '/month'}</span>}
                                                <span>{currency}</span>
                                            </>
                                        ) : (
                                            <span>{currency}</span>
                                        )}
                                    </div>

                                    <input
                                        type="number"
                                        value={isOneTime ? amount : monthlyChange}
                                        onChange={(e) => isOneTime ? setAmount(e.target.value) : setMonthlyChange(e.target.value)}
                                        placeholder={isOneTime ? '100000' : isRecurring ? '1500' : ''}
                                        className={`w-full rounded-lg py-1 px-2 text-xs transition-all text-right focus:outline-none focus:ring-2 focus:ring-blue-500 no-spinner 
                                                ${language === 'he' ? `pl-[${!isOneTime ? '85px' : '30px'}] pr-2` : `pl-6 ${!isOneTime ? 'pr-16' : 'pr-2'}`}
                                                ${isLight ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400' : 'bg-black/20 border border-white/50 text-white placeholder-gray-500'}`}
                                    />

                                    {language !== 'he' && !isOneTime && (
                                        <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                            {t ? t('perMonth') : '/month'}
                                        </span>
                                    )}
                                </div>
                                {isRecurring && (
                                    <p className={`text-xs ${classes.label}`}>
                                        {t ? t('positiveForIncrease') : 'Positive for increase (+), negative for decrease (-)'}
                                    </p>
                                )}
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                                <label className={`text-xs font-medium ${classes.headerLabel}`}>
                                    {t ? t('description') : 'Description (optional)'}
                                </label>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder={t ? t('descriptionPlaceholder') : 'e.g., Inheritance, Consulting income...'}
                                    className={`w-full rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'bg-white border border-gray-300 text-gray-900' : 'bg-black/20 border border-white/50 text-white'}`}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className={`flex-none p-4 border-t ${isLight ? 'border-gray-200' : 'border-white/10'} flex justify-between gap-2 mt-auto`}>
                        {event && onDelete && (
                            <button
                                onClick={() => {
                                    onDelete(event.id);
                                }}
                                className="px-4 py-2 rounded text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                {t ? t('delete') : 'Delete'}
                            </button>
                        )}
                        <div className="flex gap-2 ml-auto">
                            <button
                                onClick={onCancel}
                                className={`${classes.button} px-4 py-2 rounded text-sm`}
                            >
                                {t ? t('cancel') : 'Cancel'}
                            </button>
                            <button
                                onClick={handleSave}
                                className={`${classes.buttonPrimary} px-4 py-2 rounded text-sm`}
                            >
                                {event
                                    ? (t ? t('saveChanges') : 'Save Changes')
                                    : (t ? t('addEvent') : 'Add Event')
                                }
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
