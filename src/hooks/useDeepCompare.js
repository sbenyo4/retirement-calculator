import { useRef, useEffect } from 'react';

/**
 * Deep equality check for objects
 * @param {*} obj1 
 * @param {*} obj2 
 * @returns {boolean}
 */
export function deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;

    if (obj1 == null || obj2 == null) return obj1 === obj2;

    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return obj1 === obj2;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        if (!keys2.includes(key)) return false;
        if (!deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
}

/**
 * Custom hook for deep comparison of values
 * Returns a memoized reference that only changes when the value actually changes
 * More efficient than JSON.stringify
 * 
 * @param {*} value - The value to track
 * @returns {*} - Stable reference to the value
 */
export function useDeepCompareMemo(value) {
    const ref = useRef(value);

    if (!deepEqual(value, ref.current)) {
        ref.current = value;
    }

    return ref.current;
}

/**
 * useEffect with deep comparison of dependencies
 * @param {Function} callback 
 * @param {Array} dependencies 
 */
export function useDeepCompareEffect(callback, dependencies) {
    const depsRef = useRef(dependencies);

    if (!deepEqual(dependencies, depsRef.current)) {
        depsRef.current = dependencies;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(callback, depsRef.current);
}

export default useDeepCompareMemo;
