import React, { useState, useEffect, useRef, useMemo, Component } from 'react';
import InputForm from './components/InputForm';
import { ResultsDashboard } from './components/ResultsDashboard';
import { ProfileManager } from './components/ProfileManager';
import { calculateRetirementProjection } from './utils/calculator';
import { calculateRetirementWithAI, getAvailableModels } from './utils/ai-calculator';
import { calculateSimulation, SIMULATION_TYPES } from './utils/simulation-calculator';
import { translations } from './utils/translations';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { UserMenu } from './components/UserMenu';
import { ThemeToggle } from './components/ThemeToggle';
import { LoginPage } from './components/LoginPage';
import { useProfiles } from './hooks/useProfiles';
import { useDebouncedValue } from './hooks/useDebounce';
import { DEFAULT_INPUTS, WITHDRAWAL_STRATEGIES } from './constants';

// Error Boundary to catch render errors
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="bg-red-900/50 border border-red-500 rounded-xl p-4 text-white">
          <h2 className="text-xl font-bold mb-2">⚠️ {t ? t('displayError') : 'שגיאה בתצוגה'}</h2>
          <p className="text-red-300 mb-2">{this.state.error?.message || (t ? t('unknownError') : 'Unknown error')}</p>
          <pre className="text-xs bg-black/50 p-2 rounded overflow-auto max-h-40">
            {this.state.errorInfo?.componentStack}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            className="mt-2 bg-blue-600 px-4 py-2 rounded"
          >
            {t ? t('tryAgain') : 'נסה שוב'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <MainApp />
      </ThemeProvider>
    </AuthProvider>
  );
}

function MainApp() {
  const { currentUser } = useAuth();
  const [language, setLanguage] = useState('he');
  const t = (key) => translations[language][key] || key;

  // Calculation State - always start in mathematical mode on refresh
  const [calculationMode, setCalculationMode] = useState('mathematical');
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('aiProvider') || 'gemini');
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('aiModel') || 'gemini-2.5-flash');
  const [apiKeyOverride, setApiKeyOverride] = useState(() => localStorage.getItem(`apiKeyOverride_${localStorage.getItem('aiProvider') || 'gemini'}`) || '');
  const [simulationType, setSimulationType] = useState(() => localStorage.getItem('simulationType') || SIMULATION_TYPES.MONTE_CARLO);

  // Initialize inputs - load from last loaded profile if available
  const [inputs, setInputs] = useState(() => {
    // Try to load the last profile
    const lastProfileId = localStorage.getItem('lastLoadedProfile_guest') ||
      (() => {
        // Try to find a user-specific key
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('lastLoadedProfile_')) {
            return localStorage.getItem(key);
          }
        }
        return null;
      })();

    if (lastProfileId) {
      // Find the profiles storage key
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('retirementProfiles_')) {
          try {
            const profiles = JSON.parse(localStorage.getItem(key) || '[]');
            const profile = profiles.find(p => p.id === lastProfileId);
            if (profile?.data) {
              return profile.data;
            }
          } catch (e) {
            console.error('Error loading profile:', e);
          }
        }
      }
    }

    return { ...DEFAULT_INPUTS };
  });

  const [results, setResults] = useState(null);
  const [aiResults, setAiResults] = useState(null);
  const [simulationResults, setSimulationResults] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiInputsChanged, setAiInputsChanged] = useState(true);
  const [selectedProfileIds, setSelectedProfileIds] = useState([]);

  // Sensitivity analysis state (for mathematical mode)
  const [showInterestSensitivity, setShowInterestSensitivity] = useState(false);
  const [showIncomeSensitivity, setShowIncomeSensitivity] = useState(false);
  const [showAgeSensitivity, setShowAgeSensitivity] = useState(false);

  // Custom hooks (must be called unconditionally at top level)
  const { profiles, saveProfile, updateProfile, deleteProfile, lastLoadedProfileId, markProfileAsLoaded, profilesLoaded } = useProfiles();

  // Refs
  const lastSimInputs = useRef(null);
  const lastSimType = useRef(null);

  // Persistence for General Settings (calculationMode not persisted - always starts as 'mathematical')
  useEffect(() => {
    localStorage.setItem('aiProvider', aiProvider);
    localStorage.setItem('aiModel', aiModel);
    localStorage.setItem('simulationType', simulationType);
  }, [aiProvider, aiModel, simulationType]);

  // Persistence for API Key (Per Provider) - consolidated effect
  const prevProviderRef = useRef(aiProvider);
  useEffect(() => {
    // If provider changed, load the key for the new provider
    if (prevProviderRef.current !== aiProvider) {
      const savedKey = localStorage.getItem(`apiKeyOverride_${aiProvider}`) || '';
      setApiKeyOverride(savedKey);
      prevProviderRef.current = aiProvider;
    } else {
      // Provider didn't change, save the current key
      localStorage.setItem(`apiKeyOverride_${aiProvider}`, apiKeyOverride);
    }
  }, [apiKeyOverride, aiProvider]);

  // Validate AI Model on load/change (fix for persisted invalid models)
  useEffect(() => {
    const availableModels = getAvailableModels(aiProvider);
    const isModelValid = availableModels.some(m => m.id === aiModel);

    if (!isModelValid && availableModels.length > 0) {
      console.log(`Resetting invalid model ${aiModel} to ${availableModels[0].id}`);
      setAiModel(availableModels[0].id);
    }
  }, [aiProvider, aiModel]);

  // Debounce inputs for heavy calculations (300ms delay)
  const debouncedInputs = useDebouncedValue(inputs, 300);

  // Standard Mathematical Calculation & Simulation
  useEffect(() => {
    const age = parseFloat(debouncedInputs.currentAge);
    const retirementStart = parseFloat(debouncedInputs.retirementStartAge);
    const retirementEnd = parseFloat(debouncedInputs.retirementEndAge);

    if (
      !isNaN(age) && age >= 0 && age <= 120 &&
      !isNaN(retirementStart) && retirementStart >= 0 && retirementStart <= 120 &&
      !isNaN(retirementEnd) && retirementEnd >= 0 && retirementEnd <= 120 &&
      retirementStart > age && // Ensure retirement starts after current age
      retirementEnd > retirementStart // Ensure retirement ends after it starts
    ) {
      const projection = calculateRetirementProjection(debouncedInputs);
      setResults(projection);

      // Handle Simulation Mode
      // Also auto-trigger Monte Carlo for Dynamic strategy even in mathematical mode
      const isDynamicStrategy = debouncedInputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.DYNAMIC;
      if (calculationMode === 'simulations' || calculationMode === 'compare' || isDynamicStrategy) {
        // Only calculate if inputs or type changed, or if we don't have results yet
        const shouldUpdate =
          !simulationResults ||
          lastSimInputs.current !== debouncedInputs ||
          lastSimType.current !== simulationType;

        if (shouldUpdate) {
          const simResult = calculateSimulation(debouncedInputs, simulationType);
          setSimulationResults(simResult);
          lastSimInputs.current = debouncedInputs;
          lastSimType.current = simulationType;
        }
      }
      // We intentionally DO NOT clear simulationResults here so they persist when switching modes
    }
  }, [debouncedInputs, calculationMode, simulationType]);

  // Mark inputs as changed when they change
  useEffect(() => {
    setAiInputsChanged(true);
  }, [inputs, aiProvider, aiModel, apiKeyOverride]);

  // Sync selectedProfileIds with available profiles (cleanup deleted profiles)
  useEffect(() => {
    setSelectedProfileIds(prev => prev.filter(id => profiles.some(p => p.id === id)));
  }, [profiles]);

  // Calculate results for selected profiles - memoized for performance
  const profileResults = useMemo(() => {
    return selectedProfileIds.map(id => {
      const profile = profiles.find(p => p.id === id);
      if (!profile) return null;
      return {
        id: profile.id,
        name: profile.name,
        results: calculateRetirementProjection(profile.data)
      };
    }).filter(Boolean);
  }, [selectedProfileIds, profiles]);

  // Manual AI Calculation Handler
  const handleAiCalculate = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await calculateRetirementWithAI(inputs, aiProvider, aiModel, apiKeyOverride, results);
      setAiResults(result);
      setAiInputsChanged(false);
    } catch (error) {
      console.error("AI Error:", error);
      let errorMessage = error.message || "An error occurred";

      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
        errorMessage = "הגעת למכסת השימוש של המודל (Quota Exceeded). אנא נסה שוב מאוחר יותר או בחר מודל אחר (כגון Flash).";
      } else if (errorMessage.includes('404') || errorMessage.toLowerCase().includes('not found')) {
        errorMessage = "המודל שנבחר אינו זמין כרגע או אינו קיים. אנא בחר מודל אחר מהרשימה.";
      } else if (errorMessage.includes('503') || errorMessage.toLowerCase().includes('overloaded')) {
        errorMessage = "השרת עמוס כרגע. אנא נסה שוב בעוד מספר שניות.";
      }

      setAiError(errorMessage);
    } finally {
      setAiLoading(false);
    }
  };

  // Note: Profile loading is now handled by the ProfileManager component
  // Inputs are automatically saved to localStorage whenever they change

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
            <ThemeToggle />
            <button
              onClick={toggleLanguage}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg backdrop-blur-sm transition-colors font-medium h-10"
            >
              {language === 'en' ? '🇮🇱 Hebrew' : '🇺🇸 English'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-xl h-fit relative z-20">
            <ProfileManager
              currentInputs={inputs}
              onLoad={setInputs}
              t={t}
              language={language}
              profiles={profiles}
              onSaveProfile={saveProfile}
              onUpdateProfile={updateProfile}
              onDeleteProfile={deleteProfile}
              onProfileLoad={markProfileAsLoaded}
              lastLoadedProfileId={lastLoadedProfileId}
            />
            <div className="my-2 border-t border-white/10"></div>
            <InputForm
              inputs={inputs}
              setInputs={setInputs}
              t={t}
              language={language}
              grossWithdrawal={
                inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.DYNAMIC && simulationResults
                  ? simulationResults.initialGrossWithdrawal
                  : results?.initialGrossWithdrawal
              }
              netWithdrawal={
                inputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.DYNAMIC && simulationResults
                  ? simulationResults.initialNetWithdrawal
                  : results?.initialNetWithdrawal
              }
              neededToday={results?.pvOfDeficit}
              capitalPreservation={results?.requiredCapitalForPerpetuity}
              capitalPreservationNeededToday={results?.pvOfCapitalPreservation}

              // New Props
              calculationMode={calculationMode}
              setCalculationMode={setCalculationMode}
              aiProvider={aiProvider}
              setAiProvider={setAiProvider}
              aiModel={aiModel}
              setAiModel={setAiModel}
              apiKeyOverride={apiKeyOverride}
              setApiKeyOverride={setApiKeyOverride}
              simulationType={simulationType}
              setSimulationType={setSimulationType}
              onAiCalculate={handleAiCalculate}
              aiInputsChanged={aiInputsChanged}
              aiLoading={aiLoading}

              // Sensitivity analysis props
              showInterestSensitivity={showInterestSensitivity}
              setShowInterestSensitivity={setShowInterestSensitivity}
              showIncomeSensitivity={showIncomeSensitivity}
              setShowIncomeSensitivity={setShowIncomeSensitivity}
              showAgeSensitivity={showAgeSensitivity}
              setShowAgeSensitivity={setShowAgeSensitivity}
            />
          </div>

          <div className="lg:col-span-8">
            <ErrorBoundary t={t}>
              {results && (
                <ResultsDashboard
                  results={results}
                  inputs={inputs}
                  t={t}
                  language={language}

                  // New Props
                  calculationMode={calculationMode}
                  aiResults={aiResults}
                  simulationResults={simulationResults}
                  aiLoading={aiLoading}
                  aiError={aiError}
                  simulationType={simulationType}
                  profiles={profiles}
                  selectedProfileIds={selectedProfileIds}
                  setSelectedProfileIds={setSelectedProfileIds}
                  profileResults={profileResults}

                  // Sensitivity analysis props
                  showInterestSensitivity={showInterestSensitivity}
                  setShowInterestSensitivity={setShowInterestSensitivity}
                  showIncomeSensitivity={showIncomeSensitivity}
                  setShowIncomeSensitivity={setShowIncomeSensitivity}
                  showAgeSensitivity={showAgeSensitivity}
                  setShowAgeSensitivity={setShowAgeSensitivity}
                />
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
