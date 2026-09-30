import { supabase } from '../supabaseClient';
import { resolveStationId } from './stations';
import { STATION_GEO_DATA, haversineKm } from './stationGeoData';
import { decodeGeotrenUt } from '../views/incidencia/utils/decodeUt';
import { decodeGeotrenCirculation } from '../views/incidencia/utils/decodeCirculation';
import { getFgcMinutes } from './time';
import { GipRegistrePas } from '../types';

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

    const newRecordsToInsert: GipRegistrePas[] = [];

    for (const gt of trains) {
      const decodedCirc = decodeGeotrenCirculation(gt.id);
      const circCode = decodedCirc?.fullName?.toUpperCase() || (gt.id ? gt.id.split('|')[0]?.trim().toUpperCase() : null);
      if (!circCode) continue;

      const decodedUt = decodeGeotrenUt(gt.ut, gt.tipus_unitat) || gt.ut || '';
      const linia = decodedCirc?.line || gt.lin || '';

      // 1. Detectar estació exacta (per SIRTRAN estacionat_a o per GPS)
      let exactStationCode: string | null = gt.estacionat_a && gt.estacionat_a.trim() !== ''
        ? resolveStationId(gt.estacionat_a.trim(), linia)
        : null;

      // Comprovació GPS si no té estacionat_a explícit
      if (!exactStationCode && gt.geo_point_2d?.lat && gt.geo_point_2d?.lon) {
        let minDistanceMeters = Infinity;
        let nearestId: string | null = null;
        for (const st of STATION_GEO_DATA) {
          const dMeters = haversineKm(gt.geo_point_2d.lat, gt.geo_point_2d.lon, st.lat, st.lon) * 1000;
          if (dMeters < minDistanceMeters) {
            minDistanceMeters = dMeters;
            nearestId = st.id;
          }
        }
        if (nearestId && minDistanceMeters <= 120) {
          exactStationCode = nearestId;
        }
      }

      if (!exactStationCode) continue;

      const key = `${serviceDate}:${circCode}:${exactStationCode}`;
      if (recordedKeys.has(key)) continue;

      // 2. Cercar hora teòrica d'aquesta circulació a aquesta estació
      const stops = await getCirculationStops(circCode, linia);
      const matchedStop = stops.find(s => s.code === exactStationCode);
      const horaTeorica = matchedStop ? matchedStop.hora : null;

      // 3. Calcular diferència en segons
      let diffSec = 0;
      let estat: 'en_hora' | 'retard' | 'avanc' = 'en_hora';

      if (horaTeorica) {
        const theoMins = getFgcMinutes(horaTeorica);
        if (theoMins !== null) {
          diffSec = Math.round((nowMins - theoMins) * 60);
          if (diffSec > 239) {
            estat = 'retard';
          } else if (diffSec < 0) {
            estat = 'avanc';
          } else {
            estat = 'en_hora';
          }
        }
      }

      const record: GipRegistrePas = {
        data_servei: serviceDate,
        circulacio_id: circCode,
        linia,
        ut: decodedUt,
        estacio_codi: exactStationCode,
        estacio_nom: matchedStop?.nom || exactStationCode,
        hora_teorica: horaTeorica || undefined,
        hora_real: currentClockStr,
        diferencia_segons: diffSec,
        estat
      };

      newRecordsToInsert.push(record);
      recordedKeys.add(key);
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
        console.warn('[GIP Recorder] Error inserint passos:', error);
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
