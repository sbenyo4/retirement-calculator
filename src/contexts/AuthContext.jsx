import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
    const lastAuthUidRef = useRef(undefined);
    const wasAuthenticatedRef = useRef(false);

    async function login() {
        googleProvider.setCustomParameters({
            prompt: 'select_account'
        });
        const result = await signInWithPopup(auth, googleProvider);
        // Every explicit login starts a fresh reminder-popup session.
        resetReminderSession();

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
            const nextUid = user?.uid || null;
            const becameAuthenticated = !wasAuthenticatedRef.current && !!user;
            if (lastAuthUidRef.current !== nextUid || becameAuthenticated) {
                // Reset reminder session when auth identity changes OR when a fresh login occurs.
                resetReminderSession();
                lastAuthUidRef.current = nextUid;
            }
            wasAuthenticatedRef.current = !!user;
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
