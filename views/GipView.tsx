import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, MapPin, Clock, ArrowRight, RefreshCcw, Activity, Train, TrainFront, CheckCircle2, AlertCircle, AlertTriangle, ChevronRight, X, Calendar, Layers, Bell, BellRing, Sparkles } from 'lucide-react';
import { supabase } from '../supabaseClient';
import GlassPanel from '../components/common/GlassPanel';
import { resolveStationId, formatDelayMinSec } from '../utils/stations';
import { getLiniaColor, getTrainPhone } from '../utils/fgc';
import { STATION_GEO_MAP } from '../utils/stationGeoData';
import { getFgcMinutes } from '../utils/time';
import { getFgcServiceDate, pollAndRecordGipPassages } from '../utils/gipRecorder';
import { decodeGeotrenCirculation } from './incidencia/utils/decodeCirculation';
import { decodeGeotrenUt } from './incidencia/utils/decodeUt';
import { GipRegistrePas } from '../types';
import { useToast } from '../components/ToastProvider';
import { isDelayNotifsEnabled, setDelayNotifsEnabled, requestDelayNotifsPermission, sendTestNotification, checkAndNotifyDelay } from '../utils/delayNotifications';

const resolveStationName = (codeOrName: string, linia: string = ''): string => {
  if (!codeOrName) return '';
  const trimmed = codeOrName.trim();
  const code = resolveStationId(trimmed, linia);
  const geo = STATION_GEO_MAP.get(code);
  if (geo?.name) return geo.name;
  return trimmed;
};

const formatTimeToHHMMSS = (timeStr: string | null | undefined): string => {
  if (!timeStr) return '--:--:--';
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

interface CircStopItem {
  code: string;
  nom: string;
  horaTeorica: string;
  horaReal: string | null;
  diferenciaSegons: number | null;
  estat: 'en_hora' | 'retard' | 'avanc' | 'pendent';
  isLiveNow?: boolean;
}

interface CircDetail {
  id: string;
  linia: string;
  inici: string;
  final: string;
  sortida: string;
  arribada: string;
  ut?: string;
  currentLiveStation?: string | null;
  stops: CircStopItem[];
}

export interface ActiveDelayedCirc {
  id: string;
  linia: string;
  ut?: string;
  desti?: string;
  currentStationCode: string;
  currentStationName: string;
  horaReal: string;
  horaTeorica: string;
  delaySec: number;
  estat: 'en_hora' | 'retard' | 'avanc';
}

export const GipView: React.FC<{ isPrivacyMode?: boolean }> = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCirc, setSelectedCirc] = useState<CircDetail | null>(null);
  const [activeCircsList, setActiveCircsList] = useState<Array<{ id: string; linia: string; ut: string; desti: string; currentSt: string | null }>>([]);
  const [todayPassagesCount, setTodayPassagesCount] = useState<number>(0);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterLine, setFilterLine] = useState<string>('Tots');
  const [delayedActiveCircs, setDelayedActiveCircs] = useState<ActiveDelayedCirc[]>([]);
  const [delayNotifsActive, setDelayNotifsActive] = useState<boolean>(() => isDelayNotifsEnabled());
  const { showToast } = useToast();

  const handleToggleDelayNotifs = async () => {
    if (delayNotifsActive) {
      setDelayNotifsEnabled(false);
      setDelayNotifsActive(false);
      showToast('Avisos de retard al mòbil desactivats', 'info');
    } else {
      const res = await requestDelayNotifsPermission();
      if (res.granted) {
        setDelayNotifsActive(true);
        showToast('Avisos al mòbil activats (> 4 min)', 'success');
      } else if (res.permission === 'denied') {
        showToast('El permís de notificació està bloquejat al navegador/mòbil', 'error');
      } else {
        showToast('No s\'ha pogut activar les notificacions', 'info');
      }
    }
  };

  const handleSendTestNotif = async () => {
    const sent = await sendTestNotification();
    if (sent) {
      showToast('Notificació de prova enviada al mòbil!', 'success');
    } else {
      showToast('Cal activar el permís de notificació primer', 'info');
    }
  };

  const serviceDate = useMemo(() => getFgcServiceDate(), []);

  // Rellotge en temps real
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeStr(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Recompte de passos registrats avui
  const fetchTodayCount = async () => {
    try {
      const { count } = await supabase
        .from('gip_registre_pas')
        .select('*', { count: 'exact', head: true })
        .eq('data_servei', serviceDate);
      if (typeof count === 'number') {
        setTodayPassagesCount(count);
      }
    } catch (err) {
      console.warn('Error fetching today count:', err);
    }
  };

  // Carrega trens actius de GeoTren i calcula els retards en temps real
  const fetchActiveTrainsAndDelays = async () => {
    try {
      const res = await fetch('https://dadesobertes.fgc.cat/api/v2/catalog/datasets/posicionament-dels-trens/exports/json');
      if (!res.ok) return;
      const data: any[] = await res.json();
      if (!Array.isArray(data)) return;

      const activeList: Array<{ id: string; linia: string; ut: string; desti: string; currentSt: string | null }> = [];
      const seen = new Set<string>();

      data.forEach(gt => {
        const decodedCirc = decodeGeotrenCirculation(gt.id);
        const circId = decodedCirc?.fullName?.toUpperCase() || (gt.id ? gt.id.split('|')[0]?.trim().toUpperCase() : null);
        if (!circId || seen.has(circId)) return;
        seen.add(circId);

        const ut = decodeGeotrenUt(gt.ut, gt.tipus_unitat) || gt.ut || '';
        const currentSt = gt.estacionat_a ? resolveStationId(gt.estacionat_a.trim(), gt.lin) : null;

        activeList.push({
          id: circId,
          linia: decodedCirc?.line || gt.lin || '',
          ut,
          desti: gt.desti || '',
          currentSt
        });
      });

      setActiveCircsList(activeList);

      // Obtenir els passos i retards actuals de les circulacions actives
      if (activeList.length > 0) {
        const activeCodes = activeList.map(a => a.id);
        const now = new Date();
        const currentClock = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const nowMin = getFgcMinutes(currentClock) || 0;

        const { data: passages } = await supabase
          .from('gip_registre_pas')
          .select('*')
          .eq('data_servei', serviceDate)
          .in('circulacio_id', activeCodes)
          .order('creat_el', { ascending: false });

        if (passages && passages.length > 0) {
          const latestByCirc = new Map<string, GipRegistrePas>();
          passages.forEach(p => {
            if (!latestByCirc.has(p.circulacio_id)) {
              latestByCirc.set(p.circulacio_id, p);
            }
          });

          const delayedList: ActiveDelayedCirc[] = [];
          activeList.forEach(a => {
            const p = latestByCirc.get(a.id);
            if (!p) return;

            // Filtre de temps: considerem que és el retard actiu d'ara si ha passat en els darrers 35 minuts
            const pMin = getFgcMinutes(p.hora_real);
            if (pMin === null || Math.abs(nowMin - pMin) > 35) return;

            // Filtre sol·licitat: només circulacions amb més de 3 minuts 30 segons (210 segons)
            if (p.diferencia_segons > 210) {
              delayedList.push({
                id: a.id,
                linia: a.linia || p.linia || '',
                ut: a.ut || p.ut || '',
                desti: a.desti || '',
                currentStationCode: p.estacio_codi,
                currentStationName: resolveStationName(p.estacio_nom || p.estacio_codi, a.linia || p.linia),
                horaReal: formatTimeToHHMMSS(p.hora_real),
                horaTeorica: formatTimeToHHMMSS(p.hora_teorica),
                delaySec: p.diferencia_segons,
                estat: p.estat
              });
            }

            // Si el retard supera els 4 minuts (>= 240s), activar alerta mòbil si està activat
            if (p.diferencia_segons >= 240) {
              checkAndNotifyDelay({
                circId: a.id,
                linia: a.linia || p.linia || '',
                ut: a.ut || p.ut || '',
                delaySec: p.diferencia_segons,
                stationName: resolveStationName(p.estacio_nom || p.estacio_codi, a.linia || p.linia),
                desti: a.desti || ''
              }).catch(() => {});
            }
          });

          // Ordenat estrictament de major a menor retard
          delayedList.sort((a, b) => b.delaySec - a.delaySec);
          setDelayedActiveCircs(delayedList);
        } else {
          setDelayedActiveCircs([]);
        }
      } else {
        setDelayedActiveCircs([]);
      }
    } catch (err) {
      console.warn('Error fetching active trains and delays for GIP:', err);
    }
  };

  // Carrega la informació detallada d'una circulació (Teòrica + Passos Reals de Supabase)
  const loadCirculationData = async (circIdToSearch: string) => {
    const cleanId = circIdToSearch.trim().toUpperCase();
    if (!cleanId) return;

    setLoading(true);
    try {
      // 1. Cercar la circulació oficial a Supabase
      const { data: circData } = await supabase
        .from('circulations')
        .select('id, linia, inici, sortida, final, arribada, estacions')
        .eq('id', cleanId)
        .maybeSingle();

      if (!circData) {
        // Fallback: si no està amb codi directe, provar com a part
        const { data: fallbackList } = await supabase
          .from('circulations')
          .select('id, linia, inici, sortida, final, arribada, estacions')
          .ilike('id', `%${cleanId}%`)
          .limit(1);

        if (!fallbackList || fallbackList.length === 0) {
          setSelectedCirc(null);
          setLoading(false);
          return;
        }
      }

      const activeRecord = circData || (await supabase.from('circulations').select('*').ilike('id', `%${cleanId}%`).limit(1)).data?.[0];
      if (!activeRecord) {
        setSelectedCirc(null);
        setLoading(false);
        return;
      }

      const line = activeRecord.linia || '';

      // 2. Construir la llista ordenada de parades oficials
      const stopsList: Array<{ code: string; nom: string; horaTeorica: string }> = [];

      if (activeRecord.inici && activeRecord.sortida) {
        const code = resolveStationId(activeRecord.inici, line);
        stopsList.push({
          code,
          nom: resolveStationName(code, line) || activeRecord.inici,
          horaTeorica: formatTimeToHHMMSS(activeRecord.sortida)
        });
      }

      if (Array.isArray(activeRecord.estacions)) {
        activeRecord.estacions.forEach((st: any) => {
          const h = st.sortida || st.hora || st.arribada;
          if (st.nom && h) {
            const code = resolveStationId(st.nom, line);
            stopsList.push({
              code,
              nom: resolveStationName(code, line) || st.nom,
              horaTeorica: formatTimeToHHMMSS(h)
            });
          }
        });
      }

      if (activeRecord.final && activeRecord.arribada) {
        const code = resolveStationId(activeRecord.final, line);
        stopsList.push({
          code,
          nom: resolveStationName(code, line) || activeRecord.final,
          horaTeorica: formatTimeToHHMMSS(activeRecord.arribada)
        });
      }

      // 3. Obtenir els passos reals ja registrats a gip_registre_pas
      const { data: realPassages } = await supabase
        .from('gip_registre_pas')
        .select('*')
        .eq('data_servei', serviceDate)
        .eq('circulacio_id', activeRecord.id);

      const realMap = new Map<string, GipRegistrePas>();
      let assignedUt: string | undefined = undefined;

      if (realPassages) {
        realPassages.forEach((rp: GipRegistrePas) => {
          realMap.set(rp.estacio_codi, rp);
          if (rp.ut && !assignedUt) assignedUt = rp.ut;
        });
      }

      // 4. Comprovar si aquesta circulació està circulant ara mateix a GeoTren
      const activeMatch = activeCircsList.find(c => c.id === activeRecord.id);
      if (activeMatch && activeMatch.ut) {
        assignedUt = activeMatch.ut;
      }

      // 5. Creuar cada parada teòrica amb la dada real
      const computedStops: CircStopItem[] = stopsList.map(st => {
        const recorded = realMap.get(st.code);
        const isLiveHere = activeMatch?.currentSt === st.code;

        if (recorded) {
          let diffSec = recorded.diferencia_segons;
          let estat: 'en_hora' | 'retard' | 'avanc' = recorded.estat;
          return {
            code: st.code,
            nom: st.nom,
            horaTeorica: st.horaTeorica,
            horaReal: formatTimeToHHMMSS(recorded.hora_real),
            diferenciaSegons: diffSec,
            estat,
            isLiveNow: isLiveHere
          };
        }

        return {
          code: st.code,
          nom: st.nom,
          horaTeorica: st.horaTeorica,
          horaReal: null,
          diferenciaSegons: null,
          estat: 'pendent',
          isLiveNow: isLiveHere
        };
      });

      setSelectedCirc({
        id: activeRecord.id,
        linia: line,
        inici: resolveStationName(activeRecord.inici, line) || activeRecord.inici,
        final: resolveStationName(activeRecord.final, line) || activeRecord.final,
        sortida: formatTimeToHHMMSS(activeRecord.sortida),
        arribada: formatTimeToHHMMSS(activeRecord.arribada),
        ut: assignedUt,
        currentLiveStation: activeMatch?.currentSt ? resolveStationName(activeMatch.currentSt, line) : null,
        stops: computedStops
      });
    } catch (err) {
      console.error('Error loading GIP circulation detail:', err);
    } finally {
      setLoading(false);
    }
  };

  // Cicle d'actualització periòdica cada 10 segons
  useEffect(() => {
    fetchTodayCount();
    fetchActiveTrainsAndDelays();

    const interval = setInterval(async () => {
      setIsRefreshing(true);
      try {
        await pollAndRecordGipPassages();
        await Promise.all([
          fetchTodayCount(),
          fetchActiveTrainsAndDelays()
        ]);
      } catch (err) {
        console.warn('Interval refresh error in GIP:', err);
      } finally {
        setIsRefreshing(false);
      }

      // Si hi ha una circulació seleccionada, refrescar els seus passos
      if (selectedCirc?.id) {
        loadCirculationData(selectedCirc.id);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedCirc?.id, serviceDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      loadCirculationData(query.trim());
    }
  };

  const handleSelectActive = (circId: string) => {
    setQuery(circId);
    loadCirculationData(circId);
  };

  const filteredActiveCircs = useMemo(() => {
    if (filterLine === 'Tots') return activeCircsList;
    return activeCircsList.filter(c => c.linia === filterLine);
  }, [activeCircsList, filterLine]);

  const filteredDelayedCircs = useMemo(() => {
    if (filterLine === 'Tots') return delayedActiveCircs;
    return delayedActiveCircs.filter(c => c.linia === filterLine);
  }, [delayedActiveCircs, filterLine]);

  // Format de la xapa de diferència (Regla oficial FGC)
  const renderDeviationBadge = (diffSec: number | null, estat: 'en_hora' | 'retard' | 'avanc' | 'pendent') => {
    if (diffSec === null || estat === 'pendent') {
      return (
        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest italic">
          Pendent
        </span>
      );
    }

    const absSec = Math.abs(diffSec);
    const m = Math.floor(absSec / 60);
    const s = absSec % 60;
    const timeFormatted = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    if (diffSec < 0) {
      // Avanç (Blau)
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black font-mono bg-blue-500/20 text-blue-400 border border-blue-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          -{timeFormatted} Avanç
        </span>
      );
    }

    if (diffSec === 0) {
      // Puntual exacte (Verd)
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black font-mono bg-fgc-green/20 text-fgc-green border border-fgc-green/30">
          <span className="w-1.5 h-1.5 rounded-full bg-fgc-green" />
          00:00 En hora
        </span>
      );
    }

    if (diffSec <= 239) {
      // Retard lleu <= 3 min 59 s: Groc i "En hora"
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black font-mono bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 dark:bg-yellow-400 animate-pulse" />
          +{timeFormatted} En hora
        </span>
      );
    }

    // Retard greu > 3 min 59 s (>= 240 s): Vermell i "Retard"
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black font-mono bg-red-500/20 text-red-500 border border-red-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        +{timeFormatted} Retard
      </span>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-8 animate-in fade-in duration-700 max-w-7xl mx-auto w-full">
      {/* Capçalera GIP */}
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="p-2.5 bg-fgc-green/20 text-fgc-green rounded-2xl border border-fgc-green/30">
              <Activity size={24} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#4D5358] dark:text-white tracking-tight uppercase">
                GIP · Gestió Integral de Pas
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">
                Monitoratge en temps real de l'hora teòrica vs pas real de circulacions segons Dades Obertes FGC.
              </p>
            </div>
          </div>
        </div>

        {/* Indicadors en viu */}
        <div className="flex items-center gap-3 flex-wrap self-start xl:self-auto">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 text-xs font-bold font-mono text-gray-500 dark:text-gray-300">
            <Calendar size={13} className="text-fgc-green" />
            Servei: {serviceDate}
          </span>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 text-xs font-black font-mono text-[#4D5358] dark:text-white">
            <Clock size={13} className="text-blue-400" />
            {currentTimeStr || '--:--:--'}
          </span>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-fgc-green/10 border border-fgc-green/20 text-xs font-bold text-fgc-green">
            <CheckCircle2 size={13} />
            {todayPassagesCount} passos enregistrats
          </span>
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 shrink-0" title="Actualització en viu cada 10s">
            <RefreshCcw size={13} className={isRefreshing ? "animate-spin text-fgc-green" : "text-gray-400"} />
          </span>
        </div>
      </header>

      {/* Barra de cerca de circulació */}
      <GlassPanel className="p-6 sm:p-8 !rounded-[32px] sm:!rounded-[40px] space-y-5">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca circulació (ex: D235, 401, F102, S1)..."
              className="w-full pl-11 pr-10 py-3.5 bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl text-sm font-bold uppercase tracking-wider text-[#4D5358] dark:text-white focus:outline-none focus:ring-2 focus:ring-fgc-green transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3.5 bg-fgc-green text-[#4D5358] rounded-2xl font-black uppercase text-xs tracking-wider shadow-lg shadow-fgc-green/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCcw size={15} className="animate-spin" /> : <Search size={15} />}
            Consultar GIP
          </button>
        </form>

        {/* Filtre de línia i píndoles de circulacions en viu */}
        <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-white/5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
              <Train size={12} className="text-fgc-green" />
              Circulacions Actives a la Xarxa ({filteredActiveCircs.length})
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {['Tots', 'S1', 'S2', 'L6', 'L7', 'L12'].map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setFilterLine(l)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all uppercase ${
                    filterLine === l
                      ? 'bg-fgc-grey dark:bg-white text-white dark:text-gray-900 shadow-sm'
                      : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto no-scrollbar pt-1">
            {filteredActiveCircs.length > 0 ? (
              filteredActiveCircs.map(c => {
                const isSelected = selectedCirc?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectActive(c.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      isSelected
                        ? 'bg-fgc-green text-[#4D5358] border-fgc-green shadow-md scale-105'
                        : 'bg-white dark:bg-black/30 text-gray-600 dark:text-gray-300 border-gray-200/60 dark:border-white/10 hover:border-fgc-green/50'
                    }`}
                  >
                    <span className="font-mono font-black">{c.id}</span>
                    {c.linia && (
                      <span className={`px-1.5 py-0.2 rounded text-[9px] text-white ${getLiniaColor(c.linia)}`}>
                        {c.linia}
                      </span>
                    )}
                    {c.ut && <span className="text-[10px] opacity-70 font-mono">UT {c.ut}</span>}
                  </button>
                );
              })
            ) : (
              <span className="text-xs text-gray-400 italic">No s'han trobat trens actius per aquest filtre.</span>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* Panell de Circulacions Actives amb Retard (Ordenades de Major a Menor) */}
      <GlassPanel className="p-6 sm:p-7 !rounded-[32px] sm:!rounded-[40px] space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <AlertTriangle size={20} className={filteredDelayedCircs.length > 0 ? "animate-pulse" : ""} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-[#4D5358] dark:text-white uppercase tracking-tight">
                  Circulacions Actives amb Retard
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black font-mono ${
                  filteredDelayedCircs.length > 0
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    : 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30'
                }`}>
                  {filteredDelayedCircs.length}
                </span>
              </div>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Ordenades de major a menor retard (&gt; 3m 30s) en temps real {filterLine !== 'Tots' && `(Línia ${filterLine})`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Botó de control d'avisos al mòbil (> 4 min) */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleToggleDelayNotifs}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all border shadow-sm ${
                  delayNotifsActive
                    ? 'bg-fgc-green/15 text-fgc-green border-fgc-green/30 hover:bg-fgc-green/25'
                    : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200/50 dark:border-white/10 hover:border-fgc-green/40'
                }`}
                title={delayNotifsActive ? 'Avisos al mòbil activats (> 4 min). Clic per desactivar.' : 'Activar avisos al mòbil quan un tren superi els 4 minuts de retard.'}
              >
                {delayNotifsActive ? (
                  <>
                    <BellRing size={14} className="animate-pulse text-fgc-green" />
                    <span>Avisos Mòbil (&gt; 4m): <strong>ON</strong></span>
                  </>
                ) : (
                  <>
                    <Bell size={14} className="text-gray-400" />
                    <span>Activar avisos mòbil (&gt; 4m)</span>
                  </>
                )}
              </button>

              {delayNotifsActive && (
                <button
                  type="button"
                  onClick={handleSendTestNotif}
                  className="p-1.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-500 hover:text-fgc-green hover:bg-fgc-green/10 border border-gray-200/50 dark:border-white/10 transition-colors"
                  title="Enviar notificació de prova al mòbil"
                >
                  <Sparkles size={14} />
                </button>
              )}
            </div>

            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-200/50 dark:border-white/5 font-mono text-[11px] text-gray-500">
              <span className={`w-2 h-2 rounded-full ${filteredDelayedCircs.length > 0 ? 'bg-amber-500 animate-ping' : 'bg-fgc-green'}`} />
              {filteredDelayedCircs.length > 0 ? 'Monitoritzant retards' : 'Sense retards > 3m 30s'}
            </span>
          </div>
        </div>

        {filteredDelayedCircs.length === 0 ? (
          <div className="py-6 px-4 bg-fgc-green/5 dark:bg-fgc-green/10 border border-fgc-green/20 rounded-2xl flex items-center justify-center gap-3 text-center">
            <CheckCircle2 size={20} className="text-fgc-green shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200">
              Cap circulació activa amb més de 3 minuts 30 segons de retard en aquest moment {filterLine !== 'Tots' ? `a la línia ${filterLine}` : 'a la xarxa'}.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-1">
            {filteredDelayedCircs.map((item, index) => {
              const isSelected = selectedCirc?.id === item.id;
              const isHighDelay = item.delaySec >= 240; // >= 4 minuts (retard oficial FGC)

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectActive(item.id)}
                  className={`text-left p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-2.5 relative group ${
                    isSelected
                      ? 'bg-fgc-green/10 border-fgc-green shadow-md scale-[1.02]'
                      : 'bg-white/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 border-gray-200/60 dark:border-white/10 hover:border-fgc-green/50 shadow-sm hover:shadow'
                  }`}
                >
                  {/* Capçalera: Rànquing, Codi, Línia, UT i Retard */}
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-black font-mono text-gray-400 bg-gray-100 dark:bg-white/10 w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <span className="font-mono font-black text-sm text-[#4D5358] dark:text-white">
                        {item.id}
                      </span>
                      {item.linia && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white leading-none ${getLiniaColor(item.linia)}`}>
                          {item.linia}
                        </span>
                      )}
                      {item.ut && (
                        <span className="text-[10px] font-mono font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                          UT {item.ut}
                        </span>
                      )}
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-black font-mono tracking-tight shrink-0 border ${
                        isHighDelay
                          ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      }`}
                    >
                      +{formatDelayMinSec(item.delaySec)}
                    </span>
                  </div>

                  {/* Informació d'estació i hores */}
                  <div className="space-y-1 w-full text-xs">
                    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 font-bold truncate">
                      <MapPin size={12} className="text-fgc-green shrink-0" />
                      <span className="truncate">{item.currentStationName || item.currentStationCode}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-100 dark:border-white/5">
                      <span>Prev: {item.horaTeorica}</span>
                      <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300 font-bold">
                        <Clock size={10} className="text-gray-400" />
                        Real: {item.horaReal}
                      </span>
                    </div>
                  </div>

                  {/* Indicador de clic interactiu */}
                  <div className="w-full flex items-center justify-between text-[10px] font-bold text-gray-400 group-hover:text-fgc-green transition-colors pt-0.5">
                    <span className="truncate">{item.desti ? `Destí: ${item.desti}` : 'Prem per obrir itinerari'}</span>
                    <ChevronRight size={12} className="transform group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </GlassPanel>

      {/* Targeta de la Circulació seleccionada */}
      {selectedCirc ? (
        <div className="space-y-6">
          {/* Resum Circulació */}
          <GlassPanel className="p-6 sm:p-8 !rounded-[32px] sm:!rounded-[40px] space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="min-w-[4rem] min-h-[4rem] bg-fgc-grey dark:bg-black text-white rounded-2xl flex flex-col items-center justify-center shadow-lg px-3">
                  <TrainFront size={20} className="mb-0.5 text-fgc-green" />
                  <span className="text-base font-black tracking-tighter leading-none">{selectedCirc.id}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-black text-[#4D5358] dark:text-white uppercase tracking-tight">
                      Circulació {selectedCirc.id}
                    </h2>
                    {selectedCirc.linia && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold text-white ${getLiniaColor(selectedCirc.linia)}`}>
                        {selectedCirc.linia}
                      </span>
                    )}
                    {selectedCirc.ut && (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-black font-mono bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/10">
                        UT {selectedCirc.ut}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400 mt-1 uppercase">
                    <span>{selectedCirc.inici}</span>
                    <ArrowRight size={13} className="opacity-50" />
                    <span>{selectedCirc.final}</span>
                  </div>
                </div>
              </div>

              {selectedCirc.currentLiveStation && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-fgc-green/10 border border-fgc-green/30 self-start md:self-auto">
                  <span className="w-2 h-2 rounded-full bg-fgc-green animate-pulse" />
                  <span className="text-xs font-bold text-fgc-green uppercase">
                    Ara mateix a: <span className="font-black">{selectedCirc.currentLiveStation}</span>
                  </span>
                </div>
              )}
            </div>
          </GlassPanel>

          {/* Taula GIP d'Estacions i Pas Real */}
          <GlassPanel className="p-6 sm:p-8 !rounded-[32px] sm:!rounded-[40px] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#4D5358] dark:text-white uppercase tracking-tight">
                  Itinerari de Parades i Pas Real
                </h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Comparativa d'arribades teòriques segons gràfic oficial vs hora real registrada per GeoTren.
                </p>
              </div>
              <span className="text-xs font-black font-mono text-gray-400 uppercase">
                {selectedCirc.stops.filter(s => s.horaReal !== null).length} / {selectedCirc.stops.length} parades
              </span>
            </div>

            {/* Capçalera de taula per pantalla gran */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest border-b border-gray-100 dark:border-white/5">
              <span className="col-span-5">Estació</span>
              <span className="col-span-2 text-center font-mono">H. Teòrica</span>
              <span className="col-span-2 text-center font-mono">H. Real (GeoTren)</span>
              <span className="col-span-3 text-right">Desviació / Estat</span>
            </div>

            {/* Llista d'estacions responsive */}
            <div className="space-y-2">
              {selectedCirc.stops.map((stop, idx) => {
                const isPassed = stop.horaReal !== null;
                const isFirst = idx === 0;
                const isLast = idx === selectedCirc.stops.length - 1;

                return (
                  <div
                    key={stop.code + idx}
                    className={`flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:gap-3 p-3 sm:px-4 sm:py-3 rounded-2xl transition-all border ${
                      stop.isLiveNow
                        ? 'bg-fgc-green/10 border-fgc-green/40 shadow-sm'
                        : isPassed
                          ? 'bg-white/80 dark:bg-white/5 border-gray-100 dark:border-white/5'
                          : 'bg-gray-50/50 dark:bg-black/20 border-dashed border-gray-200/50 dark:border-white/5 opacity-60'
                    }`}
                  >
                    {/* Columna Estació */}
                    <div className="sm:col-span-5 flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Indicador de pas */}
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          stop.isLiveNow
                            ? 'bg-fgc-green animate-ping'
                            : isPassed
                              ? (stop.estat === 'retard' && (stop.diferenciaSegons || 0) > 239 ? 'bg-red-500' : 'bg-fgc-green')
                              : 'bg-gray-300 dark:bg-gray-600'
                        }`} />

                        {/* Nom de l'estació responsive */}
                        <div>
                          {/* Mòbil: Sigles de l'estació */}
                          <span className="sm:hidden font-mono font-black text-sm text-[#4D5358] dark:text-white uppercase tracking-tight">
                            {stop.code}
                          </span>

                          {/* Pantalla gran: Nom complet de l'estació */}
                          <span className="hidden sm:inline font-bold text-sm text-[#4D5358] dark:text-white uppercase truncate">
                            {stop.nom}
                          </span>

                          {stop.isLiveNow && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-fgc-green text-[#4D5358] animate-pulse">
                              LIVE
                            </span>
                          )}
                        </div>
                      </div>

                      {/* En mòbil, la desviació es mostra a dalt a la dreta */}
                      <div className="sm:hidden">
                        {renderDeviationBadge(stop.diferenciaSegons, stop.estat)}
                      </div>
                    </div>

                    {/* Columna Hora Teòrica */}
                    <div className="sm:col-span-2 flex items-center justify-between sm:justify-center text-xs font-mono">
                      <span className="sm:hidden text-[9px] font-bold uppercase text-gray-400">Teòric:</span>
                      <span className="font-bold text-gray-500 dark:text-gray-400">
                        {stop.horaTeorica}
                      </span>
                    </div>

                    {/* Columna Hora Real */}
                    <div className="sm:col-span-2 flex items-center justify-between sm:justify-center text-xs font-mono">
                      <span className="sm:hidden text-[9px] font-bold uppercase text-gray-400">Real:</span>
                      <span className={`font-black ${stop.horaReal ? 'text-[#4D5358] dark:text-white' : 'text-gray-400 italic'}`}>
                        {stop.horaReal || '--:--:--'}
                      </span>
                    </div>

                    {/* Columna Desviació (Pantalla Gran) */}
                    <div className="hidden sm:flex sm:col-span-3 items-center justify-end">
                      {renderDeviationBadge(stop.diferenciaSegons, stop.estat)}
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassPanel>
        </div>
      ) : query && !loading ? (
        <GlassPanel className="p-12 text-center space-y-3 !rounded-[32px]">
          <AlertCircle size={32} className="mx-auto text-gray-400 opacity-60" />
          <h3 className="text-base font-bold text-gray-600 dark:text-gray-300 uppercase">
            No s'ha trobat la circulació "{query}"
          </h3>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Verifica el codi introduït (ex: D235, 401, S102). Pots triar qualsevol circulació activa de la llista superior.
          </p>
        </GlassPanel>
      ) : null}
    </div>
  );
};

export default GipView;
