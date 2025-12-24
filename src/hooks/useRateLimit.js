import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'ai_usage_data';

// Rate limit configuration
const DEFAULT_LIMITS = {
    daily: 10,      // 10 calls per day (reset at midnight)
    hourly: 3,      // 3 calls per hour
    perMinute: 1    // 1 call per minute (debounce protection)
};

/**
 * Custom hook for rate limiting AI API calls
 * @param {string} userId - User identifier (from auth or 'guest')
 * @returns {Object} Rate limit state and helpers
 */
export function useRateLimit(userId = 'guest') {
    const [usageData, setUsageData] = useState(null);
    const [isLimited, setIsLimited] = useState(false);
    const [timeUntilReset, setTimeUntilReset] = useState(null);

    // Load usage data from localStorage
    useEffect(() => {
        const loadUsageData = () => {
            const stored = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
            if (stored) {
                try {
                    const data = JSON.parse(stored);
                    // Clean old data (older than 7 days)
                    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                    data.calls = data.calls.filter(call => call.timestamp > weekAgo);
                    return data;
                } catch (e) {
                    console.error('Failed to parse usage data:', e);
                }
            }
            return { calls: [] };
        };

        setUsageData(loadUsageData());
    }, [userId]);

    // Save usage data to localStorage
    useEffect(() => {
        if (usageData) {
            localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(usageData));
        }
    }, [usageData, userId]);

    /**
     * Check if rate limit is exceeded
     * @returns {Object} { allowed: boolean, reason: string, resetTime: Date, current: number, limit: number }
     */
    const checkRateLimit = useCallback(() => {
        if (!usageData) return { allowed: true };

        const now = Date.now();
        const calls = usageData.calls;

        // Check per-minute limit
        const lastMinute = now - 60 * 1000;
        const callsLastMinute = calls.filter(c => c.timestamp > lastMinute).length;
        if (callsLastMinute >= DEFAULT_LIMITS.perMinute) {
            const oldestCall = calls.find(c => c.timestamp > lastMinute);
            const resetTime = new Date(oldestCall.timestamp + 60 * 1000);
            return {
                allowed: false,
                reason: 'minute',
                resetTime,
                current: callsLastMinute,
                limit: DEFAULT_LIMITS.perMinute
            };
        }

        // Check hourly limit
        const lastHour = now - 60 * 60 * 1000;
        const callsLastHour = calls.filter(c => c.timestamp > lastHour).length;
        if (callsLastHour >= DEFAULT_LIMITS.hourly) {
            const oldestCall = calls.find(c => c.timestamp > lastHour);
            const resetTime = new Date(oldestCall.timestamp + 60 * 60 * 1000);
            return {
                allowed: false,
                reason: 'hour',
                resetTime,
                current: callsLastHour,
                limit: DEFAULT_LIMITS.hourly
            };
        }

        // Check daily limit
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const callsToday = calls.filter(c => c.timestamp > startOfDay.getTime()).length;
        if (callsToday >= DEFAULT_LIMITS.daily) {
            const tomorrow = new Date(startOfDay);
            tomorrow.setDate(tomorrow.getDate() + 1);
            return {
                allowed: false,
                reason: 'day',
                resetTime: tomorrow,
                current: callsToday,
                limit: DEFAULT_LIMITS.daily
            };
        }

        return { allowed: true };
    }, [usageData]);

    /**
     * Record a new AI call
     * @param {string} provider - AI provider used
     * @param {string} model - Model used
     */
    const recordCall = useCallback((provider, model) => {
        setUsageData(prev => ({
            ...prev,
            calls: [
                ...prev.calls,
                {
                    timestamp: Date.now(),
                    provider,
                    model
                }
            ]
        }));
    }, []);

    /**
     * Get usage statistics
     * @returns {Object} Usage stats
     */
    const getUsageStats = useCallback(() => {
        if (!usageData) return { today: 0, thisHour: 0, thisMinute: 0, limits: DEFAULT_LIMITS };

        const now = Date.now();
        const calls = usageData.calls;

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        return {
            today: calls.filter(c => c.timestamp > startOfDay.getTime()).length,
            thisHour: calls.filter(c => c.timestamp > now - 60 * 60 * 1000).length,
            thisMinute: calls.filter(c => c.timestamp > now - 60 * 1000).length,
            total: calls.length,
            limits: DEFAULT_LIMITS
        };
    }, [usageData]);

    /**
     * Reset usage data (for development/testing)
     */
    const resetUsage = useCallback(() => {
        setUsageData({ calls: [] });
    }, []);

    // Update isLimited state
    useEffect(() => {
        const check = checkRateLimit();
        setIsLimited(!check.allowed);
        if (!check.allowed && check.resetTime) {
            setTimeUntilReset(check.resetTime);
        } else {
            setTimeUntilReset(null);
        }
    }, [checkRateLimit]);

    return {
        isLimited,
        timeUntilReset,
        checkRateLimit,
        recordCall,
        getUsageStats,
        resetUsage
    };
}
