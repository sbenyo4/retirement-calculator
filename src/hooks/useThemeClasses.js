import { useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Custom hook for theme-aware CSS classes
 * Consolidates theme-dependent styling logic in one place
 * 
 * @returns {Object} Theme-aware class names and utilities
 */
export const useThemeClasses = () => {
    const { theme } = useTheme();
    const isLight = theme === 'light';

    return useMemo(() => ({
        // Container classes
        container: isLight
            ? "bg-white border border-gray-200 shadow-sm"
            : "bg-white/5 border border-white/10",

        // Text classes
        label: isLight ? "text-gray-600" : "text-gray-400",
        headerLabel: isLight ? "text-gray-900" : "text-white",
        text: isLight ? "text-gray-900" : "text-white", // Main text color
        secondaryText: isLight ? "text-gray-500" : "text-gray-500",

        // Input classes
        input: isLight
            ? "bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            : "bg-black/20 border border-white/50 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500",

        // Select classes
        select: isLight
            ? "bg-white text-gray-900"
            : "bg-black/20 border border-white/30 text-white",

        option: isLight ? "bg-white text-gray-900" : "bg-gray-800 text-white",

        // Icon classes
        icon: isLight ? "text-gray-500" : "text-gray-400",

        // Button classes
        button: isLight
            ? "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"
            : "bg-white/10 text-white hover:bg-white/20 border border-white/20",

        buttonPrimary: isLight
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-blue-600 text-white hover:bg-blue-500",

        buttonSecondary: isLight
            ? "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm"
            : "bg-white/10 text-white hover:bg-white/20 border border-white/20 shadow-sm",

        // Card classes
        card: isLight
            ? "bg-white border border-gray-200 shadow"
            : "bg-white/5 border border-white/10",

        cardHover: isLight
            ? "bg-white border border-gray-200 shadow hover:shadow-md hover:border-gray-300"
            : "bg-white/5 border border-white/10 hover:bg-white/10",

        // Divider classes
        divider: isLight ? "border-gray-200" : "border-white/10",

        // Border classes
        border: isLight ? "border-gray-200" : "border-white/10",

        // State flag
        isLight,
        isDark: !isLight
    }), [isLight]);
};

export default useThemeClasses;
