import { useState, useEffect, useRef } from 'react';

/**
 * Debounced value hook - delays updating the value until after the specified delay
 * @param {*} value - The value to debounce
 * @param {number} delay - Delay in milliseconds (default 300ms)
 * @returns {*} - The debounced value
 */
export function useDebouncedValue(value, delay = 300) {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}

/**
 * Debounced callback hook - returns a debounced version of the callback
 * @param {Function} callback - The callback to debounce  
 * @param {number} delay - Delay in milliseconds (default 300ms)
 * @returns {Function} - The debounced callback
 */
export function useDebouncedCallback(callback, delay = 300) {
    const timeoutRef = useRef(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return (...args) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            callback(...args);
        }, delay);
    };
}
