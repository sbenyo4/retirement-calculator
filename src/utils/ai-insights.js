
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getProviderEnvKey } from '../config/ai-models';

/**
 * Generates a specialized prompt for AI qualitative analysis of retirement data.
 * @param {Object} inputs - User inputs (financials, age, etc.)
 * @param {Object} results - Calculated mathematical results
 * @param {string} language - 'he' or 'en'
 * @returns {string} The prompt string
 */
export const generateInsightPrompt = (inputs, results, language) => {
    const isHebrew = language === 'he';
    const currency = isHebrew ? '₪' : '$';

    // Format Life Events if they exist
    let lifeEventsText = "None";
    if (inputs.lifeEvents && inputs.lifeEvents.length > 0) {
        lifeEventsText = inputs.lifeEvents.map(event =>
            `- ${event.title}: ${currency}${event.amount} (${event.type}, Year: ${event.year})`
        ).join('\n    ');
    }

    const basePrompt = `
    Act as a senior financial advisor and retirement planner.
    Analyze the following retirement scenario and provide qualitative insights, conclusions, and actionable recommendations.
    
    User Profile:
    - Current Age: ${inputs.currentAge}
    - Retirement Start Age: ${inputs.retirementStartAge}
    - Retirement End Age: ${inputs.retirementEndAge}
    - Current Savings: ${currency}${inputs.currentSavings}
    - Monthly Contribution: ${currency}${inputs.monthlyContribution}
    - Desired Monthly Net Income: ${currency}${inputs.monthlyNetIncomeDesired}
    - Assumed Annual Return: ${inputs.annualReturnRate}%
    - Inflation Type: ${inputs.inflationType || 'None'}
    
    Significant Life Events (One-time or recurring changes):
    ${lifeEventsText}
    
    Simulation Results (Base Case):
    - Projected Balance at Retirement: ${currency}${results.balanceAtRetirement}
    - Projected Balance at End of Retirement: ${currency}${results.balanceAtEnd}
    - Ran Out of Money At Age: ${results.ranOutAtAge || 'Never (Succesfully funded)'}
    - Required Capital at Retirement: ${currency}${results.requiredCapitalAtRetirement}
    - Deficit (Needed Today): ${currency}${results.pvOfDeficit}
    
    Your Output Requirements:
    1. **Language**: The response MUST be in ${isHebrew ? 'Hebrew (Modern, professional yet accessible)' : 'English'}.
    2. **Format**: Return a strict JSON object with the following structure:
    {
        "readinessScore": number, // 0-100 score of how ready the user is
        "executiveSummary": "string", // 2-3 sentences summarizing the situation
        "analysis": {
            "strengths": ["string", "string"], // List of 2-3 strong points
            "weaknesses": ["string", "string"], // List of 2-3 weak points/risks
            "marketDependency": "string" // Assessment of how dependent the plan is on market returns
        },
        "recommendations": [
            {
                "title": "string", // Short title
                "description": "string", // Actionable advice
                "impact": "string" // Expected impact (e.g. "Increases success chance by 10%")
            }
        ], // Provide 3-4 distinct recommendations
        "conclusion": "string" // Final encouraging or cautionary closing statement
    }
    
    Guidance for Analysis:
    - If there are significant life events (e.g., weddings, inheritance), specifically mention how they impact the plan.
    - If the user runs out of money early, emphasize increasing savings or delaying retirement.
    - If the user has a large surplus, suggest leaving a legacy or spending more.
    - Consider the age gaps and the realism of the inputs (e.g. if return rate is very high, warn about risk).
    - Be empathetic but realistic.
    `;

    return basePrompt;
};

/**
 * Fetches AI insights using the selected provider.
 * @param {Object} inputs 
 * @param {Object} results 
 * @param {string} provider 
 * @param {string} model 
 * @param {string} apiKeyOverride 
 * @param {string} language 
 * @returns {Promise<Object>} The JSON response from the AI
 */
export async function getAIInsights(inputs, results, provider, model, apiKeyOverride = null, language = 'he') {
    const prompt = generateInsightPrompt(inputs, results, language);

    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);

    if (!apiKey) {
        throw new Error("Missing API Key");
    }

    let responseText = "";

    try {
        if (provider === 'gemini') {
            const genAI = new GoogleGenerativeAI(apiKey);
            const genModel = genAI.getGenerativeModel({
                model: model,
                generationConfig: { responseMimeType: "application/json" }
            });
            const result = await genModel.generateContent(prompt);
            responseText = result.response.text();

        } else if (provider === 'openai') {
            const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
            const completion = await openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: model,
                response_format: { type: "json_object" }
            });
            responseText = completion.choices[0].message.content;

        } else if (provider === 'anthropic') {
            const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
            const message = await anthropic.messages.create({
                model: model,
                max_tokens: 4096,
                messages: [{ role: "user", content: prompt }]
            });
            responseText = message.content[0].text;
        }

        // Parse JSON
        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);

    } catch (error) {
        console.error("AI Insight Error:", error);
        throw error;
    }
}
