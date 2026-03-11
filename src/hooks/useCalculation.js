import { useState, useEffect, useRef } from 'react';
import { useDebouncedValue } from './useDebounce';
import { useDeepCompareMemo } from './useDeepCompare';
import { calculateRetirementProjection } from '../utils/calculator';
import { calculateSimulation } from '../utils/simulation-calculator';
import { WITHDRAWAL_STRATEGIES } from '../constants';

/**
 * Encapsulates the core calculation pipeline: debouncing, projection,
 * goal-seek, and simulation triggering.
 *
 * @param {Object} inputs - Current retirement inputs from useRetirementData
 * @param {Object} settings - App settings from useAppSettings (needs calculationMode, simulationType)
 * @param {Function} t - Translation function
 * @returns {{ results, simulationResults, validationError, goalSeekWithdrawal, memoizedDebouncedInputs }}
 */
export function useCalculation(inputs, settings, t) {
    const [results, setResults] = useState(null);
    const [simulationResults, setSimulationResults] = useState(null);
    const [validationError, setValidationError] = useState(null);
    const [goalSeekWithdrawal, setGoalSeekWithdrawal] = useState(null);

    // Refs for simulation change detection
    const lastSimInputs = useRef(null);
    const lastSimType = useRef(null);

    // Debounce inputs for heavy calculations (300ms delay)
    const debouncedInputs = useDebouncedValue(inputs, 300);

    // Use deep comparison memo for efficient change detection (replaces JSON.stringify)
    const memoizedDebouncedInputs = useDeepCompareMemo(debouncedInputs);

    // Standard Mathematical Calculation & Simulation
    useEffect(() => {
        const age = parseFloat(debouncedInputs.currentAge);
        const retirementStart = parseFloat(debouncedInputs.retirementStartAge);
        const retirementEnd = parseFloat(debouncedInputs.retirementEndAge);

        // Basic validation to prevent obviously broken inputs
        // Include age sequence validation to prevent console errors during profile loading
        if (
            !isNaN(age) && age >= 0 && age <= 120 &&
            !isNaN(retirementStart) && retirementStart >= 0 && retirementStart <= 120 &&
            !isNaN(retirementEnd) && retirementEnd >= 0 && retirementEnd <= 120 &&
            retirementStart > age && retirementEnd > retirementStart
        ) {
            try {
                // Clear validation error on successful calculation
                setValidationError(null);

                let projection = calculateRetirementProjection(debouncedInputs, t);

                // Goal-seek: if targetEndBalance is set, find withdrawal that achieves it
                const targetEnd = parseFloat(debouncedInputs.targetEndBalance);
                if (!isNaN(targetEnd) && targetEnd >= 0 && debouncedInputs.targetEndBalance !== '') {
                    let lo = 0;
                    let hi = projection.balanceAtRetirement / ((retirementEnd - retirementStart) * 12) * 3; // upper bound
                    for (let iter = 0; iter < 25; iter++) {
                        const mid = (lo + hi) / 2;
                        const testResult = calculateRetirementProjection({
                            ...debouncedInputs,
                            monthlyNetIncomeDesired: mid,
                            targetEndBalance: '' // prevent recursion
                        }, t);
                        if (testResult.balanceAtEnd > targetEnd) {
                            lo = mid;
                        } else {
                            hi = mid;
                        }
                    }
                    const optimalWithdrawal = Math.round((lo + hi) / 2);
                    projection = calculateRetirementProjection({
                        ...debouncedInputs,
                        monthlyNetIncomeDesired: optimalWithdrawal,
                        targetEndBalance: ''
                    }, t);
                    setGoalSeekWithdrawal(optimalWithdrawal);
                } else {
                    setGoalSeekWithdrawal(null);
                }

                setResults(projection);

                // Handle Simulation Mode
                // Also auto-trigger Monte Carlo for Dynamic strategy even in mathematical mode
                const isDynamicStrategy = debouncedInputs.withdrawalStrategy === WITHDRAWAL_STRATEGIES.DYNAMIC;
                if (settings.calculationMode === 'simulations' || settings.calculationMode === 'compare' || isDynamicStrategy) {
                    // Only calculate if inputs or type changed, or if we don't have results yet
                    // Use deep comparison for efficient change detection
                    const shouldUpdate =
                        !simulationResults ||
                        lastSimInputs.current !== memoizedDebouncedInputs ||
                        lastSimType.current !== settings.simulationType;

                    if (shouldUpdate) {
                        const simResult = calculateSimulation(debouncedInputs, settings.simulationType);
                        setSimulationResults(simResult);
                        lastSimInputs.current = memoizedDebouncedInputs;
                        lastSimType.current = settings.simulationType;
                    }
                }
                // We intentionally DO NOT clear simulationResults here so they persist when switching modes
            } catch (error) {
                // Catch validation errors from calculator and display to user
                console.error('Calculation error:', error);
                setValidationError(error.message);
                setResults(null); // Clear results when there's a validation error
            }
        } else {
            // Clear results when basic age validation fails
            setValidationError(null); // Don't show error for incomplete inputs
            setResults(null);
        }
    }, [debouncedInputs, memoizedDebouncedInputs, settings.calculationMode, settings.simulationType]);

    return {
        results,
        simulationResults,
        validationError,
        goalSeekWithdrawal,
        memoizedDebouncedInputs
    };
}
