import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration
// For security, these should ideally be in environment variables (e.g., .env.local)
const firebaseConfig = {
    apiKey: "AIzaSyCqpXmO5DtYJc9x3tFO4C37hYs0Af9Mhf4",
    authDomain: "myproject-54f25.firebaseapp.com",
    projectId: "myproject-54f25",
    storageBucket: "myproject-54f25.firebasestorage.app",
    messagingSenderId: "312386350430",
    appId: "1:312386350430:web:14d5048f0010738e8e33cf"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
