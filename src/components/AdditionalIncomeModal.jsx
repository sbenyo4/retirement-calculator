import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, TrendingUp, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useDraggable } from '../hooks/useDraggable';
import { calculateRetirementProjection } from '../utils/calculator';
import { formatCurrency as fmt } from '../utils/formatters';
import { getProjectedYear } from '../utils/dateUtils';

export function AdditionalIncomeModal({ isOpen, onClose, inputs, setInputs, t, language, currency }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isRTL = language === 'he';
    useBodyScrollLock(isOpen);
    const { dragStyle, overlayStyle, onDragMouseDown, bringToFront } = useDraggable(isOpen);

    const [entries, setEntries] = useState([]);
    const syncedRef = useRef(false);
    const initialEntriesRef = useRef([]);

    // Initialize entries from inputs when modal opens (one-time)
    useEffect(() => {
        if (isOpen) {
            syncedRef.current = false;
            const initial = (inputs.additionalYearlyIncome || []).map(e => ({ ...e }));
            initialEntriesRef.current = initial;
            setEntries(initial);
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync entries → inputs in real-time after first render
    useEffect(() => {
        if (!isOpen) return;
        if (!syncedRef.current) { syncedRef.current = true; return; }
        setInputs(prev => ({
            ...prev,
            additionalYearlyIncome: entries
                .filter(e => e.startYear && parseFloat(e.monthlyAmount) > 0)
                .map(e => ({
                    id: e.id,
                    startYear: parseInt(e.startYear),
                    endYear: e.endYear ? parseInt(e.endYear) : null,
                    monthlyAmount: parseFloat(e.monthlyAmount),
                    enabled: e.enabled !== false
                }))
        }));
    }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

    const retirementYear = useMemo(() => {
        const retAge = parseFloat(inputs.retirementStartAge) || 67;
        return getProjectedYear(retAge, inputs.currentAge || 30, inputs.birthdate, inputs.manualAge);
    }, [inputs.retirementStartAge, inputs.birthdate, inputs.currentAge, inputs.manualAge]);

    const retirementEndYear = useMemo(() => {
        const endAge = parseFloat(inputs.retirementEndAge) || 90;
        return getProjectedYear(endAge, inputs.currentAge || 30, inputs.birthdate, inputs.manualAge);
    }, [inputs.retirementEndAge, inputs.birthdate, inputs.currentAge, inputs.manualAge]);

    const allEntriesValid = useMemo(() => entries.every(e => {
        const yr = parseInt(e.startYear);
        const endYr = e.endYear ? parseInt(e.endYear) : null;
        return yr >= retirementYear && yr <= retirementEndYear
            && (endYr === null || (endYr >= yr && endYr <= retirementEndYear))
            && parseFloat(e.monthlyAmount) > 0;
    }), [entries, retirementYear, retirementEndYear]);

    const hasChanges = useMemo(() => {
        const normalize = list => list.map(e => ({
            id: e.id, startYear: String(e.startYear), endYear: e.endYear ?? null,
            monthlyAmount: String(e.monthlyAmount), enabled: e.enabled !== false,
        }));
        return JSON.stringify(normalize(entries)) !== JSON.stringify(normalize(initialEntriesRef.current));
    }, [entries]);

    const canSave = allEntriesValid && hasChanges;

    // Stable fingerprint of inputs excluding additionalYearlyIncome — changes to that field
    // come from our own real-time sync and don't affect the baseline calculation.
    const inputsFingerprint = useMemo(() => {
        const { additionalYearlyIncome: _, ...rest } = inputs;
        return JSON.stringify(rest);
    }, [inputs]);

    // Compute isolated impact per entry: run with only that entry vs. baseline (no entries)
    const balanceImpacts = useMemo(() => {
        if (!isOpen || entries.length === 0) return {};
        try {
            const base = calculateRetirementProjection({ ...inputs, additionalYearlyIncome: [] });
            const baseBalance = base.balanceAtEnd ?? 0;
            const impacts = {};
            entries.forEach(entry => {
                if (!entry.startYear || !(parseFloat(entry.monthlyAmount) > 0)) return;
                try {
                    const res = calculateRetirementProjection({
                        ...inputs,
                        additionalYearlyIncome: [{
                            ...entry,
                            enabled: true,
                            startYear: parseInt(entry.startYear),
                            endYear: entry.endYear ? parseInt(entry.endYear) : null,
                            monthlyAmount: parseFloat(entry.monthlyAmount)
                        }]
                    });
                    impacts[entry.id] = (res.balanceAtEnd ?? 0) - baseBalance;
                } catch { impacts[entry.id] = null; }
            });
            return impacts;
        } catch { return {}; }
    }, [entries, inputsFingerprint]);

    if (!isOpen) return null;

    const TEMPLATES = [
        {
            labelHe: 'ייעוץ חלקי',  labelEn: 'Part-time consulting',
            emoji: '💼', amount: 5000, durationYears: 5,
        },
        {
            labelHe: 'שכירות נכס',  labelEn: 'Rental income',
            emoji: '🏠', amount: 4000, durationYears: null,
        },
        {
            labelHe: 'עבודה חלקית', labelEn: 'Part-time work',
            emoji: '⏱️', amount: 6000, durationYears: 3,
        },
        {
            labelHe: 'פרויקט עצמאי', labelEn: 'Freelance project',
            emoji: '🚀', amount: 10000, durationYears: 1,
        },
    ];

    const addFromTemplate = (tpl) => {
        setEntries(prev => [...prev, {
            id: String(Date.now()),
            startYear: retirementYear,
            endYear: tpl.durationYears ? retirementYear + tpl.durationYears : '',
            monthlyAmount: tpl.amount,
            enabled: true,
        }]);
    };

    const addEntry = () => {
        setEntries(prev => [...prev, {
            id: String(Date.now()),
            startYear: retirementYear,
            endYear: '',
            monthlyAmount: '',
            enabled: true
        }]);
    };

    const removeEntry = (id) => setEntries(prev => prev.filter(e => e.id !== id));

    const updateEntry = (id, field, value) =>
        setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));

    const handleSave = () => {
        setInputs(prev => ({
            ...prev,
            additionalYearlyIncome: entries
                .filter(e => e.startYear && parseFloat(e.monthlyAmount) > 0)
                .map(e => ({
                    id: e.id,
                    startYear: parseInt(e.startYear),
                    endYear: e.endYear ? parseInt(e.endYear) : null,
                    monthlyAmount: parseFloat(e.monthlyAmount),
                    enabled: e.enabled !== false
                }))
        }));
        onClose();
    };

    const inputCls = `w-full rounded-lg py-1.5 px-2 text-xs ${
        isLight
            ? 'bg-white border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
            : 'bg-black/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
    }`;

    return createPortal(
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" style={overlayStyle}>
            <div
                data-draggable-modal
                className={`relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${
                    isLight ? 'bg-white ring-1 ring-gray-300' : 'ring-1 ring-white/30'
                }`}
                style={dragStyle}
                dir={isRTL ? 'rtl' : 'ltr'}
                onMouseDown={bringToFront}
            >
                {!isLight && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                        <div className="absolute inset-0 bg-white/10" />
                    </>
                )}
                {/* Header — drag handle */}
                <div
                    className={`relative z-10 flex items-center justify-between p-4 border-b cursor-grab active:cursor-grabbing select-none ${
                        isLight ? 'border-gray-200' : 'border-white/10'
                    }`}
                    onMouseDown={onDragMouseDown}
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isLight ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            <TrendingUp size={20} />
                        </div>
                        <h2 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {t('additionalIncome')}
                        </h2>
                    </div>
                    <button onClick={onClose} className={`p-1 rounded-lg transition-colors ${isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}>
                        <X size={20} />
                    </button>
                </div>

                {/* Description */}
                <div className={`relative z-10 px-4 pt-3 pb-1 text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    {t('additionalIncomeDesc')}
                </div>

                {/* Templates */}
                <div className="relative z-10 px-4 pb-2">
                    <div className={`flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'text-slate-400' : 'text-gray-400'}`}>
                        <Zap size={10} />
                        {isRTL ? 'תבניות מהירות' : 'Quick templates'}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {TEMPLATES.map(tpl => (
                            <button
                                key={tpl.labelEn}
                                onClick={() => addFromTemplate(tpl)}
                                dir="ltr"
                                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                                    isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/20'
                                }`}
                            >
                                {isRTL ? (
                                    <>
                                        <span className={`${isLight ? 'text-emerald-600' : 'text-emerald-300'} font-medium inline-flex items-center gap-0.5`}>
                                            <span>{`+${currency}${tpl.amount.toLocaleString()}`}</span>
                                            {tpl.durationYears && (
                                                <>
                                                    <span>·</span>
                                                    <span className="inline-flex flex-row items-center" dir="ltr">
                                                        <span>ש׳</span>
                                                        <span>{tpl.durationYears}</span>
                                                    </span>
                                                </>
                                            )}
                                        </span>
                                        <span>{tpl.labelHe}</span>
                                        <span>{tpl.emoji}</span>
                                    </>
                                ) : (
                                    <>
                                        <span>{tpl.emoji}</span>
                                        <span>{tpl.labelEn}</span>
                                        <span className={`${isLight ? 'text-emerald-600' : 'text-emerald-300'} font-medium`}>{`+${currency}${tpl.amount.toLocaleString()}${tpl.durationYears ? `·${tpl.durationYears}y` : ''}`}</span>
                                    </>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Entries */}
                <div className="relative z-10 p-4 flex flex-col gap-2 overflow-y-auto custom-scrollbar">
                    {entries.length === 0 && (
                        <div className={`text-xs text-center py-4 ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                            {t('noAdditionalIncome')}
                        </div>
                    )}

                    {entries.map((entry) => (
                        <div key={entry.id} className={`flex flex-col gap-1.5 p-2 rounded-xl transition-opacity ${entry.enabled === false ? 'opacity-40' : ''} ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/5 border border-white/10'}`}>
                            {/* Fields row — unchanged widths */}
                            <div className="flex items-end gap-2">
                                {/* From year */}
                                <div className="flex flex-col gap-0.5 w-20">
                                    <span className={`h-7 flex items-start text-[10px] leading-tight ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>{t('incomeEntryFrom')}</span>
                                    <input
                                        type="number"
                                        dir="ltr"
                                        className={inputCls}
                                        value={entry.startYear}
                                        min={retirementYear}
                                        max={retirementEndYear}
                                        onChange={e => updateEntry(entry.id, 'startYear', e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                const cur = parseInt(entry.startYear) || retirementYear;
                                                updateEntry(entry.id, 'startYear', e.key === 'ArrowUp' ? Math.min(retirementEndYear, cur + 1) : Math.max(retirementYear, cur - 1));
                                            }
                                        }}
                                    />
                                </div>

                                <span className={`pb-1.5 text-xs ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>–</span>

                                {/* To year */}
                                <div className="flex flex-col gap-0.5 w-20">
                                    <span className={`h-7 flex items-start text-[10px] leading-tight ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>{t('incomeEntryTo')}</span>
                                    <input
                                        type="number"
                                        dir="ltr"
                                        className={inputCls}
                                        placeholder={String(entry.startYear || '')}
                                        value={entry.endYear ?? ''}
                                        min={entry.startYear || new Date().getFullYear()}
                                        max={retirementEndYear}
                                        onChange={e => updateEntry(entry.id, 'endYear', e.target.value === '' ? null : e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                const cur = parseInt(entry.endYear) || parseInt(entry.startYear) || retirementYear;
                                                const minY = parseInt(entry.startYear) || new Date().getFullYear();
                                                updateEntry(entry.id, 'endYear', e.key === 'ArrowUp' ? Math.min(retirementEndYear, cur + 1) : Math.max(minY, cur - 1));
                                            }
                                        }}
                                    />
                                </div>

                                {/* Monthly amount */}
                                <div className="flex flex-col gap-0.5 flex-1">
                                    <span className={`h-7 flex items-start text-[10px] leading-tight ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>{t('incomeEntryAmount')}</span>
                                    <div className="relative">
                                        <span className={`absolute ${isRTL ? 'right-2' : 'left-2'} top-1/2 -translate-y-1/2 text-xs ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {currency}
                                        </span>
                                        <input
                                            type="number"
                                            dir="ltr"
                                            className={`${inputCls} ${isRTL ? 'pr-6' : 'pl-6'}`}
                                            value={entry.monthlyAmount}
                                            min={0}
                                            onChange={e => updateEntry(entry.id, 'monthlyAmount', e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Toggle */}
                                <button
                                    onClick={() => updateEntry(entry.id, 'enabled', entry.enabled === false)}
                                    title={entry.enabled === false ? (isRTL ? 'הפעל' : 'Enable') : (isRTL ? 'השבת' : 'Disable')}
                                    className="p-0.5 transition-colors"
                                >
                                    {entry.enabled === false
                                        ? <ToggleLeft className="w-4 h-4 text-gray-400" />
                                        : <ToggleRight className="w-4 h-4 text-green-500" />}
                                </button>
                                <button
                                    onClick={() => removeEntry(entry.id)}
                                    title={isRTL ? 'הסר' : 'Remove'}
                                    className={`p-1 rounded transition-colors ${isLight ? 'text-red-400 hover:text-red-600 hover:bg-red-50' : 'text-red-400 hover:text-red-300 hover:bg-red-900/20'}`}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>

                            {/* Impact row */}
                            {balanceImpacts[entry.id] != null && (
                                <div className={`flex items-center justify-between px-1 text-[10px] ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                                    <span>{language === 'he' ? 'השפעה על יתרה סופית:' : 'Impact on final balance:'}</span>
                                    {(() => {
                                        const impact = balanceImpacts[entry.id];
                                        const positive = impact >= 0;
                                        return (
                                            <span dir="ltr" className={`font-medium text-xs tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {positive ? '+' : ''}{fmt(impact, language)}
                                            </span>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className={`relative z-10 flex items-center justify-between p-4 border-t gap-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'}`}>
                    <button
                        onClick={addEntry}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                            isLight ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20'
                        }`}
                    >
                        <Plus size={13} />
                        {t('addIncomeEntry')}
                    </button>

                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-white/10'}`}
                        >
                            {t('cancel')}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!canSave}
                            className={`text-xs px-4 py-1.5 rounded-lg transition-colors font-medium ${canSave ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-600/30 text-white/40 cursor-not-allowed'}`}
                        >
                            {t('save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
