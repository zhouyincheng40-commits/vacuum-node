const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * Format a byte count as a short binary (1024-based) size.
 * Values under 1024 bytes are integers. Larger values use one decimal place.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new TypeError('bytes must be a finite, non-negative number');
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`;
}

/** Format bytes as gibibytes with two decimal places, e.g. `0.01 GB`. */
export function formatGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new TypeError('bytes must be a finite, non-negative number');
  }
  return `${bytesToGb(bytes).toFixed(2)} GB`;
}

/** Numeric gibibytes, rounded to 4 decimal places for JSON. */
export function bytesToGb(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new TypeError('bytes must be a finite, non-negative number');
  }
  return Math.round((bytes / 1024 ** 3) * 10000) / 10000;
}

/** Compact age label used in the preview table. */
export function formatAge(days: number): string {
  if (!Number.isFinite(days) || days < 0) return '?';
  if (days < 1) return '<1d';
  return `${Math.floor(days)}d`;
}
