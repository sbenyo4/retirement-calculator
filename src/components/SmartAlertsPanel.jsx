import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Plus, Trash2, ToggleRight, ToggleLeft, Loader2, AlertTriangle, CheckCircle, Pencil, X, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';
import { parseAlertWithAI, isAlertTriggered, getAlertStatus } from '../utils/smartAlerts';
import { getSmartAlerts, setSmartAlerts } from '../utils/db';
import { useAuth } from '../contexts/AuthContext';

function genId() { return `sa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// ── ParseForm lives outside SmartAlertsPanel so its identity is stable ────────
function ParseForm({ inputVal, onInputChange, onParse, parsing, parseError, parsedPreview, onConfirm, onCancelPreview, confirmLabel, isHe, isLight, canAsk }) {
    const placeholder = isHe
        ? 'לדוג׳: תתריע לי אם התקציב עולה על 85% מיעד המשיכה'
        : 'e.g. Alert me if budget exceeds 85% of withdrawal target';
    const txt = (en, he) => isHe ? he : en;

    return (
        <div className="space-y-2.5">
            <textarea
                rows={2}
                value={inputVal}
                onChange={e => onInputChange(e.target.value)}
                placeholder={placeholder}
                className={`w-full text-xs px-3 py-2 rounded-xl border outline-none resize-none leading-relaxed ${isLight ? 'bg-white border-amber-200 text-slate-800 placeholder-slate-300 focus:border-amber-400' : 'bg-slate-900/50 border-amber-500/30 text-white placeholder-gray-600 focus:border-amber-400'}`}
            />
            {!canAsk && (
                <p className={`text-[11px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                    {txt('Configure an AI provider in settings to enable parsing.', 'הגדר ספק AI בהגדרות כדי להפעיל ניתוח.')}
                </p>
            )}
            {canAsk && !parsedPreview && (
                <button onClick={onParse} disabled={!inputVal.trim() || parsing}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${inputVal.trim() && !parsing
                        ? (isLight ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-amber-500 text-white hover:bg-amber-400')
                        : (isLight ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-gray-600 cursor-not-allowed')}`}>
                    {parsing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {parsing ? txt('Analyzing...', 'מנתח...') : txt('Parse with AI', 'נתח עם AI')}
                </button>
            )}
            {parseError && (
                <div className={`flex items-start gap-2 text-[11px] ${isLight ? 'text-red-600' : 'text-red-400'}`}>
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />{parseError}
                </div>
            )}
            {parsedPreview && (
                <div className={`rounded-xl border p-3 space-y-1.5 ${isLight ? 'bg-white border-green-200' : 'bg-green-900/10 border-green-500/30'}`}>
                    <div className="flex items-start gap-2">
                        <CheckCircle size={13} className="text-green-500 shrink-0 mt-0.5" />
                        <div className="space-y-0.5 flex-1 min-w-0">
                            <div className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{parsedPreview.label}</div>
                            <div className={`text-[11px] leading-snug ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{parsedPreview.summary}</div>
                            <div className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>{parsedPreview.condition.type}</div>
                        </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button onClick={onConfirm}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isLight ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-green-500 text-white hover:bg-green-400'}`}>
                            {confirmLabel}
                        </button>
                        <button onClick={onCancelPreview}
                            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
                            {txt('Edit', 'ערוך')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function buildTestRows(alert, appState, isHe) {
    const txt = (en, he) => isHe ? he : en;
    const c = alert.condition || {};
    const fmt = (n) => typeof n === 'number' ? `₪${Math.round(n).toLocaleString()}` : String(n ?? '—');
    const pct = (n) => typeof n === 'number' ? `${Math.round(n * 100)}%` : '—';
    const rows = [];
    if (c.type === 'budget_pct_of_target') {
        rows.push([txt('Monthly total', 'סה"כ חודשי'), fmt(appState.totalMonthly)]);
        rows.push([txt('Withdrawal target', 'יעד משיכה'), fmt(appState.target)]);
        rows.push([txt('Current ratio', 'יחס נוכחי'), appState.target ? pct(appState.totalMonthly / appState.target) : '—']);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${pct(c.threshold)}`]);
    } else if (c.type === 'monthly_savings') {
        const savings = (appState.target || 0) - appState.totalMonthly;
        rows.push([txt('Monthly total', 'סה"כ חודשי'), fmt(appState.totalMonthly)]);
        rows.push([txt('Withdrawal target', 'יעד משיכה'), fmt(appState.target)]);
        rows.push([txt('Savings', 'חיסכון'), fmt(savings)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${fmt(c.amount)}`]);
    } else if (c.type === 'category_pct') {
        const catTotal = appState.categoryTotals?.[c.categoryId] || 0;
        const ratio = appState.totalMonthly ? catTotal / appState.totalMonthly : 0;
        rows.push([txt('Category', 'קטגוריה'), c.categoryId || '—']);
        rows.push([txt('Category total', 'סכום קטגוריה'), fmt(catTotal)]);
        rows.push([txt('Budget total', 'סה"כ תקציב'), fmt(appState.totalMonthly)]);
        rows.push([txt('Current ratio', 'יחס נוכחי'), pct(ratio)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${pct(c.threshold)}`]);
    } else if (c.type === 'days_to_retirement') {
        const daysLeft = appState.retirementDate ? Math.round((new Date(appState.retirementDate) - Date.now()) / 86400000) : null;
        rows.push([txt('Retirement date', 'תאריך פרישה'), appState.retirementDate || txt('Not set', 'לא הוגדר')]);
        rows.push([txt('Days left', 'ימים שנותרו'), daysLeft != null ? String(daysLeft) : '—']);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${c.days}`]);
    } else if (c.type === 'loan_ending_soon') {
        const matches = (appState.loanTracks || []).filter(t => t.active && t.monthsLeft <= c.months);
        rows.push([txt('Active loans', 'הלוואות פעילות'), String((appState.loanTracks || []).filter(t => t.active).length)]);
        rows.push([txt('Ending within', 'נגמרות תוך'), `${c.months} ${txt('months', 'חודשים')}`]);
        rows.push([txt('Matching', 'תואמות'), String(matches.length)]);
    } else if (c.type === 'balance_at_retirement') {
        rows.push([txt('Balance at retirement', 'יתרה בגיל פרישה'), fmt(appState.balanceAtRetirement)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${fmt(c.amount)}`]);
    } else if (c.type === 'required_capital_at_retirement') {
        rows.push([txt('Required capital (to fund retirement)', 'הון נדרש (לממן שנות פרישה)'), fmt(appState.requiredCapitalAtRetirement)]);
        rows.push([txt('Balance at retirement', 'יתרה בגיל פרישה'), fmt(appState.balanceAtRetirement)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${fmt(c.amount)}`]);
    } else if (c.type === 'surplus_amount') {
        rows.push([txt('Surplus / deficit', 'עודף / גירעון'), fmt(appState.surplus)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${fmt(c.amount)}`]);
    } else if (c.type === 'withdrawal_vs_target') {
        rows.push([txt('Initial net withdrawal', 'משיכה נטו ראשונית'), fmt(appState.initialNetWithdrawal)]);
        rows.push([txt('Monthly desired income', 'הכנסה חודשית רצויה'), fmt(appState.monthlyNetIncomeDesired)]);
        const ratio = appState.monthlyNetIncomeDesired && appState.initialNetWithdrawal != null
            ? appState.initialNetWithdrawal / appState.monthlyNetIncomeDesired : null;
        rows.push([txt('Current ratio', 'יחס נוכחי'), ratio != null ? pct(ratio) : '—']);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${pct(c.threshold)}`]);
    } else if (c.type === 'withdrawal_rate_from_portfolio') {
        rows.push([txt('Initial net withdrawal (monthly)', 'משיכה נטו חודשית'), fmt(appState.initialNetWithdrawal)]);
        rows.push([txt('Portfolio at retirement', 'תיק בגיל פרישה'), fmt(appState.balanceAtRetirement)]);
        const rate = appState.balanceAtRetirement != null && appState.balanceAtRetirement !== 0 && appState.initialNetWithdrawal != null
            ? (appState.initialNetWithdrawal * 12) / appState.balanceAtRetirement : null;
        rows.push([txt('Withdrawal rate (annual)', 'שיעור משיכה (שנתי)'), rate != null ? pct(rate) : '—']);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${pct(c.threshold)}`]);
    } else if (c.type === 'ran_out_before_age') {
        rows.push([txt('Funds run out at age', 'הכסף נגמר בגיל'), appState.ranOutAtAge != null ? String(appState.ranOutAtAge) : txt('Never', 'לא נגמר')]);
        rows.push([txt('Threshold age', 'גיל סף'), String(c.age)]);
    } else if (c.type === 'balance_at_end') {
        rows.push([txt('Balance at end of period', 'יתרה בסוף התקופה'), fmt(appState.balanceAtEnd)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${fmt(c.amount)}`]);
    } else if (c.type === 'perpetuity_capital') {
        rows.push([txt('Capital for perpetuity', 'הון לנצחיות'), fmt(appState.requiredCapitalForPerpetuity)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${fmt(c.amount)}`]);
    } else if (c.type === 'pv_of_deficit') {
        rows.push([txt('PV of deficit (save today)', 'PV גירעון (לחסוך היום)'), fmt(appState.pvOfDeficit)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${fmt(c.amount)}`]);
    } else if (c.type === 'budget_gap') {
        rows.push([txt('Income target', 'יעד הכנסה'), fmt(appState.target)]);
        rows.push([txt('Monthly expenses', 'הוצאות חודשיות'), fmt(appState.totalMonthly)]);
        rows.push([txt('Gap', 'פער'), appState.budgetGap != null ? fmt(appState.budgetGap) : fmt((appState.target || 0) - appState.totalMonthly)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${fmt(c.amount)}`]);
    } else if (c.type === 'average_net_withdrawal') {
        rows.push([txt('Average net withdrawal', 'ממוצע משיכה נטו'), fmt(appState.averageNetWithdrawal)]);
        rows.push([txt('Initial net withdrawal', 'משיכה נטו ראשונית'), fmt(appState.initialNetWithdrawal)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${fmt(c.amount)}`]);
    } else if (c.type === 'pension_income_at_ni') {
        rows.push([txt('Gross pension at 67', 'פנסיה ברוטו בגיל 67'), fmt(appState.pensionGrossAtNI)]);
        rows.push([txt('Net pension at 67', 'פנסיה נטו בגיל 67'), fmt(appState.pensionNetAtNI)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${fmt(c.amount)}`]);
    } else if (c.type === 'ni_income_test') {
        rows.push([txt('Non-work income at 67', 'הכנסה שאינה עבודה בגיל 67'), fmt(appState.pensionNonWorkAtNI)]);
        rows.push([txt('NI threshold', 'סף ביטוח לאומי'), fmt(appState.niThreshold)]);
        const ratio = appState.niThreshold != null && appState.niThreshold !== 0 && appState.pensionNonWorkAtNI != null
            ? appState.pensionNonWorkAtNI / appState.niThreshold : null;
        rows.push([txt('Ratio', 'יחס'), ratio != null ? pct(ratio) : '—']);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${pct(c.threshold)}`]);
    } else if (c.type === 'inflation_adjusted_budget') {
        rows.push([txt('Inflation rate', 'שיעור אינפלציה'), appState.inflationRate != null ? `${appState.inflationRate}%` : '—']);
        rows.push([txt('Current monthly', 'הוצאה חודשית כיום'), fmt(appState.totalMonthly)]);
        rows.push([txt('Projected monthly', 'הוצאה מוקרנת'), fmt(appState.inflationProjectedMonthly)]);
        rows.push([txt('Threshold', 'סף'), `${c.operator}${fmt(c.amount)}`]);
    }
    return rows;
}

// ─────────────────────────────────────────────────────────────────────────────

export function SmartAlertsPanel({ isHe, isLight, appState, aiProvider, aiModel, apiKeyOverride }) {
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;

    const [alerts, setAlerts] = useState([]);
    const [loaded, setLoaded] = useState(false);

    // Add state
    const [showAdd, setShowAdd] = useState(false);
    const [input, setInput] = useState('');
    const [parsing, setParsing] = useState(false);
    const [parseError, setParseError] = useState(null);
    const [parsedPreview, setParsedPreview] = useState(null);

    // Edit state
    const [editingId, setEditingId] = useState(null);
    const [editInput, setEditInput] = useState('');
    const [editParsing, setEditParsing] = useState(false);
    const [editParseError, setEditParseError] = useState(null);
    const [editParsedPreview, setEditParsedPreview] = useState(null);

    // Test state
    const [testingId, setTestingId] = useState(null);

    // Collapse state
    const [collapsed, setCollapsed] = useState(false);

    // Save error state
    const [saveError, setSaveError] = useState(null);

    const txt = (en, he) => isHe ? he : en;
    const canAsk = !!(aiProvider && aiModel);

    // Load from DB
    useEffect(() => {
        if (!uid) return;
        getSmartAlerts(uid).then(a => { setAlerts(a); setLoaded(true); }).catch(() => setLoaded(true));
    }, [uid]);

    // Sync when disabled externally (e.g. X button in alert bar)
    useEffect(() => {
        const handle = (e) => { if (e.detail?.alerts) setAlerts(e.detail.alerts); };
        window.addEventListener('rc-smart-alerts-updated', handle);
        return () => window.removeEventListener('rc-smart-alerts-updated', handle);
    }, []);

    const persist = useCallback(async (next) => {
        const prev = alerts;
        setAlerts(next);
        setSaveError(null);
        if (uid) {
            try {
                await setSmartAlerts(uid, next);
                window.dispatchEvent(new Event('rc-smart-alerts-changed'));
            } catch (err) {
                console.error('[SmartAlerts] Save failed:', err);
                setAlerts(prev); // rollback optimistic update
                setSaveError(txt('Failed to save. Please try again.', 'שמירה נכשלה. נסה שוב.'));
            }
        }
    }, [uid, alerts, txt]);

    // ── Add ────────────────────────────────────────────────────────────────
    const handleParse = async () => {
        if (!input.trim() || !aiProvider || !aiModel) return;
        setParsing(true); setParseError(null); setParsedPreview(null);
        try {
            setParsedPreview(await parseAlertWithAI(input.trim(), aiProvider, aiModel, apiKeyOverride));
        } catch (err) {
            setParseError(err.message || txt('Could not parse condition', 'לא הצלחתי להבין את התנאי'));
        } finally { setParsing(false); }
    };

    const handleConfirmAdd = async () => {
        if (!parsedPreview) return;
        await persist([...alerts, { id: genId(), label: parsedPreview.label, originalText: input.trim(), condition: parsedPreview.condition, enabled: true }]);
        setInput(''); setParsedPreview(null); setParseError(null); setShowAdd(false);
    };

    // ── Edit ───────────────────────────────────────────────────────────────
    const beginEdit = (alert) => {
        setEditingId(alert.id);
        setEditInput(alert.originalText || alert.label || '');
        setEditParsedPreview(null);
        setEditParseError(null);
        setShowAdd(false);
    };

    const cancelEdit = () => { setEditingId(null); setEditInput(''); setEditParsedPreview(null); setEditParseError(null); };

    const handleEditParse = async () => {
        if (!editInput.trim() || !aiProvider || !aiModel) return;
        setEditParsing(true); setEditParseError(null); setEditParsedPreview(null);
        try {
            setEditParsedPreview(await parseAlertWithAI(editInput.trim(), aiProvider, aiModel, apiKeyOverride));
        } catch (err) {
            setEditParseError(err.message || txt('Could not parse condition', 'לא הצלחתי להבין את התנאי'));
        } finally { setEditParsing(false); }
    };

    const handleConfirmEdit = async () => {
        if (!editParsedPreview || !editingId) return;
        await persist(alerts.map(a => a.id === editingId
            ? { ...a, label: editParsedPreview.label, originalText: editInput.trim(), condition: editParsedPreview.condition }
            : a
        ));
        cancelEdit();
    };

    // ── Other ──────────────────────────────────────────────────────────────
    const handleDelete = async (id) => { await persist(alerts.filter(a => a.id !== id)); };
    const handleToggle = async (id) => { await persist(alerts.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a)); };

    if (!loaded) return null;

    return (
        <div className={`rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-white/10'}`} dir={isHe ? 'rtl' : 'ltr'}>

            {/* Header */}
            <button
                onClick={() => setCollapsed(v => !v)}
                className={`w-full flex items-center justify-between px-4 py-3 ${!collapsed ? `border-b ${isLight ? 'border-slate-100' : 'border-white/10'}` : ''} transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'} rounded-t-2xl ${collapsed ? 'rounded-b-2xl' : ''}`}
            >
                <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-amber-400" />
                    <span className={`text-sm font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                        {txt('Smart Alerts', 'התראות חכמות')}
                    </span>
                    {alerts.length > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-gray-400'}`}>
                            {alerts.length}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {!collapsed && (
                        <span
                            onClick={e => { e.stopPropagation(); setShowAdd(v => !v); setParsedPreview(null); setParseError(null); setInput(''); cancelEdit(); }}
                            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${isLight ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200' : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30'}`}
                        >
                            <Plus size={12} />
                            {txt('Add', 'הוסף')}
                        </span>
                    )}
                    {collapsed
                        ? <ChevronDown size={14} className={isLight ? 'text-slate-400' : 'text-gray-500'} />
                        : <ChevronUp size={14} className={isLight ? 'text-slate-400' : 'text-gray-500'} />}
                </div>
            </button>

            {/* Save error banner */}
            {saveError && (
                <div className={`flex items-center gap-2 px-4 py-2 text-xs border-b ${isLight ? 'bg-red-50 border-red-100 text-red-600' : 'bg-red-900/20 border-red-500/20 text-red-400'}`}>
                    <AlertTriangle size={12} className="shrink-0" />
                    <span className="flex-1">{saveError}</span>
                    <button onClick={() => setSaveError(null)} className="shrink-0 opacity-60 hover:opacity-100">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Body — hidden when collapsed */}
            {!collapsed && showAdd && (
                <div className={`px-4 py-3 border-b space-y-2.5 ${isLight ? 'bg-amber-50/50 border-amber-100' : 'bg-amber-900/10 border-amber-500/20'}`}>
                    <div className={`text-[11px] ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
                        {txt('Describe the alert condition in plain language:', 'תאר את תנאי ההתראה בשפה חופשית:')}
                    </div>
                    <ParseForm
                        inputVal={input}
                        onInputChange={v => { setInput(v); setParsedPreview(null); setParseError(null); }}
                        onParse={handleParse}
                        parsing={parsing}
                        parseError={parseError}
                        parsedPreview={parsedPreview}
                        onConfirm={handleConfirmAdd}
                        onCancelPreview={() => { setParsedPreview(null); setParseError(null); }}
                        confirmLabel={txt('Add alert', 'הוסף התראה')}
                        isHe={isHe} isLight={isLight} canAsk={canAsk}
                    />
                    <div className="flex justify-center">
                        <button onClick={() => { setShowAdd(false); setParsedPreview(null); setInput(''); }}
                            className={`text-[10px] font-medium hover:underline ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                            {txt('Cancel', 'ביטול')}
                        </button>
                    </div>
                </div>
            )}

            {/* Alerts list */}
            {!collapsed && (alerts.length === 0 ? (
                <div className={`px-4 py-6 text-center text-xs ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>
                    {canAsk
                        ? txt('No smart alerts yet. Add one above.', 'אין התראות חכמות. הוסף אחת למעלה.')
                        : txt('Configure an AI provider in Settings to create smart alerts.', 'הגדר ספק AI בהגדרות כדי ליצור התראות חכמות.')}
                </div>
            ) : (
                <div className="divide-y divide-white/5">
                    {alerts.map(alert => {
                        const triggered = alert.enabled && isAlertTriggered(alert, appState);
                        const status = getAlertStatus(alert, appState, isHe);
                        const isEditing = editingId === alert.id;
                        const testOpen = testingId === alert.id;
                        const testTriggered = testOpen && isAlertTriggered(alert, appState);
                        const testRows = testOpen ? buildTestRows(alert, appState, isHe) : [];

                        return (
                            <div key={alert.id}>
                                <div className={`px-4 py-3 ${triggered ? (isLight ? 'bg-amber-50' : 'bg-amber-900/10') : ''}`}>
                                    <div className="flex items-start gap-2">
                                        <div className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${triggered ? 'bg-amber-400 animate-pulse' : alert.enabled ? (isLight ? 'bg-slate-300' : 'bg-slate-600') : (isLight ? 'bg-slate-200' : 'bg-slate-700')}`} />

                                        <div className="flex-1 min-w-0 space-y-0.5">
                                            <div className={`text-xs font-medium truncate ${triggered ? (isLight ? 'text-amber-800' : 'text-amber-300') : (isLight ? 'text-slate-700' : 'text-gray-200')}`}>
                                                {alert.label}
                                            </div>
                                            {status && (
                                                <div className={`text-[10px] ${triggered ? (isLight ? 'text-amber-600' : 'text-amber-400') : (isLight ? 'text-slate-400' : 'text-gray-500')}`}>
                                                    {status}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => setTestingId(testOpen ? null : alert.id)}
                                                title={txt('Test', 'בדיקה')}
                                                aria-label={txt('Test alert', 'בדוק התראה')}
                                                className={`p-0.5 transition-colors ${testOpen ? (isLight ? 'text-blue-500' : 'text-blue-400') : (isLight ? 'text-slate-300 hover:text-blue-500' : 'text-gray-600 hover:text-blue-400')}`}>
                                                <FlaskConical size={13} />
                                            </button>
                                            <button onClick={() => isEditing ? cancelEdit() : beginEdit(alert)}
                                                title={isEditing ? txt('Cancel edit', 'בטל עריכה') : txt('Edit alert', 'ערוך התראה')}
                                                aria-label={isEditing ? txt('Cancel edit', 'בטל עריכה') : txt('Edit alert', 'ערוך התראה')}
                                                className={`p-0.5 transition-colors ${isEditing ? (isLight ? 'text-amber-500' : 'text-amber-400') : (isLight ? 'text-slate-300 hover:text-slate-600' : 'text-gray-600 hover:text-gray-300')}`}>
                                                {isEditing ? <X size={13} /> : <Pencil size={13} />}
                                            </button>
                                            <button onClick={() => handleToggle(alert.id)}
                                                title={alert.enabled ? txt('Disable alert', 'בטל התראה') : txt('Enable alert', 'הפעל התראה')}
                                                aria-label={alert.enabled ? txt('Disable alert', 'בטל התראה') : txt('Enable alert', 'הפעל התראה')}
                                                className="p-0.5">
                                                {alert.enabled
                                                    ? <ToggleRight size={16} className="text-blue-500" />
                                                    : <ToggleLeft size={16} className={isLight ? 'text-slate-400' : 'text-gray-500'} />}
                                            </button>
                                            <button onClick={() => handleDelete(alert.id)}
                                                title={txt('Delete alert', 'מחק התראה')}
                                                aria-label={txt('Delete alert', 'מחק התראה')}
                                                className={`p-0.5 transition-colors ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}>
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Test result */}
                                {testOpen && (
                                    <div className={`px-4 py-3 border-t space-y-2 ${isLight ? 'bg-blue-50/60 border-blue-100' : 'bg-blue-900/10 border-blue-500/20'}`}>
                                        <div className={`flex items-center gap-2 text-xs font-semibold ${testTriggered ? (isLight ? 'text-amber-700' : 'text-amber-300') : (isLight ? 'text-slate-500' : 'text-gray-400')}`}>
                                            {testTriggered
                                                ? <AlertTriangle size={13} className="text-amber-500" />
                                                : <CheckCircle size={13} className={isLight ? 'text-slate-400' : 'text-gray-500'} />}
                                            {testTriggered
                                                ? txt('Condition MET — alert would fire', 'התנאי מתקיים — ההתראה הייתה מופעלת')
                                                : txt('Condition not met — alert would not fire', 'התנאי לא מתקיים — ההתראה לא הייתה מופעלת')}
                                        </div>
                                        {alert.originalText && (
                                            <div className={`text-[10px] italic ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                                {txt('Original:', 'מקור:')} {alert.originalText}
                                            </div>
                                        )}
                                        <div className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                            {txt('Type:', 'סוג:')} {alert.condition?.type}
                                        </div>
                                        {testRows.length > 0 && (
                                            <table className="w-full text-[11px] border-separate" style={{ borderSpacing: '0 2px' }}>
                                                <tbody>
                                                    {testRows.map(([label, val], i) => (
                                                        <tr key={i}>
                                                            <td className={`py-0.5 pe-3 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{label}</td>
                                                            <td className={`py-0.5 font-mono font-medium text-end ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{val}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}

                                {/* Inline edit form */}
                                {isEditing && (
                                    <div className={`px-4 py-3 border-t space-y-2.5 ${isLight ? 'bg-amber-50/50 border-amber-100' : 'bg-amber-900/10 border-amber-500/20'}`}>
                                        <div className={`text-[11px] ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
                                            {txt('Edit alert condition:', 'ערוך את תנאי ההתראה:')}
                                        </div>
                                        <ParseForm
                                            inputVal={editInput}
                                            onInputChange={v => { setEditInput(v); setEditParsedPreview(null); setEditParseError(null); }}
                                            onParse={handleEditParse}
                                            parsing={editParsing}
                                            parseError={editParseError}
                                            parsedPreview={editParsedPreview}
                                            onConfirm={handleConfirmEdit}
                                            onCancelPreview={() => { setEditParsedPreview(null); setEditParseError(null); }}
                                            confirmLabel={txt('Save', 'שמור')}
                                            isHe={isHe} isLight={isLight} canAsk={canAsk}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
