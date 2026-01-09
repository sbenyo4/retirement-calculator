import React from 'react';
import { useZoom } from '../hooks/useZoom';
import { Monitor, ZoomIn, ZoomOut } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export function ZoomToggle() {
    const { zoomLevel, toggleZoom } = useZoom();
    const { theme } = useTheme();
    const isLight = theme === 'light';

    return (
        <button
            onClick={toggleZoom}
            className={`p-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${isLight
                    ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm'
                    : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
            title={zoomLevel === 100 ? 'Switch to Compact View (90%)' : 'Switch to Normal View (100%)'}
        >
            {zoomLevel === 100 ? (
                <ZoomOut size={18} />
            ) : (
                <ZoomIn size={18} />
            )}
            <span className="text-xs font-semibold tabular-nums w-8">
                {zoomLevel}%
            </span>
        </button>
    );
}
