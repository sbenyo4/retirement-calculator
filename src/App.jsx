
import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import InputForm from './components/InputForm';
import { ResultsDashboard } from './components/ResultsDashboard';
import { ProfileManager } from './components/ProfileManager';
import { calculateRetirementProjection } from './utils/calculator';
import { calculateRetirementWithAI } from './utils/ai-calculator';
import { getAvailableModels } from './config/ai-models';
import { calculateSimulation } from './utils/simulation-calculator';
import { translations } from './utils/translations';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { UserMenu } from './components/UserMenu';
import { ThemeToggle } from './components/ThemeToggle';
import { LoginPage } from './components/LoginPage';
import { ZoomToggle } from './components/ZoomToggle';
import ErrorBoundary from './components/common/ErrorBoundary';

// Lazy-loaded components (loaded only when needed)
const ModelsManager = React.lazy(() => import('./components/ModelsManager').then(m => ({ default: m.ModelsManager })));

// Hooks
import { useProfiles } from './hooks/useProfiles';
import { useDebouncedValue } from './hooks/useDebounce';
import { useRateLimit } from './hooks/useRateLimit';
import { useDeepCompareMemo } from './hooks/useDeepCompare';
import { useAppSettings } from './hooks/useAppSettings';
import { useRetirementData } from './hooks/useRetirementData';

import { WITHDRAWAL_STRATEGIES } from './constants';
import { Settings } from 'lucide-react';

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
  const { theme } = useTheme();
  const [language, setLanguage] = useState('he');
  // Wrap t in useCallback to prevent it from changing on every render
  const t = React.useCallback((key) => translations[language][key] || key, [language]);

  // Use Custom Hooks for Logic
  const { settings, dispatch: dispatchSettings, SETTINGS_ACTIONS } = useAppSettings();
  const { inputs, setInputs } = useRetirementData();

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
  // Note: profilesLoaded is available but not currently used
  const { profiles, saveProfile, updateProfile, renameProfile, deleteProfile, lastLoadedProfileId, markProfileAsLoaded } = useProfiles();

  // Rate limiting hook
  const {
    checkRateLimit,
    recordCall,
  } = useRateLimit(currentUser?.uid || 'guest');

  // UI State
  const [showModelsManager, setShowModelsManager] = useState(false);
  const [, setModelsRefreshKey] = useState(0);

  // Refs
  const lastSimInputs = useRef(null);
  const lastSimType = useRef(null);

  // Helper to format rate limit messages
  const formatLimitMessage = (limitCheck) => {
    if (!limitCheck || limitCheck.allowed) return null;
    const { reason, resetTime, limit } = limitCheck;
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

  // Use deep comparison memo for efficient change detection (replaces JSON.stringify)
  const memoizedDebouncedInputs = useDeepCompareMemo(debouncedInputs);

  // Standard Mathematical Calculation & Simulation
  useEffect(() => {
    const age = parseFloat(debouncedInputs.currentAge);
    const retirementStart = parseFloat(debouncedInputs.retirementStartAge);
    const retirementEnd = parseFloat(debouncedInputs.retirementEndAge);

    // Basic validation to prevent obviously broken inputs
    // Include age sequence validation to prevent console errors during profile loading
    if (
      !isNaN(age) && age >= 0 && age <= 120 &&
      !isNaN(retirementStart) && retirementStart >= 0 && retirementStart <= 120 &&
      !isNaN(retirementEnd) && retirementEnd >= 0 && retirementEnd <= 120 &&
      retirementStart > age && retirementEnd > retirementStart
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
          // Use deep comparison for efficient change detection
          const shouldUpdate =
            !simulationResults ||
            lastSimInputs.current !== memoizedDebouncedInputs ||
            lastSimType.current !== settings.simulationType;

          if (shouldUpdate) {
            const simResult = calculateSimulation(debouncedInputs, settings.simulationType);
            setSimulationResults(simResult);
            lastSimInputs.current = memoizedDebouncedInputs;
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
  }, [debouncedInputs, memoizedDebouncedInputs, settings.calculationMode, settings.simulationType, language]);

  // Mark inputs as changed when they change
  useEffect(() => {
    setAiInputsChanged(true);
  }, [inputs, settings.aiProvider, settings.aiModel, settings.apiKeyOverride]);

  // Effect to update linked events when retirement ages change
  useEffect(() => {
    setInputs(prev => {
      const { currentAge, retirementStartAge, retirementEndAge, birthdate, lifeEvents } = prev;

      if (!lifeEvents || lifeEvents.length === 0) return prev;

      // Calculate birth month and year accurately
      let birthMonth, birthYear;
      const now = new Date();
      const currentYear = now.getFullYear();

      if (birthdate) {
        const bd = new Date(birthdate);
        birthYear = bd.getFullYear();
        birthMonth = bd.getMonth() + 1;
      } else {
        // Infer based on current age
        const currentMonth = now.getMonth() + 1;
        const ageFraction = parseFloat(currentAge) % 1;
        const monthsPassed = Math.round(ageFraction * 12);
        let bm = currentMonth - monthsPassed;
        if (bm <= 0) bm += 12;
        birthMonth = bm;
        birthYear = Math.floor(currentYear - parseFloat(currentAge));
      }

      let hasChanges = false;
      const newEvents = lifeEvents.map(event => {
        if (!event.linkedTo) return event;

        let targetAge;
        if (event.linkedTo === 'retirementStart') targetAge = parseFloat(retirementStartAge);
        else if (event.linkedTo === 'retirementEnd') targetAge = parseFloat(retirementEndAge);
        else return event;

        if (isNaN(targetAge)) return event;

        const newYear = Math.floor(birthYear + targetAge);
        const newMonth = birthMonth;

        // Check if change needed
        if (event.startDate.year !== newYear || event.startDate.month !== newMonth) {
          hasChanges = true;
          return {
            ...event,
            startDate: { year: newYear, month: newMonth }
          };
        }
        return event;
      });

      if (hasChanges) {
        return { ...prev, lifeEvents: newEvents };
      }
      return prev;
    });
  }, [inputs.retirementStartAge, inputs.retirementEndAge, inputs.currentAge, inputs.birthdate]);

  // Sync selected selectedProfileIds with available profiles (cleanup deleted profiles)
  useEffect(() => {
    setSelectedProfileIds(prev => prev.filter(id => profiles.some(p => p.id === id)));
  }, [profiles]);

  // AI Insights Persistence (Lifted State)
  const [aiInsightsData, setAiInsightsData] = useState(null);

  // Clear AI Insights when inputs change
  useEffect(() => {
    setAiInsightsData(null);
  }, [memoizedDebouncedInputs]);

  // Calculate results for selected profiles - memoized for performance
  const profileResults = useMemo(() => {
    return selectedProfileIds.map(id => {
      const profile = profiles.find(p => p.id === id);
      if (!profile) return null;
      try {
        return {
          id: profile.id,
          name: profile.name,
          results: calculateRetirementProjection(profile.data, t)
        };
      } catch {
        // Skip profiles with invalid data silently
        return null;
      }
    }).filter(Boolean);
  }, [selectedProfileIds, profiles]);

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

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'he' : 'en');
  };

  if (!currentUser) {
    return <LoginPage t={t} />;
  }

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'bg-slate-100' : 'bg-gradient-to-br from-gray-900 to-blue-900'} p-2 md:p-4`} dir={translations[language].dir}>
      <div className="max-w-7xl mx-auto">
        <header className="mb-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className={`text-4xl font-bold mb-2 tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
              {t('appTitle')}
            </h1>
            <p className={`text-lg ${theme === 'light' ? 'text-blue-600' : 'text-blue-200'}`}>
              {t('appSubtitle')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <UserMenu t={t} />
            <ThemeToggle t={t} />
            <ZoomToggle />
            <button
              onClick={() => setShowModelsManager(true)}
              className={`px-3 py-2 rounded-lg backdrop-blur-sm transition-colors text-sm h-10 ${theme === 'light' ? 'bg-white border border-gray-200 text-slate-700 hover:bg-gray-50 shadow-sm' : 'bg-white/10 hover:bg-white/20 text-white'}`}
              title={t('manageModels')}
            >
              <Settings size={18} />
            </button>
            <button
              onClick={toggleLanguage}
              className={`px-4 py-2 rounded-lg backdrop-blur-sm transition-colors font-medium h-10 ${theme === 'light' ? 'bg-white border border-gray-200 text-slate-700 hover:bg-gray-50 shadow-sm' : 'bg-white/10 hover:bg-white/20 text-white'}`}
            >
              {language === 'en' ? '🇮🇱 Hebrew' : '🇺🇸 English'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-xl flex flex-col relative z-20 h-full">
            <ProfileManager
              currentInputs={inputs}
              onLoad={setInputs}
              t={t}
              language={language}
              profiles={profiles}
              onSaveProfile={saveProfile}
              onUpdateProfile={updateProfile}
              onRenameProfile={renameProfile}
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
              results={results}

              // Settings Props
              calculationMode={settings.calculationMode}
              setCalculationMode={(mode) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_CALCULATION_MODE, payload: mode })}
              aiProvider={settings.aiProvider}
              setAiProvider={(provider) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_AI_PROVIDER, payload: provider })}
              aiModel={settings.aiModel}
              setAiModel={(model) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_AI_MODEL, payload: model })}
              apiKeyOverride={settings.apiKeyOverride}
              setApiKeyOverride={(key) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_API_KEY_OVERRIDE, payload: key })}
              simulationType={settings.simulationType}
              setSimulationType={(type) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_SIMULATION_TYPE, payload: type })}
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
                  aiProvider={settings.aiProvider}
                  aiModel={settings.aiModel}
                  apiKeyOverride={settings.apiKeyOverride}
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

                  // AI Insights Props (Lifted State)
                  aiInsightsData={aiInsightsData}
                  setAiInsightsData={setAiInsightsData}
                />
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Models Manager Modal */}
      {showModelsManager && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        }>
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
            language={language}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
