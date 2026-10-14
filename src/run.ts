import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { parseArgs, wantsJson } from './args';
import { EXIT } from './constants';
import { isAffirmative, shouldPrompt } from './confirm';
import { bytesToGb } from './format';
import { removeCandidates } from './remove';
import { buildPayload, candidateBytes, renderDeleted, renderPreview } from './report';
import { assertSafeScanRoot } from './safety';
import { scan } from './scan';
import type { Candidate, ReportPayload } from './types';

export interface TextStream {
  write(chunk: string): void;
}

export interface RunIO {
  cwd: string;
  stdout: TextStream;
  stderr: TextStream;
  isTTY: boolean;
  env: NodeJS.ProcessEnv;
  now: () => number;
  readLine: (question: string) => Promise<string>;
  rm: (target: string) => Promise<void>;
}

export function readPackageVersion(): string {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fsSync.readFileSync(pkgPath, 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}

export function helpText(): string {
  return `vacuum-node — reclaim disk from stale node_modules

Usage:
  vacuum-node [options]

Options:
  -p, --path <dir>   Directory to scan (default: current directory)
  -d, --days <n>     Minimum age in days, based on directory mtime (default: 30)
  -c, --caches       Also include regenerable .next, .turbo, and dist directories
  -y, --yes          Delete without prompting
      --json         Print machine-readable JSON (dry-run unless --yes)
  -h, --help         Show this help
  -v, --version      Show version

Stale means the directory's own mtime is at least --days old.
The default is a dry run. Deletion happens after you answer y or yes,
or when you pass --yes. Non-interactive shells and --json never delete
unless --yes is set.

Nothing outside the scan root is deleted. System directories are refused.
Symbolic links are not followed, and a symlinked candidate is skipped.

Exit codes:
  0    Success, including a declined prompt or an empty result
  1    Usage error or safety refusal
  2    One or more deletions failed
  130  Interrupted
`;
}

export function defaultReadLine(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY),
    });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      rl.close();
      fn();
    };
    rl.on('SIGINT', () => {
      finish(() => {
        const error = new Error('interrupted');
        error.name = 'Interrupted';
        reject(error);
      });
    });
    rl.question(question, (answer) => {
      finish(() => resolve(answer));
    });
  });
}

export function defaultIO(): RunIO {
  return {
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    env: process.env,
    now: () => Date.now(),
    readLine: defaultReadLine,
    rm: (target: string) => fs.rm(target, { recursive: true, force: false }),
  };
}

function writeLine(stream: TextStream, text = ''): void {
  stream.write(text.endsWith('\n') ? text : `${text}\n`);
}

function useColor(io: RunIO, json: boolean): boolean {
  if (json) return false;
  if (!io.isTTY) return false;
  if (io.env.NO_COLOR !== undefined && io.env.NO_COLOR !== '') return false;
  return true;
}

function printJson(io: RunIO, payload: ReportPayload | { ok: false; error: string }): void {
  writeLine(io.stdout, JSON.stringify(payload, null, 2));
}

/**
 * Run the CLI and return a process exit code. Streams and the clock are
 * injectable so tests never touch a real TTY or the system clock.
 */
export async function run(argv: readonly string[], partial: Partial<RunIO> = {}): Promise<number> {
  const io: RunIO = { ...defaultIO(), ...partial };
  const parsed = parseArgs(argv, io.cwd);
  if (!parsed.ok) {
    if (wantsJson(argv)) printJson(io, { ok: false, error: parsed.error });
    else writeLine(io.stderr, `error: ${parsed.error}`);
    return EXIT.usage;
  }

  const args = parsed.args;
  if (args.help) {
    io.stdout.write(helpText());
    return EXIT.ok;
  }
  if (args.version) {
    writeLine(io.stdout, readPackageVersion());
    return EXIT.ok;
  }

  let root: string;
  try {
    root = await assertSafeScanRoot(args.path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (args.json) {
      printJson(io, { ok: false, error: message });
    } else {
      writeLine(io.stderr, `error: ${message}`);
    }
    return EXIT.usage;
  }

  const scanned = await scan({
    root,
    days: args.days,
    caches: args.caches,
    now: io.now(),
  });

  const color = useColor(io, args.json);
  const interactive = shouldPrompt({ yes: args.yes, json: args.json, isTTY: io.isTTY });
  let declined = false;
  let attempted = false;
  let removed: string[] = [];
  let errors: ReportPayload['errors'] = [];

  const dryRunNote = args.yes
    ? null
    : interactive
      ? null
      : args.json
        ? null
        : io.isTTY
          ? 'Dry run. Nothing was deleted. Re-run with --yes to delete.'
          : 'Dry run. Nothing was deleted. Pass --yes to delete without a prompt.';

  if (!args.json) {
    io.stdout.write(
      renderPreview({
        root: scanned.root,
        cwd: io.cwd,
        days: args.days,
        caches: args.caches,
        candidates: scanned.candidates,
        color,
        dryRunNote: scanned.candidates.length === 0 ? null : dryRunNote,
      }),
    );
    for (const warning of scanned.warnings) {
      writeLine(io.stderr, `warning: ${warning}`);
    }
  }

  if (scanned.candidates.length === 0) {
    const payload = payloadFor({
      argsDays: args.days,
      caches: args.caches,
      scannedRoot: scanned.root,
      candidates: scanned.candidates,
      skipped: scanned.skipped,
      warnings: scanned.warnings,
      dryRun: !args.yes,
      declined: false,
      removed: [],
      errors: [],
      ok: true,
    });
    if (args.json) printJson(io, payload);
    return EXIT.ok;
  }

  if (args.yes) {
    attempted = true;
  } else if (interactive) {
    let answer: string;
    try {
      answer = await io.readLine(
        scanned.candidates.length === 1
          ? 'Delete this directory? [y/N] '
          : `Delete these ${scanned.candidates.length} directories? [y/N] `,
      );
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'Interrupted') return EXIT.interrupted;
      throw err;
    }
    if (!isAffirmative(answer)) {
      declined = true;
      if (!args.json) writeLine(io.stdout, 'Nothing deleted.');
    } else {
      attempted = true;
    }
  }

  if (attempted) {
    const result = await removeCandidates(scanned.root, scanned.candidates, io.rm);
    removed = result.removed;
    errors = result.errors;
    if (!args.json) {
      if (removed.length > 0) {
        io.stdout.write(
          renderDeleted(removed.length, candidateBytes(scanned.candidates, removed), color),
        );
      }
      for (const failure of errors) {
        writeLine(io.stderr, `error: failed to delete ${failure.path}: ${failure.message}`);
      }
    }
  }

  const ok = errors.length === 0;
  const payload = payloadFor({
    argsDays: args.days,
    caches: args.caches,
    scannedRoot: scanned.root,
    candidates: scanned.candidates,
    skipped: scanned.skipped,
    warnings: scanned.warnings,
    dryRun: !attempted,
    declined,
    removed,
    errors,
    ok,
  });
  if (args.json) printJson(io, payload);
  if (errors.length > 0) return EXIT.deleteFailed;
  return EXIT.ok;
}

function payloadFor(input: {
  argsDays: number;
  caches: boolean;
  scannedRoot: string;
  candidates: Candidate[];
  skipped: ReportPayload['skipped'];
  warnings: string[];
  dryRun: boolean;
  declined: boolean;
  removed: string[];
  errors: ReportPayload['errors'];
  ok: boolean;
}): ReportPayload {
  const totalBytes = input.candidates.reduce((sum, candidate) => sum + candidate.bytes, 0);
  return buildPayload({
    ok: input.ok,
    dryRun: input.dryRun,
    declined: input.declined,
    root: input.scannedRoot,
    days: input.argsDays,
    caches: input.caches,
    candidates: input.candidates,
    skipped: input.skipped,
    removed: input.removed,
    errors: input.errors,
    warnings: input.warnings,
    totalGb: bytesToGb(totalBytes),
  });
}
