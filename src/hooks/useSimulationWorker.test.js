import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulationWorker } from './useSimulationWorker';
import * as simulationCalculator from '../utils/simulation-calculator';
import * as calculator from '../utils/calculator';

// Force Worker to be unavailable so the hook always uses the sync fallback.
// (jsdom does not support real Web Workers.)
beforeEach(() => {
    vi.stubGlobal('Worker', undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const baseInputs = {
    currentAge: 30,
    retirementStartAge: 50,
    retirementEndAge: 70,
    currentSavings: 100000,
    monthlyContribution: 1000,
    monthlyNetIncomeDesired: 4000,
    annualReturnRate: 5,
    taxRate: 25,
};

describe('useSimulationWorker — sync fallback', () => {
    describe('runSimulation', () => {
        it('calls calculateSimulation and passes result to onResult', () => {
            const { result } = renderHook(() => useSimulationWorker());
            const onResult = vi.fn();
            const onError = vi.fn();

            act(() => {
                result.current.runSimulation(baseInputs, 'conservative', onResult, onError);
            });

            expect(onResult).toHaveBeenCalledOnce();
            expect(onError).not.toHaveBeenCalled();
            const simResult = onResult.mock.calls[0][0];
            expect(simResult).toBeDefined();
            expect(simResult.balanceAtRetirement).toBeGreaterThan(0);
        });

        it('caches result: identical inputs+type call calculateSimulation only once', () => {
            const spy = vi.spyOn(simulationCalculator, 'calculateSimulation');
            const { result } = renderHook(() => useSimulationWorker());
            const onResult = vi.fn();

            act(() => {
                result.current.runSimulation(baseInputs, 'conservative', onResult, vi.fn());
                result.current.runSimulation(baseInputs, 'conservative', onResult, vi.fn());
            });

            expect(spy).toHaveBeenCalledOnce();
            expect(onResult).toHaveBeenCalledTimes(2); // both got the (cached) result
        });

        it('cache miss on different simulationType', () => {
            const spy = vi.spyOn(simulationCalculator, 'calculateSimulation');
            const { result } = renderHook(() => useSimulationWorker());

            act(() => {
                result.current.runSimulation(baseInputs, 'conservative', vi.fn(), vi.fn());
                result.current.runSimulation(baseInputs, 'optimistic', vi.fn(), vi.fn());
            });

            expect(spy).toHaveBeenCalledTimes(2);
        });

        it('calls onError when calculateSimulation throws', () => {
            vi.spyOn(simulationCalculator, 'calculateSimulation').mockImplementation(() => {
                throw new Error('boom');
            });
            const { result } = renderHook(() => useSimulationWorker());
            const onError = vi.fn();

            act(() => {
                result.current.runSimulation(baseInputs, 'conservative', vi.fn(), onError);
            });

            expect(onError).toHaveBeenCalledWith('boom');
        });
    });

    describe('runProjection', () => {
        it('returns { projection, goalSeekWithdrawal } via onResult', () => {
            const { result } = renderHook(() => useSimulationWorker());
            const onResult = vi.fn();

            act(() => {
                result.current.runProjection(baseInputs, onResult, vi.fn());
            });

            expect(onResult).toHaveBeenCalledOnce();
            const { projection, goalSeekWithdrawal } = onResult.mock.calls[0][0];
            expect(projection).toBeDefined();
            expect(projection.balanceAtRetirement).toBeGreaterThan(0);
            expect(goalSeekWithdrawal).toBeNull(); // no targetEndBalance set
        });

        it('runs goal-seek and returns goalSeekWithdrawal when targetEndBalance is set', () => {
            const { result } = renderHook(() => useSimulationWorker());
            const onResult = vi.fn();

            act(() => {
                result.current.runProjection(
                    { ...baseInputs, targetEndBalance: '50000' },
                    onResult,
                    vi.fn()
                );
            });

            expect(onResult).toHaveBeenCalledOnce();
            const { goalSeekWithdrawal } = onResult.mock.calls[0][0];
            expect(goalSeekWithdrawal).not.toBeNull();
            expect(goalSeekWithdrawal).toBeGreaterThan(0);
        });

        it('calls onError when calculateRetirementProjection throws', () => {
            vi.spyOn(calculator, 'calculateRetirementProjection').mockImplementation(() => {
                throw new Error('calc failed');
            });
            const { result } = renderHook(() => useSimulationWorker());
            const onError = vi.fn();

            act(() => {
                result.current.runProjection(baseInputs, vi.fn(), onError);
            });

            expect(onError).toHaveBeenCalledWith('calc failed');
        });
    });
});
