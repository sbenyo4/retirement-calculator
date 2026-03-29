import React, { useState, useRef, useEffect } from 'react';
import { useThemeClasses } from '../hooks/useThemeClasses';
import { EVENT_TYPES } from '../constants';
import { Calendar, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, TrendingUp, TrendingDown, DollarSign, BarChart3, ChevronUp, ChevronDown, Copy } from 'lucide-react';
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
    simulationType,
    profiles,
    updateProfile,
    currentProfileId
}) {
    const classes = useThemeClasses();
    const [showAddModal, setShowAddModal] = useState(false);
    const [showTimelineModal, setShowTimelineModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [copyingEvent, setCopyingEvent] = useState(null);
    const [copyError, setCopyError] = useState(null);
    const [copySelectedIds, setCopySelectedIds] = useState([]);
    const [copyAction, setCopyAction] = useState('copy'); // 'copy' | 'delete'
    const [viewOffset, setViewOffset] = useState(0);
    const [itemsPerView, setItemsPerView] = useState(6);
    const listContainerRef = useRef(null);

    // Reset offset when events change length
    useEffect(() => {
        if (viewOffset > Math.max(0, events.length - itemsPerView)) {
            setViewOffset(Math.max(0, events.length - itemsPerView));
        }
    }, [events.length, itemsPerView]);

    const calculateItems = () => {
        const container = listContainerRef.current;
        if (!container) return;

        // Use slight buffer to avoid rounding errors
        const effectiveHeight = container.clientHeight;

        // TIGHTER HEIGHT CONSTANTS
        // py-1.5 = 6px * 2 = 12px
        // border = 2px
        // gap = 2px
        // Content: 2 lines of text (approx 16px*2) = 32px
        // Total Item approx: 48-50px. Let's assume 50px safe average including gap.
        const ITEM_HEIGHT = 46;
        const ARROW_HEIGHT = 20; // Height of the arrow button

        // 1. Calculate max items assuming NO buttons
        const maxItemsNoButtons = Math.floor(effectiveHeight / ITEM_HEIGHT);

        // 2. If all events fit without buttons, just use that
        if (events.length <= maxItemsNoButtons) {
            setItemsPerView(Math.max(1, maxItemsNoButtons));
            return;
        }

        // 3. If they don't fit, we need buttons (top and bottom)
        const heightForButtons = ARROW_HEIGHT * 2;
        const remainingHeight = effectiveHeight - heightForButtons;

        // 4. Calculate how many fit in the remaining space
        const maxItemsWithButtons = Math.floor(remainingHeight / ITEM_HEIGHT);

        // Ensure at least 1 item is shown
        setItemsPerView(Math.max(1, maxItemsWithButtons));
    };

    // Observer for resize (ResizeObserver covers window resize too)
    useEffect(() => {
        if (!listContainerRef.current) return;
        const observer = new ResizeObserver(calculateItems);
        observer.observe(listContainerRef.current);

        calculateItems(); // Initial

        return () => observer.disconnect();
    }, [events.length]); // Re-calc if events count changes (to toggle buttons/no-buttons mode)

    const handleScrollUp = () => setViewOffset(p => Math.max(0, p - 1));
    const handleScrollDown = () => setViewOffset(p => Math.min(Math.max(0, events.length - itemsPerView), p + 1));

    const submitCopyEvent = async () => {
        if (copySelectedIds.length === 0) return;
        try {
            for (const targetProfileId of copySelectedIds) {
                const targetProfile = profiles.find(p => p.id === targetProfileId);
                if (!targetProfile) continue;
                const targetInputs = targetProfile.data || {};
                const targetEvents = targetInputs.lifeEvents || [];
                let updatedEvents;
                if (copyAction === 'delete') {
                    updatedEvents = targetEvents.filter(e => !(e.description === copyingEvent.description && e.type === copyingEvent.type));
                } else {
                    const newEvent = { ...copyingEvent, id: Date.now().toString() + targetProfileId };
                    updatedEvents = [...targetEvents, newEvent];
                }
                await updateProfile(targetProfileId, { ...targetInputs, lifeEvents: updatedEvents });
            }
            setCopyingEvent(null);
            setCopySelectedIds([]);
            setCopyAction('copy');
        } catch(e) {
            console.error(e);
            setCopyError(t ? t('copyEventError') : 'Error copying event');
        }
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
        setEditingEvent(null);
        setShowAddModal(false);
    };

    const handleEditEventAll = async (eventData) => {
        // Save to current profile first
        handleEditEvent(eventData);
        // Then propagate to all other profiles that have an event with the same description+type
        if (!profiles || !updateProfile) return;
        const otherProfiles = profiles.filter(p => !['tmp','guest','debug'].includes(p.id) && p.id !== currentProfileId);
        for (const profile of otherProfiles) {
            const targetEvents = profile.data?.lifeEvents || [];
            const idx = targetEvents.findIndex(e => e.description === editingEvent.description && e.type === editingEvent.type);
            if (idx < 0) continue;
            const updated = [...targetEvents];
            updated[idx] = { ...eventData, id: updated[idx].id, enabled: updated[idx].enabled };
            await updateProfile(profile.id, { ...profile.data, lifeEvents: updated });
        }
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
            <div className={`${classes.container} rounded-xl p-2 flex-1 min-h-0 flex flex-col`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Calendar className={`w-4 h-4 ${classes.icon}`} />
                        <label className={`text-xs font-medium ${classes.headerLabel} whitespace-nowrap flex items-center`}>
                            {t ? t('lifeEventsTimeline') : 'Life Events Timeline'}
                            {events.length > 0 && (
                                <span dir="ltr" className="mx-2 px-2 py-0.5 bg-white/10 rounded-full text-[10px] text-gray-300 font-normal">
                                    {itemsPerView < events.length ?
                                        `${viewOffset + 1}-${Math.min(events.length, viewOffset + itemsPerView)} / ${events.length}`
                                        : events.length}
                                </span>
                            )}
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowTimelineModal(true)}
                            className={`${classes.buttonSecondary} rounded px-2 py-1 text-xs flex items-center gap-1 whitespace-nowrap`}
                            title={t ? t('viewTimeline') : 'Timeline'}
                            aria-label={t ? t('viewTimeline') : 'Timeline'}
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
                <div ref={listContainerRef} className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
                    {events.length === 0 ? (
                        <div className={`text-center py-4 ${classes.label} text-xs`}>
                            {t ? t('noEventsYet') : 'No life events added yet. Click "Add" to create one.'}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-between" translate="no">

                            {/* UP ARROW - Visible only if needed (more events than fits) */}
                            {events.length > itemsPerView && (
                                <button
                                    onClick={handleScrollUp}
                                    disabled={viewOffset === 0}
                                    className={`w-full flex-none h-5 flex items-center justify-center rounded transition-colors ${viewOffset === 0 ? 'opacity-0 cursor-default' : 'hover:bg-white/10 text-blue-400'}`}
                                >
                                    <ChevronUp size={16} />
                                </button>
                            )}

                            {/* ITEM LIST */}
                            <div className="flex-1 space-y-0.5 mt-0.5">
                                {[...events].sort((a, b) => {
                                    const ay = a.startDate?.year ?? 9999, am = a.startDate?.month ?? 1;
                                    const by = b.startDate?.year ?? 9999, bm = b.startDate?.month ?? 1;
                                    return ay !== by ? ay - by : am - bm;
                                }).slice(viewOffset, viewOffset + itemsPerView).map(event => (
                                    <div
                                        key={event.id}
                                        className={`${classes.container} border ${event.enabled ? classes.border : 'border-gray-600'} rounded-lg px-2 py-1.5 ${!event.enabled ? 'opacity-50' : ''} select-none h-[48px] flex flex-col justify-center`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                {getEventIcon(event.type)}
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-xs font-medium ${classes.headerLabel} truncate leading-tight`}>
                                                        {event.description || getEventTypeLabel(event.type)}
                                                    </div>
                                                    <div className={`text-[10px] ${classes.label} flex flex-wrap items-center gap-1 leading-tight mt-0.5`}>
                                                        <span>{formatDate(event.startDate)}</span>
                                                        {event.endDate && <span>→ {formatDate(event.endDate)}</span>}
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
                                                    aria-label={event.enabled ? (t ? t('disable') : 'Disable') : (t ? t('enable') : 'Enable')}
                                                >
                                                    {event.enabled ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                                                </button>
                                                <button
                                                    onClick={() => { setCopyError(null); setCopyingEvent(event); }}
                                                    className={`p-1 rounded hover:bg-white/10 ${classes.icon}`}
                                                    title={t ? t('copyEventToProfile') : 'Copy Event to Profile'}
                                                    aria-label={t ? t('copyEventToProfile') : 'Copy Event to Profile'}
                                                >
                                                    <Copy className="w-4 h-4 text-blue-400" />
                                                </button>
                                                <button
                                                    onClick={() => setEditingEvent(event)}
                                                    className={`p-1 rounded hover:bg-white/10 ${classes.icon}`}
                                                    title={t ? t('edit') : 'Edit'}
                                                    aria-label={t ? t('edit') : 'Edit'}
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteEvent(event.id)}
                                                    className={`p-1 rounded hover:bg-white/10 text-red-500`}
                                                    title={t ? t('delete') : 'Delete'}
                                                    aria-label={t ? t('delete') : 'Delete'}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* DOWN ARROW */}
                            {events.length > itemsPerView && (
                                <button
                                    onClick={handleScrollDown}
                                    disabled={viewOffset + itemsPerView >= events.length}
                                    className={`w-full flex-none h-5 flex items-center justify-center rounded transition-colors ${viewOffset + itemsPerView >= events.length ? 'opacity-0 cursor-default' : 'hover:bg-white/10 text-blue-400'}`}
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
                setCopyingEvent={setCopyingEvent}
            />

            {/* Add/Edit Modal - only render here when timeline is closed */}
            {
                (showAddModal || editingEvent) && !showTimelineModal && (
                    <AddEventModal
                        key={`${language}-${editingEvent?.id || 'new'}`}
                        event={editingEvent}
                        events={events}
                        onSave={editingEvent?.id ? handleEditEvent : handleAddEvent}
                        onSaveAll={editingEvent?.id ? handleEditEventAll : undefined}
                        onCancel={() => {
                            setShowAddModal(false);
                            setEditingEvent(null);
                        }}
                        t={t}
                        language={language}
                        currentAge={currentAge}
                        retirementAge={retirementAge}
                        retirementEndAge={retirementEndAge}
                        birthDate={birthDate}
                    />
                )
            }

            {/* Copy/Delete Event Modal */}
            {copyingEvent && (() => {
                const allProfiles = (profiles || []).filter(p => !['tmp','guest','debug'].includes(p.id) && p.id !== currentProfileId);
                const eligibleProfiles = copyAction === 'copy'
                    ? allProfiles.filter(p => !(p.data?.lifeEvents || []).some(e => e.description === copyingEvent.description && e.type === copyingEvent.type))
                    : allProfiles.filter(p => (p.data?.lifeEvents || []).some(e => e.description === copyingEvent.description && e.type === copyingEvent.type));
                const allSelected = eligibleProfiles.length > 0 && eligibleProfiles.every(p => copySelectedIds.includes(p.id));
                const toggleAll = () => setCopySelectedIds(allSelected ? [] : eligibleProfiles.map(p => p.id));
                const toggleOne = (id) => setCopySelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                const isDelete = copyAction === 'delete';
                return (
                    <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center backdrop-blur-sm" onClick={() => { setCopyingEvent(null); setCopySelectedIds([]); setCopyAction('copy'); }}>
                        <div className={`relative overflow-hidden w-full max-w-sm rounded-xl shadow-2xl border ${classes.isLight ? 'bg-white border-gray-200' : 'border-white/20'}`} onClick={e => e.stopPropagation()} dir={language === 'he' ? 'rtl' : 'ltr'}>
                            {!classes.isLight && (
                                <>
                                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-indigo-950" />
                                    <div className="absolute inset-0 bg-white/5" />
                                </>
                            )}
                            <div className="relative z-10 flex flex-col p-5">
                                {/* Event summary */}
                                <div className={`p-3 rounded-xl mb-4 ${classes.isLight ? 'bg-gray-50 border border-gray-100' : 'bg-black/20 border border-white/10'}`}>
                                    <p className={`text-sm font-bold ${classes.headerLabel}`}>{copyingEvent.description || getEventTypeLabel(copyingEvent.type)}</p>
                                    <p className={`text-sm mt-1 ${classes.isLight ? 'text-blue-600' : 'text-blue-400'} font-bold`}>{formatAmount(copyingEvent)}</p>
                                </div>

                                {/* Action toggle */}
                                <div className={`flex rounded-lg overflow-hidden border mb-4 ${classes.isLight ? 'border-gray-200' : 'border-white/10'}`}>
                                    <button
                                        onClick={() => { setCopyAction('copy'); setCopySelectedIds([]); }}
                                        className={`flex-1 py-2 text-sm font-bold transition-colors flex items-center justify-center gap-2 ${!isDelete ? 'bg-blue-600 text-white' : (classes.isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-gray-400 hover:bg-white/5')}`}
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                        {language === 'he' ? 'העתק' : 'Copy'}
                                    </button>
                                    <button
                                        onClick={() => { setCopyAction('delete'); setCopySelectedIds([]); }}
                                        className={`flex-1 py-2 text-sm font-bold transition-colors flex items-center justify-center gap-2 ${isDelete ? 'bg-red-600 text-white' : (classes.isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-gray-400 hover:bg-white/5')}`}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        {language === 'he' ? 'מחק' : 'Delete'}
                                    </button>
                                </div>

                                {/* Profile list */}
                                <label className={`text-xs font-bold block mb-2 ${classes.label}`}>
                                    {language === 'he' ? 'בחר פרופילים:' : 'Select profiles:'}
                                </label>
                                {eligibleProfiles.length === 0 ? (
                                    <p className={`text-sm py-2 ${classes.label}`}>
                                        {isDelete
                                            ? (language === 'he' ? 'האירוע לא קיים באף פרופיל אחר' : 'Event not found in any other profile')
                                            : (language === 'he' ? 'האירוע כבר קיים בכל הפרופילים' : 'Event already exists in all profiles')}
                                    </p>
                                ) : (
                                    <div className={`rounded-lg border divide-y ${classes.isLight ? 'border-gray-200 divide-gray-100' : 'border-white/10 divide-white/5'}`}>
                                        <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5">
                                            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-blue-500" />
                                            <span className={`text-sm font-bold ${classes.headerLabel}`}>{language === 'he' ? 'כל הפרופילים' : 'All profiles'}</span>
                                        </label>
                                        {eligibleProfiles.map(p => (
                                            <label key={p.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5">
                                                <input type="checkbox" checked={copySelectedIds.includes(p.id)} onChange={() => toggleOne(p.id)} className="w-4 h-4 accent-blue-500" />
                                                <span className={`text-sm ${classes.label}`}>{p.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                                {copyError && (
                                    <div className={`mt-3 rounded-lg p-3 text-sm ${classes.isLight ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-red-500/20 border border-red-500 text-red-200'}`}>{copyError}</div>
                                )}
                                <div className={`flex justify-end gap-3 text-sm mt-5 pt-4 border-t ${classes.border}`}>
                                    <button onClick={() => { setCopyingEvent(null); setCopySelectedIds([]); setCopyAction('copy'); }} className={`px-4 py-2 rounded-lg font-bold transition-colors ${classes.buttonSecondary}`}>
                                        {t ? t('cancel') : 'Cancel'}
                                    </button>
                                    <button onClick={submitCopyEvent} disabled={copySelectedIds.length === 0} className={`px-5 py-2 rounded-lg disabled:opacity-40 text-white font-bold transition-colors flex items-center gap-2 ${isDelete ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
                                        {isDelete ? <Trash2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        {isDelete
                                            ? (language === 'he' ? `מחק (${copySelectedIds.length})` : `Delete (${copySelectedIds.length})`)
                                            : (language === 'he' ? `העתק (${copySelectedIds.length})` : `Copy (${copySelectedIds.length})`)}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div >
    );
}
