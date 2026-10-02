import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BookOpen, RefreshCw, Clock } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getFgcServiceDate } from '../utils/gipRecorder';
import { resolveStationId, findGipPassageForPoint, formatDelayMinSec } from '../utils/stations';
import { ItineraryPoint } from './ItineraryPoint';
import type { GipRegistrePas } from '../types';

interface ItineraryTimelineProps {
  circ: any;
  nowMin: number;
}

export const ItineraryTimeline: React.FC<ItineraryTimelineProps> = ({ circ, nowMin }) => {
  const cleanCircId = useMemo(() => {
    const raw = (circ.codi === 'Viatger' && circ.realCodi)
      ? circ.realCodi
      : (circ.codi || circ.id || '');
    return (raw || '').trim().toUpperCase();
  }, [circ]);

  const [gipPassages, setGipPassages] = useState<GipRegistrePas[]>([]);
  const [loadingGip, setLoadingGip] = useState(true);
  const [extraStations, setExtraStations] = useState<any[]>([]);

  // If circ does not have internal stations, attempt fallback to circulations table
  useEffect(() => {
    if (circ.estacions && circ.estacions.length > 0) return;
    if (!cleanCircId) return;

    let isMounted = true;
    const fetchExtra = async () => {
      try {
        const { data } = await supabase
          .from('circulations')
          .select('estacions')
          .eq('id', cleanCircId)
          .limit(1);
        if (isMounted && data && data[0]?.estacions && Array.isArray(data[0].estacions)) {
          setExtraStations(data[0].estacions);
        }
      } catch (e) {
        // Silent fallback
      }
    };
    fetchExtra();
    return () => {
      isMounted = false;
    };
  }, [cleanCircId, circ.estacions]);

  // Load GIP passage data for today's service
  const loadGipData = useCallback(async (isSilent = false) => {
    if (!cleanCircId) {
      setLoadingGip(false);
      return;
    }
    if (!isSilent) setLoadingGip(true);

    try {
      const serviceDate = getFgcServiceDate();
      const { data, error } = await supabase
        .from('gip_registre_pas')
        .select('*')
        .eq('data_servei', serviceDate)
        .eq('circulacio_id', cleanCircId)
        .order('id', { ascending: true });

      if (!error && data) {
        setGipPassages(data as GipRegistrePas[]);
      }
    } catch (e) {
      console.error('[ItineraryTimeline] Error carregant passos GIP:', e);
    } finally {
      if (!isSilent) setLoadingGip(false);
    }
  }, [cleanCircId]);

  useEffect(() => {
    loadGipData(false);
    const timer = setInterval(() => {
      loadGipData(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [loadGipData]);

  // Construct array of station points
  const points = useMemo(() => {
    const list: any[] = [];
    if (circ.inici) {
      list.push({ nom: circ.inici, hora: circ.sortida, via: circ.via_inici });
    }
    const rawStops = (circ.estacions && circ.estacions.length > 0) ? circ.estacions : extraStations;
    if (Array.isArray(rawStops)) {
      rawStops.forEach((st: any) => {
        list.push({
          nom: st.nom,
          hora: st.hora || st.sortida || st.arribada,
          via: st.via
        });
      });
    }
    if (circ.final && (list.length === 0 || list[list.length - 1].nom !== circ.final)) {
      list.push({ nom: circ.final, hora: circ.arribada, via: circ.via_final });
    }
    return list;
  }, [circ, extraStations]);

  const recordedCount = gipPassages.length;
  const totalStops = points.length;
  const latestPassage = recordedCount > 0 ? gipPassages[recordedCount - 1] : null;

  return (
    <div className="p-4 sm:p-8 bg-white dark:bg-fgc-grey border-t border-gray-100 dark:border-white/5 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-gray-100 dark:border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
            <BookOpen size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-black text-[#4D5358] dark:text-white uppercase tracking-tight">
                Llibre d'itineraris
              </h4>
              <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/10 text-xs font-mono font-bold text-gray-700 dark:text-gray-300">
                {cleanCircId}
              </span>
              {circ.codi === 'Viatger' && (
                <span className="px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-[10px] font-black text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800">
                  VIATGER
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
              Horaris teòrics i dades reals de pas segons GIP
            </p>
          </div>
        </div>

        {/* Live GIP Status Summary */}
        <div className="flex items-center gap-2 text-xs">
          {loadingGip ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 font-medium">
              <RefreshCw size={12} className="animate-spin text-gray-400" />
              Sincronitzant GIP...
            </span>
          ) : recordedCount > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-800/40">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                GIP Actiu: {recordedCount}/{totalStops} passos
              </span>
              {latestPassage && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                  latestPassage.diferencia_segons >= 60 
                    ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50' 
                    : latestPassage.diferencia_segons <= -60
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50'
                }`}>
                  Últim pas ({latestPassage.estacio_codi}): {latestPassage.diferencia_segons >= 60 
                    ? `+${formatDelayMinSec(latestPassage.diferencia_segons)} retard` 
                    : latestPassage.diferencia_segons <= -60 
                      ? `-${formatDelayMinSec(Math.abs(latestPassage.diferencia_segons))} avanç` 
                      : 'En hora'}
                </span>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 font-medium">
              <Clock size={12} />
              Pendent d'inici segons GIP
            </span>
          )}
        </div>
      </div>

      {/* Vertical Timeline */}
      <div className="relative flex flex-col pl-8 sm:pl-16 pr-2 sm:pr-6 py-2 space-y-0">
        <div className="absolute left-[15px] sm:left-[29px] top-6 bottom-6 w-0.5 sm:w-1 bg-gray-100 dark:bg-gray-800 rounded-full" />
        {points.map((point, pIdx, arr) => {
          const passage = findGipPassageForPoint(gipPassages, point);
          return (
            <ItineraryPoint
              key={pIdx}
              point={point}
              isFirst={pIdx === 0}
              isLast={pIdx === arr.length - 1}
              nextPoint={arr[pIdx + 1]}
              nowMin={nowMin}
              gipPassage={passage}
            />
          );
        })}
      </div>
    </div>
  );
};
