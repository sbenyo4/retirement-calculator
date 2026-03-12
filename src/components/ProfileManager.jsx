import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Save, Trash2, Upload, RotateCcw, Pencil, Check, X } from 'lucide-react';
import { CustomSelect } from './common/CustomSelect';
import { DEFAULT_INPUTS } from '../constants';
import { deepEqual } from '../hooks/useDeepCompare';
import { normalizeInputs, getDetailedDiff } from '../utils/profileUtils';

import { calculateAgeFromDate } from '../utils/dateUtils';

export function ProfileManager({ currentInputs, onLoad, t, language, profiles, onSaveProfile, onUpdateProfile, onRenameProfile, onDeleteProfile, onProfileLoad, lastLoadedProfileId, onSaveGlobalPension }) {
    const [newProfileName, setNewProfileName] = useState('');
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [saveMessage, setSaveMessage] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameInput, setRenameInput] = useState('');

    // Sync selectedProfileId with lastLoadedProfileId on mount/change
    useEffect(() => {
        if (lastLoadedProfileId) {
            setSelectedProfileId(lastLoadedProfileId);
        }
    }, [lastLoadedProfileId]);

    const { theme } = useTheme();
    const isLight = theme === 'light';

    // Theme-aware styles
    const inputClass = isLight
        ? "bg-white border border-slate-400 text-gray-900 placeholder-gray-500 shadow-sm focus:ring-blue-500"
        : "bg-black/20 border border-white/50 text-white placeholder-gray-500 focus:ring-blue-500";

    const selectClass = isLight
        ? "bg-white border border-slate-400 text-gray-900 shadow-sm focus:ring-blue-500"
        : "bg-black/20 border border-white/50 text-white focus:ring-blue-500";

    const optionClass = isLight ? "bg-white text-gray-900" : "bg-gray-800 text-white";

    // Track the last known database state of the currently selected profile.
    // This allows us to safely pull in background database updates (like latency-resolving Firebased syncs)
    // IF the user hasn't made any manual unsaved changes to the form. 
    const [lastKnownDbSnapshot, setLastKnownDbSnapshot] = useState(null);

    // Normalize currentInputs to ensure types match (Strings -> Numbers) before comparison
    const normalizedCurrent = currentInputs ? normalizeInputs(currentInputs) : null;

    const stripComputedFields = (data) => {
        if (!data) return null;
        // eslint-disable-next-line no-unused-vars
        const { pensionIncomeSources, ...rest } = data;
        
        // 1. Handle strategy/VR mutual exclusivity for comparison.
        // The UI treats strategies (Fixed, 4%, etc.) and Variable Rates as
        // mutually exclusive modes. When one is active, the other's fields
        // are irrelevant and should be ignored to prevent false diffs.
        const isEmptyObj = (obj) => !obj || typeof obj !== 'object' || Object.keys(obj).length === 0;
        const vrEnabled = rest.variableRatesEnabled;

        if (vrEnabled) {
            // VR mode: the specific strategy/percentage fields are irrelevant
            delete rest.withdrawalStrategy;
            delete rest.withdrawalPercentage;
            // Strip empty rate objects (VR on but no custom rates defined)
            if (isEmptyObj(rest.variableRates)) delete rest.variableRates;
        } else {
            // Standard strategy mode: variable rate data is irrelevant
            delete rest.variableRates;
            if (rest.withdrawalStrategy !== 'percentage') {
                delete rest.withdrawalPercentage;
            }
        }

        // 2. Ignore bucket-specific settings if buckets are disabled
        if (!rest.enableBuckets) {
            delete rest.bucketSafeRate;
            delete rest.bucketSurplusRate;
            delete rest.safeVariableRates;
            delete rest.surplusVariableRates;
        } else {
            // Even with buckets enabled, secondary VR rates only matter when VR is on
            if (!vrEnabled) {
                delete rest.safeVariableRates;
                delete rest.surplusVariableRates;
            } else {
                if (isEmptyObj(rest.safeVariableRates)) delete rest.safeVariableRates;
                if (isEmptyObj(rest.surplusVariableRates)) delete rest.surplusVariableRates;
            }
        }

        // 3. Strip UI meta-flags (the effective mode is encoded by which fields remain)
        delete rest.variableRatesEnabled;
        delete rest.manualAge;

        // 5. Normalize lifeEvents to prevent false mismatches (undefined vs [])
        if (!rest.lifeEvents) {
            rest.lifeEvents = [];
        } else if (Array.isArray(rest.lifeEvents)) {
            rest.lifeEvents = rest.lifeEvents.map(event => {
                // If it's a linked event, App.jsx will RE-CALCULATE the startDate on every render/profile load.
                // We MUST ignore startDate for these events to avoid immediate "Unsaved Changes" on load.
                if (event.linkedTo) {
                    const { startDate, ...eventRest } = event;
                    return eventRest;
                }
                return event;
            });
        }
        
        return rest;
    };
    
    // Auto-sync background updates from Firebase
    useEffect(() => {
        if (!selectedProfileId || !profiles || !normalizedCurrent) return;

        const dbProfile = profiles.find(p => p.id === selectedProfileId);
        if (!dbProfile || !dbProfile.data) return;

        const currentDbData = normalizeInputs(dbProfile.data);
        
        // If we just loaded a new profile, set the initial baseline
        if (!lastKnownDbSnapshot || lastKnownDbSnapshot.id !== selectedProfileId) {
            setLastKnownDbSnapshot({ id: selectedProfileId, data: currentDbData });
            return;
        }

        // Did the background database change from what we last knew it was?
        const isDbUpdated = !deepEqual(stripComputedFields(currentDbData), stripComputedFields(lastKnownDbSnapshot.data));
        
        if (isDbUpdated) {
            // Did the user modify the inputs manually? (Does Current == Last Known DB)
            const hasUserMadeChanges = !deepEqual(stripComputedFields(normalizedCurrent), stripComputedFields(lastKnownDbSnapshot.data));
            
            if (!hasUserMadeChanges) {
                // The user hasn't touched the form, BUT the background database updated!
                // This happens if a Firestore network request was delayed/reverted and just succeeded.
                // We should silently pull these new DB changes into the active UI state.
                const globalPension = getGlobalPensionSources();
                onLoad({
                    ...currentDbData,
                    pensionIncomeSources: globalPension.length > 0 ? globalPension : (currentInputs?.pensionIncomeSources || [])
                });
                
                // Update our tracker so we don't loop
                setLastKnownDbSnapshot({ id: selectedProfileId, data: currentDbData });
            } else {
                // User HAS made changes, AND the database changed.
                // We shouldn't ruthlessly overwrite the user's manual work.
                // However, we still update the baseline so the UI calculates "Unsaved Changes" against the newest truth.
                setLastKnownDbSnapshot({ id: selectedProfileId, data: currentDbData });
            }
        }
    }, [profiles, selectedProfileId, normalizedCurrent, lastKnownDbSnapshot, currentInputs]);

    const saveProfile = () => {
        if (!newProfileName.trim()) return;
        // Decouple pension data: don't save it to profile
        const { pensionIncomeSources, ...dataToSave } = currentInputs;

        const newProfile = onSaveProfile(newProfileName, dataToSave);
        if (onSaveGlobalPension && pensionIncomeSources) {
            onSaveGlobalPension(pensionIncomeSources);
        }
        
        setNewProfileName('');
        setSelectedProfileId(newProfile.id);
        showMessage(language === 'he' ? 'פרופיל נשמר!' : 'Profile saved!');
    };

    const updateProfile = () => {
        if (!selectedProfileId) return;
        // Decouple pension data: don't save it to profile
        const { pensionIncomeSources, ...dataToSave } = currentInputs;

        onUpdateProfile(selectedProfileId, dataToSave);
        if (onSaveGlobalPension && pensionIncomeSources) {
            onSaveGlobalPension(pensionIncomeSources);
        }
        
        showMessage(language === 'he' ? 'פרופיל עודכן!' : 'Profile updated!');
    };

    const handleStartRename = () => {
        const profile = profiles.find(p => p.id === selectedProfileId);
        if (profile) {
            setRenameInput(profile.name);
            setIsRenaming(true);
        }
    };

    const handleRankRename = () => {
        if (!renameInput.trim()) return;
        onRenameProfile(selectedProfileId, renameInput);
        setIsRenaming(false);
        setRenameInput('');
        showMessage(language === 'he' ? 'שם פרופיל שונה!' : 'Profile renamed!');
    };

    const handleCancelRename = () => {
        setIsRenaming(false);
        setRenameInput('');
    };

    const getGlobalPensionSources = () => {
        // Pension sources are now loaded from Firestore via useRetirementData
        // Just return the current pension sources from the inputs prop
        if (Array.isArray(currentInputs?.pensionIncomeSources) && currentInputs.pensionIncomeSources.length > 0) {
            return currentInputs.pensionIncomeSources;
        }
        return [];
    };

    const reloadProfile = () => {
        if (!selectedProfileId) return;
        const profile = profiles.find(p => p.id === selectedProfileId);
        if (profile) {
            const data = normalizeInputs(profile.data);
            // MERGE: Keep current global pension sources from storage
            const globalPension = getGlobalPensionSources();
            onLoad({
                ...data,
                pensionIncomeSources: globalPension.length > 0 ? globalPension : (currentInputs?.pensionIncomeSources || [])
            });
            showMessage(language === 'he' ? 'פרופיל נטען מחדש!' : 'Profile reloaded!');
        }
    };

    const showMessage = (msg) => {
        setSaveMessage(msg);
        setTimeout(() => setSaveMessage(''), 2000);
    };

    const deleteProfile = (id) => {
        onDeleteProfile(id);
        if (selectedProfileId === id) setSelectedProfileId('');
    };

    const loadProfile = (id) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            const data = normalizeInputs(profile.data);
            // MERGE: Keep current global pension sources from storage
            const globalPension = getGlobalPensionSources();
            onLoad({
                ...data,
                pensionIncomeSources: globalPension.length > 0 ? globalPension : (currentInputs?.pensionIncomeSources || [])
            });
            setSelectedProfileId(id);
            // We NO LONGER set comparisonSnapshot here manually.
            // When App.jsx receives onLoad, it updates `currentInputs` and passes it back down.
            // Our new useEffect above will intercept the first render with the new profile 
            // and set the snapshot perfectly aligned with App's normalized state.

            // Persist this as the last loaded profile
            if (onProfileLoad) {
                onProfileLoad(id);
            }
        }
    };

    // Determine hasChanges dynamically from the database profile
    // This perfectly handles external updates (like event copying) and ignores App.jsx's 
    // internal race conditions, because we just check if our current layout matches the db.
    let hasChanges = false;
    let differencesLog = [];
    if (selectedProfileId && profiles && normalizedCurrent) {
        const dbProfile = profiles.find(p => p.id === selectedProfileId);
        if (dbProfile && dbProfile.data) {
            const dbDataNormalized = normalizeInputs(dbProfile.data);
            const normStripped = stripComputedFields(normalizedCurrent);
            const dbStripped = stripComputedFields(dbDataNormalized);
            hasChanges = !deepEqual(normStripped, dbStripped);
            
            if (hasChanges) {
                differencesLog = getDetailedDiff(normStripped, dbStripped);
                if (differencesLog.length > 0) {
                    console.info("[ProfileDebug] Unsaved Changes Detected in fields:", differencesLog);
                }
            }
        }
    }

    return (
        <div className="mb-2">
            <div className="flex flex-col gap-2">


                <div className="flex gap-2 items-center">
                    <input
                        type="text"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        placeholder={t('profileName')}
                        className={`flex-1 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 text-sm ${inputClass}`}
                    />
                    <button
                        onClick={saveProfile}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors text-sm"
                    >
                        <Save className="w-4 h-4" /> {t('save')}
                    </button>
                </div>

                {profiles.length > 0 && (
                    <div className="flex gap-2 items-center">
                        {isRenaming ? (
                            <div className="flex-1 flex items-center gap-1">
                                <input
                                    type="text"
                                    value={renameInput}
                                    onChange={(e) => setRenameInput(e.target.value)}
                                    className={`flex-1 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 text-sm ${inputClass}`}
                                    autoFocus
                                />
                                <button
                                    onClick={handleRankRename}
                                    className="bg-green-600 hover:bg-green-700 text-white p-1.5 rounded-lg transition-colors"
                                    title={t('saveName')}
                                >
                                    <Check className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={handleCancelRename}
                                    className="bg-gray-500 hover:bg-gray-600 text-white p-1.5 rounded-lg transition-colors"
                                    title={t('cancel')}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <CustomSelect
                                value={selectedProfileId}
                                onChange={(val) => loadProfile(val)}
                                options={[
                                    { value: "", label: `${t('loadProfile')}...` },
                                    ...profiles.map(p => ({ value: p.id, label: p.name }))
                                ]}
                                className="flex-1"
                            />
                        )}

                        {selectedProfileId && !isRenaming && (
                            <>
                                {/* Reload profile (discard changes) */}
                                <button
                                    onClick={reloadProfile}
                                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                                    title={language === 'he' ? 'טען מחדש (בטל שינויים)' : 'Reload (discard changes)'}
                                >
                                    <RotateCcw className="w-4 h-4" />
                                </button>
                                {/* Update/save changes to profile */}
                                <button
                                    onClick={() => {
                                        if (differencesLog.length > 0) {
                                            console.log("Unsaved changes being applied. Diff was:", differencesLog);
                                        }
                                        updateProfile();
                                    }}
                                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors relative"
                                    title={language === 'he' ? 'שמור שינויים לפרופיל' : 'Save changes to profile'}
                                >
                                    <Upload className="w-4 h-4" />
                                    {hasChanges && (
                                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                        </span>
                                    )}
                                </button>

                                {/* Rename Profile */}
                                <button
                                    onClick={handleStartRename}
                                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                                    title={t('rename')}
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>

                                <button
                                    onClick={() => deleteProfile(selectedProfileId)}
                                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                                    title={t('delete')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </>
                        )}
                    </div>
                )}

                <div className="min-h-6 flex flex-col gap-1">
                    {saveMessage && (
                        <div className="bg-green-600/20 border border-green-500 text-green-300 px-2 py-0.5 rounded text-xs text-center animate-fade-in">
                            {saveMessage}
                        </div>
                    )}

                    {!saveMessage && hasChanges && (
                        <div className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 px-2 py-0.5 rounded text-xs text-center flex items-center justify-center gap-2 animate-fade-in">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                            {language === 'he' ? 'שינויים לא שמורים' : 'Unsaved changes'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
