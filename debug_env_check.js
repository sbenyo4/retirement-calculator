
import { getAvailableProviders, getAvailableModels } from './src/utils/ai-calculator.js';

// Mock import.meta.env
global.import = {
    meta: {
        env: {
            VITE_GEMINI_API_KEY: process.env.VITE_GEMINI_API_KEY || "AIzaSyANNzvS0eB1rKvhnvaB00jZfLRc4F1-gmo", // Hardcode from .env I saw
            VITE_OPENAI_API_KEY: process.env.VITE_OPENAI_API_KEY || "sk-proj-...",
            VITE_ANTHROPIC_API_KEY: process.env.VITE_ANTHROPIC_API_KEY || "sk-ant-..."
        }
    }
};

console.log("Providers:", getAvailableProviders());
const providers = getAvailableProviders();
providers.forEach(p => {
    console.log(`Models for ${p.id}:`, getAvailableModels(p.id));
});
