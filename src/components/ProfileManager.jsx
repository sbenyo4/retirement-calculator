import React, { useState, useEffect } from 'react';
import { Save, FolderOpen, Trash2, RefreshCw } from 'lucide-react';

export function ProfileManager({ currentInputs, onLoad, t, language }) {
    const [profiles, setProfiles] = useState([]);
    const [newProfileName, setNewProfileName] = useState('');
    const [selectedProfileId, setSelectedProfileId] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('retirementProfiles');
        if (saved) {
            setProfiles(JSON.parse(saved));
        }
    }, []);

    const saveProfile = () => {
        if (!newProfileName.trim()) return;
        const newProfile = {
            id: Date.now().toString(),
            name: newProfileName,
            data: currentInputs
        };
        const updated = [...profiles, newProfile];
        setProfiles(updated);
        localStorage.setItem('retirementProfiles', JSON.stringify(updated));
        setNewProfileName('');
        setSelectedProfileId(newProfile.id);
    };

    const updateProfile = () => {
        if (!selectedProfileId) return;
        const updated = profiles.map(p =>
            p.id === selectedProfileId ? { ...p, data: currentInputs } : p
        );
        setProfiles(updated);
        localStorage.setItem('retirementProfiles', JSON.stringify(updated));
    };

    const deleteProfile = (id) => {
        const updated = profiles.filter(p => p.id !== id);
        setProfiles(updated);
        localStorage.setItem('retirementProfiles', JSON.stringify(updated));
        if (selectedProfileId === id) setSelectedProfileId('');
    };

    const loadProfile = (id) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            onLoad(profile.data);
            setSelectedProfileId(id);
        }
    };

    return (
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-xl mb-6">
            <div className="flex flex-col gap-4">
                <div className="flex gap-2 items-center">
                    <input
                        type="text"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        placeholder={t('profileName')}
                        className="flex-1 bg-black/20 border border-white/10 rounded-lg py-2 px-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        onClick={saveProfile}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <Save className="w-4 h-4" /> {t('save')}
                    </button>
                </div>

                {profiles.length > 0 && (
                    <div className="flex gap-2 items-center flex-wrap">
                        <select
                            value={selectedProfileId}
                            onChange={(e) => loadProfile(e.target.value)}
                            className="flex-1 bg-black/20 border border-white/10 rounded-lg py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">{t('loadProfile')}...</option>
                            {profiles.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>

                        {selectedProfileId && (
                            <>
                                <button
                                    onClick={updateProfile}
                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                                    title={t('updateProfile')}
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => deleteProfile(selectedProfileId)}
                                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                                    title={t('delete')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
