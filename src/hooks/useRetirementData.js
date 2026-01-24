
import { useState, useEffect } from 'react';
import { DEFAULT_INPUTS } from '../constants';
import { normalizeInputs } from '../utils/profileUtils';
import { createDefaultIncomeSources } from '../utils/pensionCalculator';
import { useAuth } from '../contexts/AuthContext';

export function useRetirementData() {
    const { currentUser } = useAuth();

    // Initialize inputs - load from last session or profile
    const [inputs, setInputs] = useState(() => {
        let loadedInputs = null;

        // 1. Try to load from current session persistence
        const curId = currentUser?.uid || 'guest';
        const sessionKey = `retirementInputs_current_${curId}`;
        const savedSession = localStorage.getItem(sessionKey);

        if (savedSession) {
            try {
                loadedInputs = normalizeInputs(JSON.parse(savedSession));
            } catch (e) {
                console.error('Error loading session inputs:', e);
            }
        }

        // 2. Fallback to last explicitly loaded profile
        if (!loadedInputs) {
            const lastProfileId = localStorage.getItem(`lastLoadedProfile_${curId}`);
            if (lastProfileId) {
                // Find the profiles storage key(s)
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key?.startsWith('retirementProfiles_')) {
                        try {
                            const profiles = JSON.parse(localStorage.getItem(key) || '[]');
                            const profile = profiles.find(p => p.id === lastProfileId);
                            if (profile?.data) {
                                loadedInputs = normalizeInputs(profile.data);
                                break;
                            }
                        } catch (e) {
                            console.error('Error loading profile:', e);
                        }
                    }
                }
            }
        }

        // 3. Normalize defaults if nothing loaded
        loadedInputs = loadedInputs || normalizeInputs({});

        // 4. OVERRIDE: Load global pension sources (not profile specific)
        const globalPensionKey = `retirementGlobal_pensionSources_${curId}`;
        try {
            const savedGlobalPension = localStorage.getItem(globalPensionKey);
            if (savedGlobalPension) {
                const pensionSources = JSON.parse(savedGlobalPension);
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
            }
        } catch (e) {
            console.error('Error loading global pension sources:', e);
        }

        return loadedInputs;
    });

    // Inputs are automatically saved to localStorage whenever they change
    useEffect(() => {
        const curId = currentUser?.uid || 'guest';

        // Save full inputs for session
        localStorage.setItem(`retirementInputs_current_${curId}`, JSON.stringify(inputs));

        // Save pension sources GLOBALLY (separate from profile/session)
        if (inputs.pensionIncomeSources) {
            localStorage.setItem(`retirementGlobal_pensionSources_${curId}`, JSON.stringify(inputs.pensionIncomeSources));
        }
    }, [inputs, currentUser]);

    // Wrap setInputs to ensure we never lose pension sources during partial updates
    const safeSetInputs = (update) => {
        setInputs(prev => {
            // Calculate new value based on whether update is function or value
            const next = typeof update === 'function' ? update(prev) : update;

            // Critical Check: If next state is missing pension sources, but prev had them, RESTORE THEM.
            // This prevents "disappearance" bugs when editing other fields.
            if (prev.pensionIncomeSources && (!next.pensionIncomeSources || next.pensionIncomeSources.length === 0) && prev.pensionIncomeSources.length > 0) {
                // But wait, what if the user INTENTIONALLY cleared them? 
                // The PensionModal handles clearing via setInputs explicitly. 
                // Standard form inputs (age, savings) should not touch this field.
                // So if it's missing, it's likely accidental.

                // However, we must be careful. If next.pensionIncomeSources is undefined/null, definitely restore.
                // If it's [], maybe they cleared it? 
                // Let's safe-guard: if it's strictly undefined or null, restore.
                if (next.pensionIncomeSources === undefined || next.pensionIncomeSources === null) {
                    return { ...next, pensionIncomeSources: prev.pensionIncomeSources };
                }
            }
            return next;
        });
    };

    return { inputs, setInputs: safeSetInputs };
}
