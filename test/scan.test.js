const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { scan } = require('../dist/scan');
const { directorySize } = require('../dist/size');
const { MS_PER_DAY, makeProject, makeTemp, removeTemp, setMtime, writeFile } = require('./helpers');

const NOW = Date.UTC(2026, 0, 15);

describe('scan', () => {
  it('finds a stale node_modules directory and reports its size', async () => {
    const root = await makeTemp();
    try {
      const { modules } = await makeProject(root, 'pkg', { now: NOW, ageDays: 40, payload: 'abcd' });
      const result = await scan({ root, days: 30, caches: false, now: NOW });
      assert.equal(result.candidates.length, 1);
      assert.equal(result.candidates[0].path, await fs.realpath(modules));
      assert.equal(result.candidates[0].kind, 'node_modules');
      assert.equal(result.candidates[0].bytes, 4);
      assert.equal(result.candidates[0].ageDays, 40);
    } finally {
      await removeTemp(root);
    }
  });

  it('ignores a fresh node_modules directory', async () => {
    const root = await makeTemp();
    try {
      await makeProject(root, 'pkg', { now: NOW, ageDays: 2 });
      const result = await scan({ root, days: 30, caches: false, now: NOW });
      assert.deepEqual(result.candidates, []);
    } finally {
      await removeTemp(root);
    }
  });

  it('includes a directory that is exactly --days old', async () => {
    const root = await makeTemp();
    try {
      await makeProject(root, 'pkg', { now: NOW, ageDays: 30 });
      const result = await scan({ root, days: 30, caches: false, now: NOW });
      assert.equal(result.candidates.length, 1);
      assert.equal(result.candidates[0].ageDays, 30);
    } finally {
      await removeTemp(root);
    }
  });

  it('does not list nested node_modules inside an outer node_modules', async () => {
    const root = await makeTemp();
    try {
      const { modules } = await makeProject(root, 'pkg', { now: NOW, ageDays: 50, payload: '' });
      const nested = path.join(modules, 'pkg', 'node_modules');
      await fs.mkdir(nested, { recursive: true });
      await writeFile(path.join(nested, 'inner.js'), 'zzzz');
      await setMtime(nested, NOW - 90 * MS_PER_DAY);
      await setMtime(modules, NOW - 50 * MS_PER_DAY);
      const result = await scan({ root, days: 30, caches: false, now: NOW });
      assert.equal(result.candidates.length, 1);
      assert.equal(result.candidates[0].bytes, 4);
    } finally {
      await removeTemp(root);
    }
  });

  it('finds .next, .turbo, and dist only when caches are requested', async () => {
    const root = await makeTemp();
    try {
      await makeProject(root, 'web', { now: NOW, ageDays: 40, caches: true, payload: 'x' });
      const plain = await scan({ root, days: 30, caches: false, now: NOW });
      assert.deepEqual(plain.candidates.map((c) => c.name), ['node_modules']);
      const withCaches = await scan({ root, days: 30, caches: true, now: NOW });
      assert.deepEqual(
        withCaches.candidates.map((c) => c.name).sort(),
        ['.next', '.turbo', 'dist', 'node_modules'],
      );
      assert.ok(withCaches.candidates.every((c) => c.name === 'node_modules' || c.kind === 'cache'));
    } finally {
      await removeTemp(root);
    }
  });

  it('sorts candidates by size, largest first', async () => {
    const root = await makeTemp();
    try {
      await makeProject(root, 'small', { now: NOW, ageDays: 40, payload: 'a' });
      await makeProject(root, 'large', { now: NOW, ageDays: 40, payload: 'abcdef' });
      const result = await scan({ root, days: 30, caches: false, now: NOW });
      assert.deepEqual(result.candidates.map((c) => path.basename(path.dirname(c.path))), ['large', 'small']);
    } finally {
      await removeTemp(root);
    }
  });

  it('skips a symlinked node_modules and does not follow it', async () => {
    const root = await makeTemp();
    const outside = await makeTemp();
    try {
      const external = path.join(outside, 'node_modules');
      await fs.mkdir(external);
      await writeFile(path.join(external, 'precious.txt'), Buffer.alloc(20_000, 'p'));
      await setMtime(external, NOW - 80 * MS_PER_DAY);
      const link = path.join(root, 'app', 'node_modules');
      await fs.mkdir(path.dirname(link), { recursive: true });
      await fs.symlink(external, link);
      const result = await scan({ root, days: 30, caches: false, now: NOW });
      assert.equal(result.candidates.length, 0);
      assert.equal(result.skipped.length, 1);
      assert.equal(result.skipped[0].reason, 'symlink');
      assert.equal(await fs.readFile(path.join(external, 'precious.txt'), 'utf8'), 'p'.repeat(20_000));
    } finally {
      await removeTemp(root);
      await removeTemp(outside);
    }
  });

  it('does not walk a symlinked directory to discover outside candidates', async () => {
    const root = await makeTemp();
    const outside = await makeTemp();
    try {
      await makeProject(outside, 'hidden', { now: NOW, ageDays: 100 });
      await fs.symlink(outside, path.join(root, 'linked'));
      const result = await scan({ root, days: 1, caches: false, now: NOW });
      assert.equal(result.candidates.length, 0);
    } finally {
      await removeTemp(root);
      await removeTemp(outside);
    }
  });

  it('does not count the target of a symlink inside node_modules toward the size', async () => {
    const root = await makeTemp();
    const outside = await makeTemp();
    try {
      const blob = path.join(outside, 'blob.bin');
      await writeFile(blob, Buffer.alloc(40_000, 1));
      const { modules } = await makeProject(root, 'pkg', { now: NOW, ageDays: 40, payload: 'abc' });
      await fs.symlink(blob, path.join(modules, 'blob'));
      await setMtime(modules, NOW - 40 * MS_PER_DAY);
      const result = await scan({ root, days: 30, caches: false, now: NOW });
      assert.equal(result.candidates.length, 1);
      assert.ok(result.candidates[0].bytes < 1000);
      const measured = await directorySize(modules);
      assert.equal(measured, result.candidates[0].bytes);
    } finally {
      await removeTemp(root);
      await removeTemp(outside);
    }
  });

  it('ignores a file named node_modules or dist', async () => {
    const root = await makeTemp();
    try {
      await writeFile(path.join(root, 'node_modules'), 'not a directory');
      await writeFile(path.join(root, 'dist'), 'not a directory');
      const result = await scan({ root, days: 0, caches: true, now: NOW });
      assert.equal(result.candidates.length, 0);
    } finally {
      await removeTemp(root);
    }
  });

  it('does not treat the scan root itself as a candidate', async () => {
    const parent = await makeTemp();
    try {
      const root = path.join(parent, 'node_modules');
      await fs.mkdir(root);
      await writeFile(path.join(root, 'index.js'), 'x');
      await setMtime(root, NOW - 100 * MS_PER_DAY);
      const result = await scan({ root, days: 30, caches: false, now: NOW });
      assert.equal(result.candidates.length, 0);
    } finally {
      await removeTemp(parent);
    }
  });

  it('records a warning for an unreadable directory and continues', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      return;
    }
    const root = await makeTemp();
    const locked = path.join(root, 'locked');
    try {
      await fs.mkdir(path.join(locked, 'node_modules'), { recursive: true });
      await fs.chmod(locked, 0);
      const result = await scan({ root, days: 0, caches: false, now: Date.now() });
      assert.ok(result.warnings.some((warning) => warning.includes('unreadable')));
      assert.equal(result.candidates.length, 0);
    } finally {
      await fs.chmod(locked, 0o755).catch(() => {});
      await removeTemp(root);
    }
  });
});

describe('directorySize', () => {
  it('sums file bytes and skips symlink targets', async () => {
    const root = await makeTemp();
    const outside = await makeTemp();
    try {
      await writeFile(path.join(root, 'a.txt'), '12345');
      await writeFile(path.join(root, 'sub', 'b.txt'), 'xy');
      await writeFile(path.join(outside, 'big.txt'), Buffer.alloc(10_000, 'z'));
      await fs.symlink(path.join(outside, 'big.txt'), path.join(root, 'sub', 'link'));
      const size = await directorySize(root);
      assert.ok(size >= 7);
      assert.ok(size < 1000);
    } finally {
      await removeTemp(root);
      await removeTemp(outside);
    }
  });

  it('returns 0 for an empty directory', async () => {
    const root = await makeTemp();
    try {
      assert.equal(await directorySize(root), 0);
    } finally {
      await removeTemp(root);
    }
  });
});
