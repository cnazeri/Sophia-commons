// The website's own translations (lang/*.json), so the app speaks the same English, German, Spanish and Russian.
// t('events.lang_tag', 'In {lang}') returns the phone's language, else English, else the fallback.
import { getLocales } from 'expo-localization';

import de from '@/i18n/de.json';
import en from '@/i18n/en.json';
import es from '@/i18n/es.json';
import ru from '@/i18n/ru.json';

// The site files also hold a few lists (month names); only text entries are used here.
type Dict = Record<string, unknown>;
const DICTS: Record<string, Dict> = { en, de, es, ru } as Record<string, Dict>;
export const LANGS = ['en', 'de', 'es', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

function phoneLang(): Lang {
  const code = (getLocales()[0]?.languageCode || 'en').toLowerCase();
  return (LANGS as readonly string[]).includes(code) ? (code as Lang) : 'en';
}

let current: Lang = phoneLang();
export const getLang = () => current;
export const setLang = (l: Lang) => { current = l; };

export function t(key: string, fallback?: string, vars?: Record<string, string | number>): string {
  const pick = (d: Dict) => (typeof d[key] === 'string' ? (d[key] as string) : undefined);
  let s = pick(DICTS[current]) ?? pick(DICTS.en) ?? fallback ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

// Dates in the phone's language, e.g. "Sun, Nov 29"
export function localDate(iso: string, opts: Intl.DateTimeFormatOptions): string {
  try { return new Date(iso).toLocaleDateString(current, opts); } catch { return iso.slice(0, 10); }
}
export function localTime(iso: string, timeZone?: string): string {
  try { return new Date(iso).toLocaleTimeString(current, { hour: 'numeric', minute: '2-digit', timeZone }); } catch { return ''; }
}
