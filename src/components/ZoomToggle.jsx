import React from 'react';
import { useZoom } from '../hooks/useZoom';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export function ZoomToggle() {
    const { zoomLevel, zoomIn, zoomOut } = useZoom();
    const { theme } = useTheme();
    const isLight = theme === 'light';

    const btnClass = `p-1.5 rounded transition-all ${isLight
        ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm disabled:opacity-30'
        : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-30'
    }`;

    return (
        <div className={`flex items-center rounded-lg overflow-hidden border gap-0 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-white/10 bg-white/5'}`}>
            <button onClick={zoomOut} disabled={zoomLevel <= 50} className={btnClass} title="Zoom Out">
                <ZoomOut size={15} />
            </button>
            <span className="text-xs font-semibold tabular-nums px-2 select-none" style={{ minWidth: '3rem', textAlign: 'center' }}>
                {zoomLevel}%
            </span>
            <button onClick={zoomIn} disabled={zoomLevel >= 150} className={btnClass} title="Zoom In">
                <ZoomIn size={15} />
            </button>
        </div>
    );
}
