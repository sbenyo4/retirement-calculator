import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { addImpliedRatesToMaslekaSummary, parseMaslekaWorkbook, projectMaslekaSummaryToYears } from './maslekaParser';

function createWorkbookBuffer() {
    const rows = [
        [
            'שם מוצר',
            'שם חברה מנהלת',
            'מספר פוליסה',
            'סטטוס',
            'סך הכל חיסכון',
            'תחנת משיכה קרובה',
            'חיסכון צפוי לגיל פרישה לא כולל פרמיות',
            'קיצבה חודשית לגיל פרישה לא כולל פרמיות',
            'חיסכון צפוי לגיל פרישה',
            'קיצבה חודשית לגיל פרישה',
            'שיעור פנסיה זקנה צפויה',
            'שיעור דמי ניהול מהפקדות',
            'שיעור דמי ניהול שנתי מחיסכון צבור',
            'תשואה מתחילת השנה',
            'הפקדות חוסך',
            'הפקדות מעסיק',
            'סוג מוצר',
            'תאריך נכונות נתונים'
        ],
        ['פנסיה חדשה מקיפה', 'חברה א', '1', 'פעיל', 100000, '', 150000, 800, 220000, 1200, 0, 1, 0.2, 5, 100, 200, '', '4/30/2026'],
        ['קופת גמל', 'חברה ב', '2', 'פעיל', 50000, '', 70000, 0, 90000, 0, 0, 0, 0.5, 7, 50, 50, '', '4/30/2026'],
        ['קופת גמל להשקעה', 'חברה ג', '3', 'פעיל', 25000, '', 25000, 0, 25000, 0, 0, 0, 0.6, 4, 0, 0, '', '4/30/2026'],
        ['פוליסת ביטוח חיים משולב חיסכון', 'חברה ד', '4', 'פעיל', 40000, '', 60000, 300, 80000, 400, 0, 0, 0.7, 3, 0, 100, 'עדיף', '4/30/2026']
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'פרטי המוצרים שלי');
    return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
}

describe('parseMaslekaWorkbook', () => {
    it('summarizes pension, provident, investment provident, and managers insurance', () => {
        const parsed = parseMaslekaWorkbook(createWorkbookBuffer(), '2026-05-27');
        const byKey = Object.fromEntries(parsed.categories.map(category => [category.key, category]));

        expect(parsed.products).toHaveLength(4);
        expect(parsed.asOfDate).toBe('2026-05-27');
        expect(byKey.newPensionFunds.projectedWithContribAnnuity).toBe(1200);
        expect(byKey.providentFunds.projectedWithContribBalance).toBe(90000);
        expect(byKey.investmentProvident.currentBalance).toBe(25000);
        expect(byKey.insuranceCompanies.projectedNoContribAnnuity).toBe(300);
        expect(parsed.total.monthlyDeposits).toBe(500);
    });

    it('calculates implied no-deposit and with-deposit annual rates', () => {
        const parsed = addImpliedRatesToMaslekaSummary(parseMaslekaWorkbook(createWorkbookBuffer()), 10);
        const pension = parsed.categories.find(category => category.key === 'newPensionFunds');

        expect(pension.impliedNoDepositRate).toBeCloseTo(4.14, 1);
        expect(pension.impliedWithDepositRate).toBeGreaterThan(0);
        expect(parsed.products[0].impliedNoDepositRate).toBeCloseTo(pension.impliedNoDepositRate, 5);
    });

    it('projects retirement balances using a selected number of additional deposit years', () => {
        const parsed = addImpliedRatesToMaslekaSummary(parseMaslekaWorkbook(createWorkbookBuffer()), 10);
        const projected = projectMaslekaSummaryToYears(parsed, 5);

        expect(projected.selectedYearsToRetirement).toBe(5);
        expect(projected.selectedDepositYears).toBe(5);
        expect(projected.total.projectedNoContribBalance).toBeCloseTo(parsed.total.projectedNoContribBalance, 0);
        expect(projected.total.projectedWithContribBalance).toBeGreaterThan(projected.total.projectedNoContribBalance);
        expect(projected.total.projectedWithContribBalance).toBeLessThan(parsed.total.projectedWithContribBalance);
        expect(projected.categories[0].projectedWithContribAnnuity).toBeGreaterThan(0);
    });

    it('uses zero additional deposit years as stopping deposits today', () => {
        const parsed = addImpliedRatesToMaslekaSummary(parseMaslekaWorkbook(createWorkbookBuffer()), 10);
        const projected = projectMaslekaSummaryToYears(parsed, 0);

        expect(projected.selectedYearsToRetirement).toBe(0);
        expect(projected.selectedDepositYears).toBe(0);
        expect(projected.total.projectedNoContribBalance).toBe(parsed.total.projectedNoContribBalance);
        expect(projected.total.projectedWithContribBalance).toBe(parsed.total.projectedNoContribBalance);
        expect(projected.total.projectedWithContribAnnuity).toBe(parsed.total.projectedNoContribAnnuity);
    });

    it('also recalculates the target year instead of returning raw file values', () => {
        const parsed = addImpliedRatesToMaslekaSummary(parseMaslekaWorkbook(createWorkbookBuffer()), 10);
        const projected = projectMaslekaSummaryToYears(parsed, 10);

        expect(projected.total.selectedDepositYears).toBe(10);
        expect(projected.total.projectedNoContribBalance).toBe(parsed.total.projectedNoContribBalance);
        expect(projected.total.projectedWithContribBalance).toBe(parsed.total.projectedWithContribBalance);
        expect(projected.total.projectedWithContribAnnuity).toBe(parsed.total.projectedWithContribAnnuity);
    });
});
