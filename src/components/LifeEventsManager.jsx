import React, { useState, useRef, useEffect } from 'react';
import { useThemeClasses } from '../hooks/useThemeClasses';
import { EVENT_TYPES } from '../constants';
import { Calendar, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, TrendingUp, TrendingDown, DollarSign, BarChart3, ChevronUp, ChevronDown } from 'lucide-react';
import AddEventModal from './AddEventModal';
import LifeEventsTimelineModal from './LifeEventsTimelineModal';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_SHORT_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

/**
 * LifeEventsManager - Manages life events timeline
 */
export default function LifeEventsManager({
    events = [],
    onChange,
    t,
    language,
    currentAge,
    retirementAge,
    retirementEndAge,
    birthDate,
    results,
    setInputs,
    calculationMode,
    simulationType
}) {
    const classes = useThemeClasses();
    const [showAddModal, setShowAddModal] = useState(false);
    const [showTimelineModal, setShowTimelineModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [viewOffset, setViewOffset] = useState(0);
    const [itemsPerView, setItemsPerView] = useState(6);
    const listContainerRef = useRef(null);

    // Reset offset when events change length significantly (optional safety)
    useEffect(() => {
        if (viewOffset > Math.max(0, events.length - itemsPerView)) {
            setViewOffset(Math.max(0, events.length - itemsPerView));
        }
    }, [events.length, itemsPerView]);

    const calculateItems = () => {
        const container = listContainerRef.current;
        if (!container) return;

        const effectiveHeight = container.clientHeight;

        const ITEM_HEIGHT = 48; // Compacted: py-1.5 (6+6) + 2 lines(32) + border(2) + gap(2) = ~48px
        const BUTTON_SPACE = 36; // 2 buttons * 18px (optimized to fit more items)

        // 1. Check if we can fit ALL events without buttons (with 12px buffer/squeeze)
        const potentialCountNoButtons = Math.floor((effectiveHeight + 12) / ITEM_HEIGHT);

        if (potentialCountNoButtons >= events.length) {
            setItemsPerView(events.length);
            return;
        }

        const availableHeight = effectiveHeight - BUTTON_SPACE;
        // Allow squeezing one more item if we are within 12px of fitting it
        const count = Math.max(1, Math.floor((availableHeight + 12) / ITEM_HEIGHT));

        setItemsPerView(count);
    };

    // Calculate on resize and strict mode changes
    useEffect(() => {
        if (!listContainerRef.current) return;

        const observer = new ResizeObserver(calculateItems);
        observer.observe(listContainerRef.current);
        window.addEventListener('resize', calculateItems);

        // Initial calculation
        calculateItems();

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', calculateItems);
        };
    }, []);

    // Recalculate when layout-shifting props change, with a delay for animations
    useEffect(() => {
        // Run immediately
        calculateItems();

        // And run again after animation (approx 300ms)
        const timer = setTimeout(calculateItems, 350);
        return () => clearTimeout(timer);
    }, [calculationMode, simulationType]);

    const handleScrollUp = () => {
        setViewOffset(prev => Math.max(0, prev - 1));
    };

    const handleScrollDown = () => {
        setViewOffset(prev => Math.min(Math.max(0, events.length - itemsPerView), prev + 1));
    };

    const handleAddEvent = (eventData) => {
        const newEvent = {
            ...eventData,
            id: Date.now().toString(),
            enabled: true
        };
        onChange([...events, newEvent]);
        setShowAddModal(false);
        setEditingEvent(null);
    };

    const handleEditEvent = (eventData) => {
        onChange(events.map(evt => evt.id === editingEvent.id ? { ...eventData, id: evt.id, enabled: evt.enabled } : evt));
        setEditingEvent(null); // Ensure modal closes and state clears
        setShowAddModal(false); // Explicitly close modal just in case
    };

    const handleDeleteEvent = (eventId) => {
        const newEvents = events.filter(evt => evt.id !== eventId);
        onChange(newEvents);
    };

    const handleToggleEvent = (eventId) => {
        onChange(events.map(evt => evt.id === eventId ? { ...evt, enabled: !evt.enabled } : evt));
    };

    const formatDate = (date) => {
        if (!date) return '';
        const months = language === 'he' ? MONTHS_SHORT_HE : MONTHS_SHORT;
        return `${months[date.month - 1]} ${date.year}`;
    };

    const getEventIcon = (type) => {
        switch (type) {
            case EVENT_TYPES.ONE_TIME_INCOME:
                return <TrendingUp className="w-4 h-4 text-green-500" />;
            case EVENT_TYPES.ONE_TIME_EXPENSE:
                return <TrendingDown className="w-4 h-4 text-red-500" />;
            case EVENT_TYPES.INCOME_CHANGE:
                return language === 'he'
                    ? <span className="w-4 h-4 text-blue-500 flex items-center justify-center font-bold text-sm leading-none">₪</span>
                    : <DollarSign className="w-4 h-4 text-blue-500" />;
            case EVENT_TYPES.EXPENSE_CHANGE:
                return language === 'he'
                    ? <span className="w-4 h-4 text-orange-500 flex items-center justify-center font-bold text-sm leading-none">₪</span>
                    : <DollarSign className="w-4 h-4 text-orange-500" />;
            default:
                return <Calendar className="w-4 h-4" />;
        }
    };

    const getEventTypeLabel = (type) => {
        if (!t) return type;
        switch (type) {
            case EVENT_TYPES.ONE_TIME_INCOME:
                return t('oneTimeIncome');
            case EVENT_TYPES.ONE_TIME_EXPENSE:
                return t('oneTimeExpense');
            case EVENT_TYPES.INCOME_CHANGE:
                return t('incomeChange');
            case EVENT_TYPES.EXPENSE_CHANGE:
                return t('expenseChange');
            default:
                return type;
        }
    };

    const calculateDuration = (startDate, endDate) => {
        if (!startDate || !endDate) return null;

        const startYear = startDate.year;
        const startMonth = startDate.month;
        const endYear = endDate.year;
        const endMonth = endDate.month;

        let totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth);
        const years = Math.floor(totalMonths / 12);
        const months = totalMonths % 12;

        return { years, months };
    };

    const formatDuration = (duration) => {
        if (!duration) return '';

        const parts = [];
        if (duration.years > 0) {
            parts.push(`${duration.years} ${language === 'he' ? (duration.years === 1 ? 'שנה' : 'שנים') : (duration.years === 1 ? 'year' : 'years')}`);
        }
        if (duration.months > 0) {
            parts.push(`${duration.months} ${language === 'he' ? (duration.months === 1 ? 'חודש' : 'חודשים') : (duration.months === 1 ? 'month' : 'months')}`);
        }

        return parts.length > 0 ? ` (${parts.join(language === 'he' ? ' ו-' : ' and ')})` : '';
    };

    const formatAmount = (event) => {
        const currency = language === 'he' ? '₪' : '$';
        const perMonthText = t ? t('perMonth') : '/mo';

        if (event.amount != null) {
            return `${currency}${event.amount.toLocaleString()}`;
        }
        if (event.monthlyChange != null) {
            const sign = event.monthlyChange >= 0 ? '+' : '';
            return `${sign}${currency}${Math.abs(event.monthlyChange).toLocaleString()}${perMonthText}`;
        }
        return '';
    };

    return (
        <div className="flex flex-col flex-1 space-y-2 mt-2">
            {/* Header */}
            <div className={`${classes.container} rounded-xl p-2 flex-none`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Calendar className={`w-4 h-4 ${classes.icon}`} />
                        <label className={`text-xs font-medium ${classes.headerLabel} whitespace-nowrap flex items-center`}>
                            {t ? t('lifeEventsTimeline') : 'Life Events Timeline'}
                            {events.length > 0 && (
                                <span dir="ltr" className="mx-2 px-2 py-0.5 bg-white/10 rounded-full text-[10px] text-gray-300 font-normal">
                                    {viewOffset + 1}-{Math.min(events.length, viewOffset + itemsPerView)} / {events.length}
                                </span>
                            )}
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowTimelineModal(true)}
                            className={`${classes.buttonSecondary} rounded px-2 py-1 text-xs flex items-center gap-1 whitespace-nowrap`}
                            title={t ? t('viewTimeline') : 'Timeline'}
                        >
                            <BarChart3 className="w-3 h-3" />
                            <span className="hidden sm:inline">{t ? t('viewTimeline') : 'Timeline'}</span>
                        </button>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className={`${classes.buttonPrimary} rounded px-2 py-1 text-xs flex items-center gap-1 whitespace-nowrap`}
                        >
                            <Plus className="w-3 h-3" />
                            {t ? t('addEvent') : 'Add'}
                        </button>
                    </div>
                </div>

                {/* Events List Container */}
                <div ref={listContainerRef} className="flex-1 min-h-0 flex flex-col">
                    {events.length === 0 ? (
                        <div className={`text-center py-4 ${classes.label} text-xs`}>
                            {t ? t('noEventsYet') : 'No life events added yet. Click "Add" to create one.'}
                        </div>
                    ) : (
                        <div className="space-y-0.5 notranslate flex-1 flex flex-col" translate="no">
                            {/* Up Arrow - Always render but hidden if needed to preserve layout if we want, OR conditional */}
                            {/* To keep height calculations stable, it's better if they exist or we account for them. */}
                            {/* Since we subtracted BUTTON_SPACE, we can render them. */}

                            {events.length > itemsPerView && (
                                <button
                                    onClick={handleScrollUp}
                                    disabled={viewOffset === 0}
                                    className={`w-full flex-none flex items-center justify-center p-[1px] rounded transition-colors ${viewOffset === 0
                                        ? 'invisible'
                                        : 'text-blue-400 hover:bg-white/10'
                                        }`}
                                >
                                    <ChevronUp size={16} />
                                </button>
                            )}

                            <div className="flex-1 space-y-0.5 min-h-0 flex flex-col">
                                {events.slice(viewOffset, viewOffset + itemsPerView).map(event => (
                                    <div
                                        key={event.id}
                                        className={`${classes.container} border ${event.enabled ? classes.border : 'border-gray-600'} rounded-lg px-2 py-1.5 ${!event.enabled ? 'opacity-50' : ''} select-none flex-1`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-start gap-2 flex-1 min-w-0">
                                                {getEventIcon(event.type)}
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-xs font-medium ${classes.headerLabel} truncate`}>
                                                        {event.description || getEventTypeLabel(event.type)}
                                                        {event.endDate && formatDuration(calculateDuration(event.startDate, event.endDate))}
                                                    </div>
                                                    <div className={`text-xs ${classes.label} flex flex-wrap items-center gap-1`}>
                                                        <span>{formatDate(event.startDate)}</span>
                                                        {event.endDate && (
                                                            <>
                                                                <span>→</span>
                                                                <span>{formatDate(event.endDate)}</span>
                                                            </>
                                                        )}
                                                        <span className="text-yellow-400 font-medium ml-1">
                                                            {formatAmount(event)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleToggleEvent(event.id)}
                                                    className={`p-1 rounded hover:bg-white/10 ${classes.icon}`}
                                                    title={event.enabled ? (t ? t('disable') : 'Disable') : (t ? t('enable') : 'Enable')}
                                                >
                                                    {event.enabled ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                                                </button>
                                                <button
                                                    onClick={() => setEditingEvent(event)}
                                                    className={`p-1 rounded hover:bg-white/10 ${classes.icon}`}
                                                    title={t ? t('edit') : 'Edit'}
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteEvent(event.id)}
                                                    className={`p-1 rounded hover:bg-white/10 text-red-500`}
                                                    title={t ? t('delete') : 'Delete'}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Down Arrow */}
                            {events.length > itemsPerView && (
                                <button
                                    onClick={handleScrollDown}
                                    disabled={viewOffset + itemsPerView >= events.length}
                                    className={`w-full flex-none flex items-center justify-center p-[1px] rounded transition-colors ${viewOffset + itemsPerView >= events.length
                                        ? 'invisible'
                                        : 'text-blue-400 hover:bg-white/10'
                                        }`}
                                >
                                    <ChevronDown size={16} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Timeline Modal */}
            <LifeEventsTimelineModal
                isOpen={showTimelineModal}
                onClose={() => setShowTimelineModal(false)}
                events={events}
                retirementAge={retirementAge}
                retirementEndAge={retirementEndAge}
                currentAge={currentAge}
                // Pass birthDate for exact year calculation
                birthDate={birthDate}
                t={t}
                language={language}
                onToggleEvent={handleToggleEvent}
                onChange={onChange}
                setShowAddModal={setShowAddModal}
                showAddModal={showAddModal}
                editingEvent={editingEvent}
                setEditingEvent={setEditingEvent}
                handleAddEvent={handleAddEvent}
                handleEditEvent={handleEditEvent}
                results={results}
                setInputs={setInputs}
                onDeleteEvent={handleDeleteEvent}
            />

            {/* Add/Edit Modal - only render here when timeline is closed */}
            {
                (showAddModal || editingEvent) && !showTimelineModal && (
                    <AddEventModal
                        key={`${language}-${editingEvent?.id || 'new'}`}
                        event={editingEvent}
                        onSave={editingEvent?.id ? handleEditEvent : handleAddEvent}
                        onCancel={() => {
                            setShowAddModal(false);
                            setEditingEvent(null);
                        }}
                        t={t}
                        language={language}
                        currentAge={currentAge}
                        retirementAge={retirementAge}
                        retirementEndAge={retirementEndAge}
                    />
                )
            }
        </div >
    );
}
