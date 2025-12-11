import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { ChevronDown } from 'lucide-react';

export function CustomSelect({ value, onChange, options, className = "", disabled = false, placeholder }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => opt.value === value);

    // Theme styles
    // Dark mode: using bg-black/20 and border-white/50 to match standard inputs exactly as requested
    const bgColor = isLight ? 'bg-white' : 'bg-black/20';
    const borderColor = isLight ? 'border-slate-400' : 'border-white/50';
    const textColor = isLight ? 'text-gray-900' : 'text-white';

    // Dropdown List styles
    // User requested "Thin frame around options"
    // Using absolute positioning, z-50, and specific border
    const dropdownBg = isLight ? 'bg-white' : 'bg-slate-800';
    const dropdownBorder = isLight ? 'border border-slate-400' : 'border border-white/30';
    const hoverColor = isLight ? 'hover:bg-blue-50' : 'hover:bg-white/10';
    const selectedItemBg = isLight ? 'bg-blue-100' : 'bg-blue-900/40';

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {/* TRIGGER BUTTON */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-all
                    ${bgColor} ${textColor} border ${borderColor}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400'}
                    focus:outline-none focus:ring-2 focus:ring-blue-500/50
                `}
            >
                <span className="truncate">
                    {selectedOption ? selectedOption.label : (placeholder || "")}
                </span>
                <ChevronDown size={14} className={`opacity-70 flex-shrink-0 ml-1 ${isLight ? 'text-gray-500' : 'text-gray-400'}`} />
            </button>

            {/* DROPDOWN LIST */}
            {isOpen && (
                <div className={`absolute top-full left-0 right-0 mt-1 z-50 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto
                    ${dropdownBg} ${dropdownBorder} text-xs animate-in fade-in zoom-in-95 duration-100
                `}>
                    <div className="py-1">
                        {options.map((option) => (
                            <div
                                key={option.value}
                                onClick={() => {
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={`px-3 py-2 cursor-pointer truncate transition-colors
                                    ${textColor} ${hoverColor}
                                    ${option.value === value ? selectedItemBg : ''}
                                `}
                            >
                                {option.label}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
