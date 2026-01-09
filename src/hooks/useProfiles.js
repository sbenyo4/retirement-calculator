import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useProfiles() {
    const { currentUser } = useAuth();
    const [profiles, setProfiles] = useState([]);
    const [lastLoadedProfileId, setLastLoadedProfileId] = useState(null);
    const [profilesLoaded, setProfilesLoaded] = useState(false);

    const storageKey = currentUser ? `retirementProfiles_${currentUser.uid}` : 'retirementProfiles_guest';
    const lastProfileKey = currentUser ? `lastLoadedProfile_${currentUser.uid}` : 'lastLoadedProfile_guest';

    useEffect(() => {
        setProfilesLoaded(false);
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            setProfiles(JSON.parse(saved));
        } else {
            setProfiles([]);
        }

        // Load last profile ID
        const lastId = localStorage.getItem(lastProfileKey);
        if (lastId) {
            setLastLoadedProfileId(lastId);
        } else {
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
        setProfiles(updated);
        localStorage.setItem(storageKey, JSON.stringify(updated));
        return newProfile;
    };

    const updateProfile = (id, data) => {
        const updated = profiles.map(p =>
            p.id === id ? { ...p, data } : p
        );
        setProfiles(updated);
        localStorage.setItem(storageKey, JSON.stringify(updated));
    };

    const renameProfile = (id, newName) => {
        const updated = profiles.map(p =>
            p.id === id ? { ...p, name: newName } : p
        );
        setProfiles(updated);
        localStorage.setItem(storageKey, JSON.stringify(updated));
    };

    const deleteProfile = (id) => {
        const updated = profiles.filter(p => p.id !== id);
        setProfiles(updated);
        localStorage.setItem(storageKey, JSON.stringify(updated));
        // Clear last loaded if it was this profile
        if (lastLoadedProfileId === id) {
            setLastLoadedProfileId(null);
            localStorage.removeItem(lastProfileKey);
        }
    };

    const markProfileAsLoaded = (id) => {
        setLastLoadedProfileId(id);
        localStorage.setItem(lastProfileKey, id);
    };

    return { profiles, saveProfile, updateProfile, renameProfile, deleteProfile, lastLoadedProfileId, markProfileAsLoaded, profilesLoaded };
}

