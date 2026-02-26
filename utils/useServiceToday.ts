// utils/useServiceToday.ts
// React hook that returns the correct DB filter code for today's service,
// resolving async from Supabase with a fast synchronous initial value.

import { useState, useEffect } from 'react';
import { getServiceToday, getServiceTodayAsync, calendarCodeToFilterCode } from './serviceCalendar';

/**
 * Returns the DB filter code for today's service ('0', '100', '400', '500'),
 * resolved dynamically from the Supabase calendar.
 *
 * - Initializes synchronously from the cache/fallback (no flash of wrong state).
 * - Fires async resolution against Supabase; if the real code (or its filter
 *   bucket) differs from the initial guess, updates state.
 *
 * The hook always returns one of: '0' | '100' | '400' | '500'
 * matching the `serveiTypes` arrays in CercarView, OrganitzaView, IncidenciaView.
 */
export function useServiceToday(): string {
    // Sync initial value — uses in-memory cache if warm, else weekly-rule fallback.
    // getServiceToday() now returns '0' | '100' | '400' | '500' directly.
    const [serviceCode, setServiceCode] = useState<string>(() => getServiceToday());

    useEffect(() => {
        let cancelled = false;
        getServiceTodayAsync().then(rawCode => {
            if (!cancelled) {
                // Map the fine-grained calendar code (e.g. '200', '700') to the
                // 4 filter keys used in the UI ('0', '100', '400', '500').
                const filterCode = calendarCodeToFilterCode(rawCode);
                setServiceCode(filterCode);
            }
        });
        return () => { cancelled = true; };
    }, []);

    return serviceCode;
}
