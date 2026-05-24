import { ChevronDown, ChevronUp, Plus, ToggleLeft, ToggleRight, MessageSquare, Bell, Calculator } from 'lucide-react';
import { toMonthly, toProjectedMonthly, matchIncrease } from './budgetUtils';
import { BudgetItemRow } from './BudgetItemRow';
import { LoanItemRow } from './LoanItemRow';
import { MaintenanceCalcItemRow } from './MaintenanceCalcItemRow';

export function CategorySection({ category, items, isHe, isLight, currency, t, open, onToggle, onChangeItem, onDeleteItem, onToggleItemEnabled, onAddItem, onAddLoanItem, onAddMaintenanceItem, onToggleAll, projFactor, projYears, showInflation, totalMonthly, householdSize, aiProvider, aiModel, apiKeyOverride, retirementOverlay, currentAge, retirementEndAge }) {
    const label = isHe ? category.labelHe : category.labelEn;
    const enabledItems = items.filter(i => i.enabled !== false);
    const categoryTotal = enabledItems.reduce((s, i) => s + toMonthly(i), 0);
    const categoryProjected = enabledItems.reduce((s, i) => s + toProjectedMonthly(i, projFactor, projYears), 0);
    const mutedRetirementCategoryIds = new Set(retirementOverlay?.mutedCategoryIds || []);
    const isRetirementMuted = mutedRetirementCategoryIds.has(category.id);

    const retAdditions = retirementOverlay?.additions?.filter(a => a.categoryId === category.id) ?? [];
    const retIncreases = retirementOverlay?.increases?.filter(inc => inc.categoryId === category.id) ?? [];
    const mutedRetAdditions = retirementOverlay?.mutedAdditions?.filter(a => a.categoryId === category.id) ?? [];
    const mutedRetIncreases = retirementOverlay?.mutedIncreases?.filter(inc => inc.categoryId === category.id) ?? [];
    const retDelta = retirementOverlay
        ? retAdditions.reduce((s, a) => s + (a.monthlyAmount || 0), 0) +
          retIncreases.reduce((s, inc) => s + (inc.increaseAmount || 0), 0)
        : 0;
    const mutedRetDelta = retirementOverlay
        ? mutedRetAdditions.reduce((s, a) => s + (a.monthlyAmount || 0), 0) +
          mutedRetIncreases.reduce((s, inc) => s + (inc.increaseAmount || 0), 0)
        : 0;
    const disabledCount = items.length - enabledItems.length;
    const allDisabled = items.length > 0 && enabledItems.length === 0;
    const notesCount = items.filter(i => i.note?.trim()).length;
    const remindersCount = items.filter(i => i.enabled !== false && i.reminder?.date).length;

    return (
        <div className={`rounded-xl border transition-opacity ${allDisabled ? 'opacity-50' : ''} ${isLight ? 'border-slate-200 bg-white' : 'border-white/20 bg-white/10'}`}>
            <div
                className={`sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium backdrop-blur-md ${isLight ? 'bg-white' : 'bg-white/10'}`}
                dir={isHe ? 'rtl' : 'ltr'}
            >
                <button tabIndex={-1} onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-start select-none outline-none focus:outline-none">
                    <span className="text-base shrink-0">{category.icon}</span>
                    <span className="flex-1 min-w-0 truncate">
                        {label} <span className="font-normal opacity-60">({items.length})</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        {notesCount > 0 && (
                            <span className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-400'}`} title={isHe ? 'הערות' : 'Notes'}>
                                <MessageSquare size={10} />
                                {notesCount}
                            </span>
                        )}
                        {remindersCount > 0 && (
                            <span className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'}`} title={isHe ? 'תזכורות' : 'Reminders'}>
                                <Bell size={10} />
                                {remindersCount}
                            </span>
                        )}
                    </div>
                </button>
                {disabledCount > 0 && (
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isLight ? 'bg-amber-100 text-amber-600' : 'bg-amber-500/20 text-amber-400'}`}>
                        {isHe ? `${disabledCount} מושהה` : `${disabledCount} paused`}
                    </span>
                )}
                {categoryTotal > 0 && (
                    <span className="flex items-baseline gap-1 shrink-0" dir="ltr">
                        <span className={`text-sm font-semibold ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                            {currency}{Math.round(categoryTotal).toLocaleString()}
                        </span>
                        {totalMonthly > 0 && (
                            <span className={`text-xs font-medium ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                ({Math.round(categoryTotal / totalMonthly * 100)}%)
                            </span>
                        )}
                        {showInflation && (
                            <span className={`text-xs font-normal ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                → {currency}{Math.round(categoryProjected).toLocaleString()}
                            </span>
                        )}
                        {retDelta > 0 && (
                            <span className={`text-xs font-semibold px-1 py-0.5 rounded ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-300'}`}>
                                +{currency}{Math.round(retDelta).toLocaleString()}
                            </span>
                        )}
                        {mutedRetDelta > 0 && (
                            <span className={`text-xs font-semibold px-1 py-0.5 rounded border ${isLight ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-white/5 text-gray-500 border-white/10'}`} title={isHe ? 'נשאר בפער לחלוקה ידנית' : 'Kept in the gap for manual allocation'}>
                                +{currency}{Math.round(mutedRetDelta).toLocaleString()}
                            </span>
                        )}
                    </span>
                )}
                <button
                    onClick={e => { e.stopPropagation(); onToggleAll(); }}
                    title={allDisabled ? (isHe ? 'הפעל הכל' : 'Enable all') : (isHe ? 'השהה הכל' : 'Pause all')}
                    className="shrink-0 p-0.5"
                >
                    {allDisabled
                        ? <ToggleLeft size={18} className={isLight ? 'text-slate-400' : 'text-gray-400'} />
                        : <ToggleRight size={18} className="text-blue-500" />}
                </button>
                <button onClick={onToggle} className="shrink-0 opacity-50">
                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
            </div>

            {open && (
                <div className="px-2 pb-2 space-y-0.5">
                    {items.map(item => {
                        const inc = retIncreases.find(r => matchIncrease(item.label, r.itemLabel));
                        const mutedInc = mutedRetIncreases.find(r => matchIncrease(item.label, r.itemLabel));
                        const retBadge = inc && item.enabled !== false ? (
                            <span className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isLight ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`} dir="ltr">
                                🔮 +{currency}{(inc.increaseAmount || 0).toLocaleString()}
                                {inc.increasePercent ? ` (+${inc.increasePercent}%)` : ''}
                            </span>
                        ) : mutedInc && item.enabled !== false ? (
                            <span className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${isLight ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-white/5 text-gray-500 border-white/10'}`} title={isHe ? 'נשאר בפער לחלוקה ידנית' : 'Kept in the gap for manual allocation'} dir="ltr">
                                ðŸ”® +{currency}{(mutedInc.increaseAmount || 0).toLocaleString()}
                                {mutedInc.increasePercent ? ` (+${mutedInc.increasePercent}%)` : ''}
                            </span>
                        ) : null;
                        if (item.type === 'loan') return (
                            <LoanItemRow
                                key={item.id}
                                item={item}
                                isHe={isHe}
                                isLight={isLight}
                                currency={currency}
                                t={t}
                                onChange={onChangeItem}
                                onDelete={() => onDeleteItem(item.id)}
                                onToggleEnabled={onToggleItemEnabled}
                                projFactor={projFactor}
                                projYears={projYears}
                                showInflation={showInflation}
                            />
                        );
                        if (item.type === 'maintenance-calc') return (
                            <MaintenanceCalcItemRow
                                key={item.id}
                                item={item}
                                isHe={isHe}
                                isLight={isLight}
                                currency={currency}
                                t={t}
                                onChange={onChangeItem}
                                onDelete={() => onDeleteItem(item.id)}
                                onToggleEnabled={onToggleItemEnabled}
                                projFactor={projFactor}
                                showInflation={showInflation}
                                householdSize={householdSize}
                                aiProvider={aiProvider}
                                aiModel={aiModel}
                                apiKeyOverride={apiKeyOverride}
                            />
                        );
                        return (
                            <BudgetItemRow
                                key={item.id}
                                item={item}
                                isHe={isHe}
                                isLight={isLight}
                                currency={currency}
                                t={t}
                                onChange={onChangeItem}
                                onDelete={() => onDeleteItem(item.id)}
                                onToggleEnabled={onToggleItemEnabled}
                                projFactor={projFactor}
                                showInflation={showInflation}
                                labelAdornment={retBadge}
                                currentAge={currentAge}
                                retirementEndAge={retirementEndAge}
                            />
                        );
                    })}
                    {[...retAdditions, ...mutedRetAdditions].map(a => (
                        <div key={`ret-add-${a.label}`} className={`flex items-center justify-between px-3 py-2 rounded-lg border-2 border-dashed text-sm ${isRetirementMuted ? (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-white/10 bg-white/5 text-gray-500') : (isLight ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-amber-500/50 bg-amber-500/10 text-amber-300')}`} dir={isHe ? 'rtl' : 'ltr'}>
                            <span className="flex items-center gap-2 min-w-0">
                                <span className="opacity-60 shrink-0">🔮</span>
                                <span className="font-medium truncate">{a.label}</span>
                                {a.note && <span className="text-[10px] opacity-60 truncate hidden sm:inline">{a.note}</span>}
                            </span>
                            <span className="font-bold shrink-0 ms-2" dir="ltr">+{currency}{(a.monthlyAmount || 0).toLocaleString()}</span>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 mt-1 flex-wrap" dir={isHe ? 'rtl' : 'ltr'}>
                        <button
                            onClick={onAddItem}
                            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg transition-colors ${isLight ? 'text-blue-600 hover:bg-blue-50' : 'text-blue-400 hover:bg-blue-900/20'}`}
                        >
                            <Plus size={12} />
                            {t('budgetAddItem')}
                        </button>
                        <button
                            onClick={onAddLoanItem}
                            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg transition-colors ${isLight ? 'text-indigo-600 hover:bg-indigo-50' : 'text-indigo-400 hover:bg-indigo-900/20'}`}
                        >
                            <Plus size={12} />
                            {t('budgetAddLoan')}
                        </button>
                        {category.id === 'housing' && onAddMaintenanceItem && (
                            <button
                                onClick={onAddMaintenanceItem}
                                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg transition-colors ${isLight ? 'text-teal-600 hover:bg-teal-50' : 'text-teal-400 hover:bg-teal-900/20'}`}
                            >
                                <Plus size={12} />
                                <Calculator size={11} />
                                {isHe ? 'תחזוקת דירה' : 'Maintenance'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
