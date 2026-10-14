const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MS_PER_DAY } = require('../dist/constants');

async function makeTemp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'vacuum-node-'));
}

async function removeTemp(dir) {
  if (!dir) return;
  try {
    await fs.chmod(dir, 0o755).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup. Individual tests restore modes before returning.
  }
}

async function writeFile(file, contents) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
}

async function setMtime(target, mtimeMs) {
  const when = new Date(mtimeMs);
  await fs.utimes(target, when, when);
}

/**
 * Create a project directory that contains a stale or fresh node_modules.
 * `ageDays` is measured backward from `now`.
 */
async function makeProject(root, name, options = {}) {
  const now = options.now ?? Date.now();
  const ageDays = options.ageDays ?? 40;
  const project = path.join(root, name);
  await fs.mkdir(project, { recursive: true });
  await writeFile(path.join(project, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(path.join(project, 'index.js'), 'module.exports = 1;\n');
  const modules = path.join(project, 'node_modules');
  await fs.mkdir(modules);
  await writeFile(path.join(modules, 'left-pad.js'), options.payload ?? 'hi');
  if (options.caches) {
    for (const cacheName of ['.next', '.turbo', 'dist']) {
      const cacheDir = path.join(project, cacheName);
      await fs.mkdir(cacheDir);
      await writeFile(path.join(cacheDir, 'chunk.js'), `/* ${cacheName} */`);
      await setMtime(cacheDir, now - ageDays * MS_PER_DAY);
    }
  }
  await setMtime(modules, now - ageDays * MS_PER_DAY);
  return { project, modules, now };
}

function captureIO(overrides = {}) {
  const stdout = [];
  const stderr = [];
  const io = {
    cwd: overrides.cwd ?? process.cwd(),
    stdout: { write: (chunk) => stdout.push(String(chunk)) },
    stderr: { write: (chunk) => stderr.push(String(chunk)) },
    isTTY: overrides.isTTY ?? false,
    env: overrides.env ?? {},
    now: overrides.now ?? (() => Date.now()),
    readLine: overrides.readLine ?? (async () => {
      throw new Error('prompt was not expected');
    }),
    rm: overrides.rm,
  };
  if (!overrides.rm) delete io.rm;
  return {
    io,
    text: () => stdout.join(''),
    err: () => stderr.join(''),
  };
}

module.exports = {
  MS_PER_DAY,
  captureIO,
  makeProject,
  makeTemp,
  removeTemp,
  setMtime,
  writeFile,
};
