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
        <div className="space-y-6">
            {/* Status Message - Hero Card */}
            <div className={`p-6 rounded-2xl border-2 shadow-lg transition-all ${ranOutAtAge ? 'bg-red-500/20 border-red-500/50' : 'bg-green-500/20 border-green-500/50'}`}>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                />
                <SummaryCard
                    label={surplus >= 0 ? t('surplus') : t('deficit')}
                    value={formatCurrency(Math.abs(surplus))}
                    subtext={surplus >= 0 ? t('onTrack') : t('capitalNeeded')}
                    color={surplus >= 0 ? "text-green-400" : "text-red-400"}
                />
                <SummaryCard
                    label={t('estGrossWithdrawal')}
                    value={formatCurrency(initialGrossWithdrawal)}
                    subtext={t('monthlyPreTaxNeeded')}
                    color="text-yellow-400"
                />
            </div>

            {/* Chart */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-white mb-4">{t('wealthProjection')}</h3>
                <div className="h-64">
                    <Line data={data} options={options} />
                </div>
            </div>
        </div>
    );
}

function SummaryCard({ label, value, subtext, color }) {
    return (
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4">
            <p className="text-gray-400 text-sm">{label}</p>
            <p className={`text-2xl font-bold ${color} my-1`}>{value}</p>
            <p className="text-xs text-gray-500">{subtext}</p>
        </div>
    );
}
