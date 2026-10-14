import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Apparent size of a directory tree.
 * Symbolic links contribute only the link itself and are never followed,
 * so a link to a large tree outside the candidate is not counted.
 */
export async function directorySize(root: string): Promise<number> {
  let total = 0;
  const stack: string[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;

    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      let stat;
      try {
        stat = await fs.lstat(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        total += stat.size;
        continue;
      }
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (stat.isFile()) {
        total += stat.size;
      }
    }
  }

  return total;
}
