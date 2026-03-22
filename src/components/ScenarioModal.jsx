import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, TrendingDown, BarChart2 } from 'lucide-react';
import { useDraggable } from '../hooks/useDraggable';
import { useTheme } from '../contexts/ThemeContext';
import { generateScenarioRates } from '../utils/scenarioUtils';
import CrashAnalysisModal from './CrashAnalysisModal';

export default function ScenarioModal({ isOpen, onClose, onSave, onPreview, onCancel, inputs, language, t }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';

    const currentYear = new Date().getFullYear();
    const defaultStartYear = useMemo(() => {
        const age = parseFloat(inputs.currentAge) || 30;
        const retAge = parseFloat(inputs.retirementStartAge) || 50;
        return currentYear + Math.round(retAge - age);
    }, [inputs.currentAge, inputs.retirementStartAge, currentYear]);

    const [enabled, setEnabled] = useState(false);
    const [startYear, setStartYear] = useState(defaultStartYear);
    const [crashDepth, setCrashDepth] = useState(-40);
    const [recoveryYears, setRecoveryYears] = useState(5);
    const [recoveryShape, setRecoveryShape] = useState('linear');
    const [recoveryMode, setRecoveryMode] = useState('rate');
    const [targetAvgRate, setTargetAvgRate] = useState(null);
    const [affectsSafeBucket, setAffectsSafeBucket] = useState(false);
    const [showAnalysis, setShowAnalysis] = useState(false);

    const previewReadyRef = useRef(false);

    useEffect(() => {
        if (!isOpen) { previewReadyRef.current = false; return; }
        const baseR = parseFloat(inputs.annualReturnRate) || 5;
        setEnabled(inputs.scenarioEnabled || false);
        setStartYear(inputs.scenario?.startYear || defaultStartYear);
        setCrashDepth(inputs.scenario?.crashDepth ?? -40);
        setRecoveryYears(inputs.scenario?.recoveryYears || 5);
        setRecoveryShape(inputs.scenario?.recoveryShape || 'linear');
        setRecoveryMode(inputs.scenario?.recoveryMode || 'rate');
        setTargetAvgRate(inputs.scenario?.targetAvgRate ?? baseR);
        setAffectsSafeBucket(inputs.scenario?.affectsSafeBucket || false);
        setTimeout(() => { previewReadyRef.current = true; }, 0);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!isOpen || !onPreview || !previewReadyRef.current) return;
        onPreview({ scenarioEnabled: enabled, scenario: { type: 'crash', startYear, crashDepth, recoveryYears, recoveryShape, recoveryMode, targetAvgRate, affectsSafeBucket } });
    }, [enabled, startYear, crashDepth, recoveryYears, recoveryShape, recoveryMode, targetAvgRate, affectsSafeBucket]); // eslint-disable-line react-hooks/exhaustive-deps

    const baseRate = parseFloat(inputs.annualReturnRate) || 5;

    // Build preview points: one year before crash → crash → recovery → one year after
    const previewPoints = useMemo(() => {
        const scenario = { type: 'crash', startYear, crashDepth, recoveryYears, recoveryShape, recoveryMode, targetAvgRate };
        const rates = generateScenarioRates(scenario, baseRate);
        const firstYear = startYear - 1;
        const lastYear = startYear + recoveryYears + 1;
        const points = [];
        for (let y = firstYear; y <= lastYear; y++) {
            points.push({ year: y, rate: rates[y] !== undefined ? rates[y] : baseRate });
        }
        return points;
    }, [startYear, crashDepth, recoveryYears, recoveryShape, recoveryMode, targetAvgRate, baseRate]);

    // Crash+recovery window = all points except first (pre-crash) and last (post-recovery)
    const windowPoints = useMemo(() => previewPoints.slice(1, previewPoints.length - 1), [previewPoints]);

    // Arithmetic mean of the window
    const meanWindowRate = useMemo(() => {
        if (windowPoints.length === 0) return baseRate;
        return windowPoints.reduce((sum, p) => sum + p.rate, 0) / windowPoints.length;
    }, [windowPoints, baseRate]);

    // Geometric mean of the window (= targetAvgRate by construction in value mode)
    const geoMeanWindowRate = useMemo(() => {
        if (windowPoints.length === 0) return baseRate;
        const product = windowPoints.reduce((prod, p) => prod * (1 + p.rate / 100), 1);
        return (Math.pow(product, 1 / windowPoints.length) - 1) * 100;
    }, [windowPoints, baseRate]);

    // In value mode: flat recovery rate needed per year (read from first recovery point)
    const calcRecoveryRate = useMemo(() => {
        if (recoveryMode !== 'value' || windowPoints.length < 2) return null;
        return windowPoints[1]?.rate ?? null; // index 0 = crash year, index 1+ = recovery years
    }, [recoveryMode, windowPoints]);

    // SVG mini chart
    const W = 260, H = 80, PL = 28, PT = 8, PB = 12;
    const innerW = W - PL - 6;
    const innerH = H - PT - PB;
    const rateValues = previewPoints.map(p => p.rate);
    const minR = Math.min(...rateValues, 0) - 2;
    const maxR = Math.max(...rateValues, baseRate) + 2;
    const span = maxR - minR || 1;
    const toX = i => PL + (i / (previewPoints.length - 1)) * innerW;
    const toY = r => PT + (1 - (r - minR) / span) * innerH;
    const pathD = previewPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.rate).toFixed(1)}`).join(' ');
    const zeroY = toY(0);
    const baseY = toY(baseRate);

    const inputCls = `w-full px-2 py-1.5 text-sm rounded-lg border ${isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-black/30 border-white/30 text-white'}`;
    const labelCls = `block text-xs mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`;

    const handleSave = () => {
        onSave({ scenarioEnabled: enabled, scenario: { type: 'crash', startYear, crashDepth, recoveryYears, recoveryShape, recoveryMode, targetAvgRate, affectsSafeBucket } });
        onClose();
    };

    // Build inputs merged with current (possibly unsaved) form state for the analysis sweep
    const analysisInputs = useMemo(() => ({
        ...inputs,
        scenarioEnabled: true,
        scenario: { type: 'crash', startYear, crashDepth, recoveryYears, recoveryShape, recoveryMode, targetAvgRate, affectsSafeBucket }
    }), [inputs, startYear, crashDepth, recoveryYears, recoveryShape, recoveryMode, targetAvgRate, affectsSafeBucket]); // eslint-disable-line react-hooks/exhaustive-deps

    const { dragStyle, onDragMouseDown } = useDraggable(isOpen);

    if (!isOpen) return null;

    const he = language === 'he';

    return (
        <>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4">
            <div
                className={`relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden ${isLight ? 'bg-white border border-gray-200 text-gray-900' : 'border border-white/30 text-white'}`}
                dir={he ? 'rtl' : 'ltr'}
                style={dragStyle}
            >
                {!isLight && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                        <div className="absolute inset-0 bg-white/10" />
                    </>
                )}
                <div className="relative z-10 p-5">

                {/* Header */}
                <div className="flex items-center justify-between mb-4 cursor-grab active:cursor-grabbing" onMouseDown={onDragMouseDown}>
                    <div className="flex items-center gap-2">
                        <TrendingDown size={18} className="text-orange-400" />
                        <h2 className="text-base font-bold">{he ? 'תרחיש שוק' : 'Market Scenario'}</h2>
                    </div>
                    <button onClick={onCancel ?? onClose} className={`transition-colors ${isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-400 hover:text-gray-200'}`}>
                        <X size={18} />
                    </button>
                </div>

                {/* Enable toggle */}
                <div className={`flex items-center justify-between mb-4 p-3 rounded-xl ${isLight ? 'bg-gray-50' : 'bg-black/20'}`}>
                    <span className="text-sm font-medium">{he ? 'הפעל תרחיש' : 'Enable scenario'}</span>
                    <button
                        onClick={() => setEnabled(v => !v)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-orange-500' : (isLight ? 'bg-gray-300' : 'bg-gray-600')}`}
                    >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${he ? (enabled ? 'translate-x-0.5' : 'translate-x-5') : (enabled ? 'translate-x-5' : 'translate-x-0.5')}`} />
                    </button>
                </div>

                {/* Parameters */}
                <fieldset disabled={!enabled} className={`space-y-3 transition-opacity ${!enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                    <div className="grid grid-cols-2 gap-3">
                        {/* Crash year */}
                        <div>
                            <label className={labelCls}>{he ? 'שנת הקריסה' : 'Crash year'}</label>
                            <input type="number" value={startYear} className={inputCls}
                                onChange={e => setStartYear(parseInt(e.target.value) || defaultStartYear)} />
                            <div className={`text-xs mt-0.5 ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                                {startYear > currentYear
                                    ? `+${startYear - currentYear} ${he ? 'שנים' : 'yrs'}`
                                    : (he ? 'השנה' : 'this year')}
                            </div>
                        </div>
                        {/* Crash depth */}
                        <div>
                            <label className={labelCls}>{he ? 'ירידה בשנת הקריסה %' : 'Drop in crash year %'}</label>
                            <input type="number" value={Math.abs(crashDepth)} min="0" className={inputCls}
                                onChange={e => setCrashDepth(-Math.abs(parseFloat(e.target.value) || 40))} />
                        </div>
                    </div>

                    {/* Recovery model selector */}
                    <div>
                        <label className={labelCls}>{he ? 'מודל התאוששות' : 'Recovery model'}</label>
                        <div className="flex gap-1">
                            {[
                                ['rate',  he ? 'שיעור חוזר' : 'Rate recovery'],
                                ['value', he ? 'ערך חוזר' : 'Value recovery'],
                            ].map(([val, label]) => (
                                <button key={val} onClick={() => setRecoveryMode(val)}
                                    className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                                        recoveryMode === val
                                            ? 'bg-purple-500 border-purple-500 text-white'
                                            : (isLight ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-white/30 text-gray-300 hover:bg-white/5')
                                    }`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Recovery years */}
                        <div>
                            <label className={labelCls}>{he ? 'שנות התאוששות' : 'Recovery years'}</label>
                            <input type="number" min="1" max="20" value={recoveryYears} className={inputCls}
                                onChange={e => setRecoveryYears(Math.max(1, parseInt(e.target.value) || 5))} />
                        </div>
                        {/* Right side: shape (rate mode) or target avg rate (value mode) */}
                        {recoveryMode === 'rate' ? (
                            <div>
                                <label className={labelCls}>{he ? 'צורת ההתאוששות' : 'Recovery shape'}</label>
                                <div className="flex gap-1">
                                    {[
                                        ['linear', he ? 'ליניארי' : 'Linear'],
                                        ['v',      he ? 'מהיר' : 'Fast V'],
                                        ['u',      he ? 'איטי' : 'Slow U'],
                                    ].map(([val, label]) => (
                                        <button key={val} onClick={() => setRecoveryShape(val)}
                                            className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                                                recoveryShape === val
                                                    ? 'bg-blue-500 border-blue-500 text-white'
                                                    : (isLight ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-white/30 text-gray-300 hover:bg-white/5')
                                            }`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className={labelCls}>{he ? 'יעד ממוצע גיאומטרי %' : 'Target geom avg %'}</label>
                                <input type="number" value={targetAvgRate ?? baseRate} className={inputCls}
                                    onChange={e => setTargetAvgRate(parseFloat(e.target.value) || baseRate)} />
                            </div>
                        )}
                    </div>

                    {/* Value mode: calculated recovery rate per year — always rendered to reserve space */}
                    <div className={`text-xs rounded-lg px-3 py-2 ${recoveryMode === 'value' && calcRecoveryRate !== null ? (isLight ? 'bg-purple-50 text-purple-700' : 'bg-purple-900/30 text-purple-300') : 'invisible'}`}>
                        {he ? 'ריבית נדרשת לכל שנת התאוששות:' : 'Required rate each recovery year:'}
                        {' '}<span className="font-bold" dir="ltr">{(calcRecoveryRate ?? 0).toFixed(2)}%</span>
                    </div>

                    {/* SVG preview */}
                    <div className={`rounded-xl p-2 ${isLight ? 'bg-gray-50' : 'bg-black/20'}`}>
                        <div className={`text-xs mb-1 ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                            {he ? 'תצוגה מקדימה' : 'Preview'}
                        </div>
                        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible" style={{direction: 'ltr'}}>
                            {/* 0% line (red dashed) — only when crash dips below 0 */}
                            {minR < 0 && (
                                <line x1={PL} y1={zeroY} x2={W - 6} y2={zeroY}
                                    stroke="#ef4444" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.5" />
                            )}
                            {/* Base rate line (green dashed) */}
                            <line x1={PL} y1={baseY} x2={W - 6} y2={baseY}
                                stroke="#22c55e" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.5" />
                            {/* Scenario path (orange) */}
                            <path d={pathD} fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" />
                            {/* Y-axis labels */}
                            <text x={PL - 3} y={baseY + 3} textAnchor="end" fontSize="8" fill="#22c55e" opacity="0.8">{baseRate}%</text>
                            {minR < 0 && (
                                <text x={PL - 3} y={zeroY + 3} textAnchor="end" fontSize="8" fill="#ef4444" opacity="0.8">0%</text>
                            )}
                            <text x={PL - 3} y={toY(crashDepth) + 3} textAnchor="end" fontSize="8" fill="#f97316">{crashDepth}%</text>
                            {recoveryMode === 'value' && calcRecoveryRate !== null && Math.abs(calcRecoveryRate - baseRate) > 0.5 && (
                                <text x={PL - 3} y={toY(calcRecoveryRate) + 3} textAnchor="end" fontSize="8" fill="#a855f7">{calcRecoveryRate.toFixed(1)}%</text>
                            )}
                        </svg>
                        <div className="flex justify-between mt-1 text-xs">
                            {recoveryMode === 'rate' ? (<>
                                <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>
                                    {he ? 'ממוצע אריתמטי' : 'Arith avg'}
                                    {' '}<span dir="ltr" className={`font-semibold ${meanWindowRate < baseRate ? 'text-orange-400' : 'text-green-400'}`}>{meanWindowRate.toFixed(1)}%</span>
                                </span>
                                <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>
                                    {he ? 'ממוצע גיאו' : 'Geom avg'}
                                    {' '}<span dir="ltr" className={`font-semibold ${geoMeanWindowRate < baseRate ? 'text-orange-400' : 'text-green-400'}`}>{geoMeanWindowRate.toFixed(1)}%</span>
                                </span>
                            </>) : (<>
                                <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>
                                    {he ? 'ממוצע גיאו (יעד)' : 'Geom avg (target)'}
                                    {' '}<span dir="ltr" className="font-semibold text-purple-400">{geoMeanWindowRate.toFixed(1)}%</span>
                                </span>
                                <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>
                                    {he ? 'בסיס' : 'Base'}
                                    {' '}<span dir="ltr" className="font-semibold text-green-400">{baseRate}%</span>
                                </span>
                            </>)}
                        </div>
                    </div>
                </fieldset>

                {/* Safe bucket toggle — only when buckets are active */}
                {inputs.enableBuckets && (
                    <div className={`flex items-center justify-between mt-3 p-3 rounded-xl ${isLight ? 'bg-gray-50' : 'bg-white/5'} ${!enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                        <span className="text-sm">{he ? 'הדלי הבטוח מושפע מהקריסה' : 'Safe bucket affected by crash'}</span>
                        <button
                            onClick={() => setAffectsSafeBucket(v => !v)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${affectsSafeBucket ? 'bg-orange-500' : (isLight ? 'bg-gray-300' : 'bg-gray-600')}`}
                        >
                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${he ? (affectsSafeBucket ? 'translate-x-0.5' : 'translate-x-5') : (affectsSafeBucket ? 'translate-x-5' : 'translate-x-0.5')}`} />
                        </button>
                    </div>
                )}

                {/* Action buttons */}
                <div className="mt-4 flex gap-2">
                    <button
                        onClick={() => setShowAnalysis(true)}
                        className={`flex items-center justify-center gap-1.5 flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                            isLight
                                ? 'border-teal-400 text-teal-600 hover:bg-teal-50'
                                : 'border-teal-500/60 text-teal-400 hover:bg-teal-500/10'
                        }`}
                    >
                        <BarChart2 size={14} />
                        {he ? 'ניתוח רגישות' : 'Sensitivity'}
                    </button>
                    <button onClick={onPreview ? onClose : handleSave}
                        className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors">
                        {he ? 'שמור' : 'Apply'}
                    </button>
                </div>
                </div>{/* end relative z-10 */}
            </div>
        </div>

        <CrashAnalysisModal
            isOpen={showAnalysis}
            onClose={() => setShowAnalysis(false)}
            analysisInputs={analysisInputs}
            language={language}
        />
        </>
    );
}
