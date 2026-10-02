import { supabase } from '../supabaseClient';
import { getFgcServiceDate } from './gipRecorder';
import { getFgcMinutes } from './stations';
import type { AgentPerformanceHistory, GipRegistrePas } from '../types';

/**
 * Desa o actualitza el registre de rendiment i puntualitat d'un agent a Supabase.
 * Utilitza la clau única (data_servei, empleat_id, torn).
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
        onConflict: 'data_servei,empleat_id,torn'
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
 * Obté l'històric complet de rendiment d'un agent ordenat per data descendent.
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
    return (data || []) as AgentPerformanceHistory[];
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
        map[row.empleat_id] = row as AgentPerformanceHistory;
      }
    });
    return map;
  } catch (e) {
    console.error('[AgentPerformanceService] Error obtenint resum diari:', e);
    return {};
  }
};

/**
 * Sincronitza i desa a Supabase el rendiment de tots els agents assignats a la jornada d'avui.
 */
export const syncAllAgentsPerformance = async (
  assignments: any[],
  todayService: string
): Promise<{ success: boolean; savedCount: number; error?: any }> => {
  if (!assignments || assignments.length === 0) {
    return { success: true, savedCount: 0 };
  }

  const serviceDate = getFgcServiceDate();
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  const nowMin = getFgcMinutes(timeStr) || 0;

  try {
    const activeAssignments = assignments.filter(a => {
      const t = (a.torn || '').trim().toUpperCase();
      return t && !['VAC', 'DES', 'DIS', 'DAG', 'AJN', 'S/A'].some(p => t.startsWith(p));
    });

    if (activeAssignments.length === 0) {
      return { success: true, savedCount: 0 };
    }

    const { data: dbShifts } = await supabase.from('shifts').select('*');
    const shiftsMap = new Map<string, any>();
    (dbShifts || []).forEach(s => {
      shiftsMap.set(s.id.toUpperCase(), s);
    });

    const allCircCodes = new Set<string>();
    activeAssignments.forEach(a => {
      const cleanTorn = (a.torn || '').trim().toUpperCase();
      const s = shiftsMap.get(cleanTorn) 
        || shiftsMap.get(`Q${cleanTorn}`)
        || (shiftsMap.get(`Q1${cleanTorn.padStart(3, '0')}`))
        || (shiftsMap.get(`Q0${cleanTorn.padStart(3, '0')}`))
        || (shiftsMap.get(`Q4${cleanTorn.padStart(3, '0')}`))
        || (shiftsMap.get(`Q5${cleanTorn.padStart(3, '0')}`));

      if (s?.circulations && Array.isArray(s.circulations)) {
        s.circulations.forEach((c: any) => {
          const code = typeof c === 'string' ? c : (c.codi || c.realCodi || c.id);
          if (code && code !== 'Viatger') allCircCodes.add(code);
        });
      }
    });

    const circCodeList = Array.from(allCircCodes);
    let allPassages: GipRegistrePas[] = [];
    if (circCodeList.length > 0) {
      for (let i = 0; i < circCodeList.length; i += 100) {
        const chunk = circCodeList.slice(i, i + 100);
        const { data: pData } = await supabase
          .from('gip_registre_pas')
          .select('*')
          .eq('data_servei', serviceDate)
          .in('circulacio_id', chunk);
        if (pData) {
          allPassages = allPassages.concat(pData as GipRegistrePas[]);
        }
      }
    }

    const passagesByCirc = new Map<string, GipRegistrePas[]>();
    allPassages.forEach(p => {
      const list = passagesByCirc.get(p.circulacio_id) || [];
      list.push(p);
      passagesByCirc.set(p.circulacio_id, list);
    });

    const recordsToUpsert: AgentPerformanceHistory[] = [];

    activeAssignments.forEach(a => {
      const cleanTorn = (a.torn || '').trim().toUpperCase();
      const s = shiftsMap.get(cleanTorn) 
        || shiftsMap.get(`Q${cleanTorn}`)
        || (shiftsMap.get(`Q1${cleanTorn.padStart(3, '0')}`))
        || (shiftsMap.get(`Q0${cleanTorn.padStart(3, '0')}`))
        || (shiftsMap.get(`Q4${cleanTorn.padStart(3, '0')}`))
        || (shiftsMap.get(`Q5${cleanTorn.padStart(3, '0')}`));

      const circs = s?.circulations || [];
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
        const sortida = typeof c === 'object' ? c.sortida : undefined;
        const arribada = typeof c === 'object' ? c.arribada : undefined;
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

        const cPassages = status === 'PENDING' ? [] : (passagesByCirc.get(codi) || []);
        const totalStops = cPassages.length;
        const onTimeStops = cPassages.filter(p => p.estat === 'en_hora' || p.estat === 'avanc').length;
        const delayedStops = cPassages.filter(p => p.estat === 'retard');

        if (status !== 'PENDING' && isShiftStarted) {
          totalShiftPassages += totalStops;
          onTimeShiftPassages += onTimeStops;
          delayedShiftPassagesCount += delayedStops.length;
          delayedStops.forEach(p => {
            if (p.diferencia_segons) allDelaysSec.push(p.diferencia_segons);
          });
        }

        circDetails.push({
          codi,
          sortida,
          arribada,
          status,
          totalStops,
          onTimeStops,
          delayedStopsCount: delayedStops.length,
          rate: totalStops > 0 ? Number(((onTimeStops / totalStops) * 100).toFixed(1)) : null,
          maxDelaySec: delayedStops.length > 0 ? Math.max(...delayedStops.map(p => p.diferencia_segons || 0)) : 0
        });
      });

      const rate = (isShiftStarted && totalShiftPassages > 0)
        ? Number(((onTimeShiftPassages / totalShiftPassages) * 100).toFixed(1))
        : null;

      const maxDelaySec = allDelaysSec.length > 0 ? Math.max(...allDelaysSec) : 0;
      const avgDelaySec = allDelaysSec.length > 0 
        ? Math.round(allDelaysSec.reduce((a, b) => a + b, 0) / allDelaysSec.length) 
        : 0;

      const pendingCircs = circs.length - completedCircs - inProgressCircs;

      recordsToUpsert.push({
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
        estat_torn: !isShiftStarted 
          ? 'NO_INICIAT' 
          : (completedCircs === circs.length && circs.length > 0) 
            ? 'COMPLETAT' 
            : 'EN_CURS'
      });
    });

    for (let i = 0; i < recordsToUpsert.length; i += 50) {
      const chunk = recordsToUpsert.slice(i, i + 50);
      const { error: upErr } = await supabase
        .from('agent_performance_history')
        .upsert(chunk.map(r => ({ ...r, actualitzat_el: new Date().toISOString() })), {
          onConflict: 'data_servei,empleat_id,torn'
        });
      if (upErr) {
        console.error('[AgentPerformanceService] Error en chunk upsert:', upErr);
      }
    }

    return { success: true, savedCount: recordsToUpsert.length };
  } catch (e) {
    console.error('[AgentPerformanceService] Excepció en syncAllAgentsPerformance:', e);
    return { success: false, savedCount: 0, error: e };
  }
};
