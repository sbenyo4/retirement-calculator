import { useReducer, useEffect } from 'react';
import { SIMULATION_TYPES } from '../utils/simulation-calculator';
import { safeLocalStorageSet, safeLocalStorageSetJSON, safeLocalStorageGetJSON } from '../utils/storage';

const SETTINGS_ACTIONS = {
    SET_CALCULATION_MODE: 'SET_CALCULATION_MODE',
    SET_AI_PROVIDER: 'SET_AI_PROVIDER',
    SET_AI_MODEL: 'SET_AI_MODEL',
    SET_API_KEY_OVERRIDE: 'SET_API_KEY_OVERRIDE',
    SET_SIMULATION_TYPE: 'SET_SIMULATION_TYPE',
    SET_FISCAL_DATA: 'SET_FISCAL_DATA'
};

function getInitialSettings() {
    const savedProvider = localStorage.getItem('aiProvider') || 'gemini';

    // Safely parse and validate fiscalParameters
    const savedFiscal = safeLocalStorageGetJSON('fiscalParameters', null);
    // Only use saved params if they have the required structure
    const fiscalParameters = (savedFiscal?.nationalInsurance?.incomeTestThreshold)
        ? savedFiscal
        : null;

    return {
        calculationMode: 'mathematical', // Always start in mathematical mode on refresh
        aiProvider: savedProvider,
        aiModel: localStorage.getItem('aiModel') || 'gemini-2.5-flash',
        apiKeyOverride: localStorage.getItem(`apiKeyOverride_${savedProvider}`) || '',
        simulationType: localStorage.getItem('simulationType') || SIMULATION_TYPES.MONTE_CARLO,
        familyStatus: localStorage.getItem('familyStatus') || 'single',
        fiscalParameters
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

        case SETTINGS_ACTIONS.SET_FISCAL_DATA:
            return {
                ...state,
                fiscalParameters: action.payload.parameters || state.fiscalParameters,
                familyStatus: action.payload.familyStatus || state.familyStatus
            };

        default:
            return state;
    }
}

export function useAppSettings() {
    const [settings, dispatch] = useReducer(settingsReducer, null, getInitialSettings);

    // Persistence for General Settings
    useEffect(() => {
        safeLocalStorageSet('aiProvider', settings.aiProvider);
        safeLocalStorageSet('aiModel', settings.aiModel);
        safeLocalStorageSet('simulationType', settings.simulationType);
        safeLocalStorageSet('familyStatus', settings.familyStatus);
        if (settings.fiscalParameters) {
            safeLocalStorageSetJSON('fiscalParameters', settings.fiscalParameters);
        }
    }, [settings.aiProvider, settings.aiModel, settings.simulationType, settings.familyStatus, settings.fiscalParameters]);

    // Persistence for API Key (Per Provider)
    useEffect(() => {
        safeLocalStorageSet(`apiKeyOverride_${settings.aiProvider}`, settings.apiKeyOverride);
    }, [settings.apiKeyOverride, settings.aiProvider]);

    return { settings, dispatch, SETTINGS_ACTIONS };
}
