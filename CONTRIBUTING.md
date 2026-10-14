# Contributing

Thanks for helping vacuum-node stay small and safe.

1. Open an issue or a pull request with a clear description of the change.
2. Install dependencies and run the tests:

```bash
npm install
npm test
```

3. Keep the runtime dependency-free. TypeScript and `@types/node` stay in `devDependencies`.
4. Add or update tests for behavior changes, especially anything that decides what gets deleted.
5. Do not weaken the path checks: deletions must stay inside the scan root, skip symlinks, and refuse system directories.

`npm test` compiles `src/` into `dist/` and runs the Node test runner.
