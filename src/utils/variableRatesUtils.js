/**
 * Generates random variable rates centered on targetAvg with optional month weights.
 * @param {number[]} years - Array of year values
 * @param {number} targetAvg - Target weighted average rate
 * @param {number[]} [weights] - Month weights per year (defaults to 12 each)
 * @returns {Object} Map of year -> rate
 */
export function generateRandomRates(years, targetAvg, weights = null) {
    const count = years.length;
    const ws = weights || years.map(() => 12);
    const totalMonths = ws.reduce((sum, w) => sum + w, 0);

    if (count === 0 || totalMonths === 0) return {};

    const minRate = -10;
    const maxRate = 10;
    const minAllowed = Math.max(minRate, targetAvg - 10);
    const maxAllowed = Math.min(maxRate, targetAvg + 10);

    let rawRates = years.map(() => {
        const range = maxAllowed - minAllowed;
        return minAllowed + Math.random() * range;
    });

    // Shift weighted mean to match target exactly
    const currentWeightedSum = rawRates.reduce((sum, r, i) => sum + r * ws[i], 0);
    const correction = targetAvg - currentWeightedSum / totalMonths;
    rawRates = rawRates.map(r => r + correction);

    // Clamp
    rawRates = rawRates.map(r => Math.max(minRate, Math.min(maxRate, r)));

    // Quantize to 0.5 steps
    let quantized = rawRates.map(r => Math.round(r * 2) / 2);

    // Final drift correction after quantization
    let finalSum = quantized.reduce((sum, r, i) => sum + r * ws[i], 0);
    let drift = targetAvg * totalMonths - finalSum;
    let attempts = 0;
    while (Math.abs(drift) > 0.5 && attempts < 300) {
        const idx = Math.floor(Math.random() * count);
        const w = ws[idx];
        const cr = quantized[idx];
        if (drift > 0 && cr < maxRate) { quantized[idx] += 0.5; drift -= 0.5 * w; }
        else if (drift < 0 && cr > minRate) { quantized[idx] -= 0.5; drift += 0.5 * w; }
        attempts++;
    }

    const result = {};
    years.forEach((y, i) => { result[y] = quantized[i]; });
    return result;
}

/**
 * Applies balanced interleaving: best, worst, 2nd-best, 2nd-worst, ...
 */
export function applyBalancedSort(years, ratesMap) {
    const presentYears = years.filter(y => ratesMap[y] !== undefined && !isNaN(parseFloat(ratesMap[y])));
    if (presentYears.length === 0) return { ...ratesMap };
    const vals = presentYears.map(y => parseFloat(ratesMap[y]));
    const sorted = [...vals].sort((a, b) => b - a);
    const balanced = [];
    let l = 0, r = sorted.length - 1;
    while (l <= r) {
        balanced.push(sorted[l]);
        if (l < r) balanced.push(sorted[r]);
        l++; r--;
    }
    const result = { ...ratesMap };
    presentYears.forEach((y, i) => { result[y] = balanced[i]; });
    return result;
}

/**
 * Generates balanced variable rates centered on targetAvg.
 */
export function generateBalancedVariableRates(years, targetAvg, weights = null) {
    const generated = generateRandomRates(years, targetAvg, weights);
    return applyBalancedSort(years, generated);
}

/**
 * Computes the simple (unweighted) average of a rates map over given years.
 * Only counts years that have valid numeric data.
 */
export function computeAverageRate(years, ratesMap) {
    const presentYears = years.filter(y => ratesMap[y] !== undefined && !isNaN(parseFloat(ratesMap[y])));
    if (presentYears.length === 0) return 0;
    const sum = presentYears.reduce((acc, y) => acc + parseFloat(ratesMap[y]), 0);
    return sum / presentYears.length;
}
