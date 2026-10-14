import path from 'node:path';
import { formatAge, formatBytes, formatGb } from './format';
import type { Candidate, ReportPayload } from './types';

export function displayPath(target: string, cwd: string): string {
  const relative = path.relative(cwd, target);
  if (relative === '') return '.';
  if (relative.startsWith('..') || path.isAbsolute(relative)) return target;
  return relative;
}

function paint(enabled: boolean, code: string, text: string): string {
  if (!enabled) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

export function renderPreview(options: {
  root: string;
  cwd: string;
  days: number;
  caches: boolean;
  candidates: readonly Candidate[];
  color: boolean;
  dryRunNote: string | null;
}): string {
  const { candidates, color } = options;
  const lines: string[] = [];
  lines.push(paint(color, '1', 'vacuum-node'));
  lines.push('');
  lines.push(`  scan root   ${options.root}`);
  lines.push(`  older than  ${options.days} day${options.days === 1 ? '' : 's'}`);
  if (options.caches) lines.push('  caches      .next, .turbo, dist');
  lines.push('');

  if (candidates.length === 0) {
    lines.push('  No stale directories found.');
    lines.push('');
    return `${lines.join('\n')}\n`;
  }

  const rendered = candidates.map((candidate) => ({
    size: formatBytes(candidate.bytes),
    age: formatAge(candidate.ageDays),
    shown: displayPath(candidate.path, options.cwd),
  }));
  const sizeWidth = Math.max(4, ...rendered.map((row) => row.size.length));
  const ageWidth = Math.max(3, ...rendered.map((row) => row.age.length));

  lines.push(
    `  ${'SIZE'.padStart(sizeWidth)}  ${'AGE'.padEnd(ageWidth)}  PATH`,
  );
  for (const row of rendered) {
    lines.push(
      `  ${paint(color, '36', row.size.padStart(sizeWidth))}  ${row.age.padEnd(ageWidth)}  ${row.shown}`,
    );
  }

  const totalBytes = candidates.reduce((sum, candidate) => sum + candidate.bytes, 0);
  const noun = candidates.length === 1 ? 'directory' : 'directories';
  lines.push('');
  lines.push(
    `  ${candidates.length} ${noun} · ${formatBytes(totalBytes)} · ${paint(color, '33', formatGb(totalBytes))}`,
  );
  if (options.dryRunNote) {
    lines.push('');
    lines.push(`  ${options.dryRunNote}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function renderDeleted(count: number, bytes: number, color: boolean): string {
  const noun = count === 1 ? 'directory' : 'directories';
  return `Deleted ${count} ${noun} · freed ${formatBytes(bytes)} · ${paint(color, '32', formatGb(bytes))}\n`;
}

export function candidateBytes(candidates: readonly Candidate[], removed: readonly string[]): number {
  const removedSet = new Set(removed);
  return candidates
    .filter((candidate) => removedSet.has(candidate.path))
    .reduce((sum, candidate) => sum + candidate.bytes, 0);
}

export function buildPayload(input: {
  ok: boolean;
  dryRun: boolean;
  declined: boolean;
  root: string;
  days: number;
  caches: boolean;
  candidates: readonly Candidate[];
  skipped: ReportPayload['skipped'];
  removed: string[];
  errors: ReportPayload['errors'];
  warnings: string[];
  totalGb: number;
}): ReportPayload {
  const totalBytes = input.candidates.reduce((sum, candidate) => sum + candidate.bytes, 0);
  return {
    ok: input.ok,
    dryRun: input.dryRun,
    declined: input.declined,
    root: input.root,
    days: input.days,
    caches: input.caches,
    count: input.candidates.length,
    totalBytes,
    totalGb: input.totalGb,
    candidates: input.candidates.map((candidate) => ({
      path: candidate.path,
      name: candidate.name,
      kind: candidate.kind,
      bytes: candidate.bytes,
      size: formatBytes(candidate.bytes),
      mtimeMs: candidate.mtimeMs,
      ageDays: candidate.ageDays,
    })),
    skipped: input.skipped,
    removed: input.removed,
    errors: input.errors,
    warnings: input.warnings,
  };
}
