import React, { useMemo, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useThemeClasses } from '../hooks/useThemeClasses';
import { X, Calendar, TrendingUp, TrendingDown, DollarSign, ArrowRight, ArrowLeft, Eye, EyeOff, ToggleLeft, ToggleRight, Filter, FilterX, Plus, Undo2, Redo2, AlertTriangle } from 'lucide-react';
import { EVENT_TYPES } from '../constants';
import { calculateTimelineLayout } from '../utils/timelineLayout';
import AddEventModal from './AddEventModal';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_SHORT_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

export default function LifeEventsTimelineModal({
    isOpen,
    onClose,
    events = [],
    retirementAge,
    retirementEndAge,
    currentAge,
    t,
    language,
    birthDate,
    onToggleEvent,  // Callback to toggle event enabled state
    onChange,  // Callback to update all events
    setShowAddModal,  // State setter to open add event modal
    showAddModal,  // State for showing add modal
    editingEvent,  // Event being edited
    setEditingEvent,  // Setter for editing event
    handleAddEvent,  // Handler for adding event
    handleEditEvent,  // Handler for editing event
    results,  // Full financial results for tooltips
    setInputs, // State setter for age sliders
    onDeleteEvent // Handler for deleting event
}) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const classes = useThemeClasses();
    const currencySymbol = language === 'he' ? '₪' : '$';
    const isRtl = language === 'he';
    const scrollContainerRef = useRef(null);
    const timelineTrackRef = React.useRef(null);
    const lastClickRef = useRef({ time: 0, id: null });

    // Create a 100% reliable Map for finding original source objects by ID
    const originalEventsMap = useMemo(() => {
        const map = new Map();
        if (Array.isArray(events)) {
            events.forEach(e => {
                if (e && e.id) map.set(String(e.id), e);
            });
        }
        return map;
    }, [events]);

    // State for color filters (which event types to show)
    const [visibleColors, setVisibleColors] = useState({
        green: true,
        red: true,
        blue: true,
        orange: true
    });

    // State for showing/hiding disabled events
    const [showDisabledEvents, setShowDisabledEvents] = useState(true);

    // UNDO / REDO HISTORY
    const [history, setHistory] = useState([]);
    const [future, setFuture] = useState([]);

    // Reset history when modal opens
    useEffect(() => {
        if (isOpen) {
            setHistory([]);
            setFuture([]);
        }
    }, [isOpen]);

    const handleEventsChange = (newEvents) => {
        // Push current state to history
        setHistory(prev => [...prev, events]);
        // Clear future
        setFuture([]);
        // Update actual state
        onChange(newEvents);
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const previous = history[history.length - 1];
        const newHistory = history.slice(0, -1);

        setFuture(prev => [events, ...prev]);
        setHistory(newHistory);
        onChange(previous);
    };

    const handleRedo = () => {
        if (future.length === 0) return;
        const next = future[0];
        const newFuture = future.slice(1);

        setHistory(prev => [...prev, events]);
        setFuture(newFuture);
        onChange(next);
    };

    const addToHistory = () => {
        setHistory(prev => [...prev, events]);
        setFuture([]);
    };

    // WRAPPERS for Actions
    const onAddWrapper = (data) => {
        addToHistory();
        handleAddEvent(data);
        setShowAddModal(false);
        setEditingEvent(null);
    };

    const onEditWrapper = (data) => {
        addToHistory();
        handleEditEvent(data);
        setShowAddModal(false);
        setEditingEvent(null);
        setTimeout(() => setEditingEvent(null), 0);
    };

    const onDeleteWrapper = (id) => {
        addToHistory();
        if (onDeleteEvent) onDeleteEvent(id);
        setShowAddModal(false);
        setEditingEvent(null);
    };

    const onToggleWrapper = (id) => {
        addToHistory();
        onToggleEvent && onToggleEvent(id);
    };

    // HELPER FUNCTIONS - MOVED TO TOP TO PREVENT REFERENCE ERRORS
    const formatMoney = (amount) => {
        return `${currencySymbol}${amount.toLocaleString()}`;
    };

    const formatDateShort = (date) => {
        if (!date) return '';
        const monthName = language === 'he' ? MONTHS_SHORT_HE[date.month - 1] : MONTHS_SHORT[date.month - 1];
        return `${monthName} ${date.year}`;
    };

    const getDurationString = (start, end) => {
        if (!start || !end) return '';
        let months = (end.year - start.year) * 12 + (end.month - start.month);
        const years = Math.floor(months / 12);
        const remainingMonths = months % 12;

        if (language === 'he') {
            const yStr = years > 0 ? `${years} ${years === 1 ? 'שנה' : 'שנים'}` : '';
            const mStr = remainingMonths > 0 ? `${remainingMonths} ${remainingMonths === 1 ? 'חודש' : 'חודשים'}` : '';
            return [yStr, mStr].filter(Boolean).join(' ו-');
        } else {
            const yStr = years > 0 ? `${years} ${years === 1 ? 'year' : 'years'}` : '';
            const mStr = remainingMonths > 0 ? `${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}` : '';
            return [yStr, mStr].filter(Boolean).join(' and ');
        }
    };

    // Calculate implied birth month
    const birthMonth = useMemo(() => {
        if (birthDate) {
            const dateObj = new Date(birthDate);
            if (!isNaN(dateObj.getTime())) {
                return dateObj.getMonth() + 1;
            }
        }
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const ageFraction = currentAge % 1;
        const monthsPassed = Math.round(ageFraction * 12);
        let bm = currentMonth - monthsPassed;
        if (bm <= 0) bm += 12;
        return bm;
    }, [currentAge, birthDate]);

    // Calculate timeline range
    const startYear = new Date().getFullYear();
    const baseCurrentAge = Math.floor(currentAge);

    const targetEndAge = retirementEndAge || 95;
    // FIXED: Add fractional year for birth month to ensure marker is included
    const endYear = startYear + (targetEndAge - baseCurrentAge) + ((birthMonth || 12) / 12);

    const totalYears = Math.max(5, endYear - startYear);

    // Process events for timeline
    const { layoutEvents, totalHeight, outOfBoundsCount } = useMemo(() => {
        // Create a deep copy to ensure NO mutation of original data
        const safeEvents = JSON.parse(JSON.stringify(events));

        const processedEvents = safeEvents
            // Don't filter by enabled - let disabled events show as greyed out
            .map(e => {
                const eventCopy = { ...e };
                const eventStartYear = eventCopy.startDate.year + (eventCopy.startDate.month / 12);
                let eventEndYear;

                if (eventCopy.endDate) {
                    eventEndYear = eventCopy.endDate.year + (eventCopy.endDate.month / 12);
                } else if (eventCopy.type === EVENT_TYPES.INCOME_CHANGE || eventCopy.type === EVENT_TYPES.EXPENSE_CHANGE) {
                    // Fallback to exactly retirementEndAge using Absolute Birth Year logic
                    // This matches the marker position exactly (BirthYear + Age)
                    const bYear = birthDate
                        ? new Date(birthDate).getFullYear()
                        : Math.floor(startYear - currentAge);

                    eventEndYear = bYear + retirementEndAge + ((birthMonth || 1) / 12);
                } else {
                    // One-time event
                    eventEndYear = eventStartYear;
                }

                // Determine styling
                let colorClass = '';
                let cardClass = '';

                switch (eventCopy.type) {
                    case EVENT_TYPES.ONE_TIME_INCOME:
                        colorClass = 'text-green-500';
                        cardClass = isLight
                            ? 'bg-green-50 border-green-500 text-green-700'
                            : 'bg-gray-900 border-green-500 text-green-400';
                        break;
                    case EVENT_TYPES.ONE_TIME_EXPENSE:
                        colorClass = 'text-red-500';
                        cardClass = isLight
                            ? 'bg-red-50 border-red-500 text-red-700'
                            : 'bg-gray-900 border-red-500 text-red-400';
                        break;
                    case EVENT_TYPES.INCOME_CHANGE:
                        colorClass = 'text-blue-500';
                        cardClass = isLight
                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                            : 'bg-gray-900 border-blue-500 text-blue-400';
                        break;
                    case EVENT_TYPES.EXPENSE_CHANGE:
                        colorClass = 'text-orange-500';
                        cardClass = isLight
                            ? 'bg-orange-50 border-orange-500 text-orange-700'
                            : 'bg-gray-900 border-orange-500 text-orange-400';
                        break;
                    default:
                        colorClass = 'text-gray-500';
                        cardClass = isLight ? 'bg-gray-50 border-gray-300' : 'bg-gray-800 border-gray-600';
                }

                return {
                    ...eventCopy,
                    startYear: eventStartYear,
                    endYear: eventEndYear,
                    colorClass,
                    cardClass
                };
            });

        const { layoutEvents, incomeTracks, expenseTracks } = calculateTimelineLayout(processedEvents, { minSpacingYears: 1.0 });

        // Calculate positions
        const eventsWithPos = layoutEvents.map(e => {
            // Standard calc
            let finalStartYear = e.startYear;
            let finalEndYear = e.endYear;

            // Custom POST-LAYOUT tweak for Electricity - REMOVED
            // Logic is now handled correctly in processedEvents with retirementEndAge
            const nameStr = (e.name || e.label || e.description || '').toLowerCase();
            const isElectricity = nameStr.includes('electricity') || nameStr.includes('חשמל');

            let finalEndDate = e.endDate;
            /* Conflicting override removed */

            // Ensure visualEndDate is populated for ALL recurring events without explicit end date
            if (!finalEndDate && (e.type === EVENT_TYPES.INCOME_CHANGE || e.type === EVENT_TYPES.EXPENSE_CHANGE)) {
                finalEndDate = {
                    year: Math.floor(finalEndYear),
                    month: birthMonth
                };
                finalEndYear = finalEndDate.year + (finalEndDate.month / 12);
            }

            // Dynamic Layout with Fixed Zones for Recurring Events
            // Blue (Income) -> Lower (Closer to axis)
            // Orange (Expense) -> Higher (Further from axis)
            const trackHeight = 38;
            const baseAxisOffset = 40;

            // Stagger One-Time events: Expense closer (0), Income further (1) - Existing Logic
            let fixedTrackIndex = -1;
            if (e.type === EVENT_TYPES.ONE_TIME_EXPENSE) fixedTrackIndex = 0;
            if (e.type === EVENT_TYPES.ONE_TIME_INCOME) fixedTrackIndex = 3;

            let trackIndex = (fixedTrackIndex !== -1)
                ? fixedTrackIndex
                : (e.trackIndex !== undefined ? (e.trackIndex - 1) : 0); // Convert to 0-based

            // Apply Offset for Recurring Expense (Orange)
            // If it's a recurring expense (and not a fixed one-time), shift it up.
            if (fixedTrackIndex === -1 && (e.type === EVENT_TYPES.EXPENSE_CHANGE)) {
                trackIndex += 3; // Shift Orange bars up to maximize distance (Starts at track 3)
            }

            // Note: Recurring Income (Blue) stays at base trackIndex (Starts at track 0)

            let trackOffsetPx = baseAxisOffset + (trackIndex * trackHeight);

            // Override if manual offset exists (legacy support)
            if (e.trackOffsetPx !== undefined) {
                trackOffsetPx = e.trackOffsetPx;
            }

            return {
                ...e,
                startPos: ((finalStartYear - startYear) / totalYears) * 100,
                endPos: ((finalEndYear - startYear) / totalYears) * 100,
                yearSpan: finalEndYear - finalStartYear,
                visualEndDate: finalEndDate,
                visualEndYear: finalEndYear,
                isRecurring: e.type === EVENT_TYPES.INCOME_CHANGE || e.type === EVENT_TYPES.EXPENSE_CHANGE,
                trackOffsetPx: trackOffsetPx
            };
        });

        // Total calculated height (with 38px tracks) - ensure at least 4 tracks for our forced indexing
        const maxTracks = Math.max(incomeTracks, expenseTracks, 4);
        const calculatedH = ((12 + (maxTracks * 38) + 40) * 2);
        const totalH = Math.max(calculatedH, 450);

        // Count out-of-bounds events for the alert
        const outOfBoundsCount = processedEvents.filter(e => e.startYear > endYear).length;

        return { layoutEvents: eventsWithPos, totalHeight: totalH, outOfBoundsCount };
    }, [JSON.stringify(events), startYear, totalYears, endYear, isLight, retirementEndAge, baseCurrentAge, currentAge, birthDate, birthMonth]);

    const getSmartMarkerPos = (targetAge, forcedMonth = null) => {
        // Calculate birth year accurately
        const birthYear = birthDate
            ? new Date(birthDate).getFullYear()
            : Math.floor(startYear - currentAge);

        const targetYearInt = birthYear + targetAge;
        let month = forcedMonth || birthMonth;
        const positionYear = targetYearInt + (month / 12);
        const displayLabel = formatDateShort({ year: targetYearInt, month: month });
        const leftPct = ((positionYear - startYear) / totalYears) * 100;
        return {
            originalYear: targetYearInt,
            positionYear,
            left: leftPct,
            displayLabel,
            month
        };
    };

    const retirementStartMarker = getSmartMarkerPos(parseInt(retirementAge), birthMonth);
    const retirementEndMarker = getSmartMarkerPos(parseInt(retirementEndAge), birthMonth);

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} style={{ cursor: 'default' }}>
            <div
                className={`w-[95vw] max-w-6xl h-auto max-h-[90vh] min-h-[480px] rounded-2xl shadow-2xl flex flex-col select-none relative overflow-hidden ${isLight ? 'bg-white' : 'border border-white/30'}`}
                onClick={e => e.stopPropagation()}
                dir={language === 'he' ? 'rtl' : 'ltr'}
                style={{ cursor: 'default' }}
            >
                {!isLight && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900" />
                        <div className="absolute inset-0 bg-white/10" />
                    </>
                )}
                <div className={`p-4 border-b ${isLight ? 'border-gray-200' : 'border-white/10'} bg-transparent shrink-0 relative`}>
                    {/* Action Buttons - Absolutely Positioned to prevent overflow clipping */}
                    <div className={`absolute top-4 ${language === 'he' ? 'left-4' : 'right-4'} flex items-center gap-2 z-10`}>
                        <div className="flex items-center gap-0.5">
                            <button
                                onClick={handleUndo}
                                disabled={history.length === 0}
                                className={`p-2 rounded-lg transition-colors ${history.length === 0 ? 'opacity-30 cursor-not-allowed' : (isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10')} ${classes.icon}`}
                                title={t ? t('undo') : 'Undo'}
                            >
                                <Undo2 className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleRedo}
                                disabled={future.length === 0}
                                className={`p-2 rounded-lg transition-colors ${future.length === 0 ? 'opacity-30 cursor-not-allowed' : (isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10')} ${classes.icon}`}
                                title={t ? t('redo') : 'Redo'}
                            >
                                <Redo2 className="w-5 h-5" />
                            </button>
                        </div>

                        <button
                            onClick={() => setShowAddModal && setShowAddModal(true)}
                            className={`p-2 rounded-lg transition-colors ${isLight ? 'bg-green-50 hover:bg-green-100 text-green-600' : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'}`}
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                        <button
                            onClick={onClose}
                            className={`p-2 rounded-lg transition-colors ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'} ${classes.icon}`}
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Main Header Content */}
                    <div className={`flex justify-between items-start ${language === 'he' ? 'pl-[140px]' : 'pr-[140px]'}`}>
                        <div className="flex flex-col w-full min-w-0">
                            {/* Row 1: Title & Stats */}
                            <div className="flex items-center gap-4 mb-2 flex-wrap">
                                <h2 className={`text-lg font-bold ${classes.headerLabel} flex items-center gap-2`}>
                                    <Calendar className="w-5 h-5" />
                                    {t ? t('lifeEventsTimeline') : 'Timeline'}
                                </h2>
                                {results && (
                                    <div className={`hidden md:flex items-center gap-3 text-[10px] lg:text-xs font-medium ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                                        <div className="flex items-center gap-1">
                                            <span className="opacity-70">{language === 'he' ? 'נצבר:' : 'Accrued:'}</span>
                                            <span className={`${isLight ? 'text-gray-900' : 'text-white'} font-bold`}>{formatMoney(results.balanceAtRetirement)}</span>
                                        </div>
                                        <div className={`w-px h-3 ${isLight ? 'bg-gray-300' : 'bg-gray-700'}`} />
                                        <div className="flex items-center gap-1">
                                            <span className="opacity-70">{language === 'he' ? 'יעד:' : 'Goal:'}</span>
                                            <span className="text-yellow-500 font-bold">{formatMoney(results.requiredCapitalAtRetirement)}</span>
                                        </div>
                                        <div className={`w-px h-3 ${isLight ? 'bg-gray-300' : 'bg-gray-700'}`} />
                                        <div className="flex items-center gap-1">
                                            <span className="opacity-70">{language === 'he' ? 'סוף:' : 'Final:'}</span>
                                            <span className={`${results.balanceAtEnd >= 0 ? 'text-green-500' : 'text-red-500'} font-bold`}>{formatMoney(results.balanceAtEnd)}</span>
                                        </div>
                                    </div>
                                )}
                                {layoutEvents && outOfBoundsCount > 0 && (
                                    <div className="flex items-center text-amber-500" title={language === 'he' ? 'ישנם אירועים מחוץ לטווח הציר' : 'Some events are outside the timeline range'}>
                                        <AlertTriangle className="w-4 h-4" />
                                        <span className="text-[10px] font-normal mx-1">({outOfBoundsCount})</span>
                                    </div>
                                )}
                            </div>

                            {/* Row 2: Stats, Sliders, Filters (Compact, No Scroll) */}
                            <div className={`flex gap-1.5 text-[10px] lg:text-xs ${classes.text} items-center flex-wrap`}>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                        onClick={() => {
                                            const allVisible = Object.values(visibleColors).every(v => v);
                                            setVisibleColors({ green: !allVisible, red: !allVisible, blue: !allVisible, orange: !allVisible });
                                        }}
                                        className={`p-1 rounded transition-all ${isLight ? 'hover:bg-gray-200' : 'hover:bg-white/20'} ${classes.icon}`}
                                    >
                                        {Object.values(visibleColors).every(v => v) ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                        onClick={() => {
                                            const allEnabled = events.every(e => e.enabled);
                                            addToHistory();
                                            onChange && onChange(events.map(e => ({ ...e, enabled: !allEnabled })));
                                        }}
                                        className={`p-1 rounded transition-all ${isLight ? 'hover:bg-gray-200' : 'hover:bg-white/20'} ${classes.icon}`}
                                    >
                                        {events.every(e => e.enabled) ? <ToggleRight className="w-3.5 h-3.5 text-green-500" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                        onClick={() => setShowDisabledEvents(!showDisabledEvents)}
                                        className={`p-1 rounded transition-all ${isLight ? 'hover:bg-gray-200' : 'hover:bg-white/20'} ${classes.icon}`}
                                    >
                                        {showDisabledEvents ? <Filter className="w-3.5 h-3.5" /> : <FilterX className="w-3.5 h-3.5" />}
                                    </button>
                                </div>

                                <div className={`h-3 w-px ${isLight ? 'bg-gray-300' : 'bg-white/20'} shrink-0`} />

                                <div className="flex items-center gap-1 opacity-80 w-[70px] lg:w-[85px] shrink-0 justify-start">
                                    <TrendingUp className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                    <span className="whitespace-nowrap flex items-center gap-1 overflow-hidden">
                                        {language === 'he' ? 'שנים:' : 'Yrs:'}
                                        <span className="font-bold tabular-nums inline-block">{retirementEndAge ? (retirementEndAge - currentAge).toFixed(1) : ''}</span>
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 opacity-80 w-[70px] lg:w-[85px] shrink-0 justify-start">
                                    <TrendingDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span className="whitespace-nowrap flex items-center gap-1 overflow-hidden">
                                        {language === 'he' ? 'פרישה:' : 'Ret:'}
                                        <span className="font-bold tabular-nums inline-block">{retirementEndAge && retirementAge ? (retirementEndAge - retirementAge) : ''}</span>
                                    </span>
                                </div>

                                <div className={`h-3 w-px ${isLight ? 'bg-gray-300' : 'bg-white/20'} shrink-0`} />

                                {/* Age Sliders  */}
                                <div className="flex items-center gap-2 mx-0.5 shrink-0">
                                    <div className="flex flex-col gap-0.5 w-[90px] lg:w-[100px] shrink-0">
                                        <div className="flex items-center justify-between px-0.5" dir="ltr">
                                            <span className="text-[10px] font-bold text-orange-500 tabular-nums w-4 text-center">{retirementAge}</span>
                                            <span className="text-[9px] opacity-70">{language === 'he' ? 'גיל פרישה' : 'Ret Age'}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={Math.ceil(currentAge)}
                                            max={70}
                                            value={retirementAge}
                                            onChange={(e) => {
                                                const newVal = parseInt(e.target.value);
                                                if (newVal >= retirementEndAge) {
                                                    setInputs(prev => ({
                                                        ...prev,
                                                        retirementStartAge: newVal,
                                                        retirementEndAge: Math.min(newVal + 1, 95)
                                                    }));
                                                } else {
                                                    setInputs(prev => ({ ...prev, retirementStartAge: newVal }));
                                                }
                                            }}
                                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-400 active:accent-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500/30 slider-thumb-fix"
                                            style={{
                                                backgroundImage: `linear-gradient(to right, #f97316 0%, #f97316 ${((retirementAge - Math.ceil(currentAge)) / (70 - Math.ceil(currentAge))) * 100}%, ${isLight ? '#e5e7eb' : '#4b5563'} ${((retirementAge - Math.ceil(currentAge)) / (70 - Math.ceil(currentAge))) * 100}%, ${isLight ? '#e5e7eb' : '#4b5563'} 100%)`
                                            }}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-0.5 w-[90px] lg:w-[100px] shrink-0">
                                        <div className="flex items-center justify-between px-0.5" dir="ltr">
                                            <span className="text-[9px] opacity-70">{language === 'he' ? 'עד גיל' : 'End Age'}</span>
                                            <span className="text-[10px] font-bold text-blue-500 tabular-nums w-4 text-center">{retirementEndAge}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={Math.ceil(currentAge)}
                                            max={95}
                                            value={retirementEndAge}
                                            onChange={(e) => {
                                                const newVal = parseInt(e.target.value);
                                                if (newVal <= retirementAge) {
                                                    setInputs(prev => ({
                                                        ...prev,
                                                        retirementEndAge: newVal,
                                                        retirementStartAge: Math.max(newVal - 1, Math.ceil(currentAge))
                                                    }));
                                                } else {
                                                    setInputs(prev => ({ ...prev, retirementEndAge: newVal }));
                                                }
                                            }}
                                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 active:accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 slider-thumb-fix"
                                            style={{
                                                backgroundImage: `linear-gradient(to right, ${isLight ? '#e5e7eb' : '#4b5563'} 0%, ${isLight ? '#e5e7eb' : '#4b5563'} ${((retirementAge - Math.ceil(currentAge)) / (95 - Math.ceil(currentAge))) * 100}%, #3b82f6 ${((retirementAge - Math.ceil(currentAge)) / (95 - Math.ceil(currentAge))) * 100}%, #3b82f6 ${((retirementEndAge - Math.ceil(currentAge)) / (95 - Math.ceil(currentAge))) * 100}%, ${isLight ? '#e5e7eb' : '#4b5563'} ${((retirementEndAge - Math.ceil(currentAge)) / (95 - Math.ceil(currentAge))) * 100}%, ${isLight ? '#e5e7eb' : '#4b5563'} 100%)`
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className={`h-3 w-px ${isLight ? 'bg-gray-300' : 'bg-white/20'} shrink-0`} />

                                <div className="flex items-center gap-1">
                                    {[
                                        { color: 'green', label: language === 'he' ? 'הכנסה חד-פעמית' : 'One-Time Income', bgClass: 'bg-green-500', symbol: language === 'he' ? '₪' : '$' },
                                        { color: 'red', label: language === 'he' ? 'הוצאה חד-פעמית' : 'One-Time Expense', bgClass: 'bg-red-500', symbol: language === 'he' ? '₪' : '$' },
                                        { color: 'blue', label: language === 'he' ? 'שינוי בהכנסה' : 'Income Change', bgClass: 'bg-blue-500', icon: TrendingUp },
                                        { color: 'orange', label: language === 'he' ? 'שינוי בהוצאה' : 'Expense Change', bgClass: 'bg-orange-500', icon: TrendingDown }
                                    ].map(({ color, label, bgClass, icon: Icon, symbol }) => (
                                        <button
                                            key={color}
                                            onClick={() => setVisibleColors(prev => ({ ...prev, [color]: !prev[color] }))}
                                            title={label}
                                            className={`p-1 w-6 h-6 rounded-lg transition-all flex items-center justify-center ${visibleColors[color]
                                                ? `${bgClass} text-white shadow-md`
                                                : `${isLight ? 'bg-gray-100 text-gray-400 border border-gray-300' : 'bg-white/5 text-gray-500 border border-white/20'}`
                                                }`}
                                        >
                                            {symbol ? (
                                                <span className="text-sm font-bold leading-none">{symbol}</span>
                                            ) : (
                                                <Icon className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden relative flex flex-col">
                    {events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Calendar className="w-20 h-20 mb-6 opacity-20" />
                            <p className="text-lg">{t ? t('noEventsTimeline') : 'No life events to display'}</p>
                        </div>
                    ) : (
                        <>
                            <div
                                className="hidden md:flex flex-1 relative px-14 py-5 items-center justify-center"
                                ref={scrollContainerRef}
                                style={{ cursor: 'default', direction: 'ltr', overflow: 'hidden' }}
                            >
                                <div
                                    ref={timelineTrackRef}
                                    className="relative mx-auto"
                                    style={{ width: '100%', height: '100%', minHeight: `${totalHeight}px` }}
                                >
                                    <div className={`absolute top-[48%] left-0 right-0 h-0.5 z-0 ${isLight ? 'bg-gray-300' : 'bg-gray-600'}`} />
                                    <div
                                        className="absolute top-[48%] left-0 right-0 h-8 -mt-4 z-[105] cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const offsetX = e.clientX - rect.left;
                                            const totalWidth = rect.width;
                                            const exactYearValue = startYear + ((offsetX / totalWidth) * totalYears);
                                            const year = Math.floor(exactYearValue);
                                            const decimalPart = exactYearValue - year;
                                            const month = Math.max(1, Math.min(12, Math.floor(decimalPart * 12) + 1));

                                            if (setEditingEvent) setEditingEvent({
                                                type: EVENT_TYPES.ONE_TIME_INCOME,
                                                startDate: { year, month },
                                                amount: '',
                                                description: ''
                                            });
                                            if (setShowAddModal) setShowAddModal(true);
                                        }}
                                    />

                                    {Array.from({ length: Math.ceil(totalYears) + 1 }).map((_, i) => {
                                        const year = startYear + i;
                                        const age = baseCurrentAge + i;
                                        const left = (i / totalYears) * 100;

                                        const isTargetEnd = age === Math.floor(targetEndAge);
                                        if (age > targetEndAge) return null;
                                        if (!(i % 5 === 0 || i === 0 || isTargetEnd)) return null;

                                        return (
                                            <div
                                                key={year}
                                                className="absolute top-[48%] transform -translate-x-1/2 z-[110] flex flex-col items-center pointer-events-auto"
                                                style={{ left: `${left}%`, cursor: 'pointer' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (setEditingEvent) setEditingEvent({
                                                        type: EVENT_TYPES.ONE_TIME_INCOME,
                                                        startDate: { year, month: 1 },
                                                        amount: '',
                                                        description: ''
                                                    });
                                                    if (setShowAddModal) setShowAddModal(true);
                                                }}
                                            >
                                                <div className={`h-4 w-1 ${isLight ? 'bg-gray-400' : 'bg-gray-500'} -mt-2 mb-1`} />
                                                <div className={`text-xs font-bold ${classes.label} whitespace-nowrap select-none`}>{year}</div>
                                                <div className={`text-[10px] ${isLight ? 'text-indigo-600' : 'text-blue-400'} font-bold whitespace-nowrap select-none`}>
                                                    {language === 'he' ? `גיל ${age}` : `Age ${age}`}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {[
                                        { ...retirementStartMarker, labelKey: 'retirementStart', age: retirementAge },
                                        { ...retirementEndMarker, labelKey: 'retirementEnd', age: retirementEndAge }
                                    ].map((marker) => {
                                        if (marker.left > 100 || marker.left < 0) return null;
                                        const labelString = language === 'he'
                                            ? (marker.labelKey === 'retirementStart' ? 'תחילת פרישה' : 'סיום פרישה')
                                            : (t ? t(marker.labelKey) : (marker.labelKey === 'retirementStart' ? 'Retirement Start' : 'Retirement End'));

                                        const isStart = marker.labelKey === 'retirementStart';

                                        const tooltipContent = results ? (
                                            isStart ? (
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="opacity-80">{language === 'he' ? 'סכום שנצבר:' : 'Accrued:'}</span>
                                                        <span className="font-bold">{currencySymbol}{Math.round(results.balanceAtRetirement).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 border-t border-white/20 pt-1">
                                                        <span className="opacity-80">{language === 'he' ? 'הון נדרש:' : 'Required:'}</span>
                                                        <span className="font-bold text-yellow-300">{currencySymbol}{Math.round(results.requiredCapitalAtRetirement).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between gap-4">
                                                        <span className="opacity-80">{language === 'he' ? 'יתרה בסוף תקופה:' : 'Final Balance:'}</span>
                                                        <span className="font-bold text-green-400">{currencySymbol}{Math.round(results.balanceAtEnd).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            )
                                        ) : null;

                                        return (
                                            <div
                                                key={marker.labelKey}
                                                className="group absolute top-[48%] z-[300] flex flex-col-reverse items-center pointer-events-auto cursor-help"
                                                style={{ left: `${marker.left}%`, transform: 'translate(-50%, calc(-100% - 4px))' }}
                                            >
                                                {tooltipContent && (
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-gray-800/95 backdrop-blur-md border border-white/20 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-[400] min-w-max">
                                                        <div className="text-[11px] text-white">
                                                            {tooltipContent}
                                                        </div>
                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-8 border-transparent border-t-gray-800/95" />
                                                    </div>
                                                )}

                                                <div className="flex flex-col items-center mb-1">
                                                    <div className="text-[10px] text-amber-500 font-extrabold whitespace-nowrap leading-none drop-shadow-md">
                                                        {marker.displayLabel} <span className="opacity-80 font-bold">({language === 'he' ? `גיל ${marker.age}` : `Age ${marker.age}`})</span>
                                                    </div>
                                                    <div className="text-[8px] text-amber-500 font-bold uppercase tracking-wider opacity-90 leading-none mt-1">{labelString}</div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {layoutEvents
                                        .filter(event => {
                                            if (!showDisabledEvents && !event.enabled) return false;
                                            const colorClass = event.colorClass || '';
                                            if (colorClass.includes('green')) return visibleColors.green;
                                            if (colorClass.includes('red')) return visibleColors.red;
                                            if (colorClass.includes('blue')) return visibleColors.blue;
                                            if (colorClass.includes('orange')) return visibleColors.orange;
                                            return true;
                                        })
                                        .map((event) => {
                                            const finalOffset = event.trackOffsetPx;
                                            const isAboveAxis = event.type === EVENT_TYPES.INCOME_CHANGE || event.type === EVENT_TYPES.EXPENSE_CHANGE;
                                            const isTop = isAboveAxis;
                                            const verticalShift = isAboveAxis ? -event.trackOffsetPx : event.trackOffsetPx;
                                            const nameStr = (event.name || event.label || event.description || '').toLowerCase();

                                            const positionStyle = {
                                                left: `${event.startPos}%`,
                                                width: event.isRecurring ? `${Math.max(event.endPos - event.startPos, 0.5)}%` : '0',
                                                top: `calc(48% + ${verticalShift}px)`,
                                                height: '32px', // FIX: 32px Height (Reverted)
                                                transform: 'translateY(-50%)'
                                            };

                                            return (
                                                <React.Fragment key={event.id}>
                                                    <div
                                                        className={`absolute w-[2px] border-l-2 border-dashed ${isLight ? 'border-gray-400' : 'border-gray-500'} ${!event.enabled ? 'opacity-20' : 'opacity-60'} pointer-events-none`}
                                                        style={{
                                                            left: `${event.startPos}%`,
                                                            top: '48%',
                                                            height: `${finalOffset}px`,
                                                            transform: isTop ? 'translateY(-100%)' : 'none',
                                                            zIndex: 0
                                                        }}
                                                    />
                                                    {event.isRecurring && (
                                                        <div
                                                            className={`absolute w-[2px] border-l-2 border-dashed ${isLight ? 'border-gray-400' : 'border-gray-500'} ${!event.enabled ? 'opacity-20' : 'opacity-60'} pointer-events-none`}
                                                            style={{
                                                                left: `${event.endPos}%`,
                                                                top: '48%',
                                                                height: `${finalOffset}px`,
                                                                transform: isTop ? 'translateY(-100%)' : 'none',
                                                                zIndex: 0
                                                            }}
                                                        />
                                                    )}

                                                    <div
                                                        className={`absolute cursor-pointer transition-all pointer-events-auto ${!event.enabled ? 'opacity-40 grayscale' : 'hover:scale-105'}`}
                                                        style={{ ...positionStyle, zIndex: 20 }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const now = performance.now();
                                                            if (lastClickRef.current?.id === event.id && (now - lastClickRef.current.time < 250)) {
                                                                const originalSourceEvent = originalEventsMap.get(String(event.id));
                                                                if (originalSourceEvent && setEditingEvent) setEditingEvent(originalSourceEvent);
                                                                lastClickRef.current = { time: 0, id: null };
                                                            } else {
                                                                lastClickRef.current = { time: now, id: event.id };
                                                                onToggleWrapper(event.id);
                                                            }
                                                        }}
                                                    >
                                                        {event.isRecurring ? (
                                                            <div className="relative w-full h-full">
                                                                <div className={`absolute top-1/2 -translate-y-1/2 w-full h-1.5 rounded-full bg-current ${event.colorClass}`} />
                                                                <div className={`absolute top-1/2 -translate-y-1/2 left-0 w-3 h-3 rounded-full border-2 bg-white dark:bg-gray-800 ${event.colorClass.replace('text-', 'border-')} flex items-center justify-center`}>
                                                                    <div className={`w-1 h-1 rounded-full ${event.colorClass.replace('text-', 'bg-')}`} />
                                                                </div>
                                                                <div className={`absolute top-1/2 -translate-y-1/2 right-0 w-3 h-3 rounded-full border-2 bg-white dark:bg-gray-800 ${event.colorClass.replace('text-', 'border-')} flex items-center justify-center`}>
                                                                    {event.endDate ? <div className={`w-1 h-1 rounded-full ${event.colorClass.replace('text-', 'bg-')}`} /> : (isRtl ? <ArrowLeft size={8} className={event.colorClass} /> : <ArrowRight size={8} className={event.colorClass} />)}
                                                                </div>
                                                                <div className={`absolute -top-4 left-0 text-[10px] font-bold whitespace-nowrap opacity-90 ${event.colorClass}`}>{formatDateShort(event.startDate)}</div>
                                                                {event.yearSpan > 1.5 && (
                                                                    <div className={`absolute -top-4 right-0 text-[10px] font-bold whitespace-nowrap opacity-90 ${event.colorClass}`}>{formatDateShort(event.endDate || event.visualEndDate)}</div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="relative w-0 h-full flex items-center justify-center">
                                                                <div className={`absolute w-3 h-3 rounded-full ${event.colorClass.replace('text-', 'bg-')} ring-2 ${isLight ? 'ring-white' : 'ring-gray-900'} z-10`} />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div
                                                        className={`absolute cursor-pointer transition-all pointer-events-auto ${!event.enabled ? 'opacity-40 grayscale' : 'hover:scale-105'}`}
                                                        style={{ ...positionStyle, zIndex: 50 }}
                                                        onClick={e => { e.stopPropagation(); onToggleWrapper(event.id); }}
                                                        onDoubleClick={e => {
                                                            e.stopPropagation();
                                                            const originalSourceEvent = originalEventsMap.get(String(event.id));
                                                            if (originalSourceEvent && setEditingEvent) setEditingEvent(originalSourceEvent);
                                                        }}
                                                    >
                                                        {event.isRecurring ? (
                                                            <div className="relative w-full h-full">
                                                                <div dir={isRtl ? 'rtl' : 'ltr'} className={`absolute ${isTop ? (nameStr.includes('electricity') || nameStr.includes('חשמל') || nameStr.includes('side jobs') || nameStr.includes('עבודות צד') ? 'top-0 -translate-y-full' : '-top-2 -translate-y-full') : 'bottom-0 translate-y-full'} left-1/2 -translate-x-1/2 px-2 py-0.5 rounded shadow-sm border flex flex-col items-center whitespace-nowrap min-w-[100px] ${event.cardClass} group cursor-pointer`}>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onDeleteWrapper(event.id);
                                                                        }}
                                                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                                        title={t ? t('delete') : 'Delete'}
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>

                                                                    <span className="text-[10px] uppercase font-bold tracking-wider">{formatMoney(event.monthlyChange)}</span>
                                                                    {(nameStr.includes('electricity') || nameStr.includes('חשמל') || nameStr.includes('side jobs') || nameStr.includes('עבודות צד')) ? (
                                                                        <>
                                                                            <span className="text-[8px] opacity-70 font-medium mt-0.5">
                                                                                {(nameStr.includes('electricity') || nameStr.includes('חשמל')) && retirementEndAge
                                                                                    ? getDurationString(event.startDate, { year: startYear + (retirementEndAge - baseCurrentAge), month: 1 })
                                                                                    : getDurationString(event.startDate, event.endDate || event.visualEndDate)
                                                                                }
                                                                            </span>
                                                                            <span className="text-[9px] opacity-80 max-w-[120px] truncate mt-0.5">{event.description}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <span className="text-[9px] opacity-80 max-w-[120px] truncate">{event.description}</span>
                                                                            <span className="text-[8px] opacity-70 font-medium mt-0.5">
                                                                                {getDurationString(event.startDate, event.endDate || event.visualEndDate)}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="relative w-0 h-full flex items-center justify-center">
                                                                <div dir={isRtl ? 'rtl' : 'ltr'} className={`absolute ${isTop ? '-top-2 -translate-y-full' : 'bottom-0 translate-y-full'} left-1/2 -translate-x-1/2 px-2 py-1 rounded shadow-sm border whitespace-nowrap text-center min-w-[80px] ${event.cardClass} group cursor-pointer`}>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onDeleteWrapper(event.id);
                                                                        }}
                                                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                                        title={t ? t('delete') : 'Delete'}
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>

                                                                    <div className="text-xs font-bold">{formatMoney(event.amount)}</div>
                                                                    <div className="text-[9px] opacity-90 mb-0.5 font-medium">{formatDateShort(event.startDate)}</div>
                                                                    <div className="text-[9px] opacity-80 truncate max-w-[100px]">{event.description}</div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </React.Fragment>
                                            );
                                        })}
                                </div>
                            </div>

                            <div className="md:hidden flex-1 overflow-y-auto p-4 custom-scrollbar" style={{ direction: 'ltr' }}>
                                <div className="relative min-h-full pl-6 border-l-2 border-gray-200 dark:border-gray-700 ml-4 space-y-6 py-4" style={{ direction: language === 'he' ? 'rtl' : 'ltr' }}>
                                    {layoutEvents
                                        .filter(event => {
                                            if (!showDisabledEvents && event.enabled === false) return false;
                                            const colorClass = event.colorClass || '';
                                            if (colorClass.includes('green')) return visibleColors.green;
                                            if (colorClass.includes('red')) return visibleColors.red;
                                            if (colorClass.includes('blue')) return visibleColors.blue;
                                            if (colorClass.includes('orange')) return visibleColors.orange;
                                            return true;
                                        })
                                        .map((event) => (
                                            <div key={event.id} className={`relative transition-all duration-300 ${event.enabled === false ? 'opacity-50 grayscale' : ''}`}>
                                                <div className={`absolute -left-[31px] top-4 w-4 h-4 rounded-full border-2 bg-white dark:bg-gray-900 ${event.colorClass.replace('text-', 'border-')} flex items-center justify-center`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${event.colorClass.replace('text-', 'bg-')}`} />
                                                </div>
                                                <div className={`p-3 rounded-lg border shadow-sm ${event.cardClass} cursor-pointer active:scale-95 transition-transform`} onClick={() => onToggleWrapper(event.id)}>
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-sm font-bold">
                                                            {event.isRecurring ? formatMoney(event.monthlyChange) : formatMoney(event.amount)}
                                                        </span>
                                                        {event.isRecurring && <span className="text-xs font-normal opacity-70"> / mo</span>}
                                                        <div className="flex flex-col items-end">
                                                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded bg-white/50 dark:bg-black/20 ${classes.text}`}>
                                                                {formatDateShort(event.startDate)}
                                                                {event.isRecurring && ` - ${event.endDate ? formatDateShort(event.endDate) : (t ? t('ongoing') : 'Now')}`}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className={`text-xs opacity-80 ${classes.text} flex flex-col gap-0.5 mt-2`}>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium">
                                                                {(() => {
                                                                    switch (event.type) {
                                                                        case EVENT_TYPES.ONE_TIME_INCOME: return language === 'he' ? 'הכנסה חד-פעמית' : 'One-Time Income';
                                                                        case EVENT_TYPES.ONE_TIME_EXPENSE: return language === 'he' ? 'הוצאה חד-פעמית' : 'One-Time Expense';
                                                                        case EVENT_TYPES.INCOME_CHANGE: return language === 'he' ? 'שינוי בהכנסה' : 'Income Change';
                                                                        case EVENT_TYPES.EXPENSE_CHANGE: return language === 'he' ? 'שינוי בהוצאה' : 'Expense Change';
                                                                        default: return event.type;
                                                                    }
                                                                })()}
                                                            </span>
                                                            <span className="opacity-40">|</span>
                                                            <span className="opacity-90">
                                                                {language === 'he' ? 'גיל' : 'Age'} {Math.floor(baseCurrentAge + (event.startDate.year - startYear))}
                                                            </span>
                                                        </div>
                                                        {event.description && <div className="opacity-70 break-words">{event.description}</div>}
                                                    </div>

                                                    <div className="mt-3 flex gap-3 border-t border-black/5 dark:border-white/10 pt-2 opacity-60">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const originalSourceEvent = originalEventsMap.get(String(event.id));
                                                                if (originalSourceEvent && setEditingEvent) setEditingEvent(originalSourceEvent);
                                                            }}
                                                            className="text-[10px] items-center gap-1 uppercase font-bold tracking-wider hover:opacity-100 flex"
                                                        >
                                                            {language === 'he' ? 'ערוך' : 'EDIT'}
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onDeleteWrapper(event.id); }}
                                                            className="text-[10px] items-center gap-1 uppercase font-bold tracking-wider hover:text-red-500 hover:opacity-100 flex"
                                                        >
                                                            {language === 'he' ? 'מחק' : 'DELETE'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {(showAddModal || editingEvent) && (
                    <AddEventModal
                        key={`${language}-${editingEvent?.id || 'new'}`}
                        event={editingEvent}
                        onSave={editingEvent?.id ? onEditWrapper : onAddWrapper}
                        onCancel={() => {
                            setShowAddModal(false);
                            setEditingEvent(null);
                        }}
                        t={t}
                        language={language}
                        currentAge={currentAge}
                        retirementAge={retirementAge}
                        retirementEndAge={retirementEndAge}
                        onDelete={(id) => {
                            onDeleteWrapper(id);
                        }}
                    />
                )}
            </div>
        </div >,
        document.body
    );
}
