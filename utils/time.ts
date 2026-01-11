
export function getFgcMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  let total = h * 60 + m;
  if (h < 4) total += 24 * 60;
  return total;
}

export function formatFgcTime(totalMinutes: number): string {
  let mins = totalMinutes;
  if (mins >= 24 * 60) mins -= 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

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
