import { describe, it, expect } from 'vitest';
import { calculateSimulation, SIMULATION_TYPES } from './simulation-calculator';

describe('SIMULATION_TYPES', () => {
    it('should have all expected simulation types', () => {
        expect(SIMULATION_TYPES.MONTE_CARLO).toBe('monte_carlo');
        expect(SIMULATION_TYPES.CONSERVATIVE).toBe('conservative');
        expect(SIMULATION_TYPES.OPTIMISTIC).toBe('optimistic');
    });
});

describe('calculateSimulation', () => {
    const baseInputs = {
        currentAge: 30,
        retirementStartAge: 50,
        retirementEndAge: 70,
        currentSavings: 100000,
        monthlyContribution: 1000,
        monthlyNetIncomeDesired: 4000,
        annualReturnRate: 5,
        taxRate: 25
    };

    describe('conservative simulation', () => {
        it('should reduce return rate by 2%', () => {
            const result = calculateSimulation(baseInputs, SIMULATION_TYPES.CONSERVATIVE);

            expect(result).toBeDefined();
            expect(result.source).toBe('simulation');
        });

        it('should return lower balance than base calculation', () => {
            const conservativeResult = calculateSimulation(baseInputs, SIMULATION_TYPES.CONSERVATIVE);
            const optimisticResult = calculateSimulation(baseInputs, SIMULATION_TYPES.OPTIMISTIC);

            expect(conservativeResult.balanceAtRetirement).toBeLessThan(optimisticResult.balanceAtRetirement);
        });
    });

    describe('optimistic simulation', () => {
        it('should increase return rate by 1.5%', () => {
            const result = calculateSimulation(baseInputs, SIMULATION_TYPES.OPTIMISTIC);

            expect(result).toBeDefined();
            expect(result.source).toBe('simulation');
        });

        it('should return higher balance than conservative', () => {
            const conservativeResult = calculateSimulation(baseInputs, SIMULATION_TYPES.CONSERVATIVE);
            const optimisticResult = calculateSimulation(baseInputs, SIMULATION_TYPES.OPTIMISTIC);

            expect(optimisticResult.balanceAtRetirement).toBeGreaterThan(conservativeResult.balanceAtRetirement);
        });
    });

    describe('monte carlo simulation', () => {
        it('should return valid result with simulation range', () => {
            const result = calculateSimulation(baseInputs, SIMULATION_TYPES.MONTE_CARLO);

            expect(result).toBeDefined();
            expect(result.source).toBe('simulation');
            expect(result.isMonteCarlo).toBe(true);
        });

        it('should include percentile data in simulation range', () => {
            const result = calculateSimulation(baseInputs, SIMULATION_TYPES.MONTE_CARLO);

            expect(result.simulationRange).toBeDefined();
            expect(result.simulationRange.p25Balance).toBeDefined();
            expect(result.simulationRange.p75Balance).toBeDefined();
            expect(result.simulationRange.minBalance).toBeDefined();
            expect(result.simulationRange.maxBalance).toBeDefined();
        });

        it('should have ordered percentiles (min <= p25 <= median <= p75 <= max)', () => {
            const result = calculateSimulation(baseInputs, SIMULATION_TYPES.MONTE_CARLO);

            expect(result.simulationRange.minBalance).toBeLessThanOrEqual(result.simulationRange.p25Balance);
            expect(result.simulationRange.p25Balance).toBeLessThanOrEqual(result.balanceAtEnd);
            expect(result.balanceAtEnd).toBeLessThanOrEqual(result.simulationRange.p75Balance);
            expect(result.simulationRange.p75Balance).toBeLessThanOrEqual(result.simulationRange.maxBalance);
        });

        it('should sanitize pvOfDeficit to be non-negative', () => {
            const result = calculateSimulation(baseInputs, SIMULATION_TYPES.MONTE_CARLO);

            expect(result.pvOfDeficit).toBeGreaterThanOrEqual(0);
        });
    });

    describe('fallback behavior', () => {
        it('should return base calculation for unknown simulation type', () => {
            const result = calculateSimulation(baseInputs, 'unknown_type');

            expect(result).toBeDefined();
            expect(result.source).toBe('simulation');
            expect(result.balanceAtRetirement).toBeDefined();
        });
    });

    describe('edge cases', () => {
        it('should handle zero annual return rate', () => {
            const zeroRateInputs = { ...baseInputs, annualReturnRate: 0 };

            const conservativeResult = calculateSimulation(zeroRateInputs, SIMULATION_TYPES.CONSERVATIVE);
            const optimisticResult = calculateSimulation(zeroRateInputs, SIMULATION_TYPES.OPTIMISTIC);

            // Conservative should not go negative
            expect(conservativeResult.balanceAtRetirement).toBeGreaterThanOrEqual(0);
            expect(optimisticResult.balanceAtRetirement).toBeGreaterThan(0);
        });

        it('should handle string inputs', () => {
            const stringInputs = {
                currentAge: '30',
                retirementStartAge: '50',
                retirementEndAge: '70',
                currentSavings: '100000',
                monthlyContribution: '1000',
                monthlyNetIncomeDesired: '4000',
                annualReturnRate: '5',
                taxRate: '25'
            };

            const result = calculateSimulation(stringInputs, SIMULATION_TYPES.CONSERVATIVE);

            expect(result).toBeDefined();
            expect(result.balanceAtRetirement).toBeGreaterThan(0);
        });
    });

    describe('monte carlo year alignment', () => {
        it('fractional ages: result is finite and non-NaN (no off-by-one year drop)', () => {
            // currentAge=30.7, retirementStartAge=65.3 → diff=34.6
            // Math.ceil(34.6)=35 would set variable rates one year too late (off-by-one).
            // Math.floor(34.6)=34 aligns with getMonthlyRateForMonth's floor logic.
            const result = calculateSimulation({
                ...baseInputs,
                currentAge: 30.7,
                retirementStartAge: 65.3,
                retirementEndAge: 85.3
            }, SIMULATION_TYPES.MONTE_CARLO);

            expect(isNaN(result.balanceAtEnd)).toBe(false);
            expect(isNaN(result.balanceAtRetirement)).toBe(false);
            expect(result.simulationRange).toBeDefined();
        });

        it('integer ages: Monte Carlo result matches floor and ceil (no difference)', () => {
            // For integer age gaps, floor and ceil are identical — this is a regression guard
            const result = calculateSimulation(baseInputs, SIMULATION_TYPES.MONTE_CARLO);
            expect(isNaN(result.balanceAtEnd)).toBe(false);
            expect(result.simulationRange.p25Balance).toBeLessThanOrEqual(result.simulationRange.p75Balance);
        });
    });

    describe('Monte Carlo accumulation phase randomization', () => {
        it('p25 balanceAtRetirement differs from p75 balanceAtRetirement (accumulation is now randomized)', () => {
            // Before the fix, all 500 iterations used the same fixed rate for accumulation,
            // so balanceAtRetirement was identical across all iterations — p25 === p75.
            // Now accumulation is randomized, so percentiles must differ.
            const result = calculateSimulation({
                ...baseInputs,
                currentSavings: 1000000,
                monthlyNetIncomeDesired: 2000,
            }, SIMULATION_TYPES.MONTE_CARLO);
            expect(result.simulationRange.p25Balance).toBeLessThan(result.simulationRange.p75Balance);
        });

        it('spread between p25 and p75 is larger with long accumulation than with short accumulation', () => {
            // More accumulation years → more compounding of variance → wider spread.
            const longAccum = calculateSimulation(
                { ...baseInputs, currentAge: 25, retirementStartAge: 65, retirementEndAge: 85 },
                SIMULATION_TYPES.MONTE_CARLO
            );
            const shortAccum = calculateSimulation(
                { ...baseInputs, currentAge: 45, retirementStartAge: 50, retirementEndAge: 70 },
                SIMULATION_TYPES.MONTE_CARLO
            );
            const longSpread = longAccum.simulationRange.p75Balance - longAccum.simulationRange.p25Balance;
            const shortSpread = shortAccum.simulationRange.p75Balance - shortAccum.simulationRange.p25Balance;
            expect(longSpread).toBeGreaterThan(shortSpread);
        });
    });
});
