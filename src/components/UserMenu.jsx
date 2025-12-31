import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export function UserMenu({ t }) {
    const { currentUser, logout } = useAuth();
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const [error, setError] = React.useState('');

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

            {currentUser && (
                <div className={`flex items-center gap-3 px-3 py-1.5 rounded-full border ${isLight ? 'bg-white border-slate-300 shadow-sm' : 'bg-white/10 border-white/10'}`}>
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
                        <p className={`font-medium leading-none ${isLight ? 'text-slate-900' : 'text-white'}`}>{currentUser.displayName}</p>
                        <p className={`text-xs ${isLight ? 'text-blue-600' : 'text-blue-200'}`}>{currentUser.email}</p>
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
            )}
        </div>
    );
}
