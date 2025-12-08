import React, { useState, useEffect } from 'react';
import { Save, Trash2, Upload, RotateCcw } from 'lucide-react';

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
            onLoad(profile.data);
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
            onLoad(profile.data);
            setSelectedProfileId(id);
            // Persist this as the last loaded profile
            if (onProfileLoad) {
                onProfileLoad(id);
            }
        }
    };

    return (
        <div className="mb-2">
            <div className="flex flex-col gap-2">


                <div className="flex gap-2 items-center">
                    <input
                        type="text"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        placeholder={t('profileName')}
                        className="flex-1 bg-black/20 border border-white/50 rounded-lg py-1.5 px-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
                        <select
                            value={selectedProfileId}
                            onChange={(e) => loadProfile(e.target.value)}
                            className="flex-1 bg-black/20 border border-white/50 rounded-lg py-1.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                            <option value="">{t('loadProfile')}...</option>
                            {profiles.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>

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
                                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                                    title={language === 'he' ? 'שמור שינויים לפרופיל' : 'Save changes to profile'}
                                >
                                    <Upload className="w-4 h-4" />
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

                {/* Message area - fixed height to prevent shifting */}
                <div className="h-6">
                    {saveMessage && (
                        <div className="bg-green-600/20 border border-green-500 text-green-300 px-2 py-0.5 rounded text-xs text-center">
                            {saveMessage}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
