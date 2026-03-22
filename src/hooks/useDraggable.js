import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Makes a modal draggable from its header.
 *
 * Usage:
 *   const { dragStyle, onDragMouseDown } = useDraggable(isOpen);
 *   // Apply dragStyle to the modal container (the box)
 *   // Apply onDragMouseDown + cursor-grab class to the header div
 *
 * Position resets to center whenever isOpen changes to true.
 */
export function useDraggable(isOpen) {
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const posRef    = useRef({ x: 0, y: 0 });
    const dragging  = useRef(false);
    const origin    = useRef({ x: 0, y: 0 });

    // Reset to center every time the modal opens
    useEffect(() => {
        if (isOpen) {
            const zero = { x: 0, y: 0 };
            setPos(zero);
            posRef.current = zero;
        }
    }, [isOpen]);

    // Attach mousemove / mouseup to document once — never recreated
    useEffect(() => {
        const onMove = (e) => {
            if (!dragging.current) return;
            const p = {
                x: e.clientX - origin.current.x,
                y: e.clientY - origin.current.y,
            };
            posRef.current = p;
            setPos({ ...p });
        };
        const onUp = () => { dragging.current = false; };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
        };
    }, []);

    const onDragMouseDown = useCallback((e) => {
        // Don't hijack clicks on interactive elements inside the header
        if (e.target.closest(
            'button, input, select, textarea, a, label, [role="switch"], [role="slider"]'
        )) return;
        e.preventDefault();
        dragging.current = true;
        origin.current = {
            x: e.clientX - posRef.current.x,
            y: e.clientY - posRef.current.y,
        };
    }, []);

    return {
        dragStyle:      { transform: `translate(${pos.x}px, ${pos.y}px)` },
        onDragMouseDown,
    };
}
