import { useState, useEffect, useRef, useCallback } from 'react';
import { DEFAULT_INPUTS } from '../constants';
import { normalizeInputs } from '../utils/profileUtils';
import { createDefaultIncomeSources } from '../utils/pensionCalculator';
import { useAuth } from '../contexts/AuthContext';
import {
    getCurrentSession,
    setCurrentSession,
    getPensionSources,
    setPensionSources
} from '../utils/db';

export function useRetirementData() {
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;

    const [inputs, setInputs] = useState(() => normalizeInputs({}));
    const [loaded, setLoaded] = useState(false);
    const debounceTimer = useRef(null);
    const isInitialLoad = useRef(true);

    // Load data from Firestore on mount / user change
    useEffect(() => {
        if (!uid) return;

        let cancelled = false;
        isInitialLoad.current = true;

        async function loadData() {
            try {
                // Load session inputs and pension sources in parallel
                const [sessionInputs, pensionSources] = await Promise.all([
                    getCurrentSession(uid),
                    getPensionSources(uid)
                ]);

                if (cancelled) return;

                let loadedInputs = sessionInputs
                    ? normalizeInputs(sessionInputs)
                    : normalizeInputs({});

                // Override with global pension sources
                if (Array.isArray(pensionSources)) {
                    // Check if National Insurance exists
                    const niExists = pensionSources.some(s => s.type === 'nationalInsurance');

                    if (!niExists) {
                        try {
                            const defaults = createDefaultIncomeSources(loadedInputs);
                            const niSource = defaults.find(s => s.type === 'nationalInsurance');
                            if (niSource) {
                                pensionSources.push(niSource);
                            }
                        } catch (err) {
                            console.error('Error recreating default NI source:', err);
                        }
                    }
                    loadedInputs.pensionIncomeSources = pensionSources;
                }

                setInputs(loadedInputs);
            } catch (err) {
                console.error('Error loading retirement data from Firestore:', err);
            } finally {
                if (!cancelled) {
                    setLoaded(true);
                    // Allow a tick for state to settle before enabling saves
                    setTimeout(() => { isInitialLoad.current = false; }, 100);
                }
            }
        }

        loadData();
        return () => { cancelled = true; };
    }, [uid]);

    // Debounced save to Firestore whenever inputs change
    useEffect(() => {
        if (!uid || !loaded || isInitialLoad.current) return;

        // Clear previous timer
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        debounceTimer.current = setTimeout(() => {
            // Save full inputs for session
            setCurrentSession(uid, inputs).catch(err => {
                console.error('Error saving session to Firestore:', err);
            });

            // Save pension sources separately (global)
            if (inputs.pensionIncomeSources) {
                setPensionSources(uid, inputs.pensionIncomeSources).catch(err => {
                    console.error('Error saving pension sources to Firestore:', err);
                });
            }
        }, 300);

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [inputs, uid, loaded]);

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

    return { inputs, setInputs: safeSetInputs };
}
