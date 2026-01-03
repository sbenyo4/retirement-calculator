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
    birthdate: '',
    manualAge: false,
    lifeEvents: []
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

/**
 * Withdrawal strategies for retirement decumulation
 */
export const WITHDRAWAL_STRATEGIES = {
    FIXED: 'fixed',           // Fixed monthly amount (current behavior)
    FOUR_PERCENT: 'fourPercent', // 4% rule - withdraw 4% of initial balance yearly
    PERCENTAGE: 'percentage', // Fixed percentage of current balance
    DYNAMIC: 'dynamic',       // Adjust based on market conditions
    INTEREST_ONLY: 'interestOnly' // Withdraw only the monthly interest
};

// Life Events Types
export const EVENT_TYPES = {
    ONE_TIME_INCOME: 'oneTimeIncome',
    ONE_TIME_EXPENSE: 'oneTimeExpense',
    INCOME_CHANGE: 'incomeChange',
    EXPENSE_CHANGE: 'expenseChange'
};

/**
 * Default withdrawal strategy settings
 */
export const DEFAULT_WITHDRAWAL_SETTINGS = {
    strategy: WITHDRAWAL_STRATEGIES.FIXED,
    percentageRate: 4,        // For percentage strategy
    dynamicFloor: 0.8,        // Minimum 80% of base in bad years
    dynamicCeiling: 1.2       // Maximum 120% of base in good years
};
