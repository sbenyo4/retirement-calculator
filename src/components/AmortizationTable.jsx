import React from 'react';
import { X, Table } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

// Button to open the amortization table modal
export function AmortizationTableButton({ onClick, t }) {
    return (
        <button
            onClick={onClick}
            className="px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 shadow-lg"
            title={t('showYearlyProgress') || 'Year-by-Year Progress'}
        >
            <Table size={14} />
        </button>
    );
}

// Modal component for the amortization table
export function AmortizationTableModal({ isOpen, onClose, history, t, language }) {
    const themeContext = useTheme();
    // Fallback: check document class if context theme is undefined
    const theme = themeContext?.theme || (document.documentElement.classList.contains('light') ? 'light' : 'dark');
    const isLight = theme === 'light';

    if (!isOpen || !history || history.length === 0) return null;

    const formatCurrency = (value) => {
        const num = parseFloat(value);
        if (isNaN(num)) return '-';
        const formatted = Math.abs(num).toLocaleString(language === 'he' ? 'he-IL' : 'en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        const currency = language === 'he' ? '₪' : '$';
        return `${formatted}\u00A0${currency}`;
    };

    // Calculate yearly data with interest earned
    const yearlyData = history.map((point, idx) => {
        const prevBalance = idx > 0 ? history[idx - 1].balance : 0;
        const contribution = point.contribution || 0;
        const withdrawal = point.withdrawal || 0;
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

    // Theme-aware styling
    const modalBg = theme === 'light' ? 'bg-white' : 'bg-gray-900';
    const borderColor = theme === 'light' ? 'border-gray-300' : 'border-gray-700';
    const headerBorder = theme === 'light' ? 'border-gray-200' : 'border-gray-700';
    const textColor = theme === 'light' ? 'text-gray-800' : 'text-gray-100';
    const subTextColor = theme === 'light' ? 'text-gray-600' : 'text-gray-400';
    const tableBg = theme === 'light' ? 'bg-white' : 'bg-gray-800';
    const tableHeaderBg = theme === 'light' ? 'bg-gray-50' : 'bg-gray-700';

    // Dynamic color classes based on theme
    const balanceColor = (isNegative) => {
        if (theme === 'light') {
            return isNegative ? 'text-red-600' : 'text-green-600';
        }
        return isNegative ? 'text-red-400' : 'text-green-400';
    };
    const contributionColor = theme === 'light' ? 'text-blue-600' : 'text-blue-400';
    const withdrawalColor = theme === 'light' ? 'text-orange-600' : 'text-orange-400';
    const interestColor = (isNegative) => {
        if (theme === 'light') {
            return isNegative ? 'text-red-600' : 'text-emerald-600';
        }
        return isNegative ? 'text-red-400' : 'text-emerald-400';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 backdrop-blur-md bg-black/50"
                onClick={onClose}
            />

            {/* Modal */}
            <div className={`relative ${modalBg} border ${borderColor} rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden`}>
                {/* Header */}
                <div className={`flex items-center justify-between p-4 border-b ${headerBorder}`}>
                    <h2 className={`text-lg font-bold ${textColor}`}>
                        📊 {t('showYearlyProgress') || 'Year-by-Year Progress'}
                    </h2>
                    <button
                        onClick={onClose}
                        className={`p-1 rounded-lg hover:bg-gray-500/20 transition-colors ${subTextColor}`}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Table Content - Direction inverted on container to control scrollbar side as requested */}
                {/* Hebrew: container LTR (scroll right), table RTL. English: container RTL (scroll left), table LTR */}
                <div
                    className="max-h-[70vh] overflow-y-auto custom-scrollbar p-4"
                    dir={language === 'he' ? 'ltr' : 'rtl'}
                >
                    <table
                        className={`w-full text-sm ${tableBg} rounded-lg overflow-hidden`}
                        dir={language === 'he' ? 'rtl' : 'ltr'}
                    >
                        <thead className={tableHeaderBg}>
                            <tr>
                                <th className={`p-3 text-center text-xs font-semibold ${subTextColor}`}>{t('age') || 'Age'}</th>
                                <th className={`p-3 text-center text-xs font-semibold ${subTextColor}`}>{t('year') || 'Year'}</th>
                                <th className={`p-3 text-right text-xs font-semibold ${subTextColor}`}>{t('balance') || 'Balance'}</th>
                                <th className={`p-3 text-right text-xs font-semibold ${subTextColor}`}>{t('contributionHeader') || 'Contrib.'}</th>
                                <th className={`p-3 text-right text-xs font-semibold ${subTextColor}`}>{t('withdrawalHeader') || 'Withdr.'}</th>
                                <th className={`p-3 text-right text-xs font-semibold ${subTextColor}`}>{t('interestEarned') || 'Interest'}</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${theme === 'light' ? 'divide-gray-100' : 'divide-gray-700'}`}>
                            {yearlyData.map((row, idx) => {
                                return (
                                    <tr
                                        key={idx}
                                        className={`hover:bg-gray-500/10 ${row.phase === 'withdrawal' ? (isLight ? 'bg-orange-50' : 'bg-orange-500/5') : ''} amortization-row`}
                                    >
                                        <td className={`p-3 text-center amortization-cell-age ${isLight ? 'text-gray-800' : 'text-gray-200'}`}>{row.age.toFixed(0)}</td>
                                        <td className={`p-3 text-center amortization-cell-year ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>{row.year}</td>
                                        <td className={`p-3 text-right font-medium whitespace-nowrap amortization-cell-balance ${balanceColor(row.balance < 0)}`}>
                                            {formatCurrency(row.balance)}
                                        </td>
                                        <td className={`p-3 text-right whitespace-nowrap amortization-cell-contribution ${contributionColor}`}>
                                            {row.contribution > 0 ? formatCurrency(row.contribution) : '-'}
                                        </td>
                                        <td className={`p-3 text-right whitespace-nowrap amortization-cell-withdrawal ${withdrawalColor}`}>
                                            {row.withdrawal > 0 ? formatCurrency(row.withdrawal) : '-'}
                                        </td>
                                        <td className={`p-3 text-right whitespace-nowrap amortization-cell-interest ${interestColor(row.interest < 0)}`}>
                                            {formatCurrency(row.interest)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// Keep the original component for backward compatibility
export function AmortizationTable({ history, t, language }) {
    // This is now a wrapper that just renders the table inline
    // For the modal version, use AmortizationTableModal instead
    const [isExpanded, setIsExpanded] = React.useState(false);

    if (!history || history.length === 0) return null;

    const formatCurrency = (value) => {
        const num = parseFloat(value);
        if (isNaN(num)) return '-';
        const formatted = Math.abs(num).toLocaleString(language === 'he' ? 'he-IL' : 'en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        const currency = language === 'he' ? '₪' : '$';
        return `${formatted}\u00A0${currency}`;
    };

    const yearlyData = history.map((point, idx) => {
        const prevBalance = idx > 0 ? history[idx - 1].balance : 0;
        const contribution = point.contribution || 0;
        const withdrawal = point.withdrawal || 0;
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

            {isExpanded && (
                <div className="max-h-80 overflow-y-auto custom-scrollbar border-t border-white/10">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900 sticky top-0 z-10">
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
                                    <td className={`p-2 text-right font-medium whitespace-nowrap ${row.balance < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                        {formatCurrency(row.balance)}
                                    </td>
                                    <td className="p-2 text-right text-blue-400 whitespace-nowrap">
                                        {row.contribution > 0 ? formatCurrency(row.contribution) : '-'}
                                    </td>
                                    <td className="p-2 text-right text-orange-400 whitespace-nowrap">
                                        {row.withdrawal > 0 ? formatCurrency(row.withdrawal) : '-'}
                                    </td>
                                    <td className={`p-2 text-right whitespace-nowrap ${row.interest >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
