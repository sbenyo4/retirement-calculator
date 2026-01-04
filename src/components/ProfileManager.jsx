import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Save, Trash2, Upload, RotateCcw } from 'lucide-react';
import { CustomSelect } from './common/CustomSelect';
import { DEFAULT_INPUTS } from '../constants';
import { deepEqual } from '../hooks/useDeepCompare';

export function ProfileManager({ currentInputs, onLoad, t, language, profiles, onSaveProfile, onUpdateProfile, onDeleteProfile, onProfileLoad, lastLoadedProfileId }) {
    const [newProfileName, setNewProfileName] = useState('');
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [saveMessage, setSaveMessage] = useState('');

    // Sync selectedProfileId with lastLoadedProfileId on mount/change
    useEffect(() => {
        if (lastLoadedProfileId) {
            setSelectedProfileId(lastLoadedProfileId);
        }
    }, [lastLoadedProfileId]);

    const { theme } = useTheme();
    const isLight = theme === 'light';

    // Theme-aware styles
    const inputClass = isLight
        ? "bg-white border border-slate-400 text-gray-900 placeholder-gray-500 shadow-sm focus:ring-blue-500"
        : "bg-black/20 border border-white/50 text-white placeholder-gray-500 focus:ring-blue-500";

    const selectClass = isLight
        ? "bg-white border border-slate-400 text-gray-900 shadow-sm focus:ring-blue-500"
        : "bg-black/20 border border-white/50 text-white focus:ring-blue-500";

    const optionClass = isLight ? "bg-white text-gray-900" : "bg-gray-800 text-white";

    const saveProfile = () => {
        if (!newProfileName.trim()) return;
        const newProfile = onSaveProfile(newProfileName, currentInputs);
        setNewProfileName('');
        setSelectedProfileId(newProfile.id);
        showMessage(language === 'he' ? 'פרופיל נשמר!' : 'Profile saved!');
    };

    const updateProfile = () => {
        if (!selectedProfileId) return;
        onUpdateProfile(selectedProfileId, currentInputs);
        showMessage(language === 'he' ? 'פרופיל עודכן!' : 'Profile updated!');
    };

    const reloadProfile = () => {
        if (!selectedProfileId) return;
        const profile = profiles.find(p => p.id === selectedProfileId);
        if (profile) {
            onLoad({ ...DEFAULT_INPUTS, ...profile.data });
            showMessage(language === 'he' ? 'פרופיל נטען מחדש!' : 'Profile reloaded!');
        }
    };

    const showMessage = (msg) => {
        setSaveMessage(msg);
        setTimeout(() => setSaveMessage(''), 2000);
    };

    const deleteProfile = (id) => {
        onDeleteProfile(id);
        if (selectedProfileId === id) setSelectedProfileId('');
    };

    const loadProfile = (id) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            onLoad({ ...DEFAULT_INPUTS, ...profile.data });
            setSelectedProfileId(id);
            // Persist this as the last loaded profile
            if (onProfileLoad) {
                onProfileLoad(id);
            }
        }
    };




    const selectedProfile = profiles.find(p => p.id === selectedProfileId);
    // Normalize saved data with defaults to match how currentInputs is constructed on load
    // This prevents false positives when new fields (like manualAge) are added to the app but missing in old profiles
    const comparisonData = selectedProfile ? { ...DEFAULT_INPUTS, ...selectedProfile.data } : null;


    const hasChanges = comparisonData && !deepEqual(currentInputs, comparisonData);

    return (
        <div className="mb-2">
            <div className="flex flex-col gap-2">


                <div className="flex gap-2 items-center">
                    <input
                        type="text"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        placeholder={t('profileName')}
                        className={`flex-1 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 text-sm ${inputClass}`}
                    />
                    <button
                        onClick={saveProfile}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors text-sm"
                    >
                        <Save className="w-4 h-4" /> {t('save')}
                    </button>
                </div>

                {profiles.length > 0 && (
                    <div className="flex gap-2 items-center">
                        <CustomSelect
                            value={selectedProfileId}
                            onChange={(val) => loadProfile(val)}
                            options={[
                                { value: "", label: `${t('loadProfile')}...` },
                                ...profiles.map(p => ({ value: p.id, label: p.name }))
                            ]}
                            className="flex-1"
                        />

                        {selectedProfileId && (
                            <>
                                {/* Reload profile (discard changes) */}
                                <button
                                    onClick={reloadProfile}
                                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                                    title={language === 'he' ? 'טען מחדש (בטל שינויים)' : 'Reload (discard changes)'}
                                >
                                    <RotateCcw className="w-4 h-4" />
                                </button>
                                {/* Update/save changes to profile */}
                                <button
                                    onClick={updateProfile}
                                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors relative"
                                    title={language === 'he' ? 'שמור שינויים לפרופיל' : 'Save changes to profile'}
                                >
                                    <Upload className="w-4 h-4" />
                                    {hasChanges && (
                                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                        </span>
                                    )}
                                </button>
                                <button
                                    onClick={() => deleteProfile(selectedProfileId)}
                                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                                    title={t('delete')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Message area - dynamic height to show "Unsaved Changes" */}
                <div className="min-h-6 flex flex-col gap-1">
                    {saveMessage && (
                        <div className="bg-green-600/20 border border-green-500 text-green-300 px-2 py-0.5 rounded text-xs text-center animate-fade-in">
                            {saveMessage}
                        </div>
                    )}

                    {!saveMessage && hasChanges && (
                        <div className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 px-2 py-0.5 rounded text-xs text-center flex items-center justify-center gap-2 animate-fade-in">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                            {language === 'he' ? 'שינויים לא שמורים' : 'Unsaved changes'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
