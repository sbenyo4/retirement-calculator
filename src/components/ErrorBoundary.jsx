import React, { Component } from 'react';

/**
 * Enhanced Error Boundary with better error handling and logging
 * Catches JavaScript errors anywhere in the child component tree
 */
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            errorCount: 0
        };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Log error details
        this.setState(prev => ({
            error,
            errorInfo,
            errorCount: prev.errorCount + 1
        }));

        // Log to console with detailed info
        console.group('🔴 Error Boundary Caught Error');
        console.error('Error:', error);
        console.error('Error Info:', errorInfo);
        console.error('Component Stack:', errorInfo.componentStack);
        console.groupEnd();

        // In production, you could send this to an error reporting service
        // Example: Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });

        // Call custom reset handler if provided
        if (this.props.onReset) {
            this.props.onReset();
        }
    };

    render() {
        if (this.state.hasError) {
            // Custom fallback UI
            if (this.props.fallback) {
                return this.props.fallback({
                    error: this.state.error,
                    errorInfo: this.state.errorInfo,
                    resetError: this.handleReset
                });
            }

            // Default fallback UI
            const { t, theme = 'dark', componentName } = this.props;
            const isLight = theme === 'light';

            return (
                <div className={`rounded-xl p-6 shadow-xl ${isLight ? 'bg-red-50 border border-red-200' : 'bg-red-900/30 border border-red-500/50'}`}>
                    <div className="flex items-start gap-3 mb-4">
                        <span className="text-3xl">⚠️</span>
                        <div className="flex-1">
                            <h2 className={`text-xl font-bold mb-1 ${isLight ? 'text-red-900' : 'text-red-100'}`}>
                                {componentName
                                    ? (t?.('componentError') || 'Component Error') + `: ${componentName}`
                                    : (t?.('displayError') || 'Something went wrong')
                                }
                            </h2>
                            <p className={`text-sm ${isLight ? 'text-red-700' : 'text-red-200'}`}>
                                {t?.('errorDescription') || 'An unexpected error occurred. Please try again.'}
                            </p>
                        </div>
                    </div>

                    {/* Error Details (collapsed by default in production) */}
                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <details className={`mb-4 ${isLight ? 'text-red-800' : 'text-red-300'}`}>
                            <summary className="cursor-pointer font-semibold text-sm mb-2">
                                🔍 Technical Details (Dev Only)
                            </summary>
                            <div className={`text-xs p-3 rounded ${isLight ? 'bg-red-100' : 'bg-black/30'}`}>
                                <p className="font-mono mb-2">
                                    <strong>Error:</strong> {this.state.error.message}
                                </p>
                                {this.state.errorInfo?.componentStack && (
                                    <pre className="overflow-auto max-h-40 text-[10px] leading-tight">
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                )}
                            </div>
                        </details>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={this.handleReset}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${isLight
                                    ? 'bg-red-600 text-white hover:bg-red-700'
                                    : 'bg-red-600 text-white hover:bg-red-700'
                                }`}
                        >
                            {t?.('tryAgain') || 'Try Again'}
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${isLight
                                    ? 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                                    : 'bg-white/10 text-white hover:bg-white/20'
                                }`}
                        >
                            {t?.('reloadPage') || 'Reload Page'}
                        </button>
                    </div>

                    {/* Error Count Warning */}
                    {this.state.errorCount > 2 && (
                        <div className={`mt-4 p-3 rounded text-sm ${isLight ? 'bg-yellow-100 text-yellow-800' : 'bg-yellow-900/30 text-yellow-200'}`}>
                            ⚠️ {t?.('multipleErrors') || 'Multiple errors detected. Consider reloading the page.'}
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
