import React, { useState, useEffect } from 'react';
import InputForm from './components/InputForm';
import { ResultsDashboard } from './components/ResultsDashboard';
import { ProfileManager } from './components/ProfileManager';
import { calculateRetirementProjection } from './utils/calculator';
import { translations } from './utils/translations';
import { AuthProvider } from './contexts/AuthContext';
import { UserMenu } from './components/UserMenu';

function App() {
  const [language, setLanguage] = useState('he');
  const t = (key) => translations[language][key] || key;

  const [inputs, setInputs] = useState({
    currentAge: 30,
    retirementStartAge: 50,
    retirementEndAge: 67,
    currentSavings: 0,
    monthlyContribution: 0,
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
    <AuthProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-900 p-2 md:p-4" dir={translations[language].dir}>
        <div className="max-w-7xl mx-auto">
          <header className="mb-4 flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
                {t('appTitle')}
              </h1>
              <p className="text-blue-200 text-lg">
                {t('appSubtitle')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <UserMenu t={t} />
              <button
                onClick={toggleLanguage}
                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg backdrop-blur-sm transition-colors font-medium h-10"
              >
                {language === 'en' ? '🇮🇱 Hebrew' : '🇺🇸 English'}
              </button>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-xl h-fit">
              <ProfileManager
                currentInputs={inputs}
                onLoad={setInputs}
                t={t}
                language={language}
              />
              <div className="my-4 border-t border-white/10"></div>
              <InputForm
                inputs={inputs}
                setInputs={setInputs}
                t={t}
                language={language}
                grossWithdrawal={results?.initialGrossWithdrawal}
                neededToday={results?.pvOfDeficit}
                capitalPreservation={results?.requiredCapitalForPerpetuity}
                capitalPreservationNeededToday={results?.pvOfCapitalPreservation}
              />
            </div>

            <div className="lg:col-span-8">
              {results && <ResultsDashboard results={results} inputs={inputs} t={t} language={language} />}
            </div>
          </div>
        </div>
      </div>
    </AuthProvider>
  )
}

export default App;
