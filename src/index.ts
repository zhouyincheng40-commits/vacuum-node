export { parseArgs, wantsJson } from './args';
export { isAffirmative, shouldPrompt } from './confirm';
export {
  CACHE_DIR_NAMES,
  DEFAULT_DAYS,
  DELETABLE_NAMES,
  EXIT,
  MS_PER_DAY,
  NODE_MODULES_DIR,
} from './constants';
export { formatAge, formatBytes, formatGb, bytesToGb } from './format';
export { removeCandidates } from './remove';
export { buildPayload, displayPath, renderDeleted, renderPreview } from './report';
export { helpText, readPackageVersion, run } from './run';
export { SafetyError, UsageError, assertSafeScanRoot, assertSafeToDelete, isSameOrInside, isStrictlyInside, isSystemPath } from './safety';
export { scan } from './scan';
export { directorySize } from './size';
export { ageInDays, isStale } from './staleness';
export type {
  Candidate,
  CandidateKind,
  CliArgs,
  DeleteError,
  DeleteResult,
  ReportPayload,
  ScanResult,
  SkippedEntry,
} from './types';
