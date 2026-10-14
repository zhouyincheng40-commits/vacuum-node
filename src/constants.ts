/** Directory names this tool is allowed to delete. */
export const NODE_MODULES_DIR = 'node_modules';

export const CACHE_DIR_NAMES = ['.next', '.turbo', 'dist'] as const;

export type CacheDirName = (typeof CACHE_DIR_NAMES)[number];

export const DELETABLE_NAMES: ReadonlySet<string> = new Set<string>([
  NODE_MODULES_DIR,
  ...CACHE_DIR_NAMES,
]);

export const DEFAULT_DAYS = 30;

export const EXIT = {
  ok: 0,
  usage: 1,
  deleteFailed: 2,
  interrupted: 130,
} as const;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
