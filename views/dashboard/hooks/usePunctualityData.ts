import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { getFgcServiceDate } from '../../../utils/gipRecorder';
import { resolveStationId } from '../../../utils/stations';
import { STATION_GEO_MAP } from '../../../utils/stationGeoData';

export interface LinePunctuality {
  linia: string;
  total: number;
  onTime: number;
  delayed: number;
  rate: number; // 0 - 100
  avgDelaySec: number;
  avgDelayFormatted: string;
}

export interface HourlyPunctuality {
  hour: number;
  label: string; // '06h', '07h'...
  total: number;
  onTime: number;
  delayed: number;
  rate: number; // 0 - 100
}

export interface DelayedCirculation {
  circulacioId: string;
  linia: string;
  ut?: string;
  estacioCodi: string;
  estacioNom: string;
  horaTeorica?: string;
  horaReal: string;
  hour: number;
  diferenciaSegons: number;
  delayFormatted: string;
  creatEl?: string;
}

export interface PunctualityStats {
  totalPassages: number;
  onTimeCount: number;
  delayedCount: number;
  globalRate: number; // 0 - 100
  avgDelaySec: number;
  avgDelayFormatted: string;
  lineStats: LinePunctuality[];
  hourlyStats: HourlyPunctuality[];
  recentDelays: DelayedCirculation[];
  lastUpdated: Date;
}

export const formatDelayString = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `+${secs}s`;
  return `+${mins}m ${secs.toString().padStart(2, '0')}s`;
};

const resolveStationLabel = (codeOrName: string, linia: string = ''): string => {
  if (!codeOrName) return '';
  const trimmed = codeOrName.trim();
  const code = resolveStationId(trimmed, linia);
  const geo = STATION_GEO_MAP.get(code);
  if (geo?.name) return `${code} · ${geo.name}`;
  return trimmed;
};

export const usePunctualityData = () => {
  const [stats, setStats] = useState<PunctualityStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshLabel, setLastRefreshLabel] = useState<string>('fa pocs segons');
  const lastRefreshTimeRef = useRef<number>(Date.now());

  const fetchPunctuality = useCallback(async (isManual: boolean = false) => {
    if (isManual) setIsRefreshing(true);
    const serviceDate = getFgcServiceDate();

    try {
      // 1. Recompte total de passos d'avui
      const { count, error: countErr } = await supabase
        .from('gip_registre_pas')
        .select('*', { count: 'exact', head: true })
        .eq('data_servei', serviceDate);

      if (countErr || count === null || count === 0) {
        setStats({
          totalPassages: 0,
          onTimeCount: 0,
          delayedCount: 0,
          globalRate: 100,
          avgDelaySec: 0,
          avgDelayFormatted: '0s',
          lineStats: ['S1', 'S2', 'L6', 'L7', 'L12'].map(l => ({
            linia: l,
            total: 0,
            onTime: 0,
            delayed: 0,
            rate: 100,
            avgDelaySec: 0,
            avgDelayFormatted: '0s'
          })),
          hourlyStats: [],
          recentDelays: [],
          lastUpdated: new Date()
        });
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      // 2. Descàrrega per blocs (PostgREST limita a 1000 per petició)
      const batchSize = 1000;
      const promises = [];
      for (let i = 0; i < count; i += batchSize) {
        promises.push(
          supabase
            .from('gip_registre_pas')
            .select('circulacio_id, linia, ut, estacio_codi, estacio_nom, hora_teorica, hora_real, diferencia_segons, estat, creat_el')
            .eq('data_servei', serviceDate)
            .range(i, i + batchSize - 1)
        );
      }

      const results = await Promise.all(promises);
      let allRows: any[] = [];
      results.forEach(r => {
        if (r.data) allRows = allRows.concat(r.data);
      });

      // 3. Càlcul de mètriques globals
      const onTimeRows = allRows.filter(r => r.estat === 'en_hora' || r.estat === 'avanc');
      const delayedRows = allRows.filter(r => r.estat === 'retard');
      const onTimeCount = onTimeRows.length;
      const delayedCount = delayedRows.length;
      const totalPassages = allRows.length;
      const globalRate = totalPassages > 0 ? Number(((onTimeCount / totalPassages) * 100).toFixed(1)) : 100;

      const totalDelaySec = delayedRows.reduce((acc, r) => acc + (r.diferencia_segons > 0 ? r.diferencia_segons : 0), 0);
      const avgDelaySec = delayedRows.length > 0 ? Math.round(totalDelaySec / delayedRows.length) : 0;
      const avgDelayFormatted = formatDelayString(avgDelaySec);

      // 4. Mètriques per línia oficial
      const standardLines = ['S1', 'S2', 'L6', 'L7', 'L12'];
      const lineStats: LinePunctuality[] = standardLines.map(linia => {
        const lRows = allRows.filter(r => r.linia === linia);
        const lOnTime = lRows.filter(r => r.estat === 'en_hora' || r.estat === 'avanc').length;
        const lDelayed = lRows.filter(r => r.estat === 'retard').length;
        const lRate = lRows.length > 0 ? Number(((lOnTime / lRows.length) * 100).toFixed(1)) : 100;
        const lDelRows = lRows.filter(r => r.estat === 'retard');
        const lDelaySum = lDelRows.reduce((acc, r) => acc + (r.diferencia_segons > 0 ? r.diferencia_segons : 0), 0);
        const lAvgD = lDelRows.length > 0 ? Math.round(lDelaySum / lDelRows.length) : 0;

        return {
          linia,
          total: lRows.length,
          onTime: lOnTime,
          delayed: lDelayed,
          rate: lRate,
          avgDelaySec: lAvgD,
          avgDelayFormatted: formatDelayString(lAvgD)
        };
      });

      // 5. Evolució horària
      const hourMap = new Map<number, { hour: number; total: number; onTime: number; delayed: number }>();
      allRows.forEach(r => {
        if (!r.hora_real) return;
        const h = parseInt(r.hora_real.split(':')[0], 10);
        if (isNaN(h)) return;
        if (!hourMap.has(h)) {
          hourMap.set(h, { hour: h, total: 0, onTime: 0, delayed: 0 });
        }
        const item = hourMap.get(h)!;
        item.total++;
        if (r.estat === 'en_hora' || r.estat === 'avanc') {
          item.onTime++;
        } else {
          item.delayed++;
        }
      });

      const hourlyStats: HourlyPunctuality[] = Array.from(hourMap.values())
        .sort((a, b) => a.hour - b.hour)
        .map(h => ({
          hour: h.hour,
          label: `${h.hour.toString().padStart(2, '0')}h`,
          total: h.total,
          onTime: h.onTime,
          delayed: h.delayed,
          rate: Number(((h.onTime / h.total) * 100).toFixed(1))
        }));

      // 6. Circulacions amb retard (desduplicades per circulacio_id i hora per filtrar per franja)
      const sortedDelayed = [...delayedRows].sort((a, b) => (b.creat_el || '').localeCompare(a.creat_el || ''));
      const circMap = new Map<string, DelayedCirculation>();

      sortedDelayed.forEach(r => {
        if (!r.hora_real) return;
        const h = parseInt(r.hora_real.split(':')[0], 10);
        if (isNaN(h)) return;
        const key = `${r.circulacio_id}:${h}`;
        const existing = circMap.get(key);
        if (!existing || r.diferencia_segons > existing.diferenciaSegons) {
          circMap.set(key, {
            circulacioId: r.circulacio_id,
            linia: r.linia || '',
            ut: r.ut,
            estacioCodi: r.estacio_codi,
            estacioNom: resolveStationLabel(r.estacio_codi, r.linia),
            horaTeorica: r.hora_teorica,
            horaReal: r.hora_real,
            hour: h,
            diferenciaSegons: r.diferencia_segons,
            delayFormatted: formatDelayString(r.diferencia_segons),
            creatEl: r.creat_el
          });
        }
      });

      const recentDelays: DelayedCirculation[] = Array.from(circMap.values());

      setStats({
        totalPassages,
        onTimeCount,
        delayedCount,
        globalRate,
        avgDelaySec,
        avgDelayFormatted,
        lineStats,
        hourlyStats,
        recentDelays,
        lastUpdated: new Date()
      });
      lastRefreshTimeRef.current = Date.now();
    } catch (err) {
      console.error('[usePunctualityData] Error carregant dades GIP:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Cicle inicial i refresc automàtic cada 30 segons
  useEffect(() => {
    fetchPunctuality();
    const interval = setInterval(() => {
      fetchPunctuality();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchPunctuality]);

  // Rellotge d'etiqueta "fa Xs"
  useEffect(() => {
    const updateLabel = () => {
      const diffSec = Math.floor((Date.now() - lastRefreshTimeRef.current) / 1000);
      if (diffSec < 10) setLastRefreshLabel('fa pocs segons');
      else if (diffSec < 60) setLastRefreshLabel(`fa ${diffSec}s`);
      else {
        const mins = Math.floor(diffSec / 60);
        setLastRefreshLabel(`fa ${mins}m`);
      }
    };
    updateLabel();
    const timer = setInterval(updateLabel, 5000);
    return () => clearInterval(timer);
  }, []);

  return {
    stats,
    loading,
    isRefreshing,
    lastRefreshLabel,
    refresh: () => fetchPunctuality(true)
  };
};
