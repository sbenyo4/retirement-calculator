
import { useState, useEffect } from 'react';
import { DEFAULT_INPUTS } from '../constants';
import { normalizeInputs } from '../utils/profileUtils';
import { useAuth } from '../contexts/AuthContext';

export function useRetirementData() {
    const { currentUser } = useAuth();

    // Initialize inputs - load from last session or profile
    const [inputs, setInputs] = useState(() => {
        // 1. Try to load from current session persistence
        const curId = currentUser?.uid || 'guest';
        const sessionKey = `retirementInputs_current_${curId}`;
        const savedSession = localStorage.getItem(sessionKey);
        if (savedSession) {
            try {
                return normalizeInputs(JSON.parse(savedSession));
            } catch (e) {
                console.error('Error loading session inputs:', e);
            }
        }

        // 2. Fallback to last explicitly loaded profile
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
                            return normalizeInputs(profile.data);
                        }
                    } catch (e) {
                        console.error('Error loading profile:', e);
                    }
                }
            }
        }

        return normalizeInputs({});
    });

    // Inputs are automatically saved to localStorage whenever they change
    useEffect(() => {
        const curId = currentUser?.uid || 'guest';
        localStorage.setItem(`retirementInputs_current_${curId}`, JSON.stringify(inputs));
    }, [inputs, currentUser]);

    return { inputs, setInputs };
}
