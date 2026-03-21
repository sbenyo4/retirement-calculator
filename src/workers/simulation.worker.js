import { calculateSimulation } from '../utils/simulation-calculator';
import { runProjectionWithGoalSeek } from '../utils/calculators/goalSeek';

self.onmessage = function (e) {
    const { requestId, type, inputs, simulationType } = e.data;
    try {
        const result = type === 'projection'
            ? runProjectionWithGoalSeek(inputs)
            : calculateSimulation(inputs, simulationType);
        self.postMessage({ requestId, type, result, error: null });
    } catch (error) {
        self.postMessage({ requestId, type, result: null, error: error.message });
    }
};
