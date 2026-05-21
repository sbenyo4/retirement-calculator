function renderInline(text, isLight) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
            return <strong key={i} className={isLight ? 'text-slate-900 font-semibold' : 'text-white font-semibold'}>{p.slice(2, -2)}</strong>;
        }
        return p;
    });
}

export function InsightRenderer({ text, isLight }) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) { i++; continue; }

        const isHeading = /^#{1,3}\s/.test(trimmed)
            || (/^[^•\-*]/.test(trimmed) && trimmed.endsWith(':') && trimmed.length < 60);
        if (isHeading) {
            const headText = trimmed.replace(/^#{1,3}\s*/, '').replace(/:$/, '');
            elements.push(
                <div key={i} className={`flex items-center gap-2 mt-4 mb-1.5 first:mt-0 pb-1 border-b ${isLight ? 'border-slate-100' : 'border-white/10'}`}>
                    <span className="w-1 h-4 rounded-full bg-purple-400 shrink-0" />
                    <span className={`text-xs font-bold uppercase tracking-wide ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                        {renderInline(headText, isLight)}
                    </span>
                </div>
            );
            i++; continue;
        }

        if (/^[-•*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
            const bulletText = trimmed.replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, '');
            elements.push(
                <div key={i} className="flex gap-2 items-start py-0.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                    <span className={`text-sm leading-relaxed ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                        {renderInline(bulletText, isLight)}
                    </span>
                </div>
            );
            i++; continue;
        }

        elements.push(
            <p key={i} className={`text-sm leading-relaxed mt-2 first:mt-0 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                {renderInline(trimmed, isLight)}
            </p>
        );
        i++;
    }
    return <div className="space-y-0.5">{elements}</div>;
}
