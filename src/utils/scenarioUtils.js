/**
 * Generates per-year return rate overrides for a market scenario.
 *
 * The crash year gets an absolute annual return of `crashDepth` (e.g. -40).
 * Recovery years interpolate back to `baseRate` using the chosen curve shape:
 *   linear — equal steps each year
 *   v      — square-root curve  (fast early recovery, flattens later)
 *   u      — quadratic curve    (slow early recovery, accelerates later)
 *
 * @param {Object} scenario
 * @param {number} baseRate - nominal annual return % used as the recovery target
 * @returns {Object} { [year]: rate }
 */
export function generateScenarioRates(scenario, baseRate) {
    if (!scenario || scenario.type !== 'crash') return {};

    const { startYear, crashDepth, recoveryYears, recoveryShape = 'linear', recoveryMode = 'rate', targetAvgRate } = scenario;
    if (!startYear || isNaN(crashDepth) || !(recoveryYears >= 1)) return {};

    const rates = {};
    rates[startYear] = crashDepth;

    if (recoveryMode === 'value') {
        // Value recovery: calculate the flat annual rate such that the geometric mean
        // of the entire crash+recovery window equals targetAvgRate.
        // Math: (1+crash%) × (1+r)^N = (1+target%)^(N+1)  →  r = [(1+target%)^(N+1) / (1+crash%)]^(1/N) - 1
        const target = targetAvgRate ?? baseRate;
        const crashFactor = 1 + crashDepth / 100;
        if (crashFactor > 0) {
            const targetCompound = Math.pow(1 + target / 100, recoveryYears + 1);
            const recoveryProduct = targetCompound / crashFactor;
            const annualRecoveryRate = recoveryProduct > 0
                ? (Math.pow(recoveryProduct, 1 / recoveryYears) - 1) * 100
                : 0;
            for (let i = 1; i <= recoveryYears; i++) {
                rates[startYear + i] = annualRecoveryRate;
            }
        }
    } else {
        // Rate recovery: the crash already happened in startYear.
        // Recovery years ramp from 0% (market stabilises) back to baseRate.
        // V-shape = fast bounce (square-root), U-shape = slow grind (quadratic), linear = even steps.
        for (let i = 1; i <= recoveryYears; i++) {
            const t = i / recoveryYears;
            let progress;
            if (recoveryShape === 'v')      progress = Math.sqrt(t);
            else if (recoveryShape === 'u') progress = t * t;
            else                            progress = t; // linear
            rates[startYear + i] = baseRate * progress;
        }
    }

    return rates;
}

/**
 * Merges scenario-generated rates on top of the user's variable rates.
 * Scenario years always override whatever the user set for those years.
 * Years outside the scenario window keep their existing variable-rate values.
 *
 * @param {Object|undefined} variableRates - existing per-year rates from inputs
 * @param {Object|undefined} scenario
 * @param {boolean} scenarioEnabled
 * @param {number} baseRate - used as the recovery target
 * @returns {Object} merged rates map
 */
export function mergeScenarioIntoRates(variableRates, scenario, scenarioEnabled, baseRate) {
    if (!scenarioEnabled || !scenario) return variableRates || {};
    const scenarioRates = generateScenarioRates(scenario, baseRate);
    if (Object.keys(scenarioRates).length === 0) return variableRates || {};
    return { ...(variableRates || {}), ...scenarioRates };
}
