import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, TrendingUp, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useDraggable } from '../hooks/useDraggable';
import { calculateRetirementProjection } from '../utils/calculator';
import { formatCurrency as fmt } from '../utils/formatters';

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

    const retirementYear = (() => {
        const retAge = parseFloat(inputs.retirementStartAge) || 67;
        if (inputs.birthdate) {
            return new Date(inputs.birthdate).getFullYear() + Math.floor(retAge);
        }
        const yearsLeft = retAge - (parseFloat(inputs.currentAge) || 30);
        return new Date().getFullYear() + Math.max(0, Math.round(yearsLeft));
    })();

    const allEntriesValid = entries.every(e => {
        const yr = parseInt(e.startYear);
        const endYr = e.endYear ? parseInt(e.endYear) : null;
        return yr >= 2000 && yr <= 2100
            && (endYr === null || (endYr >= yr && endYr <= 2100))
            && parseFloat(e.monthlyAmount) > 0;
    });
    const hasChanges = JSON.stringify(entries.map(e => ({
        id: e.id, startYear: String(e.startYear), endYear: e.endYear ?? null,
        monthlyAmount: String(e.monthlyAmount), enabled: e.enabled !== false
    }))) !== JSON.stringify(initialEntriesRef.current.map(e => ({
        id: e.id, startYear: String(e.startYear), endYear: e.endYear ?? null,
        monthlyAmount: String(e.monthlyAmount), enabled: e.enabled !== false
    })));
    const canSave = allEntriesValid && hasChanges;

    // Stable fingerprint of inputs excluding additionalYearlyIncome — changes to that field
    // come from our own real-time sync and don't affect the baseline calculation.
    const inputsFingerprint = useMemo(() => {
        const { additionalYearlyIncome: _, ...rest } = inputs;
        return JSON.stringify(rest);
    }, [inputs]); // eslint-disable-line react-hooks/exhaustive-deps

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
    }, [entries, inputsFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

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
                className={`w-full max-w-md rounded-2xl shadow-2xl ${isLight ? 'bg-white' : 'bg-gray-900 border border-white/10'}`}
                style={dragStyle}
                dir={isRTL ? 'rtl' : 'ltr'}
                onMouseDown={bringToFront}
            >
                {/* Header — drag handle */}
                <div
                    className={`flex items-center justify-between p-4 border-b cursor-grab active:cursor-grabbing select-none ${isLight ? 'border-gray-200' : 'border-white/10'}`}
                    onMouseDown={onDragMouseDown}
                >
                    <div className="flex items-center gap-2">
                        <TrendingUp size={16} className="text-green-400" />
                        <span className={`font-semibold text-sm ${isLight ? 'text-gray-900' : 'text-white'}`}>
                            {t('additionalIncome')}
                        </span>
                    </div>
                    <button onClick={onClose} className={`p-1 rounded-lg transition-colors ${isLight ? 'hover:bg-gray-100 text-gray-500' : 'hover:bg-white/10 text-gray-400'}`}>
                        <X size={16} />
                    </button>
                </div>

                {/* Description */}
                <div className={`px-4 pt-3 pb-1 text-xs ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                    {t('additionalIncomeDesc')}
                </div>

                {/* Templates */}
                <div className="px-4 pb-2">
                    <div className={`flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                        <Zap size={10} />
                        {isRTL ? 'תבניות מהירות' : 'Quick templates'}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {TEMPLATES.map(tpl => (
                            <button
                                key={tpl.labelEn}
                                onClick={() => addFromTemplate(tpl)}
                                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors ${isLight ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-green-900/10 border-green-500/25 text-green-400 hover:bg-green-900/20'}`}
                            >
                                <span>{tpl.emoji}</span>
                                <span>{isRTL ? tpl.labelHe : tpl.labelEn}</span>
                                <span className={`${isLight ? 'text-green-500' : 'text-green-500'} font-medium`} dir="ltr">
                                    +{currency}{tpl.amount.toLocaleString()}
                                    {tpl.durationYears ? `·${tpl.durationYears}y` : ''}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Entries */}
                <div className="p-4 flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar">
                    {entries.length === 0 && (
                        <div className={`text-xs text-center py-4 ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                            {t('noAdditionalIncome')}
                        </div>
                    )}

                    {entries.map((entry) => (
                        <div key={entry.id} className={`flex flex-col gap-1.5 p-2 rounded-xl transition-opacity ${entry.enabled === false ? 'opacity-40' : ''} ${isLight ? 'bg-gray-50 border border-gray-200' : 'bg-white/5 border border-white/10'}`}>
                            {/* Fields row — unchanged widths */}
                            <div className="flex items-end gap-2">
                                {/* From year */}
                                <div className="flex flex-col gap-0.5 w-20">
                                    <span className={`h-7 flex items-start text-[10px] leading-tight ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>{t('incomeEntryFrom')}</span>
                                    <input
                                        type="number"
                                        className={inputCls}
                                        value={entry.startYear}
                                        min={2000}
                                        max={2100}
                                        onChange={e => updateEntry(entry.id, 'startYear', e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                const cur = parseInt(entry.startYear) || retirementYear;
                                                updateEntry(entry.id, 'startYear', e.key === 'ArrowUp' ? cur + 1 : Math.max(2000, cur - 1));
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
                                        className={inputCls}
                                        placeholder={String(entry.startYear || '')}
                                        value={entry.endYear ?? ''}
                                        onChange={e => updateEntry(entry.id, 'endYear', e.target.value === '' ? null : e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                const cur = parseInt(entry.endYear) || parseInt(entry.startYear) || retirementYear;
                                                updateEntry(entry.id, 'endYear', e.key === 'ArrowUp' ? cur + 1 : Math.max(2000, cur - 1));
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
                                    className="p-0.5 transition-colors"
                                >
                                    {entry.enabled === false
                                        ? <ToggleLeft className="w-4 h-4 text-gray-400" />
                                        : <ToggleRight className="w-4 h-4 text-green-500" />}
                                </button>
                                <button
                                    onClick={() => removeEntry(entry.id)}
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
                                            <span className={`font-medium text-xs ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
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
                <div className={`flex items-center justify-between p-4 border-t gap-2 ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
                    <button
                        onClick={addEntry}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                            isLight ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100' : 'bg-green-900/20 text-green-400 border border-green-500/30 hover:bg-green-900/30'
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
