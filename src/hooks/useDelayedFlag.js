import { useState, useEffect } from 'react';

/**
 * Returns false for the first `delay` ms after `value` becomes true.
 * If value reverts to false before the delay expires, stays false.
 * Use this to avoid flashing a spinner for fast operations.
 */
export function useDelayedFlag(value, delay = 100) {
    const [delayed, setDelayed] = useState(false);
    useEffect(() => {
        if (!value) {
            setDelayed(false);
            return;
        }
        const id = setTimeout(() => setDelayed(true), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return delayed;
}
