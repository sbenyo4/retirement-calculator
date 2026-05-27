import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    saveProfile as dbSaveProfile,
    updateProfile as dbUpdateProfile,
    deleteProfileDoc,
    onProfilesSnapshot,
    getUserSettings,
    setUserSettings,
    setCurrentSession
} from '../utils/db';
import { normalizeInputs } from '../utils/profileUtils';

export function useProfiles() {
    const { currentUser } = useAuth();
    const [profiles, setProfiles] = useState([]);
    const [lastLoadedProfileId, setLastLoadedProfileId] = useState(null);
    const [profilesLoaded, setProfilesLoaded] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const uid = currentUser?.uid;

    // Subscribe to profiles in real-time
    useEffect(() => {
        if (!uid) {
            setProfiles([]);
            setProfilesLoaded(true);
            return;
        }

        setProfilesLoaded(false);

        // Load last loaded profile ID from settings
        getUserSettings(uid).then(settings => {
            setLastLoadedProfileId(settings?.lastLoadedProfileId || null);
        }).catch(err => {
            console.error('Error loading lastLoadedProfileId:', err);
        });

        // Real-time listener for profiles
        const unsubscribe = onProfilesSnapshot(uid, (profilesList) => {
            setProfiles(profilesList);
            setProfilesLoaded(true);
        });

        return () => unsubscribe();
    }, [uid]);

    const saveProfile = useCallback(async (name, data) => {
        if (!uid) return null;

        const normalizedData = normalizeInputs(data || {});
        const newProfile = {
            id: crypto.randomUUID(),
            name,
            data: normalizedData
        };

        // Optimistic update
        setProfiles(prev => [...prev, newProfile]);

        try {
            await dbSaveProfile(uid, newProfile);
            await setCurrentSession(uid, normalizedData, newProfile.id);
            setSaveError(null);
            return newProfile;
        } catch (err) {
            console.error('Error saving profile:', err);
            setSaveError('Failed to save profile.');
            // Revert on error
            setProfiles(prev => prev.filter(p => p.id !== newProfile.id));
            return null;
        }
    }, [uid]);

    const updateProfile = useCallback(async (id, data) => {
        if (!uid) return;
        const normalizedData = normalizeInputs(data || {});

        // Optimistic update — capture previous state for revert
        let prevProfiles;
        setProfiles(prev => {
            prevProfiles = prev;
            return prev.map(p => p.id === id ? { ...p, data: normalizedData, aiInsights: null } : p);
        });

        try {
            const updatedProfile = await dbUpdateProfile(uid, id, { data: normalizedData, aiInsights: null });
            if (updatedProfile) {
                setProfiles(prev => prev.map(p => p.id === id ? updatedProfile : p));
            }
            await setCurrentSession(uid, normalizedData, id);
            setSaveError(null);
            return updatedProfile || { id, data: normalizedData, aiInsights: null };
        } catch (err) {
            console.error('Error updating profile:', err);
            setSaveError('Failed to update profile.');
            if (prevProfiles) setProfiles(prevProfiles);
            throw err;
        }
    }, [uid]);

    const renameProfile = useCallback((id, newName) => {
        if (!uid) return;

        // Optimistic update — capture previous state for revert
        let prevProfiles;
        setProfiles(prev => {
            prevProfiles = prev;
            return prev.map(p => p.id === id ? { ...p, name: newName } : p);
        });

        dbUpdateProfile(uid, id, { name: newName }).catch(err => {
            console.error('Error renaming profile:', err);
            setSaveError('Failed to rename profile.');
            if (prevProfiles) setProfiles(prevProfiles);
        });

        setSaveError(null);
    }, [uid]);

    const deleteProfile = useCallback((id) => {
        if (!uid) return;

        // Optimistic update — capture previous state for revert
        let prevProfiles;
        setProfiles(prev => {
            prevProfiles = prev;
            return prev.filter(p => p.id !== id);
        });

        deleteProfileDoc(uid, id).catch(err => {
            console.error('Error deleting profile:', err);
            setSaveError('Failed to delete profile.');
            if (prevProfiles) setProfiles(prevProfiles);
        });

        // Clear last loaded if it was this profile
        if (lastLoadedProfileId === id) {
            setLastLoadedProfileId(null);
            setUserSettings(uid, { lastLoadedProfileId: null }).catch(console.error);
        }

        setSaveError(null);
    }, [uid, lastLoadedProfileId]);

    const markProfileAsLoaded = useCallback(async (id) => {
        if (!uid) return;
        setLastLoadedProfileId(id);
        await setUserSettings(uid, { lastLoadedProfileId: id });
    }, [uid]);

    const updateProfileInsights = useCallback((id, insights) => {
        if (!uid || !id) return;
        setProfiles(prev => prev.map(p => p.id === id ? { ...p, aiInsights: insights } : p));
        dbUpdateProfile(uid, id, { aiInsights: insights }).catch(err => {
            console.error('Error saving profile insights:', err);
        });
    }, [uid]);

    const clearSaveError = () => setSaveError(null);

    return { profiles, saveProfile, updateProfile, renameProfile, deleteProfile, lastLoadedProfileId, markProfileAsLoaded, updateProfileInsights, profilesLoaded, saveError, clearSaveError };
}
