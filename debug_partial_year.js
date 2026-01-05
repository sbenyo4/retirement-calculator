
const getMonthsForYear = (year, startYear, endYear, inputs) => {
    // 1. First Year (Current Year)
    if (year === startYear) {
        const currentMonth = new Date().getMonth(); // 0-11
        return 12 - currentMonth;
    }

    // 2. Last Year (End of Simulation)
    if (year === endYear) {
        if (inputs && inputs.birthDate && inputs.retirementEndAge) {
            const date = new Date(inputs.birthDate);
            if (isNaN(date.getTime())) {
                console.log("Invalid Date detected for:", inputs.birthDate);
                return 12;
            }
            const birthMonth = date.getMonth();
            const endAgeMonths = (parseFloat(inputs.retirementEndAge) % 1) * 12;

            // Logic check:
            // Born Feb (1). Age 67.0. => (1 + 0) % 12 = 1 (Feb). Returns 2 (Jan, Feb).
            const endMonthIndex = Math.floor((birthMonth + endAgeMonths) % 12);
            console.log(`Debug: BirthMonth=${birthMonth}, EndAge=${inputs.retirementEndAge}, EndAgeMonths=${endAgeMonths}, EndMonthIndex=${endMonthIndex}`);
            return endMonthIndex + 1;
        }
        console.log("Missing inputs for End Year calc");
        return 12; // Fallback
    }

    return 12;
};

// Test Cases
const startYear = 2024;
const endYear = 2039;

const inputs1 = {
    birthDate: "1974-02-15",
    retirementEndAge: 65 // Should result in 2039 Feb
};

const inputs2 = {
    birthDate: "1974-02-15",
    retirementEndAge: "65.5" // Should result in 2039 Aug
};

const inputsMissing = {
    retirementEndAge: 65
};

console.log("Case 1 (Integer Age):", getMonthsForYear(2039, startYear, endYear, inputs1));
console.log("Case 2 (Fractional Age):", getMonthsForYear(2039, startYear, endYear, inputs2));
console.log("Case 3 (Missing BirthDate):", getMonthsForYear(2039, startYear, endYear, inputsMissing));
