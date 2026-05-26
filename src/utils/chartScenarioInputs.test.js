import { describe, expect, it } from 'vitest';
import {
    applyChartScenarioInput,
    applyIncomeScenario,
    applyRateScenario,
} from './chartScenarioInputs';

describe('chart scenario inputs', () => {
    it('moves yearly income overrides by the same delta as the base income', () => {
        const inputs = {
            monthlyNetIncomeDesired: 14000,
            yearlyIncomeOverrides: {
                2030: 10000,
                2031: 18000,
            },
        };

        const result = applyIncomeScenario(inputs, 16000);

        expect(result.monthlyNetIncomeDesired).toBe(16000);
        expect(result.yearlyIncomeOverrides).toEqual({
            2030: 12000,
            2031: 20000,
        });
    });

    it('floors shifted yearly income overrides at a positive value', () => {
        const inputs = {
            monthlyNetIncomeDesired: 14000,
            yearlyIncomeOverrides: {
                2030: 1000,
            },
        };

        const result = applyIncomeScenario(inputs, 1000);

        expect(result.yearlyIncomeOverrides[2030]).toBe(1);
    });

    it('flattens variable rate maps when a chart sweeps a rate value', () => {
        const inputs = {
            annualReturnRate: 5,
            variableRatesEnabled: true,
            variableRates: {
                2027: 3,
                2028: 7,
            },
        };

        const result = applyRateScenario(inputs, 'annualReturnRate', 6);

        expect(result.annualReturnRate).toBe(6);
        expect(result.variableRates).toEqual({
            2027: 6,
            2028: 6,
        });
    });

    it('routes income changes through schedule-aware logic', () => {
        const inputs = {
            monthlyNetIncomeDesired: 20000,
            yearlyIncomeOverrides: {
                2030: 25000,
            },
        };

        const result = applyChartScenarioInput(inputs, 'monthlyNetIncomeDesired', 18000);

        expect(result.monthlyNetIncomeDesired).toBe(18000);
        expect(result.yearlyIncomeOverrides[2030]).toBe(23000);
    });
});
