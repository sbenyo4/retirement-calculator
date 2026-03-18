import { useRef, useCallback, useEffect } from 'react';
import { calculateSimulation } from '../utils/simulation-calculator';

/**
 * Manages a Web Worker for simulation calculations.
 * Falls back to synchronous execution when Worker is unavailable (tests, CSP).
 */
export function useSimulationWorker() {
    const workerRef = useRef(null);
    const requestIdRef = useRef(0);
    const callbacksRef = useRef(null);
    // Single-entry cache: avoids re-running expensive simulations (e.g. Monte Carlo)
    // when called with identical inputs (React Strict Mode, defensive against future refactors).
    const cacheRef = useRef({ key: null, result: null });

    useEffect(() => {
        try {
            const worker = new Worker(
                new URL('../workers/simulation.worker.js', import.meta.url),
                { type: 'module' }
            );

            worker.onmessage = (e) => {
                const { requestId, result, error } = e.data;
                const pending = callbacksRef.current;

                if (!pending || pending.requestId !== requestId) {
                    return;
                }

                if (error) {
                    pending.onError(error);
                } else {
                    pending.onResult(result);
                }

                callbacksRef.current = null;
            };

            worker.onerror = (e) => {
                console.error('Simulation worker error:', e);
                workerRef.current = null;
            };

            workerRef.current = worker;
        } catch {
            workerRef.current = null;
        }

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
            callbacksRef.current = null;
        };
    }, []);

    const runSimulation = useCallback((inputs, simulationType, onResult, onError) => {
        const cacheKey = simulationType + '|' + JSON.stringify(inputs);
        if (cacheRef.current.key === cacheKey && cacheRef.current.result !== null) {
            onResult(cacheRef.current.result);
            return;
        }

        const currentRequestId = ++requestIdRef.current;

        const handleResult = (result) => {
            cacheRef.current = { key: cacheKey, result };
            onResult(result);
        };

        if (workerRef.current) {
            callbacksRef.current = { requestId: currentRequestId, onResult: handleResult, onError };
            workerRef.current.postMessage({ requestId: currentRequestId, inputs, simulationType });
        } else {
            try {
                const result = calculateSimulation(inputs, simulationType);
                handleResult(result);
            } catch (err) {
                onError(err.message);
            }
        }
    }, []);

    return { runSimulation };
}
