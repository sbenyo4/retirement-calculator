import { getProviderEnvKey } from '../config/ai-models';
import { withRetry } from './ai-calculator';
import { DEFAULT_TAX_BRACKETS } from './fiscalDefaults';

/**
 * Builds a system prompt giving the AI full context about the user's retirement plan.
 */
export function buildChatSystemPrompt(inputs, results, language) {
    const isHe = language === 'he';
    const currency = isHe ? '₪' : '$';
    const todayStr = new Date().toISOString().split('T')[0];
    const yearsToRetirement = Math.max(0, Math.round(parseFloat(inputs.retirementStartAge) - parseFloat(inputs.currentAge)));
    const yearsInRetirement = Math.round(parseFloat(inputs.retirementEndAge) - parseFloat(inputs.retirementStartAge));

    // Pension sources
    const pensionText = (inputs.pensionIncomeSources || [])
        .filter(s => s.enabled !== false)
        .map(s => `${s.name || s.type}: ${currency}${s.amount}/mo from age ${s.startAge}${s.endAge ? ` to ${s.endAge}` : ''}${s.isTaxable === false ? ' (tax-exempt)' : ''}`)
        .join('\n  ') || 'None';

    // Bucket strategy
    let bucketText = 'Single portfolio (no bucket strategy)';
    if (inputs.enableBuckets) {
        bucketText = `Bucket strategy — Safe: ${inputs.bucketSafeRate ?? 0}%, Surplus: ${inputs.bucketSurplusRate ?? 0}%`;
        if (inputs.variableRatesEnabled) {
            const safeRates = Object.values(inputs.safeVariableRates || {});
            const surplusRates = Object.values(inputs.surplusVariableRates || {});
            if (safeRates.length) bucketText += ` (safe variable avg: ${(safeRates.reduce((a,b)=>a+b,0)/safeRates.length).toFixed(1)}%)`;
            if (surplusRates.length) bucketText += ` (surplus variable avg: ${(surplusRates.reduce((a,b)=>a+b,0)/surplusRates.length).toFixed(1)}%)`;
        }
    }

    // Variable rates (single portfolio)
    let returnRateText = `${inputs.annualReturnRate}%`;
    if (!inputs.enableBuckets && inputs.variableRatesEnabled && inputs.variableRates) {
        const rates = Object.values(inputs.variableRates);
        if (rates.length) {
            const avg = (rates.reduce((a,b)=>a+b,0)/rates.length).toFixed(1);
            returnRateText = `Variable (avg ${avg}%, range ${Math.min(...rates)}%–${Math.max(...rates)}%)`;
        }
    }

    // Life events
    const activeEvents = (inputs.lifeEvents || []).filter(e => e.enabled !== false);
    const eventsText = activeEvents.length
        ? activeEvents.map(e => `  - ${e.title || e.name}: ${currency}${Math.abs(e.amount || e.monthlyChange || 0)}/mo ${(e.amount || e.monthlyChange || 0) < 0 ? '(expense)' : '(income)'}, from ${e.startDate?.year || '?'}${e.endDate?.year ? ` to ${e.endDate.year}` : ''} [${e.type}]`).join('\n')
        : '  None';

    // Crash scenario
    let crashText = 'None (no crash scenario active)';
    if (inputs.scenarioEnabled && inputs.scenario) {
        const s = inputs.scenario;
        crashText = `ACTIVE — ${Math.abs(s.crashDepth)}% drop starting ${s.startYear}, ${s.recoveryYears}-year ${s.recoveryShape} recovery at avg ${s.targetAvgRate}%${inputs.enableBuckets ? (s.affectsSafeBucket ? ', safe bucket EXPOSED' : ', safe bucket PROTECTED') : ''}`;
    }

    // Tax brackets compact summary
    const brackets = inputs.fiscalParameters?.taxBrackets || DEFAULT_TAX_BRACKETS;
    const minRate = Math.round(brackets[0].rate * 100);
    const maxRate = Math.round(brackets[brackets.length - 1].rate * 100);
    const bracketsText = brackets
        .map((b, i) => {
            const prev = i === 0 ? 0 : (brackets[i - 1].limit ?? 0);
            return b.limit
                ? `${Math.round(b.rate*100)}% up to ${currency}${b.limit.toLocaleString()}`
                : `${Math.round(b.rate*100)}% above ${currency}${prev.toLocaleString()}`;
        })
        .join(', ');

    // Budget planner awareness — read from sessionStorage (written by BudgetPlanner on every change)
    let budgetSection = '';
    try {
        const budget = JSON.parse(sessionStorage.getItem('rc-budget-summary') || 'null');
        if (budget && budget.totalMonthly > 0) {
            const catLines = (budget.categories || [])
                .map(c => {
                    const label = isHe ? c.labelHe : c.labelEn;
                    const itemLines = (c.items || []).map(i => `    • ${i.label}: ${currency}${i.amount}/mo`).join('\n');
                    return `  ${label}: ${currency}${c.total}/mo${itemLines ? '\n' + itemLines : ''}`;
                })
                .join('\n');
            const loanLines = (budget.loanTracks || [])
                .map(lt => lt.active
                    ? `  - "${lt.track}" (${lt.loan}): ${currency}${lt.amount}/mo — ends in ${lt.monthsLeft}mo (${lt.endDate})`
                    : `  - "${lt.track}" (${lt.loan}): ${currency}${lt.amount}/mo — already expired (${lt.endDate})`)
                .join('\n');
            const loanSection = loanLines ? `\n- Loan tracks (scheduled expense reductions):\n${loanLines}` : '';
            const inflSection = budget.inflation
                ? `\n- Inflation projection (${Math.round(budget.inflation.rate * 100 * 10) / 10}%/yr, ${budget.inflation.years} years): projected ${currency}${budget.inflation.projectedMonthly}/mo | ${currency}${budget.inflation.projectedAnnual}/yr`
                : '';
            budgetSection = `\nBUDGET PLANNER (monthly expense plan):\n- Total monthly: ${currency}${budget.totalMonthly} | Annual: ${currency}${budget.totalAnnual}\n- Gap vs income target: ${currency}${budget.gap} (${budget.gap >= 0 ? 'surplus' : 'shortfall'})${inflSection}\n- By category:\n${catLines}${loanSection}\n`;
        }
    } catch {}

    // Pension exemption (פטור מקצבה מזכה) - 2026
    const pensionExemption = inputs.fiscalParameters?.pensionExemption || { rate: 0.575, maxMonthly: 5422, maxQualifiedIncome: 9430 };

    return `You are a knowledgeable retirement planning advisor.
Answer questions about the user's personal retirement plan using their data below.
Respond in ${isHe ? 'Hebrew' : 'English'}. Be concise and conversational (under 200 words unless more is needed).
CRITICAL: Always cite specific numbers (${currency} amounts, ages, %) from the user's data. Never give generic advice without numbers.
Do NOT use JSON in your visible reply. If asked about something unrelated to retirement planning, gently redirect.

TODAY'S DATE: ${todayStr}

REMINDER CREATION:
If the user asks to set a reminder (any language/phrasing), append this block at the very end of your reply — after your full text response, on a new line — and nowhere else:
%%REMINDER%%{"label":"<short title>","date":"<YYYY-MM-DD>","note":"<optional context>","recurring":<true|false>,"recurringType":"<monthly|interval|null>","recurringDay":<1-31 or null>,"recurringInterval":<days or null>}%%ENDREMINDER%%
Rules:
- For a one-time reminder: recurring=false, recurringType=null, recurringDay=null, recurringInterval=null
- For monthly recurring (e.g. "every 1st of the month"): recurring=true, recurringType="monthly", recurringDay=<day>, recurringInterval=null
- For interval recurring (e.g. "every 30 days"): recurring=true, recurringType="interval", recurringInterval=<days>, recurringDay=null
- Date must be YYYY-MM-DD. For relative dates ("in 2 weeks", "next month") compute from today (${todayStr}).
- Only append this block when explicitly creating a reminder. Never include it otherwise.

USER PROFILE:
- Age: ${inputs.currentAge} | Retire at: ${inputs.retirementStartAge} (in ${yearsToRetirement} yrs) | End age: ${inputs.retirementEndAge} (${yearsInRetirement} yrs drawdown)
- Current savings: ${currency}${Number(inputs.currentSavings).toLocaleString()} | Monthly contribution: ${currency}${inputs.monthlyContribution}
- Desired monthly income in retirement: ${currency}${inputs.monthlyNetIncomeDesired}${inputs.targetEndBalance ? ` | Target end balance: ${currency}${Number(inputs.targetEndBalance).toLocaleString()}` : ''}
- Annual return: ${returnRateText} | Inflation: ${inputs.inflationRate ?? 0}% | Tax on gains: ${inputs.taxRate ?? 25}%
- Strategy: ${bucketText}

PENSION / INCOME SOURCES:
${pensionText}

LIFE EVENTS (one-time or recurring changes):
${eventsText}

MARKET CRASH SCENARIO:
${crashText}

ISRAELI TAX RULES (used by the calculator):
- Income tax brackets (monthly): ${bracketsText}
- Pension income exemption (פטור מקצבה מזכה): ${Math.round(pensionExemption.rate * 100)}% of qualifying pension is exempt, up to ${currency}${pensionExemption.maxMonthly}/mo (qualifying income cap: ${currency}${pensionExemption.maxQualifiedIncome}/mo)
- Capital gains tax on savings withdrawals: ${inputs.taxRate ?? 25}% (flat, applied in calculator)
- NI (Bituach Leumi): paid from age 67, income test applies ages 67–70 (work income only)

CALCULATED RESULTS:
- Balance at retirement (age ${inputs.retirementStartAge}): ${currency}${Math.round(results?.balanceAtRetirement || 0).toLocaleString()}
- Balance at end (age ${inputs.retirementEndAge}): ${currency}${Math.round(results?.balanceAtEnd || 0).toLocaleString()}
- Required capital at retirement: ${currency}${Math.round(results?.requiredCapitalAtRetirement || 0).toLocaleString()}
- Deficit needed today: ${currency}${Math.round(results?.pvOfDeficit || 0).toLocaleString()}
- ${results?.ranOutAtAge ? `RUNS OUT at age ${results.ranOutAtAge}` : 'Fully funded — never runs out'}${inputs.targetEndBalance && results?.balanceAtEnd != null ? `\n- Gap to target: ${currency}${Math.round(results.balanceAtEnd - parseFloat(inputs.targetEndBalance)).toLocaleString()} (${results.balanceAtEnd >= parseFloat(inputs.targetEndBalance) ? 'TARGET MET' : 'SHORTFALL'})` : ''}
${budgetSection}`;
}

/**
 * Formats a multi-turn conversation as a single text prompt (works across all providers).
 */
function formatConversation(systemPrompt, messages) {
    let prompt = systemPrompt + '\n\n---\n';
    for (const m of messages) {
        prompt += m.role === 'user' ? '\nUser: ' : '\nAssistant: ';
        prompt += m.content;
    }
    prompt += '\nAssistant:';
    return prompt;
}

/**
 * Sends a multi-turn chat conversation to the AI and returns the response text.
 */
const MAX_HISTORY_MESSAGES = 10; // keep last 10 messages (~5 turns) to avoid token limits

export async function getChatResponse(messages, systemPrompt, provider, model, apiKeyOverride = null, { signal } = {}) {
    const envKey = getProviderEnvKey(provider);
    const apiKey = apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : null);

    if (!apiKey) throw new Error('Missing API Key');
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Trim history to avoid exceeding token limits, always keep the last user message
    const trimmed = messages.length > MAX_HISTORY_MESSAGES
        ? messages.slice(-MAX_HISTORY_MESSAGES)
        : messages;

    const onRetry = null;
    let responseText = '';

    if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        responseText = await withRetry(async () => {
            const genModel = genAI.getGenerativeModel({
                model,
                systemInstruction: systemPrompt,
            });
            const history = trimmed.slice(0, -1).map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }],
            }));
            const lastMsg = trimmed[trimmed.length - 1].content;
            const chat = genModel.startChat({ history });
            const result = await chat.sendMessage(lastMsg);
            return result.response.text();
        }, { onRetry });

    } else if (provider === 'openai') {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        const completion = await withRetry(() =>
            openai.chat.completions.create({
                model,
                messages: [{ role: 'system', content: systemPrompt }, ...trimmed],
            }), { onRetry });
        responseText = completion.choices[0].message.content;

    } else if (provider === 'anthropic') {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        const message = await withRetry(() =>
            anthropic.messages.create({
                model, max_tokens: 2048,
                system: systemPrompt,
                messages: trimmed,
            }), { onRetry });
        responseText = message.content[0].text;
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return responseText;
}
