import { supabase } from '../supabaseClient';
import { getFgcServiceDate } from './gipRecorder';
import { getFgcMinutes, normalizeTimeDiffSec } from './stations';
import { getServiceToday } from './serviceCalendar';
import type { AgentPerformanceHistory, GipRegistrePas } from '../types';

/**
 * Desa o actualitza el registre de rendiment i puntualitat d'un agent a Supabase.
 * Utilitza la clau única per jornada (data_servei, empleat_id) per evitar torns duplicats en un mateix dia.
 */
export const saveAgentPerformanceRecord = async (
  record: AgentPerformanceHistory
): Promise<{ success: boolean; error?: any }> => {
  if (!record.empleat_id || !record.data_servei) {
    return { success: false, error: 'Manca empleat_id o data_servei' };
  }

  try {
    const { error } = await supabase
      .from('agent_performance_history')
      .upsert({
        ...record,
        actualitzat_el: new Date().toISOString()
      }, {
        onConflict: 'data_servei,empleat_id'
      });

    if (error) {
      console.error('[AgentPerformanceService] Error guardant historial:', error);
      return { success: false, error };
    }
    return { success: true };
  } catch (e) {
    console.error('[AgentPerformanceService] Excepció guardant historial:', e);
    return { success: false, error: e };
  }
};

/**
 * Obté l'històric complet de rendiment d'un agent ordenat per data descendent,
 * garantint estrictament un únic registre per jornada (data_servei).
 */
export const getAgentPerformanceHistory = async (
  empleatId: string,
  limit: number = 30
): Promise<AgentPerformanceHistory[]> => {
  if (!empleatId) return [];

  try {
    const cleanId = String(empleatId).trim();
    const { data, error } = await supabase
      .from('agent_performance_history')
      .select('*')
      .eq('empleat_id', cleanId)
      .order('data_servei', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AgentPerformanceService] Error obtenint historial:', error);
      return [];
    }

    const rows = (data || []) as AgentPerformanceHistory[];
    const seenDates = new Set<string>();
    const deduplicated: AgentPerformanceHistory[] = [];
    for (const r of rows) {
      if (!seenDates.has(r.data_servei)) {
        seenDates.add(r.data_servei);
        deduplicated.push(r);
      }
    }

    return deduplicated;
  } catch (e) {
    console.error('[AgentPerformanceService] Excepció carregant historial:', e);
    return [];
  }
};

/**
 * Obté els registres de rendiment d'avui per a tots els agents (o d'una data de servei concreta).
 */
export const getDailyPerformanceSummary = async (
  serviceDate: string = getFgcServiceDate()
): Promise<Record<string, AgentPerformanceHistory>> => {
  try {
    const { data, error } = await supabase
      .from('agent_performance_history')
      .select('*')
      .eq('data_servei', serviceDate);

    if (error || !data) return {};

    const map: Record<string, AgentPerformanceHistory> = {};
    data.forEach((row: any) => {
      if (row.empleat_id) {
        const rawId = String(row.empleat_id).trim();
        const normId = rawId.replace(/^0+/, '');
        map[rawId] = row as AgentPerformanceHistory;
        if (normId) map[normId] = row as AgentPerformanceHistory;
      }
    });
    return map;
  } catch (e) {
    console.error('[AgentPerformanceService] Error obtenint resum diari:', e);
    return {};
  }
};

/**
 * Genera IDs candidats d'un torn per cercar a la taula shifts
 */
export const getCandidateShiftIdsForAgent = (clean: string, todayService: string): string[] => {
  const candidates = new Set<string>();
  candidates.add(clean);
  const prefixes = [todayService === '0' ? '0' : (todayService?.charAt(0) || '1'), '1', '0', '4', '5'];
  const q3 = clean.match(/^Q(\d{3})$/);
  if (q3) prefixes.forEach(p => candidates.add(`Q${p}${q3[1]}`));
  const num = clean.replace(/\D/g, '');
  if (num) prefixes.forEach(p => candidates.add(`Q${p}${num.padStart(3, '0')}`));
  if (!clean.startsWith('Q')) candidates.add(`Q${clean}`);
  return Array.from(candidates);
};

/**
 * Sincronitza i desa a Supabase el rendiment de tots els agents assignats a la jornada d'avui.
 */
export const syncAllAgentsPerformance = async (
  assignments: any[],
  todayService: string,
  targetDate: string = getFgcServiceDate()
): Promise<{ success: boolean; savedCount: number; perfMap?: Record<string, AgentPerformanceHistory>; error?: any }> => {
  if (!assignments || assignments.length === 0) {
    return { success: true, savedCount: 0, perfMap: {} };
  }

  const serviceDate = targetDate;
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  const nowMin = getFgcMinutes(timeStr) || 0;

  try {
    const activeAssignments = assignments.filter(a => {
      const t = (a.torn || '').trim().toUpperCase();
      return t && !['VAC', 'DES', 'DIS', 'DAG', 'AJN', 'S/A', 'FOR', 'LLIB', 'ABS'].some(p => t.startsWith(p));
    });

    if (activeAssignments.length === 0) {
      return { success: true, savedCount: 0, perfMap: {} };
    }

    const [shiftsRes, assignmentsRes] = await Promise.all([
      supabase.from('shifts').select('*'),
      supabase.from('assignments').select('cycle_id, train_number')
    ]);

    const shiftsList = shiftsRes.data || [];
    const shiftsMap = new Map<string, any>();
    shiftsList.forEach(s => {
      shiftsMap.set(s.id.toUpperCase(), s);
    });

    const cycleToTrainMap = new Map<string, string>();
    if (assignmentsRes.data) {
      assignmentsRes.data.forEach((a: any) => {
        if (a.cycle_id && a.train_number) {
          cycleToTrainMap.set(String(a.cycle_id).trim().toUpperCase(), String(a.train_number).trim());
        }
      });
    }

    const allCircCodes = new Set<string>();
    const agentShiftPairs: { agent: any; shift: any }[] = [];

    const realService = (todayService && todayService !== 'Tots' && ['0', '100', '400', '500'].includes(todayService))
      ? todayService
      : getServiceToday();

    activeAssignments.forEach(a => {
      const cleanTorn = (a.torn || '').trim().toUpperCase();
      const candidates = getCandidateShiftIdsForAgent(cleanTorn, realService);
      const matches = shiftsList.filter(s => candidates.includes(s.id.toUpperCase()));
      const best = matches.find(s => s.servei === realService && s.circulations?.length > 0)
        || matches.find(s => s.circulations?.length > 0)
        || matches[0]
        || shiftsMap.get(cleanTorn);

      agentShiftPairs.push({ agent: a, shift: best });

      if (best?.circulations && Array.isArray(best.circulations)) {
        best.circulations.forEach((c: any) => {
          const code = typeof c === 'string' ? c : c.codi;
          const realCode = typeof c === 'object' ? c.realCodi : null;
          const obsCode = (typeof c === 'object' && c.observacions) ? c.observacions.split('-')[0]?.trim() : null;
          if (code && code !== '-' && code !== 'Viatger') allCircCodes.add(code);
          if (realCode && realCode !== '-') allCircCodes.add(realCode);
          if (obsCode && obsCode.length >= 3 && obsCode !== 'Viatger') allCircCodes.add(obsCode);
        });
      }
    });

    const circCodeList = Array.from(allCircCodes);
    let allPassages: GipRegistrePas[] = [];
    const circMetaMap = new Map<string, any>();

    if (circCodeList.length > 0) {
      const sCode = realService === '0' ? '000' : realService;
      const chunkSize = 40;
      const passagePromises = [];
      const metaV2Promises = [];
      const metaLegacyPromises = [];

      for (let i = 0; i < circCodeList.length; i += chunkSize) {
        const chunk = circCodeList.slice(i, i + chunkSize);
        passagePromises.push(
          supabase
            .from('gip_registre_pas')
            .select('*')
            .eq('data_servei', serviceDate)
            .in('circulacio_id', chunk)
            .limit(5000)
        );
        metaV2Promises.push(
          supabase
            .from('circulationsv2')
            .select('id, servei, linia, inici, final, sortida, arribada')
            .eq('servei', sCode)
            .in('id', chunk)
        );
        metaLegacyPromises.push(
          supabase
            .from('circulations')
            .select('id, linia, inici, final, sortida, arribada')
            .in('id', chunk)
        );
      }

      const [passageResults, metaV2Results, metaLegacyResults] = await Promise.all([
        Promise.all(passagePromises),
        Promise.all(metaV2Promises),
        Promise.all(metaLegacyPromises)
      ]);

      passageResults.forEach(r => {
        if (r.data) allPassages = allPassages.concat(r.data as GipRegistrePas[]);
      });
      metaLegacyResults.forEach(r => {
        (r.data || []).forEach((m: any) => {
          if (m.id) circMetaMap.set(m.id.toUpperCase(), m);
        });
      });
      metaV2Results.forEach(r => {
        (r.data || []).forEach((m: any) => {
          if (m.id) circMetaMap.set(m.id.toUpperCase(), m);
        });
      });
    }

    const passagesByCirc = new Map<string, GipRegistrePas[]>();
    allPassages.forEach(p => {
      const list = passagesByCirc.get(p.circulacio_id) || [];
      list.push(p);
      passagesByCirc.set(p.circulacio_id, list);
    });

    const recordsToUpsert: AgentPerformanceHistory[] = [];
    const perfMap: Record<string, AgentPerformanceHistory> = {};

    agentShiftPairs.forEach(({ agent: a, shift: s }) => {
      const rawCircs = s?.circulations || [];
      const circs = rawCircs.filter((c: any) => {
        const codi = (typeof c === 'string' ? c : (c?.codi || '')).trim();
        return codi && codi !== '-' && codi !== 'RESERVA';
      });
      const shiftStartMin = getFgcMinutes(s?.inici_torn || a.hora_inici);
      const isShiftStarted = shiftStartMin !== null && nowMin >= shiftStartMin;

      const circDetails: any[] = [];
      let totalShiftPassages = 0;
      let onTimeShiftPassages = 0;
      let delayedShiftPassagesCount = 0;
      const allDelaysSec: number[] = [];
      let completedCircs = 0;
      let inProgressCircs = 0;

      circs.forEach((c: any) => {
        const codi = typeof c === 'string' ? c : (c.codi || c.realCodi || c.id);
        const realCodi = typeof c === 'object' ? c.realCodi : null;
        const obsCode = (typeof c === 'object' && c.observacions && codi === 'Viatger') ? c.observacions.split('-')[0]?.trim() : null;
        const lookupCode = (realCodi || obsCode || codi || '').toUpperCase();
        const meta = circMetaMap.get(lookupCode) || circMetaMap.get((codi || '').toUpperCase());

        const sortida = (typeof c === 'object' && c.sortida && c.sortida !== '-') ? c.sortida : meta?.sortida;
        const arribada = (typeof c === 'object' && c.arribada && c.arribada !== '-') ? c.arribada : meta?.arribada;
        const rawLinia = (typeof c === 'object' ? c.linia : undefined) || meta?.linia;
        const linia = rawLinia || (codi?.startsWith('F') || codi?.startsWith('P') ? 'S2' : (codi?.startsWith('D') || codi?.startsWith('K') || codi?.startsWith('M') ? 'S1' : (codi?.startsWith('A') ? 'L6' : (codi?.startsWith('B') ? 'L7' : (codi?.startsWith('E') ? 'L12' : (codi?.startsWith('V') ? 'MSR' : 'FGC'))))));
        const inici = (typeof c === 'object' && c.inici) ? c.inici : meta?.inici;
        const final = (typeof c === 'object' && c.final) ? c.final : meta?.final;
        const cicle = typeof c === 'object' ? c.cicle : undefined;

        const sMin = getFgcMinutes(sortida);
        const eMin = getFgcMinutes(arribada);

        let status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';
        if (sMin !== null && eMin !== null) {
          if (nowMin >= eMin) {
            status = 'COMPLETED';
            if (isShiftStarted) completedCircs++;
          } else if (nowMin >= sMin && nowMin < eMin) {
            status = 'IN_PROGRESS';
            if (isShiftStarted) inProgressCircs++;
          }
        }

        // Recuperar passos GIP reals pel codi comercial o pel realCodi
        const realPassages = (passagesByCirc.get(codi) || (realCodi ? passagesByCirc.get(realCodi) : []) || [])
          .slice()
          .sort((pA, pB) => (getFgcMinutes(pA.hora_real || pA.hora_teorica) ?? 0) - (getFgcMinutes(pB.hora_real || pB.hora_teorica) ?? 0));

        if (realPassages.length > 0 && status === 'PENDING' && isShiftStarted) {
          status = (eMin !== null && nowMin >= eMin) ? 'COMPLETED' : 'IN_PROGRESS';
          if (status === 'COMPLETED') completedCircs++; else inProgressCircs++;
        }

        const cPassages = (status === 'PENDING' && !isShiftStarted) ? [] : realPassages;
        const totalStops = cPassages.length;
        const onTimeStops = cPassages.filter(p => p.estat === 'en_hora' || p.estat === 'avanc').length;
        const delayedStops = cPassages.filter(p => p.estat === 'retard');

        const sortidaReal = cPassages.length > 0 ? cPassages[0].hora_real : undefined;
        const arribadaReal = cPassages.length > 0 ? cPassages[cPassages.length - 1].hora_real : undefined;

        // Resolució del tren (UT) emprat a la circulació
        const passageUt = cPassages.find(p => p.ut)?.ut;
        const fallbackUt = cicle ? cycleToTrainMap.get(String(cicle).trim().toUpperCase()) : null;
        const resolvedUt = passageUt || fallbackUt || (typeof c === 'object' ? (c.ut || c.train) : null) || null;

        if (totalStops > 0 || (status !== 'PENDING' && isShiftStarted)) {
          totalShiftPassages += totalStops;
          onTimeShiftPassages += onTimeStops;
          delayedShiftPassagesCount += delayedStops.length;
          delayedStops.forEach(p => {
            const normSec = normalizeTimeDiffSec(p.diferencia_segons);
            if (normSec > 0) allDelaysSec.push(normSec);
          });
        }

        circDetails.push({
          codi,
          realCodi,
          linia,
          inici: inici || (cPassages[0]?.estacio_codi) || '',
          final: final || (cPassages[cPassages.length - 1]?.estacio_codi) || '',
          cicle,
          ut: resolvedUt,
          train: resolvedUt,
          sortida,
          arribada,
          sortidaReal,
          arribadaReal,
          status,
          totalStops,
          onTimeStops,
          delayedStopsCount: delayedStops.length,
          delayedStops: delayedStops.map(p => ({
            estacio_codi: p.estacio_codi || '',
            estacio_nom: p.estacio_nom || p.estacio_codi || '',
            hora_teorica: p.hora_teorica || '',
            hora_real: p.hora_real || '',
            diferencia_segons: normalizeTimeDiffSec(p.diferencia_segons)
          })),
          rate: totalStops > 0 ? Number(((onTimeStops / totalStops) * 100).toFixed(1)) : null,
          maxDelaySec: delayedStops.length > 0 ? Math.max(...delayedStops.map(p => normalizeTimeDiffSec(p.diferencia_segons))) : 0
        });
      });

      const rate = totalShiftPassages > 0
        ? Number(((onTimeShiftPassages / totalShiftPassages) * 100).toFixed(1))
        : null;

      const maxDelaySec = allDelaysSec.length > 0 ? Math.max(...allDelaysSec) : 0;
      const avgDelaySec = allDelaysSec.length > 0 
        ? Math.round(allDelaysSec.reduce((x, y) => x + y, 0) / allDelaysSec.length) 
        : 0;

      const pendingCircs = circs.length - completedCircs - inProgressCircs;

      const record: AgentPerformanceHistory = {
        data_servei: serviceDate,
        empleat_id: String(a.empleat_id).trim(),
        nom: a.nom || '',
        cognoms: a.cognoms || '',
        torn: s?.id || a.torn || '',
        servei: s?.servei || todayService || '',
        dependencia: s?.dependencia || a.dependencia || '',
        hora_inici: s?.inici_torn || a.hora_inici || '',
        hora_fi: s?.final_torn || a.hora_fi || '',
        puntualitat_percentatge: rate,
        passos_totals: totalShiftPassages,
        passos_en_hora: onTimeShiftPassages,
        passos_retard: delayedShiftPassagesCount,
        retard_maxim_segons: maxDelaySec,
        retard_mitja_segons: avgDelaySec,
        circulacions_totals: circs.length,
        circulacions_completades: completedCircs,
        circulacions_en_curs: inProgressCircs,
        circulacions_pendents: pendingCircs,
        detall_circulacions: circDetails,
        estat_torn: (!isShiftStarted && totalShiftPassages === 0)
          ? 'NO_INICIAT' 
          : (completedCircs === circs.length && circs.length > 0) 
            ? 'COMPLETAT' 
            : 'EN_CURS'
      };

      recordsToUpsert.push(record);

      const rawId = String(a.empleat_id).trim();
      const normId = rawId.replace(/^0+/, '');
      perfMap[rawId] = record;
      if (normId) perfMap[normId] = record;
    });

    // Desat a Supabase en segon pla per persistir l'històric complet
    (async () => {
      for (let i = 0; i < recordsToUpsert.length; i += 50) {
        const chunk = recordsToUpsert.slice(i, i + 50);
        await supabase
          .from('agent_performance_history')
          .upsert(chunk.map(r => ({ ...r, actualitzat_el: new Date().toISOString() })), {
            onConflict: 'data_servei,empleat_id'
          });
      }
    })().catch(err => console.error('[AgentPerformanceService] Error en chunk upsert:', err));

    return { success: true, savedCount: recordsToUpsert.length, perfMap };
  } catch (e) {
    console.error('[AgentPerformanceService] Excepció en syncAllAgentsPerformance:', e);
    return { success: false, savedCount: 0, perfMap: {}, error: e };
  }
};
