const CAPE_FALLBACK = 33.5;

export async function fetchCurrentCAPE() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(
            'https://data.nasdaq.com/api/v3/datasets/MULTPL/SHILLER_PE_RATIO_MONTH.json?rows=1',
            { signal: controller.signal }
        );
        if (!res.ok) return { value: CAPE_FALLBACK, live: false };
        const data = await res.json();
        const cape = parseFloat(data?.dataset?.data?.[0]?.[1]);
        if (!isNaN(cape) && cape > 5 && cape < 100) return { value: cape, live: true };
    } catch {
    } finally {
        clearTimeout(timer);
    }
    return { value: CAPE_FALLBACK, live: false };
}

export function capeToWithdrawalRate(cape) {
    return Math.max(0.025, 0.5 / cape + 0.015);
}
