import { logger } from './logger';

const CAPE_FALLBACK = 33.5;
const FETCH_TIMEOUT_MS = 5000;

const SHILLER_URL =
    'https://data.nasdaq.com/api/v3/datasets/MULTPL/SHILLER_PE_RATIO_MONTH.json?rows=1';

// CORS proxies (same pattern used by fiscalWebFetch.js). The Nasdaq dataset
// endpoint does not send Access-Control-Allow-Origin, so a direct browser fetch
// is blocked by CORS. We try the direct URL first (works in non-browser/SSR or
// if Nasdaq ever adds the header), then fall back to public CORS proxies.
const PROXIES = [
    (url) => url,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

function extractCape(data) {
    const cape = parseFloat(data?.dataset?.data?.[0]?.[1]);
    return (!isNaN(cape) && cape > 5 && cape < 100) ? cape : null;
}

export async function fetchCurrentCAPE() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        for (const proxy of PROXIES) {
            try {
                const res = await fetch(proxy(SHILLER_URL), { signal: controller.signal });
                if (!res.ok) continue;
                const cape = extractCape(await res.json());
                if (cape !== null) return { value: cape, live: true };
            } catch (err) {
                if (err?.name === 'AbortError') throw err;
                // Try the next proxy.
            }
        }
    } catch (err) {
        logger.warn('Failed to fetch live CAPE ratio, using fallback:', err?.message || err);
    } finally {
        clearTimeout(timer);
    }

    return { value: CAPE_FALLBACK, live: false };
}

export function capeToWithdrawalRate(cape) {
    return Math.max(0.025, 0.5 / cape + 0.015);
}
