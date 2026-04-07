import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { migrateFromLocalStorage } from '../utils/db';
import { resetReminderSession } from '../hooks/useReminders';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    async function login() {
        googleProvider.setCustomParameters({
            prompt: 'select_account'
        });
        const result = await signInWithPopup(auth, googleProvider);

        // One-time migration from localStorage to Firestore
        try {
            await migrateFromLocalStorage(result.user.uid);
        } catch (err) {
            console.error('Migration from localStorage failed:', err);
        }

        return result;
    }

    function logout() {
        return signOut(auth);
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            // Reset reminder shown-state on every actual user-transition
            resetReminderSession();
            setCurrentUser(user);
            setLoading(false);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const value = {
        currentUser,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
