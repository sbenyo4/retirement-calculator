import { useState, useEffect, useRef, useCallback } from 'react';

const WARNING_SECONDS = 30;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

export function useIdleTimer({ timeoutMinutes = 5, onLogout, enabled = true, trackActivity = true }) {
    const [warningActive, setWarningActive] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS);

    const idleTimerRef = useRef(null);
    const countdownRef = useRef(null);
    const warningActiveRef = useRef(false);
    const trackActivityRef = useRef(trackActivity);

    useEffect(() => {
        trackActivityRef.current = trackActivity;
    }, [trackActivity]);

    const clearCountdown = useCallback(() => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
    }, []);

    const startCountdown = useCallback(() => {
        warningActiveRef.current = true;
        setWarningActive(true);
        setSecondsLeft(WARNING_SECONDS);
        let remaining = WARNING_SECONDS;

        clearCountdown();
        countdownRef.current = setInterval(() => {
            remaining -= 1;
            setSecondsLeft(remaining);
            if (remaining <= 0) {
                clearCountdown();
                onLogout?.();
            }
        }, 1000);
    }, [onLogout, clearCountdown]);

    const resetTimer = useCallback(() => {
        if (!enabled) return;
        clearCountdown();
        warningActiveRef.current = false;
        setWarningActive(false);
        setSecondsLeft(WARNING_SECONDS);

        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        const idleMs = (timeoutMinutes * 60 - WARNING_SECONDS) * 1000;
        idleTimerRef.current = setTimeout(startCountdown, idleMs);
    }, [enabled, timeoutMinutes, startCountdown, clearCountdown]);

    // Activity listener
    useEffect(() => {
        if (!enabled) return;

        const handleActivity = () => {
            // Ignore activity while warning is shown — user must click the button
            if (warningActiveRef.current || !trackActivityRef.current) return;
            resetTimer();
        };

        ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
        resetTimer(); // start timer on mount

        return () => {
            ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity));
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            clearCountdown();
        };
    }, [enabled, resetTimer, clearCountdown]);

    return { warningActive, secondsLeft, resetTimer };
}
