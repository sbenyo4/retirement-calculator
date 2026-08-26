/**
 * Firestore database abstraction layer
 * All user data is stored under users/{uid}/...
 */
import { db } from '../firebase';
import { logger } from './logger';
import {
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    collection,
    getDocs,
    onSnapshot,
    writeBatch,
    updateDoc
} from 'firebase/firestore';

// ─── Error Wrapper ─────────────────────────────────────────────────

async function dbCall(fn, context) {
    try {
        return await fn();
    } catch (err) {
        const message = `[DB:${context}] ${err?.message || err}`;
        logger.error(message, err);
        const wrapped = new Error(message);
        wrapped.cause = err;
        throw wrapped;
    }
}

// ─── Document References ───────────────────────────────────────────

function userDoc(uid, ...pathSegments) {
    return doc(db, 'users', uid, ...pathSegments);
}

function settingsRef(uid) {
    return userDoc(uid, 'data', 'settings');
}

function pinLockRef(uid) {
    return userDoc(uid, 'data', 'pinLock');
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

function budgetAiInsightRef(uid) {
    return userDoc(uid, 'data', 'budgetAiInsight');
}

function checklistOverviewRef(uid) {
    return userDoc(uid, 'data', 'checklistOverview');
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

function profileHistoryCollection(uid, profileId) {
    return collection(db, 'users', uid, 'profiles', profileId, 'history');
}

function profileHistoryRef(uid, profileId, versionId) {
    return doc(db, 'users', uid, 'profiles', profileId, 'history', versionId);
}

// ─── Settings ──────────────────────────────────────────────────────

export async function getUserSettings(uid) {
    return dbCall(async () => {
        const snap = await getDoc(settingsRef(uid));
        return snap.exists() ? snap.data() : null;
    }, 'getUserSettings');
}

export async function setUserSettings(uid, data) {
    return dbCall(() => setDoc(settingsRef(uid), data, { merge: true }), 'setUserSettings');
}

export async function getPinLock(uid) {
    return dbCall(async () => {
        const snap = await getDoc(pinLockRef(uid));
        return snap.exists() ? snap.data() : null;
    }, 'getPinLock');
}

export async function setPinLock(uid, data) {
    return dbCall(() => setDoc(pinLockRef(uid), { ...data, updatedAt: Date.now() }), 'setPinLock');
}

// ─── Current Session ───────────────────────────────────────────────

export async function getCurrentSession(uid) {
    return dbCall(async () => {
        const snap = await getDoc(currentSessionRef(uid));
        return snap.exists() ? snap.data().inputs : null;
    }, 'getCurrentSession');
}

export async function getCurrentSessionData(uid) {
    return dbCall(async () => {
        const snap = await getDoc(currentSessionRef(uid));
        return snap.exists() ? snap.data() : null;
    }, 'getCurrentSessionData');
}

export async function setCurrentSession(uid, inputs, profileId) {
    return dbCall(() => {
        const payload = { inputs, updatedAt: Date.now() };
        if (profileId !== undefined) payload.profileId = profileId;
        return setDoc(currentSessionRef(uid), payload, { merge: true });
    }, 'setCurrentSession');
}

// ─── Pension Sources ───────────────────────────────────────────────

export async function getPensionSources(uid) {
    return dbCall(async () => {
        const snap = await getDoc(pensionSourcesRef(uid));
        return snap.exists() ? snap.data() : null;
    }, 'getPensionSources');
}

export async function setPensionSources(uid, data) {
    return dbCall(() => setDoc(pensionSourcesRef(uid), { ...data, updatedAt: Date.now() }, { merge: true }), 'setPensionSources');
}

// ─── Profiles (subcollection) ──────────────────────────────────────

export async function getProfiles(uid) {
    return dbCall(async () => {
        const snap = await getDocs(profilesCollection(uid));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }, 'getProfiles');
}

export async function getProfile(uid, profileId) {
    return dbCall(async () => {
        const snap = await getDoc(profileRef(uid, profileId));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }, 'getProfile');
}

export async function saveProfile(uid, profile) {
    return dbCall(async () => {
        const ref = profileRef(uid, profile.id);
        const { id, ...data } = profile;
        const now = Date.now();
        await setDoc(ref, { ...data, updatedAt: now, dataUpdatedAt: now });
        return getProfile(uid, profile.id);
    }, 'saveProfile');
}

export async function updateProfile(uid, profileId, data) {
    return dbCall(async () => {
        const now = Date.now();
        const payload = { ...data, updatedAt: now };
        if (Object.prototype.hasOwnProperty.call(data, 'data')) {
            payload.dataUpdatedAt = now;
        }
        await updateDoc(profileRef(uid, profileId), payload);
        return getProfile(uid, profileId);
    }, 'updateProfile');
}

export async function deleteProfileDoc(uid, profileId) {
    return dbCall(async () => {
        // Firestore does not cascade — remove the history subcollection before the profile doc.
        const histSnap = await getDocs(profileHistoryCollection(uid, profileId));
        if (!histSnap.empty) {
            const batch = writeBatch(db);
            histSnap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        await deleteDoc(profileRef(uid, profileId));
    }, 'deleteProfileDoc');
}

// ─── Profile Change History (per-profile subcollection) ────────────
// Each doc is one saved version: { createdAt, data, changes, source }.
// `limit` (a positive number) caps retained versions; null/undefined = unlimited.

export async function appendProfileHistory(uid, profileId, entry, limit = null) {
    return dbCall(async () => {
        const id = entry.id || crypto.randomUUID();
        const payload = stripUndefinedDeep({
            ...entry,
            createdAt: entry.createdAt ?? Date.now(),
        });
        await setDoc(profileHistoryRef(uid, profileId, id), payload);

        // Prune oldest versions beyond the cap (only when a positive numeric limit is set).
        if (typeof limit === 'number' && limit > 0) {
            const snap = await getDocs(profileHistoryCollection(uid, profileId));
            if (snap.size > limit) {
                const ordered = snap.docs
                    .map(d => ({ ref: d.ref, createdAt: d.data().createdAt || 0 }))
                    .sort((a, b) => b.createdAt - a.createdAt); // newest first
                const batch = writeBatch(db);
                ordered.slice(limit).forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
        }

        return { id, ...payload };
    }, 'appendProfileHistory');
}

export async function getProfileHistory(uid, profileId) {
    return dbCall(async () => {
        const snap = await getDocs(profileHistoryCollection(uid, profileId));
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // newest first
    }, 'getProfileHistory');
}

export async function deleteProfileHistoryEntry(uid, profileId, versionId) {
    return dbCall(() => deleteDoc(profileHistoryRef(uid, profileId, versionId)), 'deleteProfileHistoryEntry');
}

// Edit an existing version (e.g. correct its timestamp or values). `patch` is
// merged into the doc; callers pass a recomputed `changes` array when data changes.
export async function updateProfileHistoryEntry(uid, profileId, versionId, patch) {
    return dbCall(async () => {
        await updateDoc(profileHistoryRef(uid, profileId, versionId), stripUndefinedDeep(patch));
        const snap = await getDoc(profileHistoryRef(uid, profileId, versionId));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }, 'updateProfileHistoryEntry');
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
            yearAmounts: data.yearAmounts ?? null,
            retirementModeByYear: data.retirementModeByYear ?? null,
        });
    });
}

// ─── Budget Items ──────────────────────────────────────────────────

export async function getBudgetItems(uid) {
    return dbCall(async () => {
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
            yearAmounts: data.yearAmounts ?? null,
            retirementModeByYear: data.retirementModeByYear ?? null,
        };
    }, 'getBudgetItems');
}

// Dedicated isolated document — never touched by setBudgetItems
export async function getBudgetAiInsight(uid) {
    return dbCall(async () => {
        const snap = await getDoc(budgetAiInsightRef(uid));
        if (!snap.exists()) return null;
        const d = snap.data();
        return d.insight ? { insight: d.insight } : null;
    }, 'getBudgetAiInsight');
}

export async function setBudgetAiInsight(uid, insight) {
    return dbCall(() => setDoc(budgetAiInsightRef(uid), { insight: insight ?? null, updatedAt: Date.now() }), 'setBudgetAiInsight');
}

export async function setBudgetItems(uid, items, householdSize, backupSlots, yearAmounts, retirementModeByYear) {
    return dbCall(() => {
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
        if (yearAmounts !== undefined) payload.yearAmounts = stripUndefinedDeep(yearAmounts);
        if (retirementModeByYear !== undefined) payload.retirementModeByYear = stripUndefinedDeep(retirementModeByYear);
        return setDoc(budgetItemsRef(uid), payload, { merge: true });
    }, 'setBudgetItems');
}

// Dedicated isolated document for checklist overview
export async function getChecklistOverview(uid) {
    return dbCall(async () => {
        const snap = await getDoc(checklistOverviewRef(uid));
        if (!snap.exists()) return null;
        const d = snap.data();
        return d.overviewText ? { overviewText: d.overviewText } : null;
    }, 'getChecklistOverview');
}

export async function setChecklistOverview(uid, overviewText) {
    return dbCall(() => setDoc(checklistOverviewRef(uid), { overviewText: overviewText ?? null, updatedAt: Date.now() }), 'setChecklistOverview');
}

// ─── Checklist State ───────────────────────────────────────────────

export async function getChecklistState(uid) {
    return dbCall(async () => {
        const snap = await getDoc(checklistStateRef(uid));
        return snap.exists() ? snap.data() : null;
    }, 'getChecklistState');
}

export async function setChecklistState(uid, state) {
    return dbCall(() => setDoc(checklistStateRef(uid), stripUndefinedDeep({ ...state, updatedAt: Date.now() }), { merge: true }), 'setChecklistState');
}

// ─── General Reminders ─────────────────────────────────────────────

export async function getGeneralReminders(uid) {
    return dbCall(async () => {
        const snap = await getDoc(generalRemindersRef(uid));
        return snap.exists() ? (snap.data().reminders || []) : [];
    }, 'getGeneralReminders');
}

export async function setGeneralReminders(uid, reminders) {
    return dbCall(() => setDoc(generalRemindersRef(uid), { reminders, updatedAt: Date.now() }), 'setGeneralReminders');
}

// ─── Dismissed Reminders ───────────────────────────────────────────

export async function getDismissedReminders(uid) {
    return dbCall(async () => {
        const snap = await getDoc(dismissedRemindersRef(uid));
        return snap.exists() ? (snap.data().ids || []) : [];
    }, 'getDismissedReminders');
}

export async function dismissReminder(uid, id) {
    return dbCall(async () => {
        const snap = await getDoc(dismissedRemindersRef(uid));
        const currentIds = snap.exists() ? (snap.data().ids || []) : [];
        if (!currentIds.includes(String(id))) {
            await setDoc(dismissedRemindersRef(uid), {
                ids: [...currentIds, String(id)],
                updatedAt: Date.now()
            });
        }
    }, 'dismissReminder');
}

export async function undismissReminder(uid, id) {
    return dbCall(async () => {
        const snap = await getDoc(dismissedRemindersRef(uid));
        const currentIds = snap.exists() ? (snap.data().ids || []) : [];
        const nextIds = currentIds.filter(existingId => String(existingId) !== String(id));
        if (nextIds.length !== currentIds.length) {
            await setDoc(dismissedRemindersRef(uid), {
                ids: nextIds,
                updatedAt: Date.now()
            });
        }
    }, 'undismissReminder');
}

// ─── Smart Alerts ──────────────────────────────────────────────────

function smartAlertsRef(uid) {
    return userDoc(uid, 'data', 'smartAlerts');
}

export async function getSmartAlerts(uid) {
    return dbCall(async () => {
        const snap = await getDoc(smartAlertsRef(uid));
        return snap.exists() ? (snap.data().alerts || []) : [];
    }, 'getSmartAlerts');
}

export async function setSmartAlerts(uid, alerts) {
    return dbCall(() => setDoc(smartAlertsRef(uid), { alerts, updatedAt: Date.now() }), 'setSmartAlerts');
}

// ─── Trip Plans ────────────────────────────────────────────────────

function tripPlansRef(uid) {
    return userDoc(uid, 'data', 'tripPlans');
}

export async function getTripPlans(uid) {
    return dbCall(async () => {
        const snap = await getDoc(tripPlansRef(uid));
        return snap.exists() ? (snap.data().plans || []) : [];
    }, 'getTripPlans');
}

export async function saveTripPlan(uid, plan) {
    return dbCall(async () => {
        const snap = await getDoc(tripPlansRef(uid));
        const plans = snap.exists() ? (snap.data().plans || []) : [];
        const idx = plans.findIndex(p => p.id === plan.id);
        const updated = idx >= 0 ? plans.map(p => p.id === plan.id ? plan : p) : [...plans, plan];
        await setDoc(tripPlansRef(uid), { plans: stripUndefinedDeep(updated), updatedAt: Date.now() });
    }, 'saveTripPlan');
}

export async function deleteTripPlan(uid, planId) {
    return dbCall(async () => {
        const snap = await getDoc(tripPlansRef(uid));
        if (!snap.exists()) return;
        const plans = (snap.data().plans || []).filter(p => p.id !== planId);
        await setDoc(tripPlansRef(uid), { plans, updatedAt: Date.now() });
    }, 'deleteTripPlan');
}

// ─── Rate Limit ────────────────────────────────────────────────────

export async function getRateLimitData(uid) {
    return dbCall(async () => {
        const snap = await getDoc(rateLimitRef(uid));
        return snap.exists() ? snap.data() : { calls: [] };
    }, 'getRateLimitData');
}

export async function setRateLimitData(uid, data) {
    return dbCall(() => setDoc(rateLimitRef(uid), data, { merge: true }), 'setRateLimitData');
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
        theme: settings?.theme ?? localStorage.getItem('theme') ?? 'dark',
        zoomLevel: settings?.zoomLevel ?? parseInt(localStorage.getItem('app_zoom_level') || '100', 10),
        aiProvider: settings?.aiProvider ?? localStorage.getItem('aiProvider') ?? 'gemini',
        aiModel: settings?.aiModel ?? localStorage.getItem('aiModel') ?? 'gemini-2.5-flash',
        simulationType: settings?.simulationType ?? localStorage.getItem('simulationType') ?? 'monteCarlo',
        familyStatus: settings?.familyStatus ?? localStorage.getItem('familyStatus') ?? 'single',
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
    const fiscal = settings?.fiscalParameters ? null : getJSON('fiscalParameters');
    if (fiscal) settingsData.fiscalParameters = fiscal;

    // AI models override
    const modelsOverride = settings?.aiModelsOverride ? null : getJSON('ai_models_override');
    if (modelsOverride) settingsData.aiModelsOverride = modelsOverride;

    // Last loaded profile — check uid key and guest key
    const lastProfile = localStorage.getItem(`lastLoadedProfile_${uid}`)
        || localStorage.getItem('lastLoadedProfile_guest');
    if (!settings?.lastLoadedProfileId && lastProfile) settingsData.lastLoadedProfileId = lastProfile;

    batch.set(settingsRef(uid), settingsData, { merge: true });
    hasData = true;

    // Migrate current session — check uid key and guest key
    const sessionInputs = getJSONWithFallback('retirementInputs_current');
    const existingSession = await getCurrentSession(uid);
    if (!existingSession && sessionInputs) {
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
        const existingProfiles = await getProfiles(uid);
        const existingProfileIds = new Set(existingProfiles.map(profile => profile.id));

        profiles.forEach(profile => {
            const { id, ...data } = profile;
            if (!id || existingProfileIds.has(id)) return;
            batch.set(profileRef(uid, id), data);
        });
        hasData = true;
    }

    if (hasData) {
        await dbCall(() => batch.commit(), 'migrateFromLocalStorage:commit');
        localStorage.clear();
        return true;
    }

    // Even if no data, mark as migrated
    await dbCall(() => setDoc(settingsRef(uid), { migrated: true, migratedAt: Date.now() }, { merge: true }), 'migrateFromLocalStorage:markMigrated');
    localStorage.clear();
    return true;
}
