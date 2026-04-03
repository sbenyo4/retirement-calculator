import { useState, useEffect, useCallback } from 'react';
import { getRateLimitData, setRateLimitData } from '../utils/db';

// Rate limit configuration
const DEFAULT_LIMITS = {
    daily: 10,      // 10 calls per day (reset at midnight)
    hourly: 3,      // 3 calls per hour
    perMinute: 1    // 1 call per minute (debounce protection)
};

/**
 * Custom hook for rate limiting AI API calls
 * @param {string} userId - User identifier (from auth)
 * @returns {Object} Rate limit state and helpers
 */
export function useRateLimit(userId) {
    const [usageData, setUsageData] = useState(null);
    const [isLimited, setIsLimited] = useState(false);
    const [timeUntilReset, setTimeUntilReset] = useState(null);
    const [loaded, setLoaded] = useState(false);

    // Load usage data from Firestore
    useEffect(() => {
        if (!userId) return;

        getRateLimitData(userId).then(data => {
            // Clean old data (older than 7 days)
            const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            if (data.calls) {
                data.calls = data.calls.filter(call => call.timestamp > weekAgo);
            } else {
                data.calls = [];
            }
            setUsageData(data);
            setLoaded(true);
        }).catch(err => {
            console.error('Error loading rate limit data:', err);
            setUsageData({ calls: [] });
            setLoaded(true);
        });
    }, [userId]);

    // Save usage data to Firestore when it changes
    useEffect(() => {
        if (usageData && loaded && userId) {
            setRateLimitData(userId, usageData).catch(err => {
                console.error('Error saving rate limit data:', err);
            });
        }
    }, [usageData, userId, loaded]);

    /**
     * Check if rate limit is exceeded
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
     */
    const recordCall = useCallback((provider, model) => {
        setUsageData(prev => {
            const base = prev ?? { calls: [] };
            return {
                ...base,
                calls: [...base.calls, { timestamp: Date.now(), provider, model }],
            };
        });
    }, []);

    /**
     * Get usage statistics
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
     * Reset usage data
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
