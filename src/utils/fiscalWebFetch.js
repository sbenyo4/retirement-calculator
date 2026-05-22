/**
 * Direct web fetch for Israeli fiscal data — no AI required.
 * Uses authoritative 2026 values mirrored in fiscalDefaults.js when live
 * browser fetches are unavailable due CORS or government-site blocking.
 */

import {
    DEFAULT_NATIONAL_INSURANCE,
    DEFAULT_TAX_BRACKETS,
    DEFAULT_PENSION_EXEMPTION,
} from './fiscalDefaults.js';

const PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
];

const BTL_RATES_URL =
    'https://www.btl.gov.il/benefits/old_age/Shum/Pages/Shum.aspx';
const BTL_WORK_INCOME_URL =
    'https://www.btl.gov.il/benefits/old_age/Conditions_of_eligibility/Pages/hachnasotMewavoda.aspx';
const TAX_AUTHORITY_BOOKLET_URL =
    'https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2026.pdf';

const FETCH_TIMEOUT_MS = 15_000;

async function fetchPage(url, signal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const combinedSignal = signal || controller.signal;

    try {
        const errors = [];
        for (const proxy of PROXIES) {
            try {
                const res = await fetch(proxy(url), { signal: combinedSignal });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                if (text.length < 500) throw new Error('Response too short - likely blocked');
                return text;
            } catch (error) {
                errors.push(error.message);
            }
        }
        throw new Error(errors.join(' / '));
    } finally {
        clearTimeout(timer);
    }
}

function stripHtml(str) {
    return str
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Parse NI pension rates from the BTL old-age pension rates page.
 * Returns { single, couple, single_child, couple_child,
 *           childSupp, spouseSupp, age80PlusAddon, year } or null.
 */
function parseBtlRates(html) {
    const text = stripHtml(html)
        .replace(/ש&quot;ח/gi, 'שח')
        .replace(/ש"ח/g, 'שח');
    const findHebrewAmount = (pattern) => {
        const match = text.match(pattern);
        return match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
    };
    const hebrewYear = text.match(/01\.01\.(\d{4})/)?.[1];
    const hebrewSingle = findHebrewAmount(/יחיד\/ה\s+([\d,]+)\s*שח/);
    const hebrewSingle80 = findHebrewAmount(/יחיד\/ה בגיל\s*80[^0-9]+([\d,]+)\s*שח/);
    const hebrewCouple = findHebrewAmount(/זוג\s*\([^)]*\)\s*([\d,]+)\s*שח/);
    const hebrewSingleChild = findHebrewAmount(/יחיד\/ה \+ ילד\s*([\d,]+)\s*שח/);
    const hebrewCoupleChild = findHebrewAmount(/זוג \+ ילד\s*([\d,]+)\s*שח/);
    if (hebrewSingle && hebrewCouple) {
        return {
            single: hebrewSingle,
            couple: hebrewCouple,
            single_child: hebrewSingleChild,
            couple_child: hebrewCoupleChild,
            childSupp: hebrewSingleChild ? hebrewSingleChild - hebrewSingle : null,
            spouseSupp: hebrewCouple - hebrewSingle,
            age80PlusAddon: hebrewSingle80 ? hebrewSingle80 - hebrewSingle : null,
            year: hebrewYear ? parseInt(hebrewYear, 10) : null
        };
    }

    const yearMatch = html.match(/as of Jan 01,\s*(\d{4})/i);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;

    // Each match captures up to 300 chars of context before "NIS X,XXX (as of …)"
    const re = /(.{0,300}?)NIS\s+([\d,]+)\s*\(as of Jan 01,\s*\d{4}\)/gi;
    const entries = [];
    let m;
    while ((m = re.exec(html)) !== null) {
        const ctx = stripHtml(m[1]);
        const val = parseInt(m[2].replace(/,/g, ''), 10);
        if (val > 0) entries.push({ ctx, val });
    }

    if (entries.length < 4) return null;

    // Context-based field identification
    const find = (must, mustNot = []) => {
        for (const { ctx, val } of entries) {
            if (
                must.every((k) => ctx.includes(k.toLowerCase())) &&
                mustNot.every((k) => !ctx.includes(k.toLowerCase()))
            ) {
                return val;
            }
        }
        return null;
    };

    const single       = find(['individual'], ['child', 'aged 80', '80+', 'two', '2 ', 'couple']);
    const couple       = find(['couple'],     ['child', 'aged 80', '80+', 'two', '2 ']);
    const single_child = find(['individual', 'child'], ['aged 80', '80+', 'couple', 'two', '2 ']);
    const couple_child = find(['couple', 'child'],     ['aged 80', '80+', 'two', '2 ']);
    const childSupp    = find(['child', 'increment']) ?? find(['increment', 'child']);
    const spouseSupp   = find(['spouse', 'increment']) ?? find(['increment', 'spouse']);
    const individual80 = find(['individual', 'aged 80']) ?? find(['individual', '80+']);

    if (!single || !couple) return null;

    const age80PlusAddon =
        individual80 && individual80 > single ? individual80 - single : null;

    // Derive missing supplemented values from discovered supplements
    const resolved_single_child =
        single_child ??
        (childSupp  ? single + childSupp  : null) ??
        (spouseSupp ? null : null); // can't derive without supplement
    const resolved_couple_child =
        couple_child ??
        (childSupp  ? couple + childSupp  : null);

    return {
        single,
        couple,
        single_child: resolved_single_child,
        couple_child: resolved_couple_child,
        childSupp,
        spouseSupp,
        age80PlusAddon,
        year,
    };
}

/**
 * Fetch Israeli fiscal data directly from btl.gov.il (via CORS proxy).
 *
 * @param {object}   [opts]
 * @param {Function} [opts.onStatus]  - (message: string) => void status callback
 * @param {AbortSignal} [opts.signal] - optional abort signal
 * @returns {{ success, data, sources, errors, taxBracketsFromDefaults, verifiedFallbackUsed }}
 */
export async function fetchFiscalDataFromWeb({ onStatus, signal } = {}) {
    const sources = [];
    const errors  = [];

    onStatus?.({
        key: 'loadingVerifiedFiscalSources',
        params: { year: 2026 }
    });

    let niRates = null;
    try {
        const html = await fetchPage(BTL_RATES_URL, signal);
        niRates = parseBtlRates(html);
        if (niRates) {
            sources.push({
                titleKey: 'fiscalSourceBtlRates',
                titleParams: { year: niRates.year || 2026 },
                title: `btl.gov.il - old-age pension rates ${niRates.year || 2026}`,
                url: BTL_RATES_URL,
            });
        } else {
            errors.push('btl.gov.il: page fetched but pension rates could not be parsed');
        }
    } catch (e) {
        errors.push(`btl.gov.il: ${e.message}`);
    }

    if (!niRates) errors.push('Live BTL fetch unavailable; using verified 2026 BTL defaults');

    // Build nationalInsurance: use parsed values, fall back to defaults for anything missing
    const defNI  = DEFAULT_NATIONAL_INSURANCE;
    const defRates = defNI.baseRates;

    // Derive supplements from defaults when not parsed from page
    const childSupp  = niRates?.childSupp  ?? (defRates.single_child - defRates.single);
    const spouseSupp = niRates?.spouseSupp ?? (defRates.couple       - defRates.single);

    const nationalInsurance = {
        baseRates: {
            single:      niRates?.single ?? defRates.single,
            couple:      niRates?.couple ?? defRates.couple,
            single_child: niRates?.single_child ?? ((niRates?.single ?? defRates.single) + childSupp),
            couple_child: niRates?.couple_child ?? ((niRates?.couple ?? defRates.couple) + childSupp),
            age80PlusAddon:           niRates?.age80PlusAddon ?? defRates.age80PlusAddon,
            seniorityAdditionPerYear: defRates.seniorityAdditionPerYear,
        },
        deferralBonusPerMonth: defNI.deferralBonusPerMonth,
        incomeTestThreshold: defNI.incomeTestThreshold,
    };

    if (!sources.some(source => source.url === BTL_RATES_URL)) {
        sources.push({
            titleKey: 'fiscalSourceBtlRates',
            titleParams: { year: 2026 },
            title: 'btl.gov.il - old-age pension rates 2026',
            url: BTL_RATES_URL
        });
    }
    sources.push({
        titleKey: 'fiscalSourceBtlIncomeTest',
        titleParams: { year: 2026 },
        title: 'btl.gov.il - work income test 2026',
        url: BTL_WORK_INCOME_URL
    });
    sources.push({
        titleKey: 'fiscalSourceTaxBooklet',
        titleParams: { year: 2026 },
        title: 'Tax Authority - monthly deductions booklet 2026',
        url: TAX_AUTHORITY_BOOKLET_URL
    });

    return {
        success: true,
        data: {
            nationalInsurance,
            taxBrackets: DEFAULT_TAX_BRACKETS,
            pensionExemption: DEFAULT_PENSION_EXEMPTION,
        },
        sources,
        errors,
        taxBracketsFromDefaults: true,
        verifiedFallbackUsed: !niRates,
    };
}
