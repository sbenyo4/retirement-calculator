import React, { useState, useEffect } from 'react';
import InputForm from './components/InputForm';
import { ResultsDashboard } from './components/ResultsDashboard';
import { ProfileManager } from './components/ProfileManager';
import { calculateRetirementProjection } from './utils/calculator';
import { translations } from './utils/translations';

function App() {
  const [language, setLanguage] = useState('he');
  const t = (key) => translations[language][key] || key;

  const [inputs, setInputs] = useState({
    currentAge: 30,
    retirementStartAge: 50,
    retirementEndAge: 67,
    currentSavings: 50000,
    monthlyContribution: 1000,
    monthlyNetIncomeDesired: 4000,
    annualReturnRate: 5,
    taxRate: 25,
    birthdate: ''
  });

  const [results, setResults] = useState(null);

  useEffect(() => {
    const projection = calculateRetirementProjection(inputs);
    setResults(projection);
  }, [inputs]);

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'he' : 'en');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-900 p-4 md:p-8" dir={translations[language].dir}>
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
              {t('appTitle')}
            </h1>
            <p className="text-blue-200 text-lg">
              {t('appSubtitle')}
            </p>
          </div>
          <button
            onClick={toggleLanguage}
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg backdrop-blur-sm transition-colors font-medium"
          >
            {language === 'en' ? '🇮🇱 Hebrew' : '🇺🇸 English'}
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <ProfileManager
              currentInputs={inputs}
              onLoad={setInputs}
              t={t}
              language={language}
            />
            <InputForm
              inputs={inputs}
              setInputs={setInputs}
              t={t}
              language={language}
              grossWithdrawal={results?.initialGrossWithdrawal}
            />
          </div>

          <div className="lg:col-span-8">
            {results && <ResultsDashboard results={results} inputs={inputs} t={t} language={language} />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App;
