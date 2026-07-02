import { useState, useEffect, useRef } from 'react';
import { useDebouncedValue } from './useDebounce';
import { useDeepCompareMemo } from './useDeepCompare';
import { useSimulationWorker } from './useSimulationWorker';
import { WITHDRAWAL_STRATEGIES } from '../constants';

/**
 * Encapsulates the core calculation pipeline: debouncing, projection,
 * goal-seek, and simulation triggering.
 *
 * Projection + goal-seek run off the main thread via the Web Worker.
 * Simulation (Monte Carlo / conservative / optimistic) also runs off-thread.
 *
 * @param {Object} inputs - Current retirement inputs from useRetirementData
 * @param {Object} settings - App settings from useAppSettings (needs calculationMode, simulationType)
 * @returns {{ results, simulationResults, validationError, simulationError, isCalculating, goalSeekWithdrawal, memoizedDebouncedInputs }}
 */
export function useCalculation(inputs, settings) {
    const [results, setResults] = useState(null);
    const [simulationResults, setSimulationResults] = useState(null);
    const [validationError, setValidationError] = useState(null);
    const [simulationError, setSimulationError] = useState(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [goalSeekWithdrawal, setGoalSeekWithdrawal] = useState(null);

    // Refs for simulation change detection
    const lastSimInputs = useRef(null);
    const lastSimType = useRef(null);
    // Generation counter: incremented on each effect run so stale async results are discarded.
    const generationRef = useRef(0);

    const { runSimulation, runProjection } = useSimulationWorker();
    const { calculationMode, simulationType } = settings;

    // Debounce inputs for heavy calculations (300ms delay)
    const debouncedInputs = useDebouncedValue(inputs, 300);

    // Use deep comparison memo for efficient change detection (replaces JSON.stringify)
    const memoizedDebouncedInputs = useDeepCompareMemo(debouncedInputs);

    // Standard Mathematical Calculation & Simulation
    // memoizedDebouncedInputs is a stable reference — only changes when values actually differ (deep equality).
    // Using it as the sole inputs dependency prevents spurious recalculations on every debounce tick
    // when the user hasn't actually changed anything meaningful.
    useEffect(() => {
        // Every input/settings change invalidates any in-flight worker response,
        // including changes that make the current form temporarily invalid.
        const generation = ++generationRef.current;

        const age = parseFloat(memoizedDebouncedInputs.currentAge);
        const retirementStart = parseFloat(memoizedDebouncedInputs.retirementStartAge);
        const retirementEnd = parseFloat(memoizedDebouncedInputs.retirementEndAge);

        // Basic validation to prevent obviously broken inputs
        // Include age sequence validation to prevent console errors during profile loading
        if (
            !isNaN(age) && age >= 0 && age <= 120 &&
            !isNaN(retirementStart) && retirementStart >= 0 && retirementStart <= 120 &&
            !isNaN(retirementEnd) && retirementEnd >= 0 && retirementEnd <= 120 &&
            retirementStart >= age && retirementEnd > retirementStart
        ) {
            setValidationError(null);
            setIsCalculating(true);

            // Capture generation and settings for the async callback closure.
            // If inputs change before the worker responds, the stale result is discarded.
            runProjection(
                memoizedDebouncedInputs,
                ({ projection, goalSeekWithdrawal: gsw }) => {
                    if (generationRef.current !== generation) return; // stale — discard

                    setIsCalculating(false);
                    setResults(projection);
                    setGoalSeekWithdrawal(gsw ?? null);

                    // Handle Simulation Mode (async via Web Worker)
                    // Also auto-trigger Monte Carlo for Dynamic strategy even in mathematical mode
                    const isDynamicStrategy = memoizedDebouncedInputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.DYNAMIC;
                    if (calculationMode === 'simulations' || calculationMode === 'compare' || isDynamicStrategy) {
                        const shouldUpdate =
                            lastSimInputs.current !== memoizedDebouncedInputs ||
                            lastSimType.current !== simulationType;

                        if (shouldUpdate) {
                            lastSimInputs.current = memoizedDebouncedInputs;
                            lastSimType.current = simulationType;

                            runSimulation(
                                memoizedDebouncedInputs,
                                simulationType,
                                (result) => {
                                    if (generationRef.current !== generation) return; // stale — discard
                                    setSimulationError(null);
                                    setSimulationResults(result);
                                },
                                (errorMessage) => {
                                    if (generationRef.current !== generation) return; // stale — discard
                                    console.error('Simulation error:', errorMessage);
                                    setSimulationError(errorMessage);
                                }
                            );
                        }
                    }
                    // We intentionally DO NOT clear simulationResults here so they persist when switching modes
                },
                (errorMessage) => {
                    if (generationRef.current !== generation) return; // stale — discard
                    console.error('Calculation error:', errorMessage);
                    setIsCalculating(false);
                    setValidationError(errorMessage);
                    setResults(null);
                }
            );
        } else {
            // Clear results when basic age validation fails
            setIsCalculating(false);
            setValidationError(null); // Don't show error for incomplete inputs
            setResults(null);
            setSimulationResults(null);
        }
    }, [memoizedDebouncedInputs, calculationMode, simulationType, runProjection, runSimulation]);

    return {
        results,
        simulationResults,
        validationError,
        simulationError,
        isCalculating,
        dismissSimulationError: () => setSimulationError(null),
        goalSeekWithdrawal,
        memoizedDebouncedInputs
    };
}
