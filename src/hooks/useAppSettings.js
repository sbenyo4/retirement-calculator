import { useReducer, useEffect, useRef, useState } from 'react';
import { SIMULATION_TYPES } from '../utils/simulation-calculator';
import { useAuth } from '../contexts/AuthContext';
import { getUserSettings, setUserSettings } from '../utils/db';

const SETTINGS_ACTIONS = {
    SET_CALCULATION_MODE: 'SET_CALCULATION_MODE',
    SET_AI_PROVIDER: 'SET_AI_PROVIDER',
    SET_AI_MODEL: 'SET_AI_MODEL',
    SET_API_KEY_OVERRIDE: 'SET_API_KEY_OVERRIDE',
    SET_SIMULATION_TYPE: 'SET_SIMULATION_TYPE',
    SET_FISCAL_DATA: 'SET_FISCAL_DATA',
    LOAD_FROM_DB: 'LOAD_FROM_DB',
    SET_MODELS_OVERRIDE: 'SET_MODELS_OVERRIDE',
    SET_IDLE_TIMEOUT: 'SET_IDLE_TIMEOUT',
    SET_IDLE_TIMEOUT_ENABLED: 'SET_IDLE_TIMEOUT_ENABLED',
    SET_SCREEN_LOCK_TIMEOUT: 'SET_SCREEN_LOCK_TIMEOUT',
    SET_SCREEN_LOCK_ENABLED: 'SET_SCREEN_LOCK_ENABLED',
    SET_FOUR_PERCENT_MODE: 'SET_FOUR_PERCENT_MODE',
    SET_ACTIVE_VIEW: 'SET_ACTIVE_VIEW',
    SET_DISABLED_ALERTS: 'SET_DISABLED_ALERTS',
    RESET_TO_DEFAULTS: 'RESET_TO_DEFAULTS'
};

function getDefaultSettings() {
    return {
        calculationMode: 'mathematical',
        aiProvider: 'gemini',
        aiModel: 'gemini-2.5-flash',
        apiKeyOverride: '',
        simulationType: SIMULATION_TYPES.MONTE_CARLO,
        familyStatus: 'single',
        fiscalParameters: null,
        apiKeys: {}, // Per-provider API key overrides
        aiModelsOverride: null, // User-selected custom AI models
        idleTimeoutMinutes: 5,
        idleTimeoutEnabled: true,
        screenLockTimeoutMinutes: 2,
        screenLockEnabled: true,
        fourPercentMode: 'net',
        activeView: 'parameters',
        disabledAlerts: []
    };
}

function settingsReducer(state, action) {
    switch (action.type) {
        case SETTINGS_ACTIONS.LOAD_FROM_DB: {
            const db = action.payload;
            return {
                ...state,
                calculationMode: 'mathematical', // Always default to mathematical on login
                activeView: 'parameters',        // Always default to parameters on login
                aiProvider: db.aiProvider || state.aiProvider,
                aiModel: db.aiModel || state.aiModel,
                apiKeyOverride: db.apiKeys?.[db.aiProvider || state.aiProvider] || '',
                simulationType: db.simulationType || state.simulationType,
                familyStatus: db.familyStatus || state.familyStatus,
                fiscalParameters: db.fiscalParameters || state.fiscalParameters,
                apiKeys: db.apiKeys || state.apiKeys,
                aiModelsOverride: db.aiModelsOverride || state.aiModelsOverride,
                idleTimeoutMinutes: db.idleTimeoutMinutes ?? state.idleTimeoutMinutes,
                idleTimeoutEnabled: db.idleTimeoutEnabled ?? state.idleTimeoutEnabled,
                screenLockTimeoutMinutes: db.screenLockTimeoutMinutes ?? state.screenLockTimeoutMinutes,
                screenLockEnabled: db.screenLockEnabled ?? state.screenLockEnabled,
                fourPercentMode: db.fourPercentMode ?? state.fourPercentMode,
                disabledAlerts: Array.isArray(db.disabledAlerts) ? db.disabledAlerts : state.disabledAlerts,
            };
        }

        case SETTINGS_ACTIONS.RESET_TO_DEFAULTS:
            return getDefaultSettings();

        case SETTINGS_ACTIONS.SET_CALCULATION_MODE:
            return { ...state, calculationMode: action.payload };

        case SETTINGS_ACTIONS.SET_AI_PROVIDER: {
            const newApiKey = state.apiKeys[action.payload] || '';
            return {
                ...state,
                aiProvider: action.payload,
                apiKeyOverride: newApiKey
            };
        }

        case SETTINGS_ACTIONS.SET_AI_MODEL:
            return { ...state, aiModel: action.payload };

        case SETTINGS_ACTIONS.SET_API_KEY_OVERRIDE: {
            const newApiKeys = {
                ...state.apiKeys,
                [state.aiProvider]: action.payload
            };
            return {
                ...state,
                apiKeyOverride: action.payload,
                apiKeys: newApiKeys
            };
        }

        case SETTINGS_ACTIONS.SET_SIMULATION_TYPE:
            return { ...state, simulationType: action.payload };

        case SETTINGS_ACTIONS.SET_FISCAL_DATA:
            return {
                ...state,
                fiscalParameters: action.payload.parameters || state.fiscalParameters,
                familyStatus: action.payload.familyStatus || state.familyStatus
            };

        case SETTINGS_ACTIONS.SET_MODELS_OVERRIDE:
            return {
                ...state,
                aiModelsOverride: action.payload
            };

        case SETTINGS_ACTIONS.SET_IDLE_TIMEOUT:
            return {
                ...state,
                idleTimeoutMinutes: action.payload,
                screenLockTimeoutMinutes: Math.min(state.screenLockTimeoutMinutes, Math.max(1, action.payload - 1))
            };

        case SETTINGS_ACTIONS.SET_IDLE_TIMEOUT_ENABLED:
            return { ...state, idleTimeoutEnabled: action.payload };

        case SETTINGS_ACTIONS.SET_SCREEN_LOCK_TIMEOUT:
            return { ...state, screenLockTimeoutMinutes: action.payload };

        case SETTINGS_ACTIONS.SET_SCREEN_LOCK_ENABLED:
            return { ...state, screenLockEnabled: action.payload };

        case SETTINGS_ACTIONS.SET_FOUR_PERCENT_MODE:
            return { ...state, fourPercentMode: action.payload };

        case SETTINGS_ACTIONS.SET_ACTIVE_VIEW:
            return { ...state, activeView: action.payload };

        case SETTINGS_ACTIONS.SET_DISABLED_ALERTS:
            return { ...state, disabledAlerts: action.payload };

        default:
            return state;
    }
}

export function useAppSettings() {
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;
    const [settings, dispatch] = useReducer(settingsReducer, null, getDefaultSettings);
    const isInitialLoad = useRef(true);
    const loadedRef = useRef(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);

    // Load settings from Firestore on mount
    useEffect(() => {
        if (!uid) {
            setSettingsLoaded(false);
            return;
        }
        // Hide alerts immediately while we load the real settings for this uid.
        setSettingsLoaded(false);
        isInitialLoad.current = true;

        getUserSettings(uid).then(dbSettings => {
            if (dbSettings) {
                dispatch({ type: SETTINGS_ACTIONS.LOAD_FROM_DB, payload: dbSettings });
                // isInitialLoad stays true — the save effect will clear it
                // after skipping the first post-dispatch run (deterministic)
            } else {
                // No saved settings — reset to defaults (especially calculationMode)
                dispatch({ type: SETTINGS_ACTIONS.RESET_TO_DEFAULTS });
                isInitialLoad.current = false;
            }
            loadedRef.current = true;
            setSettingsLoaded(true);
        }).catch(err => {
            console.error('Error loading settings from Firestore:', err);
            loadedRef.current = true;
            isInitialLoad.current = false;
            setSettingsLoaded(true);
        });
    }, [uid]);

    // Persist settings to Firestore when they change
    useEffect(() => {
        if (!uid || !loadedRef.current) return;

        // Skip the first run after LOAD_FROM_DB dispatch — settings deps changed
        // from loading, not from user action. Clear the flag for subsequent runs.
        if (isInitialLoad.current) {
            isInitialLoad.current = false;
            return;
        }

        const dataToSave = {
            aiProvider: settings.aiProvider,
            aiModel: settings.aiModel,
            simulationType: settings.simulationType,
            familyStatus: settings.familyStatus,
            apiKeys: settings.apiKeys,
            aiModelsOverride: settings.aiModelsOverride,
            idleTimeoutMinutes: settings.idleTimeoutMinutes,
            idleTimeoutEnabled: settings.idleTimeoutEnabled,
            screenLockTimeoutMinutes: settings.screenLockTimeoutMinutes,
            screenLockEnabled: settings.screenLockEnabled,
            fourPercentMode: settings.fourPercentMode,
            disabledAlerts: settings.disabledAlerts,
        };

        if (settings.fiscalParameters) {
            dataToSave.fiscalParameters = settings.fiscalParameters;
        }

        setUserSettings(uid, dataToSave).catch(err => {
            console.error('Error saving settings to Firestore:', err);
        });
    }, [
        settings.aiProvider,
        settings.aiModel,
        settings.simulationType,
        settings.familyStatus,
        settings.fiscalParameters,
        settings.apiKeys,
        settings.aiModelsOverride,
        settings.idleTimeoutMinutes,
        settings.idleTimeoutEnabled,
        settings.screenLockTimeoutMinutes,
        settings.screenLockEnabled,
        settings.fourPercentMode,
        settings.disabledAlerts,
        uid,
    ]);

    return { settings, dispatch, SETTINGS_ACTIONS, settingsLoaded };
}
