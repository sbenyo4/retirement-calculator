import React, { useMemo, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { createPortal } from 'react-dom';
import { Coffee, Car, Plane, Ticket, ShoppingCart, Beer, X, Rocket } from 'lucide-react';

export function InflationButton({ onClick, t }) {
    return (
        <button
            onClick={onClick}
            title={t('inflationRealityCheckTitle')}
            className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-gradient-to-r from-rose-500/20 to-pink-500/20 border border-rose-500/30 text-rose-200 hover:from-rose-500/30 hover:to-pink-500/30"
        >
            <Rocket size={14} />
            <span className="hidden md:inline">{t('inflationBtn')}</span>
        </button>
    );
}

export function InflationModal({ isOpen, onClose, t, language }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isRTL = language === 'he';

    // Local State
    const [rate, setRate] = useState(2.5);
    const [years, setYears] = useState(10);

    const items = useMemo(() => [
        {
            id: 'coffee',
            icon: Coffee,
            currentPrice: 5,
            color: 'text-amber-600',
            bgColor: 'bg-amber-100',
            darkColor: 'text-amber-400',
            darkBgColor: 'bg-amber-900/30'
        },
        {
            id: 'bread',
            icon: ShoppingCart,
            currentPrice: 4,
            color: 'text-yellow-600',
            bgColor: 'bg-yellow-100',
            darkColor: 'text-yellow-400',
            darkBgColor: 'bg-yellow-900/30'
        },
        {
            id: 'movie',
            icon: Ticket,
            currentPrice: 15,
            color: 'text-purple-600',
            bgColor: 'bg-purple-100',
            darkColor: 'text-purple-400',
            darkBgColor: 'bg-purple-900/30'
        },
        {
            id: 'beer',
            icon: Beer,
            currentPrice: 8,
            color: 'text-orange-600',
            bgColor: 'bg-orange-100',
            darkColor: 'text-orange-400',
            darkBgColor: 'bg-orange-900/30'
        },
        {
            id: 'car',
            icon: Car,
            currentPrice: 35000,
            color: 'text-blue-600',
            bgColor: 'bg-blue-100',
            darkColor: 'text-blue-400',
            darkBgColor: 'bg-blue-900/30'
        },
        {
            id: 'vacation',
            icon: Plane,
            currentPrice: 5000,
            color: 'text-emerald-600',
            bgColor: 'bg-emerald-100',
            darkColor: 'text-emerald-400',
            darkBgColor: 'bg-emerald-900/30'
        }
    ], []);

    const projectedItems = useMemo(() => {
        const r = parseFloat(rate) / 100;
        const n = parseFloat(years);

        return items.map(item => ({
            ...item,
            futurePrice: item.currentPrice * Math.pow(1 + r, n)
        }));
    }, [items, rate, years]);

    const formatPrice = (price) => {
        let value = price;
        let currency = 'USD';

        if (language === 'he') {
            currency = 'ILS';
            value = price * 3.8;
        }

        return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0
        }).format(value);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl animate-in zoom-in-95 duration-200 ${isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-white/10 text-white'}`}>

                {/* Header */}
                <div className={`flex items-center justify-between p-4 border-b shrink-0 ${isLight ? 'border-slate-300' : 'border-white/10'}`}>
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <span>🚀</span>
                            {t('inflationRealityCheckTitle')}
                        </h2>
                        <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('inflationRealityCheckDesc').replace('{years}', years)}
                        </p>
                    </div>
                    <button onClick={onClose} className={`p-1.5 rounded-full transition-colors ${isLight ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>
                        <X size={20} />
                    </button>
                </div>

                {/* Controls */}
                <div className={`px-6 py-4 border-b shrink-0 flex flex-col md:flex-row gap-8 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-white/5'}`}>

                    {/* Rate Slider */}
                    <div className="flex-1 space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-semibold">{t('inflationRate')}</label>
                            <span className={`text-sm font-bold ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>{rate}%</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="5"
                            step="0.1"
                            value={rate}
                            onChange={(e) => setRate(e.target.value)}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-500"
                        />
                        <div className="flex justify-between text-[10px] opacity-60">
                            <span>0%</span>
                            <span>5%</span>
                        </div>
                    </div>

                    {/* Years Slider */}
                    <div className="flex-1 space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-semibold">{t('yearsToFuture')}</label>
                            <span className={`text-sm font-bold ${isLight ? 'text-purple-600' : 'text-purple-400'}`}>{years} {t('years')}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="30"
                            step="1"
                            value={years}
                            onChange={(e) => setYears(e.target.value)}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-500"
                        />
                        <div className="flex justify-between text-[10px] opacity-60">
                            <span>0</span>
                            <span>30</span>
                        </div>
                    </div>
                </div>

                {/* Grid */}
                <div className="p-6 overflow-y-auto">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {projectedItems.map((item) => (
                            <div
                                key={item.id}
                                className={`relative group overflow-hidden rounded-xl border p-4 transition-all hover:scale-105 hover:shadow-xl ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/5'}`}
                            >
                                <div className={`absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isLight ? 'bg-slate-200 text-slate-600' : 'bg-black/30 text-gray-400'}`}>
                                    x{(item.futurePrice / item.currentPrice).toFixed(1)}
                                </div>

                                <div className={`mb-3 w-10 h-10 rounded-lg flex items-center justify-center ${isLight ? `${item.bgColor} ${item.color}` : `${item.darkBgColor} ${item.darkColor}`}`}>
                                    <item.icon size={20} />
                                </div>

                                <h4 className={`text-sm font-medium mb-1 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                    {t(`item_${item.id}`)}
                                </h4>

                                <div className="space-y-1">
                                    <div className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'} line-through`}>
                                        {formatPrice(item.currentPrice)}
                                    </div>
                                    <div className={`text-lg font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>
                                        {formatPrice(item.futurePrice)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className={`mt-6 text-center text-xs italic ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                        {t('inflationDisclaimer')} {rate}%
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
