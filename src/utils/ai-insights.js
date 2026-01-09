
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getProviderEnvKey } from '../config/ai-models';
import { calculateRetirementProjection } from './calculator';

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
            `- ${event.title || event.name}: ${currency}${event.amount || event.monthlyChange} (${event.type}, Start: ${event.startDate?.year})`
        ).join('\n    ');
    }

    // Handle Variable Rates
    let returnRateText = `${inputs.annualReturnRate}%`;
    if (inputs.variableRatesEnabled && inputs.variableRates) {
        const rates = Object.values(inputs.variableRates);
        if (rates.length > 0) {
            const avgRate = (rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1);
            returnRateText = `Variable Rates Active (Avg: ${avgRate}%, Range: ${Math.min(...rates)}% - ${Math.max(...rates)}%)`;
        }
    }


    // --- Sensitivity / "What Moves the Needle" Calculation ---
    // We run a few quick simulations to give the AI hard data on what changes impact the result the most.
    let sensitivityText = "";
    try {
        const baseBalance = results.balanceAtEnd;
        const sensitivtyScenarios = [];

        // 1. Delay Retirement (Work 1 more year)
        const delayRetireInputs = { ...inputs, retirementStartAge: (parseFloat(inputs.retirementStartAge) || 67) + 1 };
        if (delayRetireInputs.retirementStartAge <= 80) { // sanity check
            const res = calculateRetirementProjection(delayRetireInputs);
            sensitivtyScenarios.push({ name: "Delaying Retirement by 1 year", diff: res.balanceAtEnd - baseBalance });
        }

        // 2. Higher Returns (+1% Accumulation)
        const higherReturnInputs = { ...inputs, annualReturnRate: (parseFloat(inputs.annualReturnRate) || 0) + 1 };
        const resReturn = calculateRetirementProjection(higherReturnInputs);
        sensitivtyScenarios.push({ name: "Increasing Annual Return by 1%", diff: resReturn.balanceAtEnd - baseBalance });

        // 3. Save More (+500 monthly)
        const saveMoreInputs = { ...inputs, monthlyContribution: (parseFloat(inputs.monthlyContribution) || 0) + 500 };
        const resSave = calculateRetirementProjection(saveMoreInputs);
        sensitivtyScenarios.push({ name: "Saving 500 more per month", diff: resSave.balanceAtEnd - baseBalance });

        // 4. Spend Less (-500 monthly in retirement)
        const spendLessInputs = { ...inputs, monthlyNetIncomeDesired: (parseFloat(inputs.monthlyNetIncomeDesired) || 0) - 500 };
        const resSpend = calculateRetirementProjection(spendLessInputs);
        sensitivtyScenarios.push({ name: "Reducing Retirement Spending by 500/mo", diff: resSpend.balanceAtEnd - baseBalance });

        // 5. Bucket Specifics (if enabled)
        if (inputs.enableBuckets) {
            // Safe Rate +1%
            const safeInputs = { ...inputs, bucketSafeRate: (parseFloat(inputs.bucketSafeRate) || 0) + 1 };
            const resSafe = calculateRetirementProjection(safeInputs);
            sensitivtyScenarios.push({ name: "Improving Safe Bucket Return by 1%", diff: resSafe.balanceAtEnd - baseBalance });

            // Surplus Rate +1%
            const surplusInputs = { ...inputs, bucketSurplusRate: (parseFloat(inputs.bucketSurplusRate) || 0) + 1 };
            const resSurplus = calculateRetirementProjection(surplusInputs);
            sensitivtyScenarios.push({ name: "Improving Surplus Bucket Return by 1%", diff: resSurplus.balanceAtEnd - baseBalance });
        }

        // Format for AI
        // Sort by impact (absolute value)
        sensitivtyScenarios.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

        sensitivityText = sensitivtyScenarios.map(s =>
            `- ${s.name}: ${s.diff >= 0 ? '+' : ''}${currency}${Math.round(s.diff).toLocaleString()} change in final balance`
        ).join('\n    ');

    } catch (err) {
        console.warn("Failed to generate sensitivity data for AI:", err);
        sensitivityText = "Data unavailable";
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
    - Assumed Annual Return: ${returnRateText}
    - Inflation Type: ${inputs.inflationType || 'None'}
    
    Significant Life Events (One-time or recurring changes):
    ${lifeEventsText}
    
    Simulation Results (Base Case):
    - Projected Balance at Retirement: ${currency}${results.balanceAtRetirement}
    - Projected Balance at End of Retirement: ${currency}${results.balanceAtEnd}
    - Ran Out of Money At Age: ${results.ranOutAtAge || 'Never (Succesfully funded)'}
    - Required Capital at Retirement: ${currency}${results.requiredCapitalAtRetirement}
    - Required Capital at Retirement: ${currency}${results.requiredCapitalAtRetirement}
    - Deficit (Needed Today): ${currency}${results.pvOfDeficit}
    
    Sensitivity Analysis (Impact of changes on Final Balance):
    ${sensitivityText}
    
    Your Output Requirements:
    1. **Language**: The response MUST be in ${isHebrew ? 'Hebrew (Modern, professional yet accessible)' : 'English'}.
    2. **Format**: Return a strict JSON object with the following structure:
    {
        "readinessScore": number, // 0-100 score of how ready the user is
        "executiveSummary": "string", // 2-3 sentences summarizing the situation
        "retirementAgeRecommendation": {
            "recommendedAge": number, // The specific age recommended (e.g. 67)
            "reasoning": "string" // Why this exact age? (e.g. "Closing the 200k deficit requires 2 more years of compounding")
        },
        "analysis": {
            "strengths": ["string", "string"], // List of 2-3 strong points
            "weaknesses": ["string", "string"], // List of 2-3 weak points/risks
            "marketDependency": "string", // Assessment of how dependent the plan is on market returns
            "sensitivityAnalysis": "string" // dedicated insight about what factor impacts the result the most (based on the provided sensitivity data)
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
    - If there are significant life events, specifically mention their impact.
    - LOOK at the "Sensitivity Analysis" section. Use it to populate the 'sensitivityAnalysis' field. 
      Identify the TOP 2 most impactful factors. Explain the #1 factor and correct mention the #2 factor for context.
      (e.g., "Delaying retirement is your strongest lever (+2M), followed by increasing safe yields (+500k). Saving more has minor impact.")
    - If the user runs out of money early, emphasize increasing savings or delaying retirement.
    - If the user has a large surplus, suggest leaving a legacy or spending more.
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
