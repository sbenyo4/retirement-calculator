import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Save, Trash2, Upload, RotateCcw, Pencil, Check, X } from 'lucide-react';
import { CustomSelect } from './common/CustomSelect';
import { DEFAULT_INPUTS } from '../constants';
import { deepEqual } from '../hooks/useDeepCompare';
import { normalizeInputs } from '../utils/profileUtils';

export function ProfileManager({ currentInputs, onLoad, t, language, profiles, onSaveProfile, onUpdateProfile, onRenameProfile, onDeleteProfile, onProfileLoad, onActiveProfileChange, lastLoadedProfileId, onSaveGlobalPension }) {
    const [newProfileName, setNewProfileName] = useState('');
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [saveMessage, setSaveMessage] = useState('');
    const [savingAction, setSavingAction] = useState(null);
    const [savedProfileSnapshot, setSavedProfileSnapshot] = useState(null);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameInput, setRenameInput] = useState('');

    // Sync selectedProfileId with lastLoadedProfileId on mount/change
    useEffect(() => {
        if (lastLoadedProfileId) {
            setSelectedProfileId(lastLoadedProfileId);
        }
    }, [lastLoadedProfileId]);

    useEffect(() => {
        setSavedProfileSnapshot(null);
    }, [selectedProfileId]);

    const { theme } = useTheme();
    const isLight = theme === 'light';

    // Theme-aware styles
    const inputClass = isLight
        ? "bg-white border border-slate-400 text-gray-900 placeholder-gray-500 shadow-sm focus:ring-blue-500"
        : "bg-black/20 border border-white/50 text-white placeholder-gray-500 focus:ring-blue-500";
    const messages = {
        saving: language === 'he' ? '\u05e9\u05d5\u05de\u05e8...' : 'Saving...',
        profileSaved: language === 'he' ? '\u05d4\u05e4\u05e8\u05d5\u05e4\u05d9\u05dc \u05e0\u05e9\u05de\u05e8!' : 'Profile saved!',
        profileUpdated: language === 'he' ? '\u05d4\u05e4\u05e8\u05d5\u05e4\u05d9\u05dc \u05e2\u05d5\u05d3\u05db\u05df!' : 'Profile updated!',
        saveFailed: language === 'he' ? '\u05e9\u05de\u05d9\u05e8\u05ea \u05d4\u05e4\u05e8\u05d5\u05e4\u05d9\u05dc \u05e0\u05db\u05e9\u05dc\u05d4' : 'Profile save failed',
        updateFailed: language === 'he' ? '\u05e2\u05d3\u05db\u05d5\u05df \u05d4\u05e4\u05e8\u05d5\u05e4\u05d9\u05dc \u05e0\u05db\u05e9\u05dc' : 'Profile update failed'
    };

    // Track the last known database state of the currently selected profile.
    // This allows us to safely pull in background database updates (like latency-resolving Firebased syncs)
    // IF the user hasn't made any manual unsaved changes to the form. 
    const [lastKnownDbSnapshot, setLastKnownDbSnapshot] = useState(null);

    // Normalize currentInputs to ensure types match (Strings -> Numbers) before comparison
    const normalizedCurrent = useMemo(
        () => currentInputs ? normalizeInputs(currentInputs) : null,
        [currentInputs]
    );

    const getGlobalPensionSources = useCallback(() => {
        // Pension sources are loaded globally from Firestore via useRetirementData.
        if (Array.isArray(currentInputs?.pensionIncomeSources) && currentInputs.pensionIncomeSources.length > 0) {
            return currentInputs.pensionIncomeSources;
        }
        return [];
    }, [currentInputs?.pensionIncomeSources]);

    const stripComputedFields = (data) => {
        if (!data) return null;
        // eslint-disable-next-line no-unused-vars
        const {
            pensionIncomeSources,
            pensionInterestRate: _interestRate,
            pensionMaslekaSummary,
            pensionAIInsight,
            pensionOfficialRetirementAge: _officialAge,
            pensionManagerInsuranceAge: _managerAge,
            ...rest
        } = data;
        
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
                    const { startDate: _startDate, ...eventRest } = event;
                    return eventRest;
                }
                return event;
            });
        }
        
        return rest;
    };
    
    // Track background updates from Firebase without overwriting the active form.
    // Loading a profile is an explicit user action; passive snapshots must not
    // roll back unsaved UI state during profile updates.
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
            setLastKnownDbSnapshot({ id: selectedProfileId, data: currentDbData });
        }
    }, [profiles, selectedProfileId, normalizedCurrent, lastKnownDbSnapshot]);

    const buildProfileDataToSave = () => {
        // Strip all global-pension fields — these live in the pension document, not the profile.
        const {
            pensionIncomeSources,
            pensionInterestRate: _interestRate,
            pensionMaslekaSummary: _masleka,
            pensionAIInsight: _ai,
            pensionOfficialRetirementAge: _officialAge,
            pensionManagerInsuranceAge: _managerAge,
            ...dataToSave
        } = currentInputs;
        return {
            dataToSave: normalizeInputs(dataToSave),
            pensionIncomeSources
        };
    };

    const saveProfile = async () => {
        if (!newProfileName.trim()) return;
        setSavingAction('save');
        try {
            const { dataToSave, pensionIncomeSources } = buildProfileDataToSave();
            const newProfile = await onSaveProfile(newProfileName, dataToSave);
            if (!newProfile) {
                showMessage(messages.saveFailed);
                return;
            }
            if (onSaveGlobalPension && pensionIncomeSources) {
                await onSaveGlobalPension(pensionIncomeSources);
            }

            setNewProfileName('');
            setSelectedProfileId(newProfile.id);
            setSavedProfileSnapshot({ id: newProfile.id, data: dataToSave });
            if (onProfileLoad) {
                await onProfileLoad(newProfile.id);
            }
            showMessage(messages.profileSaved);
        } catch {
            showMessage(messages.saveFailed);
        } finally {
            setSavingAction(null);
        }
    };

    const updateProfile = async () => {
        if (!selectedProfileId) return;
        setSavingAction('update');
        try {
            const { dataToSave, pensionIncomeSources } = buildProfileDataToSave();
            const updatedProfile = await onUpdateProfile(selectedProfileId, dataToSave);
            if (onSaveGlobalPension && pensionIncomeSources) {
                await onSaveGlobalPension(pensionIncomeSources);
            }
            if (onProfileLoad) {
                await onProfileLoad(selectedProfileId);
            }
            setSavedProfileSnapshot({
                id: selectedProfileId,
                data: updatedProfile?.data ? normalizeInputs(updatedProfile.data) : dataToSave,
                aiInsights: updatedProfile?.aiInsights ?? null
            });

            showMessage(messages.profileUpdated);
        } catch {
            showMessage(messages.updateFailed);
        } finally {
            setSavingAction(null);
        }
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

    const reloadProfile = () => {
        if (!selectedProfileId) return;
        const profile = profiles.find(p => p.id === selectedProfileId);
        const savedSnapshot = savedProfileSnapshot?.id === selectedProfileId ? savedProfileSnapshot : null;
        if (profile || savedSnapshot) {
            const data = normalizeInputs(savedSnapshot?.data || profile.data);
            // MERGE: Keep current global pension sources and interest rate from storage
            const globalPension = getGlobalPensionSources();
            const payload = {
                ...data,
                pensionIncomeSources: globalPension.length > 0 ? globalPension : (currentInputs?.pensionIncomeSources || [])
            };
            if (currentInputs?.pensionInterestRate !== undefined) {
                payload.pensionInterestRate = currentInputs.pensionInterestRate;
            }
            if (currentInputs?.pensionOfficialRetirementAge !== undefined) {
                payload.pensionOfficialRetirementAge = currentInputs.pensionOfficialRetirementAge;
            }
            if (currentInputs?.pensionManagerInsuranceAge !== undefined) {
                payload.pensionManagerInsuranceAge = currentInputs.pensionManagerInsuranceAge;
            }
            // Masleka data lives in the pension document — preserve it across profile loads.
            if (currentInputs?.pensionMaslekaSummary != null) {
                payload.pensionMaslekaSummary = currentInputs.pensionMaslekaSummary;
            }
            onLoad(payload, savedSnapshot ? (savedSnapshot.aiInsights ?? null) : (profile.aiInsights ?? null));
            showMessage(language === 'he' ? 'פרופיל נטען מחדש!' : 'Profile reloaded!');
        }
    };

    const showMessage = (msg) => {
        setSaveMessage(msg);
        setTimeout(() => setSaveMessage(''), 2000);
    };

    const deleteProfile = (id) => {
        onDeleteProfile(id);
        if (selectedProfileId === id) {
            setSelectedProfileId('');
            if (onActiveProfileChange) {
                onActiveProfileChange(null);
            }
        }
    };

    const loadProfile = (id) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            const data = normalizeInputs(profile.data);
            // MERGE: Keep current global pension sources and interest rate from storage
            const globalPension = getGlobalPensionSources();
            const payload = {
                ...data,
                pensionIncomeSources: globalPension.length > 0 ? globalPension : (currentInputs?.pensionIncomeSources || [])
            };
            if (currentInputs?.pensionInterestRate !== undefined) {
                payload.pensionInterestRate = currentInputs.pensionInterestRate;
            }
            if (currentInputs?.pensionOfficialRetirementAge !== undefined) {
                payload.pensionOfficialRetirementAge = currentInputs.pensionOfficialRetirementAge;
            }
            if (currentInputs?.pensionManagerInsuranceAge !== undefined) {
                payload.pensionManagerInsuranceAge = currentInputs.pensionManagerInsuranceAge;
            }
            // Masleka data lives in the pension document — preserve it across profile loads.
            if (currentInputs?.pensionMaslekaSummary != null) {
                payload.pensionMaslekaSummary = currentInputs.pensionMaslekaSummary;
            }
            onLoad(payload, profile.aiInsights ?? null);
            setSelectedProfileId(id);
            if (onActiveProfileChange) {
                onActiveProfileChange(id);
            }
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
    if (selectedProfileId && profiles && normalizedCurrent) {
        const dbProfile = profiles.find(p => p.id === selectedProfileId);
        if (dbProfile && dbProfile.data) {
            const baselineData = savedProfileSnapshot?.id === selectedProfileId
                ? savedProfileSnapshot.data
                : dbProfile.data;
            const dbDataNormalized = normalizeInputs(baselineData);
            const normStripped = stripComputedFields(normalizedCurrent);
            const dbStripped = stripComputedFields(dbDataNormalized);
            hasChanges = !deepEqual(normStripped, dbStripped);
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
                        disabled={savingAction === 'save'}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-wait text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors text-sm"
                    >
                        <Save className="w-4 h-4" /> {savingAction === 'save' ? messages.saving : t('save')}
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
                                        updateProfile();
                                    }}
                                    disabled={savingAction === 'update'}
                                    className="bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-wait text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors relative"
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
