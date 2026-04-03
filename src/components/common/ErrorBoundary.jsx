
import React, { Component } from 'react';

// Detects Vite/webpack chunk load failures (stale module hash after dev server restart)
function isChunkLoadError(error) {
    const msg = error?.message || '';
    return (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Loading chunk') ||
        msg.includes('Importing a module script failed') ||
        error?.name === 'ChunkLoadError'
    );
}

// Error Boundary to catch render errors
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null, isChunkError: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, isChunkError: isChunkLoadError(error) };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            const { t } = this.props;
            const { isChunkError } = this.state;

            return (
                <div className="bg-red-900/40 border border-red-500/50 rounded-2xl p-6 text-white shadow-2xl backdrop-blur-md animate-in fade-in zoom-in duration-300">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-red-500/20 rounded-lg text-red-400">
                            <span className="text-xl">⚠️</span>
                        </div>
                        <h2 className="text-xl font-bold">
                            {t ? t('displayError') : 'שגיאה בתצוגה'}
                        </h2>
                    </div>

                    <p className="text-red-200/80 mb-4 text-sm font-medium leading-relaxed">
                        {isChunkError
                            ? (t ? t('chunkLoadError') : 'גרסה חדשה של האפליקציה זמינה — יש לרענן את הדף')
                            : (this.state.error?.message || (t ? t('unknownError') : 'שגיאה לא ידועה'))
                        }
                    </p>

                    {!isChunkError && (
                        <div className="relative group mb-6">
                            <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-gray-800 text-[10px] rounded text-gray-400 border border-gray-700 z-10">
                                Stack Trace
                            </div>
                            <pre
                                className="text-[10px] sm:text-xs bg-black/60 p-4 rounded-xl overflow-auto max-h-44 custom-scrollbar scrollbar-right font-mono border border-white/5 opacity-80"
                                style={{ direction: 'ltr', textAlign: 'left' }}
                            >
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        </div>
                    )}

                    {isChunkError ? (
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-2 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg active:scale-95"
                        >
                            {t ? t('reloadPage') : 'רענן דף'}
                        </button>
                    ) : (
                        <button
                            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null, isChunkError: false })}
                            className="mt-6 w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-red-900/20 active:scale-95"
                        >
                            {t ? t('tryAgain') : 'נסה שוב'}
                        </button>
                    )}
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
