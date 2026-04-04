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
/**
 * Apply a diff (add/remove/update) from the AI onto the existing flat item map.
 * existingMap: { [itemId]: { categoryId, priority, title, description, details } }
 * diff: { add: [...], remove: [...itemIds], update: [...] }
 * Returns new merged categories array.
 */
// Hebrew prefix prepositions that change the first letters without changing meaning
const HE_PREFIX_RE = /^[בלמהוכשד]+/u;

// Extract stems: strip Hebrew prefixes, lowercase, take first 5 chars of each word ≥3 chars
function stemSet(title) {
    return new Set(
        (title || '')
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 3)
            .map(w => {
                const lower = w.toLowerCase();
                const stripped = lower.replace(HE_PREFIX_RE, '');
                return (stripped.length >= 2 ? stripped : lower).slice(0, 5);
            })
    );
}

// Returns true if newTitle covers the same topic as any existing item
function isSemanticallyDuplicate(newTitle, newCatId, existingEntries) {
    const newStems = stemSet(newTitle);
    if (newStems.size === 0) return false;
    for (const { catId, item } of existingEntries) {
        const existStems = stemSet(item.title);
        let overlap = 0;
        for (const s of newStems) { if (existStems.has(s)) overlap++; }
        const minSize = Math.min(newStems.size, existStems.size);
        if (minSize < 1) continue;
        // Same category: 2+ overlapping stems = duplicate
        if (catId === newCatId && overlap >= 2) return true;
        // Any category: ≥60% of the shorter title's stems overlap = duplicate
        if (overlap >= 2 && overlap / minSize >= 0.6) return true;
    }
    return false;
}

function applyChecklistDiff(existingCategories, diff, dismissedItemIds = new Set(), keptItemIds = new Set()) {
    // Build mutable map: itemId → { catId, item }
    const itemMap = {};
    const catMeta = {}; // catId → { id, title, emoji }
    for (const cat of (existingCategories || [])) {
        catMeta[cat.id] = { id: cat.id, title: cat.title, emoji: cat.emoji || '' };
        for (const item of (cat.items || [])) {
            itemMap[item.id] = { catId: cat.id, item: { ...item } };
        }
    }

    // 1. Flag items suggested for removal — do NOT delete, let the user decide
    // Skip if user has already explicitly chosen to keep this item
    for (const id of (diff.remove || [])) {
        if (itemMap[id] && !keptItemIds.has(id)) {
            itemMap[id].item = { ...itemMap[id].item, aiSuggestedRemoval: true };
        }
    }

    // 2. Add new items — semantic dedup before inserting
    const existingEntries = Object.values(itemMap); // snapshot before we start adding

    for (const newItem of (diff.add || [])) {
        if (!newItem.id || !newItem.categoryId) continue;
        if (itemMap[newItem.id]) continue; // exact ID already exists
        if (dismissedItemIds.has(newItem.id)) continue; // user dismissed this item
        if (isSemanticallyDuplicate(newItem.title, newItem.categoryId, existingEntries)) continue;
        // Ensure category meta exists
        if (!catMeta[newItem.categoryId]) {
            catMeta[newItem.categoryId] = { id: newItem.categoryId, title: newItem.categoryTitle || newItem.categoryId, emoji: '' };
        }
        const entry = { catId: newItem.categoryId, item: { id: newItem.id, priority: newItem.priority || 'medium', title: newItem.title || '', description: newItem.description || '', details: newItem.details || '' } };
        itemMap[newItem.id] = entry;
        existingEntries.push(entry); // block further dupes within the same diff batch
    }

    // Rebuild categories preserving original order + appending new cats
    const catOrder = [...new Set([...(existingCategories || []).map(c => c.id), ...Object.values(itemMap).map(e => e.catId)])];
    return catOrder
        .map(catId => ({
            ...catMeta[catId],
            id: catId,
            items: Object.values(itemMap).filter(e => e.catId === catId).map(e => e.item),
        }))
        .filter(c => c.items.length > 0);
}

export async function generateRetirementChecklistInsights(inputs, results, provider, model, apiKeyOverride, language, existingCategories, dismissedItemIds = new Set(), keptItemIds = new Set()) {
    const isHe = language === 'he';
    const fmt = (n) => n ? Math.round(n).toLocaleString() : '0';

    const OFFICIAL_RETIREMENT_AGE = 67; // Israel statutory retirement age for men (women: 65)
    const earlyRetirementAge = parseFloat(inputs.retirementStartAge);
    const isEarlyRetirement = earlyRetirementAge < OFFICIAL_RETIREMENT_AGE;
    const gapYears = isEarlyRetirement ? Math.round((OFFICIAL_RETIREMENT_AGE - earlyRetirementAge) * 10) / 10 : 0;

    const pensionSources = inputs.pensionIncomeSources || [];
    const pensionDetail = pensionSources.length > 0
        ? pensionSources.map(s => `"${s.name || 'Pension'}": ${fmt(s.monthlyAmount || 0)} ILS/month starting age ${s.startAge}`).join('; ')
        : null;

    const annualWithdrawal = (parseFloat(inputs.monthlyNetIncomeDesired) || 0) * 12;
    const balance = results?.balanceAtRetirement || 0;
    const withdrawalRate = balance > 0 ? ((annualWithdrawal / balance) * 100).toFixed(1) : null;

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
        `Tax rate on withdrawals: ${inputs.taxRate}%`,
        `Annual return: ${inputs.annualReturnRate}%, Inflation: ${inputs.inflationRate || 0}%`,
        `Withdrawal strategy: ${inputs.withdrawalStrategy || 'fixed'} (fixed=constant, dynamic=adjusts to market, percent=% of portfolio)`,
        inputs.enableBuckets ? `Bucket strategy ENABLED — portfolio split into safe/moderate/growth buckets with different return rates` : `Bucket strategy not used — single portfolio`,
        withdrawalRate ? `Computed withdrawal rate: ${withdrawalRate}% per year${parseFloat(withdrawalRate) > 5 ? ' — ABOVE the 4% safe withdrawal rule' : ' — within sustainable range'}` : null,
        results ? `Projected balance at early retirement: ${fmt(results.balanceAtRetirement)} ILS` : null,
        results?.ranOutAtAge ? `WARNING: funds run out at age ${results.ranOutAtAge}` : null,
        results?.surplus > 0 ? `Surplus at end of plan: ${fmt(results.surplus)} ILS` : null,
        results?.surplus < 0 ? `DEFICIT: ${fmt(Math.abs(results.surplus))} ILS shortfall` : null,
        pensionDetail
            ? `Pension income sources defined (${pensionSources.length}): ${pensionDetail}`
            : `No pension income sources defined — retirement funded entirely from savings withdrawals`,
        isEarlyRetirement
            ? `CRITICAL CONTEXT — GAP YEARS (age ${earlyRetirementAge}–67): No employment income. Must actively manage: (1) voluntary NI payments (תשלומים מרצון לביטוח לאומי) to preserve old-age pension entitlement and health insurance; (2) health insurance collected via NI even for non-workers; (3) zero employer/employee pension contributions — pension fund grows only from existing balance; (4) no work-related tax credits`
            : null,
        isEarlyRetirement
            ? `PENSION IMPACT: The occupational pension (קרן פנסיה/ביטוח מנהלים) stops receiving contributions at age ${earlyRetirementAge}. For the ${gapYears}-year gap until age 67 it accumulates returns only on existing balance. The monthly pension income starting at 67 will be significantly lower than if contributions had continued until 67. The client should: (1) calculate the expected pension at 67 under this scenario; (2) consider voluntary additional contributions (הפקדות עצמאיות) to the pension fund during early retirement if cash-flow allows; (3) understand the actuarial reduction for early pension withdrawal if they try to draw pension before 67; (4) verify vesting (זכאות) status and pension-type rules (defined benefit vs. defined contribution)`
            : null,
    ].filter(Boolean).join('\n');

    const hasExisting = existingCategories && existingCategories.length > 0;

    // Summarize existing items — include description for semantic coverage judgment
    const existingSummary = hasExisting
        ? (() => {
            const totalItems = existingCategories.reduce((n, c) => n + (c.items || []).length, 0);
            const body = existingCategories.map(cat =>
                `[${cat.id}] ${cat.title}:\n` +
                (cat.items || []).map(i =>
                    `  - id="${i.id}" priority=${i.priority}: ${i.title}` +
                    (i.description ? ` — ${i.description.slice(0, 150)}` : '')
                ).join('\n')
            ).join('\n');
            return `Total existing items: ${totalItems}\n\n${body}`;
        })()
        : null;

    const jsonSchema = hasExisting ? `{
  "add": [
    {
      "id": "stable-kebab-id",
      "categoryId": "category-slug (must match existing category id or a new one)",
      "categoryTitle": "${isHe ? 'כותרת קטגוריה (רק אם חדשה)' : 'Category title (only if new)'}",
      "priority": "critical | high | medium | low",
      "title": "${isHe ? 'כותרת פריט' : 'Item title'}",
      "description": "${isHe ? 'תיאור' : 'Description'}",
      "details": "${isHe ? 'פרטים' : 'Details'}"
    }
  ],
  "remove": ["item-id-that-may-no-longer-be-relevant"]
}` : `{
  "categories": [
    {
      "id": "string (unique slug)",
      "title": "${isHe ? 'כותרת בעברית' : 'Category title'}",
      "emoji": "",
      "items": [
        {
          "id": "stable-kebab-case-id (e.g. ni-voluntary-payment, insurance-ltc)",
          "priority": "critical | high | medium | low",
          "title": "${isHe ? 'כותרת פריט' : 'Item title'}",
          "description": "${isHe ? 'תיאור קצר' : 'Short description'}",
          "details": "${isHe ? 'פרטים מורחבים (אופציונלי)' : 'Extended details (optional)'}"
        }
      ]
    }
  ]
}`;

    const sharedGuidelines = isHe ? `
- השתמש ב-IDs קבועים לקטגוריות: national-insurance, pension, insurance, tax, financial, healthcare, legal, lifestyle
- שדה emoji חייב להיות מחרוזת ריקה ""
- סמן כ-critical דברים שאם לא מטפלים בהם מאבדים זכויות
- הגב בעברית בלבד` : `
- Use these EXACT category IDs: national-insurance, pension, insurance, tax, financial, healthcare, legal, lifestyle
- The emoji field MUST be an empty string ""
- Mark as critical anything where inaction results in loss of rights or coverage
- Respond in English only`;

    const earlyRetirementNote = isEarlyRetirement
        ? (isHe
            ? `- יש פער של ${gapYears} שנים עד גיל 67 ללא הכנסת עבודה ותשלומי ביטוח לאומי אוטומטיים`
            : `- There is a ${gapYears}-year gap until age 67 with no employment income and no automatic NI contributions`)
        : '';

    const prompt = hasExisting
        ? (isHe
            ? `אתה יועץ פרישה ישראלי מומחה. הלקוח קיבל רשימת תכנון לפרישה. הרשימה קבועה — אתה לא יכול לשנות פריטים קיימים.

תפקידך הכפול:
1. לזהות נושאים חשובים שחסרים לחלוטין מהרשימה ולהציע להוסיף אותם
2. לזהות פריטים קיימים שאולי כבר לא רלוונטיים לפרופיל הלקוח ולסמן אותם לבדיקה (הם לא יימחקו אוטומטית — המשתמש יחליט)

נתוני הלקוח:
${context}

רשימה קיימת (קרא אותה לפני שאתה מחליט!):
${existingSummary}

החזר JSON בפורמט diff בלבד (ללא טקסט נוסף):
${jsonSchema}

כללים מחייבים:
- לפני כל הוספה: עבור על כל הפריטים הקיימים ושאל "האם מילות המפתח של ההצעה שלי מופיעות כבר בכותרת או בתיאור של פריט קיים?" אם כן — אל תוסיף
- השוואה לפי מהות ולא לפי ניסוח. "ביטוח בריאות", "כיסוי רפואי", "ביטוח פרטי לבריאות" — כולם אותו נושא
- טרם כל הצעה, ציין לעצמך מה ה-ID של הפריט הקיים שמכסה נושא דומה. אם אין — אפשר להוסיף
- הוסף רק נושא שלא קיים בשום פריט, גם לא ברמז
- סמן להסרה (remove) פריטים שאינם רלוונטיים — הם לא יימחקו, רק יסומנו
- אל תשנה פריטים קיימים
- אם אין שינויים — החזר {"add":[],"remove":[]}
${earlyRetirementNote}${sharedGuidelines}`
            : `You are an expert Israeli retirement advisor. The client has a retirement planning checklist. This list is the source of truth — you cannot modify existing items.

Your dual role:
1. Identify important topics completely missing from the list and suggest adding them
2. Identify existing items that may no longer be relevant to this client's profile and flag them for review (they will NOT be deleted automatically — the user decides)

Client data:
${context}

Existing checklist (read it carefully before deciding!):
${existingSummary}

Return ONLY a diff JSON (no extra text):
${jsonSchema}

Binding rules:
- Before proposing any addition, scan every existing item and ask: "Do the key words of my proposed item already appear in any existing item's title or description?" If yes — skip it
- Comparison is by meaning, not wording. "Private health insurance", "medical coverage", "health plan" are the same topic
- For each proposed addition, identify which existing item ID covers the most similar topic. Only add if no existing item is related
- Only add a topic completely absent from the list in any form
- Flag for removal (remove) items not relevant to the client's data — they will only be marked, not deleted
- Do NOT modify existing items
- If nothing needs to change — return {"add":[],"remove":[]}
${earlyRetirementNote}${sharedGuidelines}`)
        : (isHe
            ? `אתה יועץ פרישה ישראלי מומחה. בהתבסס על הנתונים הבאים, צור רשימת תכנון מפורטת ומותאמת אישית.

נתוני הלקוח:
${context}

החזר JSON בפורמט הבא בלבד (ללא טקסט נוסף):
${jsonSchema}

הנחיות:
- כלול קטגוריות: ביטוח לאומי, פנסיה, ביטוח, מיסוי, ניהול פיננסי, בריאות, משפטי/עיזבון, אורח חיים
${earlyRetirementNote}
- כלול 3-6 פריטים לקטגוריה${sharedGuidelines}`
            : `You are an expert Israeli retirement advisor. Generate a detailed personalized planning checklist based on the client data below.

Client data:
${context}

Return ONLY JSON in this exact format (no extra text):
${jsonSchema}

Guidelines:
- Include categories: National Insurance, Pension, Insurance, Taxation, Financial Management, Healthcare, Legal/Estate, Lifestyle
${earlyRetirementNote}
- Include 3-6 items per category${sharedGuidelines}`);

    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);
    if (!apiKey) throw new Error(`Missing API key for provider: ${provider}`);

    let responseText = '';

    if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const genModel = genAI.getGenerativeModel({ model, generationConfig: { temperature: 0.3 } });
        responseText = await withRetry(() => genModel.generateContent(prompt).then(r => r.response.text()));
    } else if (provider === 'openai') {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        const completion = await withRetry(() => openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model,
            temperature: 0.3,
            response_format: { type: 'json_object' },
        }));
        responseText = completion.choices[0].message.content;
    } else if (provider === 'anthropic') {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        const message = await withRetry(() => anthropic.messages.create({
            model,
            max_tokens: 4096,
            temperature: 0.3,
            messages: [{ role: 'user', content: prompt }],
        }));
        responseText = message.content[0].text;
    }

    const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const jsonStr = firstBrace !== -1 ? cleaned.substring(firstBrace, lastBrace + 1) : cleaned;

    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        throw new Error('AI returned malformed JSON — could not parse response');
    }

    const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);

    if (hasExisting) {
        // Diff mode: validate and apply diff onto existing categories
        if (!parsed || typeof parsed !== 'object') throw new Error('AI returned malformed diff JSON');
        const diff = {
            add: Array.isArray(parsed.add) ? parsed.add : [],
            remove: Array.isArray(parsed.remove) ? parsed.remove : [],
        };
        // Normalize new items
        diff.add = diff.add
            .filter(i => i && i.id && i.categoryId && (i.title || i.description))
            .map(i => ({
                id: String(i.id).trim(),
                categoryId: String(i.categoryId).trim(),
                categoryTitle: String(i.categoryTitle || i.categoryId),
                priority: VALID_PRIORITIES.has(i.priority) ? i.priority : 'medium',
                title: String(i.title || ''),
                description: String(i.description || ''),
                details: String(i.details || ''),
            }))
;
        diff.remove = diff.remove.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim());

        const mergedCategories = applyChecklistDiff(existingCategories, diff, dismissedItemIds, keptItemIds);
        return { categories: mergedCategories, diff };
    }

    // Full generation mode
    if (!parsed || !Array.isArray(parsed.categories)) {
        throw new Error('AI response missing required "categories" array');
    }
    parsed.categories = parsed.categories
        .filter(c => c && Array.isArray(c.items) && c.items.length > 0)
        .map(c => ({
            id: String(c.id || c.title || 'cat').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9א-ת-]/g, ''),
            title: String(c.title || ''),
            emoji: String(c.emoji || ''),
            items: c.items
                .filter(i => i && (i.title || i.description))
                .map(i => ({
                    id: String(i.id || '').trim(),
                    priority: VALID_PRIORITIES.has(i.priority) ? i.priority : 'medium',
                    title: String(i.title || ''),
                    description: String(i.description || ''),
                    details: String(i.details || ''),
                })),
        }))
        .filter(c => c.items.length > 0);

    if (parsed.categories.length === 0) {
        throw new Error('AI returned no valid categories after normalization');
    }

    return { categories: parsed.categories, diff: null };
}
