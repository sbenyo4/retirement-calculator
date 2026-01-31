/**
 * Safe localStorage utilities with quota and error handling
 */

/**
 * Safely set an item in localStorage with error handling
 * @param {string} key - The storage key
 * @param {string} value - The value to store (should be a string)
 * @returns {{ success: boolean, error?: 'quota' | 'unknown' }}
 */
export function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return { success: true };
    } catch (e) {
        // Handle quota exceeded error (different browsers use different properties)
        if (
            e.name === 'QuotaExceededError' ||
            e.code === 22 ||
            e.code === 1014 || // Firefox
            (e.name === 'NS_ERROR_DOM_QUOTA_REACHED') // Firefox
        ) {
            console.error('localStorage quota exceeded:', key, e);
            return { success: false, error: 'quota' };
        }
        console.error('localStorage save error:', key, e);
        return { success: false, error: 'unknown' };
    }
}

/**
 * Safely set a JSON object in localStorage
 * @param {string} key - The storage key
 * @param {*} value - The value to store (will be JSON.stringify'd)
 * @returns {{ success: boolean, error?: 'quota' | 'serialize' | 'unknown' }}
 */
export function safeLocalStorageSetJSON(key, value) {
    try {
        const serialized = JSON.stringify(value);
        return safeLocalStorageSet(key, serialized);
    } catch (e) {
        if (e instanceof TypeError) {
            console.error('Failed to serialize value for localStorage:', key, e);
            return { success: false, error: 'serialize' };
        }
        return { success: false, error: 'unknown' };
    }
}

/**
 * Safely get a JSON object from localStorage
 * @param {string} key - The storage key
 * @param {*} defaultValue - Default value if key doesn't exist or parsing fails
 * @returns {*} The parsed value or defaultValue
 */
export function safeLocalStorageGetJSON(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        if (item === null) {
            return defaultValue;
        }
        return JSON.parse(item);
    } catch (e) {
        console.error('Failed to parse localStorage item:', key, e);
        return defaultValue;
    }
}

/**
 * Safely remove an item from localStorage
 * @param {string} key - The storage key
 * @returns {{ success: boolean }}
 */
export function safeLocalStorageRemove(key) {
    try {
        localStorage.removeItem(key);
        return { success: true };
    } catch (e) {
        console.error('Failed to remove localStorage item:', key, e);
        return { success: false };
    }
}

/**
 * Get approximate localStorage usage info
 * @returns {{ used: number, available: number, percentage: number } | null}
 */
export function getStorageUsage() {
    try {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                const value = localStorage.getItem(key);
                total += key.length + (value?.length || 0);
            }
        }
        // Most browsers allow ~5MB
        const maxSize = 5 * 1024 * 1024;
        return {
            used: total,
            available: maxSize - total,
            percentage: Math.round((total / maxSize) * 100)
        };
    } catch (e) {
        return null;
    }
}
