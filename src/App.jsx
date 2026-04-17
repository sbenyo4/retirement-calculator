
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
const RetirementChecklist = React.lazy(() => import('./components/RetirementChecklist'));

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
import { useDeepCompareMemo } from './hooks/useDeepCompare';
import { normalizeInputs } from './utils/profileUtils';
import { runProjectionWithGoalSeek } from './utils/calculators/goalSeek';
import { WITHDRAWAL_STRATEGIES } from './constants';
import { getUserSettings } from './utils/db';
import { Settings, AlertTriangle, Info, X, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { ReminderBell } from './components/ReminderBell';
import { ReminderAlert } from './components/ReminderAlert';
import { GlobalRemindersSync } from './components/GlobalRemindersSync';
import { BudgetRemindersSync } from './components/BudgetRemindersSync';

const isLifeEventSource = (source) =>
  typeof source === 'string' && (source === 'lifeEvents' || source.startsWith('lifeEvents:'));

// Pure function — no closure over component state.
// Strips pension sources (global, not per-profile) and pensionInterestRate so the hash
// matches between profile-load (profile.data has no pension) and live form data (has pension).
function computeInsightsHash(inputs) {
  if (!inputs) return '';
  const { language, fourPercentMode, pensionIncomeSources, pensionInterestRate, ...formData } = inputs;
  return JSON.stringify({ ...normalizeInputs(formData), language, fourPercentMode });
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
  const { currentUser, logout } = useAuth();
  const { theme } = useTheme();
  const [language, setLanguage] = useState('he');
  const t = React.useCallback((key) => translations[language][key] || key, [language]);
  const buildLifeEventReminderDate = useCallback((year, month) =>
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
  , []);

  // Use Custom Hooks for Logic
  const { settings, dispatch: dispatchSettings, SETTINGS_ACTIONS, settingsLoaded } = useAppSettings();

  const [chatOpen, setChatOpen] = useState(false);
  const [triggeredSmartAlerts, setTriggeredSmartAlerts] = useState([]);

  // Alert bar carousel
  const alertsScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateAlertArrows = useCallback(() => {
    const el = alertsScrollRef.current;
    if (!el) return;
    const sl = el.scrollLeft;
    const max = el.scrollWidth - el.clientWidth;
    if (language === 'he') {
      // RTL: scrollLeft=0 at right (start), goes negative toward left
      setCanScrollLeft(sl > -(max - 1));  // more content hidden to the left
      setCanScrollRight(sl < -1);          // scrolled left, can return right
    } else {
      setCanScrollLeft(sl > 1);
      setCanScrollRight(sl < max - 1);
    }
  }, [language]);

  const scrollAlerts = useCallback((dir) => {
    alertsScrollRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const handle = (e) => setTriggeredSmartAlerts(e.detail?.triggered || []);
    window.addEventListener('rc-smart-alerts-triggered', handle);
    return () => window.removeEventListener('rc-smart-alerts-triggered', handle);
  }, []);

  // Idle auto-logout
  const { warningActive, secondsLeft, resetTimer } = useIdleTimer({
    timeoutMinutes: settings.idleTimeoutMinutes ?? 5,
    onLogout: logout,
    enabled: !!currentUser && (settings.idleTimeoutEnabled ?? true),
  });
  const { inputs, setInputs, saveGlobalPension, inputsLoaded } = useRetirementData();

  // Core calculation pipeline (projection, goal-seek, simulation)
  const {
    results,
    simulationResults,
    validationError,
    simulationError,
    dismissSimulationError,
    goalSeekWithdrawal,
    memoizedDebouncedInputs
  } = useCalculation(React.useMemo(() => ({ ...inputs, language, fourPercentMode: settings.fourPercentMode }), [inputs, language, settings.fourPercentMode]), settings);

  // Sync calculation results to sessionStorage so smart alerts can read them
  useEffect(() => {
    if (!results) return;
    try {
      const inp = memoizedDebouncedInputs || {};
      const currentAge = parseFloat(inp.currentAge) || null;
      const retirementStartAge = parseFloat(inp.retirementStartAge) || null;
      const yearsToRetirement = (currentAge && retirementStartAge && retirementStartAge > currentAge)
        ? retirementStartAge - currentAge : null;
      const retirementDate = yearsToRetirement
        ? new Date(Date.now() + yearsToRetirement * 365.25 * 24 * 3600 * 1000).toISOString()
        : null;
      sessionStorage.setItem('rc-calc-summary', JSON.stringify({
        balanceAtRetirement: results.balanceAtRetirement ?? null,
        balanceAtEnd: results.balanceAtEnd ?? null,
        surplus: results.surplus ?? null,
        pvOfDeficit: results.pvOfDeficit ?? null,
        pvOfCapitalPreservation: results.pvOfCapitalPreservation ?? null,
        ranOutAtAge: results.ranOutAtAge ?? null,
        requiredCapitalAtRetirement: results.requiredCapitalAtRetirement ?? null,
        requiredCapitalForPerpetuity: results.requiredCapitalForPerpetuity ?? null,
        initialNetWithdrawal: results.initialNetWithdrawal ?? null,
        averageNetWithdrawal: results.averageNetWithdrawal ?? null,
        maxSustainableNetWithdrawal: results.maxSustainableNetWithdrawal ?? null,
        // Pension income at NI start age (67)
        pensionGrossAtNI: results.incomeAtNIStart?.totalGross ?? null,
        pensionNetAtNI: results.incomeAtNIStart?.totalNet ?? null,
        pensionNonWorkAtNI: results.incomeAtNIStart?.nonWorkIncome ?? null,
        niThreshold: results.niThreshold ?? null,
        // Inputs
        monthlyNetIncomeDesired: parseFloat(inp.monthlyNetIncomeDesired) || 0,
        retirementStartAge,
        retirementEndAge: parseFloat(inp.retirementEndAge) || null,
        currentAge,
        monthlyContribution: parseFloat(inp.monthlyContribution) || 0,
        retirementDate,
      }));
      window.dispatchEvent(new Event('rc-calc-updated'));
    } catch {}
  }, [results, memoizedDebouncedInputs]);

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
  const { profiles, saveProfile, updateProfile, renameProfile, deleteProfile, lastLoadedProfileId, markProfileAsLoaded, updateProfileInsights } = useProfiles();
  const [activeProfileId, setActiveProfileId] = useState(lastLoadedProfileId || null);

  useEffect(() => {
    setActiveProfileId(lastLoadedProfileId || null);
  }, [lastLoadedProfileId]);

  // Rate limiting hook
  const {
    checkRateLimit,
    recordCall,
  } = useRateLimit(currentUser?.uid || 'guest');

  const handleUpdateFiscalData = useCallback((data) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_FISCAL_DATA, payload: data }), [dispatchSettings]);
  const aiAbortRef = useRef(null);

  // UI State
  const [showModelsManager, setShowModelsManager] = useState(false);
  // Close settings when user session changes (login/logout)
  useEffect(() => { setShowModelsManager(false); }, [currentUser?.uid]);

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

  // Handle navigation from reminders to items
  useEffect(() => {
    const handleNav = (e) => {
        const { source, id } = e.detail;
        if (source === 'checklist') {
            if (settings.calculationMode !== 'planning') {
                 dispatchSettings({ type: SETTINGS_ACTIONS.SET_CALCULATION_MODE, payload: 'planning' });
            }
            setTimeout(() => window.dispatchEvent(new CustomEvent('rc-scroll-to-checklist-item', { detail: { id } })), 100);
        } else if (isLifeEventSource(source)) {
            if (settings.activeView !== 'events') {
                 dispatchSettings({ type: SETTINGS_ACTIONS.SET_ACTIVE_VIEW, payload: 'events' });
            }
            setTimeout(() => window.dispatchEvent(new CustomEvent('rc-open-life-event', { detail: { id } })), 150);
        } else if (source === 'budget') {
            if (settings.calculationMode === 'planning') {
                 dispatchSettings({ type: SETTINGS_ACTIONS.SET_CALCULATION_MODE, payload: 'mathematical' });
            }
            setTimeout(() => {
                window.dispatchEvent(new Event('rc-open-budget-tab'));
                setTimeout(() => window.dispatchEvent(new CustomEvent('rc-scroll-to-budget-item', { detail: { id } })), 200);
            }, 100);
        }
    };
    window.addEventListener('rc-navigate-to-item', handleNav);
    return () => window.removeEventListener('rc-navigate-to-item', handleNav);
  }, [settings.calculationMode, settings.activeView, dispatchSettings, SETTINGS_ACTIONS]);

  useEffect(() => {
    const handleLifeEventReminderConfirm = (e) => {
      const { id, source } = e.detail || {};
      if (!isLifeEventSource(source)) return;

      setInputs(prev => {
        const lifeEvents = prev.lifeEvents || [];
        let hasChanges = false;

        const nextLifeEvents = lifeEvents.map(event => {
          if (String(event.id) !== String(id) || !event.reminder) return event;
          hasChanges = true;
          return { ...event, reminder: null };
        });

        return hasChanges ? { ...prev, lifeEvents: nextLifeEvents } : prev;
      });
    };

    window.addEventListener('rc-reminder-confirmed', handleLifeEventReminderConfirm);
    return () => window.removeEventListener('rc-reminder-confirmed', handleLifeEventReminderConfirm);
  }, [setInputs]);

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
            startDate: { year: newYear, month: newMonth },
            reminder: event.reminder
              ? { ...event.reminder, date: buildLifeEventReminderDate(newYear, newMonth) }
              : event.reminder
          };
        }
        return event;
      });

      if (hasChanges) {
        return { ...prev, lifeEvents: newEvents };
      }
      return prev;
    });
  // Use debounced values so this fires once after the user stops typing, not on every keystroke.
  }, [memoizedDebouncedInputs.retirementStartAge, memoizedDebouncedInputs.retirementEndAge, memoizedDebouncedInputs.currentAge, memoizedDebouncedInputs.birthdate, setInputs, buildLifeEventReminderDate]);

  // Sync selected selectedProfileIds with available profiles (cleanup deleted profiles)
  useEffect(() => {
    setSelectedProfileIds(prev => prev.filter(id => profiles.some(p => p.id === id)));
  }, [profiles]);

  // AI Insights — hash-based session cache: computeInsightsHash(inputs) → insights object.
  // The cache ref never triggers re-renders; React state (aiInsightsData) drives the UI.
  const [aiInsightsData, setAiInsightsData] = useState(null);
  const insightsCacheRef = useRef({});

  // When debounced inputs change: restore cached insights or clear.
  // Idempotent (pure lookup) → safe in React StrictMode.
  useEffect(() => {
    setAiInsightsData(insightsCacheRef.current[computeInsightsHash(memoizedDebouncedInputs)] ?? null);
  }, [memoizedDebouncedInputs]);

  // One-time startup: seed cache from the active profile's saved insights.
  // Uses profile.data (not memoizedDebouncedInputs) to avoid the 300ms debounce timing gap.
  const startupInsightsCachedRef = useRef(false);
  useEffect(() => {
    if (startupInsightsCachedRef.current) return;
    if (!inputsLoaded || !activeProfileId) return;
    const profile = profiles.find(p => p.id === activeProfileId);
    if (!profile) return;
    startupInsightsCachedRef.current = true;
    if (profile.aiInsights && profile.data) {
      const hash = computeInsightsHash({ ...profile.data, language, fourPercentMode: settings.fourPercentMode });
      insightsCacheRef.current[hash] = profile.aiInsights;
      setAiInsightsData(profile.aiInsights);
    }
  }, [inputsLoaded, activeProfileId, profiles, language, settings.fourPercentMode]);

  // Called by ProfileManager when loading/reloading a profile.
  // Seeds the cache immediately (no debounce wait) and shows insights right away.
  const handleLoad = useCallback((profileInputs, profileInsights) => {
    if (profileInsights) {
      const hash = computeInsightsHash({ ...profileInputs, language, fourPercentMode: settings.fourPercentMode });
      insightsCacheRef.current[hash] = profileInsights;
      setAiInsightsData(profileInsights);
    } else {
      setAiInsightsData(null);
    }
    setInputs(profileInputs);
  }, [setInputs, language, settings.fourPercentMode]);

  // Save insights to the active profile, update state, and populate the cache.
  const handleSetAiInsights = useCallback((data) => {
    if (data) insightsCacheRef.current[computeInsightsHash(memoizedDebouncedInputs)] = data;
    setAiInsightsData(data);
    if (data && activeProfileId) {
      updateProfileInsights(activeProfileId, data);
    }
  }, [memoizedDebouncedInputs, activeProfileId, updateProfileInsights]);

  // ── Alerts ──────────────────────────────────────────────────────────────
  const disabledAlerts = settings.disabledAlerts || [];
  const toggleAlert = (id) => {
    const next = disabledAlerts.includes(id)
      ? disabledAlerts.filter(a => a !== id)
      : [...disabledAlerts, id];
    dispatchSettings({ type: SETTINGS_ACTIONS.SET_DISABLED_ALERTS, payload: next });
  };

  const alerts = useMemo(() => {
    if (!results || !memoizedDebouncedInputs) return [];
    const inp = memoizedDebouncedInputs;
    const isHe = language === 'he';
    const cur = inp.currency || '₪';
    const retAge = parseFloat(inp.retirementStartAge) || 67;
    const endAge = parseFloat(inp.retirementEndAge) || 85;
    const curAge = parseFloat(inp.currentAge) || 30;
    const desired = parseFloat(inp.monthlyNetIncomeDesired) || 0;
    const list = [];

    // 1. Money runs out before end
    if (results.ranOutAtAge && results.ranOutAtAge < endAge) {
      list.push({
        id: 'ran_out',
        severity: 'critical',
        text: isHe
          ? `הכסף צפוי להיגמר בגיל ${+results.ranOutAtAge.toFixed(2)} — ${Math.round(endAge - results.ranOutAtAge)} שנים לפני סוף התקופה`
          : `Funds run out at age ${+results.ranOutAtAge.toFixed(2)} — ${Math.round(endAge - results.ranOutAtAge)} yrs before end`,
      });
    }

    // 2. Significant capital deficit at retirement
    if (results.surplus != null && results.surplus < 0) {
      const deficit = Math.abs(Math.round(results.surplus));
      list.push({
        id: 'capital_deficit',
        severity: 'critical',
        text: isHe
          ? `חסר הון של ${cur}${deficit.toLocaleString()} ביום הפרישה`
          : `Capital shortfall of ${cur}${deficit.toLocaleString()} at retirement`,
      });
    }

    // 3. Withdrawal significantly below desired
    if (desired > 0 && results.initialNetWithdrawal > 0) {
      const gap = desired - results.initialNetWithdrawal;
      const pct = gap / desired;
      if (pct > 0.1) {
        list.push({
          id: 'withdrawal_gap',
          severity: 'warning',
          text: isHe
            ? `משיכה חודשית נמוכה ב-${cur}${Math.round(gap).toLocaleString()} מהיעד (${Math.round(pct * 100)}%)`
            : `Monthly withdrawal ${cur}${Math.round(gap).toLocaleString()} below target (${Math.round(pct * 100)}%)`,
        });
      }
    }

    // 4. Short planning horizon — suppress if there's a continuous pension income beyond end age
    if (endAge < 85) {
      const pensionSources = inp.pensionIncomeSources || [];
      const hasContinuousIncomeAtEnd = pensionSources.some(s =>
        s.enabled !== false &&
        !s.isLumpSum &&
        (s.startAge == null || s.startAge <= endAge) &&
        (s.endAge == null || s.endAge > endAge)
      );
      if (!hasContinuousIncomeAtEnd) {
        list.push({
          id: 'short_horizon',
          severity: 'info',
          text: isHe
            ? `גיל סיום ${endAge} — שקול להאריך לפחות עד גיל 85`
            : `End age ${endAge} — consider extending to at least 85`,
        });
      }
    }

    // 5. Late retirement start
    if (retAge > 70) {
      list.push({
        id: 'late_retirement',
        severity: 'info',
        text: isHe
          ? `גיל פרישה ${retAge} — תקופת הצבירה קצרה משמעותית`
          : `Retirement at ${retAge} — significantly shorter accumulation period`,
      });
    }

    // 6. Very short time to retirement
    if (retAge - curAge < 5 && retAge > curAge) {
      list.push({
        id: 'near_retirement',
        severity: 'warning',
        text: isHe
          ? `${Math.round(retAge - curAge)} שנים בלבד עד הפרישה — בדוק שהחיסכון מספיק`
          : `Only ${Math.round(retAge - curAge)} years to retirement — verify savings sufficiency`,
      });
    }

    return list.filter(a => !disabledAlerts.includes(a.id));
  }, [results, memoizedDebouncedInputs, language, disabledAlerts]);

  // Recheck scroll arrows whenever the alert list changes
  useEffect(() => {
    const id = setTimeout(updateAlertArrows, 50);
    return () => clearTimeout(id);
  }, [alerts, triggeredSmartAlerts, updateAlertArrows]);
  // ────────────────────────────────────────────────────────────────────────

  // Stable reference for selected profiles' calculation data (avoids recalculation on rename)
  const selectedProfilesData = useDeepCompareMemo(
    selectedProfileIds.map(id => {
      const p = profiles.find(pr => pr.id === id);
      return p ? { id: p.id, data: p.data } : null;
    }).filter(Boolean)
  );

  // Compute selected profile projections in one deterministic pass so
  // compare view always renders all selected profiles side-by-side.
  const profileResults = useMemo(() => {
    const dataById = new Map(selectedProfilesData.map(p => [p.id, p.data]));
    return selectedProfileIds.map(id => {
      const profile = profiles.find(p => p.id === id);
      const data = dataById.get(id);
      if (!data) {
        return { id, name: profile?.name || id, results: null };
      }
      try {
        const { projection } = runProjectionWithGoalSeek(data);
        return { id, name: profile?.name || id, results: projection || null };
      } catch {
        return { id, name: profile?.name || id, results: null };
      }
    });
  }, [selectedProfileIds, selectedProfilesData, profiles]);

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
    <div className={`min-h-screen ${theme === 'light' ? 'bg-slate-100' : 'bg-gradient-to-br from-gray-900 to-blue-900'} p-2 md:p-4 pb-[18px]`} dir={translations[language].dir}>
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className={`text-4xl font-bold mb-2 tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
              {t('appTitle')}
            </h1>
            <p className={`text-lg relative -top-[4px] ${theme === 'light' ? 'text-blue-600' : 'text-blue-200'}`}>
              {t('appSubtitle')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ReminderBell id="reminder-bell" t={t} language={language} isLight={theme === 'light'} activeProfileId={activeProfileId} />
            {settings.aiProvider && (
              <button
                onClick={() => setChatOpen(v => !v)}
                className={`px-3 py-2 rounded-lg backdrop-blur-sm transition-colors text-sm h-10 ${chatOpen ? (theme === 'light' ? 'bg-blue-100 border border-blue-300 text-blue-700 shadow-sm' : 'bg-blue-600/30 text-blue-300') : (theme === 'light' ? 'bg-white border border-gray-200 text-slate-700 hover:bg-gray-50 shadow-sm' : 'bg-white/10 hover:bg-white/20 text-white')}`}
                title={language === 'he' ? 'שאל את היועץ' : 'Ask your advisor'}
              >
                <MessageCircle size={18} />
              </button>
            )}
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

        {/* ── Alert bar — always LTR internally so arrows/scroll are predictable ── */}
        <div className="flex items-center gap-1 py-1" dir="ltr">
          {/* Left arrow */}
          <button
            onClick={() => scrollAlerts(-1)}
            className={`shrink-0 transition-opacity ${canScrollLeft ? 'opacity-60 hover:opacity-100' : 'opacity-0 pointer-events-none'} ${theme === 'light' ? 'text-slate-500' : 'text-white/60'}`}
            aria-hidden={!canScrollLeft}
          >
            <ChevronLeft size={14} />
          </button>

          {/* Scrollable badges — dir switches for RTL so first item is on the right in Hebrew */}
          <div
            ref={alertsScrollRef}
            onScroll={updateAlertArrows}
            dir={language === 'he' ? 'rtl' : 'ltr'}
            className="flex items-center gap-2 flex-1 min-w-0 py-1"
            style={{ overflowX: 'scroll', scrollbarWidth: 'none' }}
          >
            {settingsLoaded && inputsLoaded && alerts.map(alert => (
              <div
                key={alert.id}
                className={`shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${
                  alert.severity === 'critical'
                    ? (theme === 'light' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-red-900/30 border-red-500/50 text-red-300')
                    : alert.severity === 'warning'
                    ? (theme === 'light' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-amber-900/30 border-amber-500/50 text-amber-300')
                    : (theme === 'light' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-blue-900/30 border-blue-500/50 text-blue-300')
                }`}
              >
                {alert.severity === 'critical' ? <AlertTriangle size={11} /> : alert.severity === 'warning' ? <AlertTriangle size={11} /> : <Info size={11} />}
                <span className="whitespace-nowrap">{alert.text}</span>
                <button
                  onClick={() => toggleAlert(alert.id)}
                  className="opacity-50 hover:opacity-100 transition-opacity ms-0.5"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {settingsLoaded && triggeredSmartAlerts.map(alert => (
              <div
                key={`smart-${alert.id}`}
                className={`shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${
                  theme === 'light' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-amber-900/30 border-amber-500/50 text-amber-300'
                }`}
              >
                <AlertTriangle size={11} />
                <span className="whitespace-nowrap">{alert.label}</span>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('rc-smart-alert-disable', { detail: { id: alert.id } }))}
                  className="opacity-50 hover:opacity-100 transition-opacity ms-0.5"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>

          {/* Right arrow (scroll toward end) */}
          <button
            onClick={() => scrollAlerts(1)}
            className={`shrink-0 transition-opacity ${canScrollRight ? 'opacity-60 hover:opacity-100' : 'opacity-0 pointer-events-none'} ${theme === 'light' ? 'text-slate-500' : 'text-white/60'}`}
            aria-hidden={!canScrollRight}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">

          <div className="lg:col-span-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl pt-4 px-4 pb-0 shadow-xl flex flex-col relative z-20 overflow-hidden min-h-[700px]" onFocus={preloadResultsDashboard} onPointerEnter={preloadResultsDashboard}>
            <ProfileManager
              currentInputs={inputs}
              onLoad={handleLoad}
              t={t}
              language={language}
              profiles={profiles}
              onSaveProfile={saveProfile}
              onUpdateProfile={updateProfile}
              onRenameProfile={renameProfile}
              onDeleteProfile={deleteProfile}
              onProfileLoad={markProfileAsLoaded}
              onActiveProfileChange={setActiveProfileId}
              lastLoadedProfileId={lastLoadedProfileId}
              onSaveGlobalPension={saveGlobalPension}
            />
            <div className="my-2 border-t border-white/10 flex-shrink-0"></div>
            <div className="flex-1 flex flex-col min-h-0">
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
              currentProfileId={activeProfileId}
              activeView={settings.activeView}
              setActiveView={(view) => dispatchSettings({ type: SETTINGS_ACTIONS.SET_ACTIVE_VIEW, payload: view })}
            />
            </div>
          </div>

          <div className="lg:col-span-8" style={{overflow:'hidden', alignSelf:'stretch', marginBottom:'2px'}}>
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
              {results && settings.calculationMode === 'planning' && (
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl overflow-hidden" style={{height:'100%'}}>
                  <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div></div>}>
                    <RetirementChecklist
                      inputs={memoizedDebouncedInputs}
                      results={results}
                      t={t}
                      language={language}
                      aiProvider={settings.aiProvider}
                      aiModel={settings.aiModel}
                      apiKeyOverride={settings.apiKeyOverride}
                    />
                  </Suspense>
                </div>
              )}
              {results && settings.calculationMode !== 'planning' && (
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
                    saveGlobalPension={saveGlobalPension}

                    // Sensitivity analysis props
                    showInterestSensitivity={showInterestSensitivity}
                    setShowInterestSensitivity={setShowInterestSensitivity}
                    showIncomeSensitivity={showIncomeSensitivity}
                    setShowIncomeSensitivity={setShowIncomeSensitivity}
                    showAgeSensitivity={showAgeSensitivity}

                    setShowAgeSensitivity={setShowAgeSensitivity}

                    // AI Insights Props (Lifted State)
                    aiInsightsData={aiInsightsData}
                    setAiInsightsData={handleSetAiInsights}
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
        open={chatOpen}
        setOpen={setChatOpen}
      />

      {/* Global Reminder Sync — loads reminders on login and syncs confirmation to db */}
      <GlobalRemindersSync
        uid={currentUser.uid}
        lifeEvents={inputs.lifeEvents}
        currentProfileId={activeProfileId}
        profiles={profiles}
        updateProfile={updateProfile}
      />
      <BudgetRemindersSync uid={currentUser.uid} />

      {/* Reminder Alert — shown once per session per due reminder */}
      <ReminderAlert language={language} isLight={theme === 'light'} sessionKey={currentUser.uid} />

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
              fourPercentMode={settings.fourPercentMode ?? 'net'}
              onFourPercentModeChange={v => dispatchSettings({ type: SETTINGS_ACTIONS.SET_FOUR_PERCENT_MODE, payload: v })}
              disabledAlerts={disabledAlerts}
              onToggleAlert={toggleAlert}
              aiProvider={settings.aiProvider}
              aiModel={settings.aiModel}
              apiKeyOverride={settings.apiKeyOverride}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}

export default App;
