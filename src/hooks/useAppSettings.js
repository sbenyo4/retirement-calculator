
import { useReducer, useEffect } from 'react';
import { SIMULATION_TYPES } from '../utils/simulation-calculator';

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

export function useAppSettings() {
    const [settings, dispatch] = useReducer(settingsReducer, null, getInitialSettings);

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

    return { settings, dispatch, SETTINGS_ACTIONS };
}
