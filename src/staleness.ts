import { MS_PER_DAY } from './constants';

/**
 * Age of an mtime in days. Negative when the timestamp is in the future.
 */
export function ageInDays(mtimeMs: number, now: number): number {
  return (now - mtimeMs) / MS_PER_DAY;
}

/**
 * A directory is stale when its mtime is at least `days` old.
 * `days === 0` marks every timestamp at or before `now` as stale.
 * Negative thresholds and non-finite inputs are never stale.
 */
export function isStale(mtimeMs: number, days: number, now: number): boolean {
  if (!Number.isFinite(mtimeMs) || !Number.isFinite(days) || !Number.isFinite(now)) {
    return false;
  }
  if (days < 0) return false;
  return now - mtimeMs >= days * MS_PER_DAY;
}
