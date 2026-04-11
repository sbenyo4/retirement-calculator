import { useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_INPUTS } from '../constants';
import { normalizeInputs } from '../utils/profileUtils';
import { createDefaultIncomeSources } from '../utils/pensionCalculator';
import { useAuth } from '../contexts/AuthContext';
import {
    getPensionSources,
    setPensionSources,
    getProfiles,
    getUserSettings
} from '../utils/db';

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
                }

                // 2. Fetch the ID of the last active profile
                const settings = await getUserSettings(uid);
                const lastProfileId = settings?.lastLoadedProfileId;

                // 3. If there is a last loaded profile, apply it
                if (lastProfileId) {
                    const profiles = await getProfiles(uid);
                    const lastProfile = profiles.find(p => p.id === lastProfileId);
                    
                    if (lastProfile && lastProfile.data) {
                        const profileData = normalizeInputs(lastProfile.data);
                        // Merge the explicit data with the newly fetched global pension sources
                        baseInputs = {
                            ...profileData,
                            pensionIncomeSources: baseInputs.pensionIncomeSources,
                            ...(baseInputs.pensionInterestRate !== undefined
                                ? { pensionInterestRate: baseInputs.pensionInterestRate }
                                : {})
                        };
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

    // The auto-save debounce effect was intentionally removed to prevent overwriting
    // the user's manual changes on refresh or navigation.

    /**
     * Explicitly save global pension sources and optional interest rate.
     */
    const saveGlobalPension = useCallback(async (sources, interestRate) => {
        if (!uid || !sources) return;
        try {
            const dataToSave = { sources };
            if (interestRate !== undefined) {
                dataToSave.interestRate = interestRate;
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
