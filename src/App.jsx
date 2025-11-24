import React, { useState, useEffect } from 'react';
import InputForm from './components/InputForm';
import { ResultsDashboard } from './components/ResultsDashboard';
import { ProfileManager } from './components/ProfileManager';
import { calculateRetirementProjection } from './utils/calculator';
import { translations } from './utils/translations';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UserMenu } from './components/UserMenu';
import { LoginPage } from './components/LoginPage';

function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

function MainApp() {
  const { currentUser } = useAuth();
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
    // Validate age is reasonable before calculating
    const age = parseFloat(inputs.currentAge);
    const retirementStart = parseFloat(inputs.retirementStartAge);
    const retirementEnd = parseFloat(inputs.retirementEndAge);

    // Only calculate if all ages are in reasonable range (0-120) and valid
    if (
      !isNaN(age) && age >= 0 && age <= 120 &&
      !isNaN(retirementStart) && retirementStart >= 0 && retirementStart <= 120 &&
      !isNaN(retirementEnd) && retirementEnd >= 0 && retirementEnd <= 120
    ) {
      const projection = calculateRetirementProjection(inputs);
      setResults(projection);
    }
  }, [inputs]);

  // Reset inputs to default when user changes
  useEffect(() => {
    if (currentUser) {
      setInputs({
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
    }
  }, [currentUser]);

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'he' : 'en');
  };

  if (!currentUser) {
    return <LoginPage t={t} />;
  }

  return (
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
  );
}

export default App;
