import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY?.trim();

async function testGemini() {
    if (!apiKey) {
        console.error("No API Key found in .env");
        return;
    }

    console.log("Testing Gemini API with key ending in: " + apiKey.slice(-4));

    const modelsToTest = ["gemini-1.5-flash", "gemini-pro", "models/gemini-1.5-flash"];

    for (const model of modelsToTest) {
        console.log(`\n--- Testing model: ${model} ---`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: "Hello, are you working?" }]
                    }]
                })
            });

            const data = await response.json();

            if (response.ok) {
                console.log("SUCCESS! Model works.");
            } else {
                console.error(`FAILED (${response.status}):`, data.error?.message || data);
            }
        } catch (error) {
            console.error("Network/Fetch Error:", error.message);
        }
    }
}

testGemini();
