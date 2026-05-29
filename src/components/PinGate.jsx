import React, { useEffect, useRef, useState, useCallback } from 'react';
import { KeyRound, Loader2, LockKeyhole, LogOut } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { getPinLock, setPinLock } from '../utils/db';
import { createPinLock, isValidPin, verifyPinLock } from '../utils/pinLock';

export function PinGate({ uid, t, onLogout, children }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const [pinLock, setStoredPinLock] = useState(null);
    const [mode, setMode] = useState('loading');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [lockoutUntil, setLockoutUntil] = useState(null);
    const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState(0);
    const pinInputRef = useRef(null);

    const MAX_ATTEMPTS = 5;
    const LOCKOUT_MS = 30_000;

    const isLockedOut = useCallback(() => lockoutUntil && Date.now() < lockoutUntil, [lockoutUntil]);

    useEffect(() => {
        if (!lockoutUntil) return;
        const tick = () => {
            const left = Math.ceil((lockoutUntil - Date.now()) / 1000);
            if (left <= 0) {
                setLockoutUntil(null);
                setLockoutSecondsLeft(0);
                setError('');
            } else {
                setLockoutSecondsLeft(left);
            }
        };
        tick();
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [lockoutUntil]);

    useEffect(() => {
        let active = true;
        setMode('loading');
        setPin('');
        setConfirmPin('');
        setError('');
        setFailedAttempts(0);
        setLockoutUntil(null);

        getPinLock(uid)
            .then(lock => {
                if (!active) return;
                setStoredPinLock(lock);
                setMode(lock ? 'unlock' : 'setup');
            })
            .catch(err => {
                console.error('Failed to load PIN lock:', err);
                if (active) {
                    setError(t('pinLoadError'));
                    setMode('error');
                }
            });

        return () => {
            active = false;
        };
    }, [uid, t]);

    const updatePin = setter => event => {
        setter(event.target.value.replace(/\D/g, '').slice(0, 8));
        setError('');
    };

    async function handleSetup(event) {
        event.preventDefault();
        if (!isValidPin(pin)) {
            setError(t('pinDigitsError'));
            return;
        }
        if (pin !== confirmPin) {
            setError(t('pinMismatchError'));
            return;
        }

        setBusy(true);
        try {
            const nextPinLock = await createPinLock(pin);
            await setPinLock(uid, nextPinLock);
            setStoredPinLock(nextPinLock);
            setMode('unlocked');
        } catch (err) {
            console.error('Failed to save PIN lock:', err);
            setError(t('pinSaveError'));
        } finally {
            setBusy(false);
        }
    }

    async function handleUnlock(event) {
        event.preventDefault();
        if (isLockedOut()) return;
        if (!isValidPin(pin)) {
            setError(t('pinDigitsError'));
            return;
        }

        setBusy(true);
        try {
            if (await verifyPinLock(pin, pinLock)) {
                setFailedAttempts(0);
                setMode('unlocked');
                return;
            }
            const nextFailed = failedAttempts + 1;
            setFailedAttempts(nextFailed);
            setPin('');
            if (nextFailed >= MAX_ATTEMPTS) {
                const until = Date.now() + LOCKOUT_MS;
                setLockoutUntil(until);
                setLockoutSecondsLeft(Math.ceil(LOCKOUT_MS / 1000));
                setError(t('pinLockedError').replace('{seconds}', Math.ceil(LOCKOUT_MS / 1000)));
            } else {
                setError(t('pinIncorrectError'));
            }
        } catch (err) {
            console.error('Failed to verify PIN lock:', err);
            setError(t('pinVerifyError'));
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        if (mode !== 'unlock' || !pinLock || !isValidPin(pin) || busy || isLockedOut()) return undefined;

        let active = true;
        const timeoutId = setTimeout(async () => {
            try {
                if (await verifyPinLock(pin, pinLock)) {
                    if (active) setMode('unlocked');
                }
            } catch (err) {
                console.error('Failed to auto-verify PIN lock:', err);
            }
        }, 250);

        return () => {
            active = false;
            clearTimeout(timeoutId);
        };
    }, [busy, mode, pin, pinLock]);

    useEffect(() => {
        if ((mode === 'unlock' || mode === 'setup') && !busy) {
            const timeoutId = setTimeout(() => pinInputRef.current?.focus(), 0);
            return () => clearTimeout(timeoutId);
        }
        return undefined;
    }, [busy, mode, error]);

    useEffect(() => {
        const focusPinInput = () => {
            setTimeout(() => pinInputRef.current?.focus(), 0);
        };

        window.addEventListener('rc-focus-pin-input', focusPinInput);
        return () => window.removeEventListener('rc-focus-pin-input', focusPinInput);
    }, []);

    if (mode === 'unlocked') return children;

    const isSetup = mode === 'setup';
    const isLoading = mode === 'loading';
    const locked = isLockedOut();
    const canSubmit = isSetup
        ? isValidPin(pin) && pin === confirmPin && !busy
        : isValidPin(pin) && !busy && !locked;

    return (
        <div className={`min-h-screen flex items-center justify-center p-4 ${isLight ? 'bg-slate-100' : 'bg-gradient-to-br from-gray-900 to-blue-900'}`}>
            <div className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white backdrop-blur-md'}`} dir={t('dir') === 'rtl' ? 'rtl' : 'ltr'}>
                <div className="mb-5 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className={`rounded-xl p-2.5 ${isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/20 text-blue-300'}`}>
                            {isSetup ? <KeyRound size={22} /> : <LockKeyhole size={22} />}
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">
                                {isSetup ? t('createPinTitle') : t('unlockPinTitle')}
                            </h1>
                            <p className={`mt-1 text-sm ${isLight ? 'text-slate-500' : 'text-blue-100/80'}`}>
                                {isSetup ? t('createPinDesc') : t('unlockPinDesc')}
                            </p>
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className={`flex items-center justify-center gap-2 rounded-xl py-10 ${isLight ? 'bg-slate-50 text-slate-500' : 'bg-white/5 text-blue-100'}`}>
                        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                            <Loader2 size={18} className="animate-spin" />
                        </span>
                        <span>{t('loadingPin')}</span>
                    </div>
                ) : mode === 'error' ? (
                    <div className="space-y-4">
                        <p className={`rounded-xl border p-3 text-sm ${isLight ? 'border-red-200 bg-red-50 text-red-700' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>
                            {error}
                        </p>
                        <button onClick={onLogout} className={`w-full rounded-xl px-4 py-2.5 font-semibold ${isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                            {t('logout')}
                        </button>
                    </div>
                ) : (
                    <form onSubmit={isSetup ? handleSetup : handleUnlock} className="space-y-3">
                        <label className="block text-center">
                            <span className={`mb-1 block w-full text-center text-sm font-medium ${isLight ? 'text-slate-600' : 'text-blue-100'}`} style={{ textAlign: 'center' }}>
                                {t('pinLabel')}
                            </span>
                            <input
                                ref={pinInputRef}
                                autoFocus
                                autoComplete={isSetup ? 'new-password' : 'one-time-code'}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                type="password"
                                value={pin}
                                onChange={updatePin(setPin)}
                                onBlur={() => setTimeout(() => pinInputRef.current?.focus(), 100)}
                                className={`w-full rounded-xl border px-4 py-3 text-center text-2xl tracking-[0.35em] outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'border-slate-300 bg-slate-50 text-slate-900' : 'border-white/20 bg-white/10 text-white'}`}
                            />
                        </label>

                        {isSetup && (
                            <label className="block text-center">
                                <span className={`mb-1 block w-full text-center text-sm font-medium ${isLight ? 'text-slate-600' : 'text-blue-100'}`} style={{ textAlign: 'center' }}>
                                    {t('confirmPinLabel')}
                                </span>
                                <input
                                    autoComplete="new-password"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    type="password"
                                    value={confirmPin}
                                    onChange={updatePin(setConfirmPin)}
                                    className={`w-full rounded-xl border px-4 py-3 text-center text-2xl tracking-[0.35em] outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'border-slate-300 bg-slate-50 text-slate-900' : 'border-white/20 bg-white/10 text-white'}`}
                                />
                            </label>
                        )}

                        {error && (
                            <div className={`rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-2 ${isLight ? 'border-red-200 bg-red-50 text-red-700' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>
                                <span>
                                    {locked
                                        ? t('pinLockedError').replace('{seconds}', lockoutSecondsLeft)
                                        : error}
                                </span>
                                {!locked && failedAttempts > 0 && (
                                    <span className="flex items-center gap-1.5 shrink-0">
                                        <span className={`text-xs font-medium whitespace-nowrap ${failedAttempts >= MAX_ATTEMPTS - 1 ? (isLight ? 'text-red-600' : 'text-red-300') : (isLight ? 'text-red-500' : 'text-red-400')}`}>
                                            {failedAttempts >= MAX_ATTEMPTS - 1
                                                ? t('pinLastAttempt')
                                                : t('pinAttemptsLeft').replace('{remaining}', MAX_ATTEMPTS - failedAttempts)}
                                        </span>
                                        <span className="flex gap-0.5">
                                            {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                                                <span
                                                    key={i}
                                                    className={`inline-block h-2 w-2 rounded-full transition-colors ${
                                                        i < failedAttempts
                                                            ? (failedAttempts >= MAX_ATTEMPTS - 1 ? 'bg-red-500' : 'bg-red-400')
                                                            : (isLight ? 'bg-red-200' : 'bg-red-900')
                                                    }`}
                                                />
                                            ))}
                                        </span>
                                    </span>
                                )}
                            </div>
                        )}

                        <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-blue-100/70'}`}>
                            {isSetup ? t('pinRememberWarning') : t('pinUnlockHint')}
                        </p>

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold transition-colors ${canSubmit ? 'bg-blue-600 text-white hover:bg-blue-700' : (isLight ? 'bg-slate-200 text-slate-400' : 'bg-white/10 text-white/40')}`}
                        >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                {busy && <Loader2 size={16} className="animate-spin" />}
                            </span>
                            {isSetup ? t('savePin') : t('unlock')}
                        </button>

                        <button
                            type="button"
                            onClick={onLogout}
                            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-blue-100 hover:bg-white/10'}`}
                        >
                            <LogOut size={15} />
                            {t('logout')}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
