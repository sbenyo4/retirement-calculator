import { describe, it, expect } from 'vitest';
import { normalizeInputs } from './profileUtils';

describe('normalizeInputs', () => {
    it('should convert top-level numeric strings to numbers but allow empty targetEndBalance', () => {
        const data = {
            currentAge: "35",
            annualReturnRate: "5.5",
            targetEndBalance: ""
        };
        const normalized = normalizeInputs(data);
        expect(normalized.currentAge).toBe(35);
        expect(normalized.annualReturnRate).toBe(5.5);
        expect(normalized.targetEndBalance).toBe("");

        const dataWithBalance = { targetEndBalance: "1000000" };
        const normalizedWithBalance = normalizeInputs(dataWithBalance);
        expect(normalizedWithBalance.targetEndBalance).toBe(1000000);
    });

    it('should normalize nested variableRates objects (strings to numbers)', () => {
        const data = {
            annualReturnRate: 1, // Set base to 1 so these aren't pruned (especially the 0 fallback)
            variableRatesEnabled: true,
            variableRates: {
                "2024": "5",
                "2025": 4.5,
                "2026": "invalid"
            }
        };
        const normalized = normalizeInputs(data);
        expect(normalized.variableRates["2024"]).toBe(5);
        expect(normalized.variableRates["2025"]).toBe(4.5);
        expect(normalized.variableRates["2026"]).toBe(0); // fallback for NaN
    });

    it('should normalize bucket-specific rate objects', () => {
        const data = {
            safeVariableRates: { "2030": "2.5" },
            surplusVariableRates: { "2030": "8" }
        };
        const normalized = normalizeInputs(data);
        expect(normalized.safeVariableRates["2030"]).toBe(2.5);
        expect(normalized.surplusVariableRates["2030"]).toBe(8);
    });

    it('should fill missing fields with defaults', () => {
        const data = { currentAge: 40 };
        const normalized = normalizeInputs(data);
        expect(normalized.retirementStartAge).toBe(50); // Default
        expect(normalized.variableRates).toEqual({}); // Default
    });

    it('should default withdrawalStrategy to fixed if missing', () => {
        const data = {};
        const normalized = normalizeInputs(data);
        expect(normalized.withdrawalStrategy).toBe('fixed');
    });

    it('should prune rate objects that match the base rate', () => {
        const data = {
            annualReturnRate: 5,
            variableRates: { '2024': 5, '2025': 5 }
        };
        const normalized = normalizeInputs(data);
        // Both years match annualReturnRate=5, so object should be pruned to {}
        expect(normalized.variableRates).toEqual({});
    });

    it('should keep rate objects that have values differing from the base rate', () => {
        const data = {
            annualReturnRate: 5,
            variableRates: { '2024': 6, '2025': 5 }
        };
        const normalized = normalizeInputs(data);
        // 2024 differs, 2025 matches. Normalization keeps only the differing year.
        expect(normalized.variableRates).toEqual({ '2024': 6 });
    });

    it('should standardize null/undefined rate objects to {}', () => {
        const data = {
            variableRates: null,
            safeVariableRates: undefined
        };
        const normalized = normalizeInputs(data);
        expect(normalized.variableRates).toEqual({});
        expect(normalized.safeVariableRates).toEqual({});
    });

    it('should prune guest/ghost fields not present in DEFAULT_INPUTS', () => {
        const data = {
            currentAge: 30,
            ghostField: 'shouldBeRemoved'
        };
        const normalized = normalizeInputs(data);
        expect(normalized.ghostField).toBeUndefined();
    });

    it('should standardize birthDate casing to birthdate', () => {
        const data = {
            birthDate: '1990-01-01'
        };
        const normalized = normalizeInputs(data);
        expect(normalized.birthdate).toBe('1990-01-01');
    });

    it('should normalize lifeEvents structure and types', () => {
        const data = {
            lifeEvents: [{
                id: 123,
                name: "Legacy Event",
                amount: "5000",
                duration: "12",
                startDate: { month: "5", year: "2030" }
            }]
        };
        const normalized = normalizeInputs(data);
        const event = normalized.lifeEvents[0];
        expect(event.id).toBe("123"); // converted to string
        expect(event.amount).toBe(5000); // converted to number
        expect(event.duration).toBe(12); // converted to number
        expect(event.startDate.month).toBe(5);
        expect(event.startDate.year).toBe(2030);
    });
});
