import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { MaintenanceCalcPanel } from '../MaintenanceCalcPanel';
import { BudgetItemRow } from './BudgetItemRow';

export function MaintenanceCalcItemRow({ item, isHe, isLight, currency, t, onChange, onDelete, onToggleEnabled, projFactor, showInflation, householdSize, aiProvider, aiModel, apiKeyOverride }) {
    const [showCalc, setShowCalc] = useState(false);

    const calcButton = (
        <button
            onMouseDown={e => { e.preventDefault(); setShowCalc(v => !v); }}
            className={`shrink-0 p-0.5 rounded transition-colors ${
                showCalc
                    ? (isLight ? 'text-teal-600 bg-teal-100' : 'text-teal-400 bg-teal-500/20')
                    : item.calcInputs?.sqm
                        ? (isLight ? 'text-teal-500 hover:text-teal-600' : 'text-teal-400 hover:text-teal-300')
                        : (isLight ? 'text-slate-300 hover:text-teal-500' : 'text-gray-600 hover:text-teal-400')
            }`}
            title={isHe ? 'מחשבון תחזוקה' : 'Maintenance calculator'}
        >
            <Calculator size={13} />
        </button>
    );

    return (
        <div>
            <BudgetItemRow
                item={item}
                isHe={isHe}
                isLight={isLight}
                currency={currency}
                t={t}
                onChange={onChange}
                onDelete={onDelete}
                onToggleEnabled={onToggleEnabled}
                projFactor={projFactor}
                showInflation={showInflation}
                labelAdornment={calcButton}
            />
            {showCalc && (
                <MaintenanceCalcPanel
                    item={item}
                    isHe={isHe}
                    isLight={isLight}
                    currency={currency}
                    householdSize={householdSize}
                    aiProvider={aiProvider}
                    aiModel={aiModel}
                    apiKeyOverride={apiKeyOverride}
                    onApply={({ amount, calcInputs }) => {
                        onChange({ ...item, amount, frequency: 'annual', calcInputs });
                        setShowCalc(false);
                    }}
                />
            )}
        </div>
    );
}
