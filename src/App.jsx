import React, { useState, useEffect, useRef, useMemo, Component, useReducer } from 'react';
import InputForm from './components/InputForm';
import { ResultsDashboard } from './components/ResultsDashboard';
import { ProfileManager } from './components/ProfileManager';
import { calculateRetirementProjection } from './utils/calculator';
import { calculateRetirementWithAI } from './utils/ai-calculator';
import { getAvailableModels } from './config/ai-models';
import { calculateSimulation, SIMULATION_TYPES } from './utils/simulation-calculator';
import { translations } from './utils/translations';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { UserMenu } from './components/UserMenu';
import { ThemeToggle } from './components/ThemeToggle';
import { LoginPage } from './components/LoginPage';
import { useProfiles } from './hooks/useProfiles';
import { useDebouncedValue } from './hooks/useDebounce';
import { useRateLimit } from './hooks/useRateLimit';
import { ModelsManager } from './components/ModelsManager';
import { DEFAULT_INPUTS, WITHDRAWAL_STRATEGIES } from './constants';
import { Settings } from 'lucide-react';

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

// Settings Reducer - consolidates related state
const SETTINGS_ACTIONS = {
  SET_CALCULATION_MODE: 'SET_CALCULATION_MODE',
  SET_AI_PROVIDER: 'SET_AI_PROVIDER',
  SET_AI_MODEL: 'SET_AI_MODEL',
  SET_API_KEY_OVERRIDE: 'SET_API_KEY_OVERRIDE',
  SET_SIMULATION_TYPE: 'SET_SIMULATION_TYPE'
};

function getInitialSettings() {
  const savedProvider = localStorage.getItem('aiProvider') || 'gemini';
  return {
    calculationMode: 'mathematical', // Always start in mathematical mode on refresh
    aiProvider: savedProvider,
    aiModel: localStorage.getItem('aiModel') || 'gemini-2.5-flash',
    apiKeyOverride: localStorage.getItem(`apiKeyOverride_${savedProvider}`) || '',
    simulationType: localStorage.getItem('simulationType') || SIMULATION_TYPES.MONTE_CARLO
  };
}

function settingsReducer(state, action) {
  switch (action.type) {
    case SETTINGS_ACTIONS.SET_CALCULATION_MODE:
      return { ...state, calculationMode: action.payload };

    case SETTINGS_ACTIONS.SET_AI_PROVIDER: {
      // When provider changes, load the saved API key for that provider
      const newApiKey = localStorage.getItem(`apiKeyOverride_${action.payload}`) || '';
      return {
        ...state,
        aiProvider: action.payload,
        apiKeyOverride: newApiKey
      };
    }

    case SETTINGS_ACTIONS.SET_AI_MODEL:
      return { ...state, aiModel: action.payload };

    case SETTINGS_ACTIONS.SET_API_KEY_OVERRIDE:
      return { ...state, apiKeyOverride: action.payload };

    case SETTINGS_ACTIONS.SET_SIMULATION_TYPE:
      return { ...state, simulationType: action.payload };

    default:
      return state;
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
  // Wrap t in useCallback to prevent it from changing on every render
  const t = React.useCallback((key) => translations[language][key] || key, [language]);

  // Settings State - using useReducer for related state
  const [settings, dispatchSettings] = useReducer(settingsReducer, null, getInitialSettings);

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
  const [validationError, setValidationError] = useState(null);

  // Sensitivity analysis state (for mathematical mode)
  const [showInterestSensitivity, setShowInterestSensitivity] = useState(false);
  const [showIncomeSensitivity, setShowIncomeSensitivity] = useState(false);
  const [showAgeSensitivity, setShowAgeSensitivity] = useState(false);

  // Custom hooks (must be called unconditionally at top level)
  const { profiles, saveProfile, updateProfile, deleteProfile, lastLoadedProfileId, markProfileAsLoaded, profilesLoaded } = useProfiles();

  // Rate limiting hook
  const {
    isLimited,
    timeUntilReset,
    checkRateLimit,
    recordCall,
    getUsageStats
  } = useRateLimit(currentUser?.uid || 'guest');

  // UI State
  const [showModelsManager, setShowModelsManager] = useState(false);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);

  // Refs
  const lastSimInputs = useRef(null);
  const lastSimType = useRef(null);

  // Persistence for General Settings
  useEffect(() => {
    localStorage.setItem('aiProvider', settings.aiProvider);
    localStorage.setItem('aiModel', settings.aiModel);
    localStorage.setItem('simulationType', settings.simulationType);
  }, [settings.aiProvider, settings.aiModel, settings.simulationType]);

  // Persistence for API Key (Per Provider)
  useEffect(() => {
    localStorage.setItem(`apiKeyOverride_${settings.aiProvider}`, settings.apiKeyOverride);
  }, [settings.apiKeyOverride, settings.aiProvider]);

  // Validate AI Model on load/change (fix for persisted invalid models)
  useEffect(() => {
    const availableModels = getAvailableModels(settings.aiProvider);
    const isModelValid = availableModels.some(m => m.id === settings.aiModel);

    if (!isModelValid && availableModels.length > 0) {
      console.log(`Resetting invalid model ${settings.aiModel} to ${availableModels[0].id}`);
      dispatchSettings({ type: SETTINGS_ACTIONS.SET_AI_MODEL, payload: availableModels[0].id });
    }
  }, [settings.aiProvider, settings.aiModel]);

  // Clear AI error when switching calculation modes
  useEffect(() => {
    setAiError(null);
  }, [settings.calculationMode]);

  // Debounce inputs for heavy calculations (300ms delay)
  const debouncedInputs = useDebouncedValue(inputs, 300);

  // Standard Mathematical Calculation & Simulation
  useEffect(() => {
    const age = parseFloat(debouncedInputs.currentAge);
    const retirementStart = parseFloat(debouncedInputs.retirementStartAge);
    const retirementEnd = parseFloat(debouncedInputs.retirementEndAge);

    // Basic validation to prevent obviously broken inputs
    if (
      !isNaN(age) && age >= 0 && age <= 120 &&
      !isNaN(retirementStart) && retirementStart >= 0 && retirementStart <= 120 &&
      !isNaN(retirementEnd) && retirementEnd >= 0 && retirementEnd <= 120
    ) {
      try {
        // Clear validation error on successful calculation
        setValidationError(null);

        const projection = calculateRetirementProjection(debouncedInputs, t);
        setResults(projection);

        // Handle Simulation Mode
        // Also auto-trigger Monte Carlo for Dynamic strategy even in mathematical mode
        const isDynamicStrategy = debouncedInputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.DYNAMIC;
        if (settings.calculationMode === 'simulations' || settings.calculationMode === 'compare' || isDynamicStrategy) {
          // Only calculate if inputs or type changed, or if we don't have results yet
          // Use JSON.stringify for deep equality check instead of reference comparison
          const currentInputsStr = JSON.stringify(debouncedInputs);
          const lastInputsStr = lastSimInputs.current ? JSON.stringify(lastSimInputs.current) : null;

          const shouldUpdate =
            !simulationResults ||
            currentInputsStr !== lastInputsStr ||
            lastSimType.current !== settings.simulationType;

          if (shouldUpdate) {
            const simResult = calculateSimulation(debouncedInputs, settings.simulationType);
            setSimulationResults(simResult);
            lastSimInputs.current = debouncedInputs;
            lastSimType.current = settings.simulationType;
          }
        }
        // We intentionally DO NOT clear simulationResults here so they persist when switching modes
      } catch (error) {
        // Catch validation errors from calculator and display to user
        console.error('Calculation error:', error);
        setValidationError(error.message);
        setResults(null); // Clear results when there's a validation error
      }
    } else {
      // Clear results when basic age validation fails
      setValidationError(null); // Don't show error for incomplete inputs
      setResults(null);
    }
  }, [debouncedInputs, settings.calculationMode, settings.simulationType, language]);

  // Mark inputs as changed when they change
  useEffect(() => {
    setAiInputsChanged(true);
  }, [inputs, settings.aiProvider, settings.aiModel, settings.apiKeyOverride]);

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
        results: calculateRetirementProjection(profile.data, t)
      };
    }).filter(Boolean);
  }, [selectedProfileIds, profiles]);

  // Helper to format rate limit messages
  const formatLimitMessage = (limitCheck) => {
    if (!limitCheck || limitCheck.allowed) return null;

    const { reason, resetTime, current, limit } = limitCheck;

    if (reason === 'minute') {
      const secondsLeft = Math.ceil((resetTime.getTime() - Date.now()) / 1000);
      return t('rateLimitMinute').replace('{seconds}', secondsLeft);
    } else if (reason === 'hour') {
      const timeStr = resetTime.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' });
      return t('rateLimitHour').replace('{limit}', limit).replace('{time}', timeStr);
    } else if (reason === 'day') {
      return t('rateLimitDay').replace('{limit}', limit);
    }

    return t('rateLimitReached');
  };

  // Manual AI Calculation Handler
  const handleAiCalculate = async () => {
    // Check rate limit BEFORE calling API
    const limitCheck = checkRateLimit();
    if (!limitCheck.allowed) {
      const message = formatLimitMessage(limitCheck);
      setAiError(message);
      return;
    }

    setAiLoading(true);
    setAiError(null);
    try {
      const result = await calculateRetirementWithAI(inputs, settings.aiProvider, settings.aiModel, settings.apiKeyOverride, results, t);

      // Record successful call
      recordCall(settings.aiProvider, settings.aiModel);

      setAiResults(result);
      setAiInputsChanged(false);
    } catch (error) {
      console.error("AI Error:", error);
      // Error message is already translated by the AI calculator
      setAiError(error.message || t('unknownError'));
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
            <ThemeToggle t={t} />
            <button
              onClick={() => setShowModelsManager(true)}
              className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg backdrop-blur-sm transition-colors text-sm h-10"
              title={t('manageModels')}
            >
              <Settings size={18} />
            </button>
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

              // Settings Props
              calculationMode={settings.calculationMode}
              setCalculationMode={(mode) => dispatchSettings({ type: 'SET_CALCULATION_MODE', payload: mode })}
              aiProvider={settings.aiProvider}
              setAiProvider={(provider) => dispatchSettings({ type: 'SET_AI_PROVIDER', payload: provider })}
              aiModel={settings.aiModel}
              setAiModel={(model) => dispatchSettings({ type: 'SET_AI_MODEL', payload: model })}
              apiKeyOverride={settings.apiKeyOverride}
              setApiKeyOverride={(key) => dispatchSettings({ type: 'SET_API_KEY_OVERRIDE', payload: key })}
              simulationType={settings.simulationType}
              setSimulationType={(type) => dispatchSettings({ type: 'SET_SIMULATION_TYPE', payload: type })}
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
              {validationError && (
                <div className="bg-red-900/50 border border-red-500 rounded-xl p-4 mb-4 text-white">
                  <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{language === 'he' ? 'שגיאת קלט' : 'Input Error'}</span>
                  </h3>
                  <div className="text-red-200 whitespace-pre-line">
                    {validationError}
                  </div>
                </div>
              )}
              {results && (
                <ResultsDashboard
                  results={results}
                  inputs={inputs}
                  t={t}
                  language={language}

                  // Settings Props
                  calculationMode={settings.calculationMode}
                  aiResults={aiResults}
                  simulationResults={simulationResults}
                  aiLoading={aiLoading}
                  aiError={aiError}
                  simulationType={settings.simulationType}
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

      {/* Models Manager Modal */}
      {showModelsManager && (
        <ModelsManager
          apiKeys={{
            gemini: settings.apiKeyOverride || import.meta.env.VITE_GEMINI_API_KEY,
            openai: import.meta.env.VITE_OPENAI_API_KEY,
            anthropic: import.meta.env.VITE_ANTHROPIC_API_KEY
          }}
          onClose={() => setShowModelsManager(false)}
          onModelsUpdated={() => {
            // Trigger refresh of models list by changing key
            setModelsRefreshKey(prev => prev + 1);
          }}
          t={t}
        />
      )}
    </div>
  );
}

export default App;
