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
        const currentRequestId = ++requestIdRef.current;

        if (workerRef.current) {
            callbacksRef.current = { requestId: currentRequestId, onResult, onError };
            workerRef.current.postMessage({ requestId: currentRequestId, inputs, simulationType });
        } else {
            try {
                const result = calculateSimulation(inputs, simulationType);
                onResult(result);
            } catch (err) {
                onError(err.message);
            }
        }
    }, []);

    return { runSimulation };
}
