import { describe, it, expect } from 'vitest';
import {
    createCurrencyFormatter,
    formatCurrency,
    formatNumber,
    formatPercentage
} from './formatters.js';

describe('formatters', () => {
    describe('createCurrencyFormatter', () => {
        it('creates Hebrew/ILS formatter for "he" language', () => {
            const formatter = createCurrencyFormatter('he');
            const result = formatter.format(1000);
            // Should contain the ILS symbol (₪) and formatted number
            expect(result).toContain('₪');
            expect(result).toMatch(/1[,.]?000/);
        });

        it('creates English/USD formatter for "en" language', () => {
            const formatter = createCurrencyFormatter('en');
            const result = formatter.format(1000);
            // Should contain the USD symbol ($) and formatted number
            expect(result).toContain('$');
            expect(result).toMatch(/1[,.]?000/);
        });

        it('uses no decimal places', () => {
            const formatter = createCurrencyFormatter('en');
            const result = formatter.format(1000.99);
            // Should round to whole number
            expect(result).not.toContain('.99');
        });
    });

    describe('formatCurrency', () => {
        it('formats currency in Hebrew', () => {
            const result = formatCurrency(50000, 'he');
            expect(result).toContain('₪');
            expect(result).toMatch(/50[,.]?000/);
        });

        it('formats currency in English', () => {
            const result = formatCurrency(50000, 'en');
            expect(result).toContain('$');
            expect(result).toMatch(/50[,.]?000/);
        });

        it('handles zero correctly', () => {
            const result = formatCurrency(0, 'en');
            expect(result).toContain('$');
            expect(result).toContain('0');
        });

        it('handles negative values', () => {
            const result = formatCurrency(-5000, 'en');
            expect(result).toContain('-');
            expect(result).toContain('$');
        });

        it('handles large numbers with thousands separator', () => {
            const result = formatCurrency(1000000, 'en');
            expect(result).toMatch(/1[,.]?000[,.]?000/);
        });
    });

    describe('formatNumber', () => {
        it('formats number with thousands separator in English', () => {
            const result = formatNumber(1234567, 'en');
            expect(result).toBe('1,234,567');
        });

        it('formats number with thousands separator in Hebrew', () => {
            const result = formatNumber(1234567, 'he');
            // Hebrew uses different separators
            expect(result).toMatch(/1[,.]234[,.]567/);
        });

        it('handles zero', () => {
            const result = formatNumber(0, 'en');
            expect(result).toBe('0');
        });

        it('rounds decimal values', () => {
            const result = formatNumber(1234.56, 'en');
            expect(result).toBe('1,235');
        });

        it('handles negative numbers', () => {
            const result = formatNumber(-1000, 'en');
            expect(result).toMatch(/-1[,.]?000/);
        });
    });

    describe('formatPercentage', () => {
        it('formats percentage value correctly in English', () => {
            const result = formatPercentage(5, 'en');
            expect(result).toBe('5.0%');
        });

        it('formats percentage value correctly in Hebrew', () => {
            const result = formatPercentage(5, 'he');
            // Hebrew percentage format may differ
            expect(result).toContain('5');
            expect(result).toContain('%');
        });

        it('handles decimal percentage values', () => {
            const result = formatPercentage(5.5, 'en');
            expect(result).toBe('5.5%');
        });

        it('rounds to one decimal place', () => {
            const result = formatPercentage(5.55, 'en');
            // Should round to 5.6%
            expect(result).toBe('5.6%');
        });

        it('handles zero percentage', () => {
            const result = formatPercentage(0, 'en');
            expect(result).toBe('0.0%');
        });

        it('handles negative percentage', () => {
            const result = formatPercentage(-2.5, 'en');
            expect(result).toMatch(/-2\.5%/);
        });

        it('handles 100%', () => {
            const result = formatPercentage(100, 'en');
            expect(result).toBe('100.0%');
        });
    });
});
