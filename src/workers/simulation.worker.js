import { calculateSimulation } from '../utils/simulation-calculator';

self.onmessage = function (e) {
    const { requestId, inputs, simulationType } = e.data;
    try {
        const result = calculateSimulation(inputs, simulationType);
        self.postMessage({ requestId, result, error: null });
    } catch (error) {
        self.postMessage({ requestId, result: null, error: error.message });
    }
};
