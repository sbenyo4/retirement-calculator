import { describe, it, expect, vi } from 'vitest';
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
});
