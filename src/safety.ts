import fs from 'node:fs/promises';
import path from 'node:path';
import { DELETABLE_NAMES } from './constants';

export class SafetyError extends Error {
  readonly code = 'SAFETY';

  constructor(message: string) {
    super(message);
    this.name = 'SafetyError';
  }
}

export class UsageError extends Error {
  readonly code = 'USAGE';

  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * Trees we refuse to scan or delete. Matched on path-segment boundaries,
 * so `/usr` does not also refuse `/usr-local` or `/user`.
 */
const POSIX_BLOCKED_TREES = [
  '/bin',
  '/sbin',
  '/lib',
  '/lib32',
  '/lib64',
  '/boot',
  '/etc',
  '/sys',
  '/proc',
  '/dev',
  '/run',
  '/usr/bin',
  '/usr/sbin',
  '/usr/lib',
  '/usr/lib32',
  '/usr/lib64',
  '/usr/libexec',
  '/usr/share',
  '/usr/include',
  '/System',
  '/Library',
  '/Applications',
  '/private/etc',
  '/private/var',
  '/var/log',
  '/var/run',
  '/var/lock',
  '/lost+found',
];

/** Exact paths only. Children such as `/usr/local/src/app` stay allowed. */
const POSIX_BLOCKED_EXACT = ['/usr', '/var', '/opt', '/private', '/snap'];

const WIN_BLOCKED_TREES = [
  '/windows',
  '/program files',
  '/program files (x86)',
  '/programdata',
];

function collapseSlashes(input: string): string {
  return input.replace(/\/{2,}/g, '/');
}

function normalizePosix(input: string): string {
  const normalized = path.posix.normalize(collapseSlashes(input));
  if (normalized.length > 1 && normalized.endsWith('/')) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function pathApi(input: string): path.PlatformPath {
  if (/^[a-zA-Z]:[\\/]/.test(input) || input.includes('\\')) return path.win32;
  return path.posix;
}

/** True when `child` is `parent` or a descendant, using segment boundaries. */
export function isSameOrInside(parent: string, child: string): boolean {
  const api = pathApi(parent);
  const rel = api.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !api.isAbsolute(rel));
}

/** True when `child` is a descendant of `parent` and not `parent` itself. */
export function isStrictlyInside(parent: string, child: string): boolean {
  const api = pathApi(parent);
  const rel = api.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !api.isAbsolute(rel);
}

function isWindowsPath(input: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(input) || input.startsWith('\\\\');
}

function isWindowsSystemPath(input: string): boolean {
  if (input.startsWith('\\\\')) return true;
  const slash = input.replace(/\\/g, '/');
  const match = /^([a-zA-Z]:)(\/.*)?$/.exec(slash);
  if (!match) return false;
  const rest = (match[2] ?? '/').toLowerCase();
  const normalized = normalizePosix(rest);
  if (normalized === '/') return true;
  return WIN_BLOCKED_TREES.some((prefix) => isSameOrInside(prefix, normalized));
}

function isPosixSystemPath(input: string): boolean {
  const normalized = normalizePosix(input);
  if (normalized === '/') return true;
  if (POSIX_BLOCKED_EXACT.includes(normalized)) return true;
  return POSIX_BLOCKED_TREES.some((prefix) => isSameOrInside(prefix, normalized));
}

/**
 * Refuse filesystem roots and OS directories.
 * Relative paths are not treated as system paths; callers realpath first.
 */
export function isSystemPath(input: string): boolean {
  if (typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.includes('\0')) return true;
  if (isWindowsPath(trimmed)) return isWindowsSystemPath(trimmed);
  if (!trimmed.startsWith('/')) return false;
  return isPosixSystemPath(trimmed);
}

/**
 * Resolve a scan root to a real directory, or throw if it is missing,
 * not a directory, or a system path. The returned path is the realpath.
 */
export async function assertSafeScanRoot(input: string): Promise<string> {
  if (typeof input !== 'string' || input.trim() === '' || input.includes('\0')) {
    throw new UsageError('path must be a non-empty directory');
  }
  const lexical = path.resolve(input);
  if (isSystemPath(lexical)) {
    throw new SafetyError(`refusing to scan system path: ${lexical}`);
  }

  let real: string;
  try {
    real = await fs.realpath(input);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new UsageError(`path does not exist: ${input}`);
    }
    throw new UsageError(`cannot read path: ${input}`);
  }

  if (isSystemPath(real)) {
    throw new SafetyError(`refusing to scan system path: ${real}`);
  }

  const stat = await fs.stat(real);
  if (!stat.isDirectory()) {
    throw new UsageError(`path is not a directory: ${input}`);
  }
  return real;
}

/**
 * Last-line check immediately before a delete.
 * The target must be a real directory, named like a cache we understand,
 * and its realpath must sit strictly inside the scan root.
 */
export async function assertSafeToDelete(scanRoot: string, target: string): Promise<void> {
  if (typeof target !== 'string' || target.trim() === '' || target.includes('\0')) {
    throw new SafetyError('refusing invalid delete path');
  }
  if (typeof scanRoot !== 'string' || scanRoot.trim() === '') {
    throw new SafetyError('refusing invalid scan root');
  }

  const rootReal = await fs.realpath(scanRoot);
  if (isSystemPath(rootReal)) {
    throw new SafetyError(`refusing to delete under system path: ${rootReal}`);
  }

  let listed: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    listed = await fs.lstat(target);
  } catch {
    throw new SafetyError(`refusing missing path: ${target}`);
  }
  if (listed.isSymbolicLink()) {
    throw new SafetyError(`refusing to delete symlink: ${target}`);
  }
  if (!listed.isDirectory()) {
    throw new SafetyError(`refusing to delete non-directory: ${target}`);
  }

  const targetReal = await fs.realpath(target);
  if (isSystemPath(targetReal)) {
    throw new SafetyError(`refusing to delete system path: ${targetReal}`);
  }
  if (!DELETABLE_NAMES.has(path.basename(targetReal))) {
    throw new SafetyError(
      `refusing to delete unexpected directory name: ${path.basename(targetReal)}`,
    );
  }
  if (!isStrictlyInside(rootReal, targetReal)) {
    throw new SafetyError(`refusing to delete path outside scan root: ${targetReal}`);
  }

  const rootResolved = path.resolve(scanRoot);
  const targetResolved = path.resolve(target);
  if (!isStrictlyInside(rootResolved, targetResolved)) {
    throw new SafetyError(`refusing to delete path outside scan root: ${target}`);
  }
}
