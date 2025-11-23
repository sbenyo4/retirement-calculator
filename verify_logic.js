import { calculateRetirementProjection } from './src/utils/calculator.js';

function verifyCalculations() {
    const inputs = {
        currentAge: 30,
        retirementStartAge: 60,
        retirementEndAge: 90,
        currentSavings: 0, // Will be overridden for verification
        monthlyContribution: 0,
        monthlyNetIncomeDesired: 10000,
        annualReturnRate: 5,
        taxRate: 25,
        birthdate: ''
    };

    console.log("--- Verifying Required Capital (Annuity) ---");
    // 1. Get the required capital from the calculator
    const initialResult = calculateRetirementProjection(inputs);
    const requiredCapital = initialResult.requiredCapitalAtRetirement;
    console.log(`Calculated Required Capital: ${requiredCapital.toFixed(2)}`);

    // 2. Simulate with this capital as the starting balance at retirement
    // We can simulate this by setting currentSavings to requiredCapital and ages to retirement phase only
    const annuityInputs = {
        ...inputs,
        currentAge: 60,
        retirementStartAge: 60,
        retirementEndAge: 90,
        currentSavings: requiredCapital,
        monthlyContribution: 0
    };

    const annuityResult = calculateRetirementProjection(annuityInputs);
    console.log(`Balance at End (should be ~0): ${annuityResult.balanceAtEnd.toFixed(2)}`);
    console.log(`Ran Out At Age: ${annuityResult.ranOutAtAge}`);

    if (Math.abs(annuityResult.balanceAtEnd) < 1 && !annuityResult.ranOutAtAge) {
        console.log("✅ Annuity Calculation Verified");
    } else {
        console.log("❌ Annuity Calculation Failed");
    }

    console.log("\n--- Verifying Capital Preservation (Perpetuity) ---");
    // 1. Get the required capital for perpetuity
    const perpetuityCapital = initialResult.requiredCapitalForPerpetuity;
    console.log(`Calculated Perpetuity Capital: ${perpetuityCapital.toFixed(2)}`);

    // 2. Simulate with this capital
    const perpetuityInputs = {
        ...inputs,
        currentAge: 60,
        retirementStartAge: 60,
        retirementEndAge: 90,
        currentSavings: perpetuityCapital,
        monthlyContribution: 0
    };

    const perpetuityResult = calculateRetirementProjection(perpetuityInputs);
    console.log(`Balance at End (should be ~${perpetuityCapital.toFixed(2)}): ${perpetuityResult.balanceAtEnd.toFixed(2)}`);

    // Allow small floating point error
    if (Math.abs(perpetuityResult.balanceAtEnd - perpetuityCapital) < 1) {
        console.log("✅ Perpetuity Calculation Verified");
    } else {
        console.log("❌ Perpetuity Calculation Failed");
    }
}

verifyCalculations();
