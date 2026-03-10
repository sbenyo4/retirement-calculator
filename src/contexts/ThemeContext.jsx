import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { getUserSettings, setUserSettings } from '../utils/db';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;
    const [theme, setTheme] = useState('dark'); // Default to dark
    const isInitialLoad = useRef(true);

    // Load theme from Firestore
    useEffect(() => {
        if (!uid) return;
        isInitialLoad.current = true;

        getUserSettings(uid).then(settings => {
            if (settings?.theme) {
                setTheme(settings.theme);
            }
            setTimeout(() => { isInitialLoad.current = false; }, 100);
        }).catch(err => {
            console.error('Error loading theme:', err);
            isInitialLoad.current = false;
        });
    }, [uid]);

    // Update document class and save to Firestore when theme changes
    useEffect(() => {
        if (theme === 'light') {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
        } else {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
        }

        // Save to Firestore
        if (uid && !isInitialLoad.current) {
            setUserSettings(uid, { theme }).catch(err => {
                console.error('Error saving theme:', err);
            });
        }
    }, [theme, uid]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
