import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const COMMANDS = [
    // ── Calculation modes ──────────────────────────────────────────────────────
    { id: 'mode:mathematical',        en: 'Mathematical Mode',       he: 'מצב מתמטי',               kw: 'mathematical מתמטי חישוב results תוצאות' },
    { id: 'mode:planning',            en: 'Checklist / Planning',    he: 'צ׳קליסט / תכנון',         kw: 'checklist צקליסט planning תכנון tasks משימות' },
    { id: 'mode:ai',                  en: 'AI Analysis Mode',        he: 'מצב ניתוח AI',             kw: 'ai mode מצב בינה מלאכותית analysis ניתוח' },
    { id: 'mode:simulations',         en: 'Monte Carlo Simulations', he: 'סימולציות מונטה קרלו',     kw: 'simulations סימולציות monte carlo probability הסתברות' },
    { id: 'mode:compare',             en: 'Compare Profiles',        he: 'השוואת פרופילים',          kw: 'compare השוואה profiles פרופילים' },
    // ── Results tabs ───────────────────────────────────────────────────────────
    { id: 'tab:results',              en: 'Numerical Results',       he: 'תוצאות מספריות',           kw: 'results תוצאות מספרים numerical dashboard' },
    { id: 'tab:insights',             en: 'AI Insights',             he: 'תובנות AI',                kw: 'ai insights תובנות ניתוח בינה מלאכותית score readiness' },
    { id: 'tab:budget',               en: 'Budget Planner',          he: 'תכנון תקציב',              kw: 'budget תקציב הוצאות expenses planner' },
    // ── Input-side modals ──────────────────────────────────────────────────────
    { id: 'open:lifeEvents',          en: 'Life Events',             he: 'אירועי חיים',               kw: 'life events אירועי חיים timeline ציר זמן' },
    { id: 'open:additionalIncome',    en: 'Additional Income',       he: 'הכנסה נוספת',              kw: 'additional income הכנסה נוספת extra עבודה' },
    { id: 'open:scenario',            en: 'Market Scenario',         he: 'תרחיש שוק',                kw: 'scenario שוק crash market תרחיש קריסה' },
    { id: 'open:variableRates',       en: 'Variable Return Rates',   he: 'שיעורי תשואה משתנים',     kw: 'variable rates תשואה שיעורים returns' },
    // ── Results-side modals ────────────────────────────────────────────────────
    { id: 'open:pension',             en: 'Pension Income',          he: 'הכנסת פנסיה',              kw: 'pension פנסיה income הכנסה annuity ביטוח' },
    { id: 'open:amortization',        en: 'Year-by-Year Breakdown',  he: 'פירוט שנה אחר שנה',        kw: 'amortization פירוט שנה לוח year breakdown table' },
    { id: 'open:inflationCheck',      en: 'Inflation Reality Check', he: 'בדיקת אינפלציה',           kw: 'inflation אינפלציה reality check בדיקה' },
    { id: 'open:sensitivityRange',    en: 'Sensitivity Range Chart', he: 'ניתוח טווח',               kw: 'sensitivity range טווח ניתוח chart גרף' },
    { id: 'open:heatmap',             en: 'Sensitivity Heatmap',     he: 'מפת חום רגישות',           kw: 'heatmap מפת חום sensitivity range טווח' },
    { id: 'open:sensitivity:interest',en: 'Interest Sensitivity',    he: 'ניתוח ריבית',              kw: 'sensitivity ריבית interest range analysis ניתוח' },
    { id: 'open:sensitivity:income',  en: 'Income Sensitivity',      he: 'ניתוח הכנסה',              kw: 'sensitivity הכנסה income range analysis' },
    { id: 'open:sensitivity:age',     en: 'Age Sensitivity',         he: 'ניתוח גיל',                kw: 'sensitivity גיל age range analysis' },
    // ── Budget ─────────────────────────────────────────────────────────────────
    { id: 'open:budgetAI',            en: 'Budget AI Insights',      he: 'תובנות AI לתקציב',         kw: 'budget תקציב ai insights תובנות בינה מלאכותית' },
    { id: 'open:budgetStats',         en: 'Budget Statistics',       he: 'סטטיסטיקת תקציב',          kw: 'budget תקציב stats סטטיסטיקה charts גרפים' },
    // ── Checklist ──────────────────────────────────────────────────────────────
    { id: 'open:checklistOverview',   en: 'Checklist Overview',      he: 'סיכום צ׳קליסט',            kw: 'checklist צקליסט overview סיכום summary' },
    // ── App-level ──────────────────────────────────────────────────────────────
    { id: 'open:chat',                en: 'AI Chat Assistant',       he: 'עוזר צ׳אט AI',             kw: 'chat צאט assistant עוזר ai שאלות' },
    { id: 'open:models',              en: 'Settings / AI Models',    he: 'הגדרות / מודלי AI',         kw: 'settings הגדרות models מודלים ai manager claude gpt' },
];

export default function CommandPalette({ language }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isHe = language === 'he';
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            // Ctrl+/ or Ctrl+Q (Israeli keyboard layout maps Q to /)
            const isSlash = e.key === '/' || e.key === 'Divide' || e.key === 'q' || e.key === 'Q';
            if ((e.ctrlKey || e.metaKey) && isSlash && !e.shiftKey && !e.altKey) {
                // Don't trigger if typing in an input/textarea
                const tag = document.activeElement?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
                e.preventDefault();
                setOpen(o => !o);
                setQuery('');
                setSelected(0);
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, []);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 0);
    }, [open]);

    const filtered = COMMANDS.filter(cmd => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (cmd.he + ' ' + cmd.en + ' ' + cmd.kw).toLowerCase().includes(q);
    });

    const execute = useCallback((cmd) => {
        window.dispatchEvent(new CustomEvent('app:command', { detail: cmd.id }));
        setOpen(false);
        setQuery('');
    }, []);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (e.key === 'Escape') { setOpen(false); return; }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelected(s => {
                    const next = (s + 1) % filtered.length;
                    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
                    return next;
                });
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelected(s => {
                    const next = (s - 1 + filtered.length) % filtered.length;
                    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
                    return next;
                });
            }
            if (e.key === 'Enter' && filtered[selected]) execute(filtered[selected]);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, filtered, selected, execute]);

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 flex items-start justify-center pt-[18vh] bg-black/50 backdrop-blur-sm"
            style={{ zIndex: 60000 }}
            onClick={() => setOpen(false)}
        >
            <div
                className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${isLight ? 'bg-white' : 'bg-gray-900 border border-white/10'}`}
                dir={isHe ? 'rtl' : 'ltr'}
                onClick={e => e.stopPropagation()}
            >
                {/* Search bar */}
                <div className={`flex items-center gap-3 px-4 py-3 border-b ${isLight ? 'border-gray-100' : 'border-white/10'}`}>
                    <Search size={16} className={isLight ? 'text-gray-400' : 'text-gray-500'} />
                    <input
                        ref={inputRef}
                        type="text"
                        className={`flex-1 bg-transparent text-sm outline-none ${isLight ? 'text-gray-900 placeholder:text-gray-400' : 'text-white placeholder:text-gray-500'}`}
                        placeholder={isHe ? 'חפש פונקציה...' : 'Search features...'}
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelected(0); }}
                    />
                    {query && (
                        <button onClick={() => { setQuery(''); setSelected(0); inputRef.current?.focus(); }}>
                            <X size={14} className="text-gray-400" />
                        </button>
                    )}
                    <kbd className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isLight ? 'bg-gray-100 text-gray-400' : 'bg-white/10 text-gray-500'}`}>esc</kbd>
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-72 overflow-y-auto custom-scrollbar py-1">
                    {filtered.length === 0 ? (
                        <div className={`px-4 py-8 text-center text-sm ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                            {isHe ? 'אין תוצאות' : 'No results'}
                        </div>
                    ) : filtered.map((cmd, i) => (
                        <button
                            key={cmd.id}
                            className={`w-full text-start px-4 py-2.5 text-sm transition-colors ${
                                i === selected
                                    ? (isLight ? 'bg-blue-50 text-blue-700' : 'bg-blue-500/15 text-blue-400')
                                    : (isLight ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 hover:bg-white/5')
                            }`}
                            onClick={() => execute(cmd)}
                            onMouseEnter={() => setSelected(i)}
                        >
                            {isHe ? cmd.he : cmd.en}
                        </button>
                    ))}
                </div>

                {/* Footer hints */}
                <div className={`px-4 py-2 border-t flex items-center gap-4 ${isLight ? 'border-gray-100 text-gray-400' : 'border-white/10 text-gray-500'}`}>
                    <span className="text-[10px]">↑↓ {isHe ? 'ניווט' : 'navigate'}</span>
                    <span className="text-[10px]">↵ {isHe ? 'בחר' : 'select'}</span>
                    <span className="text-[10px]">esc {isHe ? 'סגור' : 'close'}</span>
                    <span className={`text-[10px] ${isHe ? 'mr-auto' : 'ml-auto'}`}>ctrl+/</span>
                </div>
            </div>
        </div>,
        document.body
    );
}
