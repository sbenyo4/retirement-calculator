import React from 'react';

export default function InputForm({ inputs, setInputs, t, language, grossWithdrawal }) {
    const currency = t('currency');

    const formatCurrency = (value) => {
        return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: language === 'he' ? 'ILS' : 'USD',
            maximumFractionDigits: 0
        }).format(value);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        // Allow empty string or valid number/decimal input
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            setInputs(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };

    const handleBirthdateChange = (e) => {
        const date = e.target.value;
        const birthDateObj = new Date(date);
        const today = new Date();

        // Calculate precise age including decimals
        let age = (today - birthDateObj) / (1000 * 60 * 60 * 24 * 365.25);

        setInputs(prev => ({
            ...prev,
            birthdate: date,
            currentAge: age.toFixed(2) // Keep as string for input
        }));
    };

    return (
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 3.666V14m-3.75-4.333a4.5 4.5 0 00-9 0V16.5A2.25 2.25 0 005.25 18.75h13.5A2.25 2.25 0 0021 16.5v-3.833a4.5 4.5 0 00-9 0v-2.667z" />
                </svg>
                <h2 className="text-xl font-semibold text-white">{t('parameters')}</h2>
            </div>

            <div className="space-y-3">
                <InputGroup
                    label={t('birthdate')}
                    name="birthdate"
                    type="date"
                    value={inputs.birthdate}
                    onChange={handleBirthdateChange}
                    icon="📅"
                />

                <InputGroup
                    label={t('currentAge')}
                    name="currentAge"
                    value={inputs.currentAge}
                    onChange={handleChange}
                    icon="📅"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <InputGroup
                        label={t('startAge')}
                        name="retirementStartAge"
                        value={inputs.retirementStartAge}
                        onChange={handleChange}
                        icon="📈"
                    />
                    <InputGroup
                        label={t('endAge')}
                        name="retirementEndAge"
                        value={inputs.retirementEndAge}
                        onChange={handleChange}
                        icon="🗓️"
                    />
                </div>

                <InputGroup
                    label={t('currentSavings')}
                    name="currentSavings"
                    value={inputs.currentSavings}
                    onChange={handleChange}
                    prefix={currency}
                    icon="💰"
                />

                <InputGroup
                    label={t('monthlyContribution')}
                    name="monthlyContribution"
                    value={inputs.monthlyContribution}
                    onChange={handleChange}
                    prefix={currency}
                    icon="💰"
                />

                <InputGroup
                    label={t('monthlyNetIncomeDesired')}
                    name="monthlyNetIncomeDesired"
                    value={inputs.monthlyNetIncomeDesired}
                    onChange={handleChange}
                    prefix={currency}
                    icon={<span className="text-green-400">{currency}</span>}
                    extraLabel={grossWithdrawal ? `(${t('gross')}: ${formatCurrency(grossWithdrawal)})` : null}
                />

                <div className="grid grid-cols-2 gap-2">
                    <InputGroup
                        label={t('annualReturnRate')}
                        name="annualReturnRate"
                        value={inputs.annualReturnRate}
                        onChange={handleChange}
                        icon="📊"
                    />
                    <InputGroup
                        label={t('taxRate')}
                        name="taxRate"
                        value={inputs.taxRate}
                        onChange={handleChange}
                        icon="🏛️"
                    />
                </div>
            </div>
        </div>
    );
}

function InputGroup({ label, name, value, onChange, icon, prefix, type = "text", extraLabel }) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-200 flex items-center gap-1 h-6">
                    {icon} {label}
                </label>
                {extraLabel && (
                    <span className="text-xs text-yellow-400 font-medium">
                        {extraLabel}
                    </span>
                )}
            </div>
            <div className="relative">
                {prefix && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {prefix}
                    </span>
                )}
                <input
                    type={type}
                    name={name}
                    value={value}
                    onChange={onChange}
                    className={`w-full bg-black/20 border border-white/10 rounded-lg py-1.5 px-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${prefix ? 'pl-7' : ''}`}
                />
            </div>
        </div>
    );
}
