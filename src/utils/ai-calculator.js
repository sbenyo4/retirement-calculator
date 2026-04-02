import { getProviderEnvKey } from '../config/ai-models';

// Re-export for backward compatibility
export { getAvailableProviders, getAvailableModels } from '../config/ai-models';

/**
 * Retry configuration
 */
export const RETRY_CONFIG = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    timeoutMs: 60000, // Increased to 60 seconds timeout per request
};

/**
 * Determines if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} - True if the error is retryable
 */
function isRetryableError(error) {
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;

    // Network errors are retryable
    if (message.includes('network') || message.includes('fetch') ||
        message.includes('econnrefused') || message.includes('enotfound') ||
        message.includes('timeout') || message.includes('econnreset') ||
        message.includes('socket')) {
        return true;
    }

    // Server errors (5xx) are retryable
    if (status >= 500 && status < 600) {
        return true;
    }

    // Rate limit (429) is retryable with backoff
    if (status === 429 || message.includes('429') || message.includes('rate limit')) {
        return true;
    }

    // Specific transient errors
    if (message.includes('temporarily') || message.includes('overloaded') ||
        message.includes('capacity') || message.includes('try again')) {
        return true;
    }

    return false;
}

/**
 * Wraps a promise with a timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} - The wrapped promise
 */
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Request timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        promise
            .then(value => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch(err => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

/**
 * Executes a function with retry logic and exponential backoff
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise} - Result of the function
 */
export async function withRetry(fn, options = {}) {
    const {
        maxRetries = RETRY_CONFIG.maxRetries,
        initialDelayMs = RETRY_CONFIG.initialDelayMs,
        maxDelayMs = RETRY_CONFIG.maxDelayMs,
        backoffMultiplier = RETRY_CONFIG.backoffMultiplier,
        timeoutMs = RETRY_CONFIG.timeoutMs,
        onRetry = null,
    } = options;

    let lastError;
    let delay = initialDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Wrap the function call with timeout
            return await withTimeout(fn(), timeoutMs);
        } catch (error) {
            lastError = error;

            // Don't retry if it's the last attempt or error is not retryable
            if (attempt === maxRetries || !isRetryableError(error)) {
                throw error;
            }

            // Calculate delay with jitter (0-10% random addition to prevent thundering herd)
            const jitter = delay * (Math.random() * 0.1);
            const actualDelay = Math.min(delay + jitter, maxDelayMs);

            console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${actualDelay}ms. Error: ${error.message}`);

            // Call onRetry callback if provided
            if (onRetry) {
                onRetry(attempt + 1, error, actualDelay);
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, actualDelay));

            // Increase delay for next attempt
            delay = Math.min(delay * backoffMultiplier, maxDelayMs);
        }
    }

    throw lastError;
}

export const generatePrompt = (inputs) => {
    return `
    Act as a financial retirement expert. Calculate the retirement projection based on the following inputs:
    
    - Current Age: ${inputs.currentAge}
    - Retirement Start Age: ${inputs.retirementStartAge}
    - Retirement End Age: ${inputs.retirementEndAge}
    - Current Savings: ${inputs.currentSavings}
    - Monthly Contribution (until retirement age only): ${inputs.monthlyContribution}
    - Monthly Net Income Desired in Retirement: ${inputs.monthlyNetIncomeDesired}
    - Annual Return Rate (Investment): ${inputs.annualReturnRate}%
    - Tax Rate on Profits: ${inputs.taxRate}%
    - Withdrawal Strategy: ${inputs.withdrawalStrategy || 'fixed'}
    ${inputs.enableBuckets ? `
    - **Bucket Strategy Enabled**: Yes
    - Bucket Safe Rate (Yield): ${inputs.bucketSafeRate}%
    - Bucket Surplus Rate (Growth): ${inputs.bucketSurplusRate}%
    ` : ''}

    Specific Calculation Instructions:
    1. **Balance at Retirement (Projected Savings)**: Calculate the Future Value of the "Current Savings" plus the Future Value of the "Monthly Contribution" (invested until retirement age).
       - **Calculation**: Use standard compound interest formula with the *Monthly Rate* (Annual Return / 12).
       - **Note**: This is your *actual* projected savings, independent of what you *need*.
    2. **Required Capital at Retirement**: Calculate the total capital required at the start of retirement to fully fund the "Monthly Net Income Desired" for the entire duration (until End Age), such that the balance reaches exactly 0 at the end.
       - **Independence**: This value depends ONLY on the desired income, the duration of retirement, the annual return rate, and the tax rate. It is NOT affected by "Current Savings" or "Monthly Contribution".
       - **Accounting**: You must account for the fact that the remaining capital continues to earn interest during retirement, and that tax is paid on the profits component of the withdrawals.
    2. **Needed Today (Deficit)**: Calculate what is needed TODAY to reach that "Required Capital at Retirement".
       - First, calculate the Projected Savings at retirement (Future Value of "Current Savings" + Future Value of "Monthly Contribution").
       - Then, compare: If Projected Savings < Required Capital, calculate the difference (Deficit) and discount it to Present Value (Needed Today).
       - If Projected Savings > Required Capital, then "Needed Today" is 0 (surplus).
    3. **Balance at End**: Calculate the projected balance at the end of the retirement period.
       - **Scenario A (Deficit)**: If the funds run out before "Retirement End Age", this value MUST be 0.
       - **Scenario B (Surplus)**: If there is a surplus (Projected Savings > Required Capital), this surplus amount remains untouched during retirement (as the Required Capital covers all income needs).
         - **Calculation**: Simply calculate the future value of this surplus at the "Retirement End Age" by applying the compound interest (Annual Return Rate) for the entire duration of retirement (from Start Age to End Age).
         - **Constraints**: Do NOT deduct any withdrawals from this surplus. Do NOT apply any tax to this final balance (tax is assumed to be paid on the monthly interest generated, or the rate is net, but no lump-sum tax applies at the end).
         - **Logic**: It is simply: Surplus + Accumulated Interest on Surplus.
    4. **Required Capital for Perpetuity (Preservation)**: Calculate the capital needed at retirement age to generate the desired monthly net income indefinitely (living off interest only, preserving the principal).
       - **Logic**: The monthly interest generated by this capital, *after* deducting the tax on that interest, must exactly equal the "Monthly Net Income Desired".
    5. **Needed Today for Preservation**: Calculate the amount needed TODAY (as a lump sum replacing Current Savings) to reach the "Required Capital for Perpetuity" at retirement age, taking into account the "Monthly Contribution".
       - **Logic**: You need to find the starting sum (Present Value) that, when growing at the "Annual Return Rate" until retirement, AND adding the accumulated value of the "Monthly Contribution" (growing at the same rate), will result in the "Required Capital for Perpetuity".
       - **Consider**: The Future Value of the Monthly Contributions reduces the amount needed from the starting sum.
       - **Result**: If the contributions alone are sufficient or more than enough, the "Needed Today" value should be negative (indicating a surplus). Do NOT default to zero.
    6. **Initial Gross Withdrawal**: Calculate the monthly gross withdrawal needed to get the desired net income (Net = Gross - Tax).

    Return the result strictly in the following JSON format (no markdown, no extra text):
    {
        "balanceAtRetirement": number,
        "balanceAtEnd": number,
        "ranOutAtAge": number or null,
        "requiredCapitalAtRetirement": number,
        "requiredCapitalForPerpetuity": number,
        "surplus": number (positive if surplus, negative if deficit),
        "pvOfDeficit": number (0 if surplus),
        "pvOfCapitalPreservation": number (0 if surplus),
        "initialGrossWithdrawal": number
    }
    `;
};

// Helper to generate history locally based on AI summary
function generateHistoryFromSummary(inputs, aiResult) {
    const history = [];
    const currentAge = parseFloat(inputs.currentAge);
    const retirementStartAge = parseFloat(inputs.retirementStartAge);
    const retirementEndAge = parseFloat(inputs.retirementEndAge);

    // 1. Accumulation Phase
    // We need to grow from currentSavings to aiResult.balanceAtRetirement
    // We'll use a simple CAGR or linear interpolation if the math doesn't perfectly align, 
    // but ideally we simulate the growth.
    // To ensure we hit the EXACT AI target, we can just interpolate the balance.

    const accumulationYears = retirementStartAge - currentAge;
    const startBalance = parseFloat(inputs.currentSavings);
    const targetRetirementBalance = aiResult.balanceAtRetirement;

    // Calculate CAGR to hit the target exactly
    // FV = PV * (1 + r)^n  =>  r = (FV / PV)^(1/n) - 1
    // If startBalance is 0, we can't use CAGR directly, so we fallback to linear or just adding contributions.
    // But here we are just interpolating the *total* balance.

    let cagr = 0;
    if (startBalance > 0 && targetRetirementBalance > startBalance && accumulationYears > 0) {
        cagr = Math.pow(targetRetirementBalance / startBalance, 1 / accumulationYears) - 1;
    }

    for (let i = 0; i <= accumulationYears; i++) {
        const age = currentAge + i;
        let balance;

        if (accumulationYears === 0) {
            balance = startBalance;
        } else if (startBalance > 0 && cagr > 0) {
            // Exponential growth
            balance = startBalance * Math.pow(1 + cagr, i);
        } else {
            // Linear fallback (e.g. if starting from 0)
            balance = startBalance + (targetRetirementBalance - startBalance) * (i / accumulationYears);
        }

        history.push({
            age: age,
            balance: balance,
            accumulatedWithdrawals: 0,
            phase: "accumulation"
        });
    }

    // 2. Decumulation Phase
    const decumulationYears = retirementEndAge - retirementStartAge;
    let currentBalance = targetRetirementBalance;
    let accumulatedWithdrawals = 0;
    const monthlyWithdrawal = aiResult.initialGrossWithdrawal;
    const annualWithdrawal = monthlyWithdrawal * 12;
    // We need to hit aiResult.balanceAtEnd (or 0 if ran out)

    // If ranOutAtAge is set, we need to hit 0 at that age.
    const actualEndAge = aiResult.ranOutAtAge || retirementEndAge;

    for (let i = 1; i <= decumulationYears; i++) {
        const age = retirementStartAge + i;

        // Stop if we pass the AI's predicted run-out age
        if (age > actualEndAge) {
            break;
        }

        // Apply return
        currentBalance = currentBalance * (1 + inputs.annualReturnRate / 100);
        // Subtract withdrawal
        currentBalance -= annualWithdrawal;
        accumulatedWithdrawals += annualWithdrawal;

        if (currentBalance <= 0) {
            currentBalance = 0;
            history.push({
                age: age,
                balance: 0,
                accumulatedWithdrawals: accumulatedWithdrawals,
                phase: "decumulation"
            });
            break; // Stop generating history when money runs out
        }

        history.push({
            age: age,
            balance: currentBalance,
            accumulatedWithdrawals: accumulatedWithdrawals,
            phase: "decumulation"
        });
    }

    return history;
}

export async function calculateRetirementWithAI(inputs, provider, model, apiKeyOverride = null, mathematicalBaseline = null, t = null, { signal } = {}) {
    let prompt = inputs.prompt || generatePrompt(inputs);

    if (mathematicalBaseline) {
        // We only provide the balance at retirement as a sanity check, but let the AI do the rest.
        prompt += `\n    Reference Value (Sanity Check): Balance at Retirement should be approx ${mathematicalBaseline.balanceAtRetirement}.`;
    }

    // Add explicit formulas to guide the AI's logic without giving the answer
    prompt += `
    
    `;

    // Helper function to format error messages with parameters
    const formatError = (key, params = {}) => {
        if (!t) {
            // Fallback to English if no translation function
            const fallbacks = {
                errorTimeout: 'Request timed out. The AI service may be slow. Please try again.',
                errorRateLimit: 'Rate limit exceeded. Please try again later or use a different model.',
                errorInvalidApiKey: 'Invalid API key. Please check your credentials in settings.',
                errorModelNotFound: `Model "{model}" not found for {provider}. Please select a different model.`,
                errorNetwork: 'Network error. Please check your internet connection and try again.',
                errorJsonParse: 'Failed to parse AI response. The model may have returned invalid data. Please try again or use a different model.',
                errorMissingApiKey: `Missing API key for provider: {provider}. Please configure your .env file or provide an API key override in settings.`,
                errorGeneric: `AI calculation failed: {error}. Please try again or switch to mathematical mode.`
            };
            let message = fallbacks[key] || key;
            // Replace parameters in the message
            Object.keys(params).forEach(param => {
                message = message.replace(`{${param}}`, params[param]);
            });
            return message;
        }

        let message = t(key);
        // Replace parameters in the message
        Object.keys(params).forEach(param => {
            message = message.replace(`{${param}}`, params[param]);
        });
        return message;
    };

    // Validate API key before making the request
    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);

    if (!apiKey) {
        throw new Error(formatError('errorMissingApiKey', { provider }));
    }

    try {
        let responseText = "";

        // Check if already aborted
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        const onRetry = null;

        if (provider === 'gemini') {
            const { GoogleGenerativeAI } = await import("@google/generative-ai");

            const genAI = new GoogleGenerativeAI(apiKey);

            // Helper to try generating content with a specific model
            const tryGenerate = async (modelId) => {
                const genModel = genAI.getGenerativeModel({
                    model: modelId,
                    generationConfig: { temperature: 0 }
                });
                const result = await genModel.generateContent(prompt);
                return result.response.text();
            };

            try {
                // Wrap the API call with retry logic
                responseText = await withRetry(() => tryGenerate(model), { onRetry });
            } catch (primaryError) {
                // If primary model fails with 404, try fallbacks
                if (primaryError.message.includes('404') || primaryError.message.includes('not found')) {
                    const fallbacks = ['gemini-1.5-flash', 'gemini-1.5-flash-001', 'gemini-pro', 'gemini-1.0-pro'];
                    const alternative = fallbacks.find(m => m !== model);

                    if (alternative) {

                        responseText = await withRetry(() => tryGenerate(alternative), { onRetry });
                    } else {
                        throw primaryError;
                    }
                } else {
                    throw primaryError;
                }
            }

        } else if (provider === 'openai') {
            const { default: OpenAI } = await import("openai");
            const openai = new OpenAI({
                apiKey: apiKey,
                dangerouslyAllowBrowser: true // Client-side usage
            });

            // Wrap OpenAI call with retry
            const completion = await withRetry(async () => {
                return openai.chat.completions.create({
                    messages: [{ role: "user", content: prompt }],
                    model: model,
                    temperature: 0,
                    response_format: { type: "json_object" }
                });
            }, { onRetry });

            responseText = completion.choices[0].message.content;
        } else if (provider === 'anthropic') {
            const { default: Anthropic } = await import("@anthropic-ai/sdk");
            const anthropic = new Anthropic({
                apiKey: apiKey,
                dangerouslyAllowBrowser: true // Client-side usage
            });

            // Wrap Anthropic call with retry
            const message = await withRetry(async () => {
                return anthropic.messages.create({
                    model: model,
                    max_tokens: 4096,
                    temperature: 0,
                    messages: [{ role: "user", content: prompt }]
                });
            }, { onRetry });

            responseText = message.content[0].text;
        }

        // Check if aborted while waiting for response
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        // More robust JSON extraction:
        // 1. Remove markdown blocks if they exist
        let cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        // 2. Find the first '{' and the last '}' to isolate the JSON object
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }

        const parsed = JSON.parse(cleaned);

        // Data Normalization (Crucial for different AI behaviors)
        // 1. Normalize tax rates: AI often returns 10 instead of 0.10
        if (parsed.taxBrackets) {
            parsed.taxBrackets = parsed.taxBrackets.map(b => ({
                ...b,
                rate: b.rate > 1 ? b.rate / 100 : b.rate
            }));
        }

        // 2. Normalize NI seniority rates: AI might return 2 instead of 0.02 or 2% as 2
        // Our system currently uses 2 for 2% (integer) in calculating, so keep it consistent 
        // with the existing logic in pensionCalculator.js which does rate/100 later or expects percent.
        // Actually pensionCalculator uses 2 for 2%.

        // Only generate history for "Projection" responses (which have balanceAtRetirement)
        if (parsed.balanceAtRetirement !== undefined) {
            parsed.history = generateHistoryFromSummary(inputs, parsed);
        }

        parsed.source = 'ai';
        return parsed;

    } catch (error) {
        console.error("AI Calculation Error:", error);

        // Enhanced error handling with specific messages
        if (error.message?.includes('timeout')) {
            throw new Error(formatError('errorTimeout'));
        } else if (error.status === 429 || error.message?.includes('429') || error.message?.includes('rate limit')) {
            throw new Error(formatError('errorRateLimit'));
        } else if (error.status === 401 || error.message?.includes('401') || error.message?.includes('Unauthorized') || error.message?.includes('API key')) {
            throw new Error(formatError('errorInvalidApiKey'));
        } else if (error.status === 404 || error.message?.includes('404') || error.message?.includes('not found')) {
            throw new Error(formatError('errorModelNotFound', { model, provider }));
        } else if (error.message?.toLowerCase().includes('network') || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.message?.includes('fetch')) {
            throw new Error(formatError('errorNetwork'));
        } else if (error instanceof SyntaxError || error.message?.includes('JSON')) {
            throw new Error(formatError('errorJsonParse'));
        }

        // Generic error with original message
        throw new Error(formatError('errorGeneric', { error: error.message || 'Unknown error' }));
    }
}

/**
 * Generates dynamic retirement planning checklist insights using AI.
 * Returns { categories: [{ id, title, emoji, items: [{ priority, title, description, details }] }] }
 */
export async function generateRetirementChecklistInsights(inputs, results, provider, model, apiKeyOverride, language) {
    const isHe = language === 'he';
    const fmt = (n) => n ? Math.round(n).toLocaleString() : '0';

    const OFFICIAL_RETIREMENT_AGE = 67; // Israel statutory retirement age for men (women: 65)
    const earlyRetirementAge = parseFloat(inputs.retirementStartAge);
    const isEarlyRetirement = earlyRetirementAge < OFFICIAL_RETIREMENT_AGE;
    const gapYears = isEarlyRetirement ? Math.round((OFFICIAL_RETIREMENT_AGE - earlyRetirementAge) * 10) / 10 : 0;

    const context = [
        `Current age: ${inputs.currentAge}`,
        `EARLY retirement age (stops working): ${earlyRetirementAge} — this is NOT the official Israeli retirement age`,
        isEarlyRetirement
            ? `Gap until official NI retirement age (67): ${gapYears} years — during this entire gap the person is NOT employed and NOT contributing to National Insurance through work`
            : null,
        `Plan end age: ${inputs.retirementEndAge}`,
        `Current savings: ${fmt(inputs.currentSavings)} ILS`,
        `Monthly contribution until retirement: ${fmt(inputs.monthlyContribution)} ILS`,
        `Monthly net income desired in retirement: ${fmt(inputs.monthlyNetIncomeDesired)} ILS`,
        `Tax rate: ${inputs.taxRate}%`,
        `Annual return: ${inputs.annualReturnRate}%, Inflation: ${inputs.inflationRate || 0}%`,
        results ? `Projected balance at early retirement: ${fmt(results.balanceAtRetirement)} ILS` : null,
        results?.ranOutAtAge ? `WARNING: funds run out at age ${results.ranOutAtAge}` : null,
        results?.surplus > 0 ? `Surplus at end of plan: ${fmt(results.surplus)} ILS` : null,
        results?.surplus < 0 ? `DEFICIT: ${fmt(Math.abs(results.surplus))} ILS shortfall` : null,
        isEarlyRetirement
            ? `CRITICAL CONTEXT — GAP YEARS (age ${earlyRetirementAge}–67): No employment income. Must actively manage: (1) voluntary NI payments (תשלומים מרצון לביטוח לאומי) to preserve old-age pension entitlement and health insurance; (2) health insurance collected via NI even for non-workers; (3) zero employer/employee pension contributions — pension fund grows only from existing balance; (4) no work-related tax credits`
            : null,
        isEarlyRetirement
            ? `PENSION IMPACT: The occupational pension (קרן פנסיה/ביטוח מנהלים) stops receiving contributions at age ${earlyRetirementAge}. For the ${gapYears}-year gap until age 67 it accumulates returns only on existing balance. The monthly pension income starting at 67 will be significantly lower than if contributions had continued until 67. The client should: (1) calculate the expected pension at 67 under this scenario; (2) consider voluntary additional contributions (הפקדות עצמאיות) to the pension fund during early retirement if cash-flow allows; (3) understand the actuarial reduction for early pension withdrawal if they try to draw pension before 67; (4) verify vesting (זכאות) status and pension-type rules (defined benefit vs. defined contribution)`
            : null,
        inputs.pensionIncomeSources?.length
            ? `Pension income sources defined: ${inputs.pensionIncomeSources.length} source(s) starting at various ages`
            : `No pension income sources defined — pension income during retirement is not factored in`,
    ].filter(Boolean).join('\n');

    const jsonSchema = `{
  "categories": [
    {
      "id": "string (unique slug)",
      "title": "${isHe ? 'כותרת בעברית' : 'Category title'}",
      "emoji": "single emoji",
      "items": [
        {
          "id": "stable-kebab-case-id (e.g. ni-voluntary-payment, insurance-ltc) — must remain identical across regenerations for the same concept",
          "priority": "critical | high | medium | low",
          "title": "${isHe ? 'כותרת פריט' : 'Item title'}",
          "description": "${isHe ? 'תיאור קצר' : 'Short description'}",
          "details": "${isHe ? 'פרטים מורחבים (אופציונלי)' : 'Extended details (optional)'}"
        }
      ]
    }
  ]
}`;

    const prompt = isHe
        ? `אתה יועץ פרישה ישראלי מומחה. בהתבסס על הנתונים הבאים, צור רשימת תכנון מפורטת ומותאמת אישית לתקופת הפרישה המוקדמת בישראל.

נתוני הלקוח:
${context}

החזר JSON בפורמט הבא בלבד (ללא טקסט נוסף):
${jsonSchema}

הנחיות:
- זוהי פרישה מוקדמת — הלקוח אינו עובד אבל עדיין לא הגיע לגיל הפרישה הרשמי (67)
${isEarlyRetirement ? `- יש פער של ${gapYears} שנים עד גיל 67 שבו אין הכנסה מעבודה ואין תשלומי ביטוח לאומי אוטומטיים
- קטגוריית ביטוח לאומי חייבת להתמקד בתקופת הפער: תשלומים מרצון, שמירת זכויות, ביטוח בריאות` : ''}
- כלול קטגוריות: ביטוח לאומי (פער עד גיל 67), פנסיה והשפעות הפרישה המוקדמת, ביטוח, מיסוי, ניהול פיננסי, בריאות, משפטי/עיזבון, אורח חיים
- בקטגוריית ביטוח לאומי: אל תשתמש באמוג'י דגל. כלול תשלומים מרצון, עלות משוערת, השלכות על קצבת זקנה, ביטוח בריאות דרך ביטוח לאומי בתקופת הפער
- בקטגוריית פנסיה: הסבר את ההשפעה של הפסקת הפקדות על גובה הקצבה בגיל 67, שיקול הפקדות עצמאיות בתקופת הפרישה המוקדמת, מועד משיכה ראשון אפשרי, הפחתה אקטוארית
- התאם את הפריטים לנתונים האישיים
- סמן כ-critical דברים שאם לא מטפלים בהם מאבדים זכויות
- כלול 3-6 פריטים לקטגוריה
- הגב בעברית בלבד`
        : `You are an expert Israeli retirement advisor. Based on the following client data, generate a detailed personalized checklist for EARLY retirement in Israel.

Client data:
${context}

Return ONLY JSON in this exact format (no extra text):
${jsonSchema}

Guidelines:
- This is EARLY retirement — the client stops working before the official Israeli retirement age (67)
${isEarlyRetirement ? `- There is a ${gapYears}-year gap until age 67 with no employment income and no automatic NI contributions
- The National Insurance category must focus on this gap: voluntary payments, preserving entitlements, health insurance` : ''}
- Include categories: National Insurance (gap until 67), Pension & Early Retirement Impact, Insurance, Taxation, Financial Management, Healthcare, Legal/Estate, Lifestyle
- For National Insurance: do NOT use a flag emoji. Include voluntary payment obligation, estimated cost, impact on old-age pension entitlement, health insurance via NI during the gap years
- For Pension: impact of stopping contributions on the monthly pension at 67, whether voluntary contributions during early retirement are worth it, earliest possible withdrawal age, actuarial reduction for early draw, vesting status
- Personalize items based on the client data
- Mark as critical anything where inaction results in loss of rights or coverage
- Include 3-6 items per category
- Respond in English only`;

    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);
    if (!apiKey) throw new Error(`Missing API key for provider: ${provider}`);

    let responseText = '';

    if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const genModel = genAI.getGenerativeModel({ model, generationConfig: { temperature: 0.3 } });
        const result = await genModel.generateContent(prompt);
        responseText = result.response.text();
    } else if (provider === 'openai') {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        const completion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model,
            temperature: 0.3,
            response_format: { type: 'json_object' },
        });
        responseText = completion.choices[0].message.content;
    } else if (provider === 'anthropic') {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        const message = await anthropic.messages.create({
            model,
            max_tokens: 4096,
            temperature: 0.3,
            messages: [{ role: 'user', content: prompt }],
        });
        responseText = message.content[0].text;
    }

    const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const jsonStr = firstBrace !== -1 ? cleaned.substring(firstBrace, lastBrace + 1) : cleaned;
    return JSON.parse(jsonStr);
}
