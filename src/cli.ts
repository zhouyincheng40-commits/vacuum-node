#!/usr/bin/env node
import { EXIT } from './constants';
import { run } from './run';

if (require.main === module) {
  process.on('SIGINT', () => {
    process.exit(EXIT.interrupted);
  });
  run(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`error: ${message}\n`);
      process.exit(EXIT.usage);
    });
}
