import { useEffect, useRef, useState } from 'react';
import { Loader2, LockKeyhole, LogOut } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { getPinLock } from '../utils/db';
import { isValidPin, verifyPinLock } from '../utils/pinLock';

export function ScreenLockOverlay({ uid, t, onUnlock, onLogout }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const [pinLock, setPinLock] = useState(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const pinInputRef = useRef(null);

    useEffect(() => {
        let active = true;

        getPinLock(uid)
            .then(lock => {
                if (!active) return;
                setPinLock(lock);
                if (!lock) setError(t('pinLoadError'));
            })
            .catch(err => {
                console.error('Failed to load screen PIN lock:', err);
                if (active) setError(t('pinLoadError'));
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [t, uid]);

    const updatePin = event => {
        setPin(event.target.value.replace(/\D/g, '').slice(0, 8));
        setError('');
    };

    const handleUnlock = async event => {
        event.preventDefault();
        if (!pinLock) return;
        if (!isValidPin(pin)) {
            setError(t('pinDigitsError'));
            return;
        }

        setBusy(true);
        try {
            if (await verifyPinLock(pin, pinLock)) {
                onUnlock?.();
                return;
            }

            setPin('');
            setError(t('pinIncorrectError'));
        } catch (err) {
            console.error('Failed to unlock screen:', err);
            setError(t('pinVerifyError'));
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        if (!pinLock || !isValidPin(pin) || busy || loading) return undefined;

        let active = true;
        const timeoutId = setTimeout(async () => {
            try {
                if (await verifyPinLock(pin, pinLock)) {
                    if (active) onUnlock?.();
                }
            } catch (err) {
                console.error('Failed to auto-unlock screen:', err);
            }
        }, 250);

        return () => {
            active = false;
            clearTimeout(timeoutId);
        };
    }, [busy, loading, onUnlock, pin, pinLock]);

    useEffect(() => {
        if (!loading && !busy) {
            const timeoutId = setTimeout(() => pinInputRef.current?.focus(), 0);
            return () => clearTimeout(timeoutId);
        }
        return undefined;
    }, [busy, error, loading]);

    useEffect(() => {
        const focusPinInput = () => {
            setTimeout(() => pinInputRef.current?.focus(), 0);
        };

        window.addEventListener('rc-focus-pin-input', focusPinInput);
        return () => window.removeEventListener('rc-focus-pin-input', focusPinInput);
    }, []);

    return (
        <div className={`fixed inset-0 z-[190] flex items-center justify-center p-4 ${isLight ? 'bg-slate-100/95' : 'bg-slate-950/95'} backdrop-blur-md`}>
            <div className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-white/10 border-white/20 text-white'}`} dir={t('dir') === 'rtl' ? 'rtl' : 'ltr'}>
                <div className="mb-5 flex items-start gap-3">
                    <div className={`rounded-xl p-2.5 ${isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/20 text-blue-300'}`}>
                        <LockKeyhole size={22} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">{t('screenLockedTitle')}</h1>
                        <p className={`mt-1 text-sm ${isLight ? 'text-slate-500' : 'text-blue-100/80'}`}>
                            {t('screenLockedDesc')}
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className={`flex items-center justify-center gap-2 rounded-xl py-10 ${isLight ? 'bg-slate-50 text-slate-500' : 'bg-white/5 text-blue-100'}`}>
                        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                            <Loader2 size={18} className="animate-spin" />
                        </span>
                        <span>{t('loadingPin')}</span>
                    </div>
                ) : (
                    <form onSubmit={handleUnlock} className="space-y-3">
                        <label className="block text-center">
                            <span className={`mb-1 block w-full text-center text-sm font-medium ${isLight ? 'text-slate-600' : 'text-blue-100'}`} style={{ textAlign: 'center' }}>
                                {t('pinLabel')}
                            </span>
                            <input
                                ref={pinInputRef}
                                autoFocus
                                autoComplete="one-time-code"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                type="password"
                                value={pin}
                                onChange={updatePin}
                                className={`w-full rounded-xl border px-4 py-3 text-center text-2xl tracking-[0.35em] outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'border-slate-300 bg-slate-50 text-slate-900' : 'border-white/20 bg-white/10 text-white'}`}
                            />
                        </label>

                        {error && (
                            <p className={`rounded-lg border px-3 py-2 text-sm ${isLight ? 'border-red-200 bg-red-50 text-red-700' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={!pinLock || !isValidPin(pin) || busy}
                            className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold ${pinLock && isValidPin(pin) && !busy ? 'bg-blue-600 text-white hover:bg-blue-700' : (isLight ? 'bg-slate-200 text-slate-400' : 'bg-white/10 text-white/40')}`}
                        >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                {busy && <Loader2 size={16} className="animate-spin" />}
                            </span>
                            {t('unlock')}
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
