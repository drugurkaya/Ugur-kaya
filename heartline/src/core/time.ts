/** The game clock counts minutes since 00:00 of day 0 (the day of the 05:12 call). */
export const MIN_PER_DAY = 24 * 60;

export function clockOf(h: number, m: number, day = 0): number {
  return day * MIN_PER_DAY + h * 60 + m;
}

export function formatClock(minutes: number): string {
  const m = Math.floor(minutes) % MIN_PER_DAY;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function dayOf(minutes: number): number {
  return Math.floor(minutes / MIN_PER_DAY);
}
