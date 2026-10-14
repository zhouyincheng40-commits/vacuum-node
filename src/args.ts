import { DEFAULT_DAYS } from './constants';
import type { CliArgs } from './types';

export interface ParseSuccess {
  ok: true;
  args: CliArgs;
}

export interface ParseFailure {
  ok: false;
  error: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

function parseDays(value: string): { ok: true; days: number } | { ok: false; error: string } {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return { ok: false, error: `invalid --days value: ${value}` };
  }
  const days = Number(value);
  if (!Number.isFinite(days) || days < 0) {
    return { ok: false, error: `invalid --days value: ${value}` };
  }
  return { ok: true, days };
}

/**
 * Parse CLI arguments. The default path is `cwd` (the process working directory),
 * never the user's home directory.
 */
export function parseArgs(argv: readonly string[], cwd: string): ParseResult {
  const args: CliArgs = {
    path: cwd,
    days: DEFAULT_DAYS,
    caches: false,
    yes: false,
    json: false,
    help: false,
    version: false,
  };

  const tokens = [...argv];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';

    if (token === '--') {
      const extra = tokens[i + 1];
      if (extra !== undefined) {
        return { ok: false, error: `unexpected argument: ${extra}` };
      }
      break;
    }

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--version' || token === '-v') {
      args.version = true;
      continue;
    }
    if (token === '--caches' || token === '-c') {
      args.caches = true;
      continue;
    }
    if (token === '--yes' || token === '-y') {
      args.yes = true;
      continue;
    }
    if (token === '--json') {
      args.json = true;
      continue;
    }

    const equals = /^(-{1,2}[^=]+)=(.*)$/.exec(token);
    if (equals) {
      const key = equals[1] ?? '';
      const value = equals[2] ?? '';
      const applied = applyValue(args, key, value);
      if (applied) return { ok: false, error: applied };
      continue;
    }

    if (token === '--path' || token === '-p') {
      const value = tokens[i + 1];
      if (value === undefined || value.startsWith('-')) {
        return { ok: false, error: `missing value for ${token}` };
      }
      i += 1;
      args.path = value;
      continue;
    }

    if (token === '--days' || token === '-d') {
      const value = tokens[i + 1];
      if (value === undefined) {
        return { ok: false, error: `missing value for ${token}` };
      }
      i += 1;
      const parsed = parseDays(value);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      args.days = parsed.days;
      continue;
    }

    if (/^-[a-zA-Z]+$/.test(token) && token.length > 2) {
      const chars = token.slice(1);
      if ([...chars].some((ch) => ch === 'p' || ch === 'd')) {
        return { ok: false, error: `cannot cluster a flag that needs a value: ${token}` };
      }
      for (const ch of chars) {
        if (ch === 'y') args.yes = true;
        else if (ch === 'c') args.caches = true;
        else if (ch === 'h') args.help = true;
        else if (ch === 'v') args.version = true;
        else return { ok: false, error: `unknown option: -${ch}` };
      }
      continue;
    }

    if (token.startsWith('-')) {
      return { ok: false, error: `unknown option: ${token}` };
    }
    return { ok: false, error: `unexpected argument: ${token}` };
  }

  return { ok: true, args };
}

function applyValue(args: CliArgs, key: string, value: string): string | null {
  if (key === '--path' || key === '-p') {
    if (value === '') return 'missing value for --path';
    args.path = value;
    return null;
  }
  if (key === '--days' || key === '-d') {
    const parsed = parseDays(value);
    if (!parsed.ok) return parsed.error;
    args.days = parsed.days;
    return null;
  }
  return `unknown option: ${key}`;
}

export function wantsJson(argv: readonly string[]): boolean {
  return argv.some((token) => token === '--json' || token.startsWith('--json='));
}
