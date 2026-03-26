import { useTheme } from '../contexts/ThemeContext';

export function IdleWarningModal({ secondsLeft, onStayLoggedIn, language }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isHe = language === 'he';

    const title = isHe ? 'אזהרת ניתוק אוטומטי' : 'Auto-Logout Warning';
    const message = isHe
        ? `תנותק אוטומטית עוד`
        : `You will be logged out in`;
    const unit = isHe ? 'שניות' : 'seconds';
    const btnLabel = isHe ? 'הישאר מחובר' : 'Stay Logged In';

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className={`w-full max-w-sm mx-4 rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-5 ${isLight ? 'bg-white' : 'bg-gray-900 border border-white/20'}`}
                dir={isHe ? 'rtl' : 'ltr'}
            >
                {/* Icon */}
                <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                </div>

                {/* Title */}
                <h2 className={`text-xl font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                    {title}
                </h2>

                {/* Message + countdown */}
                <p className={`text-center text-sm ${isLight ? 'text-gray-600' : 'text-gray-300'}`}>
                    {message}
                </p>

                {/* Countdown circle */}
                <div className={`text-5xl font-bold tabular-nums ${secondsLeft <= 10 ? 'text-red-500' : 'text-orange-500'}`}>
                    {secondsLeft}
                </div>
                <p className={`text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>{unit}</p>

                {/* Progress bar */}
                <div className={`w-full h-2 rounded-full ${isLight ? 'bg-gray-200' : 'bg-gray-700'}`}>
                    <div
                        className="h-2 rounded-full bg-orange-500 transition-all duration-1000"
                        style={{ width: `${(secondsLeft / 30) * 100}%` }}
                    />
                </div>

                {/* Button */}
                <button
                    onClick={onStayLoggedIn}
                    className="w-full py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                    {btnLabel}
                </button>
            </div>
        </div>
    );
}
