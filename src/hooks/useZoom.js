import { useState, useEffect } from 'react';

export function useZoom() {
    // Read from localStorage or default to 100
    const [zoomLevel, setZoomLevel] = useState(() => {
        const saved = localStorage.getItem('app_zoom_level');
        return saved ? parseInt(saved, 10) : 100;
    });

    useEffect(() => {
        // Apply zoom to root element
        // We use font-size percentage on html to scale rem units
        document.documentElement.style.fontSize = `${zoomLevel}%`;

        // Save to localStorage
        localStorage.setItem('app_zoom_level', zoomLevel.toString());
    }, [zoomLevel]);

    const toggleZoom = () => {
        setZoomLevel(prev => prev === 100 ? 90 : 100);
    };

    return { zoomLevel, toggleZoom, setZoomLevel };
}
