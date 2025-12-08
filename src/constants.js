/**
 * Application constants for the retirement calculator
 */

/**
 * Default input values for new profiles/users
 */
export const DEFAULT_INPUTS = {
    currentAge: 30,
    retirementStartAge: 50,
    retirementEndAge: 67,
    currentSavings: 0,
    monthlyContribution: 0,
    monthlyNetIncomeDesired: 4000,
    annualReturnRate: 5,
    taxRate: 25,
    birthdate: ''
};

/**
 * Age validation limits
 */
export const AGE_LIMITS = {
    MIN: 0,
    MAX: 120
};

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
    CALCULATION_MODE: 'calculationMode',
    AI_PROVIDER: 'aiProvider',
    AI_MODEL: 'aiModel',
    SIMULATION_TYPE: 'simulationType',
    getApiKeyOverride: (provider) => `apiKeyOverride_${provider}`,
    getProfiles: (userId) => userId ? `retirementProfiles_${userId}` : 'retirementProfiles_guest'
};

/**
 * Calculation modes
 */
export const CALCULATION_MODES = {
    MATHEMATICAL: 'mathematical',
    AI: 'ai',
    SIMULATIONS: 'simulations',
    COMPARE: 'compare'
};
