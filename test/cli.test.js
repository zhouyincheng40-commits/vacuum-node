const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { EXIT } = require('../dist/constants');
const { run } = require('../dist/run');
const { captureIO, makeProject, makeTemp, removeTemp, setMtime, writeFile, MS_PER_DAY } = require('./helpers');

const CLI = path.join(__dirname, '..', 'dist', 'cli.js');
const NOW = Date.UTC(2026, 3, 2);

function interrupted() {
  const error = new Error('interrupted');
  error.name = 'Interrupted';
  return error;
}

describe('run', () => {
  it('prints help and version without touching the filesystem path', async () => {
    const help = captureIO();
    assert.equal(await run(['--help', '--path', '/'], help.io), EXIT.ok);
    assert.match(help.text(), /vacuum-node/);
    assert.match(help.text(), /--path/);
    assert.match(help.text(), /--days/);
    assert.match(help.text(), /--caches/);
    assert.match(help.text(), /--yes/);
    assert.match(help.text(), /--json/);
    assert.match(help.text(), /current directory/);

    const version = captureIO();
    const pkg = require('../package.json');
    assert.equal(await run(['--version'], version.io), EXIT.ok);
    assert.equal(version.text().trim(), pkg.version);
  });

  it('returns usage errors for bad flags, as JSON when requested', async () => {
    const human = captureIO();
    assert.equal(await run(['--force'], human.io), EXIT.usage);
    assert.match(human.err(), /unknown option/);

    const json = captureIO();
    assert.equal(await run(['--json', '--days', 'nope'], json.io), EXIT.usage);
    const payload = JSON.parse(json.text());
    assert.equal(payload.ok, false);
    assert.match(payload.error, /invalid --days/);
  });

  it('refuses a system scan root', async () => {
    const captured = captureIO();
    assert.equal(await run(['--path', '/', '--yes'], captured.io), EXIT.usage);
    assert.match(captured.err(), /system path/);

    const json = captureIO();
    assert.equal(await run(['--json', '--path', '/usr'], json.io), EXIT.usage);
    assert.equal(JSON.parse(json.text()).ok, false);
  });

  it('refuses a missing path and a file path', async () => {
    const root = await makeTemp();
    try {
      const missing = captureIO();
      assert.equal(await run(['--path', path.join(root, 'nope')], missing.io), EXIT.usage);
      assert.match(missing.err(), /does not exist/);

      const file = path.join(root, 'file.txt');
      await fsp.writeFile(file, 'x');
      const notDir = captureIO();
      assert.equal(await run(['--path', file], notDir.io), EXIT.usage);
      assert.match(notDir.err(), /not a directory/);
    } finally {
      await removeTemp(root);
    }
  });

  it('previews stale node_modules with sizes and total GB, and does not delete on a non-TTY', async () => {
    const root = await makeTemp();
    try {
      const { modules } = await makeProject(root, 'pkg', { now: NOW, ageDays: 45, payload: 'abcd' });
      const captured = captureIO({ cwd: root, now: () => NOW });
      const code = await run(['--path', root, '--days', '30'], captured.io);
      assert.equal(code, EXIT.ok);
      const text = captured.text();
      assert.match(text, /pkg\/node_modules/);
      assert.match(text, /4 B/);
      assert.match(text, /45d/);
      assert.match(text, /0\.00 GB/);
      assert.match(text, /Dry run/);
      assert.equal(fs.existsSync(modules), true);
    } finally {
      await removeTemp(root);
    }
  });

  it('emits a dry-run JSON report and keeps directories', async () => {
    const root = await makeTemp();
    try {
      const { modules } = await makeProject(root, 'pkg', { now: NOW, ageDays: 45, payload: 'abcd' });
      const captured = captureIO({ cwd: root, isTTY: true, now: () => NOW });
      const code = await run(['--json', '--path', root], captured.io);
      assert.equal(code, EXIT.ok);
      const payload = JSON.parse(captured.text());
      assert.equal(payload.ok, true);
      assert.equal(payload.dryRun, true);
      assert.equal(payload.declined, false);
      assert.equal(payload.days, 30);
      assert.equal(payload.count, 1);
      assert.equal(payload.totalBytes, 4);
      assert.equal(typeof payload.totalGb, 'number');
      assert.equal(payload.candidates[0].path, await fsp.realpath(modules));
      assert.equal(payload.removed.length, 0);
      assert.equal(fs.existsSync(modules), true);
    } finally {
      await removeTemp(root);
    }
  });

  it('deletes after an affirmative prompt and keeps sibling source files', async () => {
    const root = await makeTemp();
    try {
      const { modules, project } = await makeProject(root, 'pkg', { now: NOW, ageDays: 45, payload: 'abcd' });
      const captured = captureIO({
        cwd: root,
        isTTY: true,
        now: () => NOW,
        readLine: async (question) => {
          assert.match(question, /\[y\/N\]/);
          return 'yes';
        },
      });
      const code = await run(['--path', root], captured.io);
      assert.equal(code, EXIT.ok);
      assert.match(captured.text(), /Deleted 1 directory/);
      assert.match(captured.text(), /GB/);
      assert.equal(fs.existsSync(modules), false);
      assert.equal(fs.existsSync(path.join(project, 'index.js')), true);
    } finally {
      await removeTemp(root);
    }
  });

  it('declines the prompt on n, empty, and yeah without deleting', async () => {
    for (const answer of ['n', '', 'yeah', 'NO']) {
      const root = await makeTemp();
      try {
        const { modules } = await makeProject(root, 'pkg', { now: NOW, ageDays: 45 });
        const captured = captureIO({
          cwd: root,
          isTTY: true,
          now: () => NOW,
          readLine: async () => answer,
        });
        const code = await run(['--path', root], captured.io);
        assert.equal(code, EXIT.ok, answer);
        assert.match(captured.text(), /Nothing deleted/);
        assert.equal(fs.existsSync(modules), true);
      } finally {
        await removeTemp(root);
      }
    }
  });

  it('deletes with --yes and -y on a non-TTY', async () => {
    const root = await makeTemp();
    try {
      const first = await makeProject(root, 'one', { now: NOW, ageDays: 60, payload: 'aa' });
      const second = await makeProject(root, 'two', { now: NOW, ageDays: 10, payload: 'bb' });
      const captured = captureIO({ cwd: root, now: () => NOW });
      const code = await run(['-y', '--path', root, '--days', '30'], captured.io);
      assert.equal(code, EXIT.ok);
      assert.equal(fs.existsSync(first.modules), false);
      assert.equal(fs.existsSync(second.modules), true);
      assert.match(captured.text(), /Deleted 1 directory/);
    } finally {
      await removeTemp(root);
    }
  });

  it('includes regenerable caches with --caches and leaves source in place', async () => {
    const root = await makeTemp();
    try {
      const { project } = await makeProject(root, 'web', {
        now: NOW,
        ageDays: 40,
        caches: true,
        payload: 'bundle',
      });
      const captured = captureIO({ cwd: root, now: () => NOW });
      const code = await run(['--yes', '--caches', '--path', root, '--json'], captured.io);
      assert.equal(code, EXIT.ok);
      const payload = JSON.parse(captured.text());
      assert.equal(payload.dryRun, false);
      assert.equal(payload.caches, true);
      assert.equal(payload.removed.length, 4);
      assert.equal(fs.existsSync(path.join(project, 'node_modules')), false);
      assert.equal(fs.existsSync(path.join(project, '.next')), false);
      assert.equal(fs.existsSync(path.join(project, '.turbo')), false);
      assert.equal(fs.existsSync(path.join(project, 'dist')), false);
      assert.equal(fs.existsSync(path.join(project, 'index.js')), true);
    } finally {
      await removeTemp(root);
    }
  });

  it('does not delete a symlinked node_modules or its external target', async () => {
    const root = await makeTemp();
    const outside = await makeTemp();
    try {
      const external = path.join(outside, 'real-modules');
      await fsp.mkdir(external);
      const precious = path.join(external, 'precious.txt');
      await writeFile(precious, 'keep-me');
      await setMtime(external, NOW - 90 * MS_PER_DAY);
      const linkParent = path.join(root, 'app');
      await fsp.mkdir(linkParent);
      await fsp.symlink(external, path.join(linkParent, 'node_modules'));
      const captured = captureIO({ cwd: root, now: () => NOW });
      const code = await run(['--yes', '--json', '--path', root, '--days', '1'], captured.io);
      assert.equal(code, EXIT.ok);
      const payload = JSON.parse(captured.text());
      assert.equal(payload.count, 0);
      assert.equal(payload.skipped[0].reason, 'symlink');
      assert.equal(fs.existsSync(precious), true);
      assert.equal(fs.readFileSync(precious, 'utf8'), 'keep-me');
    } finally {
      await removeTemp(root);
      await removeTemp(outside);
    }
  });

  it('leaves an outside symlink target intact when a real tree is deleted', async () => {
    const root = await makeTemp();
    const outside = await makeTemp();
    try {
      const precious = path.join(outside, 'precious.txt');
      await writeFile(precious, 'still-here');
      const { modules } = await makeProject(root, 'pkg', { now: NOW, ageDays: 40, payload: 'local' });
      await fsp.symlink(precious, path.join(modules, 'linked.txt'));
      await setMtime(modules, NOW - 40 * MS_PER_DAY);
      const captured = captureIO({ cwd: root, now: () => NOW });
      assert.equal(await run(['--yes', '--path', root], captured.io), EXIT.ok);
      assert.equal(fs.existsSync(modules), false);
      assert.equal(fs.readFileSync(precious, 'utf8'), 'still-here');
    } finally {
      await removeTemp(root);
      await removeTemp(outside);
    }
  });

  it('returns 2 when a deletion fails and still removes the others', async () => {
    const root = await makeTemp();
    try {
      const large = await makeProject(root, 'large', { now: NOW, ageDays: 40, payload: 'xxxxxx' });
      const small = await makeProject(root, 'small', { now: NOW, ageDays: 40, payload: 'x' });
      const captured = captureIO({
        cwd: root,
        now: () => NOW,
        rm: async (target) => {
          if (target === small.modules) throw new Error('disk busy');
          await fsp.rm(target, { recursive: true, force: false });
        },
      });
      const code = await run(['--yes', '--json', '--path', root], captured.io);
      assert.equal(code, EXIT.deleteFailed);
      const payload = JSON.parse(captured.text());
      assert.equal(payload.ok, false);
      assert.equal(payload.removed.length, 1);
      assert.equal(payload.errors.length, 1);
      assert.match(payload.errors[0].message, /disk busy/);
      assert.equal(fs.existsSync(large.modules), false);
      assert.equal(fs.existsSync(small.modules), true);
    } finally {
      await removeTemp(root);
    }
  });

  it('returns 130 when the prompt is interrupted', async () => {
    const root = await makeTemp();
    try {
      const { modules } = await makeProject(root, 'pkg', { now: NOW, ageDays: 40 });
      const captured = captureIO({
        cwd: root,
        isTTY: true,
        now: () => NOW,
        readLine: async () => {
          throw interrupted();
        },
      });
      assert.equal(await run(['--path', root], captured.io), EXIT.interrupted);
      assert.equal(fs.existsSync(modules), true);
    } finally {
      await removeTemp(root);
    }
  });

  it('reports an empty tree without deleting anything', async () => {
    const root = await makeTemp();
    try {
      const captured = captureIO({ cwd: root, now: () => NOW });
      assert.equal(await run(['--yes', '--path', root], captured.io), EXIT.ok);
      assert.match(captured.text(), /No stale directories found/);
    } finally {
      await removeTemp(root);
    }
  });

  it('does not prompt just because stdout is a TTY when --json or --yes is set', async () => {
    const root = await makeTemp();
    try {
      await makeProject(root, 'pkg', { now: NOW, ageDays: 40 });
      let prompted = false;
      const captured = captureIO({
        cwd: root,
        isTTY: true,
        now: () => NOW,
        readLine: async () => {
          prompted = true;
          return 'y';
        },
      });
      assert.equal(await run(['--json', '--path', root], captured.io), EXIT.ok);
      assert.equal(prompted, false);
      assert.equal(fs.existsSync(path.join(root, 'pkg', 'node_modules')), true);
    } finally {
      await removeTemp(root);
    }
  });
});

describe('cli bin', () => {
  it('responds to --help from dist/cli.js', () => {
    const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /vacuum-node/);
    assert.match(result.stdout, /--days/);
    assert.equal(result.stdout.startsWith('vacuum-node'), true);
  });

  it('starts with a node shebang and is executable', () => {
    const text = fs.readFileSync(CLI, 'utf8');
    assert.equal(text.startsWith('#!/usr/bin/env node\n'), true);
    assert.ok(fs.statSync(CLI).mode & 0o111);
  });

  it('exits 130 when SIGINT arrives while the prompt is open', () => {
    const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'vacuum-node-sig-'));
    const modules = path.join(root, 'pkg', 'node_modules');
    fs.mkdirSync(modules, { recursive: true });
    fs.writeFileSync(path.join(modules, 'a.js'), 'abc');
    const old = new Date(Date.now() - 40 * MS_PER_DAY);
    fs.utimesSync(modules, old, old);

    const script = `
import os, pty, select, signal, sys, time
node, cli, root = sys.argv[1:]
pid, fd = pty.fork()
if pid == 0:
    os.execv(node, [node, cli, "--path", root, "--days", "30"])
else:
    data = b""
    deadline = time.time() + 8
    while time.time() < deadline and b"[y/N]" not in data:
        ready, _, _ = select.select([fd], [], [], 0.2)
        if ready:
            try:
                data += os.read(fd, 4096)
            except OSError:
                break
    if b"[y/N]" not in data:
        os.kill(pid, signal.SIGKILL)
        sys.stderr.write(data.decode("utf8", "replace"))
        sys.exit(91)
    os.kill(pid, signal.SIGINT)
    _, status = os.waitpid(pid, 0)
    if os.WIFEXITED(status):
        sys.exit(os.WEXITSTATUS(status))
    if os.WIFSIGNALED(status) and os.WTERMSIG(status) == signal.SIGINT:
        sys.exit(130)
    sys.exit(92)
`;
    const result = spawnSync('python3', ['-c', script, process.execPath, CLI, root], { encoding: 'utf8' });
    fs.rmSync(root, { recursive: true, force: true });
    assert.equal(result.status, 130, result.stderr || result.stdout);
  });
});
