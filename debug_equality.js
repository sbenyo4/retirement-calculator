
import { deepEqual } from './src/hooks/useDeepCompare.js';
import { DEFAULT_INPUTS } from './src/constants.js';

console.log("DEFAULT_INPUTS:", JSON.stringify(DEFAULT_INPUTS, null, 2));

const savedProfileData = {
    ...DEFAULT_INPUTS,
    // Simulate an old profile missing the new keys
};
delete savedProfileData.variableRates;
delete savedProfileData.variableRatesEnabled;

const currentInputs = {
    ...DEFAULT_INPUTS,
    // Simulate current inputs having the keys
    variableRates: {},
    variableRatesEnabled: false
};

// Simulate ProfileManager logic
const comparisonData = { ...DEFAULT_INPUTS, ...savedProfileData };

console.log("Comparison Data Keys:", Object.keys(comparisonData));
console.log("Current Inputs Keys:", Object.keys(currentInputs));

const isEqual = deepEqual(currentInputs, comparisonData);
console.log("Is Equal?", isEqual);

if (!isEqual) {
    console.log("Mismatch Details:");
    for (const key of Object.keys(currentInputs)) {
        if (!deepEqual(currentInputs[key], comparisonData[key])) {
            console.log(`Key '${key}' mismatch:`, currentInputs[key], "vs", comparisonData[key]);
        }
    }
}
