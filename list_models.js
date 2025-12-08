import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);
        // Note: listModels is not directly on genAI instance in some versions, 
        // but let's try to just use a known model to see if it works or catch the error which might list models.
        // Actually, the error message said "Call ListModels".
        // The SDK might not expose listModels directly on the client, it's usually a REST API call.
        // Let's try to fetch via fetch API to be sure.

        const apiKey = process.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            console.error("No API Key found in .env");
            return;
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.models) {
            console.log("Available Models:");
            data.models.forEach(m => {
                if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")) {
                    console.log(`- ${m.name} (${m.displayName})`);
                }
            });
        } else {
            console.log("Error listing models:", data);
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

listModels();
