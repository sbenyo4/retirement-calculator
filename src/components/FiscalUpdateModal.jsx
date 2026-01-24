import React, { useState } from 'react';
import { calculateRetirementWithAI } from '../utils/ai-calculator';
import { NATIONAL_INSURANCE_RATES, PENSION_TAX_BRACKETS } from '../utils/pensionCalculator';
import { Sparkles, Save, RotateCcw, Check, AlertTriangle, Code, Copy, Table } from 'lucide-react';
import { useDeepCompareMemo, deepEqual } from '../hooks/useDeepCompare';
import { useTheme } from '../contexts/ThemeContext';

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

    // Reset state when modal opens to ensure clean slate
    React.useEffect(() => {
        if (isOpen) {
            setProposedParameters(null);
            setIsDuplicate(false);
            setAiResults(null);
            setSelectedStatus(currentFamilyStatus || 'single');
            setLoading(false);
            setError(null);
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

    const baseParameters = currentParameters || {
        taxBrackets: PENSION_TAX_BRACKETS,
        nationalInsurance: NATIONAL_INSURANCE_RATES
    };

    const handleAutoUpdate = async () => {
        setLoading(true);
        setError(null);
        setIsDuplicate(false);
        setProposedParameters(null);
        setAiResults(null);
        try {
            const currentDate = new Date();
            const formattedDate = currentDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

            setStatusMessage(language === 'he' ? `מתחיל מחקר נתונים ל-${formattedDate}...` : `Starting data research for ${formattedDate}...`);

            const prompt = `
            היום הוא ה-${formattedDate}.
            אתה אנליסט מיסים ופנסיה בכיר, המומחה בנתוני המוסד לביטוח לאומי ורשות המיסים בישראל. המטרה שלך היא לספק נתונים מדויקים, מאומתים ועדכניים להיום (${formattedDate}) ולינואר 2026 בלבד.

            בצע את המשימה לפי השלבים הבאים בקפדנות יתרה:

            שלב 1: איתור נתוני מקור (Search Grounding)
            עליך לבצע חיפוש Google מעמיק וספציפי באמצעות השאילתות הבאות:
            1. "עדכון קצבאות ביטוח לאומי ינואר 2026 חוזר רשמי"
            2. "סכומי קצבת אזרח ותיק 2026 המוסד לביטוח לאומי"
            3. "מדרגות מס הכנסה חודשיות 2026 רשות המיסים"
            4. "נקודות זיכוי וסכום קצבה מזכה 2026"

            עליך להתבסס אך ורק על מקורות רשמיים (סיומת gov.il) או אתרים משפטיים/פיננסיים אמינים (כגון 'כל זכות', 'חילן', 'חשבים').

            שלב 2: חילוץ וחישוב נתונים (Critical Calculation Step)
            שים לב! המשתמש דורש סכומים כוללים (Totals) ולא רק את התוספות. עליך לבצע את החישובים הבאים לפני יצירת ה-JSON:

            עבור ביטוח לאומי (Base Rates):
            1. אתר את "קצבת יחיד בסיסית" המעודכנת לינואר 2026. זהו הערך עבור key: "single".
            2. אתר את "תוספת בעד בן זוג". חשב: [קצבת יחיד] + [תוספת בן זוג] = הערך עבור key: "couple".
            3. אתר את "תוספת בעד ילד". חשב: [קצבת יחיד] + [תוספת ילד] = הערך עבור key: "single_child".
            4. חשב: [קצבת יחיד] + [תוספת בן זוג] + [תוספת ילד] = הערך עבור key: "couple_child".
            5. אתר את "תוספת גיל 80". וודא שזו התוספת בלבד.
            6. אתר את "תוספת ותק". וודא שזהו האחוז השנתי (בד"כ 2%).

            עבור מבחן הכנסות (Income Test) - טרם גיל 70:
            1. מצא את "הכנסה מירבית מעבודה" המאפשרת קצבה מלאה (ליחיד ולזוג) המעודכנת לינואר 2026.
            2. מצא את "הכנסה מירבית שלא מעבודה" המאפשרת קצבה מלאה (ליחיד ולזוג) המעודכנת לינואר 2026.

            עבור מס הכנסה (Tax Brackets):
            1. מצא את הטבלה המעודכנת של "שיעורי המס החודשיים מיגיעה אישית" לשנת 2026.
            2. וודא שהתקרות (Limits) מעודכנות לפי עליית המדד של ינואר 2026.

            שלב 3: אימות ובקרה
            - וודא שהנתונים אינם של שנת 2025 או 2024. בשנת 2026 בוצע עדכון רוחבי (לרוב בינואר) המבוסס על הצמדה למדד. חפש את "חוזר הביטוח הלאומי" המעודכן ביותר לינואר 2026.
            - וודא שסכום "couple" גבוה מסכום "single".

            שלב 4: פלט
            החזר אך ורק אובייקט JSON חוקי (ללא טקסט פתיחה או סיום), במבנה הבא בדיוק:

            {
            "nationalInsurance": {
            "baseRates": {
            "single": number,
            "single_child": number, // Must be: Single Base + Child Supplement
            "couple": number, // Must be: Single Base + Spouse Supplement
            "couple_child": number, // Must be: Couple Total + Child Supplement
            "age80PlusAddon": number,
            "seniorityAdditionPerYear": number // e.g., 0.02 for 2%
            },
            "deferralBonusPerMonth": number, // e.g., 0.004166 for 5% per year
            "incomeTestThreshold": {
            "single": number, // Threshold from work
            "couple": number // Threshold from work
            }
            },
            "taxBrackets": [
            { "limit": number, "rate": number }, // Bracket 1 (e.g. 10%)
            { "limit": number, "rate": number }, // Bracket 2 (e.g. 14%)
            { "limit": number, "rate": number }, // Bracket 3 (e.g. 20%)
            { "limit": number, "rate": number }, // Bracket 4 (e.g. 31%)
            { "limit": number, "rate": number }, // Bracket 5 (e.g. 35%)
            { "limit": null, "rate": number } // Bracket 6 (e.g. 47%)
            ]
            }
            `;

            console.debug("AI Researcher Prompt:", prompt);
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

                // GUARD RAIL: Explicitly sanitize "1756" (2025 rate) if the AI hallucinates it
                // User reported regression where AI proposes 1756 instead of 1838.
                // We force 1838 if we detect the outdated 2025 value.
                if (fiscalData.nationalInsurance?.baseRates) {
                    const singleRate = fiscalData.nationalInsurance.baseRates.single;
                    // Check for 1756 or formatted "1,756" or anything close to it (1750-1760)
                    if (singleRate && (singleRate === 1756 || singleRate === '1,756' || (typeof singleRate === 'number' && singleRate > 1750 && singleRate < 1760))) {
                        console.warn("AI returned outdated 2025 rate (1756). Force correcting to 1838.");
                        fiscalData.nationalInsurance.baseRates.single = 1838;

                        // Also fix couple rate if it looks like 2025 (2620 was 2025, 2762 is 2026)
                        if (fiscalData.nationalInsurance.baseRates.couple && fiscalData.nationalInsurance.baseRates.couple < 2700) {
                            fiscalData.nationalInsurance.baseRates.couple = 2762;
                        }
                    }
                }

                // COMPREHENSIVE DATA NORMALIZATION
                // Fixes: 10% vs 0.1, "60,130" vs 60130, Infinity vs null
                if (fiscalData.taxBrackets && Array.isArray(fiscalData.taxBrackets)) {
                    fiscalData.taxBrackets = fiscalData.taxBrackets.map((b, index, arr) => {
                        let { limit, rate } = b;

                        // 1. Normalize Rate (handle 35 vs 0.35)
                        // If rate is > 1.0, assume it's a percentage (e.g. 10, 14, 35) and divide by 100
                        let numericRate = Number(rate);
                        if (numericRate > 1.0) {
                            numericRate = numericRate / 100;
                        }

                        // 2. Normalize Limit
                        let numericLimit = limit;
                        // Handle "60,130" strings
                        if (typeof limit === 'string') {
                            const cleanStr = limit.replace(/,/g, '').toLowerCase();
                            if (cleanStr === 'infinity' || cleanStr === 'null') {
                                numericLimit = null;
                            } else {
                                numericLimit = parseFloat(cleanStr);
                            }
                        }

                        // Handle Infinity/0 for last bracket
                        // If it's the last bracket, or explicitly Infinity/0/null -> normalize to null
                        const isLast = index === arr.length - 1;
                        if (isLast || numericLimit === Infinity || numericLimit === 0 || numericLimit === null) {
                            if (isLast) numericLimit = null;
                        }

                        return { limit: numericLimit, rate: numericRate };
                    });

                    // Special check: ensure we have the catch-all bracket if explicitly missing but previous ends at 60130
                    const last = fiscalData.taxBrackets[fiscalData.taxBrackets.length - 1];
                    // If last bracket has a real limit (e.g. 60130), we are missing the "infinity" bracket. Add it.
                    if (last && typeof last.limit === 'number' && last.limit > 50000) {
                        fiscalData.taxBrackets.push({ limit: null, rate: 0.47 });
                    }
                }

                console.log('Normalized AI Fiscal Data:', fiscalData);

                // Check if identical to base parameters
                if (deepEqual(fiscalData, baseParameters)) {
                    setIsDuplicate(true);
                    setProposedParameters(fiscalData); // Keep it to show user proof
                } else {
                    setProposedParameters(fiscalData);
                }
                setAiResults(fiscalData);
                console.log('AI Fiscal Update - Successfully parsed & normalized:', fiscalData);
            } else {
                console.warn('AI Fiscal Update - Invalid response structure:', result);
                throw new Error("AI Update not fully wired. Using fallback.");
            }

        } catch (err) {
            // Fallback: Use baseline data, but show error
            console.error("AI Update Failed:", err);
            setError(err.message || "AI Update Failed");
            setStatusMessage('');

            const fallbackParams = {
                nationalInsurance: {
                    baseRates: {
                        single: 1838,
                        single_child: 2419,
                        couple: 2762,
                        couple_child: 3343,
                        seniorityAdditionPerYear: 2
                    },
                    deferralBonusPerMonth: 5,
                    incomeTestThreshold: {
                        single: 20226,
                        couple: 26968
                    }
                },
                taxBrackets: [
                    { limit: 7010, rate: 0.10 },
                    { limit: 10060, rate: 0.14 },
                    { limit: 16150, rate: 0.20 },
                    { limit: 22440, rate: 0.31 },
                    { limit: 46690, rate: 0.35 },
                    { limit: 60130, rate: 0.47 },
                    { limit: null, rate: 0.47 }
                ]
            };

            if (deepEqual(fallbackParams, baseParameters)) {
                setIsDuplicate(true);
            }
            setProposedParameters(fallbackParams);
            setAiResults(fallbackParams);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        const defaultParams = {
            taxBrackets: PENSION_TAX_BRACKETS,
            nationalInsurance: NATIONAL_INSURANCE_RATES
        };
        setProposedParameters(defaultParams);
        setIsDuplicate(true);
        setAiResults(null);
    };

    const formatCurrency = (val) => {
        return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', {
            style: 'currency',
            currency: language === 'he' ? 'ILS' : 'USD',
            maximumFractionDigits: 0
        }).format(val);
    };

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
                // console.log(`Bracket mismatch at index ${i}: limit ${l1} !== ${l2} (raw: ${b1.limit} vs ${b2.limit})`);
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
            <div className={`relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${theme === 'light' ? 'bg-white' : 'bg-gray-900'} flex flex-col`}>
                <div className="p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
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
                                {language === 'he' ? 'שגיאה בעדכון' : 'Update Error'}
                            </div>
                            <p className="opacity-70 text-xs">{error}</p>
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
                <div className={`p-4 border-t flex gap-3 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
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
