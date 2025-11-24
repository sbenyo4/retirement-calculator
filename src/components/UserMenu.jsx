import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export function UserMenu({ t }) {
    const { currentUser, login, logout } = useAuth();
    const [error, setError] = React.useState('');

    async function handleLogin() {
        try {
            setError('');
            await login();
        } catch (err) {
            setError('Failed to log in');
            console.error(err);
        }
    }

    async function handleLogout() {
        try {
            setError('');
            await logout();
        } catch (err) {
            setError('Failed to log out');
            console.error(err);
        }
    }

    return (
        <div className="flex items-center gap-4">
            {error && <span className="text-red-400 text-sm">{error}</span>}

            {currentUser ? (
                <div className="flex items-center gap-3 bg-white/10 px-3 py-1.5 rounded-full border border-white/10">
                    {currentUser.photoURL ? (
                        <img
                            src={currentUser.photoURL}
                            alt="Profile"
                            className="w-8 h-8 rounded-full border-2 border-blue-400"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                            {currentUser.displayName ? currentUser.displayName[0] : 'U'}
                        </div>
                    )}
                    <div className="hidden md:block text-sm">
                        <p className="text-white font-medium leading-none">{currentUser.displayName}</p>
                        <p className="text-blue-200 text-xs">{currentUser.email}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="ml-2 text-gray-400 hover:text-white transition-colors"
                        title={t('logout')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                </div>
            ) : (
                <button
                    onClick={handleLogin}
                    className="flex items-center gap-2 bg-white text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors font-medium shadow-lg shadow-black/20"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            fill="currentColor"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="currentColor"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26-1.18-2.58z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                    {t('signInWithGoogle')}
                </button>
            )}
        </div>
    );
}
