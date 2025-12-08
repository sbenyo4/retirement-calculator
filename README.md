# Retirement Calculator

A modern, intelligent retirement planning application built with React and Vite. This tool goes beyond simple math by integrating AI models (Gemini, OpenAI, Anthropic) and Monte Carlo simulations to provide a robust financial outlook.

## 🚀 Installation & Setup

### Prerequisites
- **Node.js**: Ensure you have Node.js installed (v16 or higher recommended). [Download Node.js](https://nodejs.org/)

### Step-by-Step Guide

1.  **Clone or Download the Repository**
    ```bash
    git clone <repository-url>
    cd retirement-calculator
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables (Important for AI Features)**
    To use the AI calculation features, you need to set up your API keys.
    
    - Create a copy of the example environment file:
      ```bash
      cp .env.example .env
      ```
    - Open `.env` in a text editor and add your API keys:
      ```env
      VITE_GEMINI_API_KEY=your_gemini_key_here
      VITE_OPENAI_API_KEY=your_openai_key_here
      VITE_ANTHROPIC_API_KEY=your_anthropic_key_here
      ```
    - *Note: You don't need all keys. The app will only show providers for which you have keys configured.*

4.  **Start the Application**
    ```bash
    npm run dev
    ```
    - Open your browser and navigate to the URL shown (usually `http://localhost:5173`).

---

## 📖 User Manual

### 1. Getting Started
When you open the app, you'll see the **Input Panel** on the right (or top on mobile) and the **Results Dashboard** on the left.
- **Language**: Toggle between **English (USD)** and **Hebrew (ILS)** using the globe icon in the top navigation bar.
- **Profiles**: Use the "Profile" menu to save your current scenario or load a previous one.

### 2. Input Parameters
Enter your financial details to generate a projection:

- **Birthdate / Current Age**: Your starting point.
- **Retirement Start Age**: The age you plan to stop working.
- **Retirement End Age**: The age you want to plan until (life expectancy).
- **Current Savings**: Total amount you have saved/invested today.
- **Monthly Contribution**: How much you add to your savings *each month* (stops at Retirement Start Age).
- **Monthly Net Income Desired**: The monthly amount you want to spend during retirement (after tax).
- **Annual Return Rate**: Expected average yearly return on your investments (e.g., 5-7%).
- **Tax Rate**: Capital gains tax rate applied to profits (e.g., 25%).

### 3. Calculation Modes
Choose how you want to calculate your future:

#### 🧮 Mathematical (Default)
Uses standard financial formulas to project deterministic results. Fast and accurate for baseline planning.

#### ✨ AI Mode
Uses advanced LLMs (Large Language Models) to analyze your data.
- **Provider**: Select Gemini, OpenAI, or Anthropic.
- **Model**: Choose a specific model (e.g., GPT-4o, Claude 3.5 Sonnet).
- **API Key Override**: Click the settings (gear) icon to temporarily use a different API key than the one in your `.env` file.
- **Why use this?** AI can provide "sanity checks", explain the logic, and sometimes offer a more nuanced perspective on the accumulation/decumulation phases.

#### 🎲 Simulations
Runs multiple scenarios to show a range of possibilities:
- **Monte Carlo**: Runs hundreds of simulations with random market volatility to show the probability of success.
- **Conservative**: Assumes lower returns and higher inflation.
- **Optimistic**: Assumes higher market performance.

#### 🔀 Compare
Splits the screen to show **AI** results vs. **Mathematical** results side-by-side, allowing you to spot discrepancies or confirm your plan.

### 4. Understanding the Results

- **Balance at Retirement**: The total pot of money you are projected to have on your first day of retirement.
- **Required Capital**: The total amount you *actually need* to have at retirement to fund your desired monthly income until the end age (aiming for $0 balance at the end).
- **Needed Today (Deficit/Surplus)**:
    - **Deficit (Red)**: The "gap". The amount of money you would need to deposit *today* (lump sum) to fix the shortfall.
    - **Surplus (Green)**: You are on track! This is the extra money you have above what is needed.
- **Capital Preservation**: The amount needed at retirement to live *only off the interest* (perpetuity), never touching the principal.
    - **"Needed Today" for Preservation**: The Present Value of that perpetuity capital.

### 5. The Graph
- **Green Line**: Your projected balance over time.
- **Upward Slope**: Accumulation phase (working years).
- **Downward Slope**: Decumulation phase (retirement years).
- **Flatline at 0**: Indicates you have run out of money before the End Age.

### 6. Tips
- **Click to Copy**: Click on any result value (like "Needed Today") to copy it.
- **Quick Fill**: If you have a deficit, a small button may appear in the "Current Savings" input to instantly add the "Needed Today" amount to your savings for a "what-if" scenario.
