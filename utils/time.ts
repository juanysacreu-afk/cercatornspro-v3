/**
 * Time Utilities - Re-exports from stations.ts for backward compatibility.
 * New code should import directly from '../utils/stations'.
 */
import { getFgcMinutes as getFgcMinutesBase, formatFgcTime } from './stations';

// CercarView & ShiftTimeline expect getFgcMinutes to return number (not null),
// so we provide a zero-fallback wrapper here for backward compatibility.
export function getFgcMinutes(timeStr: string): number {
  return getFgcMinutesBase(timeStr) ?? 0;
}

export { formatFgcTime };

export function calculateGap(from: string, to: string): number {
  if (!from || !to) return 0;
  const start = getFgcMinutes(from);
  const end = getFgcMinutes(to);
  return end - start;
}

export function checkIfActive(startStr: string, endStr: string, nowMin: number): boolean {
  if (!startStr || !endStr) return false;
  const start = getFgcMinutes(startStr);
  const end = getFgcMinutes(endStr);
  return nowMin >= start && nowMin < end;
}
