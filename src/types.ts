export type CandidateKind = 'node_modules' | 'cache';

export interface Candidate {
  path: string;
  name: string;
  kind: CandidateKind;
  bytes: number;
  mtimeMs: number;
  ageDays: number;
}

export interface SkippedEntry {
  path: string;
  reason: 'symlink' | 'outside-root' | 'system-path' | 'unexpected-name';
}

export interface ScanResult {
  root: string;
  candidates: Candidate[];
  skipped: SkippedEntry[];
  warnings: string[];
}

export interface DeleteError {
  path: string;
  message: string;
}

export interface DeleteResult {
  removed: string[];
  errors: DeleteError[];
}

export interface CliArgs {
  path: string;
  days: number;
  caches: boolean;
  yes: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}

export interface ReportPayload {
  ok: boolean;
  dryRun: boolean;
  declined: boolean;
  root: string;
  days: number;
  caches: boolean;
  count: number;
  totalBytes: number;
  totalGb: number;
  candidates: Array<{
    path: string;
    name: string;
    kind: CandidateKind;
    bytes: number;
    size: string;
    mtimeMs: number;
    ageDays: number;
  }>;
  skipped: SkippedEntry[];
  removed: string[];
  errors: DeleteError[];
  warnings: string[];
}
