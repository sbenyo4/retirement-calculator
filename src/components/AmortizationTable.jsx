import React, { useState } from 'react';

export function AmortizationTable({ history, t, language }) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!history || history.length === 0) return null;

    const formatCurrency = (value) => {
        const num = parseFloat(value);
        if (isNaN(num)) return '-';
        const formatted = Math.abs(num).toLocaleString(language === 'he' ? 'he-IL' : 'en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        const currency = language === 'he' ? '₪' : '$';
        return `${currency} ${formatted}`;
    };

    // Calculate yearly data with interest earned
    const yearlyData = history.map((point, idx) => {
        const prevBalance = idx > 0 ? history[idx - 1].balance : 0;
        const contribution = point.contribution || 0;
        const withdrawal = point.withdrawal || 0;
        // Interest = current balance - previous balance - contributions + withdrawals
        const interest = idx > 0
            ? point.balance - prevBalance - contribution + withdrawal
            : 0;

        return {
            age: point.age,
            year: new Date().getFullYear() + idx,
            balance: point.balance,
            contribution: contribution,
            withdrawal: withdrawal,
            interest: interest,
            phase: point.phase
        };
    });

    return (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            {/* Toggle Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
                <span className="text-sm font-medium text-gray-300">
                    {t('showYearlyProgress') || 'Year-by-Year Progress'}
                </span>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </button>

            {/* Table Content */}
            {isExpanded && (
                <div className="max-h-80 overflow-y-auto border-t border-white/10">
                    <table className="w-full text-sm">
                        <thead className="bg-white/5 sticky top-0">
                            <tr>
                                <th className="p-2 text-left text-xs font-medium text-gray-400">{t('age') || 'Age'}</th>
                                <th className="p-2 text-left text-xs font-medium text-gray-400">{t('year') || 'Year'}</th>
                                <th className="p-2 text-right text-xs font-medium text-gray-400">{t('balance') || 'Balance'}</th>
                                <th className="p-2 text-right text-xs font-medium text-gray-400">{t('contributionHeader') || 'Contrib.'}</th>
                                <th className="p-2 text-right text-xs font-medium text-gray-400">{t('withdrawalHeader') || 'Withdr.'}</th>
                                <th className="p-2 text-right text-xs font-medium text-gray-400">{t('interestEarned') || 'Interest'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {yearlyData.map((row, idx) => (
                                <tr
                                    key={idx}
                                    className={`hover:bg-white/5 ${row.phase === 'withdrawal' ? 'bg-orange-500/5' : ''}`}
                                >
                                    <td className="p-2 text-gray-300">{row.age.toFixed(0)}</td>
                                    <td className="p-2 text-gray-400">{row.year}</td>
                                    <td className={`p-2 text-right font-medium ${row.balance < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                        {formatCurrency(row.balance)}
                                    </td>
                                    <td className="p-2 text-right text-blue-400">
                                        {row.contribution > 0 ? formatCurrency(row.contribution) : '-'}
                                    </td>
                                    <td className="p-2 text-right text-orange-400">
                                        {row.withdrawal > 0 ? formatCurrency(row.withdrawal) : '-'}
                                    </td>
                                    <td className={`p-2 text-right ${row.interest >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {formatCurrency(row.interest)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
