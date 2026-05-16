import { useState, useEffect, useRef, useCallback } from 'react';

let topZ = 10000;

/**
 * Makes a modal draggable from its header.
 *
 * Usage:
 *   const { dragStyle, overlayStyle, onDragMouseDown, bringToFront } = useDraggable(isOpen);
 *   // Apply overlayStyle to the fixed overlay (provides z-index)
 *   // Apply dragStyle to the modal container (provides transform)
 *   // Apply onDragMouseDown + cursor-grab class to the header div
 *   // Call bringToFront() on overlay mousedown to promote this window
 *
 * Position resets to center whenever isOpen changes to true.
 */
export function useDraggable(isOpen, options = {}) {
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [zIndex, setZIndex] = useState(topZ);
    const posRef    = useRef({ x: 0, y: 0 });
    const dragging  = useRef(false);
    const origin    = useRef({ x: 0, y: 0 });
    const boundsRef = useRef(null);

    // Reset to center and claim top z-index every time the modal opens
    useEffect(() => {
        if (isOpen) {
            const zero = { x: 0, y: 0 };
            setPos(zero);
            posRef.current = zero;
            topZ += 1;
            setZIndex(topZ);
        }
    }, [isOpen]);

    const clampPos = useCallback((p) => {
        if (!options.constrainToViewport || !boundsRef.current) return p;
        const { width, height } = boundsRef.current;
        const margin = options.viewportMargin ?? 12;
        const maxX = Math.max(0, (window.innerWidth - width) / 2 - margin);
        const maxY = Math.max(0, (window.innerHeight - height) / 2 - margin);
        return {
            x: Math.min(maxX, Math.max(-maxX, p.x)),
            y: Math.min(maxY, Math.max(-maxY, p.y)),
        };
    }, [options.constrainToViewport, options.viewportMargin]);

    // Attach mousemove / mouseup to document once — never recreated
    useEffect(() => {
        let rafId = null;
        const onMove = (e) => {
            if (!dragging.current) return;
            const p = {
                x: e.clientX - origin.current.x,
                y: e.clientY - origin.current.y,
            };
            posRef.current = clampPos(p);
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                setPos({ ...posRef.current });
            });
        };
        const onUp = () => {
            dragging.current = false;
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [clampPos]);

    const bringToFront = useCallback(() => {
        topZ += 1;
        setZIndex(topZ);
    }, []);

    const onDragMouseDown = useCallback((e) => {
        // Don't hijack clicks on interactive elements inside the header
        if (e.target.closest(
            'button, input, select, textarea, a, label, [role="switch"], [role="slider"]'
        )) return;
        e.preventDefault();
        bringToFront();
        const modal = e.currentTarget.closest('[data-draggable-modal]');
        if (modal) {
            const rect = modal.getBoundingClientRect();
            boundsRef.current = { width: rect.width, height: rect.height };
        }
        dragging.current = true;
        origin.current = {
            x: e.clientX - posRef.current.x,
            y: e.clientY - posRef.current.y,
        };
    }, [bringToFront]);

    return {
        dragStyle:    { transform: `translate(${pos.x}px, ${pos.y}px)` },
        overlayStyle: { zIndex },
        bringToFront,
        onDragMouseDown,
    };
}
