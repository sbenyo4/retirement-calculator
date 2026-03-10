import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    getProfiles,
    saveProfile as dbSaveProfile,
    updateProfile as dbUpdateProfile,
    deleteProfileDoc,
    onProfilesSnapshot,
    getUserSettings,
    setUserSettings
} from '../utils/db';

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

    const saveProfile = useCallback((name, data) => {
        if (!uid) return null;

        const newProfile = {
            id: Date.now().toString(),
            name,
            data
        };

        // Optimistic update
        setProfiles(prev => [...prev, newProfile]);

        // Write to Firestore
        dbSaveProfile(uid, newProfile).catch(err => {
            console.error('Error saving profile:', err);
            setSaveError('Failed to save profile.');
            // Revert on error
            setProfiles(prev => prev.filter(p => p.id !== newProfile.id));
        });

        setSaveError(null);
        return newProfile;
    }, [uid]);

    const updateProfile = useCallback((id, data) => {
        if (!uid) return;

        // Optimistic update
        setProfiles(prev => prev.map(p => p.id === id ? { ...p, data } : p));

        dbUpdateProfile(uid, id, { data }).catch(err => {
            console.error('Error updating profile:', err);
            setSaveError('Failed to update profile.');
        });

        setSaveError(null);
    }, [uid]);

    const renameProfile = useCallback((id, newName) => {
        if (!uid) return;

        // Optimistic update
        setProfiles(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));

        dbUpdateProfile(uid, id, { name: newName }).catch(err => {
            console.error('Error renaming profile:', err);
            setSaveError('Failed to rename profile.');
        });

        setSaveError(null);
    }, [uid]);

    const deleteProfile = useCallback((id) => {
        if (!uid) return;

        // Optimistic update
        setProfiles(prev => prev.filter(p => p.id !== id));

        deleteProfileDoc(uid, id).catch(err => {
            console.error('Error deleting profile:', err);
            setSaveError('Failed to delete profile.');
        });

        // Clear last loaded if it was this profile
        if (lastLoadedProfileId === id) {
            setLastLoadedProfileId(null);
            setUserSettings(uid, { lastLoadedProfileId: null }).catch(console.error);
        }

        setSaveError(null);
    }, [uid, lastLoadedProfileId]);

    const markProfileAsLoaded = useCallback((id) => {
        if (!uid) return;
        setLastLoadedProfileId(id);
        setUserSettings(uid, { lastLoadedProfileId: id }).catch(console.error);
    }, [uid]);

    const clearSaveError = () => setSaveError(null);

    return { profiles, saveProfile, updateProfile, renameProfile, deleteProfile, lastLoadedProfileId, markProfileAsLoaded, profilesLoaded, saveError, clearSaveError };
}
