
import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import InputForm from './components/InputForm';
// ResultsDashboard is lazy-loaded below with ModelsManager
import { ProfileManager } from './components/ProfileManager';
import { calculateRetirementWithAI } from './utils/ai-calculator';
import { getAvailableModels } from './config/ai-models';
import { translations } from './utils/translations';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { UserMenu } from './components/UserMenu';
import { ThemeToggle } from './components/ThemeToggle';
import { LoginPage } from './components/LoginPage';
import { ZoomToggle } from './components/ZoomToggle';
import ErrorBoundary from './components/common/ErrorBoundary';
import { IdleWarningModal } from './components/IdleWarningModal';
import { ChatWidget } from './components/ChatWidget';
import { useIdleTimer } from './hooks/useIdleTimer';

// Lazy-loaded components (loaded only when needed)
const ResultsDashboard = React.lazy(() => import('./components/ResultsDashboard').then(m => ({ default: m.ResultsDashboard })));
const ModelsManager = React.lazy(() => import('./components/ModelsManager').then(m => ({ default: m.ModelsManager })));

// Preload ResultsDashboard chunk on first user interaction
let _preloaded = false;
const preloadResultsDashboard = () => {
  if (_preloaded) return;
  _preloaded = true;
  import('./components/ResultsDashboard');
};

// Hooks
import { useProfiles } from './hooks/useProfiles';
import { useRateLimit } from './hooks/useRateLimit';
import { useAppSettings } from './hooks/useAppSettings';
import { useRetirementData } from './hooks/useRetirementData';
import { useCalculation } from './hooks/useCalculation';
import { useSimulationWorker } from './hooks/useSimulationWorker';
import { useDeepCompareMemo } from './hooks/useDeepCompare';

import { WITHDRAWAL_STRATEGIES } from './constants';
import { getUserSettings } from './utils/db';
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
  const { currentUser, logout } = useAuth();
  const { theme } = useTheme();
  const [language, setLanguage] = useState('he');
  // Wrap t in useCallback to prevent it from changing on every render
  const t = React.useCallback((key) => translations[language][key] || key, [language]);

  // Use Custom Hooks for Logic
  const { settings, dispatch: dispatchSettings, SETTINGS_ACTIONS } = useAppSettings();

  // Idle auto-logout
  const { warningActive, secondsLeft, resetTimer } = useIdleTimer({
    timeoutMinutes: settings.idleTimeoutMinutes ?? 5,
    onLogout: logout,
    enabled: !!currentUser && (settings.idleTimeoutEnabled ?? true),
  });
  const { inputs, setInputs, saveGlobalPension } = useRetirementData();

  // Core calculation pipeline (projection, goal-seek, simulation)
  const {
    results,
    simulationResults,
    validationError,
    simulationError,
    dismissSimulationError,
    goalSeekWithdrawal,
    memoizedDebouncedInputs
  } = useCalculation(inputs, settings);

  // Separate worker instance for profile comparison projections (keeps the main
  // calculation worker free and moves profile work off the main thread).
  const { runProjection: runProfileProjection } = useSimulationWorker();

  const [aiResults, setAiResults] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiInputsChanged, setAiInputsChanged] = useState(true);
  const [selectedProfileIds, setSelectedProfileIds] = useState([]);

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

  const handleUpdateFiscalData = useCallback((data) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_FISCAL_DATA, payload: data }), [dispatchSettings]);
  const aiAbortRef = useRef(null);

  // UI State
  const [showModelsManager, setShowModelsManager] = useState(false);

  // Helper to format rate limit messages
  const formatLimitMessage = useCallback((limitCheck) => {
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
  }, [t, language]);

  // Validate AI Model on load/change (fix for persisted invalid models)
  useEffect(() => {
    const availableModels = getAvailableModels(settings.aiProvider, settings.aiModelsOverride);
    const isModelValid = availableModels.some(m => m.id === settings.aiModel);

    if (!isModelValid && availableModels.length > 0) {

      dispatchSettings({ type: SETTINGS_ACTIONS.SET_AI_MODEL, payload: availableModels[0].id });
    }
  }, [settings.aiProvider, settings.aiModel, settings.aiModelsOverride]);

  // Clear AI error when switching calculation modes
  useEffect(() => {
    setAiError(null);
  }, [settings.calculationMode]);

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
  }, [inputs.retirementStartAge, inputs.retirementEndAge, inputs.currentAge, inputs.birthdate, setInputs]);

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

  // Stable reference for selected profiles' calculation data (avoids recalculation on rename)
  const selectedProfilesData = useDeepCompareMemo(
    selectedProfileIds.map(id => {
      const p = profiles.find(pr => pr.id === id);
      return p ? { id: p.id, data: p.data } : null;
    }).filter(Boolean)
  );

  // Profile projections run off the main thread via the worker, sequentially.
  // Only re-runs when profile data actually changes (not on rename).
  const [profileCalcResults, setProfileCalcResults] = useState({});
  useEffect(() => {
    if (selectedProfilesData.length === 0) {
      setProfileCalcResults({});
      return;
    }
    const collected = {};
    let i = 0;
    function runNext() {
      if (i >= selectedProfilesData.length) {
        setProfileCalcResults(collected);
        return;
      }
      const { id, data } = selectedProfilesData[i++];
      runProfileProjection(
        data,
        ({ projection }) => { collected[id] = projection; runNext(); },
        () => { runNext(); } // skip profiles with invalid data
      );
    }
    runNext();
  }, [selectedProfilesData, runProfileProjection]);

  // Assemble with current names (cheap - re-runs freely on rename)
  const profileResults = useMemo(() => {
    return selectedProfileIds
      .map(id => {
        const calc = profileCalcResults[id];
        if (!calc) return null;
        const profile = profiles.find(p => p.id === id);
        return { id, name: profile?.name || id, results: calc };
      })
      .filter(Boolean);
  }, [selectedProfileIds, profiles, profileCalcResults]);

  // Manual AI Calculation Handler
  const handleAiCalculate = useCallback(async () => {
    // Check rate limit BEFORE calling API
    const limitCheck = checkRateLimit();
    if (!limitCheck.allowed) {
      const message = formatLimitMessage(limitCheck);
      setAiError(message);
      return;
    }

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    setAiLoading(true);
    setAiError(null);
    try {
      const result = await calculateRetirementWithAI(inputs, settings.aiProvider, settings.aiModel, settings.apiKeyOverride, results, t, { signal: controller.signal });

      // Record successful call
      recordCall(settings.aiProvider, settings.aiModel);

      setAiResults(result);
      setAiInputsChanged(false);
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error("AI Error:", error);
      // Error message is already translated by the AI calculator
      setAiError(error.message || t('unknownError'));
    } finally {
      setAiLoading(false);
    }
  }, [checkRateLimit, formatLimitMessage, inputs, settings.aiProvider, settings.aiModel, settings.apiKeyOverride, results, recordCall, t]);

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
          <div className="lg:col-span-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-xl flex flex-col relative z-20 h-full" onFocus={preloadResultsDashboard} onPointerEnter={preloadResultsDashboard}>
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
              onSaveGlobalPension={saveGlobalPension}
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
              goalSeekWithdrawal={goalSeekWithdrawal}

              // Settings Props
              calculationMode={settings.calculationMode}
              setCalculationMode={(mode) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_CALCULATION_MODE, payload: mode })}
              aiProvider={settings.aiProvider}
              setAiProvider={(provider) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_AI_PROVIDER, payload: provider })}
              aiModel={settings.aiModel}
              setAiModel={(model) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_AI_MODEL, payload: model })}
              apiKeyOverride={settings.apiKeyOverride}
              setApiKeyOverride={(key) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_API_KEY_OVERRIDE, payload: key })}
              aiModelsOverride={settings.aiModelsOverride}
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
              profiles={profiles}
              updateProfile={updateProfile}
              currentProfileId={lastLoadedProfileId}
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
              {simulationError && (
                <div className="bg-yellow-900/50 border border-yellow-500 rounded-xl p-4 mb-4 text-white">
                  <h3 className="text-lg font-bold mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span>⚠️</span>
                      <span>{language === 'he' ? 'שגיאת סימולציה' : 'Simulation Error'}</span>
                    </div>
                    <button onClick={dismissSimulationError} className="text-yellow-300 hover:text-white transition-colors text-lg leading-none">✕</button>
                  </h3>
                  <div className="text-yellow-200 whitespace-pre-line">
                    {simulationError}
                  </div>
                </div>
              )}
              {results && (
                <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div></div>}>
                  <ResultsDashboard
                    results={results}
                    inputs={memoizedDebouncedInputs}
                    setInputs={setInputs}
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

                    // Global Fiscal Settings
                    fiscalParameters={settings.fiscalParameters}
                    familyStatus={settings.familyStatus}
                    onUpdateFiscalData={handleUpdateFiscalData}

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
                </Suspense>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Chat Widget */}
      <ChatWidget
        inputs={inputs}
        results={results}
        language={language}
        aiProvider={settings.aiProvider}
        aiModel={settings.aiModel}
        apiKeyOverride={settings.apiKeyOverride}
      />

      {/* Idle Warning Modal */}
      {warningActive && (
        <IdleWarningModal
          secondsLeft={secondsLeft}
          onStayLoggedIn={resetTimer}
          language={language}
        />
      )}

      {/* Models Manager Modal */}
      {showModelsManager && (
        <ErrorBoundary t={t}>
          <Suspense fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          }>
            <ModelsManager
              apiKeys={{
                gemini: (settings.aiProvider === 'gemini' ? settings.apiKeyOverride : null) || settings.apiKeys?.gemini || import.meta.env.VITE_GEMINI_API_KEY,
                openai: (settings.aiProvider === 'openai' ? settings.apiKeyOverride : null) || settings.apiKeys?.openai || import.meta.env.VITE_OPENAI_API_KEY,
                anthropic: (settings.aiProvider === 'anthropic' ? settings.apiKeyOverride : null) || settings.apiKeys?.anthropic || import.meta.env.VITE_ANTHROPIC_API_KEY
              }}
              onClose={() => setShowModelsManager(false)}
              onModelsUpdated={() => {
                // Force app to reload overrides from DB
                if (currentUser?.uid) {
                  getUserSettings(currentUser.uid).then(db => {
                    if (db) dispatchSettings({ type: SETTINGS_ACTIONS.LOAD_FROM_DB, payload: db });
                  });
                }
              }}
              t={t}
              language={language}
              uid={currentUser?.uid}
              idleTimeoutEnabled={settings.idleTimeoutEnabled ?? true}
              onIdleTimeoutEnabledChange={v => dispatchSettings({ type: SETTINGS_ACTIONS.SET_IDLE_TIMEOUT_ENABLED, payload: v })}
              idleTimeoutMinutes={settings.idleTimeoutMinutes ?? 5}
              onIdleTimeoutChange={v => dispatchSettings({ type: SETTINGS_ACTIONS.SET_IDLE_TIMEOUT, payload: v })}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}

export default App;
