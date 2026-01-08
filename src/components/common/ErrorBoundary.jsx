
import React, { Component } from 'react';

// Error Boundary to catch render errors
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            const { t } = this.props;
            return (
                <div className="bg-red-900/50 border border-red-500 rounded-xl p-4 text-white">
                    <h2 className="text-xl font-bold mb-2">⚠️ {t ? t('displayError') : 'שגיאה בתצוגה'}</h2>
                    <p className="text-red-300 mb-2">{this.state.error?.message || (t ? t('unknownError') : 'Unknown error')}</p>
                    <pre className="text-xs bg-black/50 p-2 rounded overflow-auto max-h-40">
                        {this.state.errorInfo?.componentStack}
                    </pre>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                        className="mt-2 bg-blue-600 px-4 py-2 rounded"
                    >
                        {t ? t('tryAgain') : 'נסה שוב'}
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
