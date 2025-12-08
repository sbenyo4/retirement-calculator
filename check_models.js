import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY;

async function checkModels() {
    if (!apiKey) {
        console.error("No API Key found!");
        return;
    }

    console.log("Checking models with key ending in...", apiKey.slice(-4));

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.error) {
            console.error("API Error:", data.error);
        } else if (data.models) {
            console.log("Successfully listed models:");
            data.models.forEach(m => {
                if (m.name.includes('gemini')) {
                    console.log(`- ${m.name}`);
                }
            });
        } else {
            console.log("Unexpected response:", data);
        }
    } catch (e) {
        console.error("Fetch error:", e);
    }
}

checkModels();
