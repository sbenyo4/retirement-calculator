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
export function useDraggable(isOpen) {
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [zIndex, setZIndex] = useState(topZ);
    const posRef    = useRef({ x: 0, y: 0 });
    const dragging  = useRef(false);
    const origin    = useRef({ x: 0, y: 0 });

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

    // Attach mousemove / mouseup to document once — never recreated
    useEffect(() => {
        let rafId = null;
        const onMove = (e) => {
            if (!dragging.current) return;
            const p = {
                x: e.clientX - origin.current.x,
                y: e.clientY - origin.current.y,
            };
            posRef.current = p;
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
    }, []);

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
