import { getProviderEnvKey } from '../config/ai-models';
import { logger } from './logger';

// Re-export for backward compatibility
export { getAvailableProviders, getAvailableModels } from '../config/ai-models';

function findMatchingBrace(str, startIdx) {
    let braceCount = 0;
    let inString = false;
    let escape = false;
    
    for (let i = startIdx; i < str.length; i++) {
        const char = str[i];
        
        if (escape) {
            escape = false;
            continue;
        }
        
        if (char === '\\') {
            escape = true;
            continue;
        }
        
        if (char === '"') {
            inString = !inString;
            continue;
        }
        
        if (!inString) {
            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    return i;
                }
            }
        }
    }
    return -1;
}

function cleanAiJsonText(responseText) {
    return String(responseText || '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .replace(/\[\d+\]/g, '')
        .trim();
}

function extractJsonObject(responseText) {
    let cleaned = cleanAiJsonText(responseText);
    const firstBrace = cleaned.indexOf('{');
    let lastBrace = -1;

    if (firstBrace !== -1) {
        lastBrace = findMatchingBrace(cleaned, firstBrace);
    }
    if (lastBrace === -1) {
        lastBrace = cleaned.lastIndexOf('}');
    }

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    return cleaned;
}

function repairCommonJsonIssues(jsonText) {
    return insertMissingJsonCommas(jsonText)
        // Remove trailing commas before object/array endings.
        .replace(/,\s*([}\]])/g, '$1');
}

function isJsonWhitespace(char) {
    return /\s/.test(char);
}

function isNumberStart(char) {
    return char === '-' || (char >= '0' && char <= '9');
}

function isLiteralStart(char) {
    return char === 't' || char === 'f' || char === 'n';
}

function nextNonWhitespace(text, index) {
    for (let i = index; i < text.length; i++) {
        if (!isJsonWhitespace(text[i])) return text[i];
    }
    return '';
}

function shouldInsertComma(lastToken) {
    return lastToken === 'value';
}

function insertMissingJsonCommas(jsonText) {
    let repaired = '';
    let lastToken = 'start';
    let i = 0;

    while (i < jsonText.length) {
        const char = jsonText[i];

        if (char === '"') {
            if (shouldInsertComma(lastToken)) repaired += ',';
            repaired += char;
            i++;

            let escaped = false;
            while (i < jsonText.length) {
                const current = jsonText[i];
                repaired += current;

                if (escaped) {
                    escaped = false;
                } else if (current === '\\') {
                    escaped = true;
                } else if (current === '"') {
                    const next = nextNonWhitespace(jsonText, i + 1);
                    lastToken = next === ':' ? 'key' : 'value';
                    break;
                }
                i++;
            }
        } else if (char === '{' || char === '[') {
            if (shouldInsertComma(lastToken)) repaired += ',';
            repaired += char;
            lastToken = 'open';
        } else if (char === '}' || char === ']') {
            repaired += char;
            lastToken = 'value';
        } else if (char === ':') {
            repaired += char;
            lastToken = 'colon';
        } else if (char === ',') {
            repaired += char;
            lastToken = 'comma';
        } else if (isNumberStart(char)) {
            if (shouldInsertComma(lastToken)) repaired += ',';
            const start = i;
            i++;
            while (i < jsonText.length && /[0-9.eE+-]/.test(jsonText[i])) i++;
            repaired += jsonText.slice(start, i);
            i--;
            lastToken = 'value';
        } else if (isLiteralStart(char)) {
            if (shouldInsertComma(lastToken)) repaired += ',';
            const start = i;
            i++;
            while (i < jsonText.length && /[A-Za-z]/.test(jsonText[i])) i++;
            repaired += jsonText.slice(start, i);
            i--;
            lastToken = 'value';
        } else {
            repaired += char;
        }

        i++;
    }

    return repaired;
}

export function parseAiJsonObject(responseText) {
    const jsonText = extractJsonObject(responseText);

    try {
        return JSON.parse(jsonText);
    } catch (firstError) {
        const repaired = repairCommonJsonIssues(jsonText);
        if (repaired !== jsonText) {
            try {
                return JSON.parse(repaired);
            } catch {
                // Fall through and throw the original parse error below.
            }
        }

        throw firstError;
    }
}

const AI_RETIREMENT_RESULT_FIELDS = [
    'balanceAtRetirement',
    'balanceAtEnd',
    'ranOutAtAge',
    'requiredCapitalAtRetirement',
    'requiredCapitalForPerpetuity',
    'surplus',
    'pvOfDeficit',
    'pvOfCapitalPreservation',
    'initialGrossWithdrawal',
];

function parseLooseNumberValue(value) {
    if (value === undefined) return undefined;
    const trimmed = String(value).trim().replace(/^"|"$/g, '');
    if (trimmed === 'null') return null;

    const normalized = trimmed.replace(/,/g, '');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : undefined;
}

export function salvageAiRetirementResult(responseText) {
    const text = cleanAiJsonText(responseText);
    const result = {};

    for (const field of AI_RETIREMENT_RESULT_FIELDS) {
        const match = text.match(new RegExp(`"${field}"\\s*:\\s*("?-?\\d[\\d,.]*"?|null)`, 'i'));
        const value = parseLooseNumberValue(match?.[1]);
        if (value !== undefined) {
            result[field] = value;
        }
    }

    const hasCoreProjection =
        Number.isFinite(result.balanceAtRetirement) &&
        Number.isFinite(result.requiredCapitalAtRetirement);

    if (!hasCoreProjection) return null;

    for (const field of AI_RETIREMENT_RESULT_FIELDS) {
        if (result[field] === undefined) {
            result[field] = field === 'ranOutAtAge' ? null : 0;
        }
    }

    return result;
}

function fallbackToMathematicalBaseline(mathematicalBaseline) {
    if (!mathematicalBaseline || typeof mathematicalBaseline !== 'object') return null;
    if (!Number.isFinite(mathematicalBaseline.balanceAtRetirement)) return null;

    return {
        ...mathematicalBaseline,
        source: 'math-fallback',
        aiFallbackReason: 'malformed-json',
    };
}

/**
 * Strips raw API noise (URLs, SDK prefixes) from error messages and attaches
 * a stable `code` so callers can show localized UI messages.
 */
function cleanApiError(err) {
    let msg = err?.message || String(err);
    // Remove "Error fetching from https://...:" prefix injected by Google AI SDK
    msg = msg.replace(/Error fetching from https?:\/\/[^\s:]+[^:]*:\s*/gi, '');
    // Remove "[GoogleGenerativeAI Error]:" prefix
    msg = msg.replace(/\[GoogleGenerativeAI Error\]:\s*/gi, '');
    msg = msg.trim();

    const status = err?.status ?? (msg.match(/\[(\d{3})\]/) ? parseInt(msg.match(/\[(\d{3})\]/)[1]) : null);
    let code = 'unknown';
    if (status === 429 || /quota|rate.?limit|429/i.test(msg)) code = 'quota';
    else if (status === 503 || /high demand|overload|503|unavailable/i.test(msg)) code = 'overload';
    else if (status === 401 || status === 403 || /api.?key|unauthorized|forbidden/i.test(msg)) code = 'auth';
    else if (/network|fetch|connect/i.test(msg)) code = 'network';

    const clean = new Error(msg);
    clean.status = status;
    clean.code = code;
    return clean;
}

/**
 * Returns a localized, user-friendly error string for AI API errors.
 */
export function localizeAiError(err, language) {
    const isHe = language === 'he';
    const code = err?.code;
    if (code === 'quota') return isHe
        ? 'חריגה ממכסת הבקשות. המתן מספר דקות ונסה שוב.'
        : 'Request quota exceeded. Please wait a few minutes and try again.';
    if (code === 'overload') return isHe
        ? 'השרת עמוס כרגע. נסה שוב בעוד מספר דקות.'
        : 'The server is currently overloaded. Please try again in a few minutes.';
    if (code === 'auth') return isHe
        ? 'מפתח API לא תקין. בדוק את ההגדרות.'
        : 'Invalid API key. Please check your settings.';
    if (code === 'network') return isHe
        ? 'שגיאת רשת. בדוק את החיבור לאינטרנט.'
        : 'Network error. Please check your internet connection.';
    return err?.message || (isHe ? 'שגיאה לא צפויה. נסה שוב.' : 'Unexpected error. Please try again.');
}

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
        shouldRetry = null, // optional override: (error) => boolean
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
            const retryable = shouldRetry ? shouldRetry(error) : isRetryableError(error);
            if (attempt === maxRetries || !retryable) {
                throw error;
            }

            // Calculate delay with jitter (0-10% random addition to prevent thundering herd)
            const jitter = delay * (Math.random() * 0.1);
            const actualDelay = Math.min(delay + jitter, maxDelayMs);

            logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${actualDelay}ms. Error: ${error.message}`);

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

export async function calculateRetirementWithAI(inputs, provider, model, apiKeyOverride = null, mathematicalBaseline = null, t = null, { signal, useGrounding = false, onGroundingSources } = {}) {
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
                const supportsGrounding = useGrounding && /gemini-1\.5|gemini-2|gemini-exp/i.test(modelId);
                const modelConfig = { model: modelId, generationConfig: { temperature: 0 } };
                if (supportsGrounding) modelConfig.tools = [{ googleSearch: {} }];
                const genModel = genAI.getGenerativeModel(modelConfig);
                const result = await genModel.generateContent(prompt);

                if (supportsGrounding && onGroundingSources) {
                    const chunks = result.response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
                    const sources = chunks
                        .filter(c => c.web?.uri)
                        .map(c => ({ title: c.web.title || c.web.uri, url: c.web.uri }));
                    if (sources.length > 0) onGroundingSources(sources);
                }

                return result.response.text();
            };

            // When grounding is requested but the chosen model doesn't support it,
            // upgrade to the cheapest grounding-capable model (same API key).
            const GROUNDING_FALLBACK = 'gemini-2.0-flash';
            const modelSupportsGrounding = /gemini-1\.5|gemini-2|gemini-exp/i.test(model);
            const effectiveModel = (useGrounding && !modelSupportsGrounding) ? GROUNDING_FALLBACK : model;

            // Don't retry quota errors on the same model — immediately try alternatives
            const notQuota = (err) => !(err.code === 'quota' || err.status === 429 || /quota|rate.?limit|429/i.test(err.message));

            try {
                responseText = await withRetry(() => tryGenerate(effectiveModel), { onRetry, shouldRetry: (err) => notQuota(err) && isRetryableError(err) });
            } catch (primaryError) {
                const isQuota = !notQuota(primaryError);
                const isNotFound = primaryError.message.includes('404') || primaryError.message.includes('not found');

                if (isNotFound || isQuota) {
                    // On 404 or quota, walk through grounding-capable fallbacks in order
                    const fallbacks = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-001', 'gemini-1.5-pro'];
                    const alternatives = fallbacks.filter(m => m !== effectiveModel);
                    let succeeded = false;
                    for (const alt of alternatives) {
                        try {
                            responseText = await withRetry(() => tryGenerate(alt), { onRetry, shouldRetry: (err) => notQuota(err) && isRetryableError(err) });
                            succeeded = true;
                            break;
                        } catch {
                            // try next
                        }
                    }
                    if (!succeeded) throw primaryError;
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

        let parsed;
        try {
            parsed = parseAiJsonObject(responseText);
        } catch (parseError) {
            parsed = salvageAiRetirementResult(responseText);
            if (!parsed) {
                const fallback = fallbackToMathematicalBaseline(mathematicalBaseline);
                if (fallback) return fallback;
                throw parseError;
            }
        }

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

function parseTiming(t) {
    if (!t || typeof t !== 'object') return undefined;
    const VALID = new Set(['before', 'after', 'atRet', 'age', 'ongoing']);
    if (!VALID.has(t.type)) return undefined;
    if (t.type === 'atRet') return { type: 'range', value: -1, valueTo: 1 };
    if (t.type === 'ongoing') return { type: 'ongoing' };
    const val = parseFloat(t.value);
    if (isNaN(val)) return undefined;
    if (t.type === 'before') return { type: 'before', value: -val };
    return { type: t.type, value: val }; // 'after' or 'age'
}

export function applyChecklistDiff(existingCategories, diff, dismissedItemIds = new Set(), keptItemIds = new Set()) {
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
        const timing = parseTiming(newItem.timing);
        const entry = { catId: newItem.categoryId, item: { id: newItem.id, priority: newItem.priority || 'medium', title: newItem.title || '', description: newItem.description || '', details: newItem.details || '', isNew: newItem.isNew === true, ...(timing ? { timing } : {}) } };
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

export async function generateRetirementChecklistInsights(inputs, results, provider, model, apiKeyOverride, language, existingCategories, dismissedItemIds = new Set(), keptItemIds = new Set(), prevAiCategories = null) {
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

    // Summarize previously AI-added items (for "isNew" judgment — these are NOT new to the user)
    const prevAiSummary = prevAiCategories && prevAiCategories.length > 0
        ? prevAiCategories.flatMap(c => (c.items || []).map(i =>
            `  - id="${i.id}": ${i.title}` + (i.description ? ` — ${i.description.slice(0, 120)}` : '')
        )).join('\n')
        : null;

    // Summarize existing items — include description for semantic coverage judgment
    const existingSummary = hasExisting
        ? (() => {
            const totalItems = existingCategories.reduce((n, c) => n + (c.items || []).length, 0);
            const body = existingCategories.map(cat =>
                `[${cat.id}] ${cat.title}:\n` +
                (cat.items || []).map(i =>
                    `  - id="${i.id}" priority=${i.priority}${i.timing ? '' : ' [NO TIMING]'}: ${i.title}` +
                    (i.description ? ` — ${i.description.slice(0, 150)}` : '')
                ).join('\n')
            ).join('\n');
            return `Total existing items: ${totalItems}\n\n${body}`;
        })()
        : null;

    const timingExplanation = isHe
        ? `שדה timing (חובה לכל פריט חדש): { "type": "before"|"after"|"atRet"|"age"|"ongoing", "value": מספר }
  - before + value: N שנים לפני הפרישה (לדוגמה: before+3 = 3 שנים לפני)
  - after + value: N שנים אחרי הפרישה
  - atRet: סביב תאריך הפרישה (ללא value)
  - age + value: עד גיל ספציפי (לדוגמה: age+65)
  - ongoing: שוטף / תמידי (ללא value)`
        : `timing field (required for every new item): { "type": "before"|"after"|"atRet"|"age"|"ongoing", "value": number }
  - before + value: N years before retirement (e.g. before+3 = 3 years before)
  - after + value: N years after retirement
  - atRet: around the retirement date (no value needed)
  - age + value: by a specific age (e.g. age+65)
  - ongoing: recurring / always relevant (no value needed)`;

    const jsonSchema = hasExisting ? `{
  "add": [
    {
      "id": "stable-kebab-id",
      "categoryId": "category-slug (must match existing category id or a new one)",
      "categoryTitle": "${isHe ? 'כותרת קטגוריה (רק אם חדשה)' : 'Category title (only if new)'}",
      "priority": "critical | high | medium | low",
      "title": "${isHe ? 'כותרת פריט' : 'Item title'}",
      "description": "${isHe ? 'תיאור' : 'Description'}",
      "details": "${isHe ? 'פרטים' : 'Details'}",
      "timing": { "type": "before|after|atRet|age|ongoing", "value": 3 },
      "isNew": true
    }
  ],
  "remove": ["item-id-that-may-no-longer-be-relevant"],
  "updateTiming": [
    { "id": "existing-item-id-missing-timing", "timing": { "type": "before|after|atRet|age|ongoing", "value": 3 } }
  ]
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
- כל פריט חדש ב-add חייב לכלול שדה timing: ${timingExplanation}
- שדה updateTiming: עבור פריטים קיימים המסומנים [NO TIMING] ברשימה — הוסף אותם ל-updateTiming עם ה-timing המתאים להם
- שדה isNew: הגדר true רק אם הנושא לא היה קיים בשום צורה אצל המשתמש קודם לכן (ראה "פריטים קודמים" למטה). הגדר false אם הנושא כבר נראה למשתמש (גם אם בניסוח שונה)
${prevAiSummary ? `\nפריטים שכבר קיימים אצל המשתמש (אל תסמן כחדש אם הנושא מכוסה כאן):\n${prevAiSummary}` : ''}
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
- Every new item in add must include a timing field: ${timingExplanation}
- updateTiming field: for existing items marked [NO TIMING] in the checklist above — add them to updateTiming with the appropriate timing
- isNew field: set to true ONLY if this topic did not exist in any form in the user's previous checklist (see "Previously seen items" below). Set false if the topic was already seen by the user (even if worded differently)
${prevAiSummary ? `\nPreviously seen items by user (do NOT mark isNew=true if topic is covered here):\n${prevAiSummary}` : ''}
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

    let parsed;
    try {
        parsed = parseAiJsonObject(responseText);
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

        let mergedCategories = applyChecklistDiff(existingCategories, diff, dismissedItemIds, keptItemIds);

        // Apply timing updates to existing items that were missing timing
        const updateTiming = Array.isArray(parsed.updateTiming) ? parsed.updateTiming : [];
        if (updateTiming.length > 0) {
            const timingById = {};
            for (const u of updateTiming) {
                if (u && u.id && u.timing) {
                    const t = parseTiming(u.timing);
                    if (t) timingById[String(u.id).trim()] = t;
                }
            }
            if (Object.keys(timingById).length > 0) {
                mergedCategories = mergedCategories.map(cat => ({
                    ...cat,
                    items: cat.items.map(item =>
                        (!item.timing && timingById[item.id]) ? { ...item, timing: timingById[item.id] } : item
                    ),
                }));
            }
        }

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

export async function generateChecklistOverview(checklist, inputs, results, provider, model, apiKeyOverride, language) {
    const isHe = language === 'he';
    const fmt = (n) => n ? Math.round(n).toLocaleString() : '0';

    const context = [
        `Current age: ${inputs?.currentAge}`,
        `Retirement age: ${inputs?.retirementStartAge}`,
        `Years to retirement: ${Math.max(0, (parseFloat(inputs?.retirementStartAge) || 67) - (parseFloat(inputs?.currentAge) || 50)).toFixed(1)}`,
        `Monthly desired income: ${fmt(inputs?.monthlyNetIncomeDesired)} ILS`,
        `Current savings: ${fmt(inputs?.currentSavings)} ILS`,
        results?.balanceAtRetirement ? `Projected balance at retirement: ${fmt(results.balanceAtRetirement)} ILS` : null,
        results?.ranOutAtAge ? `WARNING: funds run out at age ${results.ranOutAtAge}` : null,
        results?.surplus > 0 ? `Surplus at end of plan: ${fmt(results.surplus)} ILS` : null,
        results?.surplus < 0 ? `DEFICIT: ${fmt(Math.abs(results.surplus))} ILS shortfall` : null,
    ].filter(Boolean).join('\n');

    // Send only unchecked items, sorted by priority, capped to keep prompt short
    const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
    const allItems = checklist.flatMap(cat => (cat.items || []).map(i => ({ ...i, catTitle: cat.title || cat.id })));
    const topItems = allItems
        .filter(i => !i.checked && i.relevant !== false)
        .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2))
        .slice(0, 30);
    const checklistSummary = topItems.map(i => `${i.priority?.toUpperCase()} | [${i.catTitle}] ${i.title}`).join('\n');

    const prompt = isHe
        ? `אתה יועץ פרישה ישראלי מומחה. סקור את רשימת תכנון הפרישה של המשתמש ותן ניתוח קצר וממוקד — מה הדחוף ביותר, מה לשים לב אליו ועל מה הייתה ממליץ להתמקד.

נתוני המשתמש:
${context}

רשימת הפרישה הנוכחית:
${checklistSummary}

ענה בעברית בפורמט הבא:

**סיכום מצב**
[פסקה אחת — תמונת המצב הכוללת בהתאם לנתונים]

**מה דחוף ביותר — עכשיו**
• [פריט ראשון]
• [פריט שני]
• [עד 3 פריטים]

**מה חשוב לטפל בשנה הקרובה**
• [פריט ראשון]
• [עד 3 פריטים]

**המלצה כללית**
[משפט-שניים — מיקוד ומסר ראשי]`
        : `You are an expert Israeli retirement advisor. Review the user's retirement planning checklist and give a concise, focused analysis — what's most urgent, what to watch out for, and what to prioritize.

User data:
${context}

Current retirement checklist:
${checklistSummary}

Reply in English with this format:

**Status Summary**
[One paragraph — overall picture based on the data]

**Most Urgent — Act Now**
• [First item]
• [Second item]
• [Up to 3 items]

**Important to Address This Year**
• [First item]
• [Up to 3 items]

**Key Recommendation**
[One or two sentences — main focus and message]`;

    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);
    if (!apiKey) throw new Error(`Missing API key for provider: ${provider}`);

    try {
        if (provider === 'gemini') {
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(apiKey);
            const genModel = genAI.getGenerativeModel({ model, generationConfig: { temperature: 0.4 } });
            return (await genModel.generateContent(prompt)).response.text();
        } else if (provider === 'openai') {
            const { default: OpenAI } = await import('openai');
            const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
            const res = await openai.chat.completions.create({ messages: [{ role: 'user', content: prompt }], model, temperature: 0.4 });
            return res.choices[0].message.content;
        } else if (provider === 'anthropic') {
            const { default: Anthropic } = await import('@anthropic-ai/sdk');
            const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
            const msg = await anthropic.messages.create({ model, max_tokens: 2048, temperature: 0.4, messages: [{ role: 'user', content: prompt }] });
            return msg.content[0].text;
        }
        throw new Error(`Unsupported provider: ${provider}`);
    } catch (err) {
        throw cleanApiError(err);
    }
}

export async function explainChecklistItem(item, inputs, results, provider, model, apiKeyOverride, language) {
    const isHe = language === 'he';
    const fmt = (n) => n ? Math.round(n).toLocaleString() : '0';

    const context = [
        `Current age: ${inputs?.currentAge}`,
        `Retirement age: ${inputs?.retirementStartAge}`,
        `Years to retirement: ${Math.max(0, (parseFloat(inputs?.retirementStartAge) || 67) - (parseFloat(inputs?.currentAge) || 50)).toFixed(1)}`,
        `Monthly desired income: ${fmt(inputs?.monthlyNetIncomeDesired)} ILS`,
        `Current savings: ${fmt(inputs?.currentSavings)} ILS`,
        results?.balanceAtRetirement ? `Projected balance at retirement: ${fmt(results.balanceAtRetirement)} ILS` : null,
        results?.ranOutAtAge ? `WARNING: funds run out at age ${results.ranOutAtAge}` : null,
    ].filter(Boolean).join('\n');

    const itemDetails = [
        `Topic: ${item.title}`,
        item.desc || item.description ? `Summary: ${item.desc || item.description}` : null,
        item.details ? `Details: ${item.details}` : null,
    ].filter(Boolean).join('\n');

    const prompt = isHe
        ? `אתה יועץ פרישה ישראלי מומחה. המשתמש מבקש הסבר מפורט ותוכנית פעולה לנושא הבא מרשימת תכנון הפרישה שלו.

נתוני המשתמש:
${context}

נושא לפירוט:
${itemDetails}

ענה בעברית בפורמט הבא:
**הסבר מפורט**
[2-3 פסקאות המסבירות את הנושא לעומק — מדוע חשוב, מה הסיכון אם לא מטפלים בו, ומה הרלוונטיות לפרופיל הספציפי של המשתמש]

**תוכנית פעולה מעשית**
1. [צעד ראשון — קונקרטי וברור]
2. [צעד שני]
3. [המשך...]

[4-6 צעדים ממוקדים וברורים שניתן לבצע בפועל]`
        : `You are an expert Israeli retirement advisor. The user wants a detailed explanation and action plan for the following item from their retirement planning checklist.

User data:
${context}

Item to explain:
${itemDetails}

Reply in English with this format:
**Detailed Explanation**
[2-3 paragraphs explaining the topic in depth — why it matters, the risk of ignoring it, and relevance to this user's specific profile]

**Practical Action Plan**
1. [First step — concrete and specific]
2. [Second step]
3. [Continue...]

[4-6 focused, actionable steps]`;

    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);
    if (!apiKey) throw new Error(`Missing API key for provider: ${provider}`);

    try {
        if (provider === 'gemini') {
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(apiKey);
            const genModel = genAI.getGenerativeModel({ model, generationConfig: { temperature: 0.4 } });
            return (await genModel.generateContent(prompt)).response.text();
        } else if (provider === 'openai') {
            const { default: OpenAI } = await import('openai');
            const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
            const res = await openai.chat.completions.create({ messages: [{ role: 'user', content: prompt }], model, temperature: 0.4 });
            return res.choices[0].message.content;
        } else if (provider === 'anthropic') {
            const { default: Anthropic } = await import('@anthropic-ai/sdk');
            const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
            const msg = await anthropic.messages.create({ model, max_tokens: 2048, temperature: 0.4, messages: [{ role: 'user', content: prompt }] });
            return msg.content[0].text;
        }
        throw new Error(`Unsupported provider: ${provider}`);
    } catch (err) {
        throw cleanApiError(err);
    }
}
