import { describe, it, expect } from 'vitest';
import {
    AI_PROVIDERS,
    AI_MODELS_CONFIG,
    getProviderConfig,
    getAvailableProviders,
    getAvailableModels,
    getDefaultModel,
    getRecommendedModels,
    getProviderEnvKey,
    isValidModel,
    getProvidersWithKeys
} from './ai-models';

describe('AI Models Configuration', () => {
    describe('Constants', () => {
        it('should have valid AI_PROVIDERS constants', () => {
            expect(AI_PROVIDERS).toBeDefined();
            expect(AI_PROVIDERS.GEMINI).toBe('gemini');
            expect(AI_PROVIDERS.OPENAI).toBe('openai');
            expect(AI_PROVIDERS.ANTHROPIC).toBe('anthropic');
        });

        it('should have complete AI_MODELS_CONFIG', () => {
            expect(AI_MODELS_CONFIG).toBeDefined();
            expect(Object.keys(AI_MODELS_CONFIG)).toHaveLength(3);

            // Each provider should have required fields
            Object.values(AI_MODELS_CONFIG).forEach(config => {
                expect(config).toHaveProperty('id');
                expect(config).toHaveProperty('name');
                expect(config).toHaveProperty('envKey');
                expect(config).toHaveProperty('defaultModel');
                expect(config).toHaveProperty('models');
                expect(Array.isArray(config.models)).toBe(true);
                expect(config.models.length).toBeGreaterThan(0);
            });
        });
    });

    describe('getProviderConfig', () => {
        it('should return config for valid provider', () => {
            const config = getProviderConfig(AI_PROVIDERS.GEMINI);
            expect(config).toBeDefined();
            expect(config.id).toBe(AI_PROVIDERS.GEMINI);
            expect(config.name).toBe('Google Gemini');
        });

        it('should return null for invalid provider', () => {
            const config = getProviderConfig('invalid-provider');
            expect(config).toBeNull();
        });

        it('should return config with all required fields', () => {
            const config = getProviderConfig(AI_PROVIDERS.OPENAI);
            expect(config).toHaveProperty('id');
            expect(config).toHaveProperty('name');
            expect(config).toHaveProperty('envKey');
            expect(config).toHaveProperty('defaultModel');
            expect(config).toHaveProperty('models');
        });
    });

    describe('getAvailableProviders', () => {
        it('should return all providers', () => {
            const providers = getAvailableProviders();
            expect(providers).toHaveLength(3);

            providers.forEach(provider => {
                expect(provider).toHaveProperty('id');
                expect(provider).toHaveProperty('name');
            });
        });

        it('should include provider names', () => {
            const providers = getAvailableProviders();
            const names = providers.map(p => p.name);
            expect(names).toContain('Google Gemini');
            expect(names).toContain('OpenAI');
            expect(names).toContain('Anthropic');
        });

        it('should include Anthropic subName', () => {
            const providers = getAvailableProviders();
            const anthropic = providers.find(p => p.id === AI_PROVIDERS.ANTHROPIC);
            expect(anthropic.subName).toBe('Claude');
        });
    });

    describe('getAvailableModels', () => {
        it('should return models for Gemini', () => {
            const models = getAvailableModels(AI_PROVIDERS.GEMINI);
            expect(models.length).toBeGreaterThan(0);

            models.forEach(model => {
                expect(model).toHaveProperty('id');
                expect(model).toHaveProperty('name');
            });
        });

        it('should return models for OpenAI', () => {
            const models = getAvailableModels(AI_PROVIDERS.OPENAI);
            expect(models.length).toBeGreaterThan(0);
            expect(models.some(m => m.id.includes('gpt'))).toBe(true);
        });

        it('should return models for Anthropic', () => {
            const models = getAvailableModels(AI_PROVIDERS.ANTHROPIC);
            expect(models.length).toBeGreaterThan(0);
            expect(models.some(m => m.id.includes('claude'))).toBe(true);
        });

        it('should return empty array for invalid provider', () => {
            const models = getAvailableModels('invalid');
            expect(models).toEqual([]);
        });

        it('should return models with descriptions', () => {
            const models = getAvailableModels(AI_PROVIDERS.GEMINI);
            models.forEach(model => {
                expect(model).toHaveProperty('description');
                expect(typeof model.description).toBe('string');
            });
        });
    });

    describe('getDefaultModel', () => {
        it('should return default model for Gemini', () => {
            const defaultModel = getDefaultModel(AI_PROVIDERS.GEMINI);
            expect(defaultModel).toBe('gemini-2.5-flash');
        });

        it('should return default model for OpenAI', () => {
            const defaultModel = getDefaultModel(AI_PROVIDERS.OPENAI);
            expect(defaultModel).toBe('gpt-4o');
        });

        it('should return default model for Anthropic', () => {
            const defaultModel = getDefaultModel(AI_PROVIDERS.ANTHROPIC);
            expect(defaultModel).toBe('claude-sonnet-4-5-20250929');
        });

        it('should return null for invalid provider', () => {
            const defaultModel = getDefaultModel('invalid');
            expect(defaultModel).toBeNull();
        });
    });

    describe('getRecommendedModels', () => {
        it('should return recommended models', () => {
            const recommended = getRecommendedModels();
            expect(recommended.length).toBeGreaterThan(0);

            recommended.forEach(model => {
                expect(model).toHaveProperty('providerId');
                expect(model).toHaveProperty('providerName');
                expect(model).toHaveProperty('id');
                expect(model).toHaveProperty('name');
                expect(model.recommended).toBe(true);
            });
        });

        it('should have at least one recommended model per provider', () => {
            const recommended = getRecommendedModels();
            const providerIds = recommended.map(m => m.providerId);

            expect(providerIds).toContain(AI_PROVIDERS.GEMINI);
            expect(providerIds).toContain(AI_PROVIDERS.OPENAI);
            expect(providerIds).toContain(AI_PROVIDERS.ANTHROPIC);
        });

        it('should include provider name in recommended models', () => {
            const recommended = getRecommendedModels();
            recommended.forEach(model => {
                expect(model.providerName).toBeTruthy();
                expect(typeof model.providerName).toBe('string');
            });
        });
    });

    describe('getProviderEnvKey', () => {
        it('should return env key for Gemini', () => {
            const envKey = getProviderEnvKey(AI_PROVIDERS.GEMINI);
            expect(envKey).toBe('VITE_GEMINI_API_KEY');
        });

        it('should return env key for OpenAI', () => {
            const envKey = getProviderEnvKey(AI_PROVIDERS.OPENAI);
            expect(envKey).toBe('VITE_OPENAI_API_KEY');
        });

        it('should return env key for Anthropic', () => {
            const envKey = getProviderEnvKey(AI_PROVIDERS.ANTHROPIC);
            expect(envKey).toBe('VITE_ANTHROPIC_API_KEY');
        });

        it('should return null for invalid provider', () => {
            const envKey = getProviderEnvKey('invalid');
            expect(envKey).toBeNull();
        });

        it('should return env keys with VITE prefix', () => {
            Object.values(AI_PROVIDERS).forEach(providerId => {
                const envKey = getProviderEnvKey(providerId);
                expect(envKey).toMatch(/^VITE_/);
            });
        });
    });

    describe('isValidModel', () => {
        it('should validate existing Gemini models', () => {
            expect(isValidModel(AI_PROVIDERS.GEMINI, 'gemini-2.5-flash')).toBe(true);
            expect(isValidModel(AI_PROVIDERS.GEMINI, 'gemini-2.5-pro')).toBe(true);
        });

        it('should invalidate non-existing models', () => {
            expect(isValidModel(AI_PROVIDERS.GEMINI, 'invalid-model')).toBe(false);
            expect(isValidModel(AI_PROVIDERS.OPENAI, 'gpt-99')).toBe(false);
        });

        it('should validate OpenAI models', () => {
            expect(isValidModel(AI_PROVIDERS.OPENAI, 'gpt-4o')).toBe(true);
            expect(isValidModel(AI_PROVIDERS.OPENAI, 'gpt-4o-mini')).toBe(true);
        });

        it('should validate Anthropic models', () => {
            expect(isValidModel(AI_PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5-20250929')).toBe(true);
        });

        it('should return false for invalid provider', () => {
            expect(isValidModel('invalid', 'any-model')).toBe(false);
        });

        it('should be case sensitive', () => {
            expect(isValidModel(AI_PROVIDERS.GEMINI, 'GEMINI-2.5-FLASH')).toBe(false);
        });
    });

    describe('getProvidersWithKeys', () => {
        it('should return an array', () => {
            const providers = getProvidersWithKeys();
            expect(Array.isArray(providers)).toBe(true);
        });

        it('should only include valid provider IDs', () => {
            const providers = getProvidersWithKeys();
            const validIds = Object.values(AI_PROVIDERS);
            providers.forEach(id => {
                expect(validIds).toContain(id);
            });
        });
    });

    describe('Model Data Integrity', () => {
        it('should have unique model IDs within each provider', () => {
            Object.values(AI_MODELS_CONFIG).forEach(config => {
                const ids = config.models.map(m => m.id);
                const uniqueIds = new Set(ids);
                expect(uniqueIds.size).toBe(ids.length);
            });
        });

        it('should have default model that exists in models list', () => {
            Object.values(AI_MODELS_CONFIG).forEach(config => {
                const modelIds = config.models.map(m => m.id);
                expect(modelIds).toContain(config.defaultModel);
            });
        });

        it('should have at least one model per provider', () => {
            Object.values(AI_MODELS_CONFIG).forEach(config => {
                expect(config.models.length).toBeGreaterThan(0);
            });
        });

        it('should have unique provider IDs', () => {
            const providerIds = Object.keys(AI_MODELS_CONFIG);
            const uniqueIds = new Set(providerIds);
            expect(uniqueIds.size).toBe(providerIds.length);
        });

        it('should have non-empty model names', () => {
            Object.values(AI_MODELS_CONFIG).forEach(config => {
                config.models.forEach(model => {
                    expect(model.name.length).toBeGreaterThan(0);
                });
            });
        });

        it('should have non-empty model IDs', () => {
            Object.values(AI_MODELS_CONFIG).forEach(config => {
                config.models.forEach(model => {
                    expect(model.id.length).toBeGreaterThan(0);
                });
            });
        });
    });
});
