
import { getProviderEnvKey } from '../config/ai-models';

/**
 * Classify an AI API error into a structured { type, raw } object.
 * type: 'balance' | 'quota' | 'auth' | 'context' | 'network' | 'unknown'
 * Handles both human-readable messages (from callAIProvider) and raw SDK errors
 * (from getRangeAIInsights etc.) which may use underscore formats like "rate_limit_error".
 */
export function classifyAiError(err) {
    const msg = (err?.message || '').toLowerCase();
    const status = Number(err?.status || err?.statusCode || 0);
    // Anthropic SDK stores the parsed error body in err.error; OpenAI uses err.error.type too
    const sdkType = ((err?.error?.type || err?.type || err?.code || '')).toLowerCase();

    const isBalance = msg.includes('balance') || msg.includes('credit') || msg.includes('billing')
        || sdkType.includes('billing') || status === 402;
    const isQuota   = !isBalance && (
        msg.includes('quota') || msg.includes('rate limit') || msg.includes('rate_limit')
        || sdkType.includes('rate_limit') || sdkType.includes('overloaded')
        || status === 429 || msg.includes('429') || msg.includes('overloaded') || msg.includes('too many')
    );
    const isAuth    = msg.includes('401') || msg.includes('api key') || msg.includes('api_key')
        || msg.includes('authentication') || msg.includes('unauthorized')
        || sdkType.includes('authentication') || status === 401;
    const isContext = msg.includes('too long') || msg.includes('context_length') || msg.includes('prompt is too long')
        || sdkType.includes('context') || status === 413;
    const isNetwork = msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused')
        || msg.includes('timeout') || msg.includes('enotfound');

    const type = isBalance ? 'balance' : isQuota ? 'quota' : isAuth ? 'auth' : isContext ? 'context' : isNetwork ? 'network' : 'unknown';
    return { type, raw: err?.message || '' };
}
import { calculateRetirementProjection } from './calculator';
import { withRetry, RETRY_CONFIG } from './ai-calculator';
import { DEFAULT_TAX_BRACKETS } from './fiscalDefaults';

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

    // Format Life Events if they exist (only active ones)
    let lifeEventsText = "None";
    const activeEvents = (inputs.lifeEvents || []).filter(event => event.enabled !== false);
    if (activeEvents.length > 0) {
        lifeEventsText = activeEvents.map(event =>
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

    // Handle Bucket Strategy
    let bucketRatesText = "";
    if (inputs.enableBuckets) {
        bucketRatesText += `\n    - Withdrawal Strategy: Bucket Strategy (Two-bucket approach)`;
        bucketRatesText += `\n    - Safe Bucket Rate: ${inputs.bucketSafeRate || 0}%`;
        bucketRatesText += `\n    - Surplus/Growth Bucket Rate: ${inputs.bucketSurplusRate || 0}%`;
        if (inputs.variableRatesEnabled) {
            const safeRates = Object.values(inputs.safeVariableRates || {});
            const surplusRates = Object.values(inputs.surplusVariableRates || {});
            if (safeRates.length > 0) {
                const avgSafe = (safeRates.reduce((a, b) => a + b, 0) / safeRates.length).toFixed(1);
                bucketRatesText += `\n    - Safe Bucket Variable Rates: Avg ${avgSafe}%, Range ${Math.min(...safeRates)}% - ${Math.max(...safeRates)}%`;
            }
            if (surplusRates.length > 0) {
                const avgSurplus = (surplusRates.reduce((a, b) => a + b, 0) / surplusRates.length).toFixed(1);
                bucketRatesText += `\n    - Surplus Bucket Variable Rates: Avg ${avgSurplus}%, Range ${Math.min(...surplusRates)}% - ${Math.max(...surplusRates)}%`;
            }
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

        // 6. Inflation Impact (+1%)
        const inflationInputs = { ...inputs, inflationRate: (parseFloat(inputs.inflationRate) || 0) + 1 };
        const resInflation = calculateRetirementProjection(inflationInputs);
        sensitivtyScenarios.push({ name: "Increasing Inflation by 1%", diff: resInflation.balanceAtEnd - baseBalance });

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

    // Format Crash Scenario
    let crashScenarioText = "None (base case — no market crash simulated)";
    if (inputs.scenarioEnabled && inputs.scenario) {
        const s = inputs.scenario;
        const bucketNote = inputs.enableBuckets
            ? (s.affectsSafeBucket ? " Affects BOTH safe and surplus buckets." : " Affects surplus bucket only (safe bucket protected).")
            : "";
        crashScenarioText = `ACTIVE — Market crash scenario is enabled:\n    - Crash Start Year: ${s.startYear}\n    - Crash Depth: ${s.crashDepth}%\n    - Recovery Period: ${s.recoveryYears} years (${s.recoveryShape} recovery)\n    - Recovery Mode: ${s.recoveryMode === 'rate' ? `Target avg rate of ${s.targetAvgRate}% during recovery` : 'Recover to original value'}\n    -${bucketNote || ' No bucket strategy active.'}`;
    }

    // Format Pension Sources
    let pensionText = "None";
    if (inputs.pensionIncomeSources && inputs.pensionIncomeSources.length > 0) {
        pensionText = inputs.pensionIncomeSources.map(s => {
            const isNI = s.type === 'nationalInsurance';
            const grossInfo = s.isTaxable !== false ? " (Gross)" : " (Net/Exempt)";
            return `- ${s.name || (isNI ? 'National Insurance' : 'Annuity')}: ${currency}${s.amount}${grossInfo}, Start: ${s.startAge}${s.endAge ? `, End: ${s.endAge}` : ''}${s.autoCalculated ? ' (Auto-calculated)' : ''}`;
        }).join('\n    ');
    }

    // National Insurance Context
    const niSource = inputs.pensionIncomeSources?.find(s => s.type === 'nationalInsurance');
    const niThreshold = results.niThreshold || 20000; // Fallback or from results
    // Check if user has any WORK income sources active at age 67
    const workSources = (inputs.pensionIncomeSources || []).filter(s => s.type === 'work' && s.enabled !== false && 67 >= s.startAge && (s.endAge === null || 67 < s.endAge));
    const workIncomeAt67 = workSources.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const pensionIncomeAt67 = results.incomeAtNIStart?.nonWorkIncome || 0;

    const niContext = `
    National Insurance (Old Age Pension) Rules:
    - Base Start Age: 67
    - Income Test (Mivchan Hakhnasot) applies between ages 67-70, but ONLY to WORK INCOME (הכנסה מעבודה).
    - IMPORTANT: Pension annuity income, savings withdrawals, and unrealized investment gains are NOT considered work income and do NOT affect eligibility.
    - The work income threshold is ~${currency}${niThreshold}/month. Only if work income exceeds this, the pension is reduced/cancelled until age 70.
    - At age 70, the pension is paid regardless of any income.
    - User's work income at age 67: ${currency}${workIncomeAt67} (${workIncomeAt67 > 0 ? 'has work income' : 'not working - fully eligible for NI at 67'}).
    - User's pension/annuity income at age 67: ${currency}${pensionIncomeAt67} (does NOT affect NI eligibility).
    `;

    const basePrompt = `
    Act as a senior financial advisor and retirement planner.
    Analyze the following retirement scenario and provide precise, data-driven insights using the exact numbers provided.
    CRITICAL RULE: Every sentence MUST include specific numbers (${currency} amounts, ages, percentages) from the data below.
    NEVER write generic advice like "consider saving more" — instead write "saving ${currency}500 more/month improves your final balance by ${currency}X (from the sensitivity data below)".
    NEVER write "your plan looks solid" — instead write "your projected balance of ${currency}X at retirement covers Y years of ${currency}Z/month withdrawals".

    User Profile:
    - Current Age: ${inputs.currentAge}
    - Retirement Start Age: ${inputs.retirementStartAge}
    - Retirement End Age: ${inputs.retirementEndAge}
    - Years Until Retirement: ${Math.max(0, Math.round((parseFloat(inputs.retirementStartAge) - parseFloat(inputs.currentAge)) * 10) / 10)}
    - Years in Retirement (drawdown period): ${Math.round(parseFloat(inputs.retirementEndAge) - parseFloat(inputs.retirementStartAge))}
    - Years from Early Retirement to Full Pension Age (67): ${Math.max(0, Math.round(67 - parseFloat(inputs.retirementStartAge)))}
    - Current Savings: ${currency}${inputs.currentSavings}
    - Monthly Contribution: ${currency}${inputs.monthlyContribution}
    - Desired Monthly Net Income: ${currency}${inputs.monthlyNetIncomeDesired}${inputs.targetEndBalance && results.initialNetWithdrawal ? `\n    - Achievable Monthly Income (with target balance goal): ${currency}${Math.round(results.initialNetWithdrawal)} (${results.initialNetWithdrawal >= parseFloat(inputs.monthlyNetIncomeDesired || 0) ? `+${currency}${Math.round(results.initialNetWithdrawal - parseFloat(inputs.monthlyNetIncomeDesired || 0))} ABOVE desired` : `-${currency}${Math.round(parseFloat(inputs.monthlyNetIncomeDesired || 0) - results.initialNetWithdrawal)} BELOW desired — income reduction needed to meet target`})` : ''}
    - Assumed Annual Return: ${returnRateText}${bucketRatesText}
    - Inflation Rate: ${inputs.inflationRate || 0}%
    - Tax Rate on Capital Gains: ${inputs.taxRate ?? 25}%
    - Target End Balance: ${inputs.targetEndBalance ? `${currency}${inputs.targetEndBalance}` : 'Not set (no legacy/inheritance goal)'}
    
    Pension Income Sources:
    ${pensionText}

    ${niContext}
    
    Significant Life Events (One-time or recurring changes):
    ${lifeEventsText}

    Market Crash Scenario:
    ${crashScenarioText}

    Israeli Tax Rules (used by the calculator):
    - Income tax brackets (monthly): ${(() => {
        const brackets = inputs.fiscalParameters?.taxBrackets || DEFAULT_TAX_BRACKETS;
        return brackets.map((b, i) => {
            const prev = i === 0 ? 0 : brackets[i - 1].limit;
            const range = b.limit ? `${currency}${prev.toLocaleString()}–${currency}${b.limit.toLocaleString()}` : `above ${currency}${prev.toLocaleString()}`;
            return `${range}: ${Math.round(b.rate * 100)}%`;
        }).join(' | ');
    })()}
    - Pension income exemption (פטור מקצבה מזכה): ${Math.round((inputs.fiscalParameters?.pensionExemption?.rate ?? 0.575) * 100)}% of qualifying pension exempt, up to ${currency}${inputs.fiscalParameters?.pensionExemption?.maxMonthly ?? 5422}/mo (qualifying income cap: ${currency}${inputs.fiscalParameters?.pensionExemption?.maxQualifiedIncome ?? 9430}/mo)
    - Capital gains tax on savings withdrawals: ${inputs.taxRate ?? 25}% flat

    Simulation Results (Base Case):
    - Projected Balance at Retirement: ${currency}${results.balanceAtRetirement}
    - Projected Balance at End of Retirement: ${currency}${results.balanceAtEnd}
    - Ran Out of Money At Age: ${results.ranOutAtAge || 'Never (Succesfully funded)'}
    - Required Capital at Retirement: ${currency}${results.requiredCapitalAtRetirement}
    - Deficit (Needed Today): ${currency}${results.pvOfDeficit}${inputs.targetEndBalance ? `\n    - Target End Balance Goal: ${currency}${inputs.targetEndBalance}\n    - Gap to Target: ${currency}${Math.round(results.balanceAtEnd - parseFloat(inputs.targetEndBalance))} (${results.balanceAtEnd >= parseFloat(inputs.targetEndBalance) ? 'TARGET MET ✓' : 'SHORTFALL'})` : ''}
    
    Sensitivity Analysis (Impact of changes on Final Balance):
    ${sensitivityText}
    
    Your Output Requirements:
    1. **Language**: The response MUST be in ${isHebrew ? 'Hebrew (Modern, professional yet accessible)' : 'English'}.
    2. **Format**: Return a strict JSON object with the following structure:
    {
        "readinessScore": number, // 0-100 score of how ready the user is
        "executiveSummary": "string", // 2-3 sentences with specific numbers: current savings, projected balance at retirement, balance at end, monthly income vs required
        "retirementAgeRecommendation": {
            "recommendedAge": number, // The specific age recommended (e.g. 67)
            "reasoning": "string" // Must include exact amounts: e.g. "Retiring at 65 leaves a ${currency}200,000 deficit; 2 more years close it via ${currency}X compounding + ${currency}Y extra contributions"
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
                "impact": "string" // MUST be a concrete number from the sensitivity data, e.g. "+${currency}320,000 to final balance" or "closes ${currency}150,000 of the deficit"
            }
        ], // Provide 3-4 distinct recommendations
        "conclusion": "string" // Final encouraging or cautionary closing statement
    }
    
    Guidance for Analysis:
    - If there are significant life events, specifically mention their impact.
    - LOOK at the "Sensitivity Analysis" section. Use it to populate the 'sensitivityAnalysis' field.
      Quote the EXACT numbers from the data. Identify the TOP 2 most impactful factors.
      Example format: "Delaying retirement by 1 year is your strongest lever (+${currency}2,100,000 to final balance), followed by increasing returns by 1% (+${currency}480,000). Saving ${currency}500/month more adds only +${currency}95,000 by comparison."
    - Return Rate Risk Assessment: An annual return of ~4% is considered conservative/solid for a long-term diversified portfolio (not risky).
      5-6% is moderate. Only rates above 7-8% should be flagged as aggressive or market-dependent.
      When a bucket strategy is used, assess each bucket independently: a safe bucket at 3-4% is very conservative, a surplus bucket at 6-8% is reasonable for growth allocation.
    - If a Market Crash Scenario is active, specifically address: how severe the crash is, whether the recovery timeline is realistic, and whether the plan survives the crash (based on the simulation results). If the safe bucket is protected, note that as a risk-mitigation strength.
    - If the user runs out of money early, emphasize increasing savings or delaying retirement.
    - If the user has a large surplus, suggest leaving a legacy or spending more.
    - Be empathetic but realistic.
    - If the user has set a Target End Balance (inheritance/legacy goal), specifically analyze:
      1. Whether the current plan achieves this target (compare "Projected Balance at End" vs the target).
      2. If there is a gap, quantify it and suggest specific changes (more savings, later retirement, higher returns) that could close it.
      3. If the target is already exceeded, acknowledge the success and note the surplus.
      4. If the "Achievable Monthly Income" is lower than "Desired Monthly Net Income", explain the trade-off: reaching the target requires reducing monthly spending by the difference. Suggest whether the target is realistic or if it should be lowered.
      5. If no target is set, skip this analysis entirely.
    `;

    return basePrompt;
};

/**
 * Generates a prompt for AI analysis of crash simulation results.
 */
export const generateCrashInsightPrompt = (analysisInputs, sweepResults, language) => {
    const isHebrew = language === 'he';
    const currency = isHebrew ? '₪' : '$';
    const s = analysisInputs?.scenario || {};
    const baseline = sweepResults?.baseline ?? 0;
    const sweep = sweepResults?.sweep ?? [];
    const valid = sweep.filter(r => !r.error);
    if (!valid.length) return null;

    const best = valid.reduce((a, b) => b.balance > a.balance ? b : a, valid[0]);
    const worst = valid.reduce((a, b) => b.balance < a.balance ? b : a, valid[0]);
    const fmtNum = (v) => `${currency}${Math.round(Math.abs(v)).toLocaleString()}`;

    // Bucket comparison: at worst year, compare shielded vs exposed
    let bucketComparisonText = 'N/A — no bucket strategy active';
    if (analysisInputs?.enableBuckets) {
        try {
            const withProtection = calculateRetirementProjection({
                ...analysisInputs, scenarioEnabled: true,
                scenario: { ...s, startYear: worst.year, affectsSafeBucket: false }
            });
            const withoutProtection = calculateRetirementProjection({
                ...analysisInputs, scenarioEnabled: true,
                scenario: { ...s, startYear: worst.year, affectsSafeBucket: true }
            });
            const diff = withProtection.balanceAtEnd - withoutProtection.balanceAtEnd;
            bucketComparisonText = `At worst crash year (${worst.year}):
    - Safe bucket SHIELDED: ${fmtNum(withProtection.balanceAtEnd)} final balance
    - Safe bucket EXPOSED: ${fmtNum(withoutProtection.balanceAtEnd)} final balance
    - Value of protection: ${fmtNum(diff)} (${diff >= 0 ? 'shielding is better' : 'exposing is better — unusual'})
    - Current setting: safe bucket is ${s.affectsSafeBucket ? 'EXPOSED (affected by crash)' : 'SHIELDED (protected from crash)'}`;
        } catch {
            bucketComparisonText = 'Calculation unavailable';
        }
    }

    return `Act as a senior financial advisor specializing in sequence-of-returns risk.
Analyze the following crash simulation results and provide specific, data-driven insights.
CRITICAL RULE: Every field MUST cite exact ${currency} amounts and years from the data. No generic sentences allowed.

CRASH PARAMETERS:
- Depth: ${Math.abs(s.crashDepth ?? 20)}% drop
- Recovery: ${s.recoveryYears ?? 5} years (${s.recoveryShape ?? 'linear'})
- Recovery mode: ${s.recoveryMode === 'value' ? 'Recover to original value' : `Target avg rate of ${s.targetAvgRate}% during recovery`}
- Bucket strategy: ${analysisInputs?.enableBuckets ? `Active — safe bucket is currently ${s.affectsSafeBucket ? 'exposed' : 'shielded'}` : 'None'}

YEAR SWEEP (crash tested from ${sweep[0]?.year ?? '?'} to ${sweep[sweep.length - 1]?.year ?? '?'}):
- Baseline (no crash): ${fmtNum(baseline)}
- BEST timing: Year ${best.year} → ${fmtNum(best.balance)} (${best.pctDiff >= 0 ? '+' : ''}${best.pctDiff.toFixed(1)}% vs baseline) [${best.isPreRetirement ? 'pre-retirement' : 'in-retirement'}]
- WORST timing: Year ${worst.year} → ${fmtNum(worst.balance)} (${worst.pctDiff.toFixed(1)}% vs baseline) [${worst.isPreRetirement ? 'pre-retirement' : 'in-retirement'}]
- Years above baseline: ${valid.filter(r => r.balance >= baseline).length} / ${valid.length}

BUCKET STRATEGY COMPARISON:
${bucketComparisonText}

Return ONLY a strict JSON object in this exact shape:
{
  "summary": "string",
  "timingAnalysis": "string",
  "bucketImpact": "string",
  "worstCase": { "year": number, "assessment": "string", "mitigation": "string" },
  "bestCase": { "year": number, "assessment": "string" },
  "recommendation": "string"
}

Language: ${isHebrew ? 'Hebrew (Modern, professional)' : 'English'}.`;
};

/**
 * Fetches AI crash analysis using the selected provider.
 */
export async function getCrashAIInsights(analysisInputs, sweepResults, provider, model, apiKeyOverride = null, language = 'he', { signal } = {}) {
    const prompt = generateCrashInsightPrompt(analysisInputs, sweepResults, language);
    if (!prompt) throw new Error('No sweep data available');

    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);
    if (!apiKey) throw new Error('Missing API Key');

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const onRetry = null;
    let responseText = '';

    if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        responseText = await withRetry(async () => {
            const genModel = genAI.getGenerativeModel({ model, generationConfig: { responseMimeType: 'application/json' } });
            const result = await genModel.generateContent(prompt);
            return (await result.response).text();
        }, { onRetry });
    } else if (provider === 'openai') {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        const completion = await withRetry(() => openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model,
            response_format: { type: 'json_object' }
        }), { onRetry });
        responseText = completion.choices[0].message.content;
    } else if (provider === 'anthropic') {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        const message = await withRetry(() => anthropic.messages.create({
            model, max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }]
        }), { onRetry });
        responseText = message.content[0].text;
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
}

/**
 * Generates a prompt for AI analysis of a sensitivity range scan.
 */
export const generateRangeInsightPrompt = (rangeResults, parameterLabel, currentValue, language) => {
    const isHebrew = language === 'he';
    const currency = isHebrew ? '₪' : '$';

    const current = rangeResults.find(r => r.isCurrent);
    const positive = rangeResults.filter(r => r.balanceAtEnd >= 0);

    let breakEven = null;
    for (let i = 1; i < rangeResults.length; i++) {
        if (rangeResults[i - 1].balanceAtEnd < 0 && rangeResults[i].balanceAtEnd >= 0) {
            breakEven = rangeResults[i];
            break;
        }
    }

    const best = rangeResults.reduce((a, b) => b.balanceAtEnd > a.balanceAtEnd ? b : a, rangeResults[0]);
    const worst = rangeResults.reduce((a, b) => b.balanceAtEnd < a.balanceAtEnd ? b : a, rangeResults[0]);

    const rangeText = rangeResults.map(r =>
        `  ${r.label}${r.isCurrent ? ' [CURRENT]' : ''}: ${currency}${Math.round(r.balanceAtEnd).toLocaleString()}`
    ).join('\n');

    return `Act as a senior retirement financial advisor. Analyze this sensitivity scan and give sharp, data-driven conclusions.
CRITICAL: Every sentence must include exact ${currency} amounts or values from the data. No generic advice.

PARAMETER SCANNED: ${parameterLabel}
CURRENT VALUE: ${currentValue}
SCAN RESULTS:
${rangeText}

KEY FACTS:
- Current balance at end: ${currency}${Math.round(current?.balanceAtEnd ?? 0).toLocaleString()} (${(current?.balanceAtEnd ?? 0) >= 0 ? 'SURPLUS' : 'DEFICIT'})
- Break-even value: ${breakEven ? breakEven.label : 'Not reached in this range'}
- Safe values (positive balance): ${positive.length} / ${rangeResults.length}
- Best outcome: ${best.label} → ${currency}${Math.round(best.balanceAtEnd).toLocaleString()}
- Worst outcome: ${worst.label} → ${currency}${Math.round(worst.balanceAtEnd).toLocaleString()}

Return ONLY strict JSON:
{
  "headline": "string — one sharp sentence with the most important finding and exact numbers",
  "currentPosition": "string — where the user stands: exact value, balance, safe or at risk",
  "breakEven": "string — minimum value needed for non-negative outcome, with exact amount",
  "safeZone": "string — which values produce safe outcomes and by how much surplus",
  "riskZone": "string — which values produce deficits and by how much",
  "sensitivity": "string — average change per step, is this parameter highly sensitive or stable",
  "recommendation": "string — one concrete action with exact numbers"
}
Language: ${isHebrew ? 'Hebrew (Modern, professional)' : 'English'}.`;
};

/**
 * Fetches AI range sensitivity analysis.
 */
export async function getRangeAIInsights(rangeResults, parameterLabel, currentValue, provider, model, apiKeyOverride = null, language = 'he', { signal } = {}) {
    const prompt = generateRangeInsightPrompt(rangeResults, parameterLabel, currentValue, language);

    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);
    if (!apiKey) throw new Error('Missing API Key');

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const onRetry = null;
    let responseText = '';

    if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        responseText = await withRetry(async () => {
            const genModel = genAI.getGenerativeModel({ model, generationConfig: { responseMimeType: 'application/json' } });
            const result = await genModel.generateContent(prompt);
            return (await result.response).text();
        }, { onRetry });
    } else if (provider === 'openai') {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        const completion = await withRetry(() => openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model, response_format: { type: 'json_object' }
        }), { onRetry });
        responseText = completion.choices[0].message.content;
    } else if (provider === 'anthropic') {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        const message = await withRetry(() => anthropic.messages.create({
            model, max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
        }), { onRetry });
        responseText = message.content[0].text;
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const cleanJson2 = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson2);
}

/**
 * Generates a prompt for global analysis across all sensitivity parameters.
 */
export const generateGlobalRangeInsightPrompt = (allParamResults, language) => {
    const isHebrew = language === 'he';
    const currency = isHebrew ? '₪' : '$';

    const paramsText = allParamResults.map(({ label, currentValue, currentBalance, breakEven, safeCount, totalCount, bestBalance, worstBalance }) => {
        return `• ${label} (current: ${currentValue}):
    - Balance at current value: ${currency}${Math.round(currentBalance).toLocaleString()} (${currentBalance >= 0 ? 'SURPLUS' : 'DEFICIT'})
    - Break-even: ${breakEven || 'Not reached in range'}
    - Safe outcomes: ${safeCount}/${totalCount}
    - Best: ${currency}${Math.round(bestBalance).toLocaleString()} | Worst: ${currency}${Math.round(worstBalance).toLocaleString()}`;
    }).join('\n');

    return `Act as a senior retirement financial advisor. Analyze ALL sensitivity parameters together and give a comprehensive cross-parameter assessment.
CRITICAL: Every sentence must include exact numbers. No generic advice.

ALL PARAMETER SCANS:
${paramsText}

Return ONLY strict JSON:
{
  "overallRisk": "low" | "medium" | "high",
  "overallRiskExplanation": "string — why this risk level, with exact numbers",
  "mostCriticalParameter": "string — which parameter has the most impact and why, with exact amounts",
  "safestParameter": "string — which parameter the plan is least sensitive to, with numbers",
  "currentSituation": "string — overall assessment of where the user stands across all parameters",
  "keyInsights": ["string", "string", "string"],
  "topRecommendation": "string — the single most impactful action the user can take, with exact numbers"
}
Language: ${isHebrew ? 'Hebrew (Modern, professional)' : 'English'}.`;
};

/**
 * Fetches global AI analysis across all sensitivity parameters.
 */
export async function getGlobalRangeAIInsights(allParamResults, provider, model, apiKeyOverride = null, language = 'he', { signal } = {}) {
    const prompt = generateGlobalRangeInsightPrompt(allParamResults, language);

    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);
    if (!apiKey) throw new Error('Missing API Key');

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const onRetry = null;
    let responseText = '';

    if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        responseText = await withRetry(async () => {
            const genModel = genAI.getGenerativeModel({ model, generationConfig: { responseMimeType: 'application/json' } });
            const result = await genModel.generateContent(prompt);
            return (await result.response).text();
        }, { onRetry });
    } else if (provider === 'openai') {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        const completion = await withRetry(() => openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model, response_format: { type: 'json_object' }
        }), { onRetry });
        responseText = completion.choices[0].message.content;
    } else if (provider === 'anthropic') {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        const message = await withRetry(() => anthropic.messages.create({
            model, max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
        }), { onRetry });
        responseText = message.content[0].text;
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const cleanJson3 = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson3);
}

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
export async function getAIInsights(inputs, results, provider, model, apiKeyOverride = null, language = 'he', { signal } = {}) {
    const prompt = generateInsightPrompt(inputs, results, language);

    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);

    if (!apiKey) {
        throw new Error("Missing API Key");
    }

    let responseText = "";

    try {
        // Check if already aborted
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        const onRetry = null;

        if (provider === 'gemini') {
            const { GoogleGenerativeAI } = await import("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(apiKey);

            responseText = await withRetry(async () => {
                const genModel = genAI.getGenerativeModel({
                    model: model,
                    generationConfig: { responseMimeType: "application/json" }
                });
                const result = await genModel.generateContent(prompt);
                const response = await result.response;
                return response.text();
            }, { onRetry });

        } else if (provider === 'openai') {
            const { default: OpenAI } = await import("openai");
            const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

            const completion = await withRetry(async () => {
                return openai.chat.completions.create({
                    messages: [{ role: "user", content: prompt }],
                    model: model,
                    response_format: { type: "json_object" }
                });
            }, { onRetry });

            responseText = completion.choices[0].message.content;

        } else if (provider === 'anthropic') {
            const { default: Anthropic } = await import("@anthropic-ai/sdk");
            const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

            const message = await withRetry(async () => {
                return anthropic.messages.create({
                    model: model,
                    max_tokens: 4096,
                    messages: [{ role: "user", content: prompt }]
                });
            }, { onRetry });

            responseText = message.content[0].text;
        }

        // Check if aborted while waiting for response
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        // Parse JSON
        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);

    } catch (error) {
        console.error("AI Insight Error:", error);
        throw error;
    }
}

/**
 * Generates a prompt for AI analysis of pension income data.
 */
export const generatePensionInsightPrompt = (incomeSources, summary, inputs, language) => {
    const isHebrew = language === 'he';
    const currency = isHebrew ? '₪' : '$';

    const activeSources = (incomeSources || []).filter(s => s.enabled !== false);

    // Pension start = earliest active income source age
    const earlyRetirementAge = parseFloat(inputs.retirementStartAge) || 67;
    const pensionStartAge = activeSources.length > 0
        ? Math.min(...activeSources.map(s => parseFloat(s.startAge) || 67))
        : earlyRetirementAge;
    const monthlyExpenses = parseFloat(inputs.monthlyNetIncomeDesired) || 0;

    // Income sources list — clear separation from capital
    const sourcesText = activeSources.map(s => {
        const taxNote = s.isTaxable === false ? 'tax-exempt' : 'taxable';
        const end = s.endAge ? `, ends age ${s.endAge}` : ', lifetime';
        return `  • ${s.name || s.type} [PENSION INCOME / קצבה]: ${currency}${Math.round(s.amount)}/month gross, starts age ${s.startAge}${end}, ${taxNote}`;
    }).join('\n');

    // Milestones — read from correct nested structure, clearly label capital vs income
    const milestonesText = (summary?.milestones || []).map(m => {
        const gross = Math.round(m.income?.totalGross ?? 0);
        const net = Math.round(m.income?.totalNet ?? 0);
        const capital = Math.round(m.accumulatedCapital ?? 0);
        const taxRate = m.income?.effectiveTaxRate ?? 0;
        const gap = net - monthlyExpenses;
        const sourceBreakdown = (m.income?.sources || [])
            .map(s => `${s.name || s.type}: ${currency}${Math.round(s.amount)}/mo`)
            .join(', ');
        return `  Age ${m.age}:\n    - PENSION INCOME (קצבה): gross ${currency}${gross} → net ${currency}${net} after ${taxRate.toFixed(1)}% tax${sourceBreakdown ? ` [${sourceBreakdown}]` : ''}\n    - CAPITAL (הון — savings pool, NOT income): ${currency}${capital.toLocaleString()}\n    - Gap vs desired: ${gap >= 0 ? `surplus +${currency}${gap}` : `shortfall -${currency}${Math.abs(gap)}`}`;
    }).join('\n');

    const firstMilestone = summary?.milestones?.find(m => m.age >= pensionStartAge) || summary?.milestones?.[0];
    const netAtPensionStart = Math.round(firstMilestone?.income?.totalNet ?? 0);
    const coveragePct = monthlyExpenses > 0 ? Math.round((netAtPensionStart / monthlyExpenses) * 100) : 0;

    const taxBrackets = (inputs.fiscalParameters?.taxBrackets || []).map((b, i, arr) => {
        const prev = i === 0 ? 0 : arr[i - 1].limit;
        const range = b.limit ? `${currency}${prev.toLocaleString()}–${currency}${b.limit.toLocaleString()}` : `${currency}${prev.toLocaleString()}+`;
        return `${range}: ${Math.round(b.rate * 100)}%`;
    }).join(' | ');

    const pensionExemptionRate = Math.round((inputs.fiscalParameters?.pensionExemption?.rate ?? 0.575) * 100);
    const pensionExemptionMax = inputs.fiscalParameters?.pensionExemption?.maxMonthly ?? 5422;

    return `Act as a senior Israeli retirement financial advisor specializing in pension income.
Analyze ONLY the pension income phase from age ${pensionStartAge} onwards. Do NOT mention or analyze any earlier period.
CRITICAL: Every sentence MUST include specific numbers. No generic advice.

PENSION PHASE (age ${pensionStartAge} to ${inputs.retirementEndAge || 90}, ${(inputs.retirementEndAge || 90) - pensionStartAge} years):
- Desired monthly net income: ${currency}${monthlyExpenses}
- Net pension income at age ${pensionStartAge}: ${currency}${netAtPensionStart} — covers ${coveragePct}% of desired

INCOME SOURCES (${activeSources.length} active):
${sourcesText || 'None'}

INCOME BY AGE MILESTONE:
${milestonesText || 'No milestones'}

ISRAELI TAX RULES:
- Income tax brackets (monthly): ${taxBrackets}
- Pension exemption (פטור קצבה מזכה): ${pensionExemptionRate}% of qualifying pension exempt, up to ${currency}${pensionExemptionMax}/month
- National Insurance (ביטוח לאומי): starts age 67 (income test for work income only applies until age 70)

IMPORTANT: The analysis must start from age ${pensionStartAge}. Do not reference any period before this age.

The pension phases are the periods BETWEEN consecutive milestone ages. For example if milestones are ages 65, 67, 70, 90 then the phases are: 65–67, 67–70, 70–90.

Return ONLY a strict JSON object:
{
  "periodScores": [
    {
      "fromAge": number,
      "toAge": number,
      "score": number,  // MUST be between 0 and 100. 100 = income fully covers expenses. 0 = no income at all. Never exceed 100.
      "label": "string — one short phrase describing this period (e.g. 'קצבה חלקית' / 'Partial pension')",
      "note": "string — one sentence with exact amounts explaining the score"
    }
  ],
  "summary": "string — 2-3 sentences with exact amounts: net income per period vs desired, key changes",
  "incomeAnalysis": "string — analyze each source: amount, tax treatment, timing. Note which are most valuable.",
  "taxOptimization": "string — concrete tax insights: effective rate per period, exempt amount used, potential savings",
  "gaps": "string — specific shortfalls: which periods, by how much, what could fill them",
  "recommendations": [
    { "title": "string", "description": "string with exact numbers", "impact": "string — concrete amount/percentage" }
  ],
  "conclusion": "string"
}

Language: ${isHebrew ? 'Hebrew (Modern, professional)' : 'English'}.`;
};

/**
 * Fetches AI pension analysis using the selected provider.
 */
export async function getPensionAIInsights(incomeSources, summary, inputs, provider, model, apiKeyOverride = null, language = 'he', { signal } = {}) {
    const prompt = generatePensionInsightPrompt(incomeSources, summary, inputs, language);

    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);
    if (!apiKey) throw new Error('Missing API Key');

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const onRetry = null;
    let responseText = '';

    if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        responseText = await withRetry(async () => {
            const genModel = genAI.getGenerativeModel({ model, generationConfig: { responseMimeType: 'application/json' } });
            const result = await genModel.generateContent(prompt);
            return (await result.response).text();
        }, { onRetry });
    } else if (provider === 'openai') {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        const completion = await withRetry(() => openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model,
            response_format: { type: 'json_object' }
        }), { onRetry });
        responseText = completion.choices[0].message.content;
    } else if (provider === 'anthropic') {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        const message = await withRetry(() => anthropic.messages.create({
            model, max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }]
        }), { onRetry });
        responseText = message.content[0].text;
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
}
