import { useReducer, useEffect, useRef } from 'react';
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
    SET_MODELS_OVERRIDE: 'SET_MODELS_OVERRIDE'
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
        aiModelsOverride: null // User-selected custom AI models
    };
}

function settingsReducer(state, action) {
    switch (action.type) {
        case SETTINGS_ACTIONS.LOAD_FROM_DB: {
            const db = action.payload;
            return {
                ...state,
                aiProvider: db.aiProvider || state.aiProvider,
                aiModel: db.aiModel || state.aiModel,
                apiKeyOverride: db.apiKeys?.[db.aiProvider || state.aiProvider] || '',
                simulationType: db.simulationType || state.simulationType,
                familyStatus: db.familyStatus || state.familyStatus,
                fiscalParameters: db.fiscalParameters || state.fiscalParameters,
                apiKeys: db.apiKeys || state.apiKeys,
                aiModelsOverride: db.aiModelsOverride || state.aiModelsOverride,
            };
        }

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

    // Load settings from Firestore on mount
    useEffect(() => {
        if (!uid) return;
        isInitialLoad.current = true;

        getUserSettings(uid).then(dbSettings => {
            if (dbSettings) {
                dispatch({ type: SETTINGS_ACTIONS.LOAD_FROM_DB, payload: dbSettings });
            }
            loadedRef.current = true;
            // Allow state to settle before enabling saves
            setTimeout(() => { isInitialLoad.current = false; }, 100);
        }).catch(err => {
            console.error('Error loading settings from Firestore:', err);
            loadedRef.current = true;
            isInitialLoad.current = false;
        });
    }, [uid]);

    // Persist settings to Firestore when they change
    useEffect(() => {
        if (!uid || !loadedRef.current || isInitialLoad.current) return;

        const dataToSave = {
            aiProvider: settings.aiProvider,
            aiModel: settings.aiModel,
            simulationType: settings.simulationType,
            familyStatus: settings.familyStatus,
            apiKeys: settings.apiKeys,
        };

        if (settings.fiscalParameters) {
            dataToSave.fiscalParameters = settings.fiscalParameters;
        }

        // We stringify apiKeys because objects are compared by reference in useEffect dependencies
        const apiKeysString = JSON.stringify(settings.apiKeys);

        setUserSettings(uid, dataToSave).catch(err => {
            console.error('Error saving settings to Firestore:', err);
        });
    }, [settings.aiProvider, settings.aiModel, settings.simulationType, settings.familyStatus, settings.fiscalParameters, JSON.stringify(settings.apiKeys), uid]);

    return { settings, dispatch, SETTINGS_ACTIONS };
}
