import React, { useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { calculateRetirementProjection } from '../utils/calculator';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Format number compactly (e.g., 3.2M, 500k, 15,200)
function formatCompactNumber(value, language) {
    const absValue = Math.abs(value);
    const currencySymbol = language === 'he' ? '₪' : '$';
    if (absValue >= 1000000) {
        const millions = value / 1000000;
        const decimals = absValue < 10000000 ? 2 : 1;
        return `${millions.toFixed(decimals)}M`;
    }
    if (absValue >= 1000) {
        const thousands = value / 1000;
        const decimals = absValue < 100000 ? 1 : 0;
        return `${thousands.toFixed(decimals)}k`;
    }
    return value.toLocaleString();
}

function formatCurrencyLabel(value, language) {
    const symbol = language === 'he' ? '₪' : '$';
    return language === 'he'
        ? `${formatCompactNumber(value, language)}${symbol}`
        : `${symbol}${formatCompactNumber(value, language)}`;
}

export default function TargetBalanceChart({ inputs, t, language }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';

    // Binary search: find max monthly income for a given target end balance
    const findWithdrawalForTarget = (targetBalance, baseInputs) => {
        let low = 0;
        let high = 150000;

        for (let i = 0; i < 30; i++) {
            const mid = (low + high) / 2;
            try {
                const testInputs = { ...baseInputs, monthlyNetIncomeDesired: mid };
                const result = calculateRetirementProjection(testInputs, t);
                if (result.balanceAtEnd > targetBalance) {
                    low = mid; // Can withdraw more
                } else {
                    high = mid; // Need to withdraw less
                }
            } catch (e) {
                break;
            }
        }
        return Math.round((low + high) / 2);
    };

    const chartResults = useMemo(() => {
        const results = [];

        // Validation
        const currentAge = parseFloat(inputs.currentAge);
        const retirementStartAge = parseFloat(inputs.retirementStartAge);
        const retirementEndAge = parseFloat(inputs.retirementEndAge);

        if (isNaN(currentAge) || isNaN(retirementStartAge) || isNaN(retirementEndAge) ||
            currentAge < 0 || retirementStartAge <= currentAge || retirementEndAge <= retirementStartAge) {
            return results;
        }

        const currentWithdrawal = parseFloat(inputs.monthlyNetIncomeDesired) || 0;

        // 0 to 8M in 500K steps
        for (let target = 0; target <= 8000000; target += 500000) {
            const maxIncome = findWithdrawalForTarget(target, inputs);
            results.push({
                targetBalance: target,
                maxIncome,
                isCurrentWithdrawal: Math.abs(maxIncome - currentWithdrawal) < 500
            });
        }

        return results;
    }, [inputs, t]);

    if (chartResults.length === 0) return null;

    const currentWithdrawal = parseFloat(inputs.monthlyNetIncomeDesired) || 0;

    const chartData = {
        labels: chartResults.map(r => {
            const millions = r.targetBalance / 1000000;
            if (r.targetBalance === 0) return '0';
            return language === 'he'
                ? `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M₪`
                : `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
        }),
        datasets: [{
            label: t('maxMonthlyIncome') || 'Max Monthly Income',
            data: chartResults.map(r => r.maxIncome),
            backgroundColor: chartResults.map(r => {
                if (r.maxIncome <= 0) return 'rgba(248, 113, 113, 0.7)'; // Red - not feasible
                // Highlight bar closest to user's current withdrawal
                if (Math.abs(r.maxIncome - currentWithdrawal) < 1000) {
                    return 'rgba(250, 204, 21, 0.85)'; // Yellow
                }
                return 'rgba(99, 102, 241, 0.7)'; // Indigo
            }),
            borderColor: chartResults.map(r => {
                if (r.maxIncome <= 0) return 'rgb(248, 113, 113)';
                if (Math.abs(r.maxIncome - currentWithdrawal) < 1000) {
                    return 'rgb(250, 204, 21)';
                }
                return 'rgb(99, 102, 241)';
            }),
            borderWidth: chartResults.map(r =>
                Math.abs(r.maxIncome - currentWithdrawal) < 1000 ? 3 : 1
            ),
            borderRadius: 4,
        }]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: { top: 25 }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        const value = context.parsed.y;
                        const formatted = new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
                            style: 'currency',
                            currency: language === 'he' ? 'ILS' : 'USD',
                            maximumFractionDigits: 0
                        }).format(value);
                        return `${t('maxMonthlyIncome') || 'Max Monthly Income'}: ${formatted}`;
                    },
                    title: (items) => {
                        const idx = items[0].dataIndex;
                        const r = chartResults[idx];
                        const balanceFormatted = new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
                            style: 'currency',
                            currency: language === 'he' ? 'ILS' : 'USD',
                            maximumFractionDigits: 0
                        }).format(r.targetBalance);
                        return `${t('targetEndBalance') || 'Target End Balance'}: ${balanceFormatted}`;
                    }
                }
            },
            datalabels: {
                anchor: 'end',
                align: 'top',
                offset: 4,
                clip: false,
                textAlign: 'center',
                color: isLight ? '#1f2937' : '#f3f4f6',
                font: { size: 9, weight: '700' },
                formatter: (value) => formatCompactNumber(value, language)
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    color: '#9ca3af',
                    maxRotation: 45,
                    minRotation: 0,
                    font: { size: 10 }
                }
            },
            y: {
                grid: { color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)' },
                ticks: {
                    color: '#9ca3af',
                    callback: (val) => formatCompactNumber(val, language)
                }
            }
        }
    };

    // Add a horizontal annotation line for current withdrawal
    const annotationLine = {
        id: 'currentWithdrawalLine',
        afterDatasetsDraw: (chart) => {
            const yScale = chart.scales.y;
            const ctx = chart.ctx;
            const yPos = yScale.getPixelForValue(currentWithdrawal);

            if (yPos >= yScale.top && yPos <= yScale.bottom) {
                ctx.save();
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = isLight ? '#f59e0b' : '#fbbf24';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(chart.chartArea.left, yPos);
                ctx.lineTo(chart.chartArea.right, yPos);
                ctx.stroke();

                // Label
                ctx.setLineDash([]);
                ctx.fillStyle = isLight ? '#92400e' : '#fde68a';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = language === 'he' ? 'left' : 'right';
                const labelX = language === 'he' ? chart.chartArea.left + 4 : chart.chartArea.right - 4;
                ctx.fillText(
                    `${t('currentValue') || 'Current'}: ${formatCompactNumber(currentWithdrawal, language)}`,
                    labelX,
                    yPos - 6
                );
                ctx.restore();
            }
        }
    };

    return (
        <div className={`backdrop-blur-md border rounded-2xl p-4 shadow-xl ${isLight ? 'bg-white border-slate-300 shadow-md' : 'bg-white/10 border-white/40'}`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className={`text-lg font-semibold ${isLight ? 'text-slate-900' : 'text-white'} flex items-center gap-2`}>
                    <span>🎯</span>
                    <span>{t('targetBalanceVsIncome') || 'Target Balance vs Max Income'}</span>
                </h3>
                {/* Current value indicator */}
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-yellow-400 rounded-sm"></span>
                    <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                        {t('currentValue') || 'Current'}
                    </span>
                </div>
            </div>
            <div className="h-64">
                <Bar data={chartData} options={options} plugins={[ChartDataLabels, annotationLine]} />
            </div>
        </div>
    );
}
