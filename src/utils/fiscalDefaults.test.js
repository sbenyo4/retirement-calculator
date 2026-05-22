import { describe, expect, it } from 'vitest';
import {
    DEFAULT_FISCAL_PARAMETERS,
    DEFAULT_NATIONAL_INSURANCE,
    DEFAULT_PENSION_EXEMPTION,
    DEFAULT_TAX_BRACKETS,
    validateFiscalParameters
} from './fiscalDefaults';

describe('2026 fiscal defaults', () => {
    it('keeps the official National Insurance, tax, and pension exemption values together', () => {
        expect(DEFAULT_NATIONAL_INSURANCE.incomeTestThreshold).toEqual({
            workEarningsLimit: 10113,
            single: 14402,
            coupleWorkEarningsLimit: 13484,
            couple: 20082
        });
        expect(DEFAULT_TAX_BRACKETS).toEqual([
            { limit: 7010, rate: 0.10 },
            { limit: 10060, rate: 0.14 },
            { limit: 19000, rate: 0.20 },
            { limit: 25100, rate: 0.31 },
            { limit: 46690, rate: 0.35 },
            { limit: null, rate: 0.47 }
        ]);
        expect(DEFAULT_PENSION_EXEMPTION).toEqual({
            rate: 0.575,
            maxMonthly: 5422,
            maxQualifiedIncome: 9430
        });
    });

    it('validates the combined defaults with the qualifying pension exemption', () => {
        const result = validateFiscalParameters(DEFAULT_FISCAL_PARAMETERS);

        expect(result.isValid).toBe(true);
        expect(result.correctedData.pensionExemption).toEqual(DEFAULT_PENSION_EXEMPTION);
    });
});
