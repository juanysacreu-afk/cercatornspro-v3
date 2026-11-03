// FGC NEXUS — LOPD-GDD / RGPD Access Audit Logger
import { supabase } from '../supabaseClient';

export type LopdActionType =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'VIEW_AGENT_CONTACT'
  | 'CALL_DISPATCH'
  | 'SEARCH_AGENTS'
  | 'EXPORT_DATA';

export interface AuditLogEntry {
  id: number;
  created_at: string;
  user_id: string | null;
  user_email: string;
  action_type: LopdActionType | string;
  target_nomina?: string | null;
  details?: Record<string, any>;
}

const recentLogCache = new Map<string, number>();

/**
 * Logs an access or action to the immutable LOPD audit trail.
 * Server RPC extracts authenticated user ID and email securely from auth.uid().
 */
export async function logLopdAccess(
  actionType: LopdActionType | string,
  targetNomina?: string | null,
  details?: Record<string, any>
): Promise<void> {
  try {
    // Deduplication window (30 seconds) for identical actions on identical targets
    const cacheKey = `${actionType}_${targetNomina || ''}_${JSON.stringify(details || {})}`;
    const now = Date.now();
    const lastTime = recentLogCache.get(cacheKey);
    if (lastTime && now - lastTime < 30_000) {
      return; // Deduplicated
    }
    recentLogCache.set(cacheKey, now);

    // Call secure Postgres RPC
    await supabase.rpc('log_lopd_event', {
      p_action: actionType,
      p_target_nomina: targetNomina || null,
      p_details: details || {}
    });
  } catch (err) {
    // Non-blocking: audit logs must never break UI execution
    console.warn('[AuditLogger] Could not record LOPD audit event:', err);
  }
}

/**
 * Initializes global listeners for telephone dispatch clicks.
 */
let isListenerAttached = false;
export function initAuditListeners(): void {
  if (isListenerAttached || typeof window === 'undefined') return;
  isListenerAttached = true;

  window.addEventListener('click', (e) => {
    try {
      const target = (e.target as HTMLElement)?.closest('a[href^="tel:"]');
      if (target) {
        const tel = target.getAttribute('href')?.replace('tel:', '');
        const dataNomina = target.getAttribute('data-nomina') || undefined;
        logLopdAccess('CALL_DISPATCH', dataNomina, { phone_called: tel });
      }
    } catch {
      // Ignore click interception errors
    }
  }, { capture: true });
}

/**
 * Fetches recent audit logs for supervisor transparency view.
 */
export async function fetchRecentAuditLogs(limit: number = 50): Promise<AuditLogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('lopd_access_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data as AuditLogEntry[]) || [];
  } catch (err) {
    console.warn('[AuditLogger] Error fetching audit logs:', err);
    return [];
  }
}
