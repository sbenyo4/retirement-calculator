import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, RotateCcw, Mic, AlertCircle, WifiOff, KeyRound, CreditCard, FileX } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useDraggable } from '../hooks/useDraggable';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { getChatResponse, buildChatSystemPrompt } from '../utils/ai-chat';

const STORAGE_KEY = 'chatButtonPos';

const SUGGESTIONS = {
    he: [
        'האם אני בדרך הנכונה לפרישה?',
        'מתי הכסף שלי ייגמר?',
        'כמה צריך לחסוך בחודש?',
        'מה ההשפעה של פרישה שנה מוקדם?',
        'מה ההפרש בין פרישה בגיל 60 ל-67?',
        'איך הביטוח לאומי משפיע עליי?',
        'מה הגרוע מקרה שלי?',
        'האם ריבית שנתית גבוהה יותר משנה הרבה?',
    ],
    en: [
        'Am I on track for retirement?',
        'When will my money run out?',
        'How much should I save monthly?',
        'What if I retire 1 year earlier?',
        'How does my pension affect the plan?',
        "What's my worst case scenario?",
        'How sensitive is my plan to returns?',
        'Should I increase my contributions?',
    ],
};

const DEFAULT_BTN_POS = { bottom: 24, right: 24 };
const BTN_SIZE = 56;

function clampPos(pos) {
    const maxRight = Math.max(8, window.innerWidth - BTN_SIZE - 8);
    const maxBottom = Math.max(8, window.innerHeight - BTN_SIZE - 8);
    return {
        right: Math.max(8, Math.min(maxRight, pos.right ?? 24)),
        bottom: Math.max(8, Math.min(maxBottom, pos.bottom ?? 24)),
    };
}

function loadBtnPos() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? clampPos(JSON.parse(saved)) : null;
    } catch { return null; }
}

export function ChatWidget({ inputs, results, language, aiProvider, aiModel, apiKeyOverride }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isHe = language === 'he';

    const [open, setOpen] = useState(false);
    useBodyScrollLock(open);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Button drag state
    const [btnPos, setBtnPos] = useState(() => loadBtnPos() || DEFAULT_BTN_POS);
    const btnDragging = useRef(false);
    const btnOrigin = useRef({ x: 0, y: 0 });

    // Re-clamp button position on mount and on resize
    useEffect(() => {
        setBtnPos(prev => clampPos(prev));
        const onResize = () => setBtnPos(prev => clampPos(prev));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    const btnMoved = useRef(false);
    const btnRef = useRef(null);

    // Panel drag
    const { dragStyle: panelDragStyle, onDragMouseDown: onPanelDragMouseDown } = useDraggable(open);

    const [listening, setListening] = useState(false);
    const [hasSpeech, setHasSpeech] = useState(false);
    const recognitionRef = useRef(null);
    const listeningRef = useRef(false); // stable ref for callbacks
    const voiceTranscriptRef = useRef('');
    const interimRef = useRef('');

    useEffect(() => {
        setHasSpeech(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
    }, []);

    const startRecognition = useCallback(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.lang = isHe ? 'he-IL' : 'en-US';
        recognition.interimResults = true;
        recognition.continuous = false; // restart manually — more reliable cross-browser
        recognition.maxAlternatives = 1;
        recognitionRef.current = recognition;

        recognition.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) {
                    voiceTranscriptRef.current += (voiceTranscriptRef.current ? ' ' : '') + t.trim();
                    interim = '';
                } else {
                    interim += t;
                }
            }
            interimRef.current = interim;
            // Show combined final + interim in textarea
            setInput(voiceTranscriptRef.current + (interim ? ' ' + interim : ''));
        };

        recognition.onend = () => {
            interimRef.current = '';
            // Auto-restart if still in listening mode (browser stopped due to silence)
            if (listeningRef.current) {
                try { recognition.start(); } catch { /* already started */ }
            }
        };

        recognition.onerror = (e) => {
            // no-speech and audio-capture are recoverable — just restart
            if (e.error === 'no-speech' || e.error === 'audio-capture') return;
            // network / not-allowed / aborted — stop
            listeningRef.current = false;
            setListening(false);
        };

        try { recognition.start(); } catch { /* already running */ }
    }, [isHe, setInput]);

    const toggleVoice = useCallback(() => {
        if (!hasSpeech) return;

        if (listening) {
            // Stop: keep whatever was transcribed so far
            listeningRef.current = false;
            recognitionRef.current?.stop();
            recognitionRef.current = null;
            setListening(false);
            interimRef.current = '';
            // Show only the final transcript (remove interim)
            setInput(voiceTranscriptRef.current);
            return;
        }

        voiceTranscriptRef.current = '';
        interimRef.current = '';
        listeningRef.current = true;
        setListening(true);
        startRecognition();
    }, [listening, hasSpeech, startRecognition, setInput]);

    const abortRef = useRef(null);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);
    const sendMessageRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 100);
    }, [open]);

    // Button drag handlers
    const onBtnMouseDown = useCallback((e) => {
        if (e.button !== 0) return;
        btnDragging.current = true;
        btnMoved.current = false;
        btnOrigin.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
    }, []);

    useEffect(() => {
        const onMove = (e) => {
            if (!btnDragging.current) return;
            const dx = e.clientX - btnOrigin.current.x;
            const dy = e.clientY - btnOrigin.current.y;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) btnMoved.current = true;
            if (!btnMoved.current) return;

            setBtnPos(prev => {
                const btnW = 56, btnH = 56;
                const newRight = Math.max(8, Math.min(window.innerWidth - btnW - 8, (prev.right || 24) - dx));
                const newBottom = Math.max(8, Math.min(window.innerHeight - btnH - 8, (prev.bottom || 24) - dy));
                btnOrigin.current = { x: e.clientX, y: e.clientY };
                const next = { right: newRight, bottom: newBottom };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                return next;
            });
        };
        const onUp = () => {
            if (btnDragging.current && !btnMoved.current) {
                setOpen(v => !v);
            }
            btnDragging.current = false;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, []);

    const sendMessage = useCallback(async (text) => {
        const trimmed = (text ?? input).trim();
        if (!trimmed || loading) return;
        setInput('');
        setError(null);
        // Keep last 10 messages to avoid token limit errors
        const history = messages.slice(-10);
        const newMessages = [...history, { role: 'user', content: trimmed }];
        setMessages(prev => [...prev.slice(-10), { role: 'user', content: trimmed }]);
        setLoading(true);
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const systemPrompt = buildChatSystemPrompt(inputs, results, language);
            const reply = await getChatResponse(newMessages, systemPrompt, aiProvider, aiModel, apiKeyOverride, { signal: controller.signal });
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[Chat error]', err, err?.status, err?.error);
                const msg = (err?.message || '').toLowerCase();
                const status = err?.status;
                const isBalance  = msg.includes('balance') || msg.includes('credit') || msg.includes('billing');
                const isQuota    = !isBalance && (msg.includes('quota') || msg.includes('rate limit') || status === 429 || msg.includes('429'));
                const isAuth     = msg.includes('401') || msg.includes('api key') || msg.includes('authentication') || status === 401;
                const isContext  = msg.includes('too long') || msg.includes('context_length') || msg.includes('prompt is too long') || status === 413;
                const isNetwork  = msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch');
                const errType = isBalance ? 'balance' : isQuota ? 'quota' : isAuth ? 'auth' : isContext ? 'context' : isNetwork ? 'network' : 'unknown';
                setError({ type: errType, raw: err?.message || '' });
            }
        } finally {
            setLoading(false);
        }
    }, [input, messages, loading, inputs, results, language, aiProvider, aiModel, apiKeyOverride, isHe]);

    sendMessageRef.current = sendMessage;

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };

    const clearChat = () => {
        abortRef.current?.abort();
        setMessages([]); setError(null); setLoading(false);
    };

    if (!aiProvider) return null;

    const suggestions = SUGGESTIONS[language] || SUGGESTIONS.en;

    // Panel anchors near button
    // Compute panel position so it always stays inside the viewport
    const PANEL_W = 360;
    const PANEL_MIN_H = 300;
    const BTN_W = 56, BTN_H = 56, GAP = 8;
    const vw = window.innerWidth, vh = window.innerHeight;

    // Button top-left in viewport coords
    const btnX = vw - (btnPos.right || 24) - BTN_W;
    const btnY = vh - (btnPos.bottom || 24) - BTN_H;

    // Horizontal: align right edges, clamp inside viewport
    const panelLeft = Math.max(GAP, Math.min(btnX + BTN_W - PANEL_W, vw - PANEL_W - GAP));

    // Vertical: open above if enough room, otherwise below
    const spaceAbove = btnY - GAP;
    const spaceBelow = vh - (btnY + BTN_H) - GAP;
    const openAbove = spaceAbove >= PANEL_MIN_H || spaceAbove >= spaceBelow;
    const panelMaxH = Math.max(PANEL_MIN_H, openAbove ? spaceAbove - GAP : spaceBelow - GAP);

    const panelStyle = {
        position: 'fixed',
        left: panelLeft,
        ...(openAbove
            ? { bottom: vh - btnY + GAP }
            : { top: btnY + BTN_H + GAP }),
        width: PANEL_W,
        maxHeight: panelMaxH,
        zIndex: 150,
        ...panelDragStyle,
    };

    return (
        <>
            {/* Chat Panel */}
            {open && (
                <div
                    className={`flex flex-col rounded-2xl shadow-2xl overflow-hidden relative ${
                        isLight ? 'bg-white border border-gray-200 text-gray-900' : 'border border-white/30 text-white'
                    }`}
                    style={panelStyle}
                    dir={isHe ? 'rtl' : 'ltr'}
                >
                    {!isLight && <>
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-blue-900 rounded-2xl" />
                        <div className="absolute inset-0 bg-white/10 rounded-2xl" />
                    </>}

                    {/* Header — draggable */}
                    <div
                        className={`relative z-10 flex items-center justify-between px-4 py-3 border-b flex-shrink-0 cursor-grab active:cursor-grabbing ${
                            isLight ? 'bg-gray-50 border-gray-200' : 'border-white/20'
                        }`}
                        onMouseDown={onPanelDragMouseDown}
                    >
                        <div className="flex items-center gap-2">
                            <MessageCircle size={15} className="text-blue-400" />
                            <span className={`text-sm font-semibold ${isLight ? 'text-gray-800' : 'text-white'}`}>
                                {isHe ? 'שאל את היועץ' : 'Ask your advisor'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            {aiModel && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${isLight ? 'text-gray-500 bg-gray-100' : 'text-gray-300 bg-white/10'}`}>
                                    {aiModel}
                                </span>
                            )}
                            {messages.length > 0 && (
                                <button onClick={clearChat} title={isHe ? 'נקה שיחה' : 'Clear chat'}
                                    className={`p-1.5 rounded-lg transition-colors ${isLight ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:text-gray-200 hover:bg-white/10'}`}>
                                    <RotateCcw size={13} />
                                </button>
                            )}
                            <button onClick={() => setOpen(false)}
                                className={`p-1.5 rounded-lg transition-colors ${isLight ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:text-gray-200 hover:bg-white/10'}`}>
                                <X size={15} />
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-4 min-h-0" dir="ltr">
                        <div dir={isHe ? 'rtl' : 'ltr'} className="space-y-1">

                            {messages.length === 0 && (
                                <div className="space-y-3 pb-2">
                                    <p className={`text-xs text-center pb-1 ${isLight ? 'text-gray-400' : 'text-gray-400'}`}>
                                        {isHe ? 'שאל שאלה חופשית או בחר מהרשימה' : 'Ask freely or pick a suggestion'}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {suggestions.map((s, i) => (
                                            <button key={i} onClick={() => sendMessage(s)}
                                                className={`text-xs px-2.5 py-1.5 rounded-lg border text-start transition-colors ${
                                                    isLight
                                                        ? 'border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100'
                                                        : 'border-white/20 text-gray-300 bg-black/20 hover:bg-white/10'
                                                }`}>
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <div key={i} className={`flex mb-2 ${msg.role === 'user' ? (isHe ? 'justify-start' : 'justify-end') : (isHe ? 'justify-end' : 'justify-start')}`}>
                                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                                        msg.role === 'user'
                                            ? 'bg-blue-600 text-white'
                                            : isLight ? 'bg-gray-100 text-gray-800' : 'bg-black/30 text-gray-100'
                                    }`}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}

                            {loading && (
                                <div className={`flex mb-2 ${isHe ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`px-4 py-3 rounded-2xl ${isLight ? 'bg-gray-100' : 'bg-black/30'}`}>
                                        <div className="flex gap-1 items-center">
                                            {[0, 150, 300].map(d => (
                                                <span key={d} className={`w-1.5 h-1.5 rounded-full animate-bounce ${isLight ? 'bg-gray-400' : 'bg-gray-400'}`}
                                                    style={{ animationDelay: `${d}ms` }} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {error && (() => {
                                const cfg = {
                                    balance: { Icon: CreditCard,   color: 'amber',  title: isHe ? 'אין קרדיט API'       : 'Insufficient API Credits',  body: isHe ? 'יש להוסיף קרדיט לחשבון ספק ה-AI'            : 'Add credits to your AI provider account' },
                                    quota:   { Icon: WifiOff,      color: 'orange', title: isHe ? 'חריגה ממכסת API'     : 'API Quota Exceeded',         body: isHe ? 'הגעת למגבלת הבקשות — נסה שוב בעוד כמה דקות' : 'Rate limit reached — try again in a few minutes' },
                                    auth:    { Icon: KeyRound,     color: 'red',    title: isHe ? 'מפתח API שגוי'       : 'Invalid API Key',            body: isHe ? 'בדוק את מפתח ה-API בהגדרות'                  : 'Check your API key in Settings' },
                                    context: { Icon: FileX,        color: 'purple', title: isHe ? 'ההודעה ארוכה מדי'    : 'Message Too Long',           body: isHe ? 'נסה לנקות את הצ\'אט ולשאול מחדש'             : "Try clearing the chat and asking again" },
                                    network: { Icon: WifiOff,      color: 'red',    title: isHe ? 'שגיאת תקשורת'        : 'Network Error',              body: isHe ? 'בדוק את החיבור לאינטרנט'                     : 'Check your internet connection' },
                                    unknown: { Icon: AlertCircle,  color: 'red',    title: isHe ? 'שגיאה'               : 'Error',                      body: error.raw },
                                }[error.type] || { Icon: AlertCircle, color: 'red', title: 'Error', body: error.raw };
                                const c = cfg.color;
                                return (
                                    <div className={`mx-1 mb-1 rounded-lg border px-3 py-2 flex items-start gap-2 bg-${c}-500/10 border-${c}-500/30`}>
                                        <cfg.Icon size={14} className={`mt-0.5 shrink-0 text-${c}-400`} />
                                        <div className="min-w-0">
                                            <p className={`text-xs font-semibold text-${c}-300`}>{cfg.title}</p>
                                            <p className={`text-[11px] text-${c}-400 mt-0.5 break-words`}>{cfg.body}</p>
                                        </div>
                                        <button onClick={() => setError(null)} className={`shrink-0 text-${c}-500 hover:text-${c}-300 mt-0.5`}><X size={12} /></button>
                                    </div>
                                );
                            })()}

                            <div ref={bottomRef} />
                        </div>
                    </div>

                    {/* Input */}
                    <div className={`relative z-10 flex-shrink-0 px-3 pt-2 pb-3 border-t ${isLight ? 'border-gray-200' : 'border-white/20'}`}>
                        <div className={`flex items-end gap-2 rounded-xl border px-3 py-2 ${
                            isLight ? 'border-gray-300 bg-gray-50' : 'border-white/30 bg-black/20'
                        }`}>
                            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={isHe ? 'שאל שאלה...' : 'Ask a question...'}
                                rows={1}
                                className={`flex-1 resize-none bg-transparent text-sm outline-none leading-5 max-h-24 ${
                                    isLight ? 'text-gray-900 placeholder-gray-400' : 'text-white placeholder-gray-500'
                                }`}
                                style={{ textAlign: isHe ? 'right' : 'left' }}
                                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'; }}
                            />
                            {hasSpeech && (
                                <button onClick={toggleVoice}
                                    className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                        listening
                                            ? 'bg-red-500 text-white animate-pulse'
                                            : isLight ? 'bg-gray-200 text-gray-500 hover:bg-gray-300' : 'bg-black/20 text-gray-400 hover:bg-white/10'
                                    }`}
                                    title={isHe ? (listening ? 'בטל הקלטה' : 'קלט קולי') : (listening ? 'Cancel recording' : 'Voice input')}>
                                    <Mic size={13} />
                                </button>
                            )}
                            <button onClick={() => {
                                if (listening) {
                                    // Stop recording then send
                                    listeningRef.current = false;
                                    recognitionRef.current?.stop();
                                    recognitionRef.current = null;
                                    setListening(false);
                                    const text = voiceTranscriptRef.current.trim();
                                    voiceTranscriptRef.current = '';
                                    interimRef.current = '';
                                    if (text) sendMessageRef.current(text);
                                    else sendMessage();
                                } else {
                                    sendMessage();
                                }
                            }} disabled={!input.trim() && !listening || loading}
                                className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                    (input.trim() || listening) && !loading
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : isLight ? 'bg-gray-200 text-gray-400' : 'bg-black/20 text-gray-500'
                                }`}>
                                <Send size={13} />
                            </button>
                        </div>
                        <p className={`text-[10px] text-center mt-1 ${isLight ? 'text-gray-400' : 'text-gray-400'}`}>
                            {isHe ? 'Enter לשליחה · Shift+Enter לשורה חדשה' : 'Enter to send · Shift+Enter for new line'}
                        </p>
                    </div>
                </div>
            )}

            {/* Floating Button */}
            <button
                ref={btnRef}
                onMouseDown={onBtnMouseDown}
                className={`fixed z-[149] w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-colors select-none ${
                    open
                        ? 'bg-gray-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
                style={{ bottom: btnPos.bottom, right: btnPos.right, cursor: 'grab' }}
                title={isHe ? 'שאל את היועץ' : 'Ask your advisor'}
            >
                {open ? <X size={22} /> : <MessageCircle size={22} />}
            </button>
        </>
    );
}
