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
    const unsubscribeRef = useRef(null);

    async function login() {
        googleProvider.setCustomParameters({
            prompt: 'select_account'
        });
        const result = await signInWithPopup(auth, googleProvider);
        // Every explicit login starts a fresh reminder-popup session.
        resetReminderSession();

        return result;
    }

    function logout() {
        return signOut(auth);
    }

    useEffect(() => {
        // Force login on every page load — no persisted sessions survive a refresh.
        setPersistence(auth, inMemoryPersistence)
            .then(() => signOut(auth))
            .catch(() => {})
            .finally(() => {
                const unsubscribe = onAuthStateChanged(auth, async (user) => {
                    const nextUid = user?.uid || null;
                    const becameAuthenticated = !wasAuthenticatedRef.current && !!user;
                    if (lastAuthUidRef.current !== nextUid || becameAuthenticated) {
                        // Reset reminder session when auth identity changes OR when a fresh login occurs.
                        resetReminderSession();
                        lastAuthUidRef.current = nextUid;
                    }
                    wasAuthenticatedRef.current = !!user;

                    if (user) {
                        setLoading(true);
                        try {
                            await migrateFromLocalStorage(user.uid);
                        } catch (err) {
                            console.error('Migration from localStorage failed:', err);
                        }
                    }

                    setCurrentUser(user);
                    setLoading(false);
                });

                // Store unsubscribe for cleanup — but since this is inside a promise
                // chain we can't return it directly, so attach to a ref.
                unsubscribeRef.current = unsubscribe;
            });

        return () => {
            unsubscribeRef.current?.();
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
