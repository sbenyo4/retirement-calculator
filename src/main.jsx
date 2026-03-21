import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'


// Prevent arrow-key increment/decrement on number inputs
document.addEventListener('keydown', (e) => {
    if (document.activeElement?.type === 'number' &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
    }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
