import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, RotateCcw, Mic, AlertCircle, WifiOff, KeyRound, CreditCard, FileX, Copy, Check, RefreshCw } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useDraggable } from '../hooks/useDraggable';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { getChatResponse, buildChatSystemPrompt } from '../utils/ai-chat';
import { addSingleReminder, markInitialSyncDone } from '../hooks/useReminders';

const MAX_DISPLAY_MESSAGES = 20; // keep last N messages in state (DOM + context bound)

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

export function ChatWidget({ inputs, results, language, aiProvider, aiModel, apiKeyOverride, open, setOpen }) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const isHe = language === 'he';

    useBodyScrollLock(open);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copiedIdx, setCopiedIdx] = useState(null);

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

        const tryAutoSubmit = (accumulated) => {
            if (!/(?:^|\s)(done|דן)[.,!?\s]*$/.test(accumulated)) return false;
            const text = accumulated.replace(/[\s.,!?]*(done|דן)[.,!?\s]*$/, '').trim();
            listeningRef.current = false;
            recognitionRef.current?.stop();
            setListening(false);
            voiceTranscriptRef.current = '';
            interimRef.current = '';
            setInput('');
            if (text) setTimeout(() => sendMessageRef.current?.(text), 0);
            return true;
        };

        recognition.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) {
                    const trimmed = t.trim();
                    voiceTranscriptRef.current += (voiceTranscriptRef.current ? ' ' : '') + trimmed;
                    interim = '';
                    if (tryAutoSubmit(voiceTranscriptRef.current)) return;
                } else {
                    interim += t;
                }
            }
            interimRef.current = interim;
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


    const sendMessage = useCallback(async (text) => {
        const trimmed = (text ?? input).trim();
        if (!trimmed || loading) return;
        setInput('');
        setError(null);
        const newMessages = [...messages.slice(-MAX_DISPLAY_MESSAGES), { role: 'user', content: trimmed }];
        setMessages(newMessages);
        setLoading(true);
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const systemPrompt = buildChatSystemPrompt(inputs, results, language);
            const reply = await getChatResponse(newMessages, systemPrompt, aiProvider, aiModel, apiKeyOverride, { signal: controller.signal });

            // Parse reminder action if present
            const reminderMatch = reply.match(/%%REMINDER%%([\s\S]*?)%%ENDREMINDER%%/);
            const cleanReply = reply.replace(/%%REMINDER%%[\s\S]*?%%ENDREMINDER%%/, '').trim();
            let createdReminder = null;
            if (reminderMatch) {
                try {
                    const data = JSON.parse(reminderMatch[1].trim());
                    if (data.label && data.date) {
                        const id = `chat_${Date.now()}`;
                        addSingleReminder({
                            id,
                            source: 'general',
                            label: data.label,
                            date: data.date,
                            note: data.note || '',
                            ...(data.recurring ? {
                                recurring: true,
                                ...(data.recurringType ? { recurringType: data.recurringType } : {}),
                                ...(data.recurringDay != null ? { recurringDay: data.recurringDay } : {}),
                                ...(data.recurringInterval != null ? { recurringInterval: data.recurringInterval } : {}),
                            } : {}),
                        });
                        markInitialSyncDone();
                        createdReminder = { label: data.label, date: data.date };
                    }
                } catch {}
            }

            setMessages(prev => [...prev.slice(-MAX_DISPLAY_MESSAGES), {
                role: 'assistant',
                content: cleanReply,
                reminder: createdReminder,
            }]);
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
    }, [input, messages, loading, inputs, results, language, aiProvider, aiModel, apiKeyOverride]);

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

    const PANEL_W = 360;
    const PANEL_MIN_H = 300;
    const GAP = 24;
    const vh = window.innerHeight;
    const panelMaxH = Math.max(PANEL_MIN_H, vh - 120);

    const panelStyle = {
        position: 'fixed',
        bottom: GAP,
        right: GAP,
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
                                <div key={i} className={`group/msg flex mb-2 ${msg.role === 'user' ? (isHe ? 'justify-start' : 'justify-end') : (isHe ? 'justify-end' : 'justify-start')}`}>
                                    <div className="relative max-w-[85%]">
                                        <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                                            msg.role === 'user'
                                                ? 'bg-blue-600 text-white'
                                                : isLight ? 'bg-gray-100 text-gray-800' : 'bg-black/30 text-gray-100'
                                        }`}>
                                            {msg.content}
                                            {msg.reminder && (
                                                <div className={`mt-2 pt-2 border-t flex items-center gap-1.5 text-xs ${isLight ? 'border-gray-200 text-emerald-600' : 'border-white/10 text-emerald-400'}`}>
                                                    <span>🔔</span>
                                                    <span className="font-medium">{isHe ? 'תזכורת נוצרה:' : 'Reminder set:'}</span>
                                                    <span>{msg.reminder.label} · {msg.reminder.date}</span>
                                                </div>
                                            )}
                                        </div>
                                        {/* Copy & Retry actions */}
                                        <div className={`absolute -bottom-4 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity z-20 ${
                                            msg.role === 'user' ? (isHe ? 'left-1' : 'right-1') : (isHe ? 'right-1' : 'left-1')
                                        }`}>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(msg.content);
                                                    setCopiedIdx(i);
                                                    setTimeout(() => setCopiedIdx(prev => prev === i ? null : prev), 1500);
                                                }}
                                                className={`p-1 rounded transition-colors ${isLight ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100' : 'text-gray-500 hover:text-gray-300 hover:bg-white/10'}`}
                                                title={isHe ? 'העתק' : 'Copy'}
                                            >
                                                {copiedIdx === i ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (msg.role === 'user') {
                                                        // Retry: remove this message and all after it, then re-send
                                                        setMessages(prev => prev.slice(0, i));
                                                        setTimeout(() => sendMessageRef.current(msg.content), 50);
                                                    } else {
                                                        // Retry assistant: find the preceding user message and re-send
                                                        const userMsg = messages.slice(0, i).reverse().find(m => m.role === 'user');
                                                        if (userMsg) {
                                                            setMessages(prev => prev.slice(0, i));
                                                            setTimeout(() => sendMessageRef.current(userMsg.content), 50);
                                                        }
                                                    }
                                                }}
                                                disabled={loading}
                                                className={`p-1 rounded transition-colors ${isLight ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100' : 'text-gray-500 hover:text-gray-300 hover:bg-white/10'} ${loading ? 'opacity-30 cursor-not-allowed' : ''}`}
                                                title={isHe ? 'נסה שוב' : 'Retry'}
                                            >
                                                <RefreshCw size={11} />
                                            </button>
                                        </div>
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
                                    balance: { Icon: CreditCard,  cls: 'bg-amber-500/10 border-amber-500/30 text-amber-400',  titleCls: 'text-amber-300', title: isHe ? 'אין קרדיט API'       : 'Insufficient API Credits',  body: isHe ? 'יש להוסיף קרדיט לחשבון ספק ה-AI'            : 'Add credits to your AI provider account' },
                                    quota:   { Icon: WifiOff,     cls: 'bg-orange-500/10 border-orange-500/30 text-orange-400', titleCls: 'text-orange-300', title: isHe ? 'חריגה ממכסת API'     : 'API Quota Exceeded',         body: isHe ? 'הגעת למגבלת הבקשות — נסה שוב בעוד כמה דקות' : 'Rate limit reached — try again in a few minutes' },
                                    auth:    { Icon: KeyRound,    cls: 'bg-red-500/10 border-red-500/30 text-red-400',         titleCls: 'text-red-300',    title: isHe ? 'מפתח API שגוי'       : 'Invalid API Key',            body: isHe ? 'בדוק את מפתח ה-API בהגדרות'                  : 'Check your API key in Settings' },
                                    context: { Icon: FileX,       cls: 'bg-purple-500/10 border-purple-500/30 text-purple-400', titleCls: 'text-purple-300', title: isHe ? 'ההודעה ארוכה מדי'    : 'Message Too Long',           body: isHe ? 'נסה לנקות את הצ\'אט ולשאול מחדש'             : "Try clearing the chat and asking again" },
                                    network: { Icon: WifiOff,     cls: 'bg-red-500/10 border-red-500/30 text-red-400',         titleCls: 'text-red-300',    title: isHe ? 'שגיאת תקשורת'        : 'Network Error',              body: isHe ? 'בדוק את החיבור לאינטרנט'                     : 'Check your internet connection' },
                                    unknown: { Icon: AlertCircle, cls: 'bg-red-500/10 border-red-500/30 text-red-400',         titleCls: 'text-red-300',    title: isHe ? 'שגיאה'               : 'Error',                      body: error.raw },
                                }[error.type] || { Icon: AlertCircle, cls: 'bg-red-500/10 border-red-500/30 text-red-400', titleCls: 'text-red-300', title: 'Error', body: error.raw };
                                return (
                                    <div className={`mx-1 mb-1 rounded-lg border px-3 py-2 flex items-start gap-2 ${cfg.cls}`}>
                                        <cfg.Icon size={14} className="mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <p className={`text-xs font-semibold ${cfg.titleCls}`}>{cfg.title}</p>
                                            <p className="text-[11px] mt-0.5 break-words opacity-80">{cfg.body}</p>
                                        </div>
                                        <button onClick={() => setError(null)} className="shrink-0 mt-0.5 opacity-60 hover:opacity-100"><X size={12} /></button>
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

        </>
    );
}
