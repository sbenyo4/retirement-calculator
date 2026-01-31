
import { useState, useEffect } from 'react';
import { DEFAULT_INPUTS } from '../constants';
import { normalizeInputs } from '../utils/profileUtils';
import { createDefaultIncomeSources } from '../utils/pensionCalculator';
import { useAuth } from '../contexts/AuthContext';
import { safeLocalStorageSetJSON, safeLocalStorageGetJSON } from '../utils/storage';

export function useRetirementData() {
    const { currentUser } = useAuth();

    // Initialize inputs - load from last session or profile
    const [inputs, setInputs] = useState(() => {
        let loadedInputs = null;

        // 1. Try to load from current session persistence
        const curId = currentUser?.uid || 'guest';
        const sessionKey = `retirementInputs_current_${curId}`;
        const savedSession = safeLocalStorageGetJSON(sessionKey, null);

        if (savedSession) {
            loadedInputs = normalizeInputs(savedSession);
        }

        // 2. Fallback to last explicitly loaded profile
        if (!loadedInputs) {
            const lastProfileId = localStorage.getItem(`lastLoadedProfile_${curId}`);
            if (lastProfileId) {
                // Find the profiles storage key(s)
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key?.startsWith('retirementProfiles_')) {
                        const profiles = safeLocalStorageGetJSON(key, []);
                        const profile = profiles.find(p => p.id === lastProfileId);
                        if (profile?.data) {
                            loadedInputs = normalizeInputs(profile.data);
                            break;
                        }
                    }
                }
            }
        }

        // 3. Normalize defaults if nothing loaded
        loadedInputs = loadedInputs || normalizeInputs({});

        // 4. OVERRIDE: Load global pension sources (not profile specific)
        const globalPensionKey = `retirementGlobal_pensionSources_${curId}`;
        const pensionSources = safeLocalStorageGetJSON(globalPensionKey, null);

        if (Array.isArray(pensionSources)) {
            // Check if National Insurance exists
            const niExists = pensionSources.some(s => s.type === 'nationalInsurance');

            if (!niExists) {
                // Generate default NI source if missing
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

        return loadedInputs;
    });

    // Inputs are automatically saved to localStorage whenever they change
    useEffect(() => {
        const curId = currentUser?.uid || 'guest';

        // Save full inputs for session
        safeLocalStorageSetJSON(`retirementInputs_current_${curId}`, inputs);

        // Save pension sources GLOBALLY (separate from profile/session)
        if (inputs.pensionIncomeSources) {
            safeLocalStorageSetJSON(`retirementGlobal_pensionSources_${curId}`, inputs.pensionIncomeSources);
        }
    }, [inputs, currentUser]);

    /**
     * Safe wrapper for setInputs that preserves pension sources during partial updates.
     *
     * BEHAVIOR:
     * - If update OMITS pensionIncomeSources (undefined/null): PRESERVE previous value
     * - If update SETS pensionIncomeSources to []: ALLOW clear (intentional)
     * - If update SETS pensionIncomeSources to [...]: USE new value
     *
     * WHY: Most form updates (age, savings, rates) don't touch pension sources.
     * Without this protection, spreading partial objects would lose pension data.
     *
     * TO INTENTIONALLY CLEAR: setInputs(prev => ({ ...prev, pensionIncomeSources: [] }))
     * TO PRESERVE (DEFAULT):  setInputs(prev => ({ ...prev, currentAge: 50 }))
     */
    const safeSetInputs = (update) => {
        setInputs(prev => {
            // Calculate new value based on whether update is function or value
            const next = typeof update === 'function' ? update(prev) : update;

            // Preserve pension sources if:
            // 1. Previous state had pension sources
            // 2. Next state has undefined/null (field was omitted, not cleared)
            const prevHasPensions = Array.isArray(prev.pensionIncomeSources) && prev.pensionIncomeSources.length > 0;
            const nextOmittedPensions = next.pensionIncomeSources === undefined || next.pensionIncomeSources === null;

            if (prevHasPensions && nextOmittedPensions) {
                return { ...next, pensionIncomeSources: prev.pensionIncomeSources };
            }

            return next;
        });
    };

    return { inputs, setInputs: safeSetInputs };
}
