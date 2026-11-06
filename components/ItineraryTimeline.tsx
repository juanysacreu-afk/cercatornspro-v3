import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BookOpen, RefreshCw, Clock, Train } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getFgcServiceDate, pollAndRecordGipPassages } from '../utils/gipRecorder';
import { resolveStationId, findGipPassageForPoint, formatDelayMinSec, normalizeTimeDiffSec, normalizeCircId, timeStringToSeconds, secondsToTimeString, getFgcMinutes } from '../utils/stations';
import { fetchLiveGeoTrenTrains, findTrainInGeoTren, NormalizedGeoTrenTrain } from '../utils/geotrenApi';
import { ItineraryPoint } from './ItineraryPoint';
import { getServiceToday } from '../utils/serviceCalendar';
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

  const candidateCircIds = useMemo(() => {
    if (!cleanCircId) return [];
    const set = new Set<string>();
    set.add(cleanCircId);
    set.add(normalizeCircId(cleanCircId));
    if (!/^[A-Z]+/i.test(cleanCircId)) {
      const digits = cleanCircId.replace(/\D/g, '');
      if (digits) {
        set.add(digits.padStart(3, '0'));
        set.add(parseInt(digits, 10).toString());
      }
    }
    return Array.from(set);
  }, [cleanCircId]);

  const [gipPassages, setGipPassages] = useState<GipRegistrePas[]>([]);
  const [liveGeoTrain, setLiveGeoTrain] = useState<NormalizedGeoTrenTrain | null>(null);
  const [loadingGip, setLoadingGip] = useState(true);
  const [extraStations, setExtraStations] = useState<any[]>([]);

  // If circ does not have internal stations, attempt fallback to circulations table
  useEffect(() => {
    if (circ.estacions && circ.estacions.length > 0) return;
    if (!cleanCircId) return;

    let isMounted = true;
    const fetchExtra = async () => {
      try {
        const { data: v2Data } = await supabase
          .from('circulationsv2')
          .select('estacions, servei')
          .in('id', candidateCircIds);

        const todayS = getServiceToday();
        const matched = v2Data?.find((r: any) => 
          r.servei === todayS || 
          (todayS === '0' && (r.servei === '0' || r.servei === '000')) ||
          (todayS === '000' && (r.servei === '0' || r.servei === '000'))
        ) || v2Data?.[0];

        let foundStops = matched?.estacions;
        if (!foundStops || !Array.isArray(foundStops)) {
          const { data: legacyData } = await supabase
            .from('circulations')
            .select('estacions')
            .in('id', candidateCircIds)
            .limit(1);
          foundStops = legacyData?.[0]?.estacions;
        }

        if (isMounted && foundStops && Array.isArray(foundStops)) {
          setExtraStations(foundStops);
        }
      } catch (e) {
        // Silent fallback
      }
    };
    fetchExtra();
    return () => {
      isMounted = false;
    };
  }, [cleanCircId, candidateCircIds, circ.estacions]);

  // Load GIP passage data and live GeoTren telemetry simultaneously
  const loadGipData = useCallback(async (isSilent = false) => {
    if (candidateCircIds.length === 0) {
      setLoadingGip(false);
      return;
    }
    if (!isSilent) setLoadingGip(true);

    try {
      const serviceDate = getFgcServiceDate();

      // Parallel fetch: historical GIP records from Supabase + sub-second live GeoTren telemetry
      const [gipRes, liveTrains] = await Promise.all([
        supabase
          .from('gip_registre_pas')
          .select('*')
          .eq('data_servei', serviceDate)
          .in('circulacio_id', candidateCircIds)
          .order('id', { ascending: true }),
        fetchLiveGeoTrenTrains().catch(() => [])
      ]);

      if (!gipRes.error && gipRes.data) {
        setGipPassages(gipRes.data as GipRegistrePas[]);
      }

      if (liveTrains && liveTrains.length > 0) {
        const matching = findTrainInGeoTren(liveTrains, candidateCircIds);
        setLiveGeoTrain(matching);
      }
    } catch (e) {
      console.error('[ItineraryTimeline] Error carregant passos GIP:', e);
    } finally {
      if (!isSilent) setLoadingGip(false);
    }
  }, [candidateCircIds]);

  useEffect(() => {
    // Polling immediat de GeoTren per si la circulació està en marxa ara mateix
    pollAndRecordGipPassages().then(() => loadGipData(true)).catch(() => {});
    loadGipData(false);
    const timer = setInterval(() => {
      loadGipData(true);
    }, 8000);
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
        const nameOrCode = st.nom || st.codi;
        if (nameOrCode) {
          list.push({
            nom: nameOrCode,
            hora: st.hora || st.sortida || st.arribada,
            via: st.via
          });
        }
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

  // Càlcul estricte de la POSICIÓ REAL del tren (GeoTren/iSIC directe + GIP amb retard)
  // MAI basat en l'hora teòrica si el tren porta retard o avanç
  const realTrainState = useMemo(() => {
    if (points.length === 0) {
      return {
        currentStationIdx: -1,
        transitFromIdx: -1,
        isLiveSynced: false,
        isicStatusText: '',
        transitStatusText: '',
        isCirculationPast: false,
        lastGipIdx: -1,
        lastPassage: null,
        lastDelaySec: 0,
        passedIndices: new Set<number>()
      };
    }

    const passedIndices = new Set<number>();
    points.forEach((p, idx) => {
      const passage = findGipPassageForPoint(gipPassages, p);
      if (passage) {
        passedIndices.add(idx);
      }
    });

    let currentStationIdx = -1;
    let transitFromIdx = -1;
    let isLiveSynced = false;
    let isicStatusText = '';
    let transitStatusText = '';

    // Prioritat 1: Telemetria directa de GeoTren / iSIC en temps real
    if (liveGeoTrain) {
      isLiveSynced = true;
      const stationedCode = liveGeoTrain.estacionat_a;
      const properes = liveGeoTrain.properes_parades || [];
      const nextTargetCode = properes.length > 0 ? properes[0] : null;

      // Cas A: Detingut físicament a l'andana (Confirmat per iSIC / circuits de via)
      if (stationedCode) {
        const idx = points.findIndex(p => resolveStationId(p.nom) === stationedCode);
        if (idx !== -1) {
          currentStationIdx = idx;
          const stName = points[idx].nom;
          isicStatusText = `Aturat a ${stName} (Andana V${points[idx].via || '1'} · iSIC Confirmat)`;
          for (let i = 0; i < idx; i++) passedIndices.add(i);
        }
      }

      // Cas B: Sortit d'estació i en trajecte cap a la propera parada
      if (currentStationIdx === -1 && nextTargetCode) {
        const nextIdx = points.findIndex(p => resolveStationId(p.nom) === nextTargetCode);
        if (nextIdx > 0) {
          transitFromIdx = nextIdx - 1;
          const fromName = points[nextIdx - 1].nom;
          const toName = points[nextIdx].nom;
          transitStatusText = `SORTIT DE ${fromName} → EN MARXA CAP A ${toName}`;
          isicStatusText = `Sortit de ${fromName} (iSIC Confirmat)`;
          for (let i = 0; i <= transitFromIdx; i++) passedIndices.add(i);
        } else if (nextIdx === 0) {
          currentStationIdx = 0;
          isicStatusText = `A l'estació d'origen (${points[0].nom})`;
        }
      }
    }

    // Prioritat 2: Avaluació temporal FGC per a trens que no són a GeoTren en viu
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const startMin = getFgcMinutes(firstPoint?.hora);
    let endMin = getFgcMinutes(lastPoint?.hora);
    if (startMin !== null && endMin !== null && endMin < startMin) {
      endMin += 24 * 60; // Operació passant per mitjanit
    }

    const now = new Date();
    const clockStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const currentFgcMin = (typeof nowMin === 'number' && nowMin > 0) ? nowMin : (getFgcMinutes(clockStr) ?? 0);

    let lastGipIdx = -1;
    let lastPassage: GipRegistrePas | null = null;
    points.forEach((p, idx) => {
      const passage = findGipPassageForPoint(gipPassages, p);
      if (passage) {
        lastGipIdx = idx;
        lastPassage = passage;
      }
    });

    const lastDelaySec = lastPassage ? normalizeTimeDiffSec(lastPassage.diferencia_segons) : 0;
    const lastDelayMin = Math.round(lastDelaySec / 60);
    const effectiveEndMin = endMin !== null ? (endMin + Math.max(0, lastDelayMin)) : null;

    // Una circulació ha finalitzat si no és a GeoTren i ja ha superat l'hora prevista d'arribada (o ha arribat a l'última estació)
    const isCirculationPast = !liveGeoTrain && (
      (effectiveEndMin !== null && currentFgcMin > effectiveEndMin + 6) ||
      (lastGipIdx === points.length - 1)
    );

    if (isCirculationPast) {
      // Circulació completada en el passat
      currentStationIdx = -1;
      transitFromIdx = -1;
      transitStatusText = '';
      isicStatusText = `Finalitzat a ${lastPoint?.nom || 'destinació'}`;
      if (gipPassages.length > 0) {
        for (let i = 0; i < points.length; i++) passedIndices.add(i);
      }
    } else if (!liveGeoTrain && currentStationIdx === -1 && transitFromIdx === -1 && gipPassages.length > 0) {
      // Només si estem DINS de la finestra temporal activa de la circulació i GeoTren perd cobertura momentània
      if (lastGipIdx !== -1 && lastPassage) {
        if (lastGipIdx < points.length - 1) {
          const nextPoint = points[lastGipIdx + 1];
          let nextTheoMin = getFgcMinutes(nextPoint.hora);
          if (nextTheoMin !== null && startMin !== null && nextTheoMin < startMin) {
            nextTheoMin += 24 * 60;
          }
          const effectiveNextMin = nextTheoMin !== null ? (nextTheoMin + lastDelayMin) : null;

          if (effectiveNextMin !== null && currentFgcMin >= effectiveNextMin) {
            currentStationIdx = lastGipIdx + 1;
            isicStatusText = `Arribant a ${nextPoint.nom} (Retard ${formatDelayMinSec(lastDelaySec)})`;
            for (let i = 0; i <= lastGipIdx; i++) passedIndices.add(i);
          } else {
            transitFromIdx = lastGipIdx;
            const fromName = points[lastGipIdx].nom;
            const toName = nextPoint.nom;
            transitStatusText = `EN TRAJECTE ENTRE ${fromName} I ${toName} (+${formatDelayMinSec(lastDelaySec)})`;
            for (let i = 0; i <= lastGipIdx; i++) passedIndices.add(i);
          }
        } else {
          isicStatusText = `Finalitzat a ${points[lastGipIdx].nom}`;
          for (let i = 0; i < points.length; i++) passedIndices.add(i);
        }
      }
    }

    return {
      currentStationIdx,
      transitFromIdx,
      isLiveSynced,
      isicStatusText,
      transitStatusText,
      isCirculationPast,
      lastGipIdx,
      lastPassage,
      lastDelaySec,
      passedIndices
    };
  }, [points, gipPassages, liveGeoTrain, nowMin]);

  return (
    <div className="p-4 sm:p-8 bg-white dark:bg-fgc-grey border-t border-gray-100 dark:border-white/5 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-gray-100 dark:border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
            <BookOpen size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
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
              {(() => {
                const detectedUt = liveGeoTrain?.decodedUt || circ.train || circ.ut || (gipPassages.find(p => p.ut)?.ut);
                if (!detectedUt) return null;
                return (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-[10px] font-mono font-black text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <Train size={10} /> UT {detectedUt}
                  </span>
                );
              })()}
              {realTrainState.isicStatusText && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold border animate-in fade-in ${
                  realTrainState.isCirculationPast
                    ? 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10'
                    : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                }`}>
                  {!realTrainState.isCirculationPast && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  )}
                  {realTrainState.isicStatusText}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
              Horaris teòrics, posició real GeoTren/iSIC i registre de pas GIP
            </p>
          </div>
        </div>

        {/* Live GIP Status Summary */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          {loadingGip ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 font-medium">
              <RefreshCw size={12} className="animate-spin text-gray-400" />
              Sincronitzant GIP & iSIC...
            </span>
          ) : recordedCount > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-800/40">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                GIP Actiu: {recordedCount}/{totalStops} passos
              </span>
              {latestPassage && (() => {
                const diffSec = normalizeTimeDiffSec(latestPassage.diferencia_segons);
                if (diffSec < 0) {
                  return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50">
                      Últim pas ({latestPassage.estacio_codi}): -{formatDelayMinSec(Math.abs(diffSec))} avanç
                    </span>
                  );
                }
                if (diffSec <= 180) {
                  return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50">
                      Últim pas ({latestPassage.estacio_codi}): En hora{diffSec > 0 ? ` (+${formatDelayMinSec(diffSec)})` : ''}
                    </span>
                  );
                }
                if (diffSec <= 300) {
                  return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50">
                      Últim pas ({latestPassage.estacio_codi}): +{formatDelayMinSec(diffSec)} retard
                    </span>
                  );
                }
                return (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50">
                    Últim pas ({latestPassage.estacio_codi}): +{formatDelayMinSec(diffSec)} retard
                  </span>
                );
              })()}
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
          let passage = findGipPassageForPoint(gipPassages, point);

          // Si la circulació és passada i falta el registre de l'estació terminal (per canvi de cicle al buffer),
          // calculem l'hora real estimada a partir del darrer retard confirmat
          if (!passage && realTrainState.isCirculationPast && realTrainState.lastPassage && pIdx > realTrainState.lastGipIdx) {
            const theoSecs = timeStringToSeconds(point.hora);
            if (theoSecs !== null) {
              const estRealSecs = theoSecs + realTrainState.lastDelaySec;
              let diffSec = realTrainState.lastDelaySec;
              let estat: 'en_hora' | 'retard' | 'avanc' = 'en_hora';
              if (diffSec > 240) estat = 'retard';
              else if (diffSec < -20) estat = 'avanc';

              passage = {
                data_servei: realTrainState.lastPassage.data_servei,
                circulacio_id: realTrainState.lastPassage.circulacio_id,
                linia: realTrainState.lastPassage.linia,
                ut: realTrainState.lastPassage.ut,
                estacio_codi: resolveStationId(point.nom || point.codi || ''),
                estacio_nom: point.nom,
                hora_teorica: point.hora,
                hora_real: secondsToTimeString(estRealSecs),
                diferencia_segons: diffSec,
                estat
              };
            }
          }

          const isNow = pIdx === realTrainState.currentStationIdx;
          const isTransit = pIdx === realTrainState.transitFromIdx;
          const isPassed = realTrainState.passedIndices.has(pIdx);

          return (
            <ItineraryPoint
              key={pIdx}
              point={point}
              isFirst={pIdx === 0}
              isLast={pIdx === arr.length - 1}
              nextPoint={arr[pIdx + 1]}
              isNow={isNow}
              isTransit={isTransit}
              isPassed={isPassed}
              transitStatusText={realTrainState.transitStatusText}
              isicStatusText={realTrainState.isicStatusText}
              nowMin={nowMin}
              gipPassage={passage || undefined}
            />
          );
        })}
      </div>
    </div>
  );
};
