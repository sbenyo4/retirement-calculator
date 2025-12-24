import { AI_PROVIDERS, AI_MODELS_CONFIG } from '../config/ai-models';

/**
 * Fetch available models from Gemini API
 */
async function fetchGeminiModels(apiKey) {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        const data = await response.json();

        if (data.error) throw new Error(data.error.message);

        // Extract model IDs and filter for generative models
        return (data.models || [])
            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
            .map(m => ({
                id: m.name.replace('models/', ''),
                name: formatModelName(m.displayName || m.name),
                description: m.description || 'Gemini model'
            }));
    } catch (error) {
        console.error('Gemini models fetch error:', error);
        return null; // Return null on error
    }
}

/**
 * Get OpenAI models (hardcoded from docs)
 * Note: OpenAI doesn't provide a public models list API
 */
function getOpenAIModels() {
    return [
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable multimodal model', recommended: true },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Affordable and fast' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Latest GPT-4 Turbo' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and economical' },
    ];
}

/**
 * Get Anthropic models (hardcoded from docs)
 * Note: Anthropic doesn't provide a public models list API
 */
function getAnthropicModels() {
    return [
        { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', description: 'Latest and most capable', recommended: true },
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fast and efficient' },
        { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Maximum intelligence' },
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Balanced performance' },
        { id: 'claude-haiku-4-20250110', name: 'Claude Haiku 4', description: 'Speed-optimized' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (New)', description: 'Previous generation Sonnet' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Previous generation Haiku' },
    ];
}

/**
 * Fetch models for all providers
 */
export async function fetchAllAvailableModels(apiKeys = {}) {
    const results = {
        [AI_PROVIDERS.GEMINI]: null,
        [AI_PROVIDERS.OPENAI]: null,
        [AI_PROVIDERS.ANTHROPIC]: null,
    };

    // Gemini (API-based if key provided)
    if (apiKeys.gemini) {
        results[AI_PROVIDERS.GEMINI] = await fetchGeminiModels(apiKeys.gemini);
    }

    // OpenAI (hardcoded - no public API for listing)
    results[AI_PROVIDERS.OPENAI] = getOpenAIModels();

    // Anthropic (hardcoded - no public API for listing)
    results[AI_PROVIDERS.ANTHROPIC] = getAnthropicModels();

    return results;
}

/**
 * Compare fetched models with current config
 */
export function compareModels(fetchedModels, currentConfig) {
    const comparison = {};

    Object.keys(fetchedModels).forEach(providerId => {
        const fetched = fetchedModels[providerId];
        const current = currentConfig[providerId]?.models || [];

        if (!fetched) {
            comparison[providerId] = {
                status: 'error',
                message: 'Failed to fetch models or no API key provided'
            };
            return;
        }

        const fetchedIds = new Set(fetched.map(m => m.id));
        const currentIds = new Set(current.map(m => m.id));

        const newModels = fetched.filter(m => !currentIds.has(m.id));
        const removedModels = current.filter(m => !fetchedIds.has(m.id));
        const existingModels = current.filter(m => fetchedIds.has(m.id));

        comparison[providerId] = {
            status: 'success',
            new: newModels,
            removed: removedModels,
            existing: existingModels,
            updated: fetched,
            total: fetched.length
        };
    });

    return comparison;
}

/**
 * Helper to format model name
 */
function formatModelName(name) {
    // Convert "models/gemini-1.5-pro" or "Gemini 1.5 Pro" to nice format
    const cleaned = name.replace(/^models\//, '');

    // If already formatted (has spaces), return as is
    if (cleaned.includes(' ')) return cleaned;

    // Otherwise format from kebab-case
    return cleaned
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
