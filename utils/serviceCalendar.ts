// utils/serviceCalendar.ts
// Dynamic service calendar — reads from Supabase with in-memory cache and local fallback.

import { supabase } from '../supabaseClient';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface ServiceCalendarEntry {
  date: string;       // "YYYY-MM-DD"
  service_id: string; // "000" | "100" | "200" | "300" | "400" | "500" | "504" | etc.
  description?: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────────────────
// In-memory cache (avoids redundant DB queries)
// ─────────────────────────────────────────────────────────

let _cache: Record<string, ServiceCalendarEntry> | null = null;
let _cacheLoadedAt: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getCalendarCache(): Promise<Record<string, ServiceCalendarEntry>> {
  const now = Date.now();
  if (_cache && now - _cacheLoadedAt < CACHE_TTL_MS) return _cache;

  try {
    const { data, error } = await supabase
      .from('service_calendar')
      .select('date, service_id, description, updated_at');

    if (error || !data) throw error;

    _cache = {};
    for (const row of data) {
      _cache[row.date] = row as ServiceCalendarEntry;
    }
    _cacheLoadedAt = now;
  } catch {
    // If DB unreachable, return existing cache (may be null → fallback will handle it)
    if (!_cache) _cache = {};
  }

  return _cache!;
}

/** Force-invalidates the cache so the next query fetches fresh data */
export function invalidateServiceCalendarCache() {
  _cache = null;
  _cacheLoadedAt = 0;
}

// ─────────────────────────────────────────────────────────
// Standard weekly fallback (when no DB entry exists)
// ─────────────────────────────────────────────────────────

/**
 * Returns the "effective" FGC service date.
 * FGC service days run from 03:00 AM to 02:59 AM the next day.
 * So if the current time is before 03:00 AM, the effective date is yesterday.
 */
export function getEffectiveDate(now: Date = new Date()): Date {
  if (now.getHours() < 3) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }
  return now;
}

function getDefaultServiceForDate(date: Date): string {
  const day = date.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0) return '500'; // Sunday
  if (day === 6) return '400'; // Saturday
  if (day === 5) return '100'; // Friday
  return '0';                  // Mon–Thu (laborable) — matches the DB 'servei' field
}

/**
 * Maps a 3-digit calendar code (e.g. '000', '200', '800') to the
 * 4 filter keys used in the UI and DB ('0', '100', '400', '500').
 *
 * The calendar has fine-grained codes (e.g. '200' = August laborable,
 * '700' = Diada) but the shifts table only stores one of the 4 base codes.
 * This function collapses them so the filter pre-selects the right button.
 */
export function calendarCodeToFilterCode(code: string): string {
  const first = code[0];
  // 0xx, 2xx, 3xx, 8xx, 9xx → laborable bucket ('0')
  if (first === '0' || first === '2' || first === '8') return '0';
  // 1xx, 3xx, 9xx → divendres / pre-festiu bucket ('100')
  if (first === '1' || first === '3' || first === '9') return '100';
  // 4xx, 6xx, 7xx → dissabte / festiu bucket ('400')
  if (first === '4' || first === '6' || first === '7') return '400';
  // 5xx → diumenge / post-festiu bucket ('500')
  if (first === '5') return '500';
  // Unknown → return as-is
  return code;
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

/** Returns the service code for a given Date, consulting Supabase first. */
export async function getServiceForDateAsync(date: Date): Promise<string> {
  const key = formatDateKey(date);
  const cache = await getCalendarCache();
  if (cache[key]) return cache[key].service_id;
  return getDefaultServiceForDate(date);
}

/** Synchronous version — uses cache only, falls back to weekly rule. Safe to call in render. */
export function getServiceForDateSync(date: Date): string {
  const key = formatDateKey(date);
  if (_cache && _cache[key]) return _cache[key].service_id;
  return getDefaultServiceForDate(date);
}

/** Returns today's service code (async, preferred). Uses 3 AM cutoff rule. */
export async function getServiceTodayAsync(): Promise<string> {
  return getServiceForDateAsync(getEffectiveDate());
}

/** Kept for backward-compat with existing calls to getServiceToday(). Uses cache and 3 AM cutoff rule. */
export function getServiceToday(): string {
  return getServiceForDateSync(getEffectiveDate());
}

/** Kept for backward-compat with getServiceForDate(date) usage. Uses cache. */
export function getServiceForDate(date: Date): string {
  return getServiceForDateSync(date);
}

// ─────────────────────────────────────────────────────────
// Calendar management (CRUD for the calendar view)
// ─────────────────────────────────────────────────────────

/** Fetches all entries for a given month (returns all rows). */
export async function fetchCalendarMonth(year: number, month: number): Promise<ServiceCalendarEntry[]> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('service_calendar')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date');

  if (error) throw error;
  return data || [];
}

/** Fetches all entries for a given year. */
export async function fetchCalendarYear(year: number): Promise<ServiceCalendarEntry[]> {
  const { data, error } = await supabase
    .from('service_calendar')
    .select('*')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date');

  if (error) throw error;
  return data || [];
}

/** Upserts a single calendar entry. Invalidates cache. */
export async function upsertCalendarEntry(entry: ServiceCalendarEntry): Promise<void> {
  const { error } = await supabase
    .from('service_calendar')
    .upsert({ ...entry }, { onConflict: 'date' });

  if (error) throw error;
  invalidateServiceCalendarCache();
}

/** Deletes a calendar override (reverts to default weekly rule). Invalidates cache. */
export async function deleteCalendarEntry(date: string): Promise<void> {
  const { error } = await supabase
    .from('service_calendar')
    .delete()
    .eq('date', date);

  if (error) throw error;
  invalidateServiceCalendarCache();
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns a human-readable label for a service code */
export function getServiceLabel(code: string | undefined): string {
  if (!code) return 'Estàndard';
  const base = code.substring(0, 1);
  const labels: Record<string, string> = {
    '0': 'Laborable (0)',
    '1': 'Divendres / Pre-Festiu (100)',
    '2': 'Agost Laborable (200)',
    '3': 'Agost Divendres (300)',
    '4': 'Dissabte / Festiu (400)',
    '5': 'Diumenge / Post-Festiu (500)',
    '6': 'Especial 600',
    '7': 'Diada / Especial (700)',
    '8': 'Agost 1a/4a Setmana (800)',
    '9': 'Agost Divendres Extrem (900)',
  };
  const full = labels[base] || `Servei ${code}`;
  // If it has a 3rd digit (variant), annotate it
  if (code.length === 3 && code[2] !== '0') {
    const variants: Record<string, string> = {
      '1': '+Nit contínua (L6/L12/L7)',
      '2': '+Nit contínua total',
      '3': '+Post-nit (L6/L12/L7)',
      '4': '+Post-nit total',
      '5': '+Dissabte post-Nit',
      '6': '+Divendres post-Nit',
      '7': '+Diumenge sense nit',
    };
    return `${full} ${variants[code[2]] || ''}`;
  }
  return full;
}

/** Color class for a service code (for UI badges) */
export function getServiceColor(code: string | undefined): string {
  const base = (code || '')[0];
  const map: Record<string, string> = {
    '0': 'bg-blue-500',
    '1': 'bg-teal-500',
    '2': 'bg-cyan-400',
    '3': 'bg-cyan-600',
    '4': 'bg-amber-500',
    '5': 'bg-rose-500',
    '6': 'bg-purple-500',
    '7': 'bg-red-600',
    '8': 'bg-orange-400',
    '9': 'bg-orange-600',
  };
  return map[base] || 'bg-gray-400';
}
