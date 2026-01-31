import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { safeLocalStorageSet, safeLocalStorageSetJSON, safeLocalStorageGetJSON, safeLocalStorageRemove } from '../utils/storage';

export function useProfiles() {
    const { currentUser } = useAuth();
    const [profiles, setProfiles] = useState([]);
    const [lastLoadedProfileId, setLastLoadedProfileId] = useState(null);
    const [profilesLoaded, setProfilesLoaded] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const storageKey = currentUser ? `retirementProfiles_${currentUser.uid}` : 'retirementProfiles_guest';
    const lastProfileKey = currentUser ? `lastLoadedProfile_${currentUser.uid}` : 'lastLoadedProfile_guest';

    useEffect(() => {
        setProfilesLoaded(false);

        // Load profiles
        const parsed = safeLocalStorageGetJSON(storageKey, []);
        if (Array.isArray(parsed)) {
            setProfiles(parsed);
        } else {
            console.error('Invalid profiles data in localStorage: expected array');
            setProfiles([]);
        }

        // Load last profile ID
        try {
            const lastId = localStorage.getItem(lastProfileKey);
            setLastLoadedProfileId(lastId || null);
        } catch {
            setLastLoadedProfileId(null);
        }

        setProfilesLoaded(true);
    }, [storageKey, lastProfileKey]);

    const saveProfile = (name, data) => {
        const newProfile = {
            id: Date.now().toString(),
            name,
            data
        };
        const updated = [...profiles, newProfile];
        const result = safeLocalStorageSetJSON(storageKey, updated);
        if (result.success) {
            setProfiles(updated);
            setSaveError(null);
        } else {
            setSaveError(result.error === 'quota' ? 'Storage full. Please delete some profiles.' : 'Failed to save profile.');
        }
        return newProfile;
    };

    const updateProfile = (id, data) => {
        const updated = profiles.map(p =>
            p.id === id ? { ...p, data } : p
        );
        const result = safeLocalStorageSetJSON(storageKey, updated);
        if (result.success) {
            setProfiles(updated);
            setSaveError(null);
        } else {
            setSaveError(result.error === 'quota' ? 'Storage full. Please delete some profiles.' : 'Failed to update profile.');
        }
    };

    const renameProfile = (id, newName) => {
        const updated = profiles.map(p =>
            p.id === id ? { ...p, name: newName } : p
        );
        const result = safeLocalStorageSetJSON(storageKey, updated);
        if (result.success) {
            setProfiles(updated);
            setSaveError(null);
        } else {
            setSaveError(result.error === 'quota' ? 'Storage full.' : 'Failed to rename profile.');
        }
    };

    const deleteProfile = (id) => {
        const updated = profiles.filter(p => p.id !== id);
        setProfiles(updated);
        safeLocalStorageSetJSON(storageKey, updated);
        // Clear last loaded if it was this profile
        if (lastLoadedProfileId === id) {
            setLastLoadedProfileId(null);
            safeLocalStorageRemove(lastProfileKey);
        }
        setSaveError(null);
    };

    const markProfileAsLoaded = (id) => {
        setLastLoadedProfileId(id);
        safeLocalStorageSet(lastProfileKey, id);
    };

    const clearSaveError = () => setSaveError(null);

    return { profiles, saveProfile, updateProfile, renameProfile, deleteProfile, lastLoadedProfileId, markProfileAsLoaded, profilesLoaded, saveError, clearSaveError };
}

