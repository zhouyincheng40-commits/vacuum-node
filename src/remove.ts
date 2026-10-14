import { assertSafeToDelete } from './safety';
import type { Candidate, DeleteResult } from './types';

/**
 * Delete candidates one by one. Each path is re-checked with realpath
 * immediately before removal. One failure does not stop the rest.
 */
export async function removeCandidates(
  scanRoot: string,
  candidates: readonly Candidate[],
  rm: (target: string) => Promise<void>,
): Promise<DeleteResult> {
  const removed: string[] = [];
  const errors: DeleteResult['errors'] = [];

  for (const candidate of candidates) {
    try {
      await assertSafeToDelete(scanRoot, candidate.path);
      await rm(candidate.path);
      removed.push(candidate.path);
    } catch (err) {
      errors.push({
        path: candidate.path,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { removed, errors };
}
