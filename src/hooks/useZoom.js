import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserSettings, setUserSettings } from '../utils/db';

export function useZoom() {
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;
    const [zoomLevel, setZoomLevel] = useState(100);
    const isInitialLoad = useRef(true);

    // Load zoom level from Firestore
    useEffect(() => {
        if (!uid) return;
        isInitialLoad.current = true;

        getUserSettings(uid).then(settings => {
            if (settings?.zoomLevel) {
                setZoomLevel(settings.zoomLevel);
            }
            setTimeout(() => { isInitialLoad.current = false; }, 100);
        }).catch(err => {
            console.error('Error loading zoom level:', err);
            isInitialLoad.current = false;
        });
    }, [uid]);

    useEffect(() => {
        // Apply zoom to root element
        document.documentElement.style.fontSize = `${zoomLevel}%`;

        // Save to Firestore
        if (uid && !isInitialLoad.current) {
            setUserSettings(uid, { zoomLevel }).catch(err => {
                console.error('Error saving zoom level:', err);
            });
        }
    }, [zoomLevel, uid]);

    const toggleZoom = () => {
        setZoomLevel(prev => prev === 100 ? 90 : 100);
    };

    return { zoomLevel, toggleZoom, setZoomLevel };
}
