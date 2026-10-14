import { supabase } from '../supabaseClient';
import { resolveStationId } from './stations';
import { STATION_GEO_DATA, haversineKm } from './stationGeoData';
import { decodeGeotrenUt } from '../views/incidencia/utils/decodeUt';
import { decodeGeotrenCirculation } from '../views/incidencia/utils/decodeCirculation';
import { getFgcMinutes } from './time';
import { GipRegistrePas } from '../types';
import { checkAndNotifyDelay, checkAndNotifyAdvance } from './delayNotifications';
import { recordTrainKinematics, detectStationFusion } from './trainKinematics';

const GEOTREN_API = 'https://dadesobertes.fgc.cat/api/v2/catalog/datasets/posicionament-dels-trens/exports/json';

/**
 * Retorna la data de servei oficial FGC (format YYYY-MM-DD).
 * La jornada FGC comença a les 04:00 AM; entre 00:00 i 03:59 pertany al servei del dia anterior.
 */
export const getFgcServiceDate = (date: Date = new Date()): string => {
  const d = new Date(date);
  if (d.getHours() < 4) {
    d.setDate(d.getDate() - 1);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatTimeToHHMMSS = (timeStr: string | null | undefined): string => {
  if (!timeStr) return '';
  const clean = timeStr.trim();
  const parts = clean.split(':');
  if (parts.length >= 2) {
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const s = parts[2] && parts[2].trim() !== '' ? parts[2].trim().padStart(2, '0') : '00';
    return `${h}:${m}:${s}`;
  }
  return clean;
};

// Cache en memòria de parades teòriques de circulacions (per no consultar Supabase a cada segon)
const circScheduleCache = new Map<string, Array<{ code: string; hora: string; nom: string }>>();

// Cache en memòria de claus ja enregistrades avui: "serviceDate:circCode:stCode"
const recordedKeys = new Set<string>();
let isCacheInitialized = false;

/**
 * Inicialitza la memòria cau amb els passos que ja s'hagin registrat avui a Supabase
 */
const initRecordedKeys = async (serviceDate: string) => {
  try {
    const { data } = await supabase
      .from('gip_registre_pas')
      .select('circulacio_id, estacio_codi')
      .eq('data_servei', serviceDate);

    if (data) {
      data.forEach(row => {
        recordedKeys.add(`${serviceDate}:${row.circulacio_id}:${row.estacio_codi}`);
      });
    }
    isCacheInitialized = true;
  } catch (err) {
    console.warn('[GIP Recorder] Error inicialitzant claus registrades:', err);
  }
};

/**
 * Obté les parades oficials d'una circulació amb les seves hores teòriques
 */
export const getCirculationStops = async (circCode: string, linia: string = ''): Promise<Array<{ code: string; hora: string; nom: string }>> => {
  const normalizedCode = circCode.trim().toUpperCase();
  if (circScheduleCache.has(normalizedCode)) {
    return circScheduleCache.get(normalizedCode)!;
  }

  const stops: Array<{ code: string; hora: string; nom: string }> = [];

  try {
    const { data: directDetail } = await supabase
      .from('circulations')
      .select('id, inici, final, linia, sortida, arribada, estacions')
      .eq('id', normalizedCode)
      .maybeSingle();

    if (directDetail) {
      const line = linia || directDetail.linia || '';
      if (directDetail.inici && directDetail.sortida) {
        stops.push({
          nom: directDetail.inici,
          code: resolveStationId(directDetail.inici, line),
          hora: formatTimeToHHMMSS(directDetail.sortida)
        });
      }
      if (Array.isArray(directDetail.estacions)) {
        directDetail.estacions.forEach((st: any) => {
          const h = st.sortida || st.hora || st.arribada;
          if (st.nom && h) {
            stops.push({
              nom: st.nom,
              code: resolveStationId(st.nom, line),
              hora: formatTimeToHHMMSS(h)
            });
          }
        });
      }
      if (directDetail.final && directDetail.arribada) {
        stops.push({
          nom: directDetail.final,
          code: resolveStationId(directDetail.final, line),
          hora: formatTimeToHHMMSS(directDetail.arribada)
        });
      }
    }
  } catch (err) {
    console.warn(`[GIP Recorder] Error carregant horari per a ${normalizedCode}:`, err);
  }

  circScheduleCache.set(normalizedCode, stops);
  return stops;
};

/**
 * Processa un cicle de GeoTren i grava a Supabase el pas per estació de totes les circulacions actives
 */
const VALID_BV_LINES = new Set(['S1', 'S2', 'L6', 'L7', 'L12']);

/**
 * Converteix una cadena "HH:MM:SS" a segons des de les 00:00:00
 */
const timeStringToSeconds = (tStr?: string | null): number | null => {
  if (!tStr) return null;
  const parts = tStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parts[2] ? parseInt(parts[2], 10) : 0;
  if (isNaN(h) || isNaN(m)) return null;
  return h * 3600 + m * 60 + (isNaN(s) ? 0 : s);
};

const secondsToTimeString = (totalSec: number): string => {
  let sec = Math.round(totalSec);
  while (sec < 0) sec += 86400;
  sec = sec % 86400;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/**
 * Parseja el camp properes_parades de GeoTren a un array de codis d'estació ordenat
 */
export const parseProperesParades = (raw?: string | null): string[] => {
  if (!raw) return [];
  const matches = [...raw.matchAll(/"parada":\s*"([^"]+)"/g)];
  return matches.map(m => resolveStationId(m[1].trim(), ''));
};

/**
 * Processa un cicle de GeoTren i grava a Supabase el pas per estació de totes les circulacions actives
 */
export const pollAndRecordGipPassages = async (): Promise<number> => {
  const serviceDate = getFgcServiceDate();

  if (!isCacheInitialized) {
    await initRecordedKeys(serviceDate);
  }

  let insertedCount = 0;

  try {
    const res = await fetch(GEOTREN_API);
    if (!res.ok) return 0;
    const trains: any[] = await res.json();
    if (!Array.isArray(trains) || trains.length === 0) return 0;

    const now = new Date();
    const currentClockStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const nowMins = getFgcMinutes(currentClockStr) || 0;
    const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    const newRecordsToInsert: GipRegistrePas[] = [];

    for (const gt of trains) {
      // 1. Filtrar estrictament línies de Barcelona-Vallès
      const linia = gt.lin || '';
      if (!VALID_BV_LINES.has(linia)) continue;

      // 2. Decodificar circulació oficial
      const decodedCirc = decodeGeotrenCirculation(gt.id);
      const circCode = decodedCirc?.fullName?.toUpperCase();
      if (!circCode) continue;

      const decodedUt = decodeGeotrenUt(gt.ut, gt.tipus_unitat) || gt.ut || '';

      // 3. Obtenir el recorregut teòric complet d'aquesta circulació
      const stops = await getCirculationStops(circCode, linia);
      if (!stops || stops.length === 0) continue;

      // 4. Determinar la posició actual o la darrera estació superada via FUSIÓ SENSORIAL (iSIC + GPS + Cinemàtica)
      const properes = parseProperesParades(gt.properes_parades);
      const nextTargetCode = properes.length > 0 ? properes[0] : null;
      const candidateCodes = stops.map(s => s.code);

      // Traçabilitat cinemàtica (velocitat instantània suavitzada)
      const { speedKmh } = recordTrainKinematics(circCode, gt.geo_point_2d?.lat, gt.geo_point_2d?.lon);

      // Fusiò sensorial d'andana
      const fusion = detectStationFusion(
        gt.estacionat_a,
        linia,
        gt.geo_point_2d?.lat,
        gt.geo_point_2d?.lon,
        speedKmh,
        candidateCodes,
        nextTargetCode
      );

      let currentStationIndex = -1;

      // Cas 1: El tren està físicament DETINGUT a l'andana (per iSIC o per GPS<=75m + v<=7 km/h)
      if (fusion.state === 'EN_ANDANA' && fusion.stationCode) {
        const idx = stops.findIndex(s => s.code === fusion.stationCode);
        if (idx !== -1) {
          currentStationIndex = idx;
        }
      }

      // Cas 2: Si no està detingut a l'andana però té pròximes parades definides
      if (currentStationIndex === -1 && nextTargetCode) {
        const nextIdx = stops.findIndex(s => s.code === nextTargetCode);
        if (nextIdx > 0) {
          // El tren és en aproximació o marxa; la darrera estació superada és la immediatament anterior
          currentStationIndex = nextIdx - 1;
        } else if (nextIdx === 0) {
          // El tren encara és a l'estació d'origen
          currentStationIndex = 0;
        }
      }

      // Cas 3: No hi ha properes_parades (tren arribant o ja al final de trajecte)
      if (currentStationIndex === -1 && properes.length === 0) {
        if (fusion.state === 'EN_ANDANA' || (fusion.distanceMeters !== null && fusion.distanceMeters <= 100 && speedKmh <= 10)) {
          currentStationIndex = stops.length - 1;
        } else {
          currentStationIndex = Math.max(0, stops.length - 2);
        }
      }

      if (currentStationIndex === -1) continue;

      // 5. Calcular el retard / avanç observat a la posició actual
      const currentStop = stops[currentStationIndex];
      let currentDiffSec = 0;
      if (currentStop?.hora) {
        const theoSecs = timeStringToSeconds(currentStop.hora);
        if (theoSecs !== null) {
          currentDiffSec = nowSecs - theoSecs;
        }
      }

      // 6. Enregistrar totes les parades fins a currentStationIndex que no estiguin enregistrades
      for (let i = 0; i <= currentStationIndex; i++) {
        const stop = stops[i];
        const key = `${serviceDate}:${circCode}:${stop.code}`;
        if (recordedKeys.has(key)) continue;

        let diffSec = currentDiffSec;
        let horaReal = currentClockStr;

        if (i === currentStationIndex) {
          // Parada actual observada en temps real
          horaReal = currentClockStr;
          diffSec = currentDiffSec;
        } else {
          // Parada anterior ja superada: hora teòrica + retard observat
          const theoSecs = timeStringToSeconds(stop.hora);
          if (theoSecs !== null) {
            horaReal = secondsToTimeString(theoSecs + currentDiffSec);
            diffSec = currentDiffSec;
          }
        }

        let estat: 'en_hora' | 'retard' | 'avanc' = 'en_hora';
        if (diffSec > 240) {
          estat = 'retard';
          // Si és la posició en temps real i supera 4 minuts (240s - Roig), avisar al mòbil
          if (i === currentStationIndex) {
            checkAndNotifyDelay({
              circId: circCode,
              linia,
              ut: decodedUt,
              delaySec: diffSec,
              stationName: stop.nom || stop.code
            }).catch(() => {});
          }
        } else if (diffSec < -20) {
          estat = 'avanc';
          // Si és la posició en temps real i va avançat (Blau), avisar
          if (i === currentStationIndex && diffSec < -45) {
            checkAndNotifyAdvance({
              circId: circCode,
              linia,
              ut: decodedUt,
              delaySec: diffSec,
              stationName: stop.nom || stop.code
            }).catch(() => {});
          }
        } else {
          estat = 'en_hora';
        }

        const record: GipRegistrePas = {
          data_servei: serviceDate,
          circulacio_id: circCode,
          linia,
          ut: decodedUt,
          estacio_codi: stop.code,
          estacio_nom: stop.nom || stop.code,
          hora_teorica: stop.hora || undefined,
          hora_real: horaReal,
          diferencia_segons: diffSec,
          estat
        };

        newRecordsToInsert.push(record);
        recordedKeys.add(key);
      }
    }

    if (newRecordsToInsert.length > 0) {
      const { error } = await supabase
        .from('gip_registre_pas')
        .upsert(newRecordsToInsert, {
          onConflict: 'data_servei,circulacio_id,estacio_codi',
          ignoreDuplicates: true
        });

      if (!error) {
        insertedCount = newRecordsToInsert.length;
      } else {
        console.warn('[GIP Recorder] Error inserint passos a Supabase:', error);
      }
    }
  } catch (err) {
    console.warn('[GIP Recorder] Error en cicle de sondeig GeoTren:', err);
  }

  return insertedCount;
};

// Interval de fons
let recorderIntervalId: any = null;

/**
 * Inicia el gravador en segon pla (per defecte cada 10 segons)
 */
export const startGipRecorder = (intervalMs: number = 10000): (() => void) => {
  if (!recorderIntervalId) {
    // Execució immediata del primer cicle
    pollAndRecordGipPassages().catch(() => {});

    recorderIntervalId = setInterval(() => {
      pollAndRecordGipPassages().catch(() => {});
    }, intervalMs);
  }
  return stopGipRecorder;
};

/**
 * Atura el gravador
 */
export const stopGipRecorder = () => {
  if (recorderIntervalId) {
    clearInterval(recorderIntervalId);
    recorderIntervalId = null;
  }
};
