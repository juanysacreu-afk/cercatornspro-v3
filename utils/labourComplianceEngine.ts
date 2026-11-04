import { getFgcMinutes } from './stations';
import type { EnrichedShift } from '../types';

export interface LabourComplianceResult {
  score: 'compliant' | 'warning' | 'violation';
  label: string;
  badgeClass: string;
  continuousDrivingMin: number;
  continuousLimitMin: number;
  maxContinuousExceeded: boolean;
  restBreakMin: number;
  restBreakWarning: boolean;
  totalShiftMin: number;
  maxShiftLimitMin: number;
  shiftExceeded: boolean;
  extensionMin: number;
  maxAllowedExtensionMin: number;
  extensionExceeded: boolean;
  interShiftRestHours: number;
  interShiftWarning: boolean;
  violations: string[];
  warnings: string[];
  recommendation: string;
}

/**
 * Motor d'Auditoria Laboral en Temps Real (FGC Legal & Rest Compliance Engine)
 * Reglamentació oficial de treball ferroviari FGC BV:
 * 1. Conducció continuada màxima: 5h 30m (330 minuts) sense descans computable (>= 15 min).
 * 2. Descans mínim computable: Qualsevol temps de no conducció de 15 minuts o més es considera descans.
 * 3. Límit màxim de perllongament per necessitat del servei: +45 minuts (topall absolut 8h 45m = 525 minuts).
 * 4. Descans interjornada mínim: 12 hores consecutives entre torns.
 */
export function auditLabourCompliance(
  shift: EnrichedShift | any,
  additionalDrivingMin: number = 0,
  additionalExtensionMin: number = 0
): LabourComplianceResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  const startMin = getFgcMinutes(shift?.inici_torn) ?? 0;
  const endMin = getFgcMinutes(shift?.final_torn) ?? 0;
  let baseShiftDurationMin = endMin >= startMin ? (endMin - startMin) : (endMin + 1440 - startMin);
  if (baseShiftDurationMin === 0 && shift?.duracio) {
    const parts = String(shift.duracio).split(':');
    if (parts.length >= 2) {
      baseShiftDurationMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
  }

  const extensionMin = (shift?.extData?.extraNeeded || 0) + additionalExtensionMin;
  const totalShiftMin = baseShiftDurationMin + extensionMin;
  const maxShiftLimitMin = 525; // 8h 45m
  const maxAllowedExtensionMin = 45; // 45 min perllongament

  // 1. Durada màxima de torn i perllongament
  let shiftExceeded = false;
  let extensionExceeded = false;
  if (extensionMin > maxAllowedExtensionMin) {
    extensionExceeded = true;
    violations.push(`Perllongament de +${extensionMin} min supera el topall reglamentari de +45 min.`);
  } else if (extensionMin >= 30) {
    warnings.push(`Perllongament elevat (+${extensionMin} min); es troba a prop del límit màxim de +45 min.`);
  }

  if (totalShiftMin > maxShiftLimitMin) {
    shiftExceeded = true;
    violations.push(`Jornada total de ${Math.floor(totalShiftMin / 60)}h ${totalShiftMin % 60}m supera el màxim permès de 8h 45m.`);
  } else if (totalShiftMin >= 495) { // 8h 15m
    warnings.push(`Jornada acumulada propera al topall: ${Math.floor(totalShiftMin / 60)}h ${totalShiftMin % 60}m (límit màxim 8h 45m).`);
  }

  // 2. Conducció continuada màxima (màx 330 minuts / 5h 30m)
  let maxContinuousDriving = 0;
  let currentContinuousDriving = 0;
  let maxRestFound = 0;

  const circs = (shift?.fullCirculations || shift?.circulations || []) as any[];
  if (circs.length > 0) {
    for (let i = 0; i < circs.length; i++) {
      const c = circs[i];
      const cDep = getFgcMinutes(c.sortida);
      const cArr = getFgcMinutes(c.arribada);
      if (cDep !== null && cArr !== null && cArr >= cDep) {
        const driveDur = cArr - cDep;
        currentContinuousDriving += driveDur;

        // Comprovar descans amb la següent circulació
        if (i < circs.length - 1) {
          const nextC = circs[i + 1];
          const nextDep = getFgcMinutes(nextC.sortida);
          if (nextDep !== null) {
            const gap = nextDep >= cArr ? (nextDep - cArr) : (nextDep + 1440 - cArr);
            // Qualsevol temps de no conducció de 15 minuts o més es considera descans computable
            if (gap >= 15) {
              if (gap > maxRestFound) maxRestFound = gap;
              if (currentContinuousDriving > maxContinuousDriving) {
                maxContinuousDriving = currentContinuousDriving;
              }
              currentContinuousDriving = 0; // Reset descans computable assolit (>= 15 min)
            }
            // NOTA: Els intervals tècnics habituals de gir a capçalera inferiors a 15 minuts
            // simplement no computen com a descans reglamentari (la conducció continuada no es reinicia),
            // però NO constitueixen cap advertència ni anomalia laboral.
          }
        }
      }
    }
  }

  if (currentContinuousDriving > maxContinuousDriving) {
    maxContinuousDriving = currentContinuousDriving;
  }

  const totalContinuousDriving = maxContinuousDriving + additionalDrivingMin;
  const continuousLimitMin = 330; // 5h 30m
  const maxContinuousExceeded = totalContinuousDriving > continuousLimitMin;
  if (maxContinuousExceeded) {
    violations.push(`Temps de conducció continuada de ${Math.floor(totalContinuousDriving / 60)}h ${totalContinuousDriving % 60}m supera el màxim permès de 5h 30m.`);
  } else if (totalContinuousDriving >= 270) { // 4h 30m
    warnings.push(`Conducció continuada elevada: acumula ${Math.floor(totalContinuousDriving / 60)}h ${totalContinuousDriving % 60}m sense descans mínim de 15 minuts (límit màxim 5h 30m).`);
  }

  // 3. Descans computable
  let restBreakWarning = false;
  const declaredRest = shift?.restSeg ? (shift.restSeg.end - shift.restSeg.start) : maxRestFound;
  // Només si el torn és llarg (>= 5h / 300 min) i no té cap descans >= 15 minuts
  if (baseShiftDurationMin >= 300 && declaredRest < 15) {
    restBreakWarning = true;
    warnings.push(`Torn de més de 5h sense cap descans continuat programat d'un mínim de 15 minuts.`);
  }

  // 4. Descans interjornada (mínim 12 hores consecutives)
  let interShiftWarning = false;
  let interShiftRestHours = 12;
  const effectiveEndMin = endMin + extensionMin;
  if (effectiveEndMin > 1440) {
    const nextPossibleStart = 360; // 06:00
    const restAvailMin = (nextPossibleStart + 1440) - effectiveEndMin;
    interShiftRestHours = Math.round((restAvailMin / 60) * 10) / 10;
    if (interShiftRestHours < 12) {
      interShiftWarning = true;
      violations.push(`El perllongament redueix el descans entre jornades consecutives a ${interShiftRestHours}h (mínim legal 12h).`);
    } else if (interShiftRestHours < 13) {
      warnings.push(`Descans entre jornades ajustat: ${interShiftRestHours}h lliures abans del proper servei (mínim 12h).`);
    }
  }

  // Veredicte Final
  let score: 'compliant' | 'warning' | 'violation' = 'compliant';
  let label = 'CONFORME AL CONVENI';
  let badgeClass = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
  let recommendation = 'Aquest maquinista compleix escrupolosament el conveni laboral ferroviari d\'FGC.';

  if (violations.length > 0) {
    score = 'violation';
    label = 'INFRACCIÓ LABORAL';
    badgeClass = 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30';
    recommendation = 'ATENCIÓ: Assignar aquesta cobertura suposarà una vulneració de la normativa de seguretat laboral d\'FGC.';
  } else if (warnings.length > 0) {
    score = 'warning';
    label = 'LÍMIT AJUSTAT';
    badgeClass = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    recommendation = 'Operable amb precaució: es troba proper als llindars reglamentaris d\'FGC.';
  }

  return {
    score,
    label,
    badgeClass,
    continuousDrivingMin: totalContinuousDriving,
    continuousLimitMin,
    maxContinuousExceeded,
    restBreakMin: declaredRest,
    restBreakWarning,
    totalShiftMin,
    maxShiftLimitMin,
    shiftExceeded,
    extensionMin,
    maxAllowedExtensionMin,
    extensionExceeded,
    interShiftRestHours,
    interShiftWarning,
    violations,
    warnings,
    recommendation
  };
}
