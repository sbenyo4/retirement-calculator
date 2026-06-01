import { useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_INPUTS } from '../constants';
import { normalizeInputs } from '../utils/profileUtils';
import { createDefaultIncomeSources } from '../utils/pensionCalculator';
import { useAuth } from '../contexts/AuthContext';
import {
    getPensionSources,
    setPensionSources,
    getProfiles,
    getUserSettings,
    getCurrentSessionData,
    setCurrentSession
} from '../utils/db';

export function selectLastProfileInputData(lastProfile, session) {
    if (!lastProfile?.data) return null;

    // Startup with a selected profile must hydrate from the saved profile data.
    // currentSession is a draft/continuity cache; letting it win here can open
    // stale inputs against a newer profile snapshot, which immediately shows
    // "unsaved changes" and hides the profile's saved AI insight state.
    return lastProfile.data;
}

export function useRetirementData() {
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;

    const [inputs, setInputs] = useState(() => normalizeInputs({}));
    const [inputsLoaded, setInputsLoaded] = useState(false);

    // Load data from Firestore on mount / user change
    useEffect(() => {
        if (!uid) {
            setInputsLoaded(false);
            return;
        }
        setInputsLoaded(false);

        let cancelled = false;

        async function loadData() {
            try {
                // Initialize empty inputs
                let baseInputs = normalizeInputs({});

                // 1. Fetch Global Pension Data
                const pensionData = await getPensionSources(uid);

                if (pensionData) {
                    let pensionSources = [];
                    if (Array.isArray(pensionData.sources)) {
                        pensionSources = pensionData.sources;
                    } else if (Array.isArray(pensionData)) {
                        pensionSources = pensionData;
                    }

                    if (Array.isArray(pensionSources)) {
                        pensionSources = pensionSources.filter(s => s != null);
                        const niExists = pensionSources.some(s => s.type === 'nationalInsurance');
                        if (!niExists) {
                            try {
                                const defaults = createDefaultIncomeSources(baseInputs);
                                const niSource = defaults.find(s => s.type === 'nationalInsurance');
                                if (niSource) pensionSources.push(niSource);
                            } catch (err) {
                                console.error('Error recreating default NI source:', err);
                            }
                        }
                        baseInputs.pensionIncomeSources = pensionSources;
                    }

                    if (pensionData.interestRate !== undefined) {
                        baseInputs.pensionInterestRate = pensionData.interestRate;
                    }
                    if (pensionData.officialRetirementAge !== undefined) {
                        baseInputs.pensionOfficialRetirementAge = pensionData.officialRetirementAge;
                    }
                    if (pensionData.managerInsuranceAge !== undefined) {
                        baseInputs.pensionManagerInsuranceAge = pensionData.managerInsuranceAge;
                    }
                    if (pensionData.aiInsight != null) {
                        baseInputs.pensionAIInsight = pensionData.aiInsight;
                    }
                    if (pensionData.maslekaSummary != null) {
                        baseInputs.pensionMaslekaSummary = pensionData.maslekaSummary;
                    }
                }

                // 2. Fetch the ID of the last active profile
                const settings = await getUserSettings(uid);
                const lastProfileId = settings?.lastLoadedProfileId;
                const session = await getCurrentSessionData(uid);

                const applyInputData = (inputData) => {
                    const normalizedData = normalizeInputs(inputData);
                    baseInputs = {
                        ...normalizedData,
                        pensionIncomeSources: baseInputs.pensionIncomeSources,
                        ...(baseInputs.pensionInterestRate !== undefined
                            ? { pensionInterestRate: baseInputs.pensionInterestRate }
                            : {}),
                        ...(baseInputs.pensionOfficialRetirementAge !== undefined
                            ? { pensionOfficialRetirementAge: baseInputs.pensionOfficialRetirementAge }
                            : {}),
                        ...(baseInputs.pensionManagerInsuranceAge !== undefined
                            ? { pensionManagerInsuranceAge: baseInputs.pensionManagerInsuranceAge }
                            : {}),
                        ...(baseInputs.pensionAIInsight != null
                            ? { pensionAIInsight: baseInputs.pensionAIInsight }
                            : {}),
                        ...(baseInputs.pensionMaslekaSummary != null
                            ? { pensionMaslekaSummary: baseInputs.pensionMaslekaSummary }
                            : {})
                    };
                };

                // 3. If there is a last loaded profile, apply it
                let loadedLastProfile = false;
                if (lastProfileId) {
                    const profiles = await getProfiles(uid);
                    const lastProfile = profiles.find(p => p.id === lastProfileId);

                    if (lastProfile && lastProfile.data) {
                        applyInputData(selectLastProfileInputData(lastProfile, session));
                        loadedLastProfile = true;
                    }
                }

                if (!loadedLastProfile) {
                    if (session?.inputs) {
                        applyInputData(session.inputs);
                    }
                }

                if (cancelled) return;

                setInputs(baseInputs);
                setInputsLoaded(true);
            } catch (err) {
                console.error('Error loading retirement data from Firestore:', err);
                if (!cancelled) setInputsLoaded(true); // unblock alerts even on error
            }
        }

        loadData();
        return () => { cancelled = true; };
    }, [uid]);

    // Auto-save the session whenever inputs change (after initial load).
    // This ensures unsaved changes (e.g. income schedule edits) survive login
    // even if the user never clicks "Update Profile".
    const lastSavedInputsRef = useRef(null);
    useEffect(() => {
        if (!uid || !inputsLoaded) return;

        // Skip writing if inputs haven't actually changed since last auto-save
        const {
            pensionIncomeSources,
            pensionInterestRate: _interestRate,
            pensionAIInsight,
            pensionMaslekaSummary,
            pensionOfficialRetirementAge: _officialAge,
            pensionManagerInsuranceAge: _managerAge,
            ...inputsToSave
        } = inputs;
        const normalized = normalizeInputs(inputsToSave);
        const serialized = JSON.stringify(normalized);
        if (lastSavedInputsRef.current === serialized) return;

        const timer = setTimeout(async () => {
            if (!uid) return;
            try {
                lastSavedInputsRef.current = serialized;
                await setCurrentSession(uid, normalized);
            } catch (err) {
                console.error('Session auto-save error:', err);
            }
        }, 1500);

        return () => clearTimeout(timer);
    }, [inputs, uid, inputsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Explicitly save global pension sources and optional interest rate.
     */
    const saveGlobalPension = useCallback(async (sources, interestRate, aiInsight, maslekaSummary, settings = {}) => {
        if (!uid || !sources) return;
        try {
            const dataToSave = { sources };
            if (interestRate !== undefined) {
                dataToSave.interestRate = interestRate;
            }
            if (settings.officialRetirementAge !== undefined) {
                dataToSave.officialRetirementAge = settings.officialRetirementAge;
            }
            if (settings.managerInsuranceAge !== undefined) {
                dataToSave.managerInsuranceAge = settings.managerInsuranceAge;
            }
            if (aiInsight != null) {
                dataToSave.aiInsight = JSON.parse(JSON.stringify(aiInsight));
            }
            if (maslekaSummary !== undefined) {
                dataToSave.maslekaSummary = maslekaSummary ? JSON.parse(JSON.stringify(maslekaSummary)) : null;
            }
            await setPensionSources(uid, dataToSave);
        } catch (err) {
            console.error('Error saving global pension sources:', err);
        }
    }, [uid]);

    /**
     * Safe wrapper for setInputs that preserves pension sources during partial updates.
     */
    const safeSetInputs = useCallback((update) => {
        setInputs(prev => {
            const next = typeof update === 'function' ? update(prev) : update;

            const prevHasPensions = Array.isArray(prev.pensionIncomeSources) && prev.pensionIncomeSources.length > 0;
            const nextOmittedPensions = next.pensionIncomeSources === undefined || next.pensionIncomeSources === null;

            if (prevHasPensions && nextOmittedPensions) {
                return { ...next, pensionIncomeSources: prev.pensionIncomeSources };
            }

            return next;
        });
    }, []);

    return { inputs, setInputs: safeSetInputs, saveGlobalPension, inputsLoaded };
}
