import React, { useState } from 'react';
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
    results, // Full results for milestone tooltips
    setInputs // State setter for age sliders
}) {
    const classes = useThemeClasses();
    const [showAddModal, setShowAddModal] = useState(false);
    const [showTimelineModal, setShowTimelineModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [viewOffset, setViewOffset] = useState(0);
    const ITEMS_PER_VIEW = 6;

    // Reset offset when events change length significantly (optional safety)
    // useEffect(() => {
    //     if (viewOffset > Math.max(0, events.length - ITEMS_PER_VIEW)) {
    //         setViewOffset(Math.max(0, events.length - ITEMS_PER_VIEW));
    //     }
    // }, [events.length]);

    const handleScrollUp = () => {
        setViewOffset(prev => Math.max(0, prev - 1));
    };

    const handleScrollDown = () => {
        setViewOffset(prev => Math.min(Math.max(0, events.length - ITEMS_PER_VIEW), prev + 1));
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

        return parts.length > 0 ? ` (${parts.join(language === 'he' ? ' ו' : ' and ')})` : '';
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
        <div className="space-y-2 mt-2">
            {/* Header */}
            <div className={`${classes.container} rounded-xl p-2`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Calendar className={`w-4 h-4 ${classes.icon}`} />
                        <label className={`text-xs font-medium ${classes.headerLabel} whitespace-nowrap flex items-center`}>
                            {t ? t('lifeEventsTimeline') : 'Life Events Timeline'}
                            {events.length > 0 && (
                                <span dir="ltr" className="mx-2 px-2 py-0.5 bg-white/10 rounded-full text-[10px] text-gray-300 font-normal">
                                    {viewOffset + 1}-{Math.min(events.length, viewOffset + ITEMS_PER_VIEW)} / {events.length}
                                </span>
                            )}
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowTimelineModal(true)}
                            className={`${classes.buttonSecondary} rounded px-2 py-1 text-xs flex items-center gap-1 whitespace-nowrap`}
                            title={t ? t('viewTimeline') : 'View Timeline'}
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

                {/* Events List */}
                {events.length === 0 ? (
                    <div className={`text-center py-4 ${classes.label} text-xs`}>
                        {t ? t('noEventsYet') : 'No life events added yet. Click "Add" to create one.'}
                    </div>
                ) : (
                    <div className="space-y-1 notranslate" translate="no">
                        {/* Up Arrow */}
                        {events.length > ITEMS_PER_VIEW && (
                            <button
                                onClick={handleScrollUp}
                                disabled={viewOffset === 0}
                                className={`w-full flex items-center justify-center p-1 rounded transition-colors ${viewOffset === 0
                                    ? 'invisible'
                                    : 'text-blue-400 hover:bg-white/10'
                                    }`}
                            >
                                <ChevronUp size={16} />
                            </button>
                        )}

                        {events.slice(viewOffset, viewOffset + ITEMS_PER_VIEW).map(event => (
                            <div
                                key={event.id}
                                className={`${classes.container} border ${event.enabled ? classes.border : 'border-gray-600'} rounded-lg p-2 ${!event.enabled ? 'opacity-50' : ''} select-none`}
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

                        {/* Down Arrow */}
                        {events.length > ITEMS_PER_VIEW && (
                            <button
                                onClick={handleScrollDown}
                                disabled={viewOffset + ITEMS_PER_VIEW >= events.length}
                                className={`w-full flex items-center justify-center p-1 rounded transition-colors ${viewOffset + ITEMS_PER_VIEW >= events.length
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
