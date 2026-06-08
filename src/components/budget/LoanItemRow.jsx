import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, ToggleLeft, ToggleRight, Lock, Unlock, Calculator, X } from 'lucide-react';
import { trackActive, toProjectedMonthly, withReminderPausedState, effectiveIsFixed, genId, getNowYM } from './budgetUtils';
import { calculateRetirementProjection } from '../../utils/calculator';
import { getProjectedAgeDate } from '../../utils/dateUtils';

const ymFromDate = (date) => date.getFullYear() * 12 + date.getMonth();

export function LoanItemRow({ item, isHe, isLight, currency, t, onChange, onDelete, onToggleEnabled, projFactor, projYears, showInflation, totalMonthly = 0, currentSavings = 0, inputs, results }) {
    const [open, setOpen] = useState((item.tracks || []).length <= 1);
    const [analysisOpen, setAnalysisOpen] = useState(false);
    const [editingLabel, setEditingLabel] = useState(false);
    const [labelDraft, setLabelDraft] = useState(item.label);
    const [trackDrafts, setTrackDrafts] = useState(() =>
        Object.fromEntries((item.tracks || []).map(tr => [tr.id, { label: tr.label, amount: tr.amount === 0 ? '' : String(tr.amount), payoffBalance: tr.payoffBalance ? String(tr.payoffBalance) : '' }]))
    );

    useEffect(() => {
        setTrackDrafts(prev => {
            const next = { ...prev };
            (item.tracks || []).forEach(tr => {
                if (!next[tr.id]) next[tr.id] = { label: tr.label, amount: tr.amount === 0 ? '' : String(tr.amount), payoffBalance: tr.payoffBalance ? String(tr.payoffBalance) : '' };
            });
            return next;
        });
    }, [item.tracks]);

    const monthsLeft = (endDate) => {
        if (!endDate) return null;
        const [y, m] = endDate.split('-').map(Number);
        return y * 12 + (m - 1) - getNowYM();
    };

    const activeMonthly = (item.tracks || []).filter(trackActive).reduce((s, tr) => s + (tr.amount || 0), 0);
    const todayYM = getNowYM();
    const monthsRemainingInclusive = (endDate) => {
        if (!endDate) return null;
        const [y, m] = endDate.split('-').map(Number);
        return Math.max(0, y * 12 + (m - 1) - todayYM + 1);
    };
    const analysisTracks = (item.tracks || []).filter(trackActive).map(track => {
        const months = monthsRemainingInclusive(track.endDate);
        const monthly = parseFloat(track.amount) || 0;
        const futurePayments = months === null ? null : monthly * months;
        const enteredPayoff = parseFloat(trackDrafts[track.id]?.payoffBalance ?? track.payoffBalance) || 0;
        const payoff = enteredPayoff > 0 ? enteredPayoff : (futurePayments ?? 0);
        return {
            ...track,
            months,
            monthly,
            payoff,
            enteredPayoff,
            futurePayments,
        };
    });
    const payoffCost = analysisTracks.reduce((sum, track) => sum + track.payoff, 0);
    const monthlyFreed = activeMonthly;
    const parsedCurrentSavings = parseFloat(currentSavings) || 0;
    const savingsAfterPayoff = parsedCurrentSavings - payoffCost;
    const hasPayoffData = payoffCost > 0;
    const retirementStartDate = inputs
        ? getProjectedAgeDate(inputs.retirementStartAge, inputs.currentAge, inputs.birthdate, inputs.manualAge)
        : null;
    const nowDate = new Date();
    const currentYM = nowDate.getFullYear() * 12 + nowDate.getMonth();
    const retirementStartYM = retirementStartDate ? ymFromDate(retirementStartDate) : null;
    const monthsToRetirement = retirementStartYM === null ? 0 : Math.max(0, retirementStartYM - currentYM);
    const extraSavingsUntilRetirement = monthlyFreed * monthsToRetirement;

    // Retirement income to use once the mortgage is gone. With variable income the schedule may
    // have an elevated (mortgage-overlap) period; after a payoff there is no mortgage at all, so
    // we take the income the user defined for the first retirement year AFTER the loan's end date
    // and apply it flat across the whole retirement. Falls back to the base desired income.
    const incomeOverrides = (inputs?.yearlyIncomeOverrides && typeof inputs.yearlyIncomeOverrides === 'object')
        ? inputs.yearlyIncomeOverrides : {};
    const baseDefinedIncome = parseFloat(inputs?.monthlyNetIncomeDesired) || 0;
    const activeLoanEndYears = (item.tracks || [])
        .filter(trackActive)
        .map(tr => (tr.endDate ? parseInt(String(tr.endDate).split('-')[0], 10) : NaN))
        .filter(y => !isNaN(y));
    const mortgageEndYear = activeLoanEndYears.length ? Math.max(...activeLoanEndYears) : null;
    const retirementStartYear = retirementStartDate ? retirementStartDate.getFullYear() : nowDate.getFullYear();
    const postMortgageYear = Math.max(retirementStartYear, (mortgageEndYear || 0) + 1);
    const postMortgageOverride = parseFloat(incomeOverrides[postMortgageYear]);
    const postMortgageIncome = (!isNaN(postMortgageOverride) && postMortgageOverride > 0)
        ? postMortgageOverride
        : baseDefinedIncome;

    const scenarioComparison = useMemo(() => {
        if (!inputs || !hasPayoffData) return null;
        try {
            // Base = the user's real plan, untouched: same savings, contribution and the
            // retirement income exactly as defined.
            const baseResult = Number.isFinite(results?.balanceAtEnd)
                ? results
                : calculateRetirementProjection(inputs, t);
            const baseEnd = baseResult.balanceAtEnd;

            // Payoff = recompute with just three changed inputs:
            //   1. current savings drop by the payoff cost,
            //   2. monthly contribution rises by the freed loan payment,
            //   3. retirement income becomes the post-mortgage value, flat across retirement
            //      (overrides cleared) — with no mortgage there is no elevated spending period.
            const payoffInputs = {
                ...inputs,
                currentSavings: savingsAfterPayoff,
                monthlyContribution: (parseFloat(inputs.monthlyContribution) || 0) + monthlyFreed,
                monthlyNetIncomeDesired: postMortgageIncome,
                yearlyIncomeOverrides: {},
            };
            const payoffResult = calculateRetirementProjection(payoffInputs, t);
            return {
                baseEnd,
                payoffEnd: payoffResult.balanceAtEnd,
                deltaEnd: payoffResult.balanceAtEnd - baseEnd,
                baseRetirement: baseResult.balanceAtRetirement,
                payoffRetirement: payoffResult.balanceAtRetirement,
                // The flat post-mortgage retirement income the payoff scenario lives on.
                newMonthlyIncome: postMortgageIncome,
                error: null,
            };
        } catch (error) {
            return { error: error?.message || String(error) };
        }
    }, [inputs, results, t, hasPayoffData, savingsAfterPayoff, monthlyFreed, postMortgageIncome]);

    // Which combination of tracks to pay off maximizes the final balance. Each track can only be
    // paid off whole, so the "amount" is one of the discrete subsets. We reuse the same per-payoff
    // model as the main comparison (savings down, contribution up, flat post-mortgage income), run
    // the projection for every subset, and pick the highest end balance ("no payoff" included).
    const payoffTracksKey = analysisTracks.map(tr => `${tr.id}:${tr.payoff}:${tr.monthly}`).join('|');
    const payoffOptions = useMemo(() => {
        if (!inputs || !hasPayoffData) return null;
        try {
            const baseResult = Number.isFinite(results?.balanceAtEnd)
                ? results
                : calculateRetirementProjection(inputs, t);
            const baseEnd = baseResult.balanceAtEnd;
            const baseContribution = parseFloat(inputs.monthlyContribution) || 0;
            const tracks = analysisTracks
                .map(tr => ({ id: tr.id, label: tr.label, payoff: tr.payoff, monthly: tr.monthly }))
                .filter(tr => tr.payoff > 0 || tr.monthly > 0);
            const n = tracks.length;
            if (n === 0) return null;

            // All subsets when few tracks; otherwise just singles + all (avoid 2^n blow-up).
            const subsets = [];
            if (n <= 4) {
                for (let mask = 1; mask < (1 << n); mask++) {
                    const idxs = [];
                    for (let i = 0; i < n; i++) if (mask & (1 << i)) idxs.push(i);
                    subsets.push(idxs);
                }
            } else {
                for (let i = 0; i < n; i++) subsets.push([i]);
                subsets.push(tracks.map((_, i) => i));
            }

            const evalSubset = (idxs) => {
                const payoff = idxs.reduce((s, i) => s + tracks[i].payoff, 0);
                const freed = idxs.reduce((s, i) => s + tracks[i].monthly, 0);
                const scenario = {
                    ...inputs,
                    currentSavings: parsedCurrentSavings - payoff,
                    monthlyContribution: baseContribution + freed,
                };
                // The retirement budget drops to the flat post-mortgage income ONLY when every loan
                // is paid off — that's the only case where the loan period is truly over. A partial
                // payoff leaves a loan running, so the budget stays exactly as defined today
                // (the variable schedule); otherwise it would be wrongly credited with removing the
                // unpaid tracks' retirement payments too.
                if (idxs.length === n) {
                    scenario.monthlyNetIncomeDesired = postMortgageIncome;
                    scenario.yearlyIncomeOverrides = {};
                }
                const res = calculateRetirementProjection(scenario, t);
                return { labels: idxs.map(i => tracks[i].label), payoff, freed, end: res.balanceAtEnd, delta: res.balanceAtEnd - baseEnd };
            };

            const options = [
                { labels: [], payoff: 0, freed: 0, end: baseEnd, delta: 0, isBase: true },
                ...subsets.map(evalSubset),
            ];
            options.sort((a, b) => b.end - a.end);
            return { options, best: options[0], trackCount: n };
        } catch (error) {
            return { error: error?.message || String(error) };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payoffTracksKey, inputs, results, t, hasPayoffData, parsedCurrentSavings, postMortgageIncome]);

    const updateTrack = (trackId, changes) =>
        onChange({ ...item, tracks: (item.tracks || []).map(tr => tr.id === trackId ? { ...tr, ...changes } : tr) });

    const deleteTrack = (trackId) =>
        onChange({ ...item, tracks: (item.tracks || []).filter(tr => tr.id !== trackId) });

    const addTrack = () => {
        const newTrack = { id: genId(), label: t('budgetTrack'), amount: 0, endDate: '', payoffBalance: 0, inflationAffected: false };
        setTrackDrafts(prev => ({ ...prev, [newTrack.id]: { label: newTrack.label, amount: '', payoffBalance: '' } }));
        onChange({ ...item, tracks: [...(item.tracks || []), newTrack] });
    };

    const commitLabel = () => {
        setEditingLabel(false);
        if (labelDraft.trim()) onChange({ ...item, label: labelDraft.trim() });
        else setLabelDraft(item.label);
    };

    return (
        <div id={`budget-item-${item.id}`} className={`rounded-lg border my-1 ${item.enabled !== false ? '' : 'opacity-40'} ${isLight ? 'border-indigo-100 bg-indigo-50/40' : 'border-indigo-500/20 bg-indigo-900/10'}`}>
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm" dir={isHe ? 'rtl' : 'ltr'}>
                <button
                    onClick={() => onToggleEnabled
                        ? onToggleEnabled(item.id, !(item.enabled !== false))
                        : onChange(withReminderPausedState(item, !(item.enabled !== false)))
                    }
                    className="shrink-0 p-0.5"
                    title={item.enabled !== false ? (isHe ? 'השהה' : 'Pause') : (isHe ? 'הפעל' : 'Enable')}
                >
                    {item.enabled !== false
                        ? <ToggleRight size={18} className="text-blue-500" />
                        : <ToggleLeft size={18} className={isLight ? 'text-slate-400' : 'text-gray-400'} />}
                </button>
                <span className="shrink-0">🏦</span>
                {editingLabel ? (
                    <input autoFocus value={labelDraft}
                        onChange={e => setLabelDraft(e.target.value)}
                        onBlur={commitLabel}
                        onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setEditingLabel(false); setLabelDraft(item.label); } }}
                        className={`flex-1 text-sm px-1 rounded border ${isLight ? 'border-blue-400 bg-white text-slate-800' : 'border-blue-500 bg-white/10 text-white'} outline-none`}
                    />
                ) : (
                    <span className="flex-1 font-medium cursor-pointer truncate" onClick={() => { setEditingLabel(true); setLabelDraft(item.label); }}>
                        {item.label}
                    </span>
                )}
                {showInflation && (() => {
                    const activeTracks = (item.tracks || []).filter(trackActive);
                    const linkedCount = activeTracks.filter(tr => tr.inflationAffected).length;
                    const allLinked = activeTracks.length > 0 && linkedCount === activeTracks.length;
                    const partial = linkedCount > 0 && linkedCount < activeTracks.length;
                    const label = allLinked ? (isHe ? 'צמוד' : 'CPI') : partial ? (isHe ? 'צמוד חלקי' : 'partial CPI') : (isHe ? 'קבוע' : 'fixed');
                    const colorClass = allLinked
                        ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500 bg-amber-900/20 text-amber-400')
                        : partial
                        ? (isLight ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-orange-400 bg-orange-900/20 text-orange-400')
                        : (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-white/20 bg-white/5 text-gray-500');
                    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${colorClass}`}>{label}</span>;
                })()}
                {activeMonthly > 0 && (
                    <span className="flex items-baseline gap-1 shrink-0" dir="ltr">
                        <span className={`text-sm font-semibold ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
                            {currency}{Math.round(activeMonthly).toLocaleString()}/{t('budgetMonthly')}
                        </span>
                        {showInflation && (() => {
                            const proj = toProjectedMonthly(item, projFactor, projYears);
                            return (
                                <span className={`text-xs font-normal ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {proj > 0 ? `${currency}${Math.round(proj).toLocaleString()}` : (isHe ? 'יסתיים' : 'ends')}
                                </span>
                            );
                        })()}
                    </span>
                )}
                <button
                    onClick={() => setAnalysisOpen(v => !v)}
                    className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${analysisOpen
                        ? (isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300')
                        : (isLight ? 'text-emerald-700 hover:bg-emerald-50' : 'text-emerald-300 hover:bg-emerald-900/20')}`}
                    title={isHe ? 'ניתוח סילוק מיידי' : 'Immediate payoff analysis'}
                >
                    <Calculator size={12} />
                    {isHe ? 'סילוק עכשיו' : 'Pay off now'}
                </button>
                <button onClick={() => setOpen(o => !o)}
                    className={`shrink-0 p-0.5 rounded transition-colors ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}>
                    {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button
                    onClick={() => onChange({ ...item, isFixed: !effectiveIsFixed(item) })}
                    className={`shrink-0 p-0.5 rounded transition-colors ${effectiveIsFixed(item)
                        ? (isLight ? 'text-orange-500 hover:text-orange-600' : 'text-orange-400 hover:text-orange-300')
                        : (isLight ? 'text-slate-300 hover:text-slate-500' : 'text-gray-600 hover:text-gray-400')}`}
                    title={effectiveIsFixed(item)
                        ? (isHe ? 'קבוע — לחץ לסמן כמשתנה' : 'Fixed — click to mark variable')
                        : (isHe ? 'משתנה — לחץ לסמן כקבוע' : 'Variable — click to mark fixed')}
                >
                    {effectiveIsFixed(item) ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                <button onClick={onDelete} className={`shrink-0 p-0.5 rounded ${isLight ? 'text-slate-300 hover:text-red-500 hover:bg-red-50' : 'text-gray-600 hover:text-red-400 hover:bg-red-900/20'}`}>
                    <Trash2 size={13} />
                </button>
            </div>

            {analysisOpen && (
                <div className={`mx-2 mb-2 rounded-lg border p-3 text-xs ${isLight ? 'border-emerald-200 bg-white text-slate-700' : 'border-emerald-500/30 bg-emerald-950/20 text-gray-200'}`} dir={isHe ? 'rtl' : 'ltr'}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                            <div className={`text-sm font-bold ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
                                {isHe ? 'ניתוח: סגירת המשכנתא/הלוואה מיידית' : 'Analysis: immediate mortgage/loan payoff'}
                            </div>
                            <div className={isLight ? 'text-slate-500' : 'text-gray-400'}>
                                {isHe
                                    ? 'סילוק עכשיו מקטין את החיסכון היום ומגדיל את ההפקדה החודשית — המחשבון משווה את היתרה בסוף התקופה מול תוכנית הפרישה הנוכחית.'
                                    : 'Paying off now lowers today’s savings and raises the monthly contribution — the calculator compares the resulting end balance against your current retirement plan.'}
                            </div>
                        </div>
                        <button onClick={() => setAnalysisOpen(false)} className={isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}>
                            <X size={14} />
                        </button>
                    </div>

                    <div className={`rounded-lg border p-3 mb-3 ${isLight ? 'border-blue-200 bg-blue-50/70' : 'border-blue-500/30 bg-blue-500/10'}`}>
                        <div className={`text-sm font-bold mb-1 ${isLight ? 'text-blue-900' : 'text-blue-100'}`}>
                            {isHe ? 'השוואה מול תוכנית הפרישה' : 'Comparison against your retirement plan'}
                        </div>
                        {!hasPayoffData ? (
                            <div className={isLight ? 'text-amber-800' : 'text-amber-200'}>
                                {isHe
                                    ? 'כדי לחשב ערך כלכלי אמיתי, צריך להזין יתרת סילוק בכל מסלול. בלי זה אי אפשר לדעת כמה החיסכון היום יורד.'
                                    : 'Enter a payoff balance for each track. Without it, the model cannot reduce today’s savings and compare final balances.'}
                            </div>
                        ) : scenarioComparison?.error ? (
                            <div className={isLight ? 'text-red-700' : 'text-red-300'}>
                                {isHe ? 'לא ניתן לחשב את תרחיש הסילוק: ' : 'Could not calculate payoff scenario: '}
                                {scenarioComparison.error}
                            </div>
                        ) : scenarioComparison ? (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2" dir={isHe ? 'rtl' : 'ltr'}>
                                    {[
                                        { label: isHe ? 'יתרה סופית כיום' : 'Current end balance', value: scenarioComparison.baseEnd },
                                        { label: isHe ? 'יתרה סופית אחרי סילוק' : 'End balance after payoff', value: scenarioComparison.payoffEnd },
                                        { label: isHe ? 'פער לטובת סילוק' : 'Payoff delta', value: scenarioComparison.deltaEnd, signed: true },
                                        { label: isHe ? 'הכנסה חודשית בפרישה' : 'Monthly retirement income', value: scenarioComparison.newMonthlyIncome, monthly: true },
                                    ].map(({ label, value, signed, monthly }) => {
                                        const hasValue = Number.isFinite(value);
                                        return (
                                            <div key={label} className={`rounded-md border px-2 py-1.5 ${isLight ? 'border-blue-100 bg-white' : 'border-white/10 bg-white/5'}`}>
                                                <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{label}</div>
                                                <div className={`text-sm font-bold tabular-nums ${hasValue && value < 0 ? 'text-red-500' : (isLight ? 'text-slate-900' : 'text-white')}`}>
                                                    {hasValue ? (
                                                        <>
                                                            <span dir="ltr">{signed && value >= 0 ? '+' : ''}{currency}{Math.round(value).toLocaleString()}</span>
                                                            {monthly && <span className="text-[10px] font-normal opacity-60">/{t('budgetMonthly')}</span>}
                                                        </>
                                                    ) : '—'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className={`rounded-md p-2 ${scenarioComparison.deltaEnd >= 0
                                    ? (isLight ? 'bg-emerald-100 text-emerald-900' : 'bg-emerald-500/20 text-emerald-100')
                                    : (isLight ? 'bg-red-100 text-red-900' : 'bg-red-500/20 text-red-100')}`}>
                                    {scenarioComparison.deltaEnd >= 0
                                        ? (isHe
                                            ? `לפי מחשבון הפרישה, סילוק עכשיו משפר את היתרה בסוף התקופה בכ-${currency}${Math.round(scenarioComparison.deltaEnd).toLocaleString()}.`
                                            : `According to the retirement calculator, paying off now improves the final balance by about ${currency}${Math.round(scenarioComparison.deltaEnd).toLocaleString()}.`)
                                        : (isHe
                                            ? `לפי מחשבון הפרישה, סילוק עכשיו מקטין את היתרה בסוף התקופה בכ-${currency}${Math.round(Math.abs(scenarioComparison.deltaEnd)).toLocaleString()}.`
                                            : `According to the retirement calculator, paying off now reduces the final balance by about ${currency}${Math.round(Math.abs(scenarioComparison.deltaEnd)).toLocaleString()}.`)}
                                </div>
                            </>
                        ) : null}
                    </div>

                    {hasPayoffData && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3" dir={isHe ? 'rtl' : 'ltr'}>
                            {[
                                { label: isHe ? 'עלות סילוק עכשיו' : 'Payoff cost now', value: payoffCost },
                                { label: isHe ? 'חיסכון אחרי סילוק' : 'Savings after payoff', value: savingsAfterPayoff, danger: savingsAfterPayoff < 0 },
                                { label: isHe ? 'תזרים חודשי שמתפנה' : 'Monthly freed', value: monthlyFreed, monthly: true },
                                { label: isHe ? 'חיסכון נוסף עד הפרישה' : 'Extra saving until retirement', value: extraSavingsUntilRetirement, noteCount: monthsToRetirement, noteUnit: isHe ? 'חו׳' : 'mo' },
                            ].map(({ label, value, monthly, danger, noteCount, noteUnit }) => (
                                <div key={label} className={`rounded-md border px-2 py-1.5 ${danger ? (isLight ? 'border-red-200 bg-red-50' : 'border-red-500/30 bg-red-500/10') : (isLight ? 'border-slate-100 bg-slate-50' : 'border-white/10 bg-white/5')}`}>
                                    <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{label}</div>
                                    <div className={`text-sm font-bold tabular-nums ${danger ? 'text-red-500' : (isLight ? 'text-slate-800' : 'text-gray-100')}`}>
                                        <span dir="ltr">{currency}{Math.round(value).toLocaleString()}</span>
                                        {monthly && <span className="text-[10px] font-normal opacity-60">/{t('budgetMonthly')}</span>}
                                        {noteCount != null && <span className="text-[10px] font-normal opacity-60 ms-1"><span dir="ltr">{noteCount}</span> {noteUnit}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {payoffOptions && !payoffOptions.error && payoffOptions.options.length > 2 && (
                        <div className="mb-3">
                            <div className={`text-sm font-bold mb-1.5 ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
                                {isHe ? 'הסכום שממקסם את היתרה בסיום' : 'Payoff amount that maximizes the end balance'}
                            </div>
                            <div className="space-y-1">
                                {payoffOptions.options.map((o, i) => {
                                    const isBest = o === payoffOptions.best;
                                    const name = o.isBase ? (isHe ? 'ללא סילוק' : 'No payoff') : o.labels.join(' + ');
                                    return (
                                        <div key={i} dir={isHe ? 'rtl' : 'ltr'}
                                            className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border px-2 py-1.5 ${isBest
                                                ? (isLight ? 'border-emerald-300 bg-emerald-50' : 'border-emerald-500/40 bg-emerald-500/10')
                                                : (isLight ? 'border-slate-100 bg-slate-50' : 'border-white/10 bg-white/5')}`}>
                                            <span className="font-medium flex items-center gap-1 min-w-0">
                                                {isBest && <span className="shrink-0">⭐</span>}
                                                <span className="truncate">{name}</span>
                                            </span>
                                            <span className="flex items-center gap-3 text-[11px] shrink-0">
                                                <span className={isLight ? 'text-slate-500' : 'text-gray-400'}>
                                                    {isHe ? 'סילוק' : 'Pay'} <span dir="ltr">{currency}{Math.round(o.payoff).toLocaleString()}</span>
                                                </span>
                                                <span className="font-semibold">
                                                    {isHe ? 'יתרה' : 'End'} <span dir="ltr">{currency}{Math.round(o.end).toLocaleString()}</span>
                                                </span>
                                                {!o.isBase && (
                                                    <span className={`font-semibold ${o.delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`} dir="ltr">
                                                        {o.delta >= 0 ? '+' : ''}{currency}{Math.round(o.delta).toLocaleString()}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className={`mt-1.5 rounded-md p-2 text-[11px] ${isLight ? 'bg-emerald-50 text-emerald-900' : 'bg-emerald-500/10 text-emerald-100'}`}>
                                {payoffOptions.best.isBase
                                    ? (isHe
                                        ? 'היתרה הגבוהה ביותר מתקבלת דווקא בלי לסלק כלום — כל סילוק מקטין את היתרה הסופית, כי הכסף שווה יותר מושקע מאשר בסגירת ההלוואה.'
                                        : 'The highest end balance comes from not paying off anything — every payoff lowers it, since the money is worth more invested than used to close the loan.')
                                    : (isHe
                                        ? `היתרה הגבוהה ביותר מתקבלת מסילוק של ${payoffOptions.best.labels.join(' + ')} (${currency}${Math.round(payoffOptions.best.payoff).toLocaleString()}): היתרה בסיום גבוהה בכ-${currency}${Math.round(payoffOptions.best.delta).toLocaleString()} מאשר בלי לסלק.${payoffOptions.best.labels.length < payoffOptions.trackCount ? ' סילוק של מסלולים נוספים מעבר לזה כבר מקטין את היתרה.' : ''}`
                                        : `The highest end balance comes from paying off ${payoffOptions.best.labels.join(' + ')} (${currency}${Math.round(payoffOptions.best.payoff).toLocaleString()}): about ${currency}${Math.round(payoffOptions.best.delta).toLocaleString()} more than not paying off.${payoffOptions.best.labels.length < payoffOptions.trackCount ? ' Paying off additional tracks beyond that lowers it.' : ''}`)}
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        {analysisTracks.map(track => {
                            const draft = trackDrafts[track.id] || { payoffBalance: track.enteredPayoff ? String(track.enteredPayoff) : '' };
                            return (
                                <div key={track.id} className={`flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
                                    <span className="font-medium">{track.label}</span>
                                    <span dir="ltr">{currency}{Math.round(track.monthly).toLocaleString()} x {track.months ?? '?'} {isHe ? 'חודשים' : 'mo'}</span>
                                    <label className="flex items-center gap-1" dir={isHe ? 'rtl' : 'ltr'}>
                                        <span>{isHe ? 'סילוק:' : 'Payoff:'}</span>
                                        <span dir="ltr">{currency}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={draft.payoffBalance || ''}
                                            placeholder={track.futurePayments === null ? '0' : String(Math.round(track.futurePayments))}
                                            onChange={e => setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], payoffBalance: e.target.value } }))}
                                            onBlur={() => {
                                                const val = parseFloat(trackDrafts[track.id]?.payoffBalance) || 0;
                                                updateTrack(track.id, { payoffBalance: val });
                                                setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], payoffBalance: val === 0 ? '' : String(val) } }));
                                            }}
                                            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                                            className={`w-24 text-end px-1 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                                        />
                                    </label>
                                    <span dir="ltr">{isHe ? 'תשלומים:' : 'Payments:'} {track.futurePayments === null ? '?' : `${currency}${Math.round(track.futurePayments).toLocaleString()}`}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {open && <div className="px-2 pb-2 space-y-1">
                {(item.tracks || []).map(track => {
                    const active = trackActive(track);
                    const ml = monthsLeft(track.endDate);
                    const draft = trackDrafts[track.id] || { label: track.label, amount: String(track.amount || '') };
                    return (
                        <div key={track.id} dir={isHe ? 'rtl' : 'ltr'}
                            className={`flex flex-wrap items-center gap-1.5 text-xs px-1.5 py-1 rounded border ${
                                active
                                    ? (isLight ? 'border-slate-100 bg-white' : 'border-white/10 bg-white/5')
                                    : (isLight ? 'border-slate-100 bg-slate-50 opacity-50' : 'border-white/5 bg-white/5 opacity-50')
                            }`}>
                            <input
                                value={draft.label}
                                onChange={e => setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], label: e.target.value } }))}
                                onBlur={() => { const l = (trackDrafts[track.id]?.label || '').trim(); if (l) updateTrack(track.id, { label: l }); }}
                                onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                                className={`w-20 px-1 py-0.5 rounded border text-xs ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                            />
                            <div className="flex items-center gap-0.5 shrink-0">
                                <span className={`${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{currency}</span>
                                <input type="number" min="0" value={draft.amount} placeholder="0"
                                    onChange={e => setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], amount: e.target.value } }))}
                                    onBlur={() => {
                                        const val = parseFloat(trackDrafts[track.id]?.amount) || 0;
                                        updateTrack(track.id, { amount: val });
                                        setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], amount: val === 0 ? '' : String(val) } }));
                                    }}
                                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                                    className={`w-20 text-end px-1 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                                />
                                <span className={`shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>/{t('budgetMonthly')}</span>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                                <span className={`${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'יתרת סילוק' : 'Payoff'}</span>
                                <span className={`${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{currency}</span>
                                <input type="number" min="0" value={draft.payoffBalance || ''} placeholder="0"
                                    onChange={e => setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], payoffBalance: e.target.value } }))}
                                    onBlur={() => {
                                        const val = parseFloat(trackDrafts[track.id]?.payoffBalance) || 0;
                                        updateTrack(track.id, { payoffBalance: val });
                                        setTrackDrafts(prev => ({ ...prev, [track.id]: { ...prev[track.id], payoffBalance: val === 0 ? '' : String(val) } }));
                                    }}
                                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                                    className={`w-20 text-end px-1 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-white/20 bg-white/10 text-white'} outline-none focus:border-blue-400`}
                                />
                            </div>
                            <div className="flex items-center gap-0.5 flex-1 min-w-0">
                                <span className={`shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{t('budgetEndDate')}:</span>
                                <input type="month" value={track.endDate || ''}
                                    onChange={e => updateTrack(track.id, { endDate: e.target.value })}
                                    className={`flex-1 min-w-0 px-1 py-0.5 rounded border ${isLight ? 'border-slate-200 bg-white text-slate-600' : 'border-white/20 bg-white/10 text-gray-300'} outline-none focus:border-blue-400`}
                                />
                            </div>
                            {track.endDate && (
                                <span className={`shrink-0 px-1.5 py-0.5 rounded-full font-medium ${active
                                    ? 'bg-emerald-500/20 text-emerald-600'
                                    : 'bg-red-500/20 text-red-500'}`}>
                                    {active
                                        ? (ml !== null ? `${ml}m` : '∞')
                                        : t('budgetLoanDone')}
                                </span>
                            )}
                            {showInflation && (
                                <button
                                    onClick={() => updateTrack(track.id, { inflationAffected: !track.inflationAffected })}
                                    className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 transition-colors ${track.inflationAffected
                                        ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500 bg-amber-900/20 text-amber-400')
                                        : (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-white/20 bg-white/5 text-gray-500')}`}
                                    title={isHe ? (track.inflationAffected ? 'צמוד מדד' : 'קבוע') : (track.inflationAffected ? 'CPI-linked' : 'Fixed rate')}
                                >
                                    {isHe ? (track.inflationAffected ? 'צמוד' : 'קבוע') : (track.inflationAffected ? 'CPI' : 'fixed')}
                                </button>
                            )}
                            <button onClick={() => deleteTrack(track.id)}
                                className={`shrink-0 p-0.5 rounded ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}>
                                <Trash2 size={11} />
                            </button>
                        </div>
                    );
                })}
                <button onClick={addTrack} dir={isHe ? 'rtl' : 'ltr'}
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${isLight ? 'text-indigo-600 hover:bg-indigo-50' : 'text-indigo-400 hover:bg-indigo-900/20'}`}>
                    <Plus size={11} />
                    {t('budgetAddTrack')}
                </button>
            </div>}
        </div>
    );
}
