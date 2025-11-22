# How to Run on Mobile & Publish

You have two main options to run this application on your mobile device:

## Option 1: Local Network (Immediate Testing)
Use this to test on your phone while your computer is running. Both devices must be on the **same Wi-Fi network**.

1.  **Stop the current server**: Click in the terminal where `npm run dev` is running and press `Ctrl+C`.
2.  **Run with Host flag**: Run the following command:
    ```bash
    npm run dev -- --host
    ```
3.  **Find the Network URL**: The terminal will show something like:
    ```
      ➜  Local:   http://localhost:5173/
      ➜  Network: http://192.168.1.105:5173/
    ```
4.  **Open on Mobile**: Type the **Network** URL (e.g., `http://192.168.1.105:5173`) into your phone's web browser.

---

## Option 2: Publish to the Web (Permanent)
Use this to make the app accessible from anywhere, anytime. The easiest free way is using **Vercel**.

### Prerequisites
*   A GitHub account (free).
*   A Vercel account (free).

### Steps
1.  **Push your code to GitHub**:
    *   Initialize Git (if not done): `git init`
    *   Add files: `git add .`
    *   Commit: `git commit -m "Initial commit"`
    *   Create a new repository on GitHub.com.
    *   Follow GitHub's instructions to push your code.

2.  **Deploy on Vercel**:
    *   Go to [vercel.com](https://vercel.com) and sign up/login.
    *   Click **"Add New..."** -> **"Project"**.
    *   Select **"Continue with GitHub"**.
    *   Find your `retirement-calculator` repository and click **"Import"**.
    *   **Framework Preset**: It should auto-detect "Vite".
    *   Click **"Deploy"**.

3.  **Done!**: Vercel will give you a URL (e.g., `retirement-calculator.vercel.app`) that you can share and open on any mobile device.

---

## Option 3: Build for Production (Advanced)
If you want to host it yourself on a static server:

1.  Run the build command:
    ```bash
    npm run build
    ```
2.  This creates a `dist` folder.
3.  Upload the contents of the `dist` folder to any static hosting provider (Netlify, GitHub Pages, AWS S3, etc.).
