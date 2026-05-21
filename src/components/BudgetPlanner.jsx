import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Plus, Trash2, Target, RotateCcw, BrainCircuit, Loader2, Search, X, History, Clock, ToggleLeft, ToggleRight, MessageSquare, Bell, Save, Send, BarChart3, Calculator, RefreshCw, Copy, Undo2, Redo2, TrendingUp, Lock, Unlock, Globe, Car, PiggyBank, Route } from 'lucide-react';
import { MaintenanceCalcPanel } from './MaintenanceCalcPanel';
import { syncComponentReminders } from '../hooks/useReminders';
import { InsightRenderer } from './budget/InsightRenderer';
import { BudgetStatsModal } from './budget/BudgetStatsModal';
import { CategorySection } from './budget/CategorySection';
import { FixedVarModal } from './budget/FixedVarModal';
import {
    normalizeTripDays, normalizeCarRentalDays, fetchIlsRates, ratesLineFor,
    REGION_PROMPT, WORLD_REGIONS, TIER_META, DEFAULT_TRIP_DAYS, numberOrZero,
    getParsedGroundedAiJson, aiErrorMessage, parseAiJsonObject,
    COST_OF_LIVING_PRICE_CONTEXT, PLAN_COST_KEYS, LOCATION_CARD_STYLES,
    countryInitials, flagImageUrlFor, airfareRegionFor, flightHoursLabel,
    tripBreakdownFor, sourceMetaForCost, normalizeRoundTripAirfare, PlanFlags,
    TIP_META, normalizeLocationSuggestions, locationKeyFor, recalcLocationTrip,
} from './budget/locationUtils.jsx';
import { useAuth } from '../contexts/AuthContext';
import { getBudgetItems, setBudgetItems, getBudgetAiInsight, setBudgetAiInsight, getUserSettings, setUserSettings, getTripPlans, saveTripPlan, deleteTripPlan } from '../utils/db';
import { getChatResponse } from '../utils/ai-chat';
import { feature as topoFeature } from 'topojson-client';
import { geoMercator, geoPath as d3GeoPath } from 'd3-geo';
import { useDraggable } from '../hooks/useDraggable';

const SAVE_DEBOUNCE_MS = 1000;
const DEFAULT_TRIP_PLAN_SORT = { key: 'createdAt', dir: 'desc' };
const TRIP_PLAN_SORT_KEYS = new Set(['price', 'nights', 'level', 'createdAt']);

function normalizeTripPlanSort(sort) {
    if (!sort || !TRIP_PLAN_SORT_KEYS.has(sort.key)) return DEFAULT_TRIP_PLAN_SORT;
    return {
        key: sort.key,
        dir: sort.dir === 'asc' ? 'asc' : 'desc'
    };
}

const TRIP_PLAN_CHAT_LIMIT = 12;

function buildTripPlanChatPrompt(plannedTrip, tripRequest, currency, isHe) {
    return `You are a practical trip-planning advisor helping refine one planned trip.
Answer in ${isHe ? 'Hebrew' : 'English'} with concise, specific advice about the trip and its destinations.
The user may ask about cars, nearby places, food, route changes, attractions, day trips, timing, local logistics, or any trip detail.
Use the plan context below. If an answer depends on live/current facts, say what should be verified before booking.
Do not return JSON in the visible answer.
When and only when the user explicitly asks to add, keep, save, or include advice in the plan, append one exact block at the very end on a new line:
- Use itinerary for route details, must-see places, nearby places, attractions, day trips, restaurants to visit, or other content that belongs in trip details:
%%TRIP_NOTE%%{"type":"itinerary","segment":"short trip-detail heading in ${isHe ? 'Hebrew' : 'English'}","place":"destination or area","text":"standalone trip-detail text in ${isHe ? 'Hebrew' : 'English'}"}%%ENDTRIPNOTE%%
- Use tip only for practical advice such as packing, safety, etiquette, visa, transport guidance, money, or a car-rental rule of thumb:
%%TRIP_NOTE%%{"type":"tip","text":"short standalone practical tip in ${isHe ? 'Hebrew' : 'English'}"}%%ENDTRIPNOTE%%
Must-see places belong in itinerary, not tips. The text must be useful later inside the saved trip plan and must not mention this chat.

Trip request:
${tripRequest || ''}

Trip plan:
- Title: ${plannedTrip?.title || ''}
- Summary: ${plannedTrip?.summary || ''}
- Nights: ${plannedTrip?.nights || ''}
- Level: ${plannedTrip?.level || ''}
- Best months: ${plannedTrip?.bestMonths || ''}
- Current note: ${plannedTrip?.note || ''}
- Total cost currency: ${currency}
- Route: ${(plannedTrip?.itinerary || []).map(seg => `${seg.segment || ''} ${seg.place || ''}: ${seg.plan || ''}`.trim()).join('\n') || 'None'}
- Existing tips: ${(plannedTrip?.tips || []).map(tip => tip.text).join('\n') || 'None'}`;
}

function parseTripPlanChatReply(reply) {
    const noteMatch = String(reply || '').match(/%%TRIP_NOTE%%([\s\S]*?)%%ENDTRIPNOTE%%/);
    const cleanReply = String(reply || '').replace(/%%TRIP_NOTE%%[\s\S]*?%%ENDTRIPNOTE%%/, '').trim();
    if (!noteMatch) return { cleanReply, planAddition: null };

    try {
        const parsed = JSON.parse(noteMatch[1].trim());
        const text = typeof parsed?.text === 'string' ? parsed.text.trim() : '';
        if (!text) return { cleanReply, planAddition: null };
        if (parsed?.type === 'itinerary') {
            return {
                cleanReply,
                planAddition: {
                    type: 'itinerary',
                    segment: typeof parsed.segment === 'string' ? parsed.segment.trim() : '',
                    place: typeof parsed.place === 'string' ? parsed.place.trim() : '',
                    text,
                }
            };
        }
        if (parsed?.type === 'tip') {
            return { cleanReply, planAddition: { type: 'tip', text } };
        }
        return { cleanReply, planAddition: null };
    } catch {
        return { cleanReply, planAddition: null };
    }
}

// ─── Category metadata ────────────────────────────────────────────────────────
const CATEGORIES = [
    { id: 'housing',       icon: '🏠', labelHe: 'דיור',     labelEn: 'Housing'       },
    { id: 'food',          icon: '🛒', labelHe: 'מזון',     labelEn: 'Food'          },
    { id: 'health',        icon: '🏥', labelHe: 'בריאות',   labelEn: 'Health'        },
    { id: 'transport',     icon: '🚗', labelHe: 'תחבורה',   labelEn: 'Transport'     },
    { id: 'entertainment', icon: '🎭', labelHe: 'בילויים',  labelEn: 'Entertainment' },
    { id: 'personal',      icon: '👤', labelHe: 'אישי',     labelEn: 'Personal'      },
    { id: 'family',        icon: '👨‍👩‍👧', labelHe: 'משפחה',   labelEn: 'Family'        },
    { id: 'misc',          icon: '🔧', labelHe: 'שונות',    labelEn: 'Misc'          },
];

const DEFAULT_ITEMS = [
    { id: 'h-arnona',      categoryId: 'housing',       label: 'ארנונה',               amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-vaad',        categoryId: 'housing',       label: 'ועד בית',              amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-electricity', categoryId: 'housing',       label: 'חשמל',                 amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-water',       categoryId: 'housing',       label: 'מים',                  amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-gas',         categoryId: 'housing',       label: 'גז',                   amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-internet',    categoryId: 'housing',       label: 'אינטרנט + סלולר',      amount: 0, frequency: 'monthly', enabled: true },
    { id: 'h-insurance',   categoryId: 'housing',       label: 'ביטוח דירה',           amount: 0, frequency: 'annual',  enabled: true },
    { id: 'h-maintenance', categoryId: 'housing',       label: 'תחזוקת דירה',          amount: 0, frequency: 'annual',  enabled: true, type: 'maintenance-calc' },
    { id: 'f-grocery',     categoryId: 'food',          label: 'קניות וסופר',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 'f-restaurants', categoryId: 'food',          label: 'מסעדות ובתי קפה',      amount: 0, frequency: 'monthly', enabled: true },
    { id: 'hlth-ins',      categoryId: 'health',        label: 'ביטוח בריאות משלים',   amount: 0, frequency: 'monthly', enabled: true },
    { id: 'hlth-doctors',  categoryId: 'health',        label: 'רופאים ותרופות',       amount: 0, frequency: 'monthly', enabled: true },
    { id: 'hlth-dental',   categoryId: 'health',        label: 'שיניים',               amount: 0, frequency: 'annual',  enabled: true },
    { id: 'hlth-optics',   categoryId: 'health',        label: 'אופטיקה',              amount: 0, frequency: 'annual',  enabled: true },
    { id: 't-car-ins',     categoryId: 'transport',     label: 'ביטוח + רישוי רכב',    amount: 0, frequency: 'annual',  enabled: true },
    { id: 't-fuel',        categoryId: 'transport',     label: 'דלק / טעינה',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 't-public',      categoryId: 'transport',     label: 'תחבורה ציבורית',       amount: 0, frequency: 'monthly', enabled: true },
    { id: 'e-sport',       categoryId: 'entertainment', label: 'ספורט וכושר',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 'e-culture',     categoryId: 'entertainment', label: 'תרבות ובידור',         amount: 0, frequency: 'monthly', enabled: true },
    { id: 'e-travel',      categoryId: 'entertainment', label: 'חופשות ונסיעות',       amount: 0, frequency: 'annual',  enabled: true },
    { id: 'p-clothing',    categoryId: 'personal',      label: 'ביגוד והנעלה',         amount: 0, frequency: 'annual',  enabled: true },
    { id: 'p-grooming',    categoryId: 'personal',      label: 'טיפוח ויופי',          amount: 0, frequency: 'monthly', enabled: true },
    { id: 'fam-gifts',     categoryId: 'family',        label: 'מתנות',                amount: 0, frequency: 'monthly', enabled: true },
    { id: 'fam-support',   categoryId: 'family',        label: 'תמיכה בילדים / נכדים', amount: 0, frequency: 'monthly', enabled: true },
    { id: 'm-home',        categoryId: 'misc',          label: 'כלי בית וציוד',        amount: 0, frequency: 'annual',  enabled: true },
    { id: 'm-other',       categoryId: 'misc',          label: 'שונות',                amount: 0, frequency: 'monthly', enabled: true },
];


const getNowYM = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };

// ─── Fixed/Variable classification ───────────────────────────────────────────
const FIXED_BY_DEFAULT_IDS = new Set([
    'h-arnona', 'h-vaad', 'h-internet', 'h-insurance', 'h-maintenance',
    'hlth-ins', 'hlth-dental', 'hlth-optics',
    't-car-ins', 'e-sport', 'fam-support',
]);
function defaultIsFixed(item) {
    if (item.type === 'loan') return true;
    return FIXED_BY_DEFAULT_IDS.has(item.id);
}
function effectiveIsFixed(item) {
    return item.isFixed !== undefined ? item.isFixed : defaultIsFixed(item);
}

// ─── Retirement-adjustment helpers ───────────────────────────────────────────
const RET_JSON_START = '---RETIREMENT_JSON_START---';
const RET_JSON_END   = '---RETIREMENT_JSON_END---';

function parseRetirementAdj(text) {
    if (!text) return null;
    const s = text.indexOf(RET_JSON_START);
    const e = text.indexOf(RET_JSON_END);
    if (s === -1 || e === -1) return null;
    try {
        const adj = JSON.parse(text.slice(s + RET_JSON_START.length, e).trim());
        if (!adj || (!adj.additions && !adj.increases)) return null;
        adj.additions = Array.isArray(adj.additions) ? adj.additions : [];
        adj.increases = Array.isArray(adj.increases) ? adj.increases : [];
        return adj;
    } catch { return null; }
}

function stripRetirementJson(text) {
    if (!text) return text;
    const s = text.indexOf(RET_JSON_START);
    if (s === -1) return text;
    const e = text.indexOf(RET_JSON_END);
    if (e === -1) return text;
    return (text.slice(0, s) + text.slice(e + RET_JSON_END.length)).trim();
}

function matchIncrease(itemLabel, incLabel) {
    const a = itemLabel.toLowerCase().trim();
    const b = incLabel.toLowerCase().trim();
    return a === b || a.includes(b) || b.includes(a);
}

// Colors aligned with CATEGORIES order
const CAT_COLORS = ['#3b82f6','#22c55e','#ef4444','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#6b7280'];

// ─── Backup display helper ────────────────────────────────────────────────────
const MAX_BACKUP_SLOTS = 3;

function backupAge(savedAt, isHe) {
    const mins = Math.round((Date.now() - savedAt) / 60000);
    if (mins < 1) return isHe ? 'עכשיו' : 'just now';
    if (mins < 60) return isHe ? `לפני ${mins} דק׳` : `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return isHe ? `לפני ${h} שע׳` : `${h}h ago`;
    return isHe ? `לפני ${Math.floor(h / 24)} ימים` : `${Math.floor(h / 24)}d ago`;
}

const trackActive = (track) => {
    if (!track.endDate) return true;
    const [y, m] = track.endDate.split('-').map(Number);
    return y * 12 + (m - 1) >= getNowYM();
};

const toMonthly = (item) => {
    if (item.type === 'loan') {
        return (item.tracks || []).filter(trackActive).reduce((s, tr) => s + (tr.amount || 0), 0);
    }
    return item.frequency === 'annual' ? (item.amount || 0) / 12 : (item.amount || 0);
};

const isBudgetItemPaused = (item) => item?.status === 'paused' || item?.enabled === false;

function normalizeBudgetItem(item) {
    if (!item) return item;
    const paused = isBudgetItemPaused(item);
    return {
        ...item,
        status: paused ? 'paused' : 'active',
        enabled: !paused
    };
}

function withReminderPausedState(item, enabled) {
    if (!item) return item;
    const nextEnabled = enabled !== false;
    if (!nextEnabled) {
        if (item.reminder?.date) {
            return {
                ...item,
                status: 'paused',
                enabled: false,
                pausedReminder: { ...item.reminder },
                reminder: undefined
            };
        }
        return { ...item, status: 'paused', enabled: false };
    }

    if (!item.reminder?.date && item.pausedReminder?.date) {
        const { pausedReminder, ...rest } = item;
        return { ...rest, status: 'active', enabled: true, reminder: { ...pausedReminder } };
    }

    const { pausedReminder: _pausedReminder, ...rest } = item;
    return { ...rest, status: 'active', enabled: true };
}

function mergeBudgetItemUpdate(currentItem, updatedItem) {
    if (!currentItem) return normalizeBudgetItem(updatedItem);
    if (!updatedItem) return normalizeBudgetItem(currentItem);

    const currentPaused = isBudgetItemPaused(currentItem);
    const {
        status: _nextStatus,
        enabled: _nextEnabled,
        pausedReminder: _nextPausedReminder,
        ...restUpdated
    } = updatedItem;

    if (currentPaused) {
        return normalizeBudgetItem({
            ...currentItem,
            ...restUpdated,
            reminder: currentItem.reminder,
            pausedReminder: currentItem.pausedReminder,
            status: currentItem.status,
            enabled: currentItem.enabled,
        });
    }

    return normalizeBudgetItem({
        ...currentItem,
        ...restUpdated,
        status: currentItem.status,
        enabled: currentItem.enabled,
        pausedReminder: currentItem.pausedReminder,
    });
}

const trackActiveInFuture = (track, projYears) => {
    if (!track.endDate) return true;
    const [y, m] = track.endDate.split('-').map(Number);
    return y * 12 + (m - 1) >= getNowYM() + Math.round(projYears * 12);
};

const trackActiveInYear = (track, year) => {
    if (!track.endDate) return true;
    return parseInt(track.endDate.split('-')[0]) >= year;
};

// Projected monthly cost accounting for loan end dates and per-track inflation flag
const toProjectedMonthly = (item, projFactor, projYears) => {
    if (item.enabled === false) return 0;
    if (item.type === 'loan') {
        return (item.tracks || [])
            .filter(tr => trackActive(tr) && trackActiveInFuture(tr, projYears))
            .reduce((s, tr) => s + (tr.amount || 0) * (tr.inflationAffected ? projFactor : 1), 0);
    }
    return toMonthly(item) * projFactor;
};

function genId() {
    return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function LocationSuggestModal({ isOpen, onClose, availableAmount, userMonthlyCost, monthlySavingsAmount, withdrawalMonthlyAmount, year, currency, isHe, isLight, aiProvider, aiModel, apiKeyOverride }) {
    const { dragStyle, onDragMouseDown } = useDraggable(isOpen, { constrainToViewport: true, viewportMargin: 16 });
    const [mode, setMode] = useState('plan');
    const [tier, setTier] = useState(null);
    const [tripDaysInput, setTripDaysInput] = useState('');
    const [includeMonthlySavings, setIncludeMonthlySavings] = useState(false);
    const [savingsMonths, setSavingsMonths] = useState(1);
    const [customBudget, setCustomBudget] = useState('');
    const [selectedRegions, setSelectedRegions] = useState(new Set());
    const [includeCarRental, setIncludeCarRental] = useState(false);
    const [carRentalDaysInput, setCarRentalDaysInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [replacingLocation, setReplacingLocation] = useState(false);
    const [deletedLocations, setDeletedLocations] = useState([]);
    const [parsed, setParsed] = useState(null);
    const [error, setError] = useState(null);
    const [openCard, setOpenCard] = useState(null);
    const [tripRequest, setTripRequest] = useState('');
    const [plannedTrip, setPlannedTrip] = useState(null);
    const [planLoading, setPlanLoading] = useState(false);
    const [planError, setPlanError] = useState(null);
    const [savedPlans, setSavedPlans] = useState([]);
    const [savingPlan, setSavingPlan] = useState(false);
    const [planSaved, setPlanSaved] = useState(false);
    const [showSavedPlans, setShowSavedPlans] = useState(false);
    const [planSort, setPlanSort] = useState(DEFAULT_TRIP_PLAN_SORT);
    const [tripChatOpen, setTripChatOpen] = useState(false);
    const [tripChatMessages, setTripChatMessages] = useState([]);
    const [tripChatInput, setTripChatInput] = useState('');
    const [tripChatLoading, setTripChatLoading] = useState(false);
    const [tripChatError, setTripChatError] = useState(null);
    const [tripTipSearch, setTripTipSearch] = useState('');
    const [loadedPlanId, setLoadedPlanId] = useState(null);
    const [openSection, setOpenSection] = useState(null);
    const [daysFromMonthsInput, setDaysFromMonthsInput] = useState('');
    const [nightsOverride, setNightsOverride] = useState(null);
    const { currentUser } = useAuth();

    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [isOpen]);

    const toggleCard = i => setOpenCard(prev => prev === i ? null : i);

    const fmtAmt = v => {
        const abs = Math.abs(v || 0);
        if (abs >= 1_000_000) return `${currency}${(abs / 1_000_000).toFixed(1)}M`;
        if (abs >= 1_000) return `${currency}${(abs / 1000).toFixed(1)}K`;
        return `${currency}${Math.round(abs).toLocaleString()}`;
    };
    const fmtTripSummary = loc => {
        const amount = fmtAmt(loc.total);
        if (loc.monthFits) return isHe ? `${loc.tripDays} לילות · ${amount}` : `${amount} / ${loc.tripDays} nights`;
        return isHe ? `${loc.daysAffordable} לילות · ${amount}` : `${amount} / ${loc.daysAffordable} nights`;
    };
    const withdrawalDailyBudget = Math.ceil(Math.max(0, numberOrZero(withdrawalMonthlyAmount)) / DEFAULT_TRIP_DAYS);
    const monthlySavingsBudget = Math.max(0, Math.round(numberOrZero(monthlySavingsAmount)));
    const variableDailyCost = Math.ceil(Math.max(0, availableAmount - monthlySavingsBudget) / DEFAULT_TRIP_DAYS);
    const tripBudgetForDays = useCallback((daysValue) => {
        if (!includeMonthlySavings && parseFloat(customBudget) > 0) return parseFloat(customBudget);
        const days = normalizeTripDays(daysValue);
        return Math.max(0, variableDailyCost * days + (includeMonthlySavings ? monthlySavingsBudget * savingsMonths : 0));
    }, [variableDailyCost, includeMonthlySavings, monthlySavingsBudget, savingsMonths, customBudget]);

    const toggleLocationCarRental = useCallback((idx) => {
        setParsed(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                locations: (prev.locations || []).map((loc, i) => {
                    if (i !== idx) return loc;
                    if (!loc.carRentalOriginalCost) return loc;
                    return recalcLocationTrip(loc, tripBudgetForDays(loc.tripDays), !loc.includeCarRental);
                }),
            };
        });
    }, [tripBudgetForDays]);

    const fetchReplacementLocation = useCallback(async (selectedTier, excludedLocations) => {
        const tripDays = normalizeTripDays(tripDaysInput);
        const carRentalDays = normalizeCarRentalDays(carRentalDaysInput, tripDays);
        const tripBudget = tripBudgetForDays(tripDays);
        const dailyWithdrawalTarget = Math.ceil(Math.max(0, numberOrZero(withdrawalMonthlyAmount)) / DEFAULT_TRIP_DAYS);
        const tierHe = { cheap: 'זולה', medium: 'בינונית', expensive: 'יוקרתית' }[selectedTier];
        const tierEn = { cheap: 'budget-friendly', medium: 'moderate', expensive: 'premium' }[selectedTier];
        const amtStr = `${currency}${Math.round(tripBudget).toLocaleString()}`;
        const nowYear = new Date().getFullYear();
        const yearCtxHe = year > nowYear
            ? `שנת יעד: ${year} (בעוד ${year - nowYear} שנים). הצמד עלויות לשנה זו עם אינפלציה צפויה.`
            : `שנת הפניה: ${year}.`;
        const yearCtxEn = year > nowYear
            ? `Target year: ${year} (${year - nowYear} years from now). Adjust costs for expected inflation.`
            : `Reference year: ${year}.`;
        const carCtxHe = includeCarRental ? ` שקול שכירת רכב ל-${carRentalDays} ימים רק אם זה באמת מועיל ליעד; אם העיר פקוקה/עירונית עם תחבורה טובה החזר carRental=0.` : ' אל תכלול שכירת רכב.';
        const carCtxEn = includeCarRental ? ` Consider car rental for ${carRentalDays} days only if it is genuinely useful for the destination; for dense city stays with good transport return carRental=0.` : ' Do not include car rental.';
        const regionTextsHe = [...selectedRegions].map(id => REGION_PROMPT[id]?.he).filter(Boolean);
        const regionTextsEn = [...selectedRegions].map(id => REGION_PROMPT[id]?.en).filter(Boolean);
        const nearbyCtxHe = regionTextsHe.length ? regionTextsHe.join(' ') : (tripDays < 10
            ? 'מאחר שהשהייה פחות מ-10 ימים, הצע יעדים קרובים בלבד לפי זמן טיסה ישירה סביר מ-TLV: מזרח תיכון, צפון אפריקה ואירופה קרובה. הסק בעצמך אילו מדינות וערים נכללות לפי גיאוגרפיה וזמינות טיסות ישירות, בלי רשימת מדינות קבועה.'
            : 'הצע יעדים מכל העולם, מאזורים שונים ככל האפשר.');
        const nearbyCtxEn = regionTextsEn.length ? regionTextsEn.join(' ') : (tripDays < 10
            ? 'Since the stay is under 10 days, suggest only nearby destinations by reasonable direct-flight time from TLV: Middle East, North Africa, and nearby Europe. Infer included countries and cities yourself from geography and direct-flight availability, without a fixed country list.'
            : 'Suggest destinations from any region worldwide.');
        const nearbyCtxForPrompt = isHe ? nearbyCtxHe : nearbyCtxEn;
        const excludedText = excludedLocations
            .map(loc => `${loc.city || ''}${loc.country ? `, ${loc.country}` : ''}`.trim())
            .filter(Boolean)
            .join('; ');
        const schema = `{"budgetFits":"cheap|medium|expensive","budgetNote":"one sentence","locations":[{"city":"localized city name: Hebrew when UI is Hebrew, English when UI is English","country":"localized country name: Hebrew when UI is Hebrew, English when UI is English","countryCode":"ISO 3166 alpha-2 country code in English letters","countryEn":"country name in English for technical lookup","flag":"🏳","total":0,"note":"localized one sentence","housingType":"localized accommodation type","housingLevel":"localized short standard/location description","tripHousingCost":0,"tripFoodCost":0,"tripTransportCost":0,"tripEntertainmentCost":0,"tripOtherCost":0,"flightRoundTrip":0,"flightHours":0,"flightSourceName":"","flightSourceUrl":"","flightOriginalPrice":0,"flightOriginalCurrency":"","flightConversionRate":0,"flightConversionRateSource":"","flightConversionRateDate":"","accommodationSourceName":"","accommodationSourceUrl":"","accommodationOriginalPrice":0,"accommodationOriginalCurrency":"","accommodationConversionRate":0,"accommodationConversionRateSource":"","accommodationConversionRateDate":"","carRentalSourceName":"","carRentalSourceUrl":"","carRentalOriginalPrice":0,"carRentalOriginalCurrency":"","carRentalConversionRate":0,"carRentalConversionRateSource":"","carRentalConversionRateDate":"","costs":{"rent":0,"food":0,"transport":0,"entertainment":0,"flights":0,"carRental":0,"insurance":0,"esim":0,"other":0}}]}`;
        const replacementSearchCount = 12;
        const liveRates = await fetchIlsRates();
        const ratesLine = ratesLineFor(liveRates);
        const systemPrompt = `You are a global cost-of-living advisor. Respond ONLY with valid JSON, no markdown, no explanation outside the JSON. All prices must be grounded in current real-world sources. For flights, use live booking/metasearch/airline results from TLV and return the source and original currency fields. Before returning numbers, verify each figure against current source data: accommodation sites, flight sites, local food and transport costs. Treat price verification as a required validation step: direct round-trip scope, taxes/fees, currency conversion, and total-vs-nightly accommodation must be checked before JSON output. Do not use suspiciously round numbers or guesses — use realistic estimates a real traveler would encounter in ${nowYear}.\n${ratesLine}\n${COST_OF_LIVING_PRICE_CONTEXT}`;
        const userMsg = isHe
            ? `${yearCtxHe} תקציב לטיול: ${amtStr}. תקציב יומי לפי המשיכה שלי: ${currency}${dailyWithdrawalTarget}. משך שהייה לבדיקה: ${tripDays} לילות. החזר רשימה מלאה ככל האפשר של יעדים חלופיים לאורח חיים ${tierHe}, לפחות ${replacementSearchCount} ועד 25 יעדים שעומדים בתנאי האזור/טיסה/תקציב או נכנסים לפחות לחלק מהלילות. ${nearbyCtxForPrompt} כל שדות הטקסט הגלויים למשתמש חייבים להיכתב בעברית כבר בתשובת ה-JSON: city, country, note, housingType, housingLevel, budgetNote. אל תחזיר שמות ערים/מדינות באנגלית בשדות האלה. השדה countryEn בלבד חייב להישאר באנגלית לצורך זיהוי טכני. קודם חפש יעדים שבהם עלות הטיול הכוללת (כולל טיסות, לינה, אוכל, תחבורה, ביטוח ו-eSIM) נמוכה או שווה לתקציב, או עד 5% מעליו — אלה נחשבים "מתאימים לתקציב"; אם יש עוד יעדים באזור שחורגים יותר, החזר אותם עם מספר הלילות שנכנס בתקציב. אל תפסול יעד בגלל הפרש מהוצאה יומית; זה נתון תצוגה בלבד. חשב את רמת המחיה לפי השוק המקומי של כל יעד. בחר דיור שמתאים למשך: לכמה לילות השתמש במלון/חדר/גסטהאוס/דירה קצרה לפי הרמה, ולשהייה חודשית בדירה חודשית. החזר tripHousingCost ו-tripFoodCost לתקופה המבוקשת. פרט ב-housingLevel וב-note את ההנחות שמצדיקות את הרמה. ${carCtxHe} אסור להציע אף אחד מהיעדים האלה: ${excludedText || 'אין'}. החזר רק JSON בסכמה: ${schema}.`
            : `${yearCtxEn} Trip budget: ${amtStr}. My daily budget from monthly withdrawal: ${currency}${dailyWithdrawalTarget}. Stay length to evaluate: ${tripDays} nights. Return the fullest practical list of replacement destinations for a ${tierEn} lifestyle, at least ${replacementSearchCount} and up to 25 destinations that meet the region/flight/budget conditions or fit at least some nights. ${nearbyCtxEn} Visible user-facing text fields must be in English in the JSON: city, country, note, housingType, housingLevel, budgetNote. countryEn must also remain English for technical lookup. First prioritize destinations where total trip cost (flights + accommodation + food + transport + insurance + eSIM) is at or below the budget, or up to 5% above it — these count as "fits the budget"; if there are more destinations in the region that exceed it further, return them with the number of affordable nights. Do not reject a destination because of daily-spend difference; that is display-only. Price the lifestyle tier relative to each destination's local market. Choose accommodation suitable for the duration: hotel/private room/guesthouse/short-stay apartment for short trips, monthly apartment for month stays. Return tripHousingCost and tripFoodCost for the requested stay. In housingLevel and note, explain the assumptions that justify the tier.${carCtxEn} Do not suggest any of these locations: ${excludedText || 'none'}. Return ONLY JSON matching schema: ${schema}.`;
        const fallbackMsg = isHe
            ? `החזר JSON בלבד. החזר רשימה מלאה ככל האפשר, לפחות ${replacementSearchCount} ועד 25 יעדים חלופיים לאורח חיים ${tierHe}, ${tripDays} לילות, תקציב ${amtStr}. ${nearbyCtxForPrompt} city, country, note, housingType, housingLevel ו-budgetNote חייבים להיות בעברית בתשובת ה-JSON, לא באנגלית. רק countryEn באנגלית. החזר tripHousingCost ו-tripFoodCost לתקופה, עם דיור מתאים למשך. אל תציע: ${excludedText || 'אין'}. סכימה: ${schema}`
            : `Return JSON only. Return the fullest practical list, at least ${replacementSearchCount} and up to 25 replacement destinations for a ${tierEn} lifestyle, ${tripDays} nights, budget ${amtStr}. ${nearbyCtxEn} Visible fields city, country, note, housingType, housingLevel and budgetNote must be in English. Return tripHousingCost and tripFoodCost for the stay, with duration-appropriate accommodation. Exclude: ${excludedText || 'none'}. Schema: ${schema}`;
        const normalized = normalizeLocationSuggestions(
            await getParsedGroundedAiJson(
                [{ role: 'user', content: userMsg }],
                systemPrompt,
                aiProvider,
                aiModel,
                apiKeyOverride,
                [{ role: 'user', content: fallbackMsg }]
            ),
            selectedTier,
            tripBudget,
            isHe,
            tripDays,
            includeCarRental,
            carRentalDays,
            dailyWithdrawalTarget
        );
        const excludedKeys = new Set(excludedLocations.map(locationKeyFor).filter(Boolean));
        const replacement = (normalized.locations || []).find(loc => !excludedKeys.has(locationKeyFor(loc)));
        if (!replacement) throw new Error('No non-duplicate replacement returned');
        return replacement;
    }, [withdrawalMonthlyAmount, year, currency, isHe, aiProvider, aiModel, apiKeyOverride, tripDaysInput, includeCarRental, carRentalDaysInput, tripBudgetForDays, selectedRegions]);

    const deleteLocation = useCallback(async (idx) => {
        if (!parsed?.locations?.[idx] || !tier || replacingLocation) return;
        const removed = parsed.locations[idx];
        const remaining = parsed.locations.filter((_, i) => i !== idx);
        const excluded = [...deletedLocations, removed, ...remaining];
        setDeletedLocations(prev => [...prev, removed]);
        setParsed(prev => prev ? { ...prev, locations: remaining } : prev);
        setOpenCard(null);
        setReplacingLocation(true);
        try {
            const replacement = await fetchReplacementLocation(tier, excluded);
            if (replacement) {
                setParsed(prev => {
                    if (!prev) return prev;
                    const existingKeys = new Set((prev.locations || []).map(locationKeyFor).filter(Boolean));
                    if (existingKeys.has(locationKeyFor(replacement))) return prev;
                    return {
                        ...prev,
                        locations: [...(prev.locations || []), replacement].sort((a, b) => {
                            if (b.daysAffordable !== a.daysAffordable) return b.daysAffordable - a.daysAffordable;
                            return a.dailyCost - b.dailyCost;
                        }),
                    };
                });
            }
        } catch {
            setError(isHe ? 'היעד נמחק, אבל לא הצלחתי להביא חלופה כרגע' : 'Location removed, but no replacement could be loaded right now');
        } finally {
            setReplacingLocation(false);
        }
    }, [parsed, tier, replacingLocation, deletedLocations, fetchReplacementLocation, isHe]);

    const fetchTripPlan = useCallback(async () => {
        if (!tripRequest.trim()) return;
        setPlanLoading(true);
        setPlannedTrip(null);
        setPlanError(null);
        const nowYear = new Date().getFullYear();
        const yearCtxHe = `שנת הפניה: ${nowYear}.`;
        const yearCtxEn = `Reference year: ${nowYear}.`;
        const savingsCtxHe = monthlySavingsBudget > 0
            ? ` מידע פיננסי: חיסכון חודשי = ${currency}${Math.round(monthlySavingsBudget).toLocaleString()} לחודש; חיסכון משתנה יומי (הוצאות שנחסכות בזמן הנסיעה) = ${currency}${variableDailyCost.toLocaleString()} ליום. אם הבקשה מציינת תקציב בחודשי חיסכון (כגון "2 חודשי חיסכון" או "תקציב של 3 חודשים"), חשב: (מספר החודשים × חיסכון חודשי) + (מספר הלילות × חיסכון יומי), ותכנן בתוך סכום זה בדיוק — אל תחרוג ממנו.`
            : '';
        const savingsCtxEn = monthlySavingsBudget > 0
            ? ` Financial context: monthly savings = ${currency}${Math.round(monthlySavingsBudget).toLocaleString()}/month; daily variable savings (expenses saved while traveling) = ${currency}${variableDailyCost.toLocaleString()}/day. If the request specifies a savings-based budget (e.g. "2 months savings"), compute: (months × monthly savings) + (nights × daily savings). Plan the trip within that exact total — do not exceed it.`
            : '';
        const schema = `{"title":"1 country: main city · N nights e.g. בנגקוק · 10 ימים; 2 countries: CountryA + CountryB · N nights e.g. תאילנד + קמבודיה · 14 ימים; 3+ countries: region/continent · N nights e.g. דרום-מזרח אסיה · 21 ימים","countryCode":"primary destination ISO alpha-2 e.g. PT TH JP","countryCodes":["XX","YY"],"summary":"1–2 sentence overview of the trip","itinerary":[{"segment":"e.g. Days 1–3","place":"city or area","plan":"2–3 sentences: where to stay, key activities, highlights"}],"tips":[{"cat":"currency|electricity|clothing|health|customs|transport|language|safety|visa|other","text":"concise practical tip"}],"level":"cheap|medium|expensive — infer from the request or the prices chosen","nights":0,"bestMonths":"e.g. Apr–Oct (shoulder season: good weather, lower prices)","note":"key pricing assumptions including fuel price per litre if car used","flightSourceName":"","flightSourceUrl":"","flightOriginalPrice":0,"flightOriginalCurrency":"","flightConversionRate":0,"flightConversionRateSource":"","flightConversionRateDate":"","accommodationSourceName":"","accommodationSourceUrl":"","accommodationOriginalPrice":0,"accommodationOriginalCurrency":"","accommodationConversionRate":0,"accommodationConversionRateSource":"","accommodationConversionRateDate":"","carRentalSourceName":"","carRentalSourceUrl":"","carRentalOriginalPrice":0,"carRentalOriginalCurrency":"","carRentalConversionRate":0,"carRentalConversionRateSource":"","carRentalConversionRateDate":"","costs":{"flights":0,"housing":0,"food":0,"transport":0,"entertainment":0,"carRental":0,"fuel":0,"insurance":0,"esim":0,"other":0},"total":0}`;
        const liveRates = await fetchIlsRates();
        const ratesLine = ratesLineFor(liveRates);
        const systemPrompt = `You are a global travel cost advisor. Respond ONLY with valid JSON, no markdown, no explanation outside the JSON. All prices must be grounded in current real-world sources for the destination. For flights, use live booking/metasearch/airline results from TLV with direct/non-stop only filtering and return the source and original currency fields. Before returning numbers, verify each figure against current source data: accommodation sites, direct-flight sites, local food costs, and official or widely-reported fuel prices. Treat price verification as a required validation step: direct round-trip scope, taxes/fees, currency conversion, and total-vs-nightly accommodation must be checked before JSON output. Do not round to suspiciously even numbers or guess — use realistic estimates a real traveler would encounter in ${new Date().getFullYear()}.\n${ratesLine}\n${COST_OF_LIVING_PRICE_CONTEXT}`;
        const userMsgHe = `${yearCtxHe} בקשת הנסיעה: "${tripRequest}".${savingsCtxHe} חשב עלויות ריאליסטיות ומדויקות בשקלים (ILS) לטיול המבוקש כולו — המספרים חייבים לשקף מחירי שוק אמיתיים של ${nowYear}, לא הערכות עגולות. countryCode = קוד ISO alpha-2 של מדינת היעד הראשית. countryCodes = מערך JSON עם קודי ISO alpha-2 לכל מדינות היעד (לדוגמה: ["TH","KH"] לתאילנד + קמבודיה) — אם מדינה אחת, החזר מערך עם איבר אחד. flights = כרטיס טיסה ישירה בלבד הלוך-חזור מ-TLV לאדם, ללא עצירות וללא קונקשנים, גם אם טיסה עם עצירה זולה יותר. housing = עלות לינה כוללת לכל הלילות (לא מחיר ללילה). food/transport/entertainment/other = עלות כוללת לכל הטיול. carRental = עלות שכירת הרכב בלבד (ללא דלק). fuel = עלות דלק מחושבת לפי מחיר הדלק המקומי האמיתי במדינת היעד וצריכה משוערת לפי ק"מ מתוכנן. אם לא התבקש רכב, fuel=0. insurance = עלות ביטוח נסיעות מציאותית לאזרח ישראלי לאותה תקופה ויעד. esim = עלות eSIM או כרטיס SIM מקומי לאינטרנט לאורך הנסיעה. total = סכום כל הקטגוריות. level = רמת הנסיעה כפי שביקשתי או שהסקת (cheap/medium/expensive). bestMonths = החודשים המומלצים לנסיעה עם הסבר קצר (מזג אוויר/מחיר/עומס). note = הנחות תמחור קצרות בלבד — ללא אזכור אינפלציה, ללא שנים עתידיות. ציין רק מחיר דלק לליטר אם השתמשת בו. itinerary = מערך של שלבי הטיול לפי סדר כרונולוגי — כל שלב עם segment (ימים, למשל "ימים 1–3"), place (שם המקום), plan (2-3 משפטים: לינה, פעילויות, אטרקציות). כסה את כל הלילות בצורה מאוזנת. tips = מערך של 6-9 טיפים מעשיים ליעד — כל טיפ עם cat (אחד מ: currency, electricity, clothing, health, customs, transport, language, safety, visa, other) ו-text (משפט קצר ומעשי בעברית). חובה לכלול: מטבע (שם, המרה משקל), חשמל (סוג שקע, מתח, האם צריך מתאם), ביגוד (לפי עונה ותרבות), ויזה לאזרח ישראלי, ועוד נושאים רלוונטיים. החזר JSON בלבד: ${schema}. title, summary, itinerary, bestMonths, tips ו-note בעברית.`;
        const userMsgEn = `${yearCtxEn} Trip request: "${tripRequest}".${savingsCtxEn} Calculate accurate, realistic costs in ILS (Israeli shekels) for the full trip — numbers must reflect real ${nowYear} market prices, not round guesses. countryCode = ISO alpha-2 code of the primary destination. countryCodes = JSON array of ISO alpha-2 codes for ALL destination countries (e.g. ["TH","KH"] for Thailand + Cambodia; for a single country use a one-element array). flights = direct/non-stop round-trip airfare from TLV per person only, with zero stops/connections, even if connecting flights are cheaper. housing = total accommodation cost for all nights (not per night). food/transport/entertainment/other = total cost for the entire trip. carRental = car rental cost only (excluding fuel). fuel = fuel cost calculated using the destination country's real local fuel price per litre and estimated mileage for the trip; if no car requested, fuel=0. insurance = realistic travel insurance cost for an Israeli citizen for that duration and destination. esim = cost of an eSIM or local SIM card for internet connectivity throughout the trip. total = sum of all categories. level = trip level as requested or inferred (cheap/medium/expensive). bestMonths = recommended travel months with a short reason (weather/price/crowds). note = brief pricing assumptions only — no mention of inflation, no future years. itinerary = chronological array of trip segments — each with segment (days range e.g. "Days 1–3"), place (city/area name), plan (2–3 sentences: accommodation type, key activities, highlights). Cover all nights proportionally. tips = array of 6–9 practical destination tips — each with cat (one of: currency, electricity, clothing, health, customs, transport, language, safety, visa, other) and text (short, actionable sentence in English). Must include: currency (name, approx rate from ILS), electricity (plug type, voltage, adapter needed?), clothing (season/dress code), visa for Israeli passport holders, and other relevant topics. Include fuel price per litre if used. Return ONLY JSON: ${schema}.`;
        const geminiKey = aiProvider === 'gemini'
            ? (apiKeyOverride?.trim() || import.meta.env.VITE_GEMINI_API_KEY?.trim())
            : null;
        const userMsg = isHe ? userMsgHe : userMsgEn;
        const runOnce = () => getChatResponse(
            [{ role: 'user', content: userMsg }],
            systemPrompt, aiProvider, aiModel, apiKeyOverride
        ).then(parseAiJsonObject);

        // One of the two calls uses Google Search grounding for real prices (Gemini 2.x only)
        const supportsGrounding = !!geminiKey && /gemini-2|gemini-exp/.test(aiModel);
        const runOnceWithGrounding = supportsGrounding
            ? async () => {
                try {
                    const { GoogleGenerativeAI } = await import('@google/generative-ai');
                    const genAI = new GoogleGenerativeAI(geminiKey);
                    const model = genAI.getGenerativeModel({
                        model: aiModel,
                        tools: [{ googleSearch: {} }],
                        systemInstruction: systemPrompt,
                    });
                    const result = await model.generateContent(userMsg);
                    return parseAiJsonObject(result.response.text());
                } catch {
                    return runOnce();
                }
            }
            : runOnce;

        const fixTotal = r => {
            if (!r.total) r.total = Object.values(r.costs || {}).reduce((s, v) => s + Math.max(0, numberOrZero(v)), 0);
            return r;
        };

        try {
            const [s1, s2] = await Promise.allSettled([runOnce(), runOnceWithGrounding()]);
            const r1raw = s1.status === 'fulfilled' ? s1.value : null;
            const r2raw = s2.status === 'fulfilled' ? s2.value : null;
            const r1 = r1raw || r2raw;
            const r2 = r2raw || r1raw;
            if (!r1) throw (s1.reason ?? s2.reason ?? new Error('Both AI calls returned invalid JSON'));
            fixTotal(r1); fixTotal(r2);

            const groundedFlight = r2raw?.flightSourceName || r2raw?.flightSourceUrl || r2raw?.flightOriginalPrice
                ? numberOrZero(r2raw?.costs?.flights)
                : 0;
            const avgCost = key => {
                if (key === 'flights' && groundedFlight > 0) return Math.round(groundedFlight);
                return Math.round((numberOrZero(r1.costs?.[key]) + numberOrZero(r2.costs?.[key])) / 2);
            };
            const costs = Object.fromEntries(
                ['flights','housing','food','transport','entertainment','carRental','fuel','insurance','esim','other'].map(k => [k, avgCost(k)])
            );
            const nights = Math.round((numberOrZero(r1.nights) + numberOrZero(r2.nights)) / 2);
            const tripLevel = r1.level || r2.level || 'medium';
            costs.flights = normalizeRoundTripAirfare(costs.flights, 0);
            const countryCode = r1.countryCode || r2.countryCode || '';
            const total = Object.values(costs).reduce((s, v) => s + v, 0);

            const codes1 = Array.isArray(r1.countryCodes) ? r1.countryCodes : (r1.countryCode ? [r1.countryCode] : []);
            const codes2 = Array.isArray(r2.countryCodes) ? r2.countryCodes : (r2.countryCode ? [r2.countryCode] : []);
            const countryCodes = [...new Set([...codes1, ...codes2])]
                .filter(c => typeof c === 'string' && /^[A-Za-z]{2}$/.test(c))
                .map(c => c.toUpperCase());

            const itinerary = Array.isArray(r1.itinerary) && r1.itinerary.length > 0
                ? r1.itinerary
                : (Array.isArray(r2.itinerary) && r2.itinerary.length > 0 ? r2.itinerary : null);
            const tips = Array.isArray(r1.tips) && r1.tips.length > 0
                ? r1.tips
                : (Array.isArray(r2.tips) && r2.tips.length > 0 ? r2.tips : null);

            const result = {
                ...r1,
                nights,
                costs,
                total,
                countryCode: countryCodes[0] || countryCode,
                countryCodes: countryCodes.length > 0 ? countryCodes : (countryCode ? [countryCode] : []),
                level: tripLevel,
                bestMonths: r1.bestMonths || r2.bestMonths,
                flightSourceName: r2raw?.flightSourceName || r1.flightSourceName || r2.flightSourceName || '',
                flightSourceUrl: r2raw?.flightSourceUrl || r1.flightSourceUrl || r2.flightSourceUrl || '',
                flightOriginalPrice: numberOrZero(r2raw?.flightOriginalPrice ?? r1.flightOriginalPrice ?? r2.flightOriginalPrice),
                flightOriginalCurrency: r2raw?.flightOriginalCurrency || r1.flightOriginalCurrency || r2.flightOriginalCurrency || '',
                flightConversionRate: numberOrZero(r2raw?.flightConversionRate ?? r1.flightConversionRate ?? r2.flightConversionRate),
                flightConversionRateSource: r2raw?.flightConversionRateSource || r1.flightConversionRateSource || r2.flightConversionRateSource || '',
                flightConversionRateDate: r2raw?.flightConversionRateDate || r1.flightConversionRateDate || r2.flightConversionRateDate || '',
                accommodationSourceName: r2raw?.accommodationSourceName || r1.accommodationSourceName || r2.accommodationSourceName || '',
                accommodationSourceUrl: r2raw?.accommodationSourceUrl || r1.accommodationSourceUrl || r2.accommodationSourceUrl || '',
                accommodationOriginalPrice: numberOrZero(r2raw?.accommodationOriginalPrice ?? r1.accommodationOriginalPrice ?? r2.accommodationOriginalPrice),
                accommodationOriginalCurrency: r2raw?.accommodationOriginalCurrency || r1.accommodationOriginalCurrency || r2.accommodationOriginalCurrency || '',
                accommodationConversionRate: numberOrZero(r2raw?.accommodationConversionRate ?? r1.accommodationConversionRate ?? r2.accommodationConversionRate),
                accommodationConversionRateSource: r2raw?.accommodationConversionRateSource || r1.accommodationConversionRateSource || r2.accommodationConversionRateSource || '',
                accommodationConversionRateDate: r2raw?.accommodationConversionRateDate || r1.accommodationConversionRateDate || r2.accommodationConversionRateDate || '',
                carRentalSourceName: r2raw?.carRentalSourceName || r1.carRentalSourceName || r2.carRentalSourceName || '',
                carRentalSourceUrl: r2raw?.carRentalSourceUrl || r1.carRentalSourceUrl || r2.carRentalSourceUrl || '',
                carRentalOriginalPrice: numberOrZero(r2raw?.carRentalOriginalPrice ?? r1.carRentalOriginalPrice ?? r2.carRentalOriginalPrice),
                carRentalOriginalCurrency: r2raw?.carRentalOriginalCurrency || r1.carRentalOriginalCurrency || r2.carRentalOriginalCurrency || '',
                carRentalConversionRate: numberOrZero(r2raw?.carRentalConversionRate ?? r1.carRentalConversionRate ?? r2.carRentalConversionRate),
                carRentalConversionRateSource: r2raw?.carRentalConversionRateSource || r1.carRentalConversionRateSource || r2.carRentalConversionRateSource || '',
                carRentalConversionRateDate: r2raw?.carRentalConversionRateDate || r1.carRentalConversionRateDate || r2.carRentalConversionRateDate || '',
                itinerary,
                tips,
            };
            setPlannedTrip(result);
            setTripChatMessages([]);
            setTripChatInput('');
            setTripChatError(null);
            setTripTipSearch('');
            setNightsOverride(null);
            setOpenSection(null);
            const lp = savedPlans.find(p => p.id === loadedPlanId);
            if (!lp || tripRequest.trim() !== lp.request?.trim()) setLoadedPlanId(null);
        } catch (err) {
            setPlanError(aiErrorMessage(err, isHe));
        } finally {
            setPlanLoading(false);
        }
    }, [tripRequest, isHe, aiProvider, aiModel, apiKeyOverride, loadedPlanId, savedPlans, monthlySavingsBudget, variableDailyCost, currency]);

    const savePlan = useCallback(async () => {
        if (!plannedTrip || !currentUser?.uid) return;
        setSavingPlan(true);
        try {
            const now = Date.now();
            const dateLabel = new Date(now).toLocaleDateString(isHe ? 'he-IL' : 'en-IL', { month: 'short', year: 'numeric' });
            const rawTitle = plannedTrip.title || tripRequest.slice(0, 35);
            const title = plannedTrip.nights > 0
                ? rawTitle.replace(/\d+\s*(?:ימים|לילות|days?|nights?)/i, `${plannedTrip.nights} ${isHe ? 'לילות' : 'nights'}`)
                : rawTitle;
            const countryCode = plannedTrip.countryCode || '';
            const countryCodes = plannedTrip.countryCodes?.length > 0 ? plannedTrip.countryCodes : (countryCode ? [countryCode] : []);
            const plan = { id: now.toString(), title, countryCode, countryCodes, dateLabel, request: tripRequest, result: plannedTrip, savedAt: now };
            await saveTripPlan(currentUser.uid, plan);
            setSavedPlans(prev => [...prev, plan]);
            setPlanSaved(true);
            setTimeout(() => setPlanSaved(false), 2000);
        } catch (err) {
            console.error('Failed to save trip plan', err);
        } finally {
            setSavingPlan(false);
        }
    }, [plannedTrip, tripRequest, isHe, currentUser?.uid]);

    const updatePlan = useCallback(async () => {
        if (!plannedTrip || !loadedPlanId || !currentUser?.uid) return;
        setSavingPlan(true);
        try {
            const existing = savedPlans.find(p => p.id === loadedPlanId);
            if (!existing) return;
            const countryCode = plannedTrip.countryCode || '';
            const countryCodes = plannedTrip.countryCodes?.length > 0 ? plannedTrip.countryCodes : (countryCode ? [countryCode] : []);
            const rawUpdTitle = plannedTrip.title || tripRequest.slice(0, 35);
            const updTitle = plannedTrip.nights > 0
                ? rawUpdTitle.replace(/\d+\s*(?:ימים|לילות|days?|nights?)/i, `${plannedTrip.nights} ${isHe ? 'לילות' : 'nights'}`)
                : rawUpdTitle;
            const updated = { ...existing, title: updTitle, countryCode, countryCodes, request: tripRequest, result: plannedTrip };
            await saveTripPlan(currentUser.uid, updated);
            setSavedPlans(prev => prev.map(p => p.id === loadedPlanId ? updated : p));
            setPlanSaved(true);
            setTimeout(() => setPlanSaved(false), 2000);
        } catch (err) {
            console.error('Failed to update trip plan', err);
        } finally {
            setSavingPlan(false);
        }
    }, [plannedTrip, loadedPlanId, savedPlans, tripRequest, isHe, currentUser?.uid]);

    const deletePlan = useCallback(async (planId, e) => {
        e.stopPropagation();
        if (!currentUser?.uid) return;
        setSavedPlans(prev => prev.filter(p => p.id !== planId));
        await deleteTripPlan(currentUser.uid, planId).catch(() => {});
    }, [currentUser?.uid]);

    const updatePlanSort = useCallback((key) => {
        setPlanSort(currentSort => {
            const nextSort = currentSort.key === key
                ? { key, dir: currentSort.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: key === 'createdAt' ? 'desc' : 'asc' };

            if (currentUser?.uid) {
                setUserSettings(currentUser.uid, { tripPlanSort: nextSort }).catch(() => {});
            }

            return nextSort;
        });
    }, [currentUser?.uid]);

    const askTripChat = useCallback(async () => {
        const question = tripChatInput.trim();
        if (!plannedTrip || !question || tripChatLoading) return;

        const nextMessages = [...tripChatMessages.slice(-TRIP_PLAN_CHAT_LIMIT), { role: 'user', content: question }];
        setTripChatMessages(nextMessages);
        setTripChatInput('');
        setTripChatError(null);
        setTripChatLoading(true);

        try {
            const contextMessages = nextMessages.map(({ role, content }) => ({ role, content }));
            const reply = await getChatResponse(
                contextMessages,
                buildTripPlanChatPrompt(plannedTrip, tripRequest, currency, isHe),
                aiProvider,
                aiModel,
                apiKeyOverride
            );
            const { cleanReply, planAddition } = parseTripPlanChatReply(reply);

            if (planAddition) {
                setPlannedTrip(currentPlan => {
                    if (!currentPlan) return currentPlan;
                    if (planAddition.type === 'itinerary') {
                        const itineraryExists = (currentPlan.itinerary || []).some(seg => seg?.plan === planAddition.text);
                        return itineraryExists
                            ? currentPlan
                            : {
                                ...currentPlan,
                                itinerary: [...(currentPlan.itinerary || []), {
                                    segment: planAddition.segment || (isHe ? 'תוספת למסלול' : 'Plan addition'),
                                    place: planAddition.place,
                                    plan: planAddition.text,
                                }]
                            };
                    }

                    const tipExists = (currentPlan.tips || []).some(tip => tip?.text === planAddition.text);
                    return tipExists
                        ? currentPlan
                        : { ...currentPlan, tips: [...(currentPlan.tips || []), { cat: 'other', text: planAddition.text }] };
                });
            }

            setTripChatMessages(currentMessages => [...currentMessages.slice(-TRIP_PLAN_CHAT_LIMIT), {
                role: 'assistant',
                content: cleanReply,
                addedToPlan: !!planAddition,
            }]);
        } catch (err) {
            console.error('Trip plan chat failed', err);
            setTripChatError(aiErrorMessage(err, isHe));
        } finally {
            setTripChatLoading(false);
        }
    }, [tripChatInput, plannedTrip, tripChatLoading, tripChatMessages, tripRequest, currency, isHe, aiProvider, aiModel, apiKeyOverride]);

    const loadPlan = useCallback((plan) => {
        setTripRequest(plan.request);
        setPlannedTrip(plan.result);
        setTripChatMessages([]);
        setTripChatInput('');
        setTripChatError(null);
        setTripTipSearch('');
        setNightsOverride(null);
        setOpenSection(null);
        setLoadedPlanId(plan.id);
        setPlanSaved(false);
    }, []);

    const fetchSuggestions = useCallback(async (selectedTier) => {
        if (!selectedTier) {
            setError(isHe ? 'בחר רמת מחיה לפני החיפוש' : 'Choose a lifestyle level before searching');
            return;
        }
        setTier(selectedTier);
        setLoading(true);
        setReplacingLocation(false);
        setDeletedLocations([]);
        setParsed(null);
        setError(null);
        setOpenCard(null);
        const tripDays = normalizeTripDays(tripDaysInput);
        const carRentalDays = normalizeCarRentalDays(carRentalDaysInput, tripDays);
        const tripBudget = tripBudgetForDays(tripDays);
        const dailyWithdrawalTarget = Math.ceil(Math.max(0, numberOrZero(withdrawalMonthlyAmount)) / DEFAULT_TRIP_DAYS);
        const tierHe = { cheap: 'זולה', medium: 'בינונית', expensive: 'יוקרתית' }[selectedTier];
        const tierEn = { cheap: 'budget-friendly', medium: 'moderate', expensive: 'premium' }[selectedTier];
        const amtStr = `${currency}${Math.round(tripBudget).toLocaleString()}`;
        const nowYear = new Date().getFullYear();
        const yearCtxHe = year > nowYear
            ? `שנת יעד: ${year} (בעוד ${year - nowYear} שנים). הצמד עלויות לשנה זו עם אינפלציה צפויה.`
            : `שנת הפניה: ${year}.`;
        const yearCtxEn = year > nowYear
            ? `Target year: ${year} (${year - nowYear} years from now). Adjust costs for expected inflation.`
            : `Reference year: ${year}.`;
        const liveRates = await fetchIlsRates();
        const ratesLine = ratesLineFor(liveRates);
        const systemPrompt = `You are a global cost-of-living advisor. Respond ONLY with valid JSON, no markdown, no explanation outside the JSON. All prices must be grounded in current real-world sources. For flights, use live booking/metasearch/airline results from TLV and return the source and original currency fields. Before returning numbers, verify each figure against current source data: accommodation sites, flight sites, local food and transport costs. Treat price verification as a required validation step: direct round-trip scope, taxes/fees, currency conversion, and total-vs-nightly accommodation must be checked before JSON output. Do not use suspiciously round numbers or guesses — use realistic estimates a real traveler would encounter in ${nowYear}.\n${ratesLine}\n${COST_OF_LIVING_PRICE_CONTEXT}`;
        const carCtxHe = includeCarRental ? ` שקול שכירת רכב ל-${carRentalDays} ימים רק אם זה באמת מועיל ליעד; אם העיר פקוקה/עירונית עם תחבורה טובה החזר carRental=0.` : ' אל תכלול שכירת רכב.';
        const carCtxEn = includeCarRental ? ` Consider car rental for ${carRentalDays} days only if it is genuinely useful for the destination; for dense city stays with good transport return carRental=0.` : ' Do not include car rental.';
        const regionTextsHe = [...selectedRegions].map(id => REGION_PROMPT[id]?.he).filter(Boolean);
        const regionTextsEn = [...selectedRegions].map(id => REGION_PROMPT[id]?.en).filter(Boolean);
        const nearbyCtxHe = regionTextsHe.length ? regionTextsHe.join(' ') : (tripDays < 10
            ? 'מאחר שהשהייה פחות מ-10 ימים, הצע יעדים קרובים בלבד לפי זמן טיסה ישירה סביר מ-TLV: מזרח תיכון, צפון אפריקה ואירופה קרובה. הסק בעצמך אילו מדינות וערים נכללות לפי גיאוגרפיה וזמינות טיסות ישירות, בלי רשימת מדינות קבועה.'
            : 'הצע יעדים מכל העולם, מאזורים שונים ככל האפשר.');
        const nearbyCtxEn = regionTextsEn.length ? regionTextsEn.join(' ') : (tripDays < 10
            ? 'Since the stay is under 10 days, suggest only nearby destinations by reasonable direct-flight time from TLV: Middle East, North Africa, and nearby Europe. Infer included countries and cities yourself from geography and direct-flight availability, without a fixed country list.'
            : 'Suggest destinations from any region worldwide.');
        const nearbyCtxForPrompt = isHe ? nearbyCtxHe : nearbyCtxEn;
        const schema = `{"budgetFits":"cheap|medium|expensive","budgetNote":"one sentence","locations":[{"city":"localized city name: Hebrew when UI is Hebrew, English when UI is English","country":"localized country name: Hebrew when UI is Hebrew, English when UI is English","countryCode":"ISO 3166 alpha-2 country code in English letters","countryEn":"country name in English for technical lookup","flag":"🏳","total":0,"note":"localized one sentence","housingType":"localized accommodation type","housingLevel":"localized short standard/location description","tripHousingCost":0,"tripFoodCost":0,"tripTransportCost":0,"tripEntertainmentCost":0,"tripOtherCost":0,"flightRoundTrip":0,"flightHours":0,"flightSourceName":"","flightSourceUrl":"","flightOriginalPrice":0,"flightOriginalCurrency":"","flightConversionRate":0,"flightConversionRateSource":"","flightConversionRateDate":"","accommodationSourceName":"","accommodationSourceUrl":"","accommodationOriginalPrice":0,"accommodationOriginalCurrency":"","accommodationConversionRate":0,"accommodationConversionRateSource":"","accommodationConversionRateDate":"","carRentalSourceName":"","carRentalSourceUrl":"","carRentalOriginalPrice":0,"carRentalOriginalCurrency":"","carRentalConversionRate":0,"carRentalConversionRateSource":"","carRentalConversionRateDate":"","costs":{"rent":0,"food":0,"transport":0,"entertainment":0,"flights":0,"carRental":0,"insurance":0,"esim":0,"other":0}}]}`;
        const minimumLocationCount = 12;
        const userMsg = isHe
            ? `${yearCtxHe} תקציב לטיול: ${amtStr}. תקציב יומי לפי המשיכה שלי: ${currency}${dailyWithdrawalTarget}. משך שהייה לבדיקה: ${tripDays} לילות. החזר רשימה מלאה ככל האפשר, לפחות ${minimumLocationCount} ועד 25 ערים לאורח חיים ${tierHe}, שעומדות בתנאי האזור/טיסה/תקציב או נכנסות לפחות לחלק מהלילות. אם יש פחות מ-${minimumLocationCount} יעדים אמיתיים עם טיסות ישירות מ-TLV, החזר את כל מה שקיים והסבר ב-budgetNote. ${nearbyCtxForPrompt} כל שדות הטקסט הגלויים למשתמש חייבים להיות בעברית בתשובת ה-JSON: city, country, note, housingType, housingLevel, budgetNote. אל תחזיר שמות ערים/מדינות באנגלית בשדות האלה. השדה countryEn בלבד חייב להישאר באנגלית לצורך זיהוי טכני. קודם חפש יעדים שבהם עלות הטיול הכוללת (כולל טיסות, לינה, אוכל, תחבורה, ביטוח ו-eSIM) נמוכה או שווה לתקציב, או עד 5% מעליו — אלה נחשבים "מתאימים לתקציב"; אם יש יעדים נוספים באזור שחורגים יותר, החזר אותם עם מספר הלילות שנכנס בתקציב. אל תפסול יעד בגלל הפרש מהוצאה יומית; זה נתון תצוגה בלבד. חשב את הרמה לפי השוק המקומי של כל יעד: דיור, מיקום, אוכל, תחבורה ובילויים חייבים לשקף את הרמה שנבחרה בעיר הזו. בחר דיור שמתאים למשך: לכמה לילות מלון/חדר/גסטהאוס/דירה קצרה לפי הרמה, ולחודש דירה חודשית. החזר tripHousingCost = עלות לינה כוללת לכל התקופה (לא ללילה), tripFoodCost = עלות אוכל כוללת לכל התקופה, tripTransportCost = עלות תחבורה כוללת לכל התקופה (מוניות, אוטובוסים, כרטיסיות, טיולים), tripEntertainmentCost = עלות בילויים ואטרקציות כוללת, tripOtherCost = הוצאות אחרות כוללות. כל ה-trip... הם עבור התקופה המבוקשת, כפי שתייר ישראלי יוציא בפועל. פרט ב-housingLevel וב-note את ההנחות שמצדיקות את הרמה. costs.insurance = עלות ביטוח נסיעות לאזרח ישראלי לאותה תקופה ויעד (עלות חד-פעמית לטיול). costs.esim = עלות eSIM או SIM מקומי לאינטרנט לאורך הטיול (עלות חד-פעמית לטיול). ${carCtxHe} החזר JSON בלבד בסכמה: ${schema}. budgetFits = הרמה שהתקציב הזה מאפשר באופן כללי.`
            : `${yearCtxEn} Trip budget: ${amtStr}. My daily budget from monthly withdrawal: ${currency}${dailyWithdrawalTarget}. Stay length to evaluate: ${tripDays} nights. Return the fullest practical list, at least ${minimumLocationCount} and up to 25 cities for a ${tierEn} lifestyle, that meet the region/flight/budget conditions or fit at least some nights. If fewer than ${minimumLocationCount} real destinations have direct flights from TLV, return every real option and explain it in budgetNote. ${nearbyCtxEn} Visible user-facing text fields must be in English in the JSON: city, country, note, housingType, housingLevel, budgetNote. You must return broad variety and not stop after 2-3 destinations. First prioritize destinations where total trip cost (flights + accommodation + food + transport + insurance + eSIM) is at or below the budget, or up to 5% above it — these count as "fits the budget"; if there are additional destinations in the region that exceed it further, return them with the number of affordable nights. Do not reject a destination because of daily-spend difference; that is display-only. Price the tier relative to each destination's local market: housing, neighborhood, food, transport and entertainment must reflect the selected tier in that city. Choose accommodation suitable for the duration: hotel/private room/guesthouse/short-stay apartment for short trips, monthly apartment for month stays. Return tripHousingCost = total accommodation for all nights (not per night), tripFoodCost = total food cost for the entire stay, tripTransportCost = total transport for the trip (taxis, buses, metro passes, day trips), tripEntertainmentCost = total entertainment and attractions for the stay, tripOtherCost = total other expenses. All trip* values must reflect actual tourist spending for an Israeli traveler. In housingLevel and note, explain the assumptions that justify the tier.${carCtxEn} costs.insurance = travel insurance cost for an Israeli citizen for that trip duration and destination (one-time per-trip cost). costs.esim = eSIM or local SIM card cost for internet connectivity throughout the trip (one-time per-trip cost). Return ONLY JSON matching schema: ${schema}. budgetFits = overall tier this budget supports globally.`;
        const fallbackMsg = isHe
            ? `החזר JSON בלבד, בלי טקסט נוסף. החזר רשימה מלאה ככל האפשר, לפחות ${minimumLocationCount} ועד 25 ערים לאורח חיים ${tierHe}, ${tripDays} לילות, תקציב ${amtStr}. אם יש פחות מ-${minimumLocationCount} יעדים אמיתיים עם טיסות ישירות מ-TLV, החזר את כל מה שקיים. ${nearbyCtxForPrompt} city, country, note, housingType, housingLevel ו-budgetNote חייבים להיות בעברית בתשובת ה-JSON, לא באנגלית. רק countryEn באנגלית. החזר tripHousingCost, tripFoodCost, tripTransportCost, tripEntertainmentCost, tripOtherCost כעלויות כוללות לתקופה. כל המחירים בשקלים. סכימה: ${schema}`
            : `Return JSON only, no extra text. Return the fullest practical list, at least ${minimumLocationCount} and up to 25 cities for a ${tierEn} lifestyle, ${tripDays} nights, budget ${amtStr}. If fewer than ${minimumLocationCount} real destinations have direct flights from TLV, return every real option. ${nearbyCtxEn} Visible fields city, country, note, housingType, housingLevel and budgetNote must be in English. Return tripHousingCost, tripFoodCost, tripTransportCost, tripEntertainmentCost, tripOtherCost as total costs for the entire stay. All prices in ILS. Schema: ${schema}`;
        try {
            let rawSuggestions = await getParsedGroundedAiJson(
                [{ role: 'user', content: userMsg }],
                systemPrompt,
                aiProvider,
                aiModel,
                apiKeyOverride,
                [{ role: 'user', content: fallbackMsg }]
            );
            let normalized = normalizeLocationSuggestions(
                rawSuggestions,
                selectedTier,
                tripBudget,
                isHe,
                tripDays,
                includeCarRental,
                carRentalDays,
                dailyWithdrawalTarget
            );
            const mergeSuggestions = (...sets) => {
                const merged = new Map();
                sets.forEach(set => {
                    (set?.locations || []).forEach(loc => {
                        const key = locationKeyFor(loc);
                        if (key && !merged.has(key)) merged.set(key, loc);
                    });
                });
                return {
                    ...rawSuggestions,
                    budgetNote: sets.find(set => set?.budgetNote)?.budgetNote || rawSuggestions.budgetNote || '',
                    locations: [...merged.values()],
                };
            };
            if ((normalized.locations || []).length < minimumLocationCount) {
                const coverageDirectives = isHe
                    ? [
                        'כסה יעדי חוף, איים וערי נופש בתוך האזור לפי גיאוגרפיה וזמינות טיסה ישירה.',
                        'כסה ערים גדולות ושדות תעופה מרכזיים בתוך האזור לפי טיסות ישירות מ-TLV.',
                        'כסה יעדים משניים, עונתיים וקצרים בתוך האזור שיכולים להתאים לתקציב או לחלק מהלילות.',
                    ]
                    : [
                        'Cover coastal, island, and resort destinations within the region by geography and direct-flight availability.',
                        'Cover major cities and hub airports within the region by direct flights from TLV.',
                        'Cover secondary, seasonal, and short-break destinations within the region that can fit the budget or some nights.',
                    ];
                for (const directive of coverageDirectives) {
                    const supplementMsg = isHe
                        ? `החיפוש הקודם החזיר רק ${(normalized.locations || []).length} יעדים, וזה לא מספיק. בצע חיפוש מלא נוסף לאותו אזור גיאוגרפי ולאותו תקציב: ${amtStr}, ${tripDays} לילות, רמת חיים ${tierHe}. ${directive} ${nearbyCtxForPrompt} החזר לפחות ${minimumLocationCount} ועד 25 יעדים ב-locations[] אם יש מספיק יעדים אמיתיים עם טיסות ישירות מ-TLV. אם אין ${minimumLocationCount}, החזר את כל היעדים האמיתיים שמצאת. אל תשתמש ברשימת מדינות קבועה; הסק לבד את גבולות האזור לפי גיאוגרפיה וזמינות טיסות ישירות. אל תעצור ביעדים שמתאימים לגמרי לתקציב; אם יעד חורג, החזר אותו עם מספר הלילות שנכנס בתקציב. city, country, note, housingType, housingLevel ו-budgetNote חייבים להיות בעברית בתשובת ה-JSON, לא באנגלית. רק countryEn באנגלית. כל המחירים בשקלים, עם מקורות לטיסה/לינה/רכב כשיש רכב. סכימה: ${schema}`
                        : `The previous search returned only ${(normalized.locations || []).length} destinations, which is not enough. Run another full search for the same geographic region and budget: ${amtStr}, ${tripDays} nights, ${tierEn} lifestyle. ${directive} ${nearbyCtxEn} Return at least ${minimumLocationCount} and up to 25 destinations in locations[] when enough real destinations have direct flights from TLV. If there are fewer than ${minimumLocationCount}, return every real destination found. Do not use a fixed country list; infer the region boundary from geography and direct-flight availability. Do not stop at fully budget-fitting destinations; if a destination exceeds the budget, return it with affordable nights. Visible fields city, country, note, housingType, housingLevel and budgetNote must be in English. All prices in ILS, with sources for flight/accommodation/car where applicable. Schema: ${schema}`;
                    const supplemental = await getParsedGroundedAiJson(
                        [{ role: 'user', content: supplementMsg }],
                        systemPrompt,
                        aiProvider,
                        aiModel,
                        apiKeyOverride
                    ).catch(() => null);
                    if (!supplemental?.locations?.length) continue;
                    rawSuggestions = mergeSuggestions(rawSuggestions, supplemental);
                    normalized = normalizeLocationSuggestions(
                        rawSuggestions,
                        selectedTier,
                        tripBudget,
                        isHe,
                        tripDays,
                        includeCarRental,
                        carRentalDays,
                        dailyWithdrawalTarget
                    );
                    if ((normalized.locations || []).length >= minimumLocationCount) break;
                }
                if ((normalized.locations || []).length < minimumLocationCount) {
                    const merged = new Map();
                    (rawSuggestions.locations || []).forEach(loc => {
                        const key = locationKeyFor(loc);
                        if (key && !merged.has(key)) merged.set(key, loc);
                    });
                    rawSuggestions = {
                        ...rawSuggestions,
                        budgetNote: rawSuggestions.budgetNote || (isHe
                            ? `נמצאו ${merged.size} יעדים בלבד אחרי חיפוש מורחב עם טיסות ישירות ומקורות מחיר.`
                            : `Found only ${merged.size} destinations after expanded direct-flight sourced search.`),
                        locations: [...merged.values()],
                    };
                    normalized = normalizeLocationSuggestions(
                        rawSuggestions,
                        selectedTier,
                        tripBudget,
                        isHe,
                        tripDays,
                        includeCarRental,
                        carRentalDays,
                        dailyWithdrawalTarget
                    );
                }
            }
            setParsed(normalized);
        } catch (err) {
            console.error('Location suggestions failed', err);
            setError(aiErrorMessage(err, isHe));
        } finally {
            setLoading(false);
        }
    }, [withdrawalMonthlyAmount, year, currency, isHe, aiProvider, aiModel, apiKeyOverride, tripDaysInput, includeCarRental, carRentalDaysInput, tripBudgetForDays, selectedRegions]);

    useEffect(() => {
        if (!isOpen) return;
        setMode('plan');
        setTier(null);
        setParsed(null);
        setError(null);
        setReplacingLocation(false);
        setDeletedLocations([]);
        setIncludeMonthlySavings(false);
        setSelectedRegions(new Set());
        setOpenCard(null);
        setTripRequest('');
        setPlannedTrip(null);
        setPlanError(null);
        setPlanSaved(false);
        setShowSavedPlans(false);
        setTripChatOpen(false);
        setTripChatMessages([]);
        setTripChatInput('');
        setTripChatError(null);
        setTripTipSearch('');
        if (!currentUser?.uid) return;

        getTripPlans(currentUser.uid).then(plans => setSavedPlans(plans || [])).catch(() => {});
        getUserSettings(currentUser.uid).then(settings => {
            setPlanSort(normalizeTripPlanSort(settings?.tripPlanSort));
        }).catch(() => {});
    }, [isOpen, currentUser?.uid]);

    const filteredTripTips = useMemo(() => {
        const tips = plannedTrip?.tips || [];
        const query = tripTipSearch.trim().toLowerCase();
        if (!query) return tips;

        return tips.filter(tip => {
            const meta = TIP_META[tip?.cat] || TIP_META.other;
            const haystack = [tip?.text, meta.he, meta.en].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(query);
        });
    }, [plannedTrip, tripTipSearch]);

    if (!isOpen) return null;

    const fitsColorMap = { green: isLight ? 'bg-green-50 border-green-200 text-green-700' : 'bg-green-500/10 border-green-500/30 text-green-400', blue: isLight ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-blue-500/10 border-blue-500/30 text-blue-400', purple: isLight ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-purple-500/10 border-purple-500/30 text-purple-400' };

    return createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div data-draggable-modal className={`relative w-full max-w-5xl h-[min(calc(100vh-2rem),680px)] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${isLight ? 'bg-white' : ''}`} style={dragStyle} dir={isHe ? 'rtl' : 'ltr'}>
                {!isLight && <><div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-indigo-900" /><div className="absolute inset-0 bg-white/5" /></>}
                {/* Header */}
                <div className={`relative z-10 flex items-center gap-3 px-5 py-4 border-b shrink-0 cursor-grab active:cursor-grabbing ${isLight ? 'border-slate-200' : 'border-white/10'}`} onMouseDown={onDragMouseDown}>
                    <div className={`p-1.5 rounded-lg shrink-0 ${isLight ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/20 text-indigo-400'}`}><Globe size={16} /></div>
                    <div className="flex-1 min-w-0">
                        <div className={`font-bold text-sm ${isLight ? 'text-slate-800' : 'text-white'}`}>{isHe ? 'מקומות מגורים מומלצים' : 'Recommended Living Locations'}</div>
                        <div className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {isHe ? 'פנוי למחיה: ' : 'Available: '}<span dir={isHe ? 'rtl' : 'ltr'}>{fmtAmt(availableAmount)}<span className="font-normal opacity-60">{isHe ? '/חו׳' : '/mo'}</span></span>{year && <span className="ms-1.5 opacity-60">· {year}</span>}
                        </div>
                    </div>
                    {mode === 'find' ? (
                        <button
                            onClick={() => fetchSuggestions(tier)}
                            onMouseDown={e => e.stopPropagation()}
                            disabled={!tier || loading}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed shrink-0 ${isLight ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-500 text-white hover:bg-indigo-400'}`}
                        >
                            {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                            {isHe ? 'חפש' : 'Search'}
                        </button>
                    ) : (
                        <button
                            onClick={fetchTripPlan}
                            onMouseDown={e => e.stopPropagation()}
                            disabled={!tripRequest.trim() || planLoading}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed shrink-0 ${isLight ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-violet-500 text-white hover:bg-violet-400'}`}
                        >
                            {planLoading ? <Loader2 size={13} className="animate-spin" /> : <Route size={13} />}
                            {isHe ? 'תכנן' : 'Plan'}
                        </button>
                    )}
                    <button onClick={onClose} onMouseDown={e => e.stopPropagation()} className={`p-1.5 rounded-lg transition-colors shrink-0 ${isLight ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/10 text-gray-400'}`}><X size={16} /></button>
                </div>
                {/* Mode toggle + controls */}
                <div className={`relative z-10 px-5 py-3 border-b shrink-0 space-y-3 ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                    {/* Mode tabs */}
                    <div className={`flex gap-1 p-1 rounded-xl ${isLight ? 'bg-slate-100' : 'bg-white/5'}`}>
                        <button onClick={() => setMode('plan')} className={`flex-1 py-1 rounded-lg text-xs font-semibold transition-colors ${mode === 'plan' ? (isLight ? 'bg-white shadow-sm text-violet-600' : 'bg-white/15 text-white') : (isLight ? 'text-slate-500 hover:text-slate-700' : 'text-gray-400 hover:text-gray-200')}`}>
                            {isHe ? 'תכנן נסיעה' : 'Plan a trip'}
                        </button>
                        <button onClick={() => setMode('find')} className={`flex-1 py-1 rounded-lg text-xs font-semibold transition-colors ${mode === 'find' ? (isLight ? 'bg-white shadow-sm text-indigo-600' : 'bg-white/15 text-white') : (isLight ? 'text-slate-500 hover:text-slate-700' : 'text-gray-400 hover:text-gray-200')}`}>
                            {isHe ? 'מצא יעדים' : 'Find destinations'}
                        </button>
                    </div>

                    {mode === 'find' && (<>
                        <div className="flex gap-2">
                        {Object.entries(TIER_META).map(([id, meta]) => {
                            const active = tier === id;
                            const activeClass = meta.color === 'green' ? 'bg-green-500 text-white' : meta.color === 'blue' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white';
                            return (
                                <button key={id} onClick={() => { setTier(id); setError(null); }} disabled={loading}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${active ? activeClass : isLight ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                                    {isHe ? meta.labelHe : meta.labelEn}
                                </button>
                            );
                        })}
                        </div>
                        <div className="grid grid-cols-6 gap-2">
                            <label className={`min-w-0 rounded-lg px-2.5 py-1.5 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/5 border border-white/10'}`}>
                                <span className={`block text-[10px] mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'מס׳ לילות' : 'Nights'}</span>
                                <input
                                    type="number" min="1" max="30"
                                    value={tripDaysInput}
                                    onChange={e => setTripDaysInput(e.target.value)}
                                    placeholder="30"
                                    className={`w-full bg-transparent outline-none text-sm font-semibold ${isLight ? 'text-slate-800 placeholder:text-slate-400' : 'text-white placeholder:text-gray-500'}`}
                                />
                            </label>
                            <label className={`min-w-0 rounded-lg px-2.5 py-1.5 border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                                <span className={`block text-[10px] mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                    {includeMonthlySavings ? (isHe ? 'חיסכון ימים' : 'Days savings') : (isHe ? 'תקציב' : 'Budget')}
                                </span>
                                {includeMonthlySavings ? (() => {
                                    const days = normalizeTripDays(tripDaysInput);
                                    const monthlyPart = monthlySavingsBudget * savingsMonths;
                                    const dailyPart = variableDailyCost * days;
                                    return (
                                        <div className="w-full text-right">
                                            <div className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-white'}`} dir="ltr">
                                                {fmtAmt(monthlyPart + dailyPart)}
                                            </div>
                                            <div className={`text-[9px] leading-tight mt-0.5 flex justify-end flex-wrap gap-x-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                <span dir="ltr">{fmtAmt(monthlyPart)}×{savingsMonths}{isHe ? 'ח\'' : 'mo'}</span>
                                                <span>+</span>
                                                <span dir="ltr">{fmtAmt(dailyPart)}×{days}{isHe ? 'י\'' : 'd'}</span>
                                            </div>
                                        </div>
                                    );
                                })() : (
                                    <input
                                        type="number" min="0"
                                        value={customBudget}
                                        onChange={e => setCustomBudget(e.target.value)}
                                        placeholder={fmtAmt(tripBudgetForDays(tripDaysInput))}
                                        className={`w-full bg-transparent outline-none text-sm font-semibold ${isLight ? 'text-slate-800 placeholder:text-slate-400' : 'text-white placeholder:text-gray-500'}`}
                                    />
                                )}
                            </label>
                            <button
                                type="button"
                                onClick={() => setIncludeMonthlySavings(v => !v)}
                                className={`min-w-0 rounded-lg px-2.5 py-1.5 border flex items-center justify-center gap-1.5 text-start transition-colors ${includeMonthlySavings
                                    ? (isLight ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-amber-500/15 border-amber-400/30 text-amber-200')
                                    : (isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-white/5 border-white/10 text-gray-400')}`}
                            >
                                <PiggyBank size={14} className="shrink-0" />
                                <span className="text-xs font-semibold">{isHe ? 'חיסכון' : 'Savings'}</span>
                            </button>
                            <label className={`min-w-0 rounded-lg px-2.5 py-1.5 border ${includeMonthlySavings ? (isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-400/20') : (isLight ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white/5 border-white/10 opacity-60')}`}>
                                <span className={`block text-[10px] mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'חודשים' : 'Months'}</span>
                                <input
                                    type="number" min="1" max="24"
                                    value={savingsMonths}
                                    onChange={e => setSavingsMonths(Math.max(1, parseInt(e.target.value) || 1))}
                                    onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); setSavingsMonths(v => Math.min(24, v + 1)); } else if (e.key === 'ArrowDown') { e.preventDefault(); setSavingsMonths(v => Math.max(1, v - 1)); } }}
                                    disabled={!includeMonthlySavings}
                                    className={`w-full bg-transparent outline-none text-sm font-semibold disabled:cursor-not-allowed ${isLight ? 'text-slate-800 placeholder:text-slate-400' : 'text-white placeholder:text-gray-500'}`}
                                />
                            </label>
                            <button
                                type="button"
                                onClick={() => setIncludeCarRental(v => !v)}
                                className={`min-w-0 rounded-lg px-2.5 py-1.5 border flex items-center justify-center gap-1.5 text-start transition-colors ${includeCarRental
                                    ? (isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200')
                                    : (isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-white/5 border-white/10 text-gray-400')}`}
                            >
                                <Car size={14} className="shrink-0" />
                                <span className="text-xs font-semibold">{isHe ? 'שקול רכב' : 'Consider car'}</span>
                            </button>
                            <label className={`min-w-0 rounded-lg px-2.5 py-1.5 border ${includeCarRental ? (isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-400/20') : (isLight ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white/5 border-white/10 opacity-60')}`}>
                                <span className={`block text-[10px] mb-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'ימי רכב' : 'Car days'}</span>
                                <input
                                    type="text" inputMode="numeric"
                                    value={carRentalDaysInput}
                                    onChange={e => setCarRentalDaysInput(e.target.value)}
                                    onKeyDown={e => { const max = normalizeTripDays(tripDaysInput); if (e.key === 'ArrowUp') { e.preventDefault(); setCarRentalDaysInput(v => String(Math.min(max, (parseInt(v) || 0) + 1))); } else if (e.key === 'ArrowDown') { e.preventDefault(); setCarRentalDaysInput(v => String(Math.max(1, (parseInt(v) || 1) - 1))); } }}
                                    disabled={!includeCarRental}
                                    placeholder={isHe ? 'כל התקופה' : 'Full stay'}
                                    className={`w-full bg-transparent outline-none text-sm font-semibold disabled:cursor-not-allowed ${isLight ? 'text-slate-800 placeholder:text-slate-400' : 'text-white placeholder:text-gray-500'}`}
                                />
            </label>
                        </div>
                        {(() => {
                            const toggle = id => setSelectedRegions(prev => {
                                const n = new Set(prev);
                                if (n.has(id)) {
                                    n.delete(id);
                                    const region = WORLD_REGIONS.find(r => r.id === id);
                                    region?.sub?.forEach(s => n.delete(s.id));
                                } else {
                                    n.add(id);
                                }
                                return n;
                            });
                            const parentsWithSubs = WORLD_REGIONS.filter(r => r.sub && (selectedRegions.has(r.id) || r.sub.some(s => selectedRegions.has(s.id))));
                            return (<>
                                <div className="flex flex-wrap gap-1.5">
                                    {WORLD_REGIONS.map(r => {
                                        const active = selectedRegions.has(r.id) || r.sub?.some(s => selectedRegions.has(s.id));
                                        return (
                                            <button key={r.id} type="button"
                                                onClick={() => r.id === 'all' ? setSelectedRegions(new Set()) : toggle(r.id)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${active
                                                    ? (isLight ? 'bg-indigo-600 text-white' : 'bg-indigo-500 text-white')
                                                    : (selectedRegions.size === 0 && r.id === 'all' ? (isLight ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-500/20 text-indigo-300') : (isLight ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white/5 text-gray-400 hover:bg-white/10'))}`}>
                                                {isHe ? r.he : r.en}
                                            </button>
                                        );
                                    })}
                                </div>
                                {parentsWithSubs.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {parentsWithSubs.flatMap(parent => parent.sub.map(s => (
                                            <button key={s.id} type="button"
                                                onClick={() => toggle(s.id)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${selectedRegions.has(s.id)
                                                    ? (isLight ? 'bg-violet-600 text-white' : 'bg-violet-500 text-white')
                                                    : (isLight ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white/5 text-gray-400 hover:bg-white/10')}`}>
                                                {isHe ? s.he : s.en}
                                            </button>
                                        )))}
                                    </div>
                                )}
                            </>);
                        })()}
                    </>)}

                </div>
                {/* Body */}
                <div className="relative z-10 flex flex-col flex-1 min-h-0">
                {mode === 'find' && (
                <div className="overflow-y-auto custom-scrollbar scrollbar-right flex-1">
                <div className="p-4 space-y-3">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 size={24} className={`animate-spin ${isLight ? 'text-indigo-500' : 'text-indigo-400'}`} />
                            <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'מחפש המלצות...' : 'Finding recommendations...'}</p>
                        </div>
                    )}
                    {error && <p className={`text-sm text-center py-8 ${isLight ? 'text-red-500' : 'text-red-400'}`}>{error}</p>}
                    {!parsed && !loading && !error && (
                        <div className={`text-center py-12 px-4 rounded-xl border border-dashed ${isLight ? 'border-slate-200 text-slate-500' : 'border-white/10 text-gray-400'}`}>
                            <Search size={22} className="mx-auto mb-3 opacity-60" />
                            <p className="text-sm font-semibold">{isHe ? 'בחר רמת מחיה ולחץ חפש' : 'Choose a lifestyle level and search'}</p>
                            <p className="text-xs mt-1 opacity-75">{isHe ? 'אפשר להגביל לילות/תקציב ולהוסיף שכירת רכב לפני החיפוש.' : 'You can limit nights/budget and add car rental before searching.'}</p>
                        </div>
                    )}
                    {parsed && !loading && (<>
                        {/* Budget assessment banner */}
                        {replacingLocation && (
                            <div className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 border text-xs ${isLight ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-indigo-500/10 border-indigo-400/25 text-indigo-200'}`}>
                                <Loader2 size={13} className="animate-spin" />
                                <span>{isHe ? 'מחפש יעד חלופי...' : 'Finding a replacement location...'}</span>
                            </div>
                        )}
                        {/* Location cards */}
                        {(parsed.locations || []).map((loc, i) => {
                            const open = openCard === i;
                            const palette = LOCATION_CARD_STYLES[i % LOCATION_CARD_STYLES.length];
                            const cardClass = isLight ? palette.card.light : palette.card.dark;
                            const chipClass = isLight ? palette.chip.light : palette.chip.dark;
                            const initials = countryInitials(loc);
                            const flagUrl = flagImageUrlFor(loc);
                            const tripCostView = tripBreakdownFor(loc);
                            const actualDailyCost = Math.ceil(Math.max(0, numberOrZero(userMonthlyCost)) / DEFAULT_TRIP_DAYS);
                            const withdrawalDailyCost = Math.ceil(Math.max(0, numberOrZero(withdrawalMonthlyAmount)) / DEFAULT_TRIP_DAYS);
                            const actualDailyDiff = actualDailyCost - (loc.dailyCost || 0);
                            const withdrawalDailyDiff = withdrawalDailyCost - (loc.dailyCost || 0);
                            return (
                                <div key={`${loc.city}-${i}`} className={`rounded-xl border overflow-hidden shadow-sm ${cardClass}`}>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className="w-full flex items-center gap-2 px-4 py-3 cursor-pointer"
                                        onClick={() => toggleCard(i)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                toggleCard(i);
                                            }
                                        }}
                                    >
                                        <span className={`shrink-0 rounded-full w-9 h-9 inline-flex items-center justify-center text-[11px] font-semibold leading-none tracking-normal ${chipClass}`}>
                                            {initials}
                                        </span>
                                        <div className="flex-1 flex items-baseline gap-1.5 min-w-0 overflow-hidden">
                                            <span className={`font-semibold text-sm truncate ${isLight ? 'text-slate-800' : 'text-white'}`}>{loc.city}</span>
                                            <span className={`text-xs shrink-0 inline-flex items-center gap-2 ${isLight ? 'text-slate-400' : 'text-gray-400'}`}>
                                                <span>{loc.country}</span>
                                                {flagUrl && (
                                                    <img
                                                        src={flagUrl}
                                                        alt=""
                                                        className="w-5 h-3.5 rounded-[2px] object-cover shadow-sm"
                                                        loading="lazy"
                                                    />
                                                )}
                                                {(loc.flightHours > 0 || airfareRegionFor(loc).flightHours) && (
                                                    <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`} dir="ltr">
                                                        ✈ {loc.flightHours > 0 ? `${loc.flightHours}h` : flightHoursLabel(loc)}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        <span className={`${isHe ? 'order-2' : 'order-1'} text-sm font-normal shrink-0 ${isLight ? 'text-slate-700' : 'text-white'} ${isHe ? 'text-right' : 'text-left'}`} dir={isHe ? 'rtl' : 'ltr'}>{fmtTripSummary(loc)}</span>
                                        {withdrawalDailyCost > 0 && (
                                            <span
                                                className={`${isHe ? 'order-1' : 'order-2'} shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${withdrawalDailyDiff >= 0
                                                    ? (isLight ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-green-500/15 text-green-200 border border-green-400/20')
                                                    : (isLight ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-red-500/15 text-red-200 border border-red-400/20')}`}
                                                title={isHe ? 'הפרש מול תקציב יומי לפי המשיכה החודשית' : 'Difference vs daily budget from monthly withdrawal'}
                                                dir={isHe ? 'rtl' : 'ltr'}
                                            >
                                                {withdrawalDailyDiff >= 0 ? '+' : '-'}{fmtAmt(Math.abs(withdrawalDailyDiff))}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleLocationCarRental(i);
                                            }}
                                            disabled={!loc.carRentalOriginalCost}
                                            className={`${isHe ? 'order-0' : 'order-3'} shrink-0 inline-flex items-center justify-center rounded p-0.5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed ${loc.includeCarRental
                                                ? (isLight ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-emerald-500/25 text-emerald-200 hover:bg-emerald-500/35')
                                                : (isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300')}`}
                                            title={loc.carRentalOriginalCost
                                                ? (loc.includeCarRental ? (isHe ? 'בטל שכירת רכב' : 'Remove car rental') : (isHe ? 'הוסף שכירת רכב' : 'Add car rental'))
                                                : (isHe ? 'שכירת רכב לא רלוונטית ליעד זה' : 'Car rental not relevant for this destination')}
                                            aria-label={loc.carRentalOriginalCost
                                                ? (loc.includeCarRental ? (isHe ? 'בטל שכירת רכב' : 'Remove car rental') : (isHe ? 'הוסף שכירת רכב' : 'Add car rental'))
                                                : (isHe ? 'שכירת רכב לא רלוונטית' : 'Car rental not relevant')}
                                        >
                                            <Car size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const nights = loc.monthFits ? loc.tripDays : (loc.daysAffordable || loc.tripDays);
                                                const tierHe = { cheap: 'זולה', medium: 'בינונית', expensive: 'יוקרתית' }[loc.tier] || 'בינונית';
                                                const tierEn = { cheap: 'budget', medium: 'moderate', expensive: 'premium' }[loc.tier] || 'moderate';
                                                const carHe = loc.includeCarRental ? ` עם רכב שכור ל-${loc.carRentalDays} ימים` : '';
                                                const carEn = loc.includeCarRental ? `, with rental car for ${loc.carRentalDays} days` : '';
                                                const req = isHe
                                                    ? `${nights} ימים ב${loc.city}, ${loc.country}, רמה ${tierHe}${carHe}`
                                                    : `${nights} days in ${loc.city}, ${loc.country}, ${tierEn} level${carEn}`;
                                                setTripRequest(req);
                                                setMode('plan');
                                            }}
                                            className={`${isHe ? 'order-0' : 'order-3'} shrink-0 inline-flex items-center justify-center p-0.5 transition-colors ${isLight ? 'text-violet-400 hover:text-violet-600' : 'text-violet-400 hover:text-violet-200'}`}
                                            title={isHe ? 'תכנן נסיעה ליעד זה' : 'Plan a trip to this destination'}
                                            aria-label={isHe ? 'תכנן נסיעה ליעד זה' : 'Plan a trip to this destination'}
                                        >
                                            <Route size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteLocation(i);
                                            }}
                                            disabled={replacingLocation}
                                            className={`order-4 shrink-0 inline-flex items-center justify-center p-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isLight ? 'text-slate-400 hover:text-red-600' : 'text-gray-500 hover:text-red-300'}`}
                                            title={isHe ? 'מחק יעד והבא חלופה' : 'Remove and replace location'}
                                            aria-label={isHe ? 'מחק יעד והבא חלופה' : 'Remove and replace location'}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                        {open ? <ChevronUp size={13} className={`order-5 shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`} /> : <ChevronDown size={13} className={`order-5 shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`} />}
                                    </div>
                                    {open && (
                                        <div className={`px-4 pb-3 border-t space-y-1.5 ${isLight ? 'border-slate-100' : 'border-white/10'}`}>
                                            {loc.note && <p className={`text-[11px] pt-2.5 pb-0.5 leading-relaxed ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{loc.note}</p>}
                                            {(loc.housingType || loc.housingLevel) && (
                                                <div className={`text-[11px] pt-2.5 pb-0.5 leading-relaxed ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                                    <span className="font-semibold">{isHe ? 'דיור: ' : 'Housing: '}</span>
                                                    {[loc.housingType, loc.housingLevel].filter(Boolean).join(' · ')}
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 gap-1.5 pt-1.5">
                                                <div className={`rounded-md px-2 py-1.5 ${isLight ? 'bg-white/75 ring-1 ring-white/80' : 'bg-black/15 ring-1 ring-white/10'} ${isHe ? 'text-right' : 'text-left'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'עלות ללילה' : 'Nightly cost'}</div>
                                                    <div className={`text-xs font-bold ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir={isHe ? 'rtl' : 'ltr'}>{fmtAmt(loc.dailyCost)}</div>
                                                </div>
                                                <div className={`rounded-md px-2 py-1.5 ${isLight ? 'bg-white/75 ring-1 ring-white/80' : 'bg-black/15 ring-1 ring-white/10'} ${isHe ? 'text-right' : 'text-left'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{loc.includeCarRental ? (isHe ? 'כולל טיסה ורכב' : 'Incl. flight + car') : (isHe ? 'כולל טיסה' : 'Incl. flight')}</div>
                            <div className={`text-xs font-bold ${loc.monthFits ? (isLight ? 'text-green-700' : 'text-green-300') : (isLight ? 'text-amber-700' : 'text-amber-300')}`}>
                                {loc.monthFits ? (isHe ? `${loc.tripDays} לילות נכנסים` : `${loc.tripDays} nights fit`) : (isHe ? `${loc.daysAffordable} לילות` : `${loc.daysAffordable} nights`)}
                            </div>
                            {loc.includeCarRental && (
                                <div className={`text-[10px] mt-0.5 ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                                    {isHe ? `רכב ${loc.carRentalDays} ימים` : `Car ${loc.carRentalDays} days`}
                                </div>
                            )}
                                                </div>
                                            </div>
                                            <div className={`grid grid-cols-2 gap-1.5 rounded-lg px-2 py-2 border ${isLight ? 'bg-white/65 border-white/80' : 'bg-black/10 border-white/10'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                <div className={isHe ? 'text-right' : 'text-left'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'עלות יומית יעד' : 'Destination daily'}</div>
                                                    <div className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir={isHe ? 'rtl' : 'ltr'}>{fmtAmt(loc.dailyCost)}</div>
                                                </div>
                                                <div className={isHe ? 'text-right' : 'text-left'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'הוצאה יומית שלי' : 'My actual daily'}</div>
                                                    <div className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir={isHe ? 'rtl' : 'ltr'}>{fmtAmt(actualDailyCost)}</div>
                                                </div>
                                                <div className={isHe ? 'text-right' : 'text-left'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'תקציב יומי ממשיכה' : 'Daily from withdrawal'}</div>
                                                    <div className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir={isHe ? 'rtl' : 'ltr'}>{fmtAmt(withdrawalDailyCost)}</div>
                                                </div>
                                                <div className={isHe ? 'text-right' : 'text-left'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'הפרש מול הוצאה' : 'Vs actual'}</div>
                                                    <div className={`text-xs font-semibold ${actualDailyDiff >= 0 ? (isLight ? 'text-green-700' : 'text-green-300') : (isLight ? 'text-red-600' : 'text-red-300')}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                        {actualDailyDiff >= 0 ? '+' : '-'}{fmtAmt(Math.abs(actualDailyDiff))}
                                                    </div>
                                                </div>
                                                <div className={isHe ? 'text-right' : 'text-left'}>
                                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'הפרש מול משיכה' : 'Vs withdrawal'}</div>
                                                    <div className={`text-xs font-semibold ${withdrawalDailyDiff >= 0 ? (isLight ? 'text-blue-700' : 'text-blue-300') : (isLight ? 'text-amber-700' : 'text-amber-300')}`} dir={isHe ? 'rtl' : 'ltr'}>
                                                        {withdrawalDailyDiff >= 0 ? '+' : '-'}{fmtAmt(Math.abs(withdrawalDailyDiff))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`pt-2 text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                                {isHe
                                                    ? `פירוט לתקופה: ${tripCostView.nights} לילות. כל הסכומים הם הוצאות כוללות לטיול.`
                                                    : `Trip-period breakdown: ${tripCostView.nights} nights. All amounts are total trip costs.`}
                                            </div>
                                            <div className="space-y-2 pt-1">
                                                {PLAN_COST_KEYS.map(({ key, labelHe, labelEn }) => {
                                                    const val = tripCostView.breakdown?.[key];
                                                    if (!val) return null;
                                                    const pct = loc.total > 0 ? Math.round(val / loc.total * 100) : 0;
                                                    const sourceMeta = sourceMetaForCost(loc, key);
                                                    return (
                                                        <div key={key} className="space-y-0.5">
                                                            <div className="flex items-center justify-between">
                                                                <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? labelHe : labelEn}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-[10px] tabular-nums ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{pct}%</span>
                                                                    <span className={`text-xs font-semibold tabular-nums ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir="ltr">{fmtAmt(val)}</span>
                                                                </div>
                                                            </div>
                                                            <div className={`h-1 rounded-full overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-white/10'}`}>
                                                                <div className={`h-full rounded-full ${isLight ? 'bg-violet-400' : 'bg-violet-500'}`} style={{ width: `${pct}%` }} />
                                                            </div>
                                                            {sourceMeta && (
                                                                <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                                                    {isHe ? 'מקור: ' : 'Source: '}
                                                                    {sourceMeta.url
                                                                        ? <a className="underline" href={sourceMeta.url} target="_blank" rel="noreferrer">{sourceMeta.name}</a>
                                                                        : sourceMeta.name}
                                                                    {sourceMeta.originalPrice > 0 && sourceMeta.originalCurrency && (
                                                                        <span dir="ltr"> · {sourceMeta.originalPrice.toLocaleString()} {sourceMeta.originalCurrency}</span>
                                                                    )}
                                                                    {sourceMeta.conversionRateSource && (
                                                                        <span> · {sourceMeta.conversionRateSource}{sourceMeta.conversionRateDate ? ` ${sourceMeta.conversionRateDate}` : ''}</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className={`flex items-center justify-between px-3 py-2 mt-1.5 ${isLight ? 'bg-violet-600' : 'bg-violet-600/80'}`}>
                                                <span className="text-xs font-bold text-white">
                                                    {loc.monthFits
                                                        ? (isHe ? `סה״כ ${loc.tripDays} לילות` : `${loc.tripDays} nights total`)
                                                        : (isHe ? `סה״כ ${loc.daysAffordable} לילות` : `${loc.daysAffordable} nights total`)}
                                                </span>
                                                <span className="text-sm font-black text-white tabular-nums" dir="ltr">{fmtAmt(loc.total)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </>)}
                </div>
                </div>
                )}
                {mode === 'plan' && (
                <div className="flex flex-1 min-h-0">
                {/* Left: input + saved plans */}
                <div className={`flex-1 min-w-0 border-e flex flex-col overflow-hidden p-4 gap-3 ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                    <textarea
                        value={tripRequest}
                        onChange={e => setTripRequest(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) fetchTripPlan(); }}
                        rows={3}
                        placeholder={isHe ? 'תאר את הנסיעה שלך...\nלמשל: 10 ימים בתאילנד, בנגקוק והאיים, ללא רכב, רמה בינונית' : 'Describe your trip...\ne.g., 5 days in Portugal starting in Lisbon with car, medium level'}
                        className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none border ${isLight ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-violet-400' : 'bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-violet-400'}`}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={fetchTripPlan}
                            disabled={!tripRequest.trim() || planLoading}
                            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 ${isLight ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-violet-500 text-white hover:bg-violet-400'}`}
                        >
                            {planLoading ? <Loader2 size={15} className="animate-spin" /> : <Route size={15} />}
                            {plannedTrip
                                ? (isHe ? 'חשב מחדש' : 'Recalculate')
                                : (isHe ? 'חשב עלות נסיעה' : 'Calculate trip cost')}
                        </button>
                        {plannedTrip && loadedPlanId && (() => { const lp = savedPlans.find(p => p.id === loadedPlanId); return lp && (tripRequest !== lp.request || JSON.stringify(plannedTrip) !== JSON.stringify(lp.result)); })() && (
                            <button
                                onClick={updatePlan}
                                disabled={savingPlan}
                                title={isHe ? 'עדכן תוכנית קיימת' : 'Update existing plan'}
                                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-45 inline-flex items-center gap-1.5 ${planSaved
                                    ? (isLight ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-green-500/15 text-green-300 border border-green-500/30')
                                    : (isLight ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200' : 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 border border-indigo-500/30')}`}
                            >
                                {savingPlan ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                {planSaved ? (isHe ? '✓ עודכן' : '✓ Updated') : (isHe ? 'עדכן' : 'Update')}
                            </button>
                        )}
                        {plannedTrip && (
                            <button
                                onClick={savePlan}
                                disabled={savingPlan}
                                title={isHe ? 'שמור תוכנית חדשה' : 'Save as new plan'}
                                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-45 inline-flex items-center gap-1.5 ${planSaved && !loadedPlanId
                                    ? (isLight ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-green-500/15 text-green-300 border border-green-500/30')
                                    : (isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200' : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10')}`}
                            >
                                {savingPlan ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                {isHe ? 'שמור' : 'Save'}
                            </button>
                        )}
                        {plannedTrip && (
                            <button
                                type="button"
                                onClick={() => {
                                    setTripChatOpen(open => !open);
                                    setShowSavedPlans(false);
                                }}
                                title={isHe ? 'צ׳אט על הנסיעה' : 'Chat about this trip'}
                                aria-label={isHe ? 'צ׳אט על הנסיעה' : 'Chat about this trip'}
                                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors inline-flex items-center border ${tripChatOpen
                                    ? (isLight ? 'bg-violet-100 text-violet-700 border-violet-300' : 'bg-violet-500/20 text-violet-200 border-violet-400/30')
                                    : (isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200' : 'bg-white/5 text-gray-300 hover:bg-white/10 border-white/10')}`}
                            >
                                <MessageSquare size={14} />
                            </button>
                        )}
                    </div>
                    {tripChatOpen && plannedTrip && (
                        <div className={`rounded-xl border flex-1 min-h-0 flex flex-col overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
                            <div className={`flex items-center justify-between px-4 py-2.5 border-b ${isLight ? 'border-slate-100' : 'border-white/10'}`}>
                                <div className="flex items-center gap-2">
                                    <MessageSquare size={13} className={isLight ? 'text-violet-500' : 'text-violet-300'} />
                                    <span className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                        {isHe ? 'צ׳אט על הנסיעה' : 'Trip chat'}
                                    </span>
                                </div>
                                {tripChatMessages.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTripChatMessages([]);
                                            setTripChatError(null);
                                        }}
                                        title={isHe ? 'נקה צ׳אט' : 'Clear chat'}
                                        className={`p-1 rounded transition-colors ${isLight ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-600' : 'text-gray-500 hover:bg-white/10 hover:text-gray-300'}`}
                                    >
                                        <RotateCcw size={12} />
                                    </button>
                                )}
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar scrollbar-right px-3 py-2.5 space-y-2">
                                {tripChatMessages.length === 0 && (
                                    <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-400' : 'text-gray-400'}`}>
                                        {isHe
                                            ? 'שאל על רכב, אוכל, מקומות בסביבה או בקש להוסיף המלצה לתוכנית.'
                                            : 'Ask about cars, food, nearby places, or ask to add advice to this plan.'}
                                    </p>
                                )}
                                {tripChatMessages.map((message, idx) => (
                                    <div key={`${message.role}-${idx}`} className={`flex ${message.role === 'user' ? (isHe ? 'justify-start' : 'justify-end') : (isHe ? 'justify-end' : 'justify-start')}`}>
                                        <div className={`max-w-[92%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed ${message.role === 'user'
                                            ? 'bg-violet-600 text-white'
                                            : (isLight ? 'bg-slate-100 text-slate-700' : 'bg-black/25 text-gray-200')}`}>
                                            {message.content}
                                            {message.addedToPlan && (
                                                <div className={`mt-1.5 pt-1.5 border-t text-[10px] font-semibold ${isLight ? 'border-slate-200 text-emerald-600' : 'border-white/10 text-emerald-300'}`}>
                                                    {isHe ? 'נוסף לתוכנית' : 'Added to plan'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {tripChatLoading && (
                                    <div className={`flex items-center gap-1.5 text-xs ${isLight ? 'text-slate-400' : 'text-gray-400'}`}>
                                        <Loader2 size={12} className="animate-spin" />
                                        <span>{isHe ? 'חושב...' : 'Thinking...'}</span>
                                    </div>
                                )}
                                {tripChatError && <p className={`text-xs ${isLight ? 'text-red-500' : 'text-red-300'}`}>{tripChatError}</p>}
                            </div>
                            <div className={`border-t p-2 flex items-end gap-2 ${isLight ? 'border-slate-100' : 'border-white/10'}`}>
                                <textarea
                                    value={tripChatInput}
                                    onChange={e => setTripChatInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            askTripChat();
                                        }
                                    }}
                                    rows={1}
                                    placeholder={isHe ? 'שאל שאלה...' : 'Ask a question...'}
                                    className={`flex-1 max-h-20 resize-none rounded-lg border px-2.5 py-2 text-xs outline-none ${isLight ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400' : 'bg-black/20 border-white/10 text-white placeholder:text-gray-500'}`}
                                />
                                <button
                                    type="button"
                                    onClick={askTripChat}
                                    disabled={!tripChatInput.trim() || tripChatLoading}
                                    title={isHe ? 'שלח' : 'Send'}
                                    className={`w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center transition-colors disabled:opacity-40 ${isLight ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-violet-500 text-white hover:bg-violet-400'}`}
                                >
                                    <Send size={13} />
                                </button>
                            </div>
                        </div>
                    )}
                    {!tripChatOpen && savedPlans.length > 0 && (
                        <div className={`rounded-xl border flex-1 min-h-0 flex flex-col overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
                            <button
                                type="button"
                                onClick={() => setShowSavedPlans(v => !v)}
                                className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <History size={13} className={isLight ? 'text-indigo-500' : 'text-indigo-400'} />
                                    <span className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>{isHe ? 'תוכניות שמורות' : 'Saved plans'}</span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isLight ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-500/20 text-indigo-300'}`}>{savedPlans.length}</span>
                                </div>
                                {showSavedPlans ? <ChevronUp size={13} className={isLight ? 'text-slate-400' : 'text-gray-500'} /> : <ChevronDown size={13} className={isLight ? 'text-slate-400' : 'text-gray-500'} />}
                            </button>
                            {showSavedPlans && (<div className={`border-t flex flex-col flex-1 min-h-0 ${isLight ? 'border-slate-100' : 'border-white/10'}`}>
                            <div className={`flex items-center gap-1 px-3 py-1.5 border-b flex-wrap ${isLight ? 'border-slate-100 bg-slate-50' : 'border-white/5 bg-white/3'}`}>
                                {[
                                    { key: 'price',     he: 'מחיר',  en: 'Price'    },
                                    { key: 'nights',    he: 'לילות',  en: 'Nights'   },
                                    { key: 'level',     he: 'רמה',    en: 'Level'    },
                                    { key: 'createdAt', he: 'תאריך',  en: 'Date'     },
                                ].map(({ key, he, en }) => {
                                    const active = planSort.key === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => updatePlanSort(key)}
                                            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${active ? (isLight ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-500/25 text-indigo-300') : (isLight ? 'text-slate-400 hover:bg-slate-200' : 'text-gray-500 hover:bg-white/10')}`}
                                        >
                                            {isHe ? he : en}
                                            {active && (planSort.dir === 'asc' ? <ChevronUp size={9} /> : <ChevronDown size={9} />)}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="overflow-y-auto custom-scrollbar scrollbar-right flex-1 min-h-0">
                            {(() => {
                                const LEVEL_ORDER = { cheap: 1, medium: 2, expensive: 3 };
                                return [...savedPlans].sort((a, b) => {
                                    const d = planSort.dir === 'asc' ? 1 : -1;
                                    if (planSort.key === 'price') {
                                        const at = PLAN_COST_KEYS.reduce((s, { key }) => s + Math.max(0, numberOrZero(a.result?.costs?.[key])), 0);
                                        const bt = PLAN_COST_KEYS.reduce((s, { key }) => s + Math.max(0, numberOrZero(b.result?.costs?.[key])), 0);
                                        return d * (at - bt);
                                    }
                                    if (planSort.key === 'nights') return d * ((numberOrZero(a.result?.nights) || 0) - (numberOrZero(b.result?.nights) || 0));
                                    if (planSort.key === 'level') return d * ((LEVEL_ORDER[a.result?.level] || 2) - (LEVEL_ORDER[b.result?.level] || 2));
                                    return d * ((a.savedAt || a.createdAt || 0) - (b.savedAt || b.createdAt || 0));
                                });
                            })().map(plan => {
                                const planTotal = PLAN_COST_KEYS.reduce((s, { key }) => s + Math.max(0, numberOrZero(plan.result?.costs?.[key])), 0);
                                const savedLevelMap = {
                                    cheap:     { he: 'זול',     en: 'Budget',   cls: isLight ? 'bg-green-100 text-green-700' : 'bg-green-500/20 text-green-300' },
                                    medium:    { he: 'בינוני',  en: 'Standard', cls: isLight ? 'bg-blue-100 text-blue-700'   : 'bg-blue-500/20 text-blue-300'   },
                                    expensive: { he: 'יוקרתי', en: 'Premium',  cls: isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-200' },
                                };
                                const planLevelMeta = savedLevelMap[plan.result?.level];
                                return (
                                <button
                                    key={plan.id}
                                    onClick={() => loadPlan(plan)}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors border-b last:border-0 ${plan.id === loadedPlanId
                                        ? (isLight ? 'bg-indigo-50 border-indigo-100' : 'bg-indigo-500/10 border-indigo-500/20')
                                        : (isLight ? 'hover:bg-slate-50 border-slate-100' : 'hover:bg-white/5 border-white/5')}`}
                                >
                                    {(plan.countryCodes?.length > 0 || plan.countryCode)
                                        ? <PlanFlags codes={plan.countryCodes || (plan.countryCode ? [plan.countryCode] : [])} isLight={isLight} showShape={(plan.countryCodes?.length ?? 1) === 1} />
                                        : <Route size={13} className={`shrink-0 ${isLight ? 'text-violet-500' : 'text-violet-400'}`} />}
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-semibold truncate ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                            {plan.title}
                                            {planTotal > 0 && <span className={`font-semibold ms-1 ${isLight ? 'text-violet-600' : 'text-violet-300'}`}>({fmtAmt(planTotal)})</span>}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {planLevelMeta && (
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${planLevelMeta.cls}`}>
                                                    {isHe ? planLevelMeta.he : planLevelMeta.en}
                                                </span>
                                            )}
                                            <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{plan.dateLabel}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={e => deletePlan(plan.id, e)}
                                        className={`p-1 rounded transition-colors shrink-0 ${isLight ? 'text-slate-300 hover:text-red-500' : 'text-gray-600 hover:text-red-400'}`}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </button>
                                );
                            })}
                            </div>
                        </div>
                        )}
                    </div>
                    )}
                </div>
                {/* Right: results */}
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col p-4 gap-3">
                    {planLoading && (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <Loader2 size={22} className={`animate-spin ${isLight ? 'text-violet-500' : 'text-violet-400'}`} />
                            <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'מחשב עלויות...' : 'Calculating costs...'}</p>
                        </div>
                    )}
                    {planError && <p className={`text-sm text-center py-4 ${isLight ? 'text-red-500' : 'text-red-400'}`}>{planError}</p>}
                    {!plannedTrip && !planLoading && !planError && (
                        <div className={`text-center py-10 px-4 rounded-xl border border-dashed ${isLight ? 'border-slate-200 text-slate-500' : 'border-white/10 text-gray-400'}`}>
                            <Route size={22} className="mx-auto mb-3 opacity-60" />
                            <p className="text-sm font-semibold">{isHe ? 'תאר את הנסיעה ולחץ תכנן' : 'Describe your trip and click Plan'}</p>
                            <p className="text-xs mt-1 opacity-75">{isHe ? 'ציין יעד, ימים, רמה ואם אתה צריך רכב' : 'Mention destination, days, level and whether you need a car'}</p>
                        </div>
                    )}
                    {plannedTrip && !planLoading && (() => {
                        const originalNights = Math.max(1, numberOrZero(plannedTrip.nights));
                        const nights = Math.max(1, nightsOverride ?? originalNights);
                        const nightsRatio = nights / originalNights;
                        const scaledCosts = Object.fromEntries(
                            PLAN_COST_KEYS.map(({ key }) => {
                                const v = Math.max(0, numberOrZero(plannedTrip.costs?.[key]));
                                return [key, key === 'flights' ? v : Math.round(v * nightsRatio)];
                            })
                        );
                        const daysAwaySavings = variableDailyCost * nights;
                        const tripCost = PLAN_COST_KEYS.reduce((s, { key }) => s + scaledCosts[key], 0);
                        const remaining = Math.max(0, tripCost - daysAwaySavings);
                        const monthsToSave = monthlySavingsBudget > 0 && remaining > 0
                            ? Math.ceil(remaining / monthlySavingsBudget)
                            : 0;
                        const monthlySavingsTotal = monthsToSave * monthlySavingsBudget;
                        const totalAccumulated = daysAwaySavings + monthlySavingsTotal;
                        const surplus = totalAccumulated - tripCost;
                        const levelMeta = {
                                cheap:    { he: 'זול',     en: 'Budget',   cls: isLight ? 'bg-green-100/80 text-green-700'   : 'bg-green-500/20 text-green-300'   },
                                medium:   { he: 'בינוני',  en: 'Standard', cls: isLight ? 'bg-blue-100/80 text-blue-700'     : 'bg-blue-500/20 text-blue-300'     },
                                expensive:{ he: 'יוקרתי', en: 'Premium',  cls: isLight ? 'bg-amber-100/80 text-amber-700'   : 'bg-amber-500/20 text-amber-200'   },
                            };
                            const planLevel = levelMeta[plannedTrip.level];
                        return (<>
                            {(plannedTrip.summary || plannedTrip.itinerary) && (
                                <div className={`${openSection === 'itinerary' ? 'flex-1 min-h-0 flex flex-col' : 'shrink-0'} rounded-xl border overflow-hidden ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                                    <button
                                        type="button"
                                        onClick={() => plannedTrip.itinerary && setOpenSection(v => v === 'itinerary' ? null : 'itinerary')}
                                        className={`w-full flex items-start gap-3 px-4 py-3 text-start ${plannedTrip.itinerary ? (isLight ? 'hover:bg-slate-100' : 'hover:bg-white/5') : ''} transition-colors`}
                                    >
                                        <span className="shrink-0 mt-0.5 text-base">🗺️</span>
                                        <p className={`flex-1 text-sm leading-relaxed ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                            {plannedTrip.summary}
                                        </p>
                                        {plannedTrip.itinerary && (
                                            <span className={`shrink-0 mt-1 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                                {openSection === 'itinerary'
                                                    ? <ChevronUp size={14} />
                                                    : <ChevronDown size={14} />}
                                            </span>
                                        )}
                                    </button>
                                    {openSection === 'itinerary' && plannedTrip.itinerary && (
                                        <div className={`flex-1 min-h-0 border-t px-4 py-3 space-y-3 overflow-y-auto custom-scrollbar scrollbar-right ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                                            {plannedTrip.itinerary.map((seg, i) => (
                                                <div key={i} className="space-y-0.5">
                                                    <p className={`text-[11px] font-bold ${isLight ? 'text-violet-600' : 'text-violet-300'}`}>
                                                        {seg.segment}{seg.place ? ` — ${seg.place}` : ''}
                                                    </p>
                                                    <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>{seg.plan}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            {plannedTrip.bestMonths && (
                                <div className={`rounded-xl px-4 py-2.5 border flex items-start gap-2.5 ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/25'}`}>
                                    <span className="text-base shrink-0 mt-0.5">📅</span>
                                    <div>
                                        <p className={`text-[11px] font-semibold mb-0.5 ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>{isHe ? 'תאריכים מומלצים' : 'Best time to visit'}</p>
                                        <p className={`text-xs leading-relaxed ${isLight ? 'text-amber-800' : 'text-amber-200'}`}>{plannedTrip.bestMonths}</p>
                                    </div>
                                </div>
                            )}
                            {plannedTrip.tips?.length > 0 && (
                                <div className={`${openSection === 'tips' ? 'flex-1 min-h-0 flex flex-col' : 'shrink-0'} rounded-xl border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
                                    <div className={`flex items-center gap-2 px-2 py-1.5 transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}>
                                        <button
                                            type="button"
                                            onClick={() => setOpenSection(v => v === 'tips' ? null : 'tips')}
                                            className="min-w-0 flex-1 flex items-center gap-2 px-2 py-1"
                                        >
                                            <div className="min-w-0 flex items-center gap-2">
                                                <span className="text-sm">💡</span>
                                                <span className={`text-xs font-semibold truncate ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>{isHe ? 'טיפים למסע' : 'Travel tips'}</span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-gray-400'}`}>
                                                    {tripTipSearch.trim() ? filteredTripTips.length : plannedTrip.tips.length}
                                                </span>
                                            </div>
                                        </button>
                                        {openSection === 'tips' && (
                                            <div className={`w-36 max-w-[45%] shrink-0 flex items-center gap-1.5 rounded-lg px-2 py-1 border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/10'}`}>
                                                <Search size={11} className={`shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`} />
                                                <input
                                                    type="text"
                                                    value={tripTipSearch}
                                                    onChange={e => setTripTipSearch(e.target.value)}
                                                    placeholder={isHe ? 'חפש טיפ...' : 'Search tips...'}
                                                    className={`min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-gray-400 ${isLight ? 'text-slate-700' : 'text-white'}`}
                                                    dir={isHe ? 'rtl' : 'ltr'}
                                                />
                                                {tripTipSearch && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setTripTipSearch('')}
                                                        title={isHe ? 'נקה חיפוש' : 'Clear search'}
                                                        className={isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setOpenSection(v => v === 'tips' ? null : 'tips')}
                                            aria-label={openSection === 'tips' ? (isHe ? 'סגור טיפים' : 'Close tips') : (isHe ? 'פתח טיפים' : 'Open tips')}
                                            className={`shrink-0 p-1 rounded transition-colors ${isLight ? 'text-slate-400 hover:bg-slate-100' : 'text-gray-500 hover:bg-white/10'}`}
                                        >
                                            {openSection === 'tips' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                        </button>
                                    </div>
                                    {openSection === 'tips' && (
                                        <div className={`flex-1 min-h-0 border-t divide-y overflow-y-auto custom-scrollbar scrollbar-right ${isLight ? 'border-slate-100 divide-slate-100' : 'border-white/10 divide-white/5'}`}>
                                            {filteredTripTips.map((tip, i) => {
                                                const meta = TIP_META[tip.cat] || TIP_META.other;
                                                return (
                                                    <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                                                        <span className="text-base shrink-0 mt-0.5">{meta.icon}</span>
                                                        <div className="min-w-0">
                                                            <p className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? meta.he : meta.en}</p>
                                                            <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{tip.text}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {filteredTripTips.length === 0 && (
                                                <p className={`px-4 py-4 text-xs text-center ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                                    {isHe ? 'לא נמצאו טיפים' : 'No tips found'}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className={`${openSection === 'costs' ? 'flex-1 min-h-0 flex flex-col' : 'shrink-0'} rounded-xl border overflow-hidden ${isLight ? 'bg-white border-violet-200' : 'bg-white/5 border-violet-500/25'}`}>
                                <button
                                    type="button"
                                    onClick={() => setOpenSection(v => v === 'costs' ? null : 'costs')}
                                    className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${isLight ? 'bg-violet-50 hover:bg-violet-100' : 'bg-violet-500/10 hover:bg-violet-500/15'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <PlanFlags codes={plannedTrip.countryCodes || (plannedTrip.countryCode ? [plannedTrip.countryCode] : [])} isLight={isLight} showShape={(plannedTrip.countryCodes?.length ?? 1) === 1} />
                                        <span className={`text-xs font-bold tracking-wide uppercase ${isLight ? 'text-violet-600' : 'text-violet-300'}`}>{isHe ? 'פירוט עלויות' : 'Cost breakdown'}</span>
                                        {nights > 0 && <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{nights} {isHe ? 'לילות' : 'nights'}</span>}
                                        {planLevel && (
                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${planLevel.cls}`}>
                                                {isHe ? planLevel.he : planLevel.en}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        {openSection !== 'costs' && <span className={`text-sm font-bold tabular-nums ${isLight ? 'text-violet-700' : 'text-violet-200'}`} dir="ltr">{fmtAmt(tripCost)}</span>}
                                        {openSection === 'costs'
                                            ? <ChevronUp size={14} className={isLight ? 'text-violet-400' : 'text-violet-400'} />
                                            : <ChevronDown size={14} className={isLight ? 'text-violet-400' : 'text-violet-400'} />}
                                    </div>
                                </button>
                                {openSection === 'costs' && (<div className="flex flex-col flex-1 min-h-0">
                                    <div className="flex-1 min-h-0 px-4 pt-3 pb-2 space-y-2 overflow-y-auto custom-scrollbar scrollbar-right">
                                        {PLAN_COST_KEYS.map(({ key, labelHe, labelEn }) => {
                                            const val = scaledCosts[key];
                                            if (!val) return null;
                                            const pct = tripCost > 0 ? Math.round(val / tripCost * 100) : 0;
                                            const sourceMeta = sourceMetaForCost(plannedTrip, key);
                                            return (
                                                <div key={key} className="space-y-0.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? labelHe : labelEn}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] tabular-nums ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{pct}%</span>
                                                            <span className={`text-xs font-semibold tabular-nums ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir="ltr">{fmtAmt(val)}</span>
                                                        </div>
                                                    </div>
                                                    <div className={`h-1 rounded-full overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-white/10'}`}>
                                                        <div className={`h-full rounded-full ${isLight ? 'bg-violet-400' : 'bg-violet-500'}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                    {sourceMeta && (
                                                        <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                                            {isHe ? 'מקור: ' : 'Source: '}
                                                            {sourceMeta.url
                                                                ? <a className="underline" href={sourceMeta.url} target="_blank" rel="noreferrer">{sourceMeta.name}</a>
                                                                : sourceMeta.name}
                                                            {sourceMeta.originalPrice > 0 && sourceMeta.originalCurrency && (
                                                                <span dir="ltr"> · {sourceMeta.originalPrice.toLocaleString()} {sourceMeta.originalCurrency}</span>
                                                            )}
                                                            {sourceMeta.conversionRateSource && (
                                                                <span> · {sourceMeta.conversionRateSource}{sourceMeta.conversionRateDate ? ` ${sourceMeta.conversionRateDate}` : ''}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className={`flex items-center justify-between px-4 py-3 mt-1 ${isLight ? 'bg-violet-600' : 'bg-violet-600/80'}`}>
                                        <span className="text-sm font-bold text-white">{isHe ? 'סה״כ' : 'Total'}</span>
                                        <span className="text-base font-black text-white tabular-nums" dir="ltr">{fmtAmt(tripCost)}</span>
                                    </div>
                                </div>)}
                            </div>
                            <div className={`${openSection === 'savings' ? 'flex-1 min-h-0' : 'shrink-0'} flex flex-col rounded-xl border overflow-hidden ${surplus >= 0 ? (isLight ? 'bg-green-50 border-green-200' : 'bg-green-500/10 border-green-500/25') : (isLight ? 'bg-indigo-50 border-indigo-200' : 'bg-indigo-500/10 border-indigo-500/25')}`}>
                                <button
                                    type="button"
                                    onClick={() => setOpenSection(v => v === 'savings' ? null : 'savings')}
                                    className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${surplus >= 0 ? (isLight ? 'hover:bg-green-100/80' : 'hover:bg-green-500/15') : (isLight ? 'hover:bg-indigo-100/80' : 'hover:bg-indigo-500/15')}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm">💰</span>
                                        <span className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>{isHe ? 'ניתוח חיסכון' : 'Savings analysis'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {openSection !== 'savings' && (
                                            <div className="flex items-center gap-2">
                                                {monthlySavingsBudget > 0 && monthsToSave > 0 && (
                                                    <span className={`text-xs font-bold tabular-nums ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                        {monthsToSave}{isHe ? ' חו׳' : ' mo'}
                                                    </span>
                                                )}
                                                <span className={`text-xs tabular-nums ${surplus >= 0 ? (isLight ? 'text-green-700' : 'text-green-300') : (isLight ? 'text-rose-600' : 'text-rose-300')}`} dir="ltr">
                                                    {surplus >= 0 ? '+' : ''}{fmtAmt(surplus)}
                                                </span>
                                            </div>
                                        )}
                                        {openSection === 'savings'
                                            ? <ChevronUp size={13} className={isLight ? 'text-slate-400' : 'text-gray-500'} />
                                            : <ChevronDown size={13} className={isLight ? 'text-slate-400' : 'text-gray-500'} />}
                                    </div>
                                </button>
                                {openSection === 'savings' && (
                                    <div className={`flex-1 min-h-0 border-t px-4 py-3 space-y-2 overflow-y-auto custom-scrollbar scrollbar-right ${surplus >= 0 ? (isLight ? 'border-green-200' : 'border-green-500/25') : (isLight ? 'border-indigo-200' : 'border-indigo-500/25')}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                {isHe ? `חיסכון מ-${nights} ימים` : `${nights} days saved`}
                                                {' '}<span className={`opacity-50 text-[10px]`} dir="ltr">({fmtAmt(variableDailyCost)}{isHe ? '/יום' : '/day'})</span>
                                            </span>
                                            <span className={`text-xs font-semibold tabular-nums shrink-0 ${isLight ? 'text-green-700' : 'text-green-300'}`} dir="ltr">+{fmtAmt(daysAwaySavings)}</span>
                                        </div>
                                        {monthlySavingsBudget > 0 ? (
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                    {isHe ? `חיסכון × ${monthsToSave} חודשים` : `${monthsToSave} months saving`}
                                                    {' '}<span className={`opacity-50 text-[10px]`} dir="ltr">({fmtAmt(monthlySavingsBudget)}{isHe ? '/חו׳' : '/mo'})</span>
                                                </span>
                                                <span className={`text-xs font-semibold tabular-nums shrink-0 ${isLight ? 'text-amber-700' : 'text-amber-300'}`} dir="ltr">+{fmtAmt(monthlySavingsTotal)}</span>
                                            </div>
                                        ) : (
                                            <p className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? 'הגדר חיסכון חודשי לחישוב מלא' : 'Set monthly savings for full calculation'}</p>
                                        )}
                                        <div className={`pt-2 mt-1 border-t space-y-1.5 ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'עלות הטיול' : 'Trip cost'}</span>
                                                <span className={`text-xs font-semibold tabular-nums ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir="ltr">{fmtAmt(tripCost)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'סה״כ נצבר' : 'Total accumulated'}</span>
                                                <span className={`text-xs font-semibold tabular-nums ${isLight ? 'text-slate-700' : 'text-gray-200'}`} dir="ltr">{fmtAmt(totalAccumulated)}</span>
                                            </div>
                                            <div className={`flex items-center justify-between pt-1.5 border-t ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                                                <span className={`text-sm font-bold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{isHe ? 'הפרש' : 'Difference'}</span>
                                                <span className={`text-sm font-black tabular-nums ${surplus >= 0 ? (isLight ? 'text-green-700' : 'text-green-300') : (isLight ? 'text-rose-600' : 'text-rose-300')}`} dir="ltr">
                                                    {surplus >= 0 ? '+' : ''}{fmtAmt(surplus)}
                                                </span>
                                            </div>
                                        </div>
                                        {monthlySavingsBudget > 0 && (() => {
                                            const mInput = Math.max(1, parseInt(daysFromMonthsInput) || 1);
                                            const perNight = nights > 0 ? tripCost / nights : 0;
                                            const flightCost = numberOrZero(plannedTrip.costs?.flights);
                                            const perNightVar = nights > 0 ? (tripCost - flightCost) / nights : 0;
                                            const budgetForDays = mInput * monthlySavingsBudget;
                                            const daysAffordable = perNightVar > 0
                                                ? Math.floor(Math.max(0, budgetForDays - flightCost) / perNightVar)
                                                : (perNight > 0 ? Math.floor(budgetForDays / perNight) : 0);
                                            return (
                                                <div className={`mt-2 pt-2 border-t flex items-center gap-2 ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                                                    <span className={`text-xs shrink-0 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'ב-' : 'In '}</span>
                                                    <input
                                                        type="number" min="1" max="120"
                                                        value={daysFromMonthsInput}
                                                        onChange={e => setDaysFromMonthsInput(e.target.value)}
                                                        placeholder="?"
                                                        className={`w-12 text-center text-xs font-bold rounded-lg px-1 py-1 border outline-none ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-white/10 border-white/15 text-white'}`}
                                                    />
                                                    <span className={`text-xs shrink-0 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'חודשים' : 'months'}</span>
                                                    <span className={`text-xs shrink-0 opacity-40 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>|</span>
                                                    <input
                                                        type="number" min="1" max="365"
                                                        value={nights}
                                                        onChange={e => setNightsOverride(Math.max(1, parseInt(e.target.value) || 1))}
                                                        onKeyDown={e => {
                                                            if (e.key === 'ArrowUp') { e.preventDefault(); setNightsOverride(n => Math.min(365, (n ?? nights) + 1)); }
                                                            if (e.key === 'ArrowDown') { e.preventDefault(); setNightsOverride(n => Math.max(1, (n ?? nights) - 1)); }
                                                        }}
                                                        className={`w-12 text-center text-xs font-bold rounded-lg px-1 py-1 border outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-white/10 border-white/15 text-white'}`}
                                                    />
                                                    <span className={`text-xs shrink-0 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{isHe ? 'לילות' : 'nights'}</span>
                                                    {daysFromMonthsInput && (
                                                        <span className={`text-xs font-bold ms-auto ${daysAffordable >= nights ? (isLight ? 'text-green-700' : 'text-green-300') : (isLight ? 'text-amber-700' : 'text-amber-300')}`}>
                                                            → {daysAffordable} {isHe ? 'לילות' : 'nights'}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {plannedTrip.note && (
                                            <p className={`text-[11px] pt-1 opacity-70 leading-relaxed ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>{plannedTrip.note}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>);
                    })()}
                </div>
                </div>
                )}
                </div>
            </div>
        </div>,
        document.body
    );
}

// Budget is stored globally in Firestore per user — not per-profile.
// setInputs is only called when the user explicitly clicks "adopt as income target".
export default function BudgetPlanner({ inputs, setInputs, results, t, language, isLight, aiProvider, aiModel, apiKeyOverride }) {
    const isHe = language === 'he';
    const currency = isHe ? '₪' : '$';
    // Use actual calculated net withdrawal if available (reflects withdrawal strategy), else use the manual input
    const target = Math.round(results?.initialNetWithdrawal ?? parseFloat(inputs.monthlyNetIncomeDesired) ?? 0);
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;

    const [items, setItems] = useState(() => DEFAULT_ITEMS.map(normalizeBudgetItem));
    const [householdSize, setHouseholdSize] = useState(2);
    const [showInflation, setShowInflation] = useState(false);
    const [projYears, setProjYears] = useState(5);

    // Effective annual inflation rate: use inputs if set, else country default
    const inflationRate = inputs.inflationRate > 0
        ? inputs.inflationRate / 100
        : (isHe ? 0.035 : 0.025);
    const projFactor = Math.pow(1 + inflationRate, projYears);
    const [loaded, setLoaded] = useState(false);
    const saveAllowedRef = useRef(false); // only true after successful Firestore load
    const saveTimerRef = useRef(null);
    const confirmedRef = useRef(null);   // last successfully saved snapshot
    const latestStateRef = useRef({ items, householdSize }); // always-current ref for closures
    const backupSlotsRef = useRef([]);   // in-memory mirror of Firestore backupSlots
    const pauseStateFingerprintRef = useRef(null);
    const [backups, setBackups] = useState([]);
    const [showRestore, setShowRestore] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState(null); // { type: 'restore'|'reset', backup? }
    const [openCategoryId, setOpenCategoryId] = useState(null);
    const [aiInsight, setAiInsight] = useState(null);
    const [aiInsightStale, setAiInsightStale] = useState(false);
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [showRetirementMode, setShowRetirementMode] = useState(false);
    const aiInsightRef = useRef(null);      // cached insight text (survives modal close)
    const aiInsightStaleRef = useRef(false); // mirror of aiInsightStale for use inside callbacks
    const aiStaleInitRef = useRef(false);   // true after the first post-load render
    const { dragStyle: aiDragStyle, onDragMouseDown: onAiDragMouseDown } = useDraggable(aiModalOpen);
    const [searchQuery, setSearchQuery] = useState('');
    const [showStats, setShowStats] = useState(false);
    const [showFixedVar, setShowFixedVar] = useState(false);
    const [sliderConsumed, setSliderConsumed] = useState(0);
    const currentYear = new Date().getFullYear();
    const retirementEndYear = currentYear + Math.max(0, Math.round(
        parseFloat(inputs.retirementEndAge || 90) - parseFloat(inputs.currentAge || 40)
    ));
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [yearAmounts, setYearAmounts] = useState({});
    const yearAmountsRef = useRef({});
    // Undo / redo
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const historyRef = useRef({ past: [], future: [] });
    const beforeChangeRef = useRef(null);
    const historyDebounceRef = useRef(null);
    // Copy-from dropdown
    const [copyDropdownOpen, setCopyDropdownOpen] = useState(false);
    const copyDropdownRef = useRef(null);
    const [copiedStateByYear, setCopiedStateByYear] = useState({});

    // Close copy dropdown on outside click
    useEffect(() => {
        if (!copyDropdownOpen) return;
        const handler = (e) => {
            if (copyDropdownRef.current && !copyDropdownRef.current.contains(e.target)) {
                setCopyDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [copyDropdownOpen]);

    // Keyboard navigation for years
    useEffect(() => {
        const handleKeyDown = (e) => {
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
            
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setSelectedYear(y => isHe
                    ? (y <= currentYear ? retirementEndYear : y - 1)
                    : (y >= retirementEndYear ? currentYear : y + 1));
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setSelectedYear(y => isHe
                    ? (y >= retirementEndYear ? currentYear : y + 1)
                    : (y <= currentYear ? retirementEndYear : y - 1));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isHe, currentYear, retirementEndYear]);

    // Load slider value from Firestore on login
    useEffect(() => {
        if (!uid) return;
        getUserSettings(uid).then(s => {
            if (s?.budgetSliderConsumed != null) setSliderConsumed(s.budgetSliderConsumed);
        }).catch(() => {});
    }, [uid]);

    // Debounced save of slider value to Firestore
    useEffect(() => {
        if (!uid) return;
        const t = setTimeout(() => {
            setUserSettings(uid, { budgetSliderConsumed: sliderConsumed }).catch(() => {});
        }, 800);
        return () => clearTimeout(t);
    }, [uid, sliderConsumed]);

    useEffect(() => {
        const handler = (e) => {
            if (e.detail === 'open:budgetAI')    setAiModalOpen(true);
            if (e.detail === 'open:budgetStats') setShowStats(true);
        };
        window.addEventListener('app:command', handler);
        window.addEventListener('app:budgetCommand', handler);
        return () => {
            window.removeEventListener('app:command', handler);
            window.removeEventListener('app:budgetCommand', handler);
        };
    }, []);

    // Always-current refs so closures always see latest state
    latestStateRef.current = { items, householdSize, yearAmounts };
    yearAmountsRef.current = yearAmounts;
    aiInsightStaleRef.current = aiInsightStale;

    // Derive clean display text and structured retirement adjustments from raw AI insight
    const insightText    = useMemo(() => stripRetirementJson(aiInsight), [aiInsight]);
    const retirementAdj  = useMemo(() => parseRetirementAdj(aiInsight),  [aiInsight]);

    const updateItems = useCallback((updater) => {
        setItems(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            if (!Array.isArray(next)) return next;
            return next.map(normalizeBudgetItem);
        });
    }, []);

    // History helpers — capture state before changes for undo/redo
    const prepareHistoryCapture = useCallback(() => {
        if (!beforeChangeRef.current) {
            beforeChangeRef.current = {
                items: latestStateRef.current.items,
                yearAmounts: { ...yearAmountsRef.current },
            };
        }
        clearTimeout(historyDebounceRef.current);
        historyDebounceRef.current = setTimeout(() => {
            if (beforeChangeRef.current) {
                historyRef.current.past.push(beforeChangeRef.current);
                if (historyRef.current.past.length > 50) historyRef.current.past.shift();
                historyRef.current.future = [];
                beforeChangeRef.current = null;
                setCanUndo(true);
                setCanRedo(false);
            }
        }, 1200);
    }, []);

    const pushHistoryNow = useCallback(() => {
        clearTimeout(historyDebounceRef.current);
        beforeChangeRef.current = null;
        historyRef.current.past.push({
            items: latestStateRef.current.items,
            yearAmounts: { ...yearAmountsRef.current },
        });
        if (historyRef.current.past.length > 50) historyRef.current.past.shift();
        historyRef.current.future = [];
        setCanUndo(true);
        setCanRedo(false);
    }, []);

    const handleUndo = useCallback(() => {
        clearTimeout(historyDebounceRef.current);
        beforeChangeRef.current = null;
        const { past, future } = historyRef.current;
        if (!past.length) return;
        future.push({ items: latestStateRef.current.items, yearAmounts: { ...yearAmountsRef.current } });
        const prev = past.pop();
        setItems(prev.items.map(normalizeBudgetItem));
        setYearAmounts(prev.yearAmounts || {});
        setCanUndo(past.length > 0);
        setCanRedo(true);
    }, []);

    const handleRedo = useCallback(() => {
        clearTimeout(historyDebounceRef.current);
        beforeChangeRef.current = null;
        const { past, future } = historyRef.current;
        if (!future.length) return;
        past.push({ items: latestStateRef.current.items, yearAmounts: { ...yearAmountsRef.current } });
        const next = future.pop();
        setItems(next.items.map(normalizeBudgetItem));
        setYearAmounts(next.yearAmounts || {});
        setCanUndo(true);
        setCanRedo(future.length > 0);
    }, []);

    const persistBudgetSnapshot = useCallback((withBackup = true) => {
        if (!uid || !loaded || !saveAllowedRef.current) return;

        const { items: latestItems, householdSize: latestHouseholdSize, yearAmounts: latestYearAmounts } = latestStateRef.current;
        const normalizedItems = Array.isArray(latestItems) ? latestItems.map(normalizeBudgetItem) : latestItems;
        const prev = confirmedRef.current;
        let newSlots = backupSlotsRef.current;

        if (withBackup && prev?.items?.some(i => i.enabled !== false && toMonthly(i) > 0)) {
            const isDup = newSlots[0] && JSON.stringify(newSlots[0].items) === JSON.stringify(prev.items);
            if (!isDup) {
                newSlots = [
                    {
                        items: prev.items,
                        householdSize: prev.householdSize,
                        totalMonthly: prev.items.filter(i => i.enabled !== false).reduce((s, i) => s + toMonthly(i), 0),
                        savedAt: prev.savedAt
                    },
                    ...newSlots,
                ].slice(0, MAX_BACKUP_SLOTS);
            }
        }

        const snap = { items: normalizedItems, householdSize: latestHouseholdSize, savedAt: Date.now() };
        setBudgetItems(uid, normalizedItems, latestHouseholdSize, withBackup ? newSlots : undefined, latestYearAmounts || {})
            .then(() => {
                confirmedRef.current = snap;
                if (withBackup) {
                    backupSlotsRef.current = newSlots;
                    setBackups(newSlots);
                }
            })
            .catch(err => console.error('[Budget save]', err));
    }, [uid, loaded]);

    // Listen for confirmed reminders and remove them from items
    useEffect(() => {
        const handler = (e) => {
            const { id } = e.detail;
            window.__rc_handling_reminder_confirm = id;
            updateItems(prev => prev.map(i => i.id === id ? { ...i, reminder: undefined } : i));
            setTimeout(() => {
                if (window.__rc_handling_reminder_confirm === id) {
                    window.__rc_handling_reminder_confirm = null;
                }
            }, 1000);
        };
        window.addEventListener('rc-reminder-confirmed', handler);
        return () => window.removeEventListener('rc-reminder-confirmed', handler);
    }, [updateItems]);

    // Handle incoming navigation to a specific budget item
    useEffect(() => {
        const handleScroll = (e) => {
            const { id } = e.detail;
            const state = latestStateRef.current;
            const item = state.items.find(i => i.id === id || (i.tracks && i.tracks.some(tr => tr.id === id)));
            if (item) {
                // Ensure the category is open
                setOpenCategoryId(item.categoryId);
                
                // Allow time for the category to render and expand if it was closed
                setTimeout(() => {
                    const el = document.getElementById(`budget-item-${item.id}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        const oldBg = el.style.backgroundColor;
                        const oldTransition = el.style.transition;
                        el.style.transition = 'background-color 0.5s';
                        el.style.backgroundColor = 'rgba(234, 179, 8, 0.3)'; // Highlight with yellow for 2s
                        setTimeout(() => {
                            el.style.backgroundColor = oldBg;
                            setTimeout(() => { el.style.transition = oldTransition; }, 500);
                        }, 2000);
                    }
                }, 100);
            }
        };
        window.addEventListener('rc-scroll-to-budget-item', handleScroll);
        return () => window.removeEventListener('rc-scroll-to-budget-item', handleScroll);
    }, []);



    const pauseStateFingerprint = useMemo(
        () => items
            .map(i => `${i.id}:${i.enabled === false ? '0' : '1'}:${i.reminder?.date || ''}:${i.pausedReminder?.date || ''}`)
            .join('|'),
        [items]
    );

    // Helper to calculate continuous item values dynamically from currentYear to targetYear
    const getResolvedItemsForYear = useCallback((targetYear) => {
        let result = [];
        if (targetYear <= currentYear) {
            const yearData = yearAmounts[targetYear] || {};
            result = items.map(item => {
                if (item.type === 'loan') {
                    const filteredTracks = (item.tracks || []).filter(tr => trackActiveInYear(tr, targetYear));
                    return { ...item, tracks: filteredTracks };
                }
                const override = yearData[item.id];
                if (override) return { ...item, ...override };
                return item;
            });
        } else {
            let prevYearItems = items.map(item => {
                if (item.type === 'loan') {
                    const filteredTracks = (item.tracks || []).filter(tr => trackActiveInYear(tr, currentYear));
                    return { ...item, tracks: filteredTracks };
                }
                const override = yearAmounts[currentYear]?.[item.id];
                return override ? { ...item, ...override } : item;
            });

            for (let y = currentYear + 1; y <= targetYear; y++) {
                const categoryTotals = {};
                prevYearItems.forEach(item => {
                    if (item.enabled !== false && item.type !== 'loan') {
                        categoryTotals[item.categoryId] = (categoryTotals[item.categoryId] || 0) + (item.frequency === 'annual' ? item.amount / 12 : item.amount);
                    }
                });

                const currentYearItems = prevYearItems.map((prevItem, idx) => {
                    const baseItem = items[idx];
                    if (baseItem.type === 'loan') {
                        const filteredTracks = (baseItem.tracks || []).filter(tr => trackActiveInYear(tr, y));
                        return { ...baseItem, tracks: filteredTracks };
                    }

                    let nextItem = { ...prevItem };
                    
                    if (baseItem.isContinuous) {
                        if (baseItem.endYear && y > baseItem.endYear) {
                            nextItem.amount = 0;
                        } else {
                            let growth = 0;
                            if (baseItem.growthType === 'fixed') {
                                growth = baseItem.growthValue || 0;
                            } else if (baseItem.growthType === 'percent') {
                                growth = prevItem.amount * ((baseItem.growthValue || 0) / 100);
                            } else if (baseItem.growthType === 'categoryPercent') {
                                const catTotalMonthly = categoryTotals[baseItem.categoryId] || 0;
                                const catTotalForFreq = nextItem.frequency === 'annual' ? catTotalMonthly * 12 : catTotalMonthly;
                                growth = catTotalForFreq * ((baseItem.growthValue || 0) / 100);
                            }
                            nextItem.amount = Math.round(prevItem.amount + growth);
                        }
                    }

                    const override = yearAmounts[y]?.[baseItem.id];
                    if (override) {
                        if (baseItem.isContinuous) {
                            const { amount, frequency, ...restOverride } = override;
                            nextItem = { ...nextItem, ...restOverride };
                        } else {
                            nextItem = { ...nextItem, ...override };
                        }
                    }

                    return nextItem;
                });
                prevYearItems = currentYearItems;
            }
            result = prevYearItems;
        }

        return result.filter(item => {
            const baseItem = items.find(i => i.id === item.id);
            if (!baseItem) return true;
            if (baseItem.type === 'loan' && (baseItem.tracks || []).length > 0 && (item.tracks || []).length === 0) return false;
            if (baseItem.isContinuous && baseItem.endYear && targetYear > baseItem.endYear) return false;
            return true;
        });
    }, [items, yearAmounts, currentYear]);

    // Per-year display items: base items with yearAmounts[selectedYear] overrides and loan tracks filtered by year
    const displayItems = useMemo(() => getResolvedItemsForYear(selectedYear), [selectedYear, getResolvedItemsForYear]);

    const searchResults = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return null;
        return displayItems.filter(item => {
            const hay = [
                item.label,
                ...(item.tracks || []).map(tr => tr.label),
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [searchQuery, displayItems]);

    useEffect(() => {
        pauseStateFingerprintRef.current = null;
    }, [uid]);

    // Load from Firestore on mount
    useEffect(() => {
        if (!uid) return;
        getBudgetItems(uid).then(saved => {
            let loadedItems = null;
            let loadedHouseholdSize = 2;
            let loadedYearAmounts = null;
            if (saved) {
                if (Array.isArray(saved)) { loadedItems = saved; } // legacy format
                else {
                    if (Array.isArray(saved.items)) loadedItems = saved.items;
                    if (saved.householdSize) loadedHouseholdSize = saved.householdSize;
                    if (saved.yearAmounts && typeof saved.yearAmounts === 'object') loadedYearAmounts = saved.yearAmounts;
                }
            }
            if (loadedItems) {
                let normalizedLoadedItems = loadedItems.map(normalizeBudgetItem);
                const slots = Array.isArray(saved?.backupSlots) ? saved.backupSlots : [];

                // Inject any DEFAULT_ITEMS missing from saved data (e.g. newly added defaults).
                // Each missing item is inserted after the last existing item of the same category.
                const loadedIds = new Set(normalizedLoadedItems.map(i => i.id));
                const missingDefaults = DEFAULT_ITEMS
                    .filter(d => !loadedIds.has(d.id))
                    .map(normalizeBudgetItem);
                if (missingDefaults.length > 0) {
                    const merged = [...normalizedLoadedItems];
                    missingDefaults.forEach(missing => {
                        let insertAt = merged.length;
                        for (let i = merged.length - 1; i >= 0; i--) {
                            if (merged[i].categoryId === missing.categoryId) { insertAt = i + 1; break; }
                        }
                        merged.splice(insertAt, 0, missing);
                    });
                    normalizedLoadedItems = merged;
                    setBudgetItems(uid, normalizedLoadedItems, loadedHouseholdSize, slots)
                        .catch(err => console.error('[Budget defaults injection]', err));
                } else if (JSON.stringify(normalizedLoadedItems) !== JSON.stringify(loadedItems)) {
                    setBudgetItems(uid, normalizedLoadedItems, loadedHouseholdSize, slots)
                        .catch(err => console.error('[Budget status migration]', err));
                }

                setItems(normalizedLoadedItems);
                setHouseholdSize(loadedHouseholdSize);
                if (loadedYearAmounts) {
                    setYearAmounts(loadedYearAmounts);
                    yearAmountsRef.current = loadedYearAmounts;
                }
                confirmedRef.current = { items: normalizedLoadedItems, householdSize: loadedHouseholdSize, savedAt: Date.now() };
                backupSlotsRef.current = slots;
                setBackups(slots);
            }
            saveAllowedRef.current = true;
            setLoaded(true);
        }).catch(err => {
            console.error('[Budget load error]', err);
            // Do NOT allow saves if load failed — prevents overwriting Firestore with DEFAULT_ITEMS
            setLoaded(true);
        });
    }, [uid]);

    // Load AI insight from its own dedicated Firestore document — completely isolated from budget items
    useEffect(() => {
        if (!uid) return;
        aiStaleInitRef.current = false; // reset so the stale effect skips the first post-load fire
        getBudgetAiInsight(uid).then(saved => {
            if (saved?.insight) {
                aiInsightRef.current = saved.insight;
                setAiInsight(saved.insight);
                setAiInsightStale(false);
            }
        }).catch(err => console.error('[Budget AI insight load error]', err));
    }, [uid]);

    // Persist pause/unpause state immediately so it survives quick logout/login cycles.
    useEffect(() => {
        if (!uid || !loaded || !saveAllowedRef.current) return;
        if (pauseStateFingerprintRef.current === null) {
            pauseStateFingerprintRef.current = pauseStateFingerprint;
            return;
        }
        if (pauseStateFingerprintRef.current === pauseStateFingerprint) return;

        pauseStateFingerprintRef.current = pauseStateFingerprint;
        clearTimeout(saveTimerRef.current);
        persistBudgetSnapshot(false);
    }, [uid, loaded, pauseStateFingerprint, persistBudgetSnapshot]);

    // Debounced save to Firestore whenever items or yearAmounts change (after initial load)
    useEffect(() => {
        if (!uid || !loaded || !saveAllowedRef.current) return;
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            persistBudgetSnapshot(true);
        }, SAVE_DEBOUNCE_MS);
        return () => clearTimeout(saveTimerRef.current);
    }, [uid, items, householdSize, yearAmounts, loaded, persistBudgetSnapshot]);

    // Mark AI insight as stale when items, householdSize, or the calculator profile changes after initial load
    useEffect(() => {
        if (!loaded) return;
        if (!aiStaleInitRef.current) { aiStaleInitRef.current = true; return; } // skip the load-triggered fire
        if (aiInsightRef.current) setAiInsightStale(true);
    }, [items, householdSize, results, loaded]);

    // Keep sessionStorage in sync so AI chat and AI insights can read the budget
    useEffect(() => {
        if (!loaded) return;
        try {
            const monthlyBase = displayItems.filter(i => i.enabled !== false).reduce((s, i) => s + toMonthly(i), 0);
            const retDelta = showRetirementMode && retirementAdj
                ? (retirementAdj.additions || []).reduce((s, a) => s + (a.monthlyAmount || 0), 0)
                  + (retirementAdj.increases || []).reduce((s, inc) => {
                      const matched = displayItems.filter(i => i.enabled !== false).some(i => matchIncrease(i.label, inc.itemLabel));
                      return s + (matched ? (inc.increaseAmount || 0) : 0);
                  }, 0)
                : 0;
            const monthly = monthlyBase + retDelta;
            const incomeTarget = Math.round(results?.initialNetWithdrawal ?? parseFloat(inputs.monthlyNetIncomeDesired) ?? 0);
            const perPerson = householdSize > 0 ? Math.round(monthly / householdSize) : 0;

            const SCALABLE_CATS = new Set(['food', 'health', 'personal', 'family', 'entertainment']);
            const categories = CATEGORIES.map(cat => {
                const catItems = displayItems.filter(i => i.categoryId === cat.id && i.enabled !== false && toMonthly(i) > 0);
                const catTotal = Math.round(catItems.reduce((s, i) => s + toMonthly(i), 0));
                return {
                    labelHe: cat.labelHe,
                    labelEn: cat.labelEn,
                    total: catTotal,
                    perPerson: householdSize > 0 ? Math.round(catTotal / householdSize) : null,
                    scalesWithPeople: SCALABLE_CATS.has(cat.id),
                    empty: catItems.length === 0,
                    items: catItems.map(i => ({
                        label: i.label,
                        amount: Math.round(toMonthly(i)),
                        ...(i.type === 'maintenance-calc' && i.calcInputs ? { note: 'חושב ממחשבון תחזוקה', calcInputs: i.calcInputs } : {}),
                    })),
                };
            });

            const loanTracks = displayItems.filter(i => i.type === 'loan' && i.enabled !== false)
                .flatMap(i => (i.tracks || []).filter(tr => tr.endDate && tr.amount > 0).map(tr => {
                    const [y, m] = tr.endDate.split('-').map(Number);
                    const ml = y * 12 + (m - 1) - getNowYM();
                    return { loan: i.label, track: tr.label, amount: tr.amount, endDate: tr.endDate, monthsLeft: ml, active: ml >= 0 };
                }));

            const projectedMonthly = displayItems.filter(i => i.enabled !== false).reduce((s, i) => s + toProjectedMonthly(i, projFactor, projYears), 0);

            sessionStorage.setItem('rc-budget-summary', JSON.stringify({
                totalMonthly: Math.round(monthly),
                totalAnnual: Math.round(monthly * 12),
                incomeTarget,
                gap: Math.round(incomeTarget - monthly),
                householdSize,
                perPerson,
                selectedYear,
                categories,
                loanTracks: loanTracks.length ? loanTracks : undefined,
                inflation: showInflation ? {
                    rate: inflationRate,
                    years: projYears,
                    projectedMonthly: Math.round(projectedMonthly),
                    projectedAnnual: Math.round(projectedMonthly * 12),
                } : undefined,
            }));
            window.dispatchEvent(new Event('rc-budget-updated'));
        } catch {}
    }, [displayItems, loaded, inputs.monthlyNetIncomeDesired, results, householdSize, showInflation, inflationRate, projFactor, projYears, showRetirementMode, retirementAdj, selectedYear]);

    // Keep budget reminders in sync immediately from local state (before DB debounce/save).
    useEffect(() => {
        if (!loaded) return;
        const budgetReminders = items
            .filter(i => i?.enabled !== false && i?.reminder?.date)
            .map(i => ({
                id: String(i.id),
                label: i.label || i.title || i.id,
                reminder: { date: i.reminder.date, text: i.reminder.text || '' }
            }));
        syncComponentReminders('budget', budgetReminders, true);
    }, [items, loaded]);

    // totalMonthly must be declared before any callbacks that reference it
    const totalMonthlyBase = useMemo(
        () => displayItems.filter(i => i.enabled !== false).reduce((s, i) => s + toMonthly(i), 0),
        [displayItems]
    );
    const retirementDeltaTotal = useMemo(() => {
        if (!showRetirementMode || !retirementAdj) return 0;
        const additions = (retirementAdj.additions || []).reduce((s, a) => s + (a.monthlyAmount || 0), 0);
        const increases = (retirementAdj.increases || []).reduce((s, inc) => {
            // only count increase if there's a matching enabled item
            const matched = displayItems.filter(i => i.enabled !== false).some(i => matchIncrease(i.label, inc.itemLabel));
            return s + (matched ? (inc.increaseAmount || 0) : 0);
        }, 0);
        return additions + increases;
    }, [showRetirementMode, retirementAdj, displayItems]);
    const totalMonthly = showRetirementMode ? totalMonthlyBase + retirementDeltaTotal : totalMonthlyBase;
    const fullMonthly = useMemo(
        () => displayItems.reduce((s, i) => s + toMonthly(i), 0),
        [displayItems]
    );
    const pausedMonthly = fullMonthly - totalMonthly;
    const totalProjectedMonthly = useMemo(
        () => displayItems.filter(i => i.enabled !== false).reduce((s, i) => s + toProjectedMonthly(i, projFactor, projYears), 0),
        [displayItems, projFactor, projYears]
    );


    const visibleCategories = useMemo(() => {
        const allCategoryIds = CATEGORIES.map(c => c.id);
        const customCategoryIds = [...new Set(
            items.filter(i => !allCategoryIds.includes(i.categoryId)).map(i => i.categoryId)
        )];
        const all = [
            ...CATEGORIES,
            ...customCategoryIds.map(id => ({ id, icon: '📋', labelHe: id, labelEn: id })),
        ];
        // Fully-disabled categories sink to the bottom; within each group sort by enabled monthly cost desc
        return all.sort((a, b) => {
            const catItemsA = displayItems.filter(i => i.categoryId === a.id);
            const catItemsB = displayItems.filter(i => i.categoryId === b.id);
            const allOffA = catItemsA.length > 0 && catItemsA.every(i => i.enabled === false);
            const allOffB = catItemsB.length > 0 && catItemsB.every(i => i.enabled === false);
            if (allOffA !== allOffB) return allOffA ? 1 : -1;
            const totalA = catItemsA.filter(i => i.enabled !== false).reduce((s, i) => s + toMonthly(i), 0);
            const totalB = catItemsB.filter(i => i.enabled !== false).reduce((s, i) => s + toMonthly(i), 0);
            return totalB - totalA;
        });
    }, [items, displayItems]);

    const applyStatusItemsWithImmediateSave = useCallback((nextItems) => {
        const normalizedNextItems = Array.isArray(nextItems) ? nextItems.map(normalizeBudgetItem) : [];
        setItems(normalizedNextItems);
        const { householdSize: nextHouseholdSize, yearAmounts: nextYearAmounts } = latestStateRef.current;
        latestStateRef.current = { items: normalizedNextItems, householdSize: nextHouseholdSize, yearAmounts: nextYearAmounts };

        if (!uid || !loaded || !saveAllowedRef.current) return;
        clearTimeout(saveTimerRef.current);
        setBudgetItems(uid, normalizedNextItems, nextHouseholdSize, undefined, nextYearAmounts || {})
            .then(() => {
                confirmedRef.current = { items: normalizedNextItems, householdSize: nextHouseholdSize, savedAt: Date.now() };
            })
            .catch(err => console.error('[Budget status immediate save]', err));
    }, [uid, loaded]);

    const handleChangeItem = useCallback((updated) => {
        const isLoan = updated.type === 'loan';
        const hasAmountOrFreq = 'amount' in updated || 'frequency' in updated;
        const baseItem = latestStateRef.current.items.find(i => i.id === updated.id);

        if (!isLoan && hasAmountOrFreq && !baseItem?.isContinuous) {
            // Store amount/frequency as a per-year override
            const currentOverride = yearAmountsRef.current[selectedYear]?.[updated.id] || {};
            prepareHistoryCapture();
            setYearAmounts(prev => ({
                ...prev,
                [selectedYear]: {
                    ...(prev[selectedYear] || {}),
                    [updated.id]: {
                        amount: 'amount' in updated ? (updated.amount ?? 0) : (currentOverride.amount ?? baseItem?.amount ?? 0),
                        frequency: 'frequency' in updated ? (updated.frequency ?? 'monthly') : (currentOverride.frequency ?? baseItem?.frequency ?? 'monthly'),
                    }
                }
            }));
            // Update structural fields only (strip amount/frequency so items stays as template)
            const { amount: _a, frequency: _f, ...withoutAmounts } = updated;
            if (Object.keys(withoutAmounts).length > 1) { // more than just 'id'
                updateItems(prev => prev.map(i => i.id === updated.id ? mergeBudgetItemUpdate(i, withoutAmounts) : i));
            }
        } else {
            // Loan items or pure structural changes → update items directly
            prepareHistoryCapture();
            updateItems(prev => prev.map(i => i.id === updated.id ? mergeBudgetItemUpdate(i, updated) : i));
        }
    }, [updateItems, selectedYear, prepareHistoryCapture]);

    const handleToggleItemEnabled = useCallback((itemId, nextEnabled) => {
        const currentItems = Array.isArray(latestStateRef.current.items) ? latestStateRef.current.items : [];
        const nextItems = currentItems.map(i => String(i.id) === String(itemId) ? withReminderPausedState(i, nextEnabled) : i);
        applyStatusItemsWithImmediateSave(nextItems);
    }, [applyStatusItemsWithImmediateSave]);

    const handleDeleteItem = useCallback((id) => {
        pushHistoryNow();
        updateItems(prev => prev.filter(i => i.id !== id));
        setYearAmounts(prev => {
            const next = {};
            for (const [yr, amounts] of Object.entries(prev)) {
                const { [id]: _removed, ...rest } = amounts;
                next[yr] = rest;
            }
            return next;
        });
    }, [updateItems, pushHistoryNow]);

    const handleAddItem = useCallback((categoryId) => {
        pushHistoryNow();
        const newItem = { id: genId(), categoryId, label: t('budgetNewItem'), amount: 0, frequency: 'monthly', enabled: true };
        updateItems(prev => [...prev, newItem]);
    }, [updateItems, t, pushHistoryNow]);

    const handleAddLoanItem = useCallback((categoryId) => {
        pushHistoryNow();
        const firstTrack = { id: genId(), label: t('budgetTrack'), amount: 0, endDate: '' };
        const newItem = { id: genId(), categoryId, label: t('budgetAddLoan'), type: 'loan', tracks: [firstTrack], enabled: true };
        updateItems(prev => [...prev, newItem]);
        setOpenCategoryId(categoryId);
    }, [updateItems, t, pushHistoryNow]);

    const handleAddMaintenanceItem = useCallback((categoryId) => {
        pushHistoryNow();
        const newItem = { id: genId(), categoryId, label: isHe ? 'תחזוקת דירה' : 'Home Maintenance', type: 'maintenance-calc', amount: 0, frequency: 'annual', enabled: true };
        updateItems(prev => [...prev, newItem]);
        setOpenCategoryId(categoryId);
    }, [updateItems, isHe, pushHistoryNow]);

    const handleRestore = useCallback((backup) => {
        setPendingConfirm({ type: 'restore', backup });
    }, []);

    const handleConfirmAction = useCallback(() => {
        if (!pendingConfirm) return;
        pushHistoryNow();
        if (pendingConfirm.type === 'restore') {
            const { backup } = pendingConfirm;
            if (Array.isArray(backup.items)) setItems(backup.items.map(normalizeBudgetItem));
            if (backup.householdSize) setHouseholdSize(backup.householdSize);
            setShowRestore(false);
        } else if (pendingConfirm.type === 'reset') {
            updateItems(DEFAULT_ITEMS);
            setAiInsight(null);
            aiInsightRef.current = null;
            setAiInsightStale(false);
            if (uid) setBudgetAiInsight(uid, null).catch(err => console.error('[Budget AI insight reset error]', err));
        }
        setPendingConfirm(null);
    }, [pendingConfirm, updateItems, uid, pushHistoryNow]);

    const handleAddCategory = useCallback(() => {
        const name = prompt(t('budgetCategoryName'));
        if (!name?.trim()) return;
        const catId = name.trim().toLowerCase().replace(/\s+/g, '-');
        const newItem = { id: genId(), categoryId: catId, label: t('budgetNewItem'), amount: 0, frequency: 'monthly', enabled: true };
        updateItems(prev => [...prev, newItem]);
    }, [updateItems, t]);

    const handleAdoptAsTarget = useCallback(() => {
        setInputs(prev => ({ ...prev, monthlyNetIncomeDesired: Math.round(totalMonthly) }));
    }, [setInputs, totalMonthly]);

    const handleToggleCategoryItems = useCallback((categoryId) => {
        const currentItems = Array.isArray(latestStateRef.current.items) ? latestStateRef.current.items : [];
            const catItems = currentItems.filter(i => i.categoryId === categoryId);
            const allEnabled = catItems.every(i => i.enabled !== false);
            // If all enabled → disable all; otherwise → enable all
            const nextItems = currentItems.map(i => i.categoryId === categoryId ? withReminderPausedState(i, !allEnabled) : i);
            applyStatusItemsWithImmediateSave(nextItems);
    }, [applyStatusItemsWithImmediateSave]);

    const handleReset = useCallback(() => {
        setPendingConfirm({ type: 'reset' });
    }, []);

    const handleAiInsight = useCallback(async () => {
        if (!aiProvider || !aiModel) return;

        setAiModalOpen(true);
        if (aiInsightRef.current && !aiInsightStaleRef.current) return; // cached and data unchanged — show as-is

        setAiLoading(true);
        setAiError(null);
        try {
            const cur = isHe ? '₪' : '$';
            // Categories whose total scales with number of people
            const SCALABLE_CATS = new Set(['food', 'health', 'personal', 'family', 'entertainment']);
            const catLabels = Object.fromEntries(CATEGORIES.map(c => [c.id, isHe ? c.labelHe : c.labelEn]));

            const emptyCatNames = [];
            const lines = CATEGORIES.map(cat => {
                const catItems = displayItems.filter(i => i.categoryId === cat.id && i.enabled !== false);
                const activeItems = catItems.filter(i => {
                    if (i.type === 'loan') return (i.tracks || []).some(tr => !tr.endDate || parseInt(tr.endDate.split('-')[0]) >= selectedYear);
                    return i.amount > 0;
                });
                if (!activeItems.length) {
                    emptyCatNames.push(catLabels[cat.id] || cat.id);
                    return null;
                }
                const catTotal = activeItems.reduce((s, i) => s + toMonthly(i), 0);
                const catPerPerson = householdSize > 0 ? Math.round(catTotal / householdSize) : 0;
                const scaleTag = SCALABLE_CATS.has(cat.id)
                    ? (isHe ? ` | ${cur}${catPerPerson}/נפש [משתנה לפי נפשות]` : ` | ${cur}${catPerPerson}/person [scales with people]`)
                    : (isHe ? ` [קבועה — לא תלויה בנפשות]` : ` [fixed — doesn't scale]`);
                const itemLines = activeItems.map(i => {
                    if (i.type === 'loan') {
                        const allTracks = (i.tracks || []);
                        const trackLines = allTracks.map(tr => {
                            const active = trackActive(tr);
                            const ml = tr.endDate ? (() => { const [y, m] = tr.endDate.split('-').map(Number); return y * 12 + (m - 1) - getNowYM(); })() : null;
                            const status = !tr.endDate ? (isHe ? 'ללא תאריך סיום' : 'no end date')
                                : active ? (isHe ? `נגמר בעוד ${ml} חודשים (${tr.endDate})` : `ends in ${ml}mo (${tr.endDate})`)
                                : (isHe ? `הסתיים (${tr.endDate})` : `expired (${tr.endDate})`);
                            return `    · ${tr.label}: ${cur}${tr.amount}/mo — ${status}`;
                        }).join('\n');
                        return `  - ${i.label} (loan) ${cur}${Math.round(toMonthly(i))}/mo:\n${trackLines}`;
                    }
                    const suffix = i.type === 'maintenance-calc' && i.calcInputs
                        ? (isHe ? ' [חושב ממחשבון תחזוקה]' : ' [from maintenance calculator]')
                        : '';
                    return `  - ${i.label}: ${cur}${Math.round(toMonthly(i))}/mo${suffix}`;
                }).join('\n');
                return `${catLabels[cat.id] || cat.id} (${cur}${Math.round(catTotal)}/mo${scaleTag}):\n${itemLines}`;
            }).filter(Boolean).join('\n');

            const missingSection = emptyCatNames.length
                ? (isHe
                    ? `\nקטגוריות ריקות (₪0 — ייתכן שחסרות הוצאות): ${emptyCatNames.join(', ')}`
                    : `\nEmpty categories (₪0 — possibly missing expenses): ${emptyCatNames.join(', ')}`)
                : '';

            // Build a summary of future savings from expiring loan tracks (from all years, not filtered)
            const futureSavings = items.filter(i => i.type === 'loan' && i.enabled !== false)
                .flatMap(i => (i.tracks || []).filter(tr => tr.endDate && trackActive(tr) && tr.amount > 0)
                    .map(tr => {
                        const [y, m] = tr.endDate.split('-').map(Number);
                        const ml = y * 12 + (m - 1) - getNowYM();
                        return isHe
                            ? `- "${tr.label}" של "${i.label}": ${cur}${tr.amount}/חודש יסתיים בעוד ${ml} חודשים (${tr.endDate})`
                            : `- "${tr.label}" of "${i.label}": ${cur}${tr.amount}/mo ends in ${ml} months (${tr.endDate})`;
                    })
                );

            const futureSavingsSection = futureSavings.length
                ? (isHe
                    ? `\nשינויים עתידיים בהוצאות (מסלולי הלוואה שייגמרו):\n${futureSavings.join('\n')}`
                    : `\nFuture expense reductions (loan tracks ending):\n${futureSavings.join('\n')}`)
                : '';

            const perPerson = householdSize > 0 ? Math.round(totalMonthly / householdSize) : 0;

            const retirementAge = parseFloat(inputs.retirementStartAge) || 67;
            const retirementEndAge = parseFloat(inputs.retirementEndAge) || 90;
            const currentAge    = parseFloat(inputs.currentAge) || 0;
            const isPreRetirement = currentAge < retirementAge;
            const NI_PENSION_AGE = 67;
            const isRetirementBeforeNI = retirementAge < NI_PENSION_AGE;

            const systemPrompt = isHe
                ? `אתה יועץ פיננסי בכיר המתמחה בתכנון פרישה בישראל. נתח את תקציב ההוצאות החודשי. המשתמש הזין ${householdSize} נפש/ות. הוצאה לנפש: ${cur}${perPerson.toLocaleString()}/חודש.

**מבנה התשובה הנדרש (עד 400 מילה):**

⚠️ התראות לפי נפשות:
עבור כל קטגוריה המסומנת [משתנה לפי נפשות] — בדוק אם הסכום לנפש הגיוני. ציין במפורש: גבוה מדי / נמוך מדי / סביר, עם הסבר קצר. עבור קטגוריות [קבועות] — בדוק אם הסכום הכולל הגיוני ללא תלות בנפשות.

➕ הוצאות חסרות:
סקור את הקטגוריות הריקות שצוינו. ציין אילו מהן כנראה חסרות הוצאות אמיתיות (לפי גיל פרישה ומשפחה ישראלית), ואת ההוצאה הצפויה הממוצעת. גם הצע הוצאות שאינן ברשימה כלל אך חשובות לגיל זה.
${isPreRetirement ? `
🔮 שינויים בהוצאות בפרישה:
התקציב הנוכחי הוא לפני גיל פרישה (${retirementAge}). המשתמש מתכוון להפסיק לעבוד בגיל ${retirementAge} ולחיות מחסכונות עד גיל ${retirementEndAge}.
${isRetirementBeforeNI ? `
⚠️ שים לב: גיל הפרישה (${retirementAge}) הוא לפני גיל הזכאות לפנסיה/ביטוח לאומי (67). לכן יש להבחין בין שתי תקופות:

תקופה א' — מגיל ${retirementAge} עד גיל 67 (לפני גמלאות):
המשתמש מוגדר כ"מי שאינו עובד שכיר ואינו עובד עצמאי". בתקופה זו משלמים דמי ביטוח לאומי ודמי ביטוח בריאות כ"מי שאינו עובד" — לפי שיעורים מינימליים על בסיס 25% מהשכר הממוצע במשק (כ-₪185–220/חודש נכון ל-2024, כולל ביטוח בריאות). אין "דמי בריאות לגמלאי" בתקופה זו. יש לציין את הסכום הנכון לתקופה זו בלבד.

תקופה ב' — מגיל 67 ואילך (גמלאי):
מגיל 67 חלים כללים שונים לביטוח לאומי — הזכאות לגמלת הזקנה מתחילה ודמי הביטוח הלאומי עשויים לרדת או להשתנות בהתאם להכנסה מפנסיה.
` : ''}
חלק לשני תתי-סעיפים:

א) הוצאות חדשות שיתווספו בתקופת הפרישה${isRetirementBeforeNI ? ` (גיל ${retirementAge}–67)` : ''}: ${isRetirementBeforeNI ? 'דמי ביטוח לאומי ובריאות כ"מי שאינו עובד" (לא דמי בריאות לגמלאי),' : 'ביטוח לאומי (דמי בריאות לגמלאי),'} שינוי בביטוח רפואי פרטי, תרופות וטיפולים רפואיים נוספים, פנאי ונסיעות גדולות יותר, עזרה בבית, ועוד — עם סכום חודשי משוער.

ב) הוצאות קיימות שיגדלו: בפרישה נמצאים יותר זמן בבית ולא עובדים, לכן בדוק מהקטגוריות הקיימות מה צפוי לגדול — למשל צריכת מזון (יותר ארוחות בבית), חשמל וגז (יותר שעות בבית), תקשורת ובידור, ועוד. ציין את אחוז הגידול הצפוי לכל סעיף ואת התוספת החודשית המשוערת.

בסוף תשובתך (אחרי הסיכום) הוסף בלוק JSON בפורמט המדויק הזה ואל תשנה את המבנה. categoryId חייב להיות אחד מ: housing, food, health, transport, entertainment, personal, family, misc. itemLabel חייב להיות זהה לשם הפריט בתקציב שהוזן. ${isRetirementBeforeNI ? 'השתמש בסכום המתאים לתקופה לפני גיל 67 (דמי ביטוח לאומי כ"מי שאינו עובד"), לא לגמלאי.' : ''}

---RETIREMENT_JSON_START---
{"additions":[{"categoryId":"health","label":"ביטוח לאומי ובריאות (לא עובד)","monthlyAmount":210,"note":"דמי ביטוח לאומי ובריאות כמי שאינו עובד, לפני גיל 67"}],"increases":[{"categoryId":"food","itemLabel":"קניות וסופר","increaseAmount":500,"increasePercent":20,"note":"יותר ארוחות בבית"}]}
---RETIREMENT_JSON_END---` : ''}

📊 סיכום:
פער מהיעד ומה אפשר לייעל.`
                : `You are a senior financial advisor specializing in retirement planning. The user has ${householdSize} person${householdSize !== 1 ? 's' : ''} in the household. Per-person spending: ${cur}${perPerson.toLocaleString()}/mo.

**Required response structure (under 400 words):**

⚠️ Per-person anomalies:
For each category tagged [scales with people] — check if the per-person amount is reasonable. State explicitly: too high / too low / reasonable, with a brief reason. For [fixed] categories — check if the total amount makes sense regardless of household size.

➕ Missing expenses:
Review the empty categories listed. State which ones likely have real expenses missing (for a retired household), with expected typical amounts. Also suggest important expenses not in the list at all for this life stage.
${isPreRetirement ? `
🔮 Retirement budget changes:
This budget is pre-retirement (retirement age: ${retirementAge}). The user plans to stop working at age ${retirementAge} and live off savings until age ${retirementEndAge}.
${isRetirementBeforeNI ? `
⚠️ Important: retirement age (${retirementAge}) is before the NI pension eligibility age (67). Distinguish between two periods:

Period 1 — age ${retirementAge} to 67 (pre-pension):
The user is classified as a "non-employed, non-self-employed person". They pay National Insurance and health insurance as a "non-worker" at minimum rates based on 25% of the average wage (approx. ₪185–220/month in 2024, inclusive of health insurance). Do NOT suggest "pensioner health contributions" for this period. Use the correct non-worker rate.

Period 2 — age 67+ (pensioner):
From age 67, different NI rules apply — pension-age entitlements begin and NI contributions may decrease or change based on pension income.
` : ''}
Split into two sub-sections:

a) New expenses added during retirement${isRetirementBeforeNI ? ` (age ${retirementAge}–67)` : ''}: ${isRetirementBeforeNI ? 'NI and health insurance as a non-worker (NOT pensioner rates),' : 'national insurance (pensioner health contributions),'} changes in private medical insurance, additional medications and treatments, more leisure and travel, home help, etc. — with estimated monthly amounts.

b) Existing expenses that will increase: being home all day instead of working means certain costs rise — check the existing categories and flag which ones will grow, e.g. food (more meals at home), electricity and gas (more hours at home), communication and entertainment, etc. Estimate the percentage increase and additional monthly cost for each.

At the end of your response (after the summary) include a JSON block in exactly this format. categoryId must be one of: housing, food, health, transport, entertainment, personal, family, misc. itemLabel must match the budget item name exactly as entered. ${isRetirementBeforeNI ? 'Use the amount applicable to a non-worker before age 67, not the pensioner rate.' : ''}

---RETIREMENT_JSON_START---
{"additions":[{"categoryId":"health","label":"NI & Health (non-worker)","monthlyAmount":210,"note":"NI and health insurance as non-worker, before age 67"}],"increases":[{"categoryId":"food","itemLabel":"קניות וסופר","increaseAmount":500,"increasePercent":20,"note":"more meals at home"}]}
---RETIREMENT_JSON_END---` : ''}

📊 Summary:
Gap vs target and what can be optimized.`;

            const householdLine = isHe
                ? `נפשות בבית: ${householdSize} | הוצאה לנפש: ${cur}${perPerson.toLocaleString()}/חודש`
                : `Household: ${householdSize} person${householdSize !== 1 ? 's' : ''} | Per-person: ${cur}${perPerson.toLocaleString()}/mo`;
            const ageContext = currentAge > 0
                ? (isHe
                    ? `\nגיל נוכחי: ${currentAge} | גיל פרישה: ${retirementAge} | גיל סיום תכנון: ${retirementEndAge}${isRetirementBeforeNI ? ` | גיל ביטוח לאומי/פנסיה: 67 (${Math.round(NI_PENSION_AGE - retirementAge)} שנים לאחר הפרישה)` : ''}${isPreRetirement ? ` | שנים לפרישה: ${Math.round(retirementAge - currentAge)}` : ' | כבר בפרישה'}`
                    : `\nCurrent age: ${currentAge} | Retirement age: ${retirementAge} | Planning end age: ${retirementEndAge}${isRetirementBeforeNI ? ` | NI/pension age: 67 (${Math.round(NI_PENSION_AGE - retirementAge)} years after retirement)` : ''}${isPreRetirement ? ` | Years to retirement: ${Math.round(retirementAge - currentAge)}` : ' | Already retired'}`)
                : '';

            // Retirement portfolio context from calculator results
            const balAtRet  = results?.balanceAtRetirement ?? null;
            const balAtEnd  = results?.balanceAtEnd ?? null;
            const netWd     = results?.initialNetWithdrawal ?? null;
            const reqCap    = results?.requiredCapitalAtRetirement ?? null;
            const surplusAmt = results?.surplus ?? null;
            const ranOut    = results?.ranOutAtAge ?? null;
            const wdRate    = (balAtRet && netWd) ? (netWd * 12) / balAtRet : null;

            const calcContext = isHe
                ? (() => {
                    const lines2 = [];
                    if (balAtRet != null) lines2.push(`יתרה צבורה בגיל פרישה: ${cur}${Math.round(balAtRet).toLocaleString()}`);
                    if (reqCap  != null) lines2.push(`הון נדרש לפרישה: ${cur}${Math.round(reqCap).toLocaleString()}`);
                    if (surplusAmt != null) lines2.push(`עודף / גירעון: ${surplusAmt >= 0 ? '+' : ''}${cur}${Math.round(surplusAmt).toLocaleString()}`);
                    if (wdRate   != null) lines2.push(`אחוז משיכה מהתיק: ${(wdRate * 100).toFixed(1)}% לשנה`);
                    if (balAtEnd != null) lines2.push(`יתרה בסוף תקופת הפרישה: ${cur}${Math.round(balAtEnd).toLocaleString()}`);
                    if (ranOut   != null) lines2.push(`⚠️ הכסף נגמר בגיל: ${ranOut.toFixed(1)}`);
                    return lines2.length ? `\nנתוני חישוב פרישה:\n${lines2.join('\n')}` : '';
                })()
                : (() => {
                    const lines2 = [];
                    if (balAtRet != null) lines2.push(`Portfolio at retirement: ${cur}${Math.round(balAtRet).toLocaleString()}`);
                    if (reqCap  != null) lines2.push(`Required capital: ${cur}${Math.round(reqCap).toLocaleString()}`);
                    if (surplusAmt != null) lines2.push(`Surplus / deficit: ${surplusAmt >= 0 ? '+' : ''}${cur}${Math.round(surplusAmt).toLocaleString()}`);
                    if (wdRate   != null) lines2.push(`Withdrawal rate: ${(wdRate * 100).toFixed(1)}%/yr`);
                    if (balAtEnd != null) lines2.push(`Balance at end of retirement: ${cur}${Math.round(balAtEnd).toLocaleString()}`);
                    if (ranOut   != null) lines2.push(`⚠️ Funds run out at age: ${ranOut.toFixed(1)}`);
                    return lines2.length ? `\nRetirement calculation data:\n${lines2.join('\n')}` : '';
                })();

            const userMsg = isHe
                ? `${householdLine}${ageContext}${calcContext}\nיעד הכנסה חודשית: ${cur}${Math.round(target)}\nסה"כ הוצאות: ${cur}${Math.round(totalMonthly)}\nפער: ${cur}${Math.round(target - totalMonthly)}\n\nפירוט:\n${lines || 'אין הוצאות מוזנות'}${missingSection}${futureSavingsSection}`
                : `${householdLine}${ageContext}${calcContext}\nMonthly income target: ${cur}${Math.round(target)}\nTotal expenses: ${cur}${Math.round(totalMonthly)}\nGap: ${cur}${Math.round(target - totalMonthly)}\n\nBreakdown:\n${lines || 'No expenses entered'}${missingSection}${futureSavingsSection}`;

            const reply = await getChatResponse(
                [{ role: 'user', content: userMsg }],
                systemPrompt,
                aiProvider, aiModel, apiKeyOverride
            );
            aiInsightRef.current = reply;
            setAiInsight(reply);
            setAiInsightStale(false);
            if (uid) setBudgetAiInsight(uid, reply).catch(err => console.error('[Budget AI insight save error]', err));
        } catch (err) {
            if (err.name !== 'AbortError') setAiError(err.message || 'Error');
        } finally {
            setAiLoading(false);
        }
    }, [
        aiProvider,
        aiModel,
        apiKeyOverride,
        items,
        displayItems,
        target,
        totalMonthly,
        householdSize,
        isHe,
        uid,
        selectedYear,
        inputs.currentAge,
        inputs.retirementStartAge,
        inputs.retirementEndAge,
        results?.balanceAtRetirement,
        results?.balanceAtEnd,
        results?.initialNetWithdrawal,
        results?.requiredCapitalAtRetirement,
        results?.surplus,
        results?.ranOutAtAge,
    ]);

    const pct = target > 0 ? Math.min(totalMonthly / target, 1.5) : 0;
    const projectedPct = target > 0 ? Math.min(totalProjectedMonthly / target, 1.5) : 0;
    const gap = target - totalMonthly;
    const statusColor = pct > 1 ? 'text-red-500' : pct > 0.9 ? 'text-amber-500' : 'text-emerald-500';
    const barColor   = pct > 1 ? 'bg-red-500'   : pct > 0.9 ? 'bg-amber-500'   : 'bg-emerald-500';
    const pctColor   = pct > 0.9 ? 'text-red-500' : pct > 0.8 ? 'text-amber-400' : 'text-emerald-500';

    return (
        <>
        <div className="space-y-3" dir={isHe ? 'rtl' : 'ltr'}>

            {/* ── Retirement mode banner ── */}
            {showRetirementMode && retirementAdj && (() => {
                const totalDelta = (retirementAdj.additions || []).reduce((s, a) => s + (a.monthlyAmount || 0), 0)
                    + (retirementAdj.increases || []).reduce((s, inc) => s + (inc.increaseAmount || 0), 0);
                return (
                    <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-medium border mb-1 ${isLight ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-amber-500/10 border-amber-500/40 text-amber-300'}`} dir={isHe ? 'rtl' : 'ltr'}>
                        <span className="flex items-center gap-1.5">
                            <span>🔮</span>
                            <span>{isHe ? 'תצוגת תקציב פרישה' : 'Retirement budget view'}</span>
                        </span>
                        <span dir="ltr" className="font-bold">
                            {isHe ? 'תוספת צפויה:' : 'Expected addition:'} +{currency}{Math.round(totalDelta).toLocaleString()}{isHe ? '/חודש' : '/mo'}
                        </span>
                    </div>
                );
            })()}

            {/* ── Summary banner — sticky ── */}
            <div className={`sticky top-0 z-20 rounded-xl p-3 border backdrop-blur-md ${isLight ? 'bg-white border-slate-200' : 'bg-white/10 border-white/20'}`}>
                {/* Year navigation — integrated into summary header */}
                <div className={`flex items-center pt-1 pb-3 mb-2 border-b ${isLight ? 'border-slate-100' : 'border-white/10'}`} dir="ltr">
                    {/* Left arrow: decrease in LTR, increase in Hebrew — wraps around */}
                    <button
                        onClick={() => setSelectedYear(y => isHe
                            ? (y >= retirementEndYear ? currentYear : y + 1)
                            : (y <= currentYear ? retirementEndYear : y - 1))}
                        className={`w-7 h-7 flex items-center justify-center shrink-0 rounded transition-colors focus:outline-none focus:ring-0 ${isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}
                    >
                        <ChevronDown size={14} className="rotate-90" />
                    </button>
                    {/* Center: year + copy dropdown icon */}
                    <div className={`flex-1 flex items-center justify-center gap-2 ${isHe ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className="flex items-center justify-center gap-1.5" dir={isHe ? 'rtl' : 'ltr'}>
                            <span className={`text-xl font-bold leading-none tabular-nums ${selectedYear === currentYear ? (isLight ? 'text-slate-700' : 'text-gray-200') : (isLight ? 'text-indigo-700' : 'text-indigo-300')}`}>
                                {selectedYear}
                            </span>
                            {(() => {
                                const st = copiedStateByYear[selectedYear];
                                const hasEdits = Object.keys(yearAmounts[selectedYear] || {}).length > 0;
                                if (st && JSON.stringify(yearAmounts[selectedYear] || {}) === st.amountsStr) {
                                    return (
                                        <span className={`text-[10px] px-1.5 rounded-full border leading-none tracking-wide py-0.5 ${isLight ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50'}`}>
                                            {isHe ? `העתק מ-${st.sourceYear}` : `Copied from ${st.sourceYear}`}
                                        </span>
                                    );
                                } else if (selectedYear !== currentYear && !hasEdits) {
                                    return (
                                        <span className={`text-[10px] px-1.5 rounded-full border leading-none tracking-wide py-0.5 ${isLight ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50'}`}>
                                            {isHe ? 'העתק משנה נוכחית' : 'Copied from current year'}
                                        </span>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        {selectedYear === currentYear ? (
                            <span className={`text-[10px] leading-none ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {isHe ? 'שנה נוכחית' : 'current year'}
                            </span>
                        ) : (
                            <div className="relative" ref={copyDropdownRef}>
                                <button
                                    onClick={() => setCopyDropdownOpen(o => !o)}
                                    title={isHe ? 'העתק מ...' : 'Copy from year...'}
                                    className={`w-7 h-7 flex items-center justify-center shrink-0 rounded transition-colors focus:outline-none focus:ring-0 ${isLight ? 'text-indigo-500 hover:bg-indigo-50' : 'text-indigo-400 hover:bg-indigo-900/20'} ${copyDropdownOpen ? (isLight ? 'bg-indigo-50' : 'bg-indigo-900/20') : ''}`}
                                >
                                    <Copy size={12} />
                                </button>
                                {copyDropdownOpen && (
                                    <div className={`absolute top-full mt-1 z-50 rounded-lg shadow-lg border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-white/20'}`}
                                        style={{ [isHe ? 'right' : 'left']: 0, minWidth: '7rem' }}
                                    >
                                        <div className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wide border-b ${isLight ? 'text-slate-400 border-slate-100' : 'text-gray-500 border-white/10'}`}>
                                            {isHe ? 'העתק מ-' : 'Copy from'}
                                        </div>
                                        <div className="max-h-40 overflow-y-auto custom-scrollbar scrollbar-right">
                                            {Array.from({ length: retirementEndYear - currentYear + 1 }, (_, i) => currentYear + i)
                                                .filter(y => y !== selectedYear)
                                                .map(y => (
                                                    <button
                                                        key={y}
                                                        onClick={() => {
                                                            pushHistoryNow();
                                                            const srcAmounts = yearAmountsRef.current[y] || {};
                                                            const newAmountsForSelectedYear = { ...(yearAmountsRef.current[selectedYear] || {}), ...srcAmounts };
                                                            setYearAmounts(prev => ({
                                                                ...prev,
                                                                [selectedYear]: newAmountsForSelectedYear
                                                            }));
                                                            setCopiedStateByYear(prev => ({
                                                                ...prev,
                                                                [selectedYear]: { sourceYear: y, amountsStr: JSON.stringify(newAmountsForSelectedYear) }
                                                            }));
                                                            setCopyDropdownOpen(false);
                                                        }}
                                                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${isLight ? 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700' : 'text-gray-300 hover:bg-indigo-900/30 hover:text-indigo-300'}`}
                                                    >
                                                        {y}{y === currentYear ? (isHe ? ' (נוכחית)' : ' (current)') : ''}
                                                    </button>
                                                ))
                                            }
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Right arrow: increase in LTR, decrease in Hebrew — wraps around */}
                    <button
                        onClick={() => setSelectedYear(y => isHe
                            ? (y <= currentYear ? retirementEndYear : y - 1)
                            : (y >= retirementEndYear ? currentYear : y + 1))}
                        className={`w-7 h-7 flex items-center justify-center shrink-0 rounded transition-colors focus:outline-none focus:ring-0 ${isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}
                    >
                        <ChevronDown size={14} className="-rotate-90" />
                    </button>
                </div>
                <div className="flex items-end justify-between mb-2 gap-4">
                    <div className="text-right">
                        <div className={`text-sm font-medium mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetIncomeTarget')}
                        </div>
                        <div className={`text-lg font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                            {currency}{target.toLocaleString()}
                        </div>
                        <div className={`text-xs mt-0.5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                            {currency}{(target * 12).toLocaleString()} {isHe ? '/ שנה' : '/ yr'}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className={`text-sm font-medium mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetTotalExpenses')}
                        </div>
                        <div className="flex items-baseline justify-end gap-2" dir="ltr">
                            {pausedMonthly > 0 && (
                                <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                    (+{currency}{Math.round(pausedMonthly).toLocaleString()})
                                </span>
                            )}
                            <span className={`text-lg font-semibold ${statusColor}`}>
                                {currency}{Math.round(totalMonthly).toLocaleString()}
                            </span>
                            {showInflation && (
                                <span className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {currency}{Math.round(totalProjectedMonthly).toLocaleString()}
                                </span>
                            )}
                        </div>
                        <div className="flex items-baseline justify-end gap-1.5 mt-0.5" dir="ltr">
                            <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {currency}{Math.round(totalMonthly * 12).toLocaleString()} {isHe ? '/ שנה' : '/ yr'}
                            </span>
                            {showInflation && (
                                <span className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {currency}{Math.round(totalProjectedMonthly * 12).toLocaleString()}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className={`text-sm font-medium mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('budgetGap')}
                        </div>
                        <div className="flex items-baseline justify-end gap-2" dir="ltr">
                            <span className={`text-lg font-semibold ${gap >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {gap >= 0 ? '+' : ''}{currency}{Math.round(gap).toLocaleString()}
                            </span>
                            {showInflation && (
                                <span className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {(() => { const pg = target - Math.round(totalProjectedMonthly); return `${pg >= 0 ? '+' : ''}${currency}${Math.abs(pg).toLocaleString()}`; })()}
                                </span>
                            )}
                        </div>
                        <div className="flex items-baseline justify-end gap-1.5 mt-0.5" dir="ltr">
                            <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {currency}{Math.round(Math.abs(gap * 12)).toLocaleString()}{gap >= 0 ? '+' : '-'} {isHe ? '/ שנה' : '/ yr'}
                            </span>
                            {showInflation && (() => { const pg = target - Math.round(totalProjectedMonthly); return (
                                <span className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {currency}{Math.round(Math.abs(pg * 12)).toLocaleString()}{pg >= 0 ? '+' : '-'}
                                </span>
                            ); })()}
                        </div>
                    </div>
                </div>
                {/* Household size + inflation controls */}
                <div className={`flex items-center gap-3 mb-2 text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    <span>👥</span>
                    <span>{isHe ? 'נפשות:' : 'Household:'}</span>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setHouseholdSize(s => Math.max(1, s - 1))} className={`w-5 h-5 rounded flex items-center justify-center font-bold transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}>−</button>
                        <span className={`w-5 text-center font-semibold ${isLight ? 'text-slate-700' : 'text-white'}`}>{householdSize}</span>
                        <button onClick={() => setHouseholdSize(s => Math.min(10, s + 1))} className={`w-5 h-5 rounded flex items-center justify-center font-bold transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}>+</button>
                    </div>
                    <div className="flex-1" />
                    {/* Inflation projection controls — always visible, no layout shift */}
                    <button
                        onClick={() => setShowInflation(v => !v)}
                        className="shrink-0 p-0.5 transition-colors"
                        title={isHe ? (showInflation ? 'הסתר הקרנת אינפלציה' : 'הצג הקרנת אינפלציה') : (showInflation ? 'Hide inflation projection' : 'Show inflation projection')}
                    >
                        {showInflation
                            ? <ToggleRight size={18} className="text-blue-500" />
                            : <ToggleLeft size={18} className={isLight ? 'text-slate-400' : 'text-gray-400'} />}
                    </button>
                    <span className={`shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>📈 {isHe ? 'אינפלציה' : 'Inflation'} {(inflationRate * 100).toFixed(1)}%</span>
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setProjYears(y => Math.max(1, y - 1))} className={`w-5 h-5 rounded flex items-center justify-center font-bold transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}>−</button>
                        <span className={`w-7 text-center font-semibold tabular-nums ${isLight ? 'text-slate-700' : 'text-white'}`}>{projYears}{isHe ? 'ש' : 'y'}</span>
                        <button onClick={() => setProjYears(y => Math.min(30, y + 1))} className={`w-5 h-5 rounded flex items-center justify-center font-bold transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}>+</button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className={`flex-1 h-2 rounded-full overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-white/10'}`}>
                        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                    </div>
                    {target > 0 && (
                        <div className="flex items-center gap-1.5 shrink-0" dir="ltr">
                            <span className={`text-xs font-medium ${pctColor}`}>
                                {Math.round(pct * 100)}% {t('budgetOfTarget')}
                            </span>
                            {showInflation && (
                                <span className={`text-xs font-medium ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                    → {Math.round(projectedPct * 100)}%
                                </span>
                            )}
                        </div>
                    )}
                </div>

            </div>

            {/* ── Search + Stats ── */}
            <div className="flex items-center gap-2">
                <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-white/10 border-white/20'}`}>
                    <Search size={13} className={isLight ? 'text-slate-400 shrink-0' : 'text-gray-500 shrink-0'} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={isHe ? 'חפש פריט… (למשל: סיעוד, ביטוח)' : 'Search item… (e.g. insurance, mortgage)'}
                        className={`flex-1 bg-transparent text-xs outline-none placeholder:text-gray-400 ${isLight ? 'text-slate-800' : 'text-white'}`}
                        dir={isHe ? 'rtl' : 'ltr'}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className={isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}>
                            <X size={13} />
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0" dir="ltr">
                    <button
                        onClick={handleUndo}
                        disabled={!canUndo}
                        title={isHe ? 'בטל' : 'Undo'}
                        className={`p-2 rounded-xl border transition-colors disabled:opacity-30 ${isLight ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-white/10 border-white/20 text-gray-400 hover:bg-white/20'}`}
                    >
                        <Undo2 size={14} />
                    </button>
                    <button
                        onClick={handleRedo}
                        disabled={!canRedo}
                        title={isHe ? 'חזור' : 'Redo'}
                        className={`p-2 rounded-xl border transition-colors disabled:opacity-30 ${isLight ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-white/10 border-white/20 text-gray-400 hover:bg-white/20'}`}
                    >
                        <Redo2 size={14} />
                    </button>
                </div>
                <button
                    onClick={() => setShowStats(true)}
                    title={isHe ? 'סטטיסטיקות' : 'Statistics'}
                    className={`shrink-0 p-2 rounded-xl border transition-colors ${isLight ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100 hover:border-blue-300' : 'bg-blue-500/20 border-blue-500/40 text-blue-400 hover:bg-blue-500/30'}`}
                >
                    <BarChart3 size={14} />
                </button>
                <button
                    onClick={() => setShowFixedVar(true)}
                    title={isHe ? 'קבוע מול משתנה' : 'Fixed vs Variable'}
                    className={`shrink-0 p-2 rounded-xl border transition-colors ${isLight ? 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100 hover:border-orange-300' : 'bg-orange-500/20 border-orange-500/40 text-orange-400 hover:bg-orange-500/30'}`}
                >
                    <Lock size={14} />
                </button>
                {retirementAdj && (
                    <button
                        onClick={() => setShowRetirementMode(v => !v)}
                        title={isHe ? 'תצוגת תקציב פרישה' : 'Retirement budget view'}
                        className={`shrink-0 px-2 py-1.5 rounded-xl border text-xs font-medium transition-colors ${showRetirementMode
                            ? (isLight ? 'bg-amber-100 border-amber-400 text-amber-700' : 'bg-amber-500/20 border-amber-400 text-amber-300')
                            : (isLight ? 'bg-slate-50 border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-600' : 'bg-white/5 border-white/20 text-gray-500 hover:border-amber-400 hover:text-amber-400')}`}
                    >
                        🔮
                    </button>
                )}
            </div>

            {/* ── Search results ── */}
            {searchResults && (
                <div className={`rounded-xl border ${isLight ? 'border-slate-200 bg-white' : 'border-white/20 bg-white/10'}`}>
                    <div className={`px-3 py-2 text-xs font-medium border-b ${isLight ? 'text-slate-500 border-slate-100' : 'text-gray-400 border-white/10'}`} dir={isHe ? 'rtl' : 'ltr'}>
                        {searchResults.length > 0
                            ? (isHe ? `${searchResults.length} תוצאות` : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`)
                            : (isHe ? 'אין תוצאות' : 'No results')}
                    </div>
                    {searchResults.map(item => {
                        const cat = visibleCategories.find(c => c.id === item.categoryId);
                        const monthly = toMonthly(item);
                        return (
                            <div key={item.id} className={`flex items-center gap-2 px-3 py-2 border-b last:border-0 text-sm ${item.enabled !== false ? '' : 'opacity-40'} ${isLight ? 'border-slate-100' : 'border-white/5'}`} dir={isHe ? 'rtl' : 'ltr'}>
                                <span className="text-base shrink-0">{cat?.icon ?? '📋'}</span>
                                <div className="flex-1 min-w-0">
                                    <div className={`font-medium truncate ${isLight ? 'text-slate-800' : 'text-white'}`}>{item.label}</div>
                                    <div className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>{isHe ? (cat?.labelHe ?? item.categoryId) : (cat?.labelEn ?? item.categoryId)}</div>
                                </div>
                                {monthly > 0 && (
                                    <span className={`text-xs font-semibold shrink-0 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                                        {currency}{Math.round(monthly).toLocaleString()}/{isHe ? 'חודש' : 'mo'}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Categories ── */}
            {visibleCategories.map(cat => {
                const catItems = displayItems.filter(i => i.categoryId === cat.id);
                if (catItems.length === 0 && !CATEGORIES.find(c => c.id === cat.id)) return null;
                return (
                    <CategorySection
                        key={cat.id}
                        category={cat}
                        items={catItems}
                        isHe={isHe}
                        isLight={isLight}
                        currency={currency}
                        t={t}
                        open={openCategoryId === cat.id}
                        onToggle={() => setOpenCategoryId(prev => prev === cat.id ? null : cat.id)}
                        onChangeItem={handleChangeItem}
                        onDeleteItem={handleDeleteItem}
                        onToggleItemEnabled={handleToggleItemEnabled}
                        onAddItem={() => handleAddItem(cat.id)}
                        onAddLoanItem={() => handleAddLoanItem(cat.id)}
                        onAddMaintenanceItem={() => handleAddMaintenanceItem(cat.id)}
                        onToggleAll={() => handleToggleCategoryItems(cat.id)}
                        projFactor={projFactor}
                        projYears={projYears}
                        showInflation={showInflation}
                        totalMonthly={totalMonthly}
                        householdSize={householdSize}
                        aiProvider={aiProvider}
                        aiModel={aiModel}
                        apiKeyOverride={apiKeyOverride}
                        retirementOverlay={showRetirementMode ? retirementAdj : null}
                        currentAge={parseFloat(inputs.currentAge) || 30}
                        retirementEndAge={parseFloat(inputs.retirementEndAge) || 90}
                    />
                );
            })}

            {/* ── Restore panel ── */}
            {showRestore && (
                <div className={`rounded-xl border p-3 space-y-2 ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/20 border-amber-500/30'}`}>
                    <div className={`text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'text-amber-800' : 'text-amber-300'}`}>
                        <History size={13} />
                        {isHe ? 'שחזור מגיבוי' : 'Restore from backup'}
                    </div>
                    {backups.length === 0 ? (
                        <p className={`text-xs ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{isHe ? 'אין גיבויים זמינים' : 'No backups available'}</p>
                    ) : backups.map((bk, i) => (
                        <div key={i} className={`flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg ${isLight ? 'bg-white border border-amber-100' : 'bg-white/5 border border-white/10'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                                <Clock size={11} className={isLight ? 'text-amber-500 shrink-0' : 'text-amber-400 shrink-0'} />
                                <div>
                                    <div className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>{backupAge(bk.savedAt, isHe)}</div>
                                    <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {isHe ? `סה"כ ${currency}${Math.round(bk.totalMonthly).toLocaleString()}/חודש` : `Total ${currency}${Math.round(bk.totalMonthly).toLocaleString()}/mo`}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRestore(bk)}
                                className={`shrink-0 px-2 py-1 rounded text-[10px] font-bold transition-colors ${isLight ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-amber-500 text-white hover:bg-amber-400'}`}
                            >
                                {isHe ? 'שחזר' : 'Restore'}
                            </button>
                        </div>
                    ))}
                    <button onClick={() => setShowRestore(false)} className={`text-[10px] ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}>
                        {isHe ? 'סגור' : 'Close'}
                    </button>
                </div>
            )}

            {/* ── Inline confirmation banner ── */}
            {pendingConfirm && (
                <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/20 border-red-500/30'}`}>
                    <span className={`text-xs font-medium ${isLight ? 'text-red-800' : 'text-red-300'}`}>
                        {pendingConfirm.type === 'reset'
                            ? (isHe ? 'לאפס את כל הנתונים?' : 'Reset all budget data?')
                            : (isHe ? `לשחזר גיבוי מ-${backupAge(pendingConfirm.backup.savedAt, isHe)}?` : `Restore backup from ${backupAge(pendingConfirm.backup.savedAt, isHe)}?`)}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => setPendingConfirm(null)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${isLight ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-white/10 border border-white/20 text-gray-300 hover:bg-white/20'}`}
                        >
                            {isHe ? 'ביטול' : 'Cancel'}
                        </button>
                        <button
                            onClick={handleConfirmAction}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                            {isHe ? 'כן, המשך' : 'Yes, proceed'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Bottom actions — Reset pinned to left, rest on right ── */}
            <div className="flex items-center justify-between gap-2 pt-1" dir="ltr">
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={handleReset}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${isLight ? 'border-slate-200 text-slate-500 hover:bg-slate-50' : 'border-white/20 text-gray-400 hover:bg-white/10'}`}
                    >
                        <RotateCcw size={13} />
                        {t('budgetReset')}
                    </button>
                    <button
                        onClick={() => setShowRestore(v => !v)}
                        title={isHe ? 'שחזור מגיבוי' : 'Restore from backup'}
                        className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${showRestore ? (isLight ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-amber-500/50 bg-amber-900/20 text-amber-400') : (isLight ? 'border-slate-200 text-slate-400 hover:bg-slate-50' : 'border-white/20 text-gray-500 hover:bg-white/10')}`}
                    >
                        <History size={13} />
                    </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end" dir={isHe ? 'rtl' : 'ltr'}>
                    <button
                        onClick={handleAddCategory}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-white/20 text-gray-400 hover:bg-white/10'}`}
                    >
                        <Plus size={13} />
                        {t('budgetAddCategory')}
                    </button>
                    <button
                        onClick={handleAdoptAsTarget}
                        disabled={totalMonthly === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Target size={13} />
                        {t('budgetAdoptTarget')}
                    </button>
                    {aiProvider && aiModel && (
                        <button
                            onClick={handleAiInsight}
                            disabled={aiLoading || totalMonthly === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <BrainCircuit size={13} />}
                            {isHe ? 'תובנות AI' : 'AI Insights'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── AI Insight modal ── */}
            {aiModalOpen && (
                <div
                    className={`fixed z-[9999] w-[480px] rounded-2xl shadow-2xl border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/20'}`}
                    style={{ top: 72, right: 16, ...aiDragStyle }}
                >
                    {/* Header — draggable */}
                    <div
                        className={`flex items-center justify-between px-4 py-3 border-b cursor-grab active:cursor-grabbing select-none ${isLight ? 'border-slate-100' : 'border-white/10'}`}
                        onMouseDown={onAiDragMouseDown}
                    >
                        <div className="flex items-center gap-2">
                            <BrainCircuit size={15} className="text-purple-400" />
                            <span className={`font-semibold text-sm ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
                                {isHe ? 'תובנות AI על התקציב' : 'AI Budget Insights'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {aiInsightStale && !aiLoading && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isLight ? 'bg-amber-100 text-amber-600' : 'bg-amber-500/20 text-amber-400'}`}>
                                    {isHe ? 'לא עדכני' : 'stale'}
                                </span>
                            )}
                            {aiInsight && !aiLoading && (
                                <button
                                    onClick={() => { aiInsightRef.current = null; setAiInsight(null); setAiInsightStale(false); handleAiInsight(); }}
                                    title={isHe ? 'רענן ניתוח' : 'Refresh analysis'}
                                    className={`p-1 rounded transition-colors ${isLight ? 'text-purple-400 hover:text-purple-700 hover:bg-purple-100' : 'text-purple-500 hover:text-purple-300 hover:bg-purple-500/20'}`}
                                >
                                    <RotateCcw size={13} />
                                </button>
                            )}
                            <button
                                onClick={() => setAiModalOpen(false)}
                                className={`text-lg leading-none opacity-40 hover:opacity-80 transition-opacity ${isLight ? 'text-slate-600' : 'text-gray-300'}`}
                            >✕</button>
                        </div>
                    </div>
                    {/* Body */}
                    <div className="px-4 py-4 max-h-[80vh] overflow-y-auto custom-scrollbar scrollbar-right" dir={isHe ? 'rtl' : 'ltr'}>
                        {aiLoading && (
                            <div className={`flex items-center gap-2 text-sm mb-3 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                <Loader2 size={15} className="animate-spin text-purple-400" />
                                {isHe ? 'מעדכן ניתוח...' : 'Updating analysis...'}
                            </div>
                        )}
                        {aiError && !aiLoading && (
                            <p className="text-sm text-red-500">{aiError}</p>
                        )}
                        {insightText && (
                            <InsightRenderer text={insightText} isLight={isLight} />
                        )}
                        {!aiLoading && !aiError && !aiInsight && (
                            <p className={`text-sm ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {isHe ? 'לחץ על הכפתור למעלה להפעלת הניתוח' : 'Click the button above to generate analysis'}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>

        <BudgetStatsModal
            isOpen={showStats}
            onClose={() => setShowStats(false)}
            items={items}
            inputs={inputs}
            results={results}
            inflationRate={inflationRate}
            showInflation={showInflation}
            isLight={isLight}
            isHe={isHe}
            currency={currency}
            t={t}
            sliderConsumed={sliderConsumed}
            setSliderConsumed={setSliderConsumed}
            retirementAdj={retirementAdj}
            showRetirementMode={showRetirementMode}
            setShowRetirementMode={setShowRetirementMode}
        />
        <FixedVarModal
            isOpen={showFixedVar}
            onClose={() => setShowFixedVar(false)}
            items={items}
            isHe={isHe}
            isLight={isLight}
            currency={currency}
            monthlyIncome={parseFloat(inputs?.monthlyNetIncomeDesired) || 0}
            maxYear={retirementEndYear}
            initialYear={selectedYear}
            aiProvider={aiProvider}
            aiModel={aiModel}
            apiKeyOverride={apiKeyOverride}
            LocationSuggestModal={LocationSuggestModal}
        />
        </>
    );
}
