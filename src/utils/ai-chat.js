import { getProviderEnvKey } from '../config/ai-models';
import { withRetry } from './ai-calculator';
import { DEFAULT_TAX_BRACKETS } from './fiscalDefaults';
import { capeToWithdrawalRate } from './cape';

/**
 * Builds a system prompt giving the AI full context about the user's retirement plan.
 */
export function buildChatSystemPrompt(inputs, results, language) {
    const isHe = language === 'he';
    const currency = isHe ? '₪' : '$';
    const todayStr = new Date().toISOString().split('T')[0];
    const yearsToRetirement = Math.max(0, Math.round(parseFloat(inputs.retirementStartAge) - parseFloat(inputs.currentAge)));
    const yearsInRetirement = Math.round(parseFloat(inputs.retirementEndAge) - parseFloat(inputs.retirementStartAge));

    // Pension sources — enriched per-source detail
    const pensionText = (inputs.pensionIncomeSources || [])
        .filter(s => s.enabled !== false)
        .map(s => {
            const base = `${s.name || s.type} [${s.type}]: ${currency}${s.amount}/mo from age ${s.startAge}${s.endAge ? ` to ${s.endAge}` : ' (lifetime)'}${s.isTaxable === false ? ' (tax-exempt)' : ' (taxable)'}`;
            const extras = [];
            if (s.currentAsset?.balance) {
                const bal = Math.round(parseFloat(s.currentAsset.balance));
                const ageAtDate = s.currentAsset.ageAtDate ? ` at age ${s.currentAsset.ageAtDate}` : '';
                extras.push(`fund balance: ${currency}${bal.toLocaleString()}${ageAtDate}`);
                if (s.currentAsset.kind) extras.push(`kind: ${s.currentAsset.kind}`);
                if (s.currentAsset.returnRate !== undefined && s.currentAsset.returnRate !== '') extras.push(`fund return: ${s.currentAsset.returnRate}%`);
            }
            if (s.calculationDetails) {
                const d = s.calculationDetails;
                if (d.totalMonthly) extras.push(`NI total: ${currency}${Math.round(d.totalMonthly)}/mo`);
                if (d.baseAmount) extras.push(`NI base: ${currency}${Math.round(d.baseAmount)}/mo`);
                if (d.dependentAddition) extras.push(`NI dependent add-on: ${currency}${Math.round(d.dependentAddition)}/mo`);
            }
            if (s.providentAnnuityAmount) extras.push(`provident annuity: ${currency}${Math.round(s.providentAnnuityAmount)}/mo`);
            return extras.length ? `${base}\n    (${extras.join(' | ')})` : base;
        })
        .join('\n  ') || 'None';

    // Pension interest rate
    const pensionRate = inputs.pensionInterestRate !== undefined ? parseFloat(inputs.pensionInterestRate) : null;

    // Masleka pension clearinghouse data
    let maslekaSection = '';
    const ms = inputs.pensionMaslekaSummary;
    if (ms?.total) {
        const t2 = ms.total;
        const fmt = (v) => `${currency}${Math.round(v || 0).toLocaleString()}`;
        const catLines = (ms.categories || []).map(c => {
            const label = isHe ? (c.labelHe || c.labelEn) : (c.labelEn || c.labelHe);
            return `    • ${label}: current ${fmt(c.currentBalance)} | projected w/contrib ${fmt(c.projectedWithContribBalance)} (${fmt(c.projectedWithContribAnnuity)}/mo) | w/o contrib ${fmt(c.projectedNoContribBalance)} (${fmt(c.projectedNoContribAnnuity)}/mo) | monthly deposits ${fmt(c.monthlyDeposits)} | return ${c.weightedYearlyReturn ? c.weightedYearlyReturn.toFixed(1) : '?'}% | fees ${c.weightedFeesFromBalance ? c.weightedFeesFromBalance.toFixed(2) : '?'}%`;
        }).join('\n');
        maslekaSection = `\nPENSION FUND CLEARINGHOUSE (Masleka${ms.asOfDate ? `, as of ${ms.asOfDate}` : ''}):\n- Total current balance: ${fmt(t2.currentBalance)}\n- Projected with contributions → balance: ${fmt(t2.projectedWithContribBalance)} | monthly annuity: ${fmt(t2.projectedWithContribAnnuity)}/mo\n- Projected without contributions → balance: ${fmt(t2.projectedNoContribBalance)} | monthly annuity: ${fmt(t2.projectedNoContribAnnuity)}/mo\n- Total monthly deposits (employee+employer): ${fmt(t2.monthlyDeposits)}\n- Weighted annual return: ${t2.weightedYearlyReturn ? t2.weightedYearlyReturn.toFixed(1) : '?'}% | Weighted fees: ${t2.weightedFeesFromBalance ? t2.weightedFeesFromBalance.toFixed(2) : '?'}%\n- By category:\n${catLines}\n`;
    }

    // Stored pension AI insight (if previously analysed)
    let pensionAiSection = '';
    const pai = inputs.pensionAIInsight;
    if (pai?.summary) {
        pensionAiSection = `\nPENSION AI ANALYSIS (previously generated):\n${pai.summary}${pai.recommendations?.length ? '\nRecommendations: ' + pai.recommendations.join(' | ') : ''}\n`;
    }

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

    // Additional yearly income (reduces savings burden during active years)
    const activeAdditional = (inputs.additionalYearlyIncome || [])
        .filter(e => e.enabled !== false && parseFloat(e.monthlyAmount) > 0 && e.startYear);
    const additionalIncomeText = activeAdditional.length > 0
        ? activeAdditional.map(e => {
            const end = e.endYear ? `–${e.endYear}` : ' (ongoing)';
            return `  - ${e.description || 'Additional income'}: ${currency}${Math.round(parseFloat(e.monthlyAmount))}/mo, years ${e.startYear}${end}`;
        }).join('\n')
        : '  None';

    // Yearly income overrides (desired income target by year)
    const overrideEntries = inputs.yearlyIncomeOverrides && typeof inputs.yearlyIncomeOverrides === 'object'
        ? Object.entries(inputs.yearlyIncomeOverrides)
            .filter(([, v]) => parseFloat(v) > 0)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
        : [];
    const incomeScheduleText = overrideEntries.length > 0
        ? overrideEntries.map(([yr, amt]) => `  - Year ${yr}: ${currency}${Math.round(parseFloat(amt))}/mo`).join('\n')
          + `\n  - All other years: ${currency}${inputs.monthlyNetIncomeDesired}/mo (base)`
        : null;

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

    // Withdrawal strategy
    const strategyMap = {
        fixed: isHe ? 'קבוע — סכום חודשי קבוע' : 'Fixed — fixed monthly amount',
        fourPercent: isHe ? 'כלל 4% — 4% מהיתרה ההתחלתית בשנה' : '4% Rule — 4% of initial balance per year',
        percentage: isHe ? `% מהתיק — ${inputs.withdrawalPercentage ?? 4}% מהיתרה הנוכחית` : `% of Portfolio — ${inputs.withdrawalPercentage ?? 4}% of current balance`,
        dynamic: isHe ? 'דינמי — מתאים לפי ביצועי השוק' : 'Dynamic — adjusts to market performance',
        interestOnly: isHe ? 'ריבית בלבד — רק הרבית החודשית' : 'Interest Only — monthly interest only',
        guardrails: isHe ? 'גדרות גויטון-קלינגר — שומר על קצב משיכה סביר' : 'Guardrails (Guyton-Klinger) — keeps withdrawal rate in safe band',
        vpw: isHe ? 'VPW — יתרה / חודשים שנותרו' : 'VPW — balance ÷ months remaining',
        cape: (() => {
            const capeVal = parseFloat(inputs.capeRatio) || 33.5;
            const rate = (capeToWithdrawalRate(capeVal) * 100).toFixed(1);
            return isHe
                ? `CAPE — שיעור משיכה לפי P/E שילר (${capeVal.toFixed(1)}${inputs.capeIsLive ? '' : ' מוערך'}) → ${rate}%/שנה`
                : `CAPE-based — Shiller P/E ratio (${capeVal.toFixed(1)}${inputs.capeIsLive ? '' : ' est.'}) → ${rate}%/yr`;
        })(),
    };
    const withdrawalStrategyText = strategyMap[inputs.withdrawalStrategy] || strategyMap.fixed;

    // Budget planner awareness — read from sessionStorage (written by BudgetPlanner on every change)
    let budgetSection = '';
    try {
        const budget = JSON.parse(sessionStorage.getItem('rc-budget-summary') || 'null');
        if (budget && budget.totalMonthly > 0) {
            const hs = budget.householdSize ?? 1;
            const yearLabel = budget.selectedYear ? ` (year ${budget.selectedYear})` : '';
            const catLines = (budget.categories || [])
                .filter(c => !c.empty)
                .map(c => {
                    const label = isHe ? c.labelHe : c.labelEn;
                    const perPersonNote = hs > 1 && c.scalesWithPeople && c.perPerson
                        ? ` [${currency}${c.perPerson}/person]` : '';
                    const itemLines = (c.items || []).map(i => `    • ${i.label}: ${currency}${i.amount}/mo`).join('\n');
                    return `  ${label}: ${currency}${c.total}/mo${perPersonNote}${itemLines ? '\n' + itemLines : ''}`;
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
            const householdNote = hs > 1
                ? `\n- Household: ${hs} people | Per-person average: ${currency}${budget.perPerson ?? Math.round(budget.totalMonthly / hs)}/mo`
                : '';
            budgetSection = `\nBUDGET PLANNER (monthly expense plan${yearLabel}):\n- Total monthly: ${currency}${budget.totalMonthly} | Annual: ${currency}${budget.totalAnnual}${householdNote}\n- Gap vs retirement income target: ${currency}${budget.gap} (${budget.gap >= 0 ? 'surplus — budget is below target' : 'shortfall — budget exceeds target'})${inflSection}\n- By category:\n${catLines}${loanSection}\n`;
        }
    } catch {}

    // Pension exemption (פטור מקצבה מזכה) - 2026
    const pensionExemption = inputs.fiscalParameters?.pensionExemption || { rate: 0.575, maxMonthly: 5422, maxQualifiedIncome: 9430 };

    return `You are a knowledgeable retirement planning advisor.
Answer questions about the user's personal retirement plan using their data below.
Respond in ${isHe ? 'Hebrew' : 'English'}. Be concise and conversational (under 200 words unless more is needed).
CRITICAL: Always cite specific numbers (${currency} amounts, ages, %) from the user's data. Never give generic advice without numbers.
Do NOT use JSON in your visible reply. If asked about something unrelated to retirement planning, gently redirect.
BUDGET AWARENESS: When budget data is present, treat it as the user's actual expense plan for retirement. Use it to:
- Explain how the total monthly expense compares to the desired retirement income and what capital that requires.
- Factor in household size — scalable categories (food, health, personal, family, entertainment) change per person; fixed ones (housing utilities, insurance) do not.
- When asked about reducing expenses or optimizing, identify which categories have the most impact on required retirement capital (each ${currency}100/mo saved reduces required capital by roughly ${currency}${Math.round(100 * 12 / 0.04).toLocaleString()} at the 4% rule).
- If the budget exceeds the income target, proactively note the shortfall's effect on the calculator results.

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
- Withdrawal strategy: ${withdrawalStrategyText}
- Portfolio strategy: ${bucketText}

PENSION / INCOME SOURCES:${pensionRate !== null ? `\n- Pension fund assumed return rate: ${pensionRate}%/yr` : ''}
  ${pensionText}
${maslekaSection}${pensionAiSection}
ADDITIONAL INCOME (reduces savings withdrawal during active periods):
${additionalIncomeText}
${incomeScheduleText ? `\nINCOME SCHEDULE (desired monthly target by year):\n${incomeScheduleText}` : ''}
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
                model, max_tokens: 4096,
                system: systemPrompt,
                messages: trimmed,
            }), { onRetry });
        responseText = message.content[0].text;
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return responseText;
}
