import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}
useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        setLoading(false);
    });

    return unsubscribe;
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
