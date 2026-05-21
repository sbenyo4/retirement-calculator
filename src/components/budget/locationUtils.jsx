import { useState, useEffect } from 'react';
import { feature as topoFeature } from 'topojson-client';
import { geoMercator, geoPath as d3GeoPath } from 'd3-geo';
import { getChatResponse } from '../../utils/ai-chat';

export const COST_KEYS = [
    { key: 'rent',          labelHe: 'דיור',           labelEn: 'Housing'          },
    { key: 'food',          labelHe: 'אוכל',           labelEn: 'Food'             },
    { key: 'transport',     labelHe: 'תחבורה',         labelEn: 'Transport'        },
    { key: 'entertainment', labelHe: 'בילויים',        labelEn: 'Entertainment'    },
    { key: 'flights',       labelHe: 'טיסה לטיול בודד', labelEn: 'Flight for one trip' },
    { key: 'carRental',     labelHe: 'שכירת רכב',      labelEn: 'Car rental'       },
    { key: 'insurance',     labelHe: 'ביטוח נסיעות',   labelEn: 'Travel insurance' },
    { key: 'esim',          labelHe: 'eSIM / אינטרנט', labelEn: 'eSIM / Internet'  },
    { key: 'other',         labelHe: 'אחרים',          labelEn: 'Other'            },
];
export const PLAN_COST_KEYS = [
    { key: 'flights',       labelHe: 'טיסות',        labelEn: 'Flights'        },
    { key: 'housing',       labelHe: 'לינה',          labelEn: 'Housing'        },
    { key: 'food',          labelHe: 'אוכל',          labelEn: 'Food'           },
    { key: 'transport',     labelHe: 'תחבורה',        labelEn: 'Transport'      },
    { key: 'entertainment', labelHe: 'בילויים',       labelEn: 'Entertainment'  },
    { key: 'carRental',     labelHe: 'שכירת רכב',     labelEn: 'Car rental'     },
    { key: 'fuel',          labelHe: 'דלק',           labelEn: 'Fuel'           },
    { key: 'insurance',     labelHe: 'ביטוח נסיעות',  labelEn: 'Travel insurance'},
    { key: 'esim',          labelHe: 'eSIM / אינטרנט', labelEn: 'eSIM / Internet'},
    { key: 'other',         labelHe: 'אחרים',         labelEn: 'Other'          },
];
export const TIP_META = {
    currency:    { icon: '💱', he: 'מטבע',            en: 'Currency'         },
    electricity: { icon: '🔌', he: 'חשמל ושקעים',     en: 'Electricity'      },
    clothing:    { icon: '👕', he: 'ביגוד',            en: 'Clothing'         },
    health:      { icon: '💊', he: 'בריאות',           en: 'Health'           },
    customs:     { icon: '🤝', he: 'תרבות ונימוסים',  en: 'Customs & Culture'},
    transport:   { icon: '🚌', he: 'תחבורה מקומית',   en: 'Getting Around'   },
    language:    { icon: '🗣️', he: 'שפה',             en: 'Language'         },
    safety:      { icon: '🛡️', he: 'בטיחות',          en: 'Safety'           },
    visa:        { icon: '🛂', he: 'ויזה וכניסה',      en: 'Visa & Entry'     },
    other:       { icon: '📌', he: 'כללי',             en: 'General'          },
};
export const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
let _worldCache = null;
let _worldPromise = null;
export function loadWorld() {
    if (_worldCache) return Promise.resolve(_worldCache);
    if (!_worldPromise) _worldPromise = fetch(WORLD_ATLAS_URL).then(r => r.json()).then(d => { _worldCache = d; return d; });
    return _worldPromise;
}

export const ALPHA2_TO_NUMERIC = {
    'AD':'020','AE':'784','AF':'004','AL':'008','AM':'051','AO':'024','AR':'032','AT':'040','AU':'036',
    'AZ':'031','BA':'070','BB':'052','BD':'050','BE':'056','BG':'100','BH':'048','BN':'096','BO':'068',
    'BR':'076','BS':'044','BT':'064','BW':'072','BY':'112','BZ':'084','CA':'124','CD':'180','CF':'140',
    'CG':'178','CH':'756','CL':'152','CM':'120','CN':'156','CO':'170','CR':'188','CU':'192','CY':'196',
    'CZ':'203','DE':'276','DK':'208','DO':'214','DZ':'012','EC':'218','EE':'233','EG':'818','ES':'724',
    'ET':'231','FI':'246','FJ':'242','FR':'250','GA':'266','GB':'826','GE':'268','GH':'288','GR':'300',
    'GT':'320','GY':'328','HN':'340','HR':'191','HT':'332','HU':'348','ID':'360','IE':'372','IL':'376',
    'IN':'356','IQ':'368','IR':'364','IS':'352','IT':'380','JM':'388','JO':'400','JP':'392','KE':'404',
    'KG':'417','KH':'116','KR':'410','KW':'414','KZ':'398','LA':'418','LB':'422','LK':'144','LR':'430',
    'LS':'426','LT':'440','LU':'442','LV':'428','LY':'434','MA':'504','MD':'498','ME':'499','MG':'450',
    'MK':'807','ML':'466','MM':'104','MN':'496','MR':'478','MT':'470','MU':'480','MV':'462','MW':'454',
    'MX':'484','MY':'458','MZ':'508','NA':'516','NE':'562','NG':'566','NI':'558','NL':'528','NO':'578',
    'NP':'524','NZ':'554','OM':'512','PA':'591','PE':'604','PG':'598','PH':'608','PK':'586','PL':'616',
    'PT':'620','PY':'600','QA':'634','RO':'642','RS':'688','RU':'643','RW':'646','SA':'682','SD':'729',
    'SE':'752','SG':'702','SI':'705','SK':'703','SL':'694','SN':'686','SO':'706','SR':'740','SS':'728',
    'SV':'222','SY':'760','SZ':'748','TD':'148','TG':'768','TH':'764','TJ':'762','TM':'795','TN':'788',
    'TR':'792','TT':'780','TZ':'834','UA':'804','UG':'800','US':'840','UY':'858','UZ':'860','VE':'862',
    'VN':'704','YE':'887','ZA':'710','ZM':'894','ZW':'716',
};

export function CountryShape({ code, size = 36, isLight }) {
    const [pathD, setPathD] = useState(null);
    const numericId = ALPHA2_TO_NUMERIC[code?.toUpperCase()];
    useEffect(() => {
        if (!numericId) return;
        let cancelled = false;
        loadWorld().then(world => {
            if (cancelled) return;
            const countries = topoFeature(world, world.objects.countries);
            const geo = countries.features.find(f => String(f.id) === numericId);
            if (!geo) return;
            const projection = geoMercator().fitExtent([[2, 2], [size - 2, size - 2]], geo);
            const d = d3GeoPath().projection(projection)(geo);
            if (!cancelled) setPathD(d);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [numericId, size]);
    if (!pathD) return null;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
            <path d={pathD} fill={isLight ? '#7c3aed' : '#a78bfa'} />
        </svg>
    );
}

export function countryCodeToFlag(code) {
    if (!code || code.length !== 2) return '';
    const [a, b] = code.toUpperCase().split('');
    if (!/[A-Z]/.test(a) || !/[A-Z]/.test(b)) return '';
    return String.fromCodePoint(0x1F1E6 - 65 + a.charCodeAt(0)) +
           String.fromCodePoint(0x1F1E6 - 65 + b.charCodeAt(0));
}

export function FlagBadge({ code, isLight }) {
    if (!code || code.length !== 2) return null;
    return (
        <span
            className={`shrink-0 overflow-hidden rounded-sm ${isLight ? 'shadow-sm border border-slate-200' : 'border border-white/20'}`}
            style={{ width: 30, height: 20, display: 'inline-block' }}
        >
            <img
                src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
                alt={code}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
        </span>
    );
}

export function PlanFlags({ codes, isLight, showShape = false }) {
    const valid = (codes || []).filter(c => c && c.length === 2);
    if (valid.length === 0) return null;
    if (valid.length === 1) {
        return (
            <>
                <FlagBadge code={valid[0]} isLight={isLight} />
                {showShape && <CountryShape code={valid[0]} size={28} isLight={isLight} />}
            </>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 shrink-0">
            {valid.slice(0, 3).map(c => <FlagBadge key={c} code={c} isLight={isLight} />)}
        </span>
    );
}

export const WORLD_REGIONS = [
    { id: 'all',      he: 'כל העולם',  en: 'Worldwide' },
    { id: 'europe',   he: 'אירופה',    en: 'Europe', sub: [
        { id: 'eu-west',    he: 'מערב',         en: 'West EU' },
        { id: 'eu-south',   he: 'דרום / ים תיכון', en: 'S. Europe' },
        { id: 'eu-central', he: 'מרכז',          en: 'Central EU' },
        { id: 'eu-east',    he: 'מזרח / בלקן',  en: 'E. Europe' },
        { id: 'eu-north',   he: 'צפון / סקנדינביה', en: 'Scandinavia' },
    ]},
    { id: 'asia',     he: 'אסיה',      en: 'Asia', sub: [
        { id: 'east-asia',       he: 'מזרח אסיה',       en: 'East Asia' },
        { id: 'southeast-asia',  he: 'דרום-מזרח אסיה',  en: 'SE Asia' },
        { id: 'south-asia',      he: 'דרום אסיה',        en: 'South Asia' },
        { id: 'middle-east',     he: 'מזרח תיכון',       en: 'Middle East' },
        { id: 'central-asia',    he: 'מרכז אסיה',        en: 'Central Asia' },
    ]},
    { id: 'americas', he: 'אמריקה',    en: 'Americas', sub: [
        { id: 'north-america',   he: 'צפון אמריקה',      en: 'N. America' },
        { id: 'latin-america',   he: 'אמריקה לטינית',    en: 'L. America' },
        { id: 'caribbean',       he: 'קריביים',           en: 'Caribbean' },
    ]},
    { id: 'africa',   he: 'אפריקה',    en: 'Africa' },
    { id: 'oceania',  he: 'אוקיאניה',  en: 'Oceania' },
];

export const REGION_PROMPT = {
    all:               { he: null, en: null },
    europe:            { he: 'הצע יעדים מאירופה בלבד. פרש את גבולות האזור לפי הגדרה גיאוגרפית מקובלת ועדכנית, בלי להסתמך על רשימת מדינות קבועה.', en: 'Suggest destinations from Europe only. Interpret the region using a current standard geographic definition, without relying on a fixed country list.' },
    'eu-west':         { he: 'הצע יעדים ממערב אירופה בלבד. הגדר את הגבולות לפי החלוקה הגיאוגרפית המקובלת של מערב אירופה, והסק בעצמך אילו מדינות וערים נכללות.', en: 'Suggest Western Europe destinations only. Define the boundary by the standard geographic concept of Western Europe and infer included countries and cities yourself.' },
    'eu-south':        { he: 'הצע יעדים מדרום אירופה / אגן הים התיכון בלבד. התייחס לקו החוף, האיים והאזורים העירוניים הרלוונטיים סביב הים התיכון ובדרום אירופה לפי הבנה גיאוגרפית עדכנית. החזר מגוון רחב ולא פחות מ-12 אפשרויות אם יש מחירי טיסות ישירות זמינים. אל תעצור אחרי 2-3 יעדים שמתאימים לתקציב; אם יעד חורג, החזר אותו עם פחות לילות משתלמים.', en: 'Suggest Southern Europe / Mediterranean-basin destinations only. Use current geographic understanding of the coastline, islands, and relevant city regions around the Mediterranean and Southern Europe. Return broad variety and at least 12 options when direct flight prices are available. Do not stop after 2-3 budget-fitting destinations; if a destination exceeds the budget, return it with fewer affordable nights.' },
    'eu-central':      { he: 'הצע יעדים ממרכז אירופה בלבד. הגדר את הגבולות לפי החלוקה הגיאוגרפית המקובלת של מרכז אירופה, והסק בעצמך אילו מדינות וערים נכללות.', en: 'Suggest Central Europe destinations only. Define the boundary by the standard geographic concept of Central Europe and infer included countries and cities yourself.' },
    'eu-east':         { he: 'הצע יעדים ממזרח אירופה / הבלקן בלבד. הגדר את הגבולות לפי החלוקה הגיאוגרפית והאזורית המקובלת, והסק בעצמך אילו מדינות וערים נכללות.', en: 'Suggest Eastern Europe / Balkans destinations only. Define the boundary by standard geographic and regional usage and infer included countries and cities yourself.' },
    'eu-north':        { he: 'הצע יעדים מצפון אירופה / סקנדינביה בלבד. הגדר את הגבולות לפי החלוקה הגיאוגרפית המקובלת של צפון אירופה, והסק בעצמך אילו מדינות וערים נכללות.', en: 'Suggest Northern Europe / Scandinavia destinations only. Define the boundary by the standard geographic concept of Northern Europe and infer included countries and cities yourself.' },
    asia:              { he: 'הצע יעדים מאסיה בלבד. פרש את גבולות האזור לפי הגדרה גיאוגרפית מקובלת ועדכנית, בלי להסתמך על רשימת מדינות קבועה.', en: 'Suggest destinations from Asia only. Interpret the region using a current standard geographic definition, without relying on a fixed country list.' },
    'east-asia':       { he: 'הצע יעדים ממזרח אסיה בלבד. הגדר את הגבולות לפי החלוקה הגיאוגרפית המקובלת של מזרח אסיה, והסק בעצמך אילו מדינות וערים נכללות.', en: 'Suggest East Asia destinations only. Define the boundary by the standard geographic concept of East Asia and infer included countries and cities yourself.' },
    'southeast-asia':  { he: 'הצע יעדים מדרום-מזרח אסיה בלבד. הגדר את הגבולות לפי החלוקה הגיאוגרפית המקובלת של דרום-מזרח אסיה, והסק בעצמך אילו מדינות וערים נכללות.', en: 'Suggest Southeast Asia destinations only. Define the boundary by the standard geographic concept of Southeast Asia and infer included countries and cities yourself.' },
    'south-asia':      { he: 'הצע יעדים מדרום אסיה בלבד. הגדר את הגבולות לפי החלוקה הגיאוגרפית המקובלת של דרום אסיה, והסק בעצמך אילו מדינות וערים נכללות.', en: 'Suggest South Asia destinations only. Define the boundary by the standard geographic concept of South Asia and infer included countries and cities yourself.' },
    'middle-east':     { he: 'הצע יעדים מהמזרח התיכון בלבד. הגדר את הגבולות לפי שימוש גיאוגרפי ואזורי מקובל ועדכני, והסק בעצמך אילו מדינות וערים נכללות.', en: 'Suggest Middle East destinations only. Define the boundary by current standard geographic and regional usage and infer included countries and cities yourself.' },
    'central-asia':    { he: 'הצע יעדים ממרכז אסיה בלבד. הגדר את הגבולות לפי החלוקה הגיאוגרפית המקובלת של מרכז אסיה, והסק בעצמך אילו מדינות וערים נכללות.', en: 'Suggest Central Asia destinations only. Define the boundary by the standard geographic concept of Central Asia and infer included countries and cities yourself.' },
    americas:          { he: 'הצע יעדים מאמריקה בלבד. פרש את גבולות האזור לפי הגדרה גיאוגרפית מקובלת ועדכנית, בלי להסתמך על רשימת מדינות קבועה.', en: 'Suggest destinations from the Americas only. Interpret the region using a current standard geographic definition, without relying on a fixed country list.' },
    'north-america':   { he: 'הצע יעדים מצפון אמריקה בלבד. הגדר את הגבולות לפי החלוקה הגיאוגרפית המקובלת של צפון אמריקה, והסק בעצמך אילו מדינות וערים נכללות.', en: 'Suggest North America destinations only. Define the boundary by the standard geographic concept of North America and infer included countries and cities yourself.' },
    'latin-america':   { he: 'הצע יעדים מאמריקה הלטינית בלבד. הגדר את הגבולות לפי שימוש גיאוגרפי, לשוני ותרבותי מקובל, והסק בעצמך אילו מדינות וערים נכללות.', en: 'Suggest Latin America destinations only. Define the boundary by standard geographic, linguistic, and cultural usage and infer included countries and cities yourself.' },
    caribbean:         { he: 'הצע יעדים מהקריביים בלבד. הגדר את הגבולות לפי האזור הימי והאיים הקריביים המקובלים, והסק בעצמך אילו מדינות, טריטוריות וערים נכללות.', en: 'Suggest Caribbean destinations only. Define the boundary by the standard Caribbean sea/island region and infer included countries, territories, and cities yourself.' },
    africa:            { he: 'הצע יעדים מאפריקה בלבד. פרש את גבולות האזור לפי הגדרה גיאוגרפית מקובלת ועדכנית, בלי להסתמך על רשימת מדינות קבועה.', en: 'Suggest destinations from Africa only. Interpret the region using a current standard geographic definition, without relying on a fixed country list.' },
    oceania:           { he: 'הצע יעדים מאוקיאניה בלבד. הגדר את הגבולות לפי החלוקה הגיאוגרפית המקובלת של אוקיאניה והאוקיינוס השקט, והסק בעצמך אילו מדינות, טריטוריות וערים נכללות.', en: 'Suggest Oceania destinations only. Define the boundary by the standard geographic concept of Oceania and the Pacific region and infer included countries, territories, and cities yourself.' },
};

export const TIER_META = {
    cheap:     { labelHe: 'זול',    labelEn: 'Budget',  color: 'green'  },
    medium:    { labelHe: 'בינוני', labelEn: 'Medium',  color: 'blue'   },
    expensive: { labelHe: 'יקר',    labelEn: 'Premium', color: 'purple' },
};

export const LOCATION_CARD_STYLES = [
    {
        card: { light: 'bg-gradient-to-br from-sky-50 to-blue-100 border-sky-200', dark: 'bg-gradient-to-br from-sky-500/15 to-blue-600/20 border-sky-400/25' },
        chip: { light: 'bg-sky-100 text-sky-700', dark: 'bg-sky-400/15 text-sky-200' },
    },
    {
        card: { light: 'bg-gradient-to-br from-emerald-50 to-teal-100 border-emerald-200', dark: 'bg-gradient-to-br from-emerald-500/15 to-teal-600/20 border-emerald-400/25' },
        chip: { light: 'bg-emerald-100 text-emerald-700', dark: 'bg-emerald-400/15 text-emerald-200' },
    },
    {
        card: { light: 'bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200', dark: 'bg-gradient-to-br from-amber-500/15 to-orange-600/20 border-amber-400/25' },
        chip: { light: 'bg-amber-100 text-amber-700', dark: 'bg-amber-400/15 text-amber-200' },
    },
    {
        card: { light: 'bg-gradient-to-br from-rose-50 to-pink-100 border-rose-200', dark: 'bg-gradient-to-br from-rose-500/15 to-pink-600/20 border-rose-400/25' },
        chip: { light: 'bg-rose-100 text-rose-700', dark: 'bg-rose-400/15 text-rose-200' },
    },
    {
        card: { light: 'bg-gradient-to-br from-violet-50 to-fuchsia-100 border-violet-200', dark: 'bg-gradient-to-br from-violet-500/15 to-fuchsia-600/20 border-violet-400/25' },
        chip: { light: 'bg-violet-100 text-violet-700', dark: 'bg-violet-400/15 text-violet-200' },
    },
    {
        card: { light: 'bg-gradient-to-br from-cyan-50 to-lime-100 border-cyan-200', dark: 'bg-gradient-to-br from-cyan-500/15 to-lime-600/20 border-cyan-400/25' },
        chip: { light: 'bg-cyan-100 text-cyan-700', dark: 'bg-cyan-400/15 text-cyan-200' },
    },
];

let _ilsRatesCache = null;
let _ilsRatesCacheTime = 0;
export function ilsRatesFromUsdRates(rates, meta = {}) {
    const usdIls = Number(rates?.ILS);
    if (!Number.isFinite(usdIls) || usdIls <= 0) return null;
    const rateFor = code => {
        const perUsd = Number(rates?.[code]);
        return Number.isFinite(perUsd) && perUsd > 0 ? +(usdIls / perUsd).toFixed(code === 'JPY' || code === 'THB' || code === 'TRY' || code === 'INR' || code === 'ZAR' ? 4 : 3) : null;
    };
    return {
        USD: +usdIls.toFixed(3),
        EUR: rateFor('EUR'),
        GBP: rateFor('GBP'),
        THB: rateFor('THB'),
        JPY: rateFor('JPY'),
        CAD: rateFor('CAD'),
        AUD: rateFor('AUD'),
        TRY: rateFor('TRY'),
        INR: rateFor('INR'),
        SGD: rateFor('SGD'),
        ZAR: rateFor('ZAR'),
        source: meta.source || '',
        asOf: meta.asOf || '',
        fetchedAt: new Date().toISOString(),
    };
}

export async function fetchIlsRates() {
    const now = Date.now();
    if (_ilsRatesCache && now - _ilsRatesCacheTime < 3_600_000) return _ilsRatesCache;
    const providers = [
        {
            source: 'Frankfurter',
            url: 'https://api.frankfurter.app/latest?from=USD',
            parse: data => ilsRatesFromUsdRates(data?.rates, { source: 'Frankfurter', asOf: data?.date || '' }),
        },
        {
            source: 'Open Exchange Rates mirror',
            url: 'https://open.er-api.com/v6/latest/USD',
            parse: data => ilsRatesFromUsdRates(data?.rates, {
                source: 'open.er-api.com',
                asOf: data?.time_last_update_utc || data?.time_last_update_unix || '',
            }),
        },
    ];
    for (const provider of providers) {
        try {
            const resp = await fetch(provider.url, { cache: 'no-store' });
            if (!resp.ok) continue;
            const parsed = provider.parse(await resp.json());
            if (!parsed) continue;
            _ilsRatesCache = parsed;
            _ilsRatesCacheTime = now;
            return _ilsRatesCache;
        } catch {
            // Try the next live-rate provider.
        }
    }
    return null;
}

export function ratesLineFor(liveRates) {
    if (!liveRates) {
        return 'Live exchange rates could not be fetched by the app. Do not use stale or hardcoded exchange rates. Prefer sources that display ILS directly; if a source displays another currency, use a current exchange-rate source and return that source/date in flightConversionRateSource and flightConversionRateDate.';
    }
    const optional = [
        liveRates.TRY ? `1 TRY = ${liveRates.TRY} ILS` : null,
        liveRates.INR ? `1 INR = ${liveRates.INR} ILS` : null,
        liveRates.SGD ? `1 SGD = ${liveRates.SGD} ILS` : null,
        liveRates.ZAR ? `1 ZAR = ${liveRates.ZAR} ILS` : null,
    ].filter(Boolean).join(', ');
    return `Live exchange rates (${liveRates.source || 'live provider'}${liveRates.asOf ? `, as of ${liveRates.asOf}` : ''}, fetched now): 1 USD = ${liveRates.USD} ILS, 1 EUR = ${liveRates.EUR} ILS, 1 GBP = ${liveRates.GBP} ILS, 1 THB = ${liveRates.THB} ILS, 1 JPY = ${liveRates.JPY} ILS, 1 CAD = ${liveRates.CAD} ILS, 1 AUD = ${liveRates.AUD} ILS${optional ? `, ${optional}` : ''}. Use these exact live rates for all conversions and set flightConversionRateSource="${liveRates.source || 'live provider'}" and flightConversionRateDate="${liveRates.asOf || liveRates.fetchedAt || ''}".`;
}


export const COST_OF_LIVING_PRICE_CONTEXT = `
Use real market ranges and return every numeric amount in Israeli shekels (ILS/NIS), not USD/EUR/THB.
Currency rates will be injected with live rates before this prompt; use them precisely when converting prices. Do not confuse local currency with shekels. Never return a flight price in local currency units as if it were shekels.
costs.rent is HOUSING: a realistic monthly housing cost for the selected lifestyle tier. Add housingType and housingLevel to explain whether this is an apartment, serviced apartment, hotel/guesthouse, and what standard/location it assumes.
For the requested trip length, also return tripHousingCost and tripFoodCost when possible:
- For short stays (1-14 nights), tripHousingCost should be the actual total accommodation cost for those nights, using realistic short-stay options for the tier: hostel/private room/simple guesthouse/budget hotel/short-stay apartment as appropriate. Do not derive it only by dividing monthly rent by 30.
- For medium stays (15-27 nights), use realistic weekly/short monthly discounts when available.
- For 28+ nights, monthly apartment rent can be appropriate.
- tripFoodCost should reflect the requested trip length and tier: groceries/local meals for budget, mixed groceries/restaurants for moderate, more restaurants for premium. Do not simply divide monthly food if the trip length implies tourist eating patterns.
Food, transport, entertainment and other in costs should still be monthly living costs.
costs.flights is NOT monthly. It must be the DIRECT/NON-STOP round-trip airfare for ONE TRIP from Tel Aviv (TLV) to the nearest practical airport, per adult, in ILS. All flight prices must be for direct flights only, with zero stops/connections. Match airfare class to the lifestyle tier: budget-friendly = cheapest available direct economy; moderate = standard direct economy; premium = direct premium economy or business class where available.
flightRoundTrip must equal costs.flights.
For flights, use current live search results from real booking/metasearch/airline sites with the "direct/non-stop only" filter enabled. Return flightSourceName, flightSourceUrl, flightOriginalPrice, flightOriginalCurrency, flightConversionRate, flightConversionRateSource, and flightConversionRateDate. Convert flightOriginalPrice × flightConversionRate to ILS and set both flightRoundTrip and costs.flights to that rounded ILS value. If the source already prices in ILS, use flightOriginalCurrency="ILS", flightConversionRate=1, flightConversionRateSource=flightSourceName, and flightConversionRateDate=current source date. Do not invent a price when you cannot ground it in a current direct-flight source.
For accommodation, use current listings or current hotel/apartment search results appropriate to the requested tier and stay length. Return accommodationSourceName, accommodationSourceUrl, accommodationOriginalPrice, accommodationOriginalCurrency, accommodationConversionRate, accommodationConversionRateSource, and accommodationConversionRateDate. accommodationOriginalPrice must be the total stay price for all requested nights, not nightly. Convert it to ILS and set tripHousingCost to that rounded total.
For car rental, when included, use a current rental search result or rental company listing for the requested destination and rental days. Return carRentalSourceName, carRentalSourceUrl, carRentalOriginalPrice, carRentalOriginalCurrency, carRentalConversionRate, carRentalConversionRateSource, and carRentalConversionRateDate. carRentalOriginalPrice must be the total rental price for all requested car-rental days including basic insurance and local taxes, not daily. Convert it to ILS and set costs.carRental to that rounded total.
Price verification is mandatory before returning JSON:
- Verify flight prices against at least two current sources when possible (for example a metasearch result plus airline/OTA result). If only one source is accessible, cross-check that route, direct-only filter, round-trip/per-person scope, and currency are explicit.
- Reject prices that are one-way fares, include stops, omit taxes/fees, use an unconverted foreign currency, or look like EUR/USD/local-currency values copied into ILS.
- Recalculate conversion manually from flightOriginalPrice × flightConversionRate and ensure it matches flightRoundTrip and costs.flights within rounding.
- Verify accommodation and car rental against current market listings or widely used travel cost sources. Recalculate accommodationOriginalPrice × accommodationConversionRate and carRentalOriginalPrice × carRentalConversionRate where relevant, and make sure totals match tripHousingCost and costs.carRental within rounding.
- In note, briefly mention what was verified (for example direct round-trip flight source, currency conversion, accommodation basis). Do not expose chain-of-thought; just state the checked assumptions.
flightHours = one-way direct flight duration in hours from TLV (Ben Gurion) to the nearest main airport. Use real scheduled flight times, not estimates. Return as a number (e.g. 4 for 4 hours, 3.5 for 3h30m).
If car rental is requested, treat it as "consider car rental", not mandatory. Set costs.carRental to 0 when a car is not useful for that destination (dense/traffic-heavy cities, strong public transport, high parking cost, unsafe driving, or mostly city stay). Add car rental only for places where it materially improves the trip, such as island/coastal/rural destinations, road-trip bases, or spread-out areas. When included, costs.carRental must be a realistic total car rental cost for the requested car days in ILS, including basic insurance and local taxes. If car rental is not requested, return 0.
Lifestyle tiers:
- budget-friendly: a solo traveler on a tight but comfortable budget — not backpacker extreme. Housing = a private single room (not a dorm): budget hotel, simple guesthouse, or a small private room in a hostel/B&B — clean and safe but basic, non-central location is fine. No shared dorms, no self-catering apartments. Food = a genuine mix of street food, local market stalls, and cheap sit-down local restaurants — not cooking at home, but also not tourist restaurants or cafes. Expect meals that a local on a budget would eat. Transport = public transport and walking; occasional cheap local taxi when necessary. Entertainment = low-cost or free local activities, a few inexpensive attractions. Other = bare essentials. This tier should feel budget-conscious but real and enjoyable, not ascetic.
- moderate: normal comfortable long-stay standard for that specific destination. Housing = comfortable private one-bedroom/studio or serviced apartment in a convenient but not top luxury area, with reliable internet/utilities. Food = groceries plus regular cafes/restaurants, including some international options. Transport = good public transport plus occasional taxis/rideshare. Entertainment = regular gym/cafes/activities and a few paid attractions. Other = comfortable routine expenses and small buffers. This tier should feel practical and comfortable, not premium.
- premium: high-comfort local market for that specific destination. Housing = central/high-demand area or high-quality apartment/serviced apartment/hotel-standard stay. Food = frequent restaurants, cafes and higher-quality groceries. Transport = taxis/rideshare often or car budget when normal for that city. Entertainment = frequent paid activities, nightlife, tours, wellness/gym/coworking where relevant. Other = higher service level and convenience buffers. This tier should feel clearly above moderate but not absurd ultra-luxury.
The selected lifestyle tier must be based on the local market of each city, not a universal global cap. For the same destination, budget-friendly should be clearly cheaper than moderate, and moderate clearly cheaper than premium because housing type/location, food choices, transport and entertainment assumptions change.
For each location, costs.rent, food, transport, entertainment and other must all match the selected tier. In housingType/housingLevel and note, briefly describe the assumptions that justify the tier and trip length, such as hotel/private room/apartment, central vs non-central area, mostly local food vs frequent restaurants, and public transport vs taxis.
For the chosen tier, choose cities where the requested stay length including one round-trip flight is plausible within the budget if possible. If not possible, return the closest realistic options and explain the mismatch in budgetNote.
Return 8 diverse city options across different regions when possible, mixing places that fit the budget and aspirational places that may only fit for a shorter stay.
total must equal monthly living costs only: rent + food + transport + entertainment + other. The app will add costs.flights, tripHousingCost/tripFoodCost when relevant, costs.carRental, costs.insurance, and costs.esim to check whether the trip fits the budget. costs.insurance and costs.esim are one-time per-trip costs, not monthly.
`;

export const TIER_PRICE_FLOORS = {
    cheap:     { rent: 900,  food: 700,  transport: 120, entertainment: 250, other: 250 },
    medium:    { rent: 1600, food: 1100, transport: 220, entertainment: 550, other: 450 },
    expensive: { rent: 3000, food: 1800, transport: 450, entertainment: 1200, other: 900 },
};

export const SHORT_STAY_HOUSING_MIN_NIGHTLY = {
    cheap: 160,
    medium: 300,
    expensive: 650,
};

export const SHORT_STAY_HOUSING_FACTOR = {
    cheap: 2.1,
    medium: 2.35,
    expensive: 2.7,
};

export const DEFAULT_TRIP_DAYS = 30;

export function normalizeTripDays(value) {
    const days = Math.floor(numberOrZero(value));
    if (!days) return DEFAULT_TRIP_DAYS;
    return Math.max(1, Math.min(DEFAULT_TRIP_DAYS, days));
}

export function normalizeTripBudget(value, fallback) {
    const budget = Math.round(numberOrZero(value));
    return budget > 0 ? budget : Math.max(0, Math.round(numberOrZero(fallback)));
}

export function normalizeCarRentalDays(value, tripDays) {
    const days = Math.floor(numberOrZero(value));
    if (!days) return tripDays;
    return Math.max(1, Math.min(tripDays, days));
}

export function normalizeTierLivingCost(key, value, selectedTier) {
    if (key === 'flights' || key === 'carRental' || key === 'insurance' || key === 'esim') return Math.max(0, Math.round(value || 0));
    const raw = Math.max(0, Math.round(value || 0));
    if (!raw) return 0;
    return raw;
}

export function housingNightlyCost(costs, selectedTier, nights) {
    const monthlyRent = Math.max(0, Math.round(costs?.rent || 0));
    const monthlyNightly = monthlyRent > 0 ? monthlyRent / DEFAULT_TRIP_DAYS : 0;
    if (nights <= 14) {
        const factor = SHORT_STAY_HOUSING_FACTOR[selectedTier] ?? SHORT_STAY_HOUSING_FACTOR.medium;
        return Math.ceil(monthlyNightly * factor);
    }
    if (nights <= 21) return Math.ceil(monthlyNightly * 1.55);
    return Math.ceil(monthlyNightly);
}

export function tripHousingCostFor(locOrCosts, selectedTier, nights) {
    const explicit = numberOrZero(locOrCosts?.tripHousingCost);
    if (explicit > 0) return Math.round(explicit);
    return housingNightlyCost(locOrCosts?.costs || locOrCosts, selectedTier, nights) * nights;
}

export function tripFoodCostFor(locOrCosts, nights) {
    const explicit = numberOrZero(locOrCosts?.tripFoodCost);
    if (explicit > 0) return Math.round(explicit);
    const costs = locOrCosts?.costs || locOrCosts;
    return Math.ceil((costs?.food || 0) / DEFAULT_TRIP_DAYS) * nights;
}

export function nonHousingDailyCost(costs) {
    return ['transport', 'entertainment', 'other']
        .reduce((sum, key) => sum + Math.ceil((costs?.[key] || 0) / DEFAULT_TRIP_DAYS), 0);
}

export function tripLivingCost(costs, selectedTier, nights, explicit = {}) {
    const transport = explicit.tripTransportCost > 0
        ? Math.round(explicit.tripTransportCost)
        : Math.ceil((costs?.transport || 0) / DEFAULT_TRIP_DAYS) * nights;
    const entertainment = explicit.tripEntertainmentCost > 0
        ? Math.round(explicit.tripEntertainmentCost)
        : Math.ceil((costs?.entertainment || 0) / DEFAULT_TRIP_DAYS) * nights;
    const other = explicit.tripOtherCost > 0
        ? Math.round(explicit.tripOtherCost)
        : Math.ceil((costs?.other || 0) / DEFAULT_TRIP_DAYS) * nights;
    return tripHousingCostFor({ ...explicit, costs }, selectedTier, nights)
        + tripFoodCostFor({ ...explicit, costs }, nights)
        + transport + entertainment + other;
}

export function parseAiJsonObject(reply) {
    const stripJsonControlChars = (value) => value
        .split('')
        .filter((char) => {
            const code = char.charCodeAt(0);
            return code === 0x09 || code === 0x0A || code === 0x0D || code >= 0x20;
        })
        .join('');

    const text = String(reply || '')
        .replace(/^﻿/, '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
        throw new Error('AI response did not include a JSON object');
    }
    const jsonText = stripJsonControlChars(text.slice(start, end + 1))
        .replace(/[\r\n]/g, ' ')
        .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(jsonText);
}


export async function getParsedAiJson(messages, systemPrompt, aiProvider, aiModel, apiKeyOverride, fallbackMessages = null) {
    try {
        return parseAiJsonObject(await getChatResponse(messages, systemPrompt, aiProvider, aiModel, apiKeyOverride));
    } catch (firstError) {
        if (!fallbackMessages) throw firstError;
        try {
            return parseAiJsonObject(await getChatResponse(fallbackMessages, systemPrompt, aiProvider, aiModel, apiKeyOverride));
        } catch (secondError) {
            secondError.message = `${secondError.message || 'AI JSON failed'}; first attempt: ${firstError.message || firstError}`;
            throw secondError;
        }
    }
}

export async function getParsedGroundedAiJson(messages, systemPrompt, aiProvider, aiModel, apiKeyOverride, fallbackMessages = null) {
    const envKey = aiProvider === 'gemini' ? 'VITE_GEMINI_API_KEY' : null;
    const geminiKey = aiProvider === 'gemini'
        ? (apiKeyOverride?.trim() || (envKey ? import.meta.env[envKey]?.trim() : ''))
        : '';
    const supportsGrounding = !!geminiKey && /gemini-2|gemini-exp/.test(aiModel);
    if (!supportsGrounding) {
        return getParsedAiJson(messages, systemPrompt, aiProvider, aiModel, apiKeyOverride, fallbackMessages);
    }
    const runGrounded = async (msgs) => {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({
            model: aiModel,
            tools: [{ googleSearch: {} }],
            systemInstruction: systemPrompt,
        });
        const result = await model.generateContent(msgs.map(m => `${m.role}: ${m.content}`).join('\n\n'));
        return parseAiJsonObject(result.response.text());
    };
    try {
        return await runGrounded(messages);
    } catch (firstError) {
        if (!fallbackMessages) throw firstError;
        try {
            return await runGrounded(fallbackMessages);
        } catch (secondError) {
            secondError.message = `${secondError.message || 'Grounded AI JSON failed'}; first attempt: ${firstError.message || firstError}`;
            throw secondError;
        }
    }
}

export function aiErrorMessage(err, isHe) {
    const raw = String(err?.message || err || '');
    if (/missing api key/i.test(raw)) return isHe ? 'חסר API key לספק ה-AI שנבחר' : 'Missing API key for the selected AI provider';
    if (/quota|rate|429/i.test(raw)) return isHe ? 'הספק החזיר מגבלת שימוש או עומס. נסה שוב עוד רגע' : 'The AI provider returned a rate/quota limit. Try again shortly';
    if (/json|object|parse|unexpected|unterminated/i.test(raw)) return isHe ? 'ה-AI החזיר תשובה לא תקינה במקום JSON מלא. נסה שוב' : 'The AI returned an invalid or incomplete JSON response. Try again';
    if (/candidate|safety|blocked|finish/i.test(raw)) return isHe ? 'הספק חסם או חתך את התשובה. נסה שוב או החלף מודל' : 'The provider blocked or truncated the response. Try again or switch model';
    return isHe ? `שגיאה בטעינת ההמלצות: ${raw.slice(0, 120)}` : `Error loading suggestions: ${raw.slice(0, 120)}`;
}

export const AIRFARE_REGIONS = [
    {
        minTripDays: 14,
        flightHours: [14, 20],
        re: /(argentina|buenos aires|chile|santiago|peru|lima|brazil|rio|sao paulo|colombia|bogota|ecuador|uruguay|montevideo|australia|sydney|melbourne|new zealand|auckland|wellington|fiji|tahiti)/,
    },
    {
        minTripDays: 10,
        flightHours: [11, 15],
        re: /(usa|united states|canada|toronto|vancouver|montreal|new york|miami|los angeles|san francisco|chicago|boston|washington|seattle|mexico|cancun|mexico city)/,
    },
    {
        minTripDays: 10,
        flightHours: [8, 11],
        re: /(south africa|cape town|johannesburg|kenya|nairobi|tanzania|zanzibar|ethiopia|ghana|senegal|mauritius|seychelles|uganda|rwanda|namibia|botswana)/,
    },
    {
        minTripDays: 7,
        flightHours: [8, 12],
        re: /(thailand|bangkok|chiang mai|phuket|vietnam|hanoi|ho chi minh|da nang|bali|indonesia|malaysia|kuala lumpur|philippines|manila|singapore|cambodia|laos|japan|tokyo|osaka|korea|seoul|china|beijing|shanghai|hong kong|taiwan|taipei|india|delhi|mumbai|goa|sri lanka|colombo|nepal|kathmandu)/,
    },
    {
        minTripDays: 4,
        flightHours: [3, 6],
        re: /(uae|dubai|abu dhabi|qatar|doha|bahrain|oman|muscat|saudi|riyadh|jeddah|uzbekistan|tashkent|kazakhstan|almaty|azerbaijan|baku|armenia|yerevan)/,
    },
    {
        minTripDays: 2,
        flightHours: [1, 3],
        re: /(cyprus|larnaca|paphos)/,
    },
    {
        minTripDays: 3,
        flightHours: [2.5, 3.5],
        re: /(greece|athens|crete|rhodes|thessaloniki)/,
    },
    {
        minTripDays: 3,
        flightHours: [3, 5],
        re: /(portugal|lisbon|porto|spain|madrid|barcelona|italy|rome|milan|france|paris|germany|berlin|munich|austria|vienna|netherlands|amsterdam|belgium|brussels|switzerland|zurich|poland|warsaw|krakow|hungary|budapest|czech|prague|romania|bucharest|bulgaria|sofia|serbia|belgrade|croatia|zagreb|montenegro|albania|georgia|tbilisi|morocco|marrakesh|casablanca|egypt|cairo|tunisia)/,
    },
    {
        minTripDays: 2,
        flightHours: [1, 3],
        re: /(jordan|amman|turkey|istanbul|antalya)/,
    },
];

export const CAR_RENTAL_AVOID_RE = /(bangkok|בנגקוק|tokyo|טוקיו|osaka|אוסקה|seoul|סיאול|singapore|סינגפור|hong kong|הונג קונג|taipei|טאיפיי|paris|פריז|london|לונדון|new york|ניו יורק|istanbul|איסטנבול|cairo|קהיר|marrakesh|מרקש|amsterdam|אמסטרדם|berlin|ברלין|madrid|מדריד|barcelona|ברצלונה|rome|רומא|lisbon|ליסבון|athens|אתונה)/i;
export const CAR_RENTAL_USEFUL_RE = /(larnaca|לרנקה|paphos|פאפוס|cyprus|קפריסין|crete|כרתים|rhodes|רודוס|tuscany|טוסקנה|algarve|אלגרבה|madeira|מדיירה|azores|איים האזוריים|sicily|סיציליה|sardinia|סרדיניה|zanzibar|זנזיבר|mauritius|מאוריציוס|seychelles|סיישל|bali|באלי|phuket|פוקט|chiang mai|צ'יאנג מאי|cape town|קייפטאון|georgia|גאורגיה|tbilisi|טביליסי|montenegro|מונטנגרו|croatia|קרואטיה|slovenia|סלובניה|iceland|איסלנד)/i;

export function shouldIncludeCarRental(loc) {
    const text = `${loc?.city || ''} ${loc?.country || ''} ${loc?.countryEn || ''}`.toLowerCase();
    if (CAR_RENTAL_USEFUL_RE.test(text)) return true;
    if (CAR_RENTAL_AVOID_RE.test(text)) return false;
    return false;
}

export function recalcLocationTrip(loc, availableAmount, useCar) {
    const costs = { ...(loc.costs || {}) };
    const carRentalCost = useCar ? Math.max(0, Math.round(loc.carRentalOriginalCost || costs.carRental || 0)) : 0;
    const carRentalDays = useCar ? (loc.carRentalOriginalDays || loc.carRentalDays || loc.tripDays || 0) : 0;
    costs.carRental = carRentalCost;

    const selectedTier = loc.tier || 'medium';
    const tripDays = loc.tripDays || DEFAULT_TRIP_DAYS;
    const roundTrip = normalizeRoundTripAirfare(loc.flightRoundTrip, costs.flights);
    costs.flights = roundTrip;
    const explicitTripCosts = {
        tripHousingCost: loc.tripHousingCost,
        tripFoodCost: loc.tripFoodCost,
        tripTransportCost: loc.tripTransportCost,
        tripEntertainmentCost: loc.tripEntertainmentCost,
        tripOtherCost: loc.tripOtherCost,
    };
    const stayCost = tripLivingCost(costs, selectedTier, tripDays, explicitTripCosts);
    const fullTripCost = stayCost + roundTrip + carRentalCost;
    const carDailyCost = useCar && carRentalDays > 0 ? Math.ceil(carRentalCost / carRentalDays) : 0;

    let daysAffordable = 0;
    for (let d = 1; d <= tripDays; d += 1) {
        const carDaysForStay = useCar ? Math.min(d, carRentalDays) : 0;
        const proportionalExplicit = {
            tripHousingCost: loc.tripHousingCost ? Math.round(loc.tripHousingCost * (d / tripDays)) : 0,
            tripFoodCost: loc.tripFoodCost ? Math.round(loc.tripFoodCost * (d / tripDays)) : 0,
            tripTransportCost: loc.tripTransportCost ? Math.round(loc.tripTransportCost * (d / tripDays)) : 0,
            tripEntertainmentCost: loc.tripEntertainmentCost ? Math.round(loc.tripEntertainmentCost * (d / tripDays)) : 0,
            tripOtherCost: loc.tripOtherCost ? Math.round(loc.tripOtherCost * (d / tripDays)) : 0,
        };
        const candidateCost = roundTrip + tripLivingCost(costs, selectedTier, d, proportionalExplicit) + carDailyCost * carDaysForStay;
        if (candidateCost <= availableAmount) daysAffordable = d;
    }

    const monthFits = availableAmount ? fullTripCost <= availableAmount * 1.05 : true;
    const affordableTripCost = monthFits
        ? fullTripCost
        : (daysAffordable > 0 ? roundTrip + tripLivingCost(costs, selectedTier, daysAffordable, {
            tripHousingCost: loc.tripHousingCost ? Math.round(loc.tripHousingCost * (daysAffordable / tripDays)) : 0,
            tripFoodCost: loc.tripFoodCost ? Math.round(loc.tripFoodCost * (daysAffordable / tripDays)) : 0,
            tripTransportCost: loc.tripTransportCost ? Math.round(loc.tripTransportCost * (daysAffordable / tripDays)) : 0,
            tripEntertainmentCost: loc.tripEntertainmentCost ? Math.round(loc.tripEntertainmentCost * (daysAffordable / tripDays)) : 0,
            tripOtherCost: loc.tripOtherCost ? Math.round(loc.tripOtherCost * (daysAffordable / tripDays)) : 0,
        }) + carDailyCost * Math.min(daysAffordable, carRentalDays) : 0);
    const dailyCost = monthFits
        ? Math.ceil(fullTripCost / tripDays)
        : (daysAffordable > 0 ? Math.ceil(affordableTripCost / daysAffordable) : 0);

    return {
        ...loc,
        costs,
        total: affordableTripCost,
        fullTripCost,
        dailyCost,
        daysAffordable,
        monthFits,
        includeCarRental: useCar,
        carRentalDays,
    };
}

export function getLocationTripNights(loc) {
    return loc?.monthFits ? (loc.tripDays || DEFAULT_TRIP_DAYS) : (loc.daysAffordable || 0);
}

export function tripBreakdownFor(loc) {
    const costs = loc?.costs || {};
    const nights = getLocationTripNights(loc);
    const breakdown = {};
    const requestedNights = loc?.tripDays || nights || DEFAULT_TRIP_DAYS;
    breakdown.housing = tripHousingCostFor({
        costs,
        tripHousingCost: loc?.tripHousingCost && nights !== requestedNights
            ? Math.round(loc.tripHousingCost * (nights / requestedNights))
            : loc?.tripHousingCost,
    }, loc?.tier || 'medium', nights);
    breakdown.fuel = 0;
    breakdown.food = tripFoodCostFor({
        costs,
        tripFoodCost: loc?.tripFoodCost && nights !== requestedNights
            ? Math.round(loc.tripFoodCost * (nights / requestedNights))
            : loc?.tripFoodCost,
    }, nights);
    const explicitVariableCosts = {
        transport: loc?.tripTransportCost,
        entertainment: loc?.tripEntertainmentCost,
        other: loc?.tripOtherCost,
    };
    ['transport', 'entertainment', 'other'].forEach((key) => {
        const explicit = explicitVariableCosts[key];
        breakdown[key] = explicit > 0
            ? Math.round(explicit * (nights / requestedNights))
            : Math.ceil((costs[key] || 0) / DEFAULT_TRIP_DAYS) * nights;
    });
    breakdown.flights = costs.flights || 0;
    breakdown.carRental = loc?.includeCarRental ? (costs.carRental || 0) : 0;
    breakdown.insurance = costs.insurance || 0;
    breakdown.esim = costs.esim || 0;
    return { nights, breakdown };
}

export const numberOrZero = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(/[^\d.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

export const COUNTRY_CODE_LOOKUP = {
    'מצרים': 'EG', 'egypt': 'EG',
    'תאילנד': 'TH', 'thailand': 'TH',
    'פורטוגל': 'PT', 'portugal': 'PT',
    'יוון': 'GR', 'greece': 'GR',
    'קפריסין': 'CY', 'cyprus': 'CY',
    'ספרד': 'ES', 'spain': 'ES',
    'איטליה': 'IT', 'italy': 'IT',
    'צרפת': 'FR', 'france': 'FR',
    'גרמניה': 'DE', 'germany': 'DE',
    'אוסטריה': 'AT', 'austria': 'AT',
    'הולנד': 'NL', 'netherlands': 'NL',
    'בלגיה': 'BE', 'belgium': 'BE',
    'שוויץ': 'CH', 'switzerland': 'CH',
    'פולין': 'PL', 'poland': 'PL',
    'הונגריה': 'HU', 'hungary': 'HU',
    'צ׳כיה': 'CZ', 'צכיה': 'CZ', 'czechia': 'CZ', 'czech republic': 'CZ',
    'רומניה': 'RO', 'romania': 'RO',
    'בולגריה': 'BG', 'bulgaria': 'BG',
    'סרביה': 'RS', 'serbia': 'RS',
    'קרואטיה': 'HR', 'croatia': 'HR',
    'מונטנגרו': 'ME', 'montenegro': 'ME',
    'אלבניה': 'AL', 'albania': 'AL',
    'גאורגיה': 'GE', 'גרוזיה': 'GE', 'georgia': 'GE',
    'מרוקו': 'MA', 'morocco': 'MA',
    'טורקיה': 'TR', 'turkey': 'TR',
    'ירדן': 'JO', 'jordan': 'JO',
    'איחוד האמירויות': 'AE', 'איחוד אמירויות': 'AE', 'uae': 'AE', 'united arab emirates': 'AE',
    'קטאר': 'QA', 'qatar': 'QA',
    'אומן': 'OM', 'עומאן': 'OM', 'oman': 'OM',
    'ערב הסעודית': 'SA', 'saudi arabia': 'SA',
    'וייטנאם': 'VN', 'vietnam': 'VN',
    'אינדונזיה': 'ID', 'indonesia': 'ID',
    'מלזיה': 'MY', 'malaysia': 'MY',
    'פיליפינים': 'PH', 'philippines': 'PH',
    'סינגפור': 'SG', 'singapore': 'SG',
    'קמבודיה': 'KH', 'cambodia': 'KH',
    'לאוס': 'LA', 'laos': 'LA',
    'יפן': 'JP', 'japan': 'JP',
    'דרום קוריאה': 'KR', 'קוריאה': 'KR', 'south korea': 'KR', 'korea': 'KR',
    'סין': 'CN', 'china': 'CN',
    'הונג קונג': 'HK', 'hong kong': 'HK',
    'טאיוואן': 'TW', 'taiwan': 'TW',
    'הודו': 'IN', 'india': 'IN',
    'סרי לנקה': 'LK', 'sri lanka': 'LK',
    'נפאל': 'NP', 'nepal': 'NP',
    'ארצות הברית': 'US', 'ארהב': 'US', 'ארה״ב': 'US', 'united states': 'US', 'usa': 'US',
    'קנדה': 'CA', 'canada': 'CA',
    'מקסיקו': 'MX', 'mexico': 'MX',
    'ברזיל': 'BR', 'brazil': 'BR',
    'ארגנטינה': 'AR', 'argentina': 'AR',
    'צ׳ילה': 'CL', 'צילה': 'CL', 'chile': 'CL',
    'קולומביה': 'CO', 'colombia': 'CO',
    'פרו': 'PE', 'peru': 'PE',
    'אוסטרליה': 'AU', 'australia': 'AU',
    'ניו זילנד': 'NZ', 'new zealand': 'NZ',
    'דרום אפריקה': 'ZA', 'south africa': 'ZA',
    'קניה': 'KE', 'kenya': 'KE',
    'טנזניה': 'TZ', 'tanzania': 'TZ',
    'אתיופיה': 'ET', 'ethiopia': 'ET',
    'מאוריציוס': 'MU', 'mauritius': 'MU',
    'סיישל': 'SC', 'seychelles': 'SC',
};

export function countryCodeFor(loc) {
    const directCode = (loc?.countryCode || loc?.country_code || '').trim();
    if (/^[A-Za-z]{2,3}$/.test(directCode)) return directCode.slice(0, 2).toUpperCase();
    const lookupKey = (loc?.country || loc?.countryEn || loc?.countryEnglish || '').trim().toLowerCase();
    if (COUNTRY_CODE_LOOKUP[lookupKey]) return COUNTRY_CODE_LOOKUP[lookupKey];
    return '';
}

export function countryInitials(loc) {
    const code = countryCodeFor(loc);
    if (code) return code;
    const source = (loc?.countryEn || loc?.countryEnglish || loc?.country || loc?.city || '').trim();
    if (!source) return '??';
    const words = source
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z\s-]/g, ' ')
        .split(/[\s-]+/)
        .filter(Boolean);
    if (!words.length) return 'NA';
    if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
    return words[0].slice(0, 2).toUpperCase();
}

export function flagImageUrlFor(loc) {
    const code = countryCodeFor(loc);
    return code ? `https://flagcdn.com/w40/${code.toLowerCase()}.png` : '';
}

export function locationKeyFor(loc) {
    return `${loc?.city || ''} ${loc?.country || loc?.countryEn || ''}`
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

export function airfareRegionFor(loc) {
    const text = `${loc?.city || ''} ${loc?.country || ''}`.toLowerCase();
    return AIRFARE_REGIONS.find(region => region.re.test(text)) || { minTripDays: 3, flightHours: [3, 5] };
}

export function normalizeRoundTripAirfare(rawAirfare, costsAirfare) {
    return Math.max(0, Math.round(numberOrZero(rawAirfare) || numberOrZero(costsAirfare) || 0));
}

export function flightHoursLabel(loc) {
    const [min, max] = airfareRegionFor(loc).flightHours || [3, 5];
    return min === max ? `${min}h` : `${min}-${max}h`;
}

export function normalizeLocationSuggestions(data, selectedTier, availableAmount, isHe, tripDays, includeCarRental, carRentalDaysInput, dailyTarget = 0) {
    const locations = Array.isArray(data?.locations) ? data.locations : [];
    const requestedDays = normalizeTripDays(tripDays);
    const requestedCarDays = includeCarRental ? normalizeCarRentalDays(carRentalDaysInput, requestedDays) : 0;
    let overBudgetCount = 0;
    return {
        budgetFits: selectedTier,
        budgetNote: '',
        locations: (() => {
            const normalizedLocations = locations.map(raw => {
            const costs = {};
            COST_KEYS.forEach(({ key }) => {
                costs[key] = normalizeTierLivingCost(key, numberOrZero(raw?.costs?.[key]), selectedTier);
            });

            const region = airfareRegionFor(raw);
            const aiRoundTrip = numberOrZero(raw?.flightRoundTrip ?? raw?.singleTripFlight ?? raw?.flightsRoundTrip ?? raw?.flightsAnnualRoundTrip ?? raw?.annualRoundTripFlight);
            const roundTrip = normalizeRoundTripAirfare(aiRoundTrip, costs.flights);
            costs.flights = roundTrip;

            const carRentalUseful = includeCarRental && shouldIncludeCarRental(raw);
            if (!carRentalUseful) costs.carRental = 0;
            const explicitTripCosts = {
                tripHousingCost: numberOrZero(raw?.tripHousingCost ?? raw?.housingTripCost ?? raw?.accommodationTripCost),
                tripFoodCost: numberOrZero(raw?.tripFoodCost ?? raw?.foodTripCost),
                tripTransportCost: numberOrZero(raw?.tripTransportCost),
                tripEntertainmentCost: numberOrZero(raw?.tripEntertainmentCost),
                tripOtherCost: numberOrZero(raw?.tripOtherCost),
            };

            const livingMonthly = COST_KEYS
                .filter(({ key }) => key !== 'flights' && key !== 'carRental' && key !== 'insurance' && key !== 'esim')
                .reduce((sum, { key }) => sum + costs[key], 0);
            const livingDailyCost = livingMonthly > 0 ? Math.ceil(tripLivingCost(costs, selectedTier, requestedDays, explicitTripCosts) / requestedDays) : 0;
            const stayCost = tripLivingCost(costs, selectedTier, requestedDays, explicitTripCosts);
            const carRentalCost = carRentalUseful ? Math.max(0, Math.round(costs.carRental || 0)) : 0;
            const carRentalIncluded = carRentalUseful && carRentalCost > 0;
            costs.carRental = carRentalCost;
            const fixedTripExtras = (costs.insurance || 0) + (costs.esim || 0);
            const fullTripCost = stayCost + roundTrip + carRentalCost + fixedTripExtras;
            if (availableAmount && fullTripCost > availableAmount) overBudgetCount += 1;
            const carDailyCost = carRentalIncluded && requestedCarDays > 0 ? Math.ceil(carRentalCost / requestedCarDays) : 0;
            let daysAffordable = 0;
            for (let d = 1; d <= requestedDays; d += 1) {
                const carDaysForStay = carRentalIncluded ? Math.min(d, requestedCarDays) : 0;
                const proportionalExplicit = {
                    tripHousingCost: explicitTripCosts.tripHousingCost ? Math.round(explicitTripCosts.tripHousingCost * (d / requestedDays)) : 0,
                    tripFoodCost: explicitTripCosts.tripFoodCost ? Math.round(explicitTripCosts.tripFoodCost * (d / requestedDays)) : 0,
                    tripTransportCost: explicitTripCosts.tripTransportCost ? Math.round(explicitTripCosts.tripTransportCost * (d / requestedDays)) : 0,
                    tripEntertainmentCost: explicitTripCosts.tripEntertainmentCost ? Math.round(explicitTripCosts.tripEntertainmentCost * (d / requestedDays)) : 0,
                    tripOtherCost: explicitTripCosts.tripOtherCost ? Math.round(explicitTripCosts.tripOtherCost * (d / requestedDays)) : 0,
                };
                const candidateCost = roundTrip + tripLivingCost(costs, selectedTier, d, proportionalExplicit) + carDailyCost * carDaysForStay + fixedTripExtras;
                if (candidateCost <= availableAmount) daysAffordable = d;
            }
            const monthFits = availableAmount ? fullTripCost <= availableAmount * 1.05 : true;
            const affordableTripCost = monthFits
                ? fullTripCost
                : (daysAffordable > 0 ? roundTrip + tripLivingCost(costs, selectedTier, daysAffordable, {
                    tripHousingCost: explicitTripCosts.tripHousingCost ? Math.round(explicitTripCosts.tripHousingCost * (daysAffordable / requestedDays)) : 0,
                    tripFoodCost: explicitTripCosts.tripFoodCost ? Math.round(explicitTripCosts.tripFoodCost * (daysAffordable / requestedDays)) : 0,
                    tripTransportCost: explicitTripCosts.tripTransportCost ? Math.round(explicitTripCosts.tripTransportCost * (daysAffordable / requestedDays)) : 0,
                    tripEntertainmentCost: explicitTripCosts.tripEntertainmentCost ? Math.round(explicitTripCosts.tripEntertainmentCost * (daysAffordable / requestedDays)) : 0,
                    tripOtherCost: explicitTripCosts.tripOtherCost ? Math.round(explicitTripCosts.tripOtherCost * (daysAffordable / requestedDays)) : 0,
                }) + carDailyCost * Math.min(daysAffordable, requestedCarDays) + fixedTripExtras : 0);
            const displayDailyCost = monthFits
                ? Math.ceil(fullTripCost / requestedDays)
                : (daysAffordable > 0 ? Math.ceil(affordableTripCost / daysAffordable) : 0);
            const defaultHousingType = isHe
                ? (selectedTier === 'expensive' ? 'דירה איכותית במיקום מרכזי' : selectedTier === 'cheap' ? 'דירה צנועה או סטודיו באזור בטוח' : 'דירת חדר נוחה להשכרה ארוכה')
                : (selectedTier === 'expensive' ? 'high-quality apartment in a central area' : selectedTier === 'cheap' ? 'modest apartment or studio in a safe area' : 'comfortable long-term one-bedroom apartment');
            return {
                city: raw?.city || '',
                country: raw?.country || '',
                countryCode: raw?.countryCode || raw?.country_code || '',
                countryEn: raw?.countryEn || raw?.countryEnglish || '',
                flag: raw?.flag || '🌍',
                note: raw?.note || '',
                total: affordableTripCost,
                fullTripCost,
                livingMonthly,
                tripDays: requestedDays,
                tier: selectedTier,
                includeCarRental: carRentalIncluded,
                carRentalRequested: includeCarRental,
                carRentalDays: carRentalIncluded ? requestedCarDays : 0,
                carRentalUseful,
                carRentalToggleable: carRentalIncluded,
                carRentalOriginalCost: carRentalCost,
                carRentalOriginalDays: carRentalIncluded ? requestedCarDays : 0,
                costs,
                tripHousingCost: Math.round(explicitTripCosts.tripHousingCost || 0),
                tripFoodCost: Math.round(explicitTripCosts.tripFoodCost || 0),
                tripTransportCost: Math.round(explicitTripCosts.tripTransportCost || 0),
                tripEntertainmentCost: Math.round(explicitTripCosts.tripEntertainmentCost || 0),
                tripOtherCost: Math.round(explicitTripCosts.tripOtherCost || 0),
                housingType: raw?.housingType || raw?.accommodationType || defaultHousingType,
                housingLevel: raw?.housingLevel || raw?.housingStandard || (isHe ? TIER_META[selectedTier]?.labelHe : TIER_META[selectedTier]?.labelEn),
                flightRoundTrip: roundTrip,
                flightHours: numberOrZero(raw?.flightHours) || 0,
                flightSourceName: raw?.flightSourceName || raw?.flightSource || raw?.flightProvider || '',
                flightSourceUrl: raw?.flightSourceUrl || raw?.flightUrl || '',
                flightOriginalPrice: numberOrZero(raw?.flightOriginalPrice ?? raw?.flightPriceOriginal),
                flightOriginalCurrency: raw?.flightOriginalCurrency || raw?.flightCurrency || '',
                flightConversionRate: numberOrZero(raw?.flightConversionRate ?? raw?.conversionRate),
                flightConversionRateSource: raw?.flightConversionRateSource || raw?.conversionRateSource || '',
                flightConversionRateDate: raw?.flightConversionRateDate || raw?.conversionRateDate || '',
                accommodationSourceName: raw?.accommodationSourceName || raw?.housingSourceName || raw?.hotelSourceName || '',
                accommodationSourceUrl: raw?.accommodationSourceUrl || raw?.housingSourceUrl || raw?.hotelSourceUrl || '',
                accommodationOriginalPrice: numberOrZero(raw?.accommodationOriginalPrice ?? raw?.housingOriginalPrice ?? raw?.hotelOriginalPrice),
                accommodationOriginalCurrency: raw?.accommodationOriginalCurrency || raw?.housingOriginalCurrency || raw?.hotelOriginalCurrency || '',
                accommodationConversionRate: numberOrZero(raw?.accommodationConversionRate ?? raw?.housingConversionRate ?? raw?.hotelConversionRate),
                accommodationConversionRateSource: raw?.accommodationConversionRateSource || raw?.housingConversionRateSource || raw?.hotelConversionRateSource || '',
                accommodationConversionRateDate: raw?.accommodationConversionRateDate || raw?.housingConversionRateDate || raw?.hotelConversionRateDate || '',
                carRentalSourceName: raw?.carRentalSourceName || raw?.rentalCarSourceName || '',
                carRentalSourceUrl: raw?.carRentalSourceUrl || raw?.rentalCarSourceUrl || '',
                carRentalOriginalPrice: numberOrZero(raw?.carRentalOriginalPrice ?? raw?.rentalCarOriginalPrice),
                carRentalOriginalCurrency: raw?.carRentalOriginalCurrency || raw?.rentalCarOriginalCurrency || '',
                carRentalConversionRate: numberOrZero(raw?.carRentalConversionRate ?? raw?.rentalCarConversionRate),
                carRentalConversionRateSource: raw?.carRentalConversionRateSource || raw?.rentalCarConversionRateSource || '',
                carRentalConversionRateDate: raw?.carRentalConversionRateDate || raw?.rentalCarConversionRateDate || '',
                minTripDays: region.minTripDays || 2,
                livingDailyCost,
                dailyCost: displayDailyCost,
                daysAffordable,
                monthFits,
            };
            }).filter(loc => (loc.monthFits || loc.daysAffordable > 0) && requestedDays >= loc.minTripDays);
            return normalizedLocations
                .sort((a, b) => {
                    const aTier = a.monthFits ? 0 : 1;
                    const bTier = b.monthFits ? 0 : 1;
                    if (aTier !== bTier) return aTier - bTier;
                    if (b.daysAffordable !== a.daysAffordable) return b.daysAffordable - a.daysAffordable;
                    return a.dailyCost - b.dailyCost;
                });
        })(),
        ...(overBudgetCount > 0 && availableAmount ? {
            budgetNote: data?.budgetNote || (isHe
                ? `${overBudgetCount} הצעות לא נכנסות לחודש מלא כולל טיסה; מוצג כמה לילות כן נכנסים בתקציב.`
                : `${overBudgetCount} suggested location(s) do not fit a full month including flight; affordable nights are shown.`),
        } : {}),
    };
}

export function sourceMetaForCost(item, key) {
    const prefix = key === 'flights'
        ? 'flight'
        : key === 'housing'
            ? 'accommodation'
            : key === 'carRental'
                ? 'carRental'
                : '';
    if (!prefix) return null;
    const name = item?.[`${prefix}SourceName`];
    if (!name) return null;
    return {
        name,
        url: item?.[`${prefix}SourceUrl`] || '',
        originalPrice: numberOrZero(item?.[`${prefix}OriginalPrice`]),
        originalCurrency: item?.[`${prefix}OriginalCurrency`] || '',
        conversionRateSource: item?.[`${prefix}ConversionRateSource`] || '',
        conversionRateDate: item?.[`${prefix}ConversionRateDate`] || '',
    };
}
