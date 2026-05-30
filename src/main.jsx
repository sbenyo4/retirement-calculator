import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { logger } from './utils/logger'


// Global safety nets: surface errors the React ErrorBoundary can't catch
// (async/promise rejections, errors outside the render tree). Keeps prod quiet
// via logger while still recording the failure for debugging.
window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', (event) => {
    logger.error('Uncaught error:', event.error || event.message);
});

// Prevent arrow-key increment/decrement on number inputs
document.addEventListener('keydown', (e) => {
    if (document.activeElement?.type === 'number' &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
    }
});

// Prevent browser zoom (Ctrl +/-, Ctrl+0, Ctrl+scroll)
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
    }
});

document.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
    }
}, { passive: false });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
