import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCalculation } from './useCalculation';

// Mock the worker hook so tests control when/how projection and simulation resolve.
vi.mock('./useSimulationWorker');
import { useSimulationWorker } from './useSimulationWorker';

const validInputs = {
    currentAge: 30,
    retirementStartAge: 50,
    retirementEndAge: 70,
    currentSavings: 100000,
    monthlyContribution: 1000,
    monthlyNetIncomeDesired: 4000,
    annualReturnRate: 5,
    taxRate: 25,
};

const mathSettings = { calculationMode: 'mathematical', simulationType: 'monte_carlo' };
const simSettings = { calculationMode: 'simulations', simulationType: 'monte_carlo' };

const fakeProjection = { balanceAtRetirement: 500000, balanceAtEnd: 100000 };

let mockRunProjection;
let mockRunSimulation;

beforeEach(() => {
    mockRunProjection = vi.fn();
    mockRunSimulation = vi.fn();
    vi.mocked(useSimulationWorker).mockReturnValue({
        runProjection: mockRunProjection,
        runSimulation: mockRunSimulation,
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

// NOTE: useDebouncedValue initialises with useState(value), so the initial debouncedInputs
// equals validInputs immediately — no timer advancement needed for the initial render.

describe('useCalculation', () => {
    describe('input validation', () => {
        it('returns null results and does not call runProjection for invalid age sequence', () => {
            const bad = { ...validInputs, currentAge: 60, retirementStartAge: 50 };
            const { result } = renderHook(() => useCalculation(bad, mathSettings));

            expect(result.current.results).toBeNull();
            expect(mockRunProjection).not.toHaveBeenCalled();
        });

        it('returns null results without validationError for incomplete inputs', () => {
            const bad = { ...validInputs, currentAge: NaN };
            const { result } = renderHook(() => useCalculation(bad, mathSettings));

            expect(result.current.results).toBeNull();
            expect(result.current.validationError).toBeNull();
        });
    });

    describe('projection', () => {
        it('calls runProjection on mount and sets results (no timer needed — initial value is immediate)', () => {
            mockRunProjection.mockImplementation((inputs, onResult) => {
                onResult({ projection: fakeProjection, goalSeekWithdrawal: null });
            });

            const { result } = renderHook(() => useCalculation(validInputs, mathSettings));

            expect(mockRunProjection).toHaveBeenCalledOnce();
            expect(result.current.results).toEqual(fakeProjection);
            expect(result.current.goalSeekWithdrawal).toBeNull();
        });

        it('sets goalSeekWithdrawal when projection returns one', () => {
            mockRunProjection.mockImplementation((inputs, onResult) => {
                onResult({ projection: fakeProjection, goalSeekWithdrawal: 3500 });
            });

            const { result } = renderHook(() => useCalculation(validInputs, mathSettings));

            expect(result.current.goalSeekWithdrawal).toBe(3500);
        });

        it('sets validationError and clears results when projection fails', () => {
            mockRunProjection.mockImplementation((inputs, onResult, onError) => {
                onError('calculation exploded');
            });

            const { result } = renderHook(() => useCalculation(validInputs, mathSettings));

            expect(result.current.validationError).toBe('calculation exploded');
            expect(result.current.results).toBeNull();
        });
    });

    describe('stale-result guard', () => {
        it('discards a projection result that arrived after inputs changed', () => {
            vi.useFakeTimers();

            let firstResolve;
            mockRunProjection
                .mockImplementationOnce((inputs, onResult) => {
                    // Hold first response — resolve it after the second call fires
                    firstResolve = () => onResult({ projection: { balanceAtRetirement: 1 }, goalSeekWithdrawal: null });
                })
                .mockImplementation((inputs, onResult) => {
                    onResult({ projection: fakeProjection, goalSeekWithdrawal: null });
                });

            const { result, rerender } = renderHook(
                ({ inputs }) => useCalculation(inputs, mathSettings),
                { initialProps: { inputs: validInputs } }
            );

            // Initial render fired first runProjection (held in firstResolve)
            expect(mockRunProjection).toHaveBeenCalledTimes(1);

            // Change inputs — debounce starts a 300ms timer
            rerender({ inputs: { ...validInputs, currentSavings: 200000 } });

            // Advance past the debounce — fires the second runProjection (resolves immediately)
            act(() => { vi.advanceTimersByTime(350); });

            expect(mockRunProjection).toHaveBeenCalledTimes(2);
            expect(result.current.results).toEqual(fakeProjection);

            // Now resolve the stale first response — must NOT overwrite the current result
            act(() => { firstResolve(); });

            expect(result.current.results).toEqual(fakeProjection);
            expect(result.current.results.balanceAtRetirement).toBe(500000); // NOT 1
        });

        it('discards a projection result that arrives after inputs become invalid', () => {
            vi.useFakeTimers();

            let firstResolve;
            mockRunProjection.mockImplementationOnce((inputs, onResult) => {
                firstResolve = () => onResult({ projection: fakeProjection, goalSeekWithdrawal: null });
            });

            const { result, rerender } = renderHook(
                ({ inputs }) => useCalculation(inputs, mathSettings),
                { initialProps: { inputs: validInputs } }
            );

            expect(mockRunProjection).toHaveBeenCalledTimes(1);

            rerender({ inputs: { ...validInputs, currentAge: 60, retirementStartAge: 50 } });
            act(() => { vi.advanceTimersByTime(350); });

            expect(mockRunProjection).toHaveBeenCalledTimes(1);
            expect(result.current.results).toBeNull();

            act(() => { firstResolve(); });

            expect(result.current.results).toBeNull();
        });
    });

    describe('simulation', () => {
        it('calls runSimulation when calculationMode is simulations', () => {
            mockRunProjection.mockImplementation((inputs, onResult) => {
                onResult({ projection: fakeProjection, goalSeekWithdrawal: null });
            });
            mockRunSimulation.mockImplementation((inputs, type, onResult) => {
                onResult({ isMonteCarlo: true, balanceAtEnd: 80000 });
            });

            const { result } = renderHook(() => useCalculation(validInputs, simSettings));

            expect(mockRunSimulation).toHaveBeenCalledOnce();
            expect(result.current.simulationResults).toBeDefined();
        });

        it('does not call runSimulation in mathematical mode', () => {
            mockRunProjection.mockImplementation((inputs, onResult) => {
                onResult({ projection: fakeProjection, goalSeekWithdrawal: null });
            });

            const { result } = renderHook(() => useCalculation(validInputs, mathSettings));

            expect(result.current.results).toEqual(fakeProjection);
            expect(mockRunSimulation).not.toHaveBeenCalled();
        });

        it('sets simulationError when runSimulation fails', () => {
            mockRunProjection.mockImplementation((inputs, onResult) => {
                onResult({ projection: fakeProjection, goalSeekWithdrawal: null });
            });
            mockRunSimulation.mockImplementation((inputs, type, onResult, onError) => {
                onError('Monte Carlo exploded');
            });

            const { result } = renderHook(() => useCalculation(validInputs, simSettings));

            expect(result.current.simulationError).toBe('Monte Carlo exploded');
        });

        it('clears simulationError on successful simulation after a prior failure', () => {
            mockRunProjection.mockImplementation((inputs, onResult) => {
                onResult({ projection: fakeProjection, goalSeekWithdrawal: null });
            });
            // First call fails
            mockRunSimulation
                .mockImplementationOnce((inputs, type, onResult, onError) => onError('boom'))
                .mockImplementation((inputs, type, onResult) => onResult({ isMonteCarlo: true }));

            vi.useFakeTimers();

            const { result, rerender } = renderHook(
                ({ settings }) => useCalculation(validInputs, settings),
                { initialProps: { settings: simSettings } }
            );

            expect(result.current.simulationError).toBe('boom');

            // Change simulationType → triggers a new simulation run (cache miss on lastSimType)
            const newSettings = { ...simSettings, simulationType: 'conservative' };
            rerender({ settings: newSettings });
            act(() => { vi.advanceTimersByTime(350); });

            expect(result.current.simulationError).toBeNull();
        });

        it('dismissSimulationError clears the error immediately', () => {
            mockRunProjection.mockImplementation((inputs, onResult) => {
                onResult({ projection: fakeProjection, goalSeekWithdrawal: null });
            });
            mockRunSimulation.mockImplementation((inputs, type, onResult, onError) => {
                onError('boom');
            });

            const { result } = renderHook(() => useCalculation(validInputs, simSettings));
            expect(result.current.simulationError).toBe('boom');

            act(() => { result.current.dismissSimulationError(); });

            expect(result.current.simulationError).toBeNull();
        });
    });
});
