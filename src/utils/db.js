/**
 * Firestore database abstraction layer
 * All user data is stored under users/{uid}/...
 */
import { db } from '../firebase';
import {
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    collection,
    getDocs,
    onSnapshot,
    writeBatch
} from 'firebase/firestore';

// ─── Document References ───────────────────────────────────────────

function userDoc(uid, ...pathSegments) {
    return doc(db, 'users', uid, ...pathSegments);
}

function settingsRef(uid) {
    return userDoc(uid, 'data', 'settings');
}

function currentSessionRef(uid) {
    return userDoc(uid, 'data', 'currentSession');
}

function pensionSourcesRef(uid) {
    return userDoc(uid, 'data', 'pensionSources');
}

function rateLimitRef(uid) {
    return userDoc(uid, 'data', 'rateLimit');
}

function budgetItemsRef(uid) {
    return userDoc(uid, 'data', 'budgetItems');
}

function normalizeBudgetItemStatus(item) {
    if (!item || typeof item !== 'object') return item;
    const paused = item.status === 'paused' || item.enabled === false;
    return {
        ...item,
        status: paused ? 'paused' : 'active',
        enabled: !paused
    };
}

function normalizeBudgetItemsStatus(items) {
    if (!Array.isArray(items)) return [];
    return items.map(normalizeBudgetItemStatus);
}

function stripUndefinedDeep(value) {
    if (Array.isArray(value)) {
        return value.map(stripUndefinedDeep);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, entryValue]) => entryValue !== undefined)
                .map(([key, entryValue]) => [key, stripUndefinedDeep(entryValue)])
        );
    }

    return value;
}

function checklistStateRef(uid) {
    return userDoc(uid, 'data', 'checklistState');
}

function generalRemindersRef(uid) {
    return userDoc(uid, 'data', 'generalReminders');
}

function dismissedRemindersRef(uid) {
    return userDoc(uid, 'data', 'dismissedReminders');
}

function profilesCollection(uid) {
    return collection(db, 'users', uid, 'profiles');
}

function profileRef(uid, profileId) {
    return doc(db, 'users', uid, 'profiles', profileId);
}

// ─── Settings ──────────────────────────────────────────────────────

export async function getUserSettings(uid) {
    const snap = await getDoc(settingsRef(uid));
    return snap.exists() ? snap.data() : null;
}

export async function setUserSettings(uid, data) {
    await setDoc(settingsRef(uid), data, { merge: true });
}

// ─── Current Session ───────────────────────────────────────────────

export async function getCurrentSession(uid) {
    const snap = await getDoc(currentSessionRef(uid));
    return snap.exists() ? snap.data().inputs : null;
}

export async function setCurrentSession(uid, inputs) {
    await setDoc(currentSessionRef(uid), { inputs, updatedAt: Date.now() }, { merge: true });
}

// ─── Pension Sources ───────────────────────────────────────────────

export async function getPensionSources(uid) {
    const snap = await getDoc(pensionSourcesRef(uid));
    return snap.exists() ? snap.data() : null;
}

export async function setPensionSources(uid, data) {
    await setDoc(pensionSourcesRef(uid), { ...data, updatedAt: Date.now() }, { merge: true });
}

// ─── Profiles (subcollection) ──────────────────────────────────────

export async function getProfiles(uid) {
    const snap = await getDocs(profilesCollection(uid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveProfile(uid, profile) {
    const ref = profileRef(uid, profile.id);
    const { id, ...data } = profile;
    await setDoc(ref, data);
}

export async function updateProfile(uid, profileId, data) {
    await setDoc(profileRef(uid, profileId), data, { merge: true });
}

export async function deleteProfileDoc(uid, profileId) {
    await deleteDoc(profileRef(uid, profileId));
}

export function onProfilesSnapshot(uid, callback) {
    return onSnapshot(profilesCollection(uid), (snap) => {
        const profiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(profiles);
    });
}

export function onBudgetItemsSnapshot(uid, callback) {
    return onSnapshot(budgetItemsRef(uid), (snap) => {
        if (!snap.exists()) {
            callback(null);
            return;
        }
        const data = snap.data();
        callback({
            items: normalizeBudgetItemsStatus(data.items),
            householdSize: data.householdSize ?? 2,
            backupSlots: Array.isArray(data.backupSlots)
                ? data.backupSlots.map(slot => ({
                    ...slot,
                    items: normalizeBudgetItemsStatus(slot?.items)
                }))
                : [],
        });
    });
}

// ─── Budget Items ──────────────────────────────────────────────────

export async function getBudgetItems(uid) {
    const snap = await getDoc(budgetItemsRef(uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
        items: normalizeBudgetItemsStatus(data.items),
        householdSize: data.householdSize ?? 2,
        backupSlots: Array.isArray(data.backupSlots)
            ? data.backupSlots.map(slot => ({
                ...slot,
                items: normalizeBudgetItemsStatus(slot?.items)
            }))
            : [],
    };
}

export async function setBudgetItems(uid, items, householdSize, backupSlots) {
    const payload = {
        items: stripUndefinedDeep(normalizeBudgetItemsStatus(items)),
        updatedAt: Date.now()
    };
    if (householdSize !== undefined) payload.householdSize = householdSize;
    if (backupSlots !== undefined) {
        payload.backupSlots = stripUndefinedDeep(Array.isArray(backupSlots)
            ? backupSlots.map(slot => ({
                ...slot,
                items: normalizeBudgetItemsStatus(slot?.items)
            }))
            : []);
    }
    await setDoc(budgetItemsRef(uid), payload, { merge: true });
}

// ─── Checklist State ───────────────────────────────────────────────

export async function getChecklistState(uid) {
    const snap = await getDoc(checklistStateRef(uid));
    return snap.exists() ? snap.data() : null;
}

export async function setChecklistState(uid, state) {
    await setDoc(checklistStateRef(uid), stripUndefinedDeep({ ...state, updatedAt: Date.now() }), { merge: true });
}

// ─── General Reminders ─────────────────────────────────────────────

export async function getGeneralReminders(uid) {
    const snap = await getDoc(generalRemindersRef(uid));
    return snap.exists() ? (snap.data().reminders || []) : [];
}

export async function setGeneralReminders(uid, reminders) {
    await setDoc(generalRemindersRef(uid), { reminders, updatedAt: Date.now() });
}

// ─── Dismissed Reminders ───────────────────────────────────────────

export async function getDismissedReminders(uid) {
    const snap = await getDoc(dismissedRemindersRef(uid));
    return snap.exists() ? (snap.data().ids || []) : [];
}

export async function dismissReminder(uid, id) {
    const snap = await getDoc(dismissedRemindersRef(uid));
    const currentIds = snap.exists() ? (snap.data().ids || []) : [];
    if (!currentIds.includes(String(id))) {
        await setDoc(dismissedRemindersRef(uid), { 
            ids: [...currentIds, String(id)], 
            updatedAt: Date.now() 
        });
    }
}

export async function undismissReminder(uid, id) {
    const snap = await getDoc(dismissedRemindersRef(uid));
    const currentIds = snap.exists() ? (snap.data().ids || []) : [];
    const nextIds = currentIds.filter(existingId => String(existingId) !== String(id));
    if (nextIds.length !== currentIds.length) {
        await setDoc(dismissedRemindersRef(uid), { 
            ids: nextIds, 
            updatedAt: Date.now() 
        });
    }
}

// ─── Rate Limit ────────────────────────────────────────────────────

export async function getRateLimitData(uid) {
    const snap = await getDoc(rateLimitRef(uid));
    return snap.exists() ? snap.data() : { calls: [] };
}

export async function setRateLimitData(uid, data) {
    await setDoc(rateLimitRef(uid), data, { merge: true });
}

// ─── One-Time Migration from localStorage ──────────────────────────

export async function migrateFromLocalStorage(uid) {
    // Check if already migrated
    const settings = await getUserSettings(uid);
    if (settings?.migrated) {
        return false; // Already migrated
    }

    const batch = writeBatch(db);
    let hasData = false;

    // Helper to safely parse localStorage JSON
    const getJSON = (key) => {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    };

    // Helper: try uid-specific key first, then guest key, then scan all matching keys
    const getJSONWithFallback = (prefix) => {
        // Try exact uid match first
        let data = getJSON(`${prefix}_${uid}`);
        if (data) return data;

        // Try guest key
        data = getJSON(`${prefix}_guest`);
        if (data) return data;

        // Scan ALL localStorage keys for any matching prefix
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(`${prefix}_`)) {
                data = getJSON(key);
                if (data) return data;
            }
        }
        return null;
    };

    // Migrate settings
    const settingsData = {
        migrated: true,
        migratedAt: Date.now(),
        theme: localStorage.getItem('theme') || 'dark',
        zoomLevel: parseInt(localStorage.getItem('app_zoom_level') || '100', 10),
        aiProvider: localStorage.getItem('aiProvider') || 'gemini',
        aiModel: localStorage.getItem('aiModel') || 'gemini-2.5-flash',
        simulationType: localStorage.getItem('simulationType') || 'monteCarlo',
        familyStatus: localStorage.getItem('familyStatus') || 'single',
    };

    // API key overrides per provider
    const apiKeys = {};
    ['gemini', 'openai', 'anthropic'].forEach(provider => {
        const key = localStorage.getItem(`apiKeyOverride_${provider}`);
        if (key) apiKeys[provider] = key;
    });
    if (Object.keys(apiKeys).length > 0) {
        settingsData.apiKeys = apiKeys;
    }

    // Fiscal parameters
    const fiscal = getJSON('fiscalParameters');
    if (fiscal) settingsData.fiscalParameters = fiscal;

    // AI models override
    const modelsOverride = getJSON('ai_models_override');
    if (modelsOverride) settingsData.aiModelsOverride = modelsOverride;

    // Last loaded profile — check uid key and guest key
    const lastProfile = localStorage.getItem(`lastLoadedProfile_${uid}`)
        || localStorage.getItem('lastLoadedProfile_guest');
    if (lastProfile) settingsData.lastLoadedProfileId = lastProfile;

    batch.set(settingsRef(uid), settingsData, { merge: true });
    hasData = true;

    // Migrate current session — check uid key and guest key
    const sessionInputs = getJSONWithFallback('retirementInputs_current');
    if (sessionInputs) {
        batch.set(currentSessionRef(uid), { inputs: sessionInputs, updatedAt: Date.now() });
        hasData = true;
    }

    // Migrate pension sources — check uid key and guest key
    const pension = getJSONWithFallback('retirementGlobal_pensionSources');
    if (pension && Array.isArray(pension)) {
        batch.set(pensionSourcesRef(uid), { sources: pension, updatedAt: Date.now() });
        hasData = true;
    }

    // Migrate rate limit data
    const rateData = getJSONWithFallback('ai_usage_data');
    if (rateData) {
        batch.set(rateLimitRef(uid), rateData);
        hasData = true;
    }

    // Migrate profiles — check uid key and guest key, scan all matching keys
    const profiles = getJSONWithFallback('retirementProfiles');
    if (Array.isArray(profiles)) {
        profiles.forEach(profile => {
            const { id, ...data } = profile;
            batch.set(profileRef(uid, id), data);
        });
        hasData = true;
    }

    if (hasData) {
        await batch.commit();
        // Clear localStorage after successful migration
        localStorage.clear();
        return true;
    }

    // Even if no data, mark as migrated
    await setDoc(settingsRef(uid), { migrated: true, migratedAt: Date.now() }, { merge: true });
    localStorage.clear();
    return true;
}
