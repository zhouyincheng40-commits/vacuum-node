/**
 * Interactive confirmation accepts only `y` and `yes` (any case, surrounding space ignored).
 */
export function isAffirmative(input: string): boolean {
  if (typeof input !== 'string') return false;
  const answer = input.trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

/**
 * Prompt only on an interactive terminal. `--json` and non-TTY stay dry-run
 * unless the caller already passed `--yes` (in which case there is nothing to ask).
 */
export function shouldPrompt(options: { yes: boolean; json: boolean; isTTY: boolean }): boolean {
  if (options.yes || options.json) return false;
  return options.isTTY;
}
