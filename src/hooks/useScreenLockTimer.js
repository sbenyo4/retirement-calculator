import { useCallback, useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'input'];

export function useScreenLockTimer({ timeoutMinutes = 2, enabled = true, onLock }) {
    const timerRef = useRef(null);

    const resetTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (!enabled) return;

        timerRef.current = setTimeout(() => {
            onLock?.();
        }, timeoutMinutes * 60 * 1000);
    }, [enabled, onLock, timeoutMinutes]);

    useEffect(() => {
        if (!enabled) {
            if (timerRef.current) clearTimeout(timerRef.current);
            return undefined;
        }

        ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, resetTimer, { capture: true, passive: true }));
        resetTimer();

        return () => {
            ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, resetTimer, { capture: true }));
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [enabled, resetTimer]);

    return { resetTimer };
}
