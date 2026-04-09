import React, { useState } from 'react';
import { useDraggable } from '../hooks/useDraggable';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { calculateRetirementWithAI } from '../utils/ai-calculator';
import { NATIONAL_INSURANCE_RATES, PENSION_TAX_BRACKETS } from '../utils/pensionCalculator';
import { Sparkles, Save, RotateCcw, Check, AlertTriangle, Code, Copy, Table } from 'lucide-react';
import { deepEqual } from '../hooks/useDeepCompare';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency as formatCurrencyUtil } from '../utils/formatters';
import {
    DEFAULT_FISCAL_PARAMETERS,
    validateFiscalParameters,
    detectOutdatedValues
} from '../utils/fiscalDefaults';

export function FiscalUpdateModal({
    isOpen,
    onClose,
    onSave,
    currentParameters,
    currentFamilyStatus,
    t,
    language,
    aiProvider,
    aiModel,
    apiKeyOverride
}) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    useBodyScrollLock(isOpen);
    const { dragStyle, onDragMouseDown } = useDraggable(isOpen);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [proposedParameters, setProposedParameters] = useState(null);
    const [selectedStatus, setSelectedStatus] = useState(currentFamilyStatus || 'single');
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [lastPrompt, setLastPrompt] = useState(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [aiResults, setAiResults] = useState(null);
    const [showRawResults, setShowRawResults] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [sanityWarning, setSanityWarning] = useState(null);

    // Reset state when modal opens to ensure clean slate
    React.useEffect(() => {
        if (isOpen) {
            setProposedParameters(null);
            setIsDuplicate(false);
            setAiResults(null);
            setSelectedStatus(currentFamilyStatus || 'single');
            setLoading(false);
            setError(null);
            setSanityWarning(null);
        }
    }, [isOpen, currentFamilyStatus]);

    const handleCopy = async () => {
        if (!lastPrompt) return;
        try {
            await navigator.clipboard.writeText(lastPrompt);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy matches:', err);
        }
    };

    if (!isOpen) return null;

    const baseParameters = currentParameters || DEFAULT_FISCAL_PARAMETERS;

    // Generate improved AI prompt for fiscal data retrieval
    const generateFiscalPrompt = (attemptNumber = 1) => {
        const currentYear = new Date().getFullYear();

        // Base prompt with clear structure and validation requirements
        let prompt = `
You are a senior Israeli tax and pension analyst. Your task is to provide ACCURATE, VERIFIED data for Israel's National Insurance (Bituach Leumi) old-age pension rates and income tax brackets for January ${currentYear}.

CRITICAL REQUIREMENTS:
1. Data must be for ${currentYear}, NOT ${currentYear - 1} or earlier years
2. All values must be MONTHLY amounts in Israeli Shekels (ILS)
3. Values must satisfy these MANDATORY relationships:
   - couple > single (couple includes spouse supplement)
   - single_child > single (single_child includes child supplement)
   - couple_child > couple (couple_child includes child supplement)
   - couple_child > single_child
4. Tax brackets must have ASCENDING limits

SEARCH QUERIES TO USE:
- "ביטוח לאומי קצבת אזרח ותיק ${currentYear}" (National Insurance old-age pension ${currentYear})
- "מדרגות מס הכנסה ${currentYear}" (Income tax brackets ${currentYear})
- "תוספת בן זוג ביטוח לאומי ${currentYear}" (Spouse supplement ${currentYear})

EXPECTED VALUES FOR JANUARY ${currentYear} (use these as reference):
National Insurance (Bituach Leumi) old-age pension:
- Single base pension: 1838 ILS/month
- Spouse supplement: 924 ILS/month (so couple = 1838 + 924 = 2762)
- Child supplement: 581 ILS/month (so single_child = 1838 + 581 = 2419)
- couple_child = 1838 + 924 + 581 = 3343
- Age 80+ addon: 103 ILS/month
- Income test threshold (single): 13970 ILS/month (above = no pension)
- Income test threshold (couple): 19483 ILS/month (above = no pension)

Tax brackets (monthly limits):
- 10%: up to 7010 ILS
- 14%: 7010-10060 ILS
- 20%: 10060-16150 ILS
- 31%: 16150-22440 ILS
- 35%: 22440-46690 ILS
- 47%: above 46690 ILS

IMPORTANT: If you cannot find updated ${currentYear} values, use the reference values above.

CALCULATION INSTRUCTIONS:
1. Find the BASE single person pension for ${currentYear}
2. Find the SPOUSE SUPPLEMENT amount
3. Find the CHILD SUPPLEMENT amount
4. Calculate totals:
   - single = base pension
   - couple = base pension + spouse supplement
   - single_child = base pension + child supplement
   - couple_child = base pension + spouse supplement + child supplement

OUTPUT FORMAT:
Return ONLY a valid JSON object (no markdown, no explanation), exactly like this:

{
  "nationalInsurance": {
    "baseRates": {
      "single": <number>,
      "single_child": <number>,
      "couple": <number>,
      "couple_child": <number>,
      "age80PlusAddon": <number>,
      "seniorityAdditionPerYear": 2
    },
    "deferralBonusPerMonth": 5,
    "incomeTestThreshold": {
      "single": <number>,
      "couple": <number>
    }
  },
  "taxBrackets": [
    { "limit": <number>, "rate": 0.10 },
    { "limit": <number>, "rate": 0.14 },
    { "limit": <number>, "rate": 0.20 },
    { "limit": <number>, "rate": 0.31 },
    { "limit": <number>, "rate": 0.35 },
    { "limit": <number>, "rate": 0.47 },
    { "limit": null, "rate": 0.47 }
  ]
}`;

        // Add retry-specific instructions if this is a retry attempt
        if (attemptNumber > 1) {
            prompt += `

RETRY ATTEMPT ${attemptNumber}: Previous response failed validation.
Please double-check:
- Are you using ${currentYear} data (not ${currentYear - 1})?
- Is couple (${DEFAULT_FISCAL_PARAMETERS.nationalInsurance.baseRates.couple}) > single (${DEFAULT_FISCAL_PARAMETERS.nationalInsurance.baseRates.single})?
- Are tax bracket limits in ASCENDING order?

Reference values for ${currentYear} (use if search fails):
- Single: ~1838 ILS
- Couple: ~2762 ILS
- First tax bracket: ~7010 ILS`;
        }

        return prompt;
    };

    const handleAutoUpdate = async (retryCount = 0) => {
        const MAX_RETRIES = 2;

        if (retryCount === 0) {
            setLoading(true);
            setError(null);
            setIsDuplicate(false);
            setProposedParameters(null);
            setAiResults(null);
        }

        try {
            const currentYear = new Date().getFullYear();

            setStatusMessage(
                retryCount > 0
                    ? (language === 'he' ? `ניסיון ${retryCount + 1} - מאמת נתונים...` : `Attempt ${retryCount + 1} - Validating data...`)
                    : (language === 'he' ? `מחפש נתוני ${currentYear}...` : `Searching for ${currentYear} data...`)
            );

            const prompt = generateFiscalPrompt(retryCount + 1);


            setLastPrompt(prompt);

            setStatusMessage(language === 'he' ? 'מנתח נתונים ומצליב מקורות...' : 'Analyzing data and cross-referencing...');

            const result = await calculateRetirementWithAI(
                { prompt }, // Special mode or just pass prompt as input logic
                aiProvider,
                aiModel,
                apiKeyOverride,
                null,
                t
            );

            // AI returns { nationalInsurance: {...}, taxBrackets: [...] } directly, not nested under fiscalParameters
            // Handle both formats for flexibility
            const rawFiscalData = result?.fiscalParameters || (result?.nationalInsurance ? result : null);

            if (rawFiscalData && rawFiscalData.nationalInsurance) {
                // Clean up any extraneous fields added by calculateRetirementWithAI (history, source, etc.)
                const fiscalData = {
                    nationalInsurance: rawFiscalData.nationalInsurance,
                    taxBrackets: rawFiscalData.taxBrackets
                };

                // STEP 1: Run comprehensive validation

                const validationResult = validateFiscalParameters(fiscalData);

                // STEP 2: Check for outdated year data
                const singleRate = fiscalData.nationalInsurance?.baseRates?.single;
                const outdatedCheck = singleRate ? detectOutdatedValues(Number(singleRate)) : { isOutdated: false };

                if (outdatedCheck.isOutdated) {
                    validationResult.errors.push(`${outdatedCheck.message}`);
                    validationResult.isValid = false;
                }

                // STEP 3: If validation failed and we have retries left, retry
                if (!validationResult.isValid && retryCount < MAX_RETRIES) {
                    console.warn(`Validation failed (attempt ${retryCount + 1}):`, validationResult.errors);
                    setStatusMessage(language === 'he'
                        ? `אימות נכשל, מנסה שוב...`
                        : `Validation failed, retrying...`);

                    // Wait a moment before retry
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return handleAutoUpdate(retryCount + 1);
                }

                // STEP 4: If validation failed after all retries, show errors but use corrected data if available
                if (!validationResult.isValid) {
                    console.error('Validation failed after all retries:', validationResult.errors);

                    // Use defaults if we can't salvage the data
                    const fallbackData = DEFAULT_FISCAL_PARAMETERS;

                    setSanityWarning([
                        ...(language === 'he'
                            ? ['AI החזיר נתונים לא תקינים. משתמש בברירת מחדל.']
                            : ['AI returned invalid data. Using defaults.']),
                        ...validationResult.errors.slice(0, 3) // Show first 3 errors
                    ]);

                    setProposedParameters(fallbackData);
                    setAiResults(fiscalData); // Show raw AI data for debugging
                    setStatusMessage('');
                    setLoading(false);
                    return;
                }

                // STEP 5: Use validated/corrected data
                const validatedData = validationResult.correctedData || fiscalData;


                // Collect warnings from validation
                const warnings = [...validationResult.warnings];

                // Additional sanity check: Compare against baseline
                const aiSingle = validatedData.nationalInsurance?.baseRates?.single;
                const baseSingle = baseParameters?.nationalInsurance?.baseRates?.single || NATIONAL_INSURANCE_RATES.baseRates.single;
                if (aiSingle && baseSingle) {
                    const diffPercent = Math.abs((aiSingle - baseSingle) / baseSingle) * 100;
                    if (diffPercent > 15) {
                        warnings.push(language === 'he'
                            ? `קצבת בסיס: AI החזיר ${aiSingle.toLocaleString()}₪ (הפרש ${diffPercent.toFixed(0)}% מברירת המחדל ${baseSingle.toLocaleString()}₪)`
                            : `Base Rate: AI returned ${aiSingle.toLocaleString()} (${diffPercent.toFixed(0)}% diff from default ${baseSingle.toLocaleString()})`);
                    }
                }

                // Check first tax bracket
                const aiFirstBracket = validatedData.taxBrackets?.[0]?.limit;
                const baseFirstBracket = baseParameters?.taxBrackets?.[0]?.limit || PENSION_TAX_BRACKETS[0].limit;
                if (aiFirstBracket && baseFirstBracket) {
                    const diffPercent = Math.abs((aiFirstBracket - baseFirstBracket) / baseFirstBracket) * 100;
                    if (diffPercent > 15) {
                        warnings.push(language === 'he'
                            ? `מדרגת מס ראשונה: AI החזיר ${aiFirstBracket.toLocaleString()}₪ (הפרש ${diffPercent.toFixed(0)}% מברירת המחדל ${baseFirstBracket.toLocaleString()}₪)`
                            : `First Tax Bracket: AI returned ${aiFirstBracket.toLocaleString()} (${diffPercent.toFixed(0)}% diff from default ${baseFirstBracket.toLocaleString()})`);
                    }
                }

                if (warnings.length > 0) {
                    setSanityWarning(warnings);
                } else {
                    setSanityWarning(null);
                }

                // Check if identical to base parameters
                if (deepEqual(validatedData, baseParameters)) {
                    setIsDuplicate(true);
                    setProposedParameters(validatedData);
                } else {
                    setProposedParameters(validatedData);
                }
                setAiResults(validatedData);
                setStatusMessage('');

            } else {
                console.warn('AI Fiscal Update - Invalid response structure:', result);
                throw new Error(t ? t('invalidAiResponse') : 'Invalid AI response structure');
            }

        } catch (err) {
            // If error and retries left, try again
            if (retryCount < MAX_RETRIES) {
                console.warn(`Error on attempt ${retryCount + 1}, retrying:`, err.message);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return handleAutoUpdate(retryCount + 1);
            }

            // Fallback: Use defaults after all retries failed
            console.error("AI Update Failed after retries:", err);
            setError(err.message || "AI Update Failed");
            setStatusMessage('');

            // Use centralized defaults
            const fallbackParams = DEFAULT_FISCAL_PARAMETERS;

            if (deepEqual(fallbackParams, baseParameters)) {
                setIsDuplicate(true);
            }
            setProposedParameters(fallbackParams);
            setAiResults(fallbackParams);
        } finally {
            if (retryCount === 0 || retryCount >= MAX_RETRIES) {
                setLoading(false);
            }
        }
    };

    const handleReset = () => {
        // Use centralized defaults
        setProposedParameters(DEFAULT_FISCAL_PARAMETERS);
        setIsDuplicate(true);
        setAiResults(null);
    };

    const formatCurrency = (val) => formatCurrencyUtil(val, language);

    const areTaxBracketsEqual = (brackets1, brackets2) => {
        if (!brackets1 || !brackets2) return false;
        if (brackets1.length !== brackets2.length) return false;

        const parseVal = (v) => {
            if (v === null || v === undefined || v === Infinity || v === 0) return 'infinity';
            const s = v.toString().toLowerCase().replace(/,/g, '');
            if (s === 'infinity') return 'infinity';
            return parseFloat(s);
        };

        for (let i = 0; i < brackets1.length; i++) {
            const b1 = brackets1[i];
            const b2 = brackets2[i];

            const l1 = parseVal(b1.limit);
            const l2 = parseVal(b2.limit);

            if (l1 !== l2) {
                return false;
            }

            // Compare rates with small tolerance for float precision
            if (Math.abs(Number(b1.rate) - Number(b2.rate)) > 0.001) {
                return false;
            }
        }
        return true;
    };

    const getSafeBaseRate = (rates, status = 'single') => {
        if (!rates || !rates.baseRates) return 0;
        const s = status || 'single';
        const val = rates.baseRates[s] || rates.baseRates.single;
        if (typeof val === 'object' && val !== null) {
            return val[67] || val[80] || 0; // Handle legacy 2025 format
        }
        return val || 0;
    };

    const translateStatus = (status) => {
        if (language !== 'he') return status;
        const translations = {
            'single': 'יחיד/ה',
            'single_child': 'יחיד/ה + ילד',
            'couple': 'זוג',
            'couple_child': 'זוג + ילד'
        };
        return translations[status] || status;
    };


    const hasStatusChanged = selectedStatus !== (currentFamilyStatus || 'single');

    // Calculate semantic changes (what the user actually sees)
    // 1. Check NI Base Rate
    const niChanged = getSafeBaseRate(proposedParameters?.nationalInsurance, selectedStatus) !== getSafeBaseRate(baseParameters?.nationalInsurance, currentFamilyStatus);

    // 2. Check Tax Brackets (using robust equality)
    // Note: We access taxBrackets safely
    const taxChanged = !areTaxBracketsEqual(baseParameters.taxBrackets, proposedParameters?.taxBrackets);

    // 3. Combined visible change flag
    const hasVisibleParametersChanged = proposedParameters && (niChanged || taxChanged);
    // Alias for backward compatibility with JSX
    const hasParametersChanged = hasVisibleParametersChanged;

    // Save should only be enabled if there are ACTUAL visible changes to commit
    const canSave = hasVisibleParametersChanged || hasStatusChanged;

    const handleSave = () => {
        onSave({
            parameters: proposedParameters || currentParameters,
            familyStatus: selectedStatus
        });
        onClose();
    };





    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className={`relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${theme === 'light' ? 'bg-white' : ''} ring-1 ${theme === 'light' ? 'ring-gray-300' : 'ring-white/30'} flex flex-col`} style={dragStyle}>
                {theme !== 'light' && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                        <div className="absolute inset-0 bg-white/10" />
                    </>
                )}
                <div className="relative z-10 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 cursor-grab active:cursor-grabbing" onMouseDown={onDragMouseDown}>
                        <Sparkles className="text-purple-500" />
                        {language === 'he' ? 'עדכון נתונים מערכתיים' : 'System Parameters Update'}
                    </h2>
                    <p className="text-sm opacity-70 mb-4">
                        {language === 'he'
                            ? 'עדכון נתוני מס, ביטוח לאומי וסטטוס משפחתי למעקב מדויק.'
                            : 'Update tax, national insurance data and family status for accurate tracking.'}
                    </p>

                    <div className="mb-6 space-y-4">
                        <div>
                            <label className={`block text-sm font-medium mb-1.5 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                                {language === 'he' ? 'סטטוס משפחתי (עבור ביטוח לאומי):' : 'Family Status (for NI):'}
                            </label>
                            <select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                                className={`w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 outline-none transition-all ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/5 border-white/20 text-white'}`}
                            >
                                <option value="single" className={isLight ? 'text-slate-900' : 'text-gray-900'}>{language === 'he' ? 'יחיד/ה' : 'Single'}</option>
                                <option value="single_child" className={isLight ? 'text-slate-900' : 'text-gray-900'}>{language === 'he' ? 'יחיד/ה + ילד' : 'Single + Child'}</option>
                                <option value="couple" className={isLight ? 'text-slate-900' : 'text-gray-900'}>{language === 'he' ? 'זוג' : 'Couple'}</option>
                                <option value="couple_child" className={isLight ? 'text-slate-900' : 'text-gray-900'}>{language === 'he' ? 'זוג + ילד' : 'Couple + Child'}</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleAutoUpdate}
                            disabled={loading}
                            className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-medium transition-all ${loading
                                ? (isLight ? 'bg-slate-200 cursor-not-allowed text-slate-500' : 'bg-slate-800 cursor-not-allowed text-slate-400')
                                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20 active:scale-95'
                                }`}
                        >
                            {loading ? (
                                <span className={`animate-spin rounded-full h-5 w-5 border-b-2 ${isLight ? 'border-slate-500' : 'border-purple-400'}`}></span>
                            ) : (
                                <>
                                    <Sparkles size={18} />
                                    {language === 'he' ? 'בדוק עדכונים (AI)' : 'Check for Updates (AI)'}
                                </>
                            )}
                        </button>

                        <button
                            onClick={handleReset}
                            disabled={loading}
                            className={`px-4 py-3 rounded-xl flex items-center justify-center transition-all ${isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                            title={language === 'he' ? 'אפס לברירת מחדל' : 'Reset to Defaults'}
                        >
                            <RotateCcw size={18} />
                        </button>
                    </div>

                    {/* Show Prompt Button */}
                    {lastPrompt && (
                        <div className="mt-2 text-center">
                            <button
                                onClick={() => setShowPrompt(!showPrompt)}
                                className={`w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors ${isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                            >
                                <Code size={14} />
                                {language === 'he' ? (showPrompt ? 'הסתר פרומט' : 'הצג פרומט שנשלח') : (showPrompt ? 'Hide Prompt' : 'Show Sent Prompt')}
                            </button>

                            {showPrompt && (
                                <div className="relative mt-2">
                                    <textarea
                                        readOnly
                                        value={lastPrompt}
                                        dir="ltr"
                                        className={`w-full h-32 p-3 text-xs font-mono rounded-lg border resize-none focus:outline-none custom-scrollbar ${isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-black/30 border-white/10 text-gray-400'}`}
                                    />
                                    <button
                                        onClick={handleCopy}
                                        className={`absolute top-2 right-2 p-1.5 rounded-md transition-all shadow-sm ${isLight ? 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300' : 'bg-white/10 border border-white/10 text-gray-400 hover:text-white hover:bg-white/20'}`}
                                        title={language === 'he' ? 'העתק' : 'Copy'}
                                    >
                                        {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Raw AI Results Viewer */}
                    {aiResults && (
                        <div className="mt-2 text-center">
                            <button
                                onClick={() => setShowRawResults(!showRawResults)}
                                className={`w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors ${isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                            >
                                <Table size={14} />
                                {language === 'he' ? (showRawResults ? 'הסתר נתונים גולמיים' : 'הצג נתוני AI גולמיים') : (showRawResults ? 'Hide Raw Data' : 'Show Raw AI Data')}
                            </button>

                            {showRawResults && (
                                <div className="relative mt-2 text-left">
                                    <pre className={`w-full h-48 p-3 text-[10px] font-mono rounded-lg border overflow-auto custom-scrollbar ${isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-black/30 border-white/10 text-gray-400'}`}>
                                        {JSON.stringify(aiResults, null, 2)}
                                    </pre>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(JSON.stringify(aiResults, null, 2));
                                            setIsCopied(true);
                                            setTimeout(() => setIsCopied(false), 2000);
                                        }}
                                        className={`absolute top-2 right-2 p-1.5 rounded-md transition-all shadow-sm ${isLight ? 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300' : 'bg-white/10 border border-white/10 text-gray-400 hover:text-white hover:bg-white/20'}`}
                                        title={language === 'he' ? 'העתק' : 'Copy'}
                                    >
                                        {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 p-4 border rounded-xl bg-rose-500/10 border-rose-500/20 text-rose-500 text-sm animate-in fade-in duration-300">
                            <div className="flex items-center gap-2 font-bold mb-1">
                                <AlertTriangle size={16} />
                                {t ? t('updateError') : 'Update Error'}
                            </div>
                            <p className="opacity-70 text-xs">{error}</p>
                        </div>
                    )}

                    {sanityWarning && sanityWarning.length > 0 && (
                        <div className="mt-4 p-4 border rounded-xl bg-amber-500/10 border-amber-500/20 text-amber-500 text-sm animate-in fade-in duration-300">
                            <div className="flex items-center gap-2 font-bold mb-2">
                                <AlertTriangle size={16} />
                                {t ? t('unusualValuesWarning') : 'Warning: Unusual Values'}
                            </div>
                            <ul className="space-y-1 text-xs opacity-90">
                                {sanityWarning.map((warning, idx) => (
                                    <li key={idx}>• {warning}</li>
                                ))}
                            </ul>
                            <p className="mt-2 text-xs opacity-70">
                                {t ? t('unusualValuesDesc') : 'AI returned values significantly different from defaults. Verify before saving.'}
                            </p>
                        </div>
                    )}

                    {statusMessage && (
                        <div className="mt-4 p-4 border rounded-xl bg-purple-500/10 border-purple-500/20 text-purple-400 text-sm flex items-center gap-3 animate-in fade-in duration-300">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                            </span>
                            {statusMessage}
                        </div>
                    )}

                    {canSave && (
                        <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className={`border rounded-xl p-4 ${isLight ? 'bg-emerald-50 border-emerald-100' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                                <h3 className="text-emerald-500 font-bold text-sm mb-3 flex items-center gap-2">
                                    <Check size={16} />
                                    {language === 'he' ? 'שינויים לביצוע:' : 'Pending Changes:'}
                                </h3>

                                <div className="space-y-2 text-xs">
                                    {hasStatusChanged && (
                                        <div className="flex justify-between items-center py-1 border-b border-emerald-500/10">
                                            <span className="opacity-70">{language === 'he' ? 'סטטוס משפחתי:' : 'Family Status:'}</span>
                                            <div className="flex items-center gap-2 font-mono font-medium" dir="ltr">
                                                <span className="opacity-50">{translateStatus(currentFamilyStatus || 'single')}</span>
                                                <span className="opacity-30">➔</span>
                                                <span className="text-emerald-500 font-bold">{translateStatus(selectedStatus)}</span>
                                            </div>
                                        </div>
                                    )}

                                    {hasParametersChanged && (
                                        getSafeBaseRate(proposedParameters?.nationalInsurance, selectedStatus) !== getSafeBaseRate(baseParameters?.nationalInsurance, currentFamilyStatus) ? (
                                            <div className="flex justify-between items-center py-1 border-b border-emerald-500/10">
                                                <span className="opacity-70">{language === 'he' ? 'קצבת בסיס בט"ל:' : 'NI Base Pension:'}</span>
                                                <div className="flex items-center gap-2 font-mono" dir="ltr">
                                                    <span className="opacity-50">{formatCurrency(getSafeBaseRate(baseParameters?.nationalInsurance, currentFamilyStatus || 'single'))}</span>
                                                    <span className="opacity-30">➔</span>
                                                    <span className="text-emerald-500 font-bold">{formatCurrency(getSafeBaseRate(proposedParameters?.nationalInsurance || baseParameters?.nationalInsurance, selectedStatus))}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Income Test Threshold Change - Show only if changed */}
                                                {/* Income Test Threshold Change - Hidden as per user request */}

                                                {/* Tax Brackets Change - Show only if changed semantically */}
                                                {!areTaxBracketsEqual(baseParameters.taxBrackets, proposedParameters?.taxBrackets) && (
                                                    <div className="flex justify-between items-center py-1">
                                                        <span className="opacity-70">{language === 'he' ? 'מדרגות מס:' : 'Tax Brackets:'}</span>
                                                        <span className="font-mono font-medium text-emerald-500">
                                                            {language === 'he' ? 'עודכנו' : 'Updated'}
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {proposedParameters && !hasVisibleParametersChanged && !hasStatusChanged && (
                        <div className="mt-4 p-4 border rounded-xl bg-blue-500/10 border-blue-500/20 text-blue-400 text-sm animate-in fade-in duration-300">
                            <div className="flex items-center gap-2 font-bold mb-1">
                                <Check size={16} />
                                {language === 'he' ? 'הכל מעודכן' : 'System Up to Date'}
                            </div>
                            <p className="opacity-70 text-xs">
                                {language === 'he'
                                    ? 'הנתונים במערכת זהים לנתונים העדכניים ביותר שנמצאו.'
                                    : 'Current system parameters match the latest available data.'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={`relative z-10 p-4 border-t flex gap-3 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                    <button
                        onClick={handleSave}
                        disabled={!canSave}
                        className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2
                            ${!canSave
                                ? (isLight ? 'bg-slate-200 text-slate-400' : 'bg-white/5 text-gray-500') + ' cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 active:scale-95'
                            }`}
                    >
                        <Save size={18} />
                        {language === 'he'
                            ? (hasParametersChanged ? 'עדכן ושמור' : 'שמור שינויים')
                            : (hasParametersChanged ? 'Update & Save' : 'Save Changes')}
                    </button>
                    <button
                        onClick={onClose}
                        className={`px-6 py-2.5 rounded-xl font-medium transition-colors ${isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                        {language === 'he' ? 'ביטול' : 'Cancel'}
                    </button>
                </div>
            </div>
        </div>
    );
}
