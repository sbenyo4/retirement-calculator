function renderInline(text, isLight) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
            return <strong key={i} className={isLight ? 'text-slate-900 font-semibold' : 'text-white font-semibold'}>{p.slice(2, -2)}</strong>;
        }
        return p;
    });
}

const SECTION_COLORS = [
    { border: 'border-l-purple-500', dot: 'bg-purple-400' },
    { border: 'border-l-blue-500',   dot: 'bg-blue-400' },
    { border: 'border-l-green-500',  dot: 'bg-green-400' },
    { border: 'border-l-amber-500',  dot: 'bg-amber-400' },
    { border: 'border-l-rose-500',   dot: 'bg-rose-400' },
    { border: 'border-l-cyan-500',   dot: 'bg-cyan-400' },
];

export function InsightRenderer({ text, isLight }) {
    if (!text) return null;

    const lines = text.split('\n');
    const sections = [];
    let current = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const isHeading = /^#{1,3}\s/.test(trimmed)
            || (/^[^•\-*\d]/.test(trimmed) && trimmed.endsWith(':') && trimmed.length < 60);

        if (isHeading) {
            if (current) sections.push(current);
            current = {
                heading: trimmed.replace(/^#{1,3}\s*/, '').replace(/:$/, ''),
                lines: [],
            };
        } else if (current) {
            current.lines.push(trimmed);
        } else {
            if (!sections.length) sections.push({ heading: null, lines: [] });
            sections[sections.length - 1].lines.push(trimmed);
        }
    }
    if (current) sections.push(current);

    const cardBase = isLight
        ? 'bg-white border border-slate-200 shadow-sm'
        : 'bg-white/5 border border-white/10';

    return (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {sections.map((section, si) => {
                const { border, dot } = SECTION_COLORS[si % SECTION_COLORS.length];
                return (
                    <div key={si} className={`${cardBase} rounded-xl p-4 border-l-4 ${border}`}>
                        {section.heading && (
                            <h3 className={`font-semibold text-sm mb-2.5 ${isLight ? 'text-slate-800' : 'text-gray-200'}`}>
                                {renderInline(section.heading, isLight)}
                            </h3>
                        )}
                        <div className="space-y-1.5">
                            {section.lines.map((line, li) => {
                                const isBullet = /^[-•*]\s/.test(line) || /^\d+\.\s/.test(line);
                                if (isBullet) {
                                    const bulletText = line.replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, '');
                                    return (
                                        <div key={li} className="flex gap-2 items-start">
                                            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                                            <span className={`text-sm leading-relaxed ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                                {renderInline(bulletText, isLight)}
                                            </span>
                                        </div>
                                    );
                                }
                                return (
                                    <p key={li} className={`text-sm leading-relaxed ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                        {renderInline(line, isLight)}
                                    </p>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
