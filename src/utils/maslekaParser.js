import * as XLSX from 'xlsx';

const PRODUCTS_SHEET = 'פרטי המוצרים שלי';

const HEADERS = {
    productName: 'שם מוצר',
    company: 'שם חברה מנהלת',
    policy: 'מספר פוליסה',
    status: 'סטטוס',
    currentBalance: 'סך הכל חיסכון',
    projectedNoContribBalance: 'חיסכון צפוי לגיל פרישה לא כולל פרמיות',
    projectedNoContribAnnuity: 'קיצבה חודשית לגיל פרישה לא כולל פרמיות',
    projectedWithContribBalance: 'חיסכון צפוי לגיל פרישה',
    projectedWithContribAnnuity: 'קיצבה חודשית לגיל פרישה',
    yearlyReturn: 'תשואה מתחילת השנה',
    employeeDeposit: 'הפקדות חוסך',
    employerDeposit: 'הפקדות מעסיק',
    feesFromDeposits: 'שיעור דמי ניהול מהפקדות',
    feesFromBalance: 'שיעור דמי ניהול שנתי מחיסכון צבור',
    dataDate: 'תאריך נכונות נתונים',
    productSubtype: 'סוג מוצר'
};

export const MASLEKA_CATEGORIES = [
    { key: 'newPensionFunds', labelHe: 'קרנות פנסיה חדשות', labelEn: 'New pension funds', color: '#4DBDB5' },
    { key: 'insuranceCompanies', labelHe: 'חברות ביטוח', labelEn: 'Insurance companies', color: '#F5C242' },
    { key: 'providentFunds', labelHe: 'קופות גמל', labelEn: 'Provident funds', color: '#F15A52' },
    { key: 'studyFunds', labelHe: 'קרנות השתלמות', labelEn: 'Study funds', color: '#55B95A' },
    { key: 'investmentProvident', labelHe: 'גמל להשקעה', labelEn: 'Investment provident', color: '#7C3AED' },
    { key: 'other', labelHe: 'אחר', labelEn: 'Other', color: '#64748B' }
];

const COMPANY_LOGO_DOMAINS = [
    { pattern: /מגדל/,               domain: 'migdal.co.il' },
    { pattern: /כלל/,                domain: 'clalbit.co.il' },
    { pattern: /הראל/,               domain: 'harel-ins.co.il' },
    { pattern: /מנורה/,              domain: 'menoramivt.co.il' },
    { pattern: /אקסלנס/,             domain: 'excellence.co.il' },
    { pattern: /מיטב/,               domain: 'meitav.co.il' },
    { pattern: /אנליסט/,             domain: 'analyst.co.il' },
    { pattern: /^מור|מור קופות/,    domain: 'more-inv.co.il' },
    { pattern: /ביטוח ישיר|IDI/i,   domain: 'direct.co.il' },
    { pattern: /פסגות/,              domain: 'psagot.co.il' },
    { pattern: /אלטשולר/,            domain: 'as-invest.co.il' },
    { pattern: /ילין/,               domain: 'ylbm.co.il' },
    { pattern: /גאון/,               domain: 'gaon-capital.co.il' },
    { pattern: /אינפיניטי/,          domain: 'infinity-invest.co.il' },
    { pattern: /ווסט/,               domain: 'west-invest.co.il' },
    { pattern: /הפניקס/,             domain: 'phoenix.co.il' },
];

export function getCompanyLogoDomain(companyName) {
    if (!companyName) return null;
    const entry = COMPANY_LOGO_DOMAINS.find(e => e.pattern.test(companyName));
    return entry ? entry.domain : null;
}

export function getCompanyLogoUrl(companyName) {
    const domain = getCompanyLogoDomain(companyName);
    if (!domain) return null;
    return `https://logo.clearbit.com/${domain}`;
}

const numberValue = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[,\s₪%]/g, '');
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const textValue = (value) => String(value ?? '').trim();

const getRowValue = (row, indexByHeader, header) => row[indexByHeader[header]];

const classifyProduct = (productName, productSubtype) => {
    const name = `${productName || ''} ${productSubtype || ''}`;
    if (/גמל להשקעה/.test(name)) return 'investmentProvident';
    if (/פנסיה/.test(name)) return 'newPensionFunds';
    if (/ביטוח חיים משולב חיסכון|ביטוח|מנהלים|עדיף|מגדלור|פוליס/.test(name)) return 'insuranceCompanies';
    if (/קרן השתלמות|השתלמות/.test(name)) return 'studyFunds';
    if (/קופת גמל/.test(name)) return 'providentFunds';
    return 'other';
};

const createEmptySummary = (category) => ({
    ...category,
    productCount: 0,
    activeProductCount: 0,
    currentBalance: 0,
    projectedNoContribBalance: 0,
    projectedNoContribAnnuity: 0,
    projectedWithContribBalance: 0,
    projectedWithContribAnnuity: 0,
    monthlyDeposits: 0,
    weightedYearlyReturn: null,
    weightedFeesFromBalance: null,
    products: []
});

const weightedAverage = (rows, valueKey, weightKey = 'currentBalance') => {
    const weightedRows = rows
        .map(row => ({ value: numberValue(row[valueKey]), weight: numberValue(row[weightKey]) }))
        .filter(row => Number.isFinite(row.value) && row.weight > 0);
    const totalWeight = weightedRows.reduce((sum, row) => sum + row.weight, 0);
    if (!totalWeight) return null;
    return weightedRows.reduce((sum, row) => sum + row.value * row.weight, 0) / totalWeight;
};

export function calculateNoDepositRate(currentBalance, projectedBalance, yearsToRetirement) {
    const pv = numberValue(currentBalance);
    const fv = numberValue(projectedBalance);
    const years = numberValue(yearsToRetirement);
    if (pv <= 0 || fv <= 0 || years <= 0) return null;
    return (Math.pow(fv / pv, 1 / years) - 1) * 100;
}

export function calculateWithDepositRate(currentBalance, monthlyDeposit, projectedBalance, yearsToRetirement) {
    const pv = numberValue(currentBalance);
    const pmt = numberValue(monthlyDeposit);
    const fv = numberValue(projectedBalance);
    const years = numberValue(yearsToRetirement);
    const months = Math.max(1, Math.round(years * 12));

    if (pv <= 0 || fv <= 0 || years <= 0) return null;
    if (pmt <= 0) return calculateNoDepositRate(pv, fv, years);

    const futureValue = (monthlyRate) => {
        if (Math.abs(monthlyRate) < 1e-10) return pv + pmt * months;
        return pv * Math.pow(1 + monthlyRate, months) +
            pmt * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
    };

    let low = -0.95 / 12;
    let high = 0.5 / 12;
    while (futureValue(high) < fv && high < 10) {
        high *= 2;
    }

    for (let i = 0; i < 80; i += 1) {
        const mid = (low + high) / 2;
        if (futureValue(mid) < fv) low = mid;
        else high = mid;
    }

    const monthlyRate = (low + high) / 2;
    return (Math.pow(1 + monthlyRate, 12) - 1) * 100;
}

export function addImpliedRatesToMaslekaSummary(summary, yearsToRetirement) {
    const addRates = (entry) => {
        const impliedNoDepositRate = calculateNoDepositRate(
            entry.currentBalance,
            entry.projectedNoContribBalance,
            yearsToRetirement
        );
        const hasDepositsWithoutProjectionUplift =
            numberValue(entry.monthlyDeposits) > 0 &&
            numberValue(entry.projectedWithContribBalance) <= numberValue(entry.projectedNoContribBalance);

        return {
            ...entry,
            impliedNoDepositRate,
            impliedWithDepositRate: hasDepositsWithoutProjectionUplift
                ? null
                : calculateWithDepositRate(
                    entry.currentBalance,
                    entry.monthlyDeposits,
                    entry.projectedWithContribBalance,
                    yearsToRetirement
                )
        };
    };

    return {
        ...summary,
        yearsToRetirement,
        products: summary.products.map(addRates),
        categories: summary.categories.map(addRates),
        total: addRates(summary.total)
    };
}

export function parseMaslekaWorkbook(arrayBuffer, manualAsOfDate = '') {
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
    const sheetName = workbook.SheetNames.find(name => name === PRODUCTS_SHEET) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
        throw new Error('לא נמצא גיליון נתונים בקובץ');
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length < 2) {
        throw new Error('הקובץ לא מכיל שורות מוצר');
    }

    const headerRowIndex = rows.findIndex(row => row.includes(HEADERS.productName) && row.includes(HEADERS.currentBalance));
    if (headerRowIndex < 0) {
        throw new Error('לא נמצאו כותרות מוצר צפויות של המסלקה');
    }

    const headers = rows[headerRowIndex].map(textValue);
    const indexByHeader = Object.fromEntries(headers.map((header, index) => [header, index]));

    const missing = [
        HEADERS.productName,
        HEADERS.currentBalance,
        HEADERS.projectedNoContribBalance,
        HEADERS.projectedWithContribBalance
    ].filter(header => indexByHeader[header] === undefined);
    if (missing.length > 0) {
        throw new Error(`חסרות עמודות בקובץ: ${missing.join(', ')}`);
    }

    const products = rows.slice(headerRowIndex + 1)
        .filter(row => textValue(getRowValue(row, indexByHeader, HEADERS.productName)))
        .map((row, index) => {
            const productName = textValue(getRowValue(row, indexByHeader, HEADERS.productName));
            const productSubtype = textValue(getRowValue(row, indexByHeader, HEADERS.productSubtype));
            const categoryKey = classifyProduct(productName, productSubtype);
            const employeeDeposit = numberValue(getRowValue(row, indexByHeader, HEADERS.employeeDeposit));
            const employerDeposit = numberValue(getRowValue(row, indexByHeader, HEADERS.employerDeposit));

            return {
                id: `${categoryKey}_${index}_${textValue(getRowValue(row, indexByHeader, HEADERS.policy))}`,
                categoryKey,
                productName,
                productSubtype,
                company: textValue(getRowValue(row, indexByHeader, HEADERS.company)),
                policy: textValue(getRowValue(row, indexByHeader, HEADERS.policy)),
                status: textValue(getRowValue(row, indexByHeader, HEADERS.status)),
                currentBalance: numberValue(getRowValue(row, indexByHeader, HEADERS.currentBalance)),
                projectedNoContribBalance: numberValue(getRowValue(row, indexByHeader, HEADERS.projectedNoContribBalance)),
                projectedNoContribAnnuity: numberValue(getRowValue(row, indexByHeader, HEADERS.projectedNoContribAnnuity)),
                projectedWithContribBalance: numberValue(getRowValue(row, indexByHeader, HEADERS.projectedWithContribBalance)),
                projectedWithContribAnnuity: numberValue(getRowValue(row, indexByHeader, HEADERS.projectedWithContribAnnuity)),
                yearlyReturn: numberValue(getRowValue(row, indexByHeader, HEADERS.yearlyReturn)),
                employeeDeposit,
                employerDeposit,
                monthlyDeposits: employeeDeposit + employerDeposit,
                feesFromDeposits: numberValue(getRowValue(row, indexByHeader, HEADERS.feesFromDeposits)),
                feesFromBalance: numberValue(getRowValue(row, indexByHeader, HEADERS.feesFromBalance)),
                dataDate: textValue(getRowValue(row, indexByHeader, HEADERS.dataDate))
            };
        })
        .filter(product => product.currentBalance > 0 || product.projectedWithContribBalance > 0 || product.projectedNoContribBalance > 0);

    const summaryByCategory = Object.fromEntries(MASLEKA_CATEGORIES.map(category => [category.key, createEmptySummary(category)]));

    products.forEach(product => {
        const summary = summaryByCategory[product.categoryKey] || summaryByCategory.other;
        summary.productCount += 1;
        if (product.status === 'פעיל') summary.activeProductCount += 1;
        summary.currentBalance += product.currentBalance;
        summary.projectedNoContribBalance += product.projectedNoContribBalance;
        summary.projectedNoContribAnnuity += product.projectedNoContribAnnuity;
        summary.projectedWithContribBalance += product.projectedWithContribBalance;
        summary.projectedWithContribAnnuity += product.projectedWithContribAnnuity;
        summary.monthlyDeposits += product.monthlyDeposits;
        summary.products.push(product);
    });

    Object.values(summaryByCategory).forEach(summary => {
        summary.weightedYearlyReturn = weightedAverage(summary.products, 'yearlyReturn');
        summary.weightedFeesFromBalance = weightedAverage(summary.products, 'feesFromBalance');
    });

    const categorySummaries = MASLEKA_CATEGORIES
        .map(category => summaryByCategory[category.key])
        .filter(summary => summary.productCount > 0);

    const total = createEmptySummary({
        key: 'total',
        labelHe: 'סה"כ',
        labelEn: 'Total',
        color: '#0F172A'
    });
    products.forEach(product => {
        total.productCount += 1;
        if (product.status === 'פעיל') total.activeProductCount += 1;
        total.currentBalance += product.currentBalance;
        total.projectedNoContribBalance += product.projectedNoContribBalance;
        total.projectedNoContribAnnuity += product.projectedNoContribAnnuity;
        total.projectedWithContribBalance += product.projectedWithContribBalance;
        total.projectedWithContribAnnuity += product.projectedWithContribAnnuity;
        total.monthlyDeposits += product.monthlyDeposits;
        total.products.push(product);
    });
    total.weightedYearlyReturn = weightedAverage(products, 'yearlyReturn');
    total.weightedFeesFromBalance = weightedAverage(products, 'feesFromBalance');

    const datesFromFile = [...new Set(products.map(product => product.dataDate).filter(Boolean))];

    return {
        sheetName,
        asOfDate: manualAsOfDate || datesFromFile[0] || '',
        manualAsOfDate,
        fileDataDates: datesFromFile,
        products,
        categories: categorySummaries,
        total
    };
}
