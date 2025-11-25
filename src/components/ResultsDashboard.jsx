import React from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

export function ResultsDashboard({ results, inputs, t, language }) {
    if (!results) return null;

    const {
        history,
        balanceAtRetirement,
        balanceAtEnd,
        ranOutAtAge,
        requiredCapitalAtRetirement,
        requiredCapitalForPerpetuity,
        surplus,
        pvOfDeficit,
        initialGrossWithdrawal
    } = results;

    const formatCurrency = (value) => {
        return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: language === 'he' ? 'ILS' : 'USD',
            maximumFractionDigits: 0
        }).format(value);
    };

    // Chart Data
    const data = {
        labels: history.map(h => `Age ${Math.floor(h.age)}`),
        datasets: [
            {
                label: t('wealthProjection'),
                data: history.map(h => h.balance),
                borderColor: '#60a5fa',
                backgroundColor: 'rgba(96, 165, 250, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHitRadius: 10,
            },
            {
                label: t('accumulatedWithdrawals'),
                data: history.map(h => h.accumulatedWithdrawals),
                borderColor: '#facc15', // Yellow-400
                backgroundColor: 'rgba(250, 204, 21, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHitRadius: 10,
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: (context) => formatCurrency(context.raw)
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#9ca3af', maxTicksLimit: 8 }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#9ca3af', callback: (val) => (val / 1000) + 'k' }
            }
        },
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
        }
    };

    return (
        <div className="space-y-3">
            {/* Status Message - Hero Card */}
            <div className={`p-4 rounded-2xl border-2 shadow-lg transition-all ${ranOutAtAge ? 'bg-red-500/20 border-red-500/50' : 'bg-green-500/20 border-green-500/50'}`}>
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-start">
                    <div>
                        <h3 className={`text-2xl font-bold ${ranOutAtAge ? 'text-red-200' : 'text-green-200'}`}>
                            {ranOutAtAge ? t('warningRunOut') + ` ${ranOutAtAge.toFixed(1)}` : t('onTrack')}
                        </h3>
                        {!ranOutAtAge && (
                            <p className="text-green-100 mt-1 opacity-80">
                                {t('projectedBalanceAtAge')} {history[history.length - 1].age.toFixed(0)}
                            </p>
                        )}
                    </div>
                    {!ranOutAtAge && (
                        <div className="bg-black/20 rounded-xl p-4 backdrop-blur-sm border border-white/10">
                            <p className="text-sm text-green-200 mb-1">{t('balanceAtEnd')}</p>
                            <p className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                                {formatCurrency(balanceAtEnd)}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                <SummaryCard
                    label={t('balanceAtRetirement')}
                    value={formatCurrency(balanceAtRetirement)}
                    subtext={t('projectedSavings')}
                    color="text-blue-400"
                />
                <SummaryCard
                    label={t('requiredCapital')}
                    value={formatCurrency(requiredCapitalAtRetirement)}
                    subtext={t('toEndWithZero')}
                    color="text-purple-400"
                />
                <SummaryCard
                    label={t('capitalPreservation')}
                    value={formatCurrency(requiredCapitalForPerpetuity)}
                    subtext={t('preservePrincipal')}
                    color="text-emerald-400"
                    extraContent={
                        <div className="mt-1 pt-1 border-t border-white/10">
                            <span className="text-xs text-orange-300 font-medium block">{t('neededToday')}:</span>
                            <span className="text-lg font-bold text-orange-300">{formatCurrency(results.pvOfCapitalPreservation)}</span>
                        </div>
                    }
                />
                <SummaryCard
                    label={surplus >= 0 ? t('surplus') : t('deficit')}
                    value={formatCurrency(Math.abs(surplus))}
                    subtext={surplus >= 0 ? t('onTrack') : t('capitalNeeded')}
                    color={surplus >= 0 ? "text-green-400" : "text-red-400"}
                    extraContent={surplus < 0 && (
                        <div className="mt-1 pt-1 border-t border-white/10">
                            <span className="text-xs text-orange-300 font-medium block">{t('neededToday')}:</span>
                            <span className="text-lg font-bold text-orange-300">{formatCurrency(pvOfDeficit)}</span>
                        </div>
                    )}
                />
                <SummaryCard
                    label={t('estGrossWithdrawal')}
                    value={formatCurrency(initialGrossWithdrawal)}
                    color="text-yellow-400"
                />
                <SummaryCard
                    label={t('timeHorizon')}
                    value={`${(inputs.retirementStartAge - inputs.currentAge).toFixed(1)} / ${(inputs.retirementEndAge - inputs.retirementStartAge).toFixed(1)}`}
                    subtext={`${t('yearsUntilRetirement')} / ${t('yearsOfRetirement')}`}
                    color="text-orange-400"
                />
            </div>

            {/* Chart */}
            <div className="bg-white/10 backdrop-blur-md border border-white/30 rounded-2xl p-4 shadow-xl">
                {/* Chart Title with Custom Legend */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">{t('wealthProjection')}</h3>
                    <div className="flex gap-6">
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 bg-[#60a5fa] inline-block"></span>
                            <span className="text-sm text-white">{t('wealthProjection')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 bg-[#facc15] inline-block"></span>
                            <span className="text-sm text-white">{t('accumulatedWithdrawals')}</span>
                        </div>
                    </div>
                </div>
                <div className="h-52">
                    <Line data={data} options={options} />
                </div>
            </div>
        </div>
    );
}

function SummaryCard({ label, value, subtext, color, extraContent }) {
    return (
        <div className="bg-white/10 backdrop-blur-md border border-white/30 rounded-xl p-3">
            <p className="text-gray-400 text-sm">{label}</p>
            <p className={`text-2xl font-bold ${color} my-1`}>{value}</p>
            <p className="text-xs text-gray-500">{subtext}</p>
            {extraContent}
        </div>
    );
}
