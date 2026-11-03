import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { fetchLiveGeoTrenTrains, NormalizedGeoTrenTrain } from '../../../utils/geotrenApi';
import { getFgcServiceDate } from '../../../utils/gipRecorder';
import { GipRegistrePas, TrunkConflictAlert } from '../../../types';
import { detectTrunkConflicts, getCleanCircCode } from '../../../utils/accordionPredictor';

export function useTrunkConflicts(pollIntervalMs = 15000) {
  const [conflicts, setConflicts] = useState<TrunkConflictAlert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const isFetchingRef = useRef(false);

  const checkConflicts = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      // 1. Fetch live trains from GeoTren
      const liveTrains = await fetchLiveGeoTrenTrains();
      if (!Array.isArray(liveTrains) || liveTrains.length === 0) {
        setConflicts([]);
        setLoading(false);
        isFetchingRef.current = false;
        return;
      }

      // 2. Extract unique circ codes
      const activeCodes = Array.from(new Set(
        liveTrains.map(t => getCleanCircCode(t)).filter(c => !!c && c !== 'TREM')
      ));

      const serviceDate = getFgcServiceDate();

      // 3. Fetch latest recorded passages for active trains from Supabase
      let passagesMap = new Map<string, GipRegistrePas>();
      if (activeCodes.length > 0) {
        try {
          const { data: passages } = await supabase
            .from('gip_registre_pas')
            .select('*')
            .eq('data_servei', serviceDate)
            .in('circulacio_id', activeCodes)
            .order('creat_el', { ascending: false });

          if (passages && Array.isArray(passages)) {
            passages.forEach((p: GipRegistrePas) => {
              if (!passagesMap.has(p.circulacio_id)) {
                passagesMap.set(p.circulacio_id, p);
              }
            });
          }
        } catch (err) {
          console.warn('[useTrunkConflicts] Error fetching passages:', err);
        }
      }

      // 4. Run predictive engine
      const detected = detectTrunkConflicts(liveTrains, passagesMap);
      setConflicts(detected);
      setLastChecked(new Date());
    } catch (err) {
      console.warn('[useTrunkConflicts] Execution error:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    checkConflicts();
    const timer = setInterval(checkConflicts, pollIntervalMs);
    return () => clearInterval(timer);
  }, [checkConflicts, pollIntervalMs]);

  const criticalCount = conflicts.filter(c => c.severity === 'critical').length;
  const warningCount = conflicts.filter(c => c.severity === 'warning').length;

  return {
    conflicts,
    criticalCount,
    warningCount,
    loading,
    lastChecked,
    refresh: checkConflicts
  };
}
