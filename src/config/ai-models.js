/**
 * AI Models Configuration
 * Centralized configuration for all supported AI providers and models
 */

// Provider IDs - constants for type safety
export const AI_PROVIDERS = {
    GEMINI: 'gemini',
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic'
};

// Comprehensive configuration for each provider
export const AI_MODELS_CONFIG = {
    [AI_PROVIDERS.GEMINI]: {
        id: AI_PROVIDERS.GEMINI,
        name: 'Google Gemini',
        envKey: 'VITE_GEMINI_API_KEY',
        defaultModel: 'gemini-2.5-flash',
        models: [
            {
                id: 'gemini-3-pro-preview',
                name: 'Gemini 3 Pro Preview',
                recommended: true,
                description: 'Latest experimental model with advanced capabilities'
            },
            {
                id: 'gemini-2.5-pro',
                name: 'Gemini 2.5 Pro',
                description: 'High-performance model for complex tasks'
            },
            {
                id: 'gemini-2.5-flash',
                name: 'Gemini 2.5 Flash',
                description: 'Balanced performance and speed'
            },
            {
                id: 'gemini-2.5-flash-lite',
                name: 'Gemini 2.5 Flash Lite',
                description: 'Lightweight and fast'
            },
            {
                id: 'gemini-2.0-flash-lite',
                name: 'Gemini 2.0 Flash Lite',
                description: 'Older generation, fast'
            }
        ]
    },

    [AI_PROVIDERS.OPENAI]: {
        id: AI_PROVIDERS.OPENAI,
        name: 'OpenAI',
        envKey: 'VITE_OPENAI_API_KEY',
        defaultModel: 'gpt-4o',
        models: [
            {
                id: 'gpt-4o',
                name: 'GPT-4o',
                recommended: true,
                description: 'Most capable multimodal model'
            },
            {
                id: 'gpt-4o-mini',
                name: 'GPT-4o Mini',
                description: 'Affordable and fast'
            },
            {
                id: 'gpt-3.5-turbo',
                name: 'GPT-3.5 Turbo',
                description: 'Legacy model, economical'
            }
        ]
    },

    [AI_PROVIDERS.ANTHROPIC]: {
        id: AI_PROVIDERS.ANTHROPIC,
        name: 'Anthropic',
        subName: 'Claude',
        envKey: 'VITE_ANTHROPIC_API_KEY',
        defaultModel: 'claude-sonnet-4-5-20250929',
        models: [
            {
                id: 'claude-sonnet-4-5-20250929',
                name: 'Claude Sonnet 4.5',
                recommended: true,
                description: 'Latest and most capable Claude model'
            },
            {
                id: 'claude-haiku-4-5-20251001',
                name: 'Claude Haiku 4.5',
                description: 'Fast and efficient'
            },
            {
                id: 'claude-opus-4-20250514',
                name: 'Claude Opus 4',
                description: 'Maximum intelligence and capability'
            },
            {
                id: 'claude-sonnet-4-20250514',
                name: 'Claude Sonnet 4',
                description: 'Balanced performance'
            },
            {
                id: 'claude-haiku-4-20250110',
                name: 'Claude Haiku 4',
                description: 'Speed-optimized'
            },
            {
                id: 'claude-3-5-sonnet-20241022',
                name: 'Claude 3.5 Sonnet (New)',
                description: 'Previous generation Sonnet'
            },
            {
                id: 'claude-3-5-haiku-20241022',
                name: 'Claude 3.5 Haiku',
                description: 'Previous generation Haiku'
            }
        ]
    }
};

// Helper Functions

/**
 * Get configuration for a specific provider
 * @param {string} providerId - Provider ID (use AI_PROVIDERS constants)
 * @returns {Object|null} Provider configuration or null if not found
 */
export function getProviderConfig(providerId) {
    return AI_MODELS_CONFIG[providerId] || null;
}

/**
 * Get all available providers
 * @returns {Array<Object>} Array of provider info objects
 */
export function getAvailableProviders() {
    return Object.values(AI_MODELS_CONFIG).map(config => ({
        id: config.id,
        name: config.name,
        subName: config.subName
    }));
}

/**
 * Get available models for a provider
 * Checks localStorage for user-customized model list first
 * @param {string} providerId - Provider ID
 * @returns {Array<Object>} Array of model objects
 */
export function getAvailableModels(providerId) {
    // Check localStorage for override first
    try {
        const override = localStorage.getItem('ai_models_override');
        if (override) {
            const parsed = JSON.parse(override);
            if (parsed[providerId] && Array.isArray(parsed[providerId])) {
                return parsed[providerId];
            }
        }
    } catch (e) {
        console.error('Failed to parse models override:', e);
    }

    // Fallback to static config
    const config = getProviderConfig(providerId);
    return config ? config.models : [];
}

/**
 * Get default model for a provider
 * @param {string} providerId - Provider ID
 * @returns {string|null} Default model ID or null
 */
export function getDefaultModel(providerId) {
    const config = getProviderConfig(providerId);
    return config ? config.defaultModel : null;
}

/**
 * Get recommended models across all providers
 * @returns {Array<Object>} Array of recommended models with provider info
 */
export function getRecommendedModels() {
    const recommended = [];

    Object.values(AI_MODELS_CONFIG).forEach(provider => {
        provider.models
            .filter(model => model.recommended)
            .forEach(model => {
                recommended.push({
                    providerId: provider.id,
                    providerName: provider.name,
                    ...model
                });
            });
    });

    return recommended;
}

/**
 * Get environment variable key for a provider
 * @param {string} providerId - Provider ID
 * @returns {string|null} Environment variable key or null
 */
export function getProviderEnvKey(providerId) {
    const config = getProviderConfig(providerId);
    return config ? config.envKey : null;
}

/**
 * Check if a model exists for a provider
 * @param {string} providerId - Provider ID
 * @param {string} modelId - Model ID
 * @returns {boolean} True if model exists
 */
export function isValidModel(providerId, modelId) {
    const models = getAvailableModels(providerId);
    return models.some(m => m.id === modelId);
}

/**
 * Get providers that have API keys configured in environment
 * @returns {Array<string>} Array of provider IDs with configured API keys
 */
export function getProvidersWithKeys() {
    return Object.values(AI_MODELS_CONFIG)
        .filter(config => import.meta.env[config.envKey])
        .map(config => config.id);
}
