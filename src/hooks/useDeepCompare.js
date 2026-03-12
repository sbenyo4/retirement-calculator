import { useRef, useEffect } from 'react';

/**
 * Optimized deep equality check for objects
 * Uses early bailout and avoids unnecessary array operations
 * @param {*} obj1
 * @param {*} obj2
 * @returns {boolean}
 */
export function deepEqual(obj1, obj2) {
    // Fast path: reference equality
    if (obj1 === obj2) return true;

    // Handle null/undefined (treat them as equal)
    if (obj1 == null && obj2 == null) return true;
    if (obj1 == null || obj2 == null) return false;

    // Handle primitives and functions
    const type1 = typeof obj1;
    const type2 = typeof obj2;
    if (type1 !== type2) return false;
    if (type1 !== 'object') return obj1 === obj2;

    // Handle arrays
    const isArr1 = Array.isArray(obj1);
    const isArr2 = Array.isArray(obj2);
    if (isArr1 !== isArr2) return false;

    if (isArr1) {
        if (obj1.length !== obj2.length) return false;
        for (let i = 0; i < obj1.length; i++) {
            if (!deepEqual(obj1[i], obj2[i])) return false;
        }
        return true;
    }

    // Handle Date objects
    if (obj1 instanceof Date && obj2 instanceof Date) {
        return obj1.getTime() === obj2.getTime();
    }

    // Handle plain objects
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    // Use Set for O(1) lookup instead of includes() which is O(n)
    const keys2Set = new Set(keys2);

    for (let i = 0; i < keys1.length; i++) {
        const key = keys1[i];
        if (!keys2Set.has(key)) return false;
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
