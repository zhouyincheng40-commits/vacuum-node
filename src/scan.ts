import fs from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR_NAMES, NODE_MODULES_DIR } from './constants';
import { isStrictlyInside, isSystemPath } from './safety';
import { directorySize } from './size';
import { ageInDays, isStale } from './staleness';
import type { Candidate, ScanResult, SkippedEntry } from './types';

export interface ScanOptions {
  root: string;
  days: number;
  caches: boolean;
  now?: number;
}

function isCacheName(name: string): boolean {
  return (CACHE_DIR_NAMES as readonly string[]).includes(name);
}

function isCandidateName(name: string, caches: boolean): boolean {
  if (name === NODE_MODULES_DIR) return true;
  return caches && isCacheName(name);
}

/**
 * Walk `root` for stale `node_modules` (and, with `caches`, `.next`, `.turbo`, `dist`).
 * Directory symlinks are never followed. The scan root itself is never a candidate.
 */
export async function scan(options: ScanOptions): Promise<ScanResult> {
  const now = options.now ?? Date.now();
  const root = await fs.realpath(options.root);
  const candidates: Candidate[] = [];
  const skipped: SkippedEntry[] = [];
  const warnings: string[] = [];

  async function visit(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      warnings.push(`unreadable: ${dir}`);
      return;
    }

    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      const wanted = isCandidateName(entry.name, options.caches);

      if (entry.isSymbolicLink()) {
        if (wanted) {
          skipped.push({ path: full, reason: 'symlink' });
        }
        continue;
      }

      if (!entry.isDirectory()) continue;

      if (wanted) {
        await consider(full, entry.name);
        continue;
      }

      await visit(full);
    }
  }

  async function consider(full: string, name: string): Promise<void> {
    let listed;
    try {
      listed = await fs.lstat(full);
    } catch {
      warnings.push(`unreadable: ${full}`);
      return;
    }
    if (listed.isSymbolicLink() || !listed.isDirectory()) {
      if (listed.isSymbolicLink()) skipped.push({ path: full, reason: 'symlink' });
      return;
    }

    let real: string;
    try {
      real = await fs.realpath(full);
    } catch {
      warnings.push(`unreadable: ${full}`);
      return;
    }

    if (isSystemPath(real) || !isStrictlyInside(root, real)) {
      skipped.push({
        path: full,
        reason: isSystemPath(real) ? 'system-path' : 'outside-root',
      });
      return;
    }

    if (!isStale(listed.mtimeMs, options.days, now)) return;

    const bytes = await directorySize(real);
    const ageDays = Math.round(ageInDays(listed.mtimeMs, now) * 100) / 100;
    candidates.push({
      path: real,
      name,
      kind: name === NODE_MODULES_DIR ? 'node_modules' : 'cache',
      bytes,
      mtimeMs: listed.mtimeMs,
      ageDays,
    });
  }

  await visit(root);
  candidates.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  return { root, candidates, skipped, warnings };
}
