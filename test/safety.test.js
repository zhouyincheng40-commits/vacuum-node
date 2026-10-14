const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  assertSafeScanRoot,
  assertSafeToDelete,
  isSameOrInside,
  isStrictlyInside,
  isSystemPath,
  SafetyError,
} = require('../dist/safety');
const { makeTemp, removeTemp } = require('./helpers');

describe('isSystemPath', () => {
  it('refuses the filesystem root', () => {
    assert.equal(isSystemPath('/'), true);
    assert.equal(isSystemPath('//'), true);
    assert.equal(isSystemPath('///'), true);
  });

  it('refuses common Unix system directories', () => {
    for (const dir of ['/bin', '/sbin', '/lib', '/lib64', '/boot', '/etc', '/sys', '/proc', '/dev', '/run', '/usr', '/var', '/opt']) {
      assert.equal(isSystemPath(dir), true, dir);
    }
  });

  it('refuses descendants of blocked system trees', () => {
    assert.equal(isSystemPath('/etc/passwd'), true);
    assert.equal(isSystemPath('/usr/lib/node_modules'), true);
    assert.equal(isSystemPath('/usr/bin/node'), true);
    assert.equal(isSystemPath('/var/log/syslog'), true);
    assert.equal(isSystemPath('/System/Library'), true);
    assert.equal(isSystemPath('/Library/Preferences'), true);
    assert.equal(isSystemPath('/Applications/Utilities'), true);
    assert.equal(isSystemPath('/private/var/db'), true);
  });

  it('does not treat a prefix lookalike as a system path', () => {
    assert.equal(isSystemPath('/usr-local'), false);
    assert.equal(isSystemPath('/user'), false);
    assert.equal(isSystemPath('/opt-in'), false);
    assert.equal(isSystemPath('/variable'), false);
    assert.equal(isSystemPath('/home'), false);
    assert.equal(isSystemPath('/home/dev/projects'), false);
    assert.equal(isSystemPath('/tmp/work'), false);
  });

  it('allows project trees under /usr/local, /opt, and /var', () => {
    assert.equal(isSystemPath('/usr/local'), false);
    assert.equal(isSystemPath('/usr/local/src/app'), false);
    assert.equal(isSystemPath('/opt/myapp'), false);
    assert.equal(isSystemPath('/var/www/site'), false);
  });

  it('refuses Windows system paths and drive roots', () => {
    assert.equal(isSystemPath('C:\\'), true);
    assert.equal(isSystemPath('C:/'), true);
    assert.equal(isSystemPath('C:\\Windows'), true);
    assert.equal(isSystemPath('C:\\Windows\\System32'), true);
    assert.equal(isSystemPath('c:/program files/nodejs'), true);
    assert.equal(isSystemPath('C:\\Program Files (x86)\\Common Files'), true);
    assert.equal(isSystemPath('D:\\ProgramData\\pkg'), true);
    assert.equal(isSystemPath('\\\\server\\share'), true);
  });

  it('allows an ordinary Windows project path', () => {
    assert.equal(isSystemPath('D:\\projects\\app'), false);
    assert.equal(isSystemPath('C:\\Users\\dev\\code'), false);
  });

  it('refuses null bytes and ignores relative or empty input', () => {
    assert.equal(isSystemPath('has\0null'), true);
    assert.equal(isSystemPath(''), false);
    assert.equal(isSystemPath('usr'), false);
    assert.equal(isSystemPath('node_modules'), false);
  });
});

describe('path containment', () => {
  it('detects descendants and rejects the parent itself', () => {
    assert.equal(isStrictlyInside('/work/app', '/work/app/node_modules'), true);
    assert.equal(isStrictlyInside('/work/app', '/work/app'), false);
    assert.equal(isSameOrInside('/work/app', '/work/app'), true);
  });

  it('rejects siblings and prefix attacks', () => {
    assert.equal(isStrictlyInside('/usr', '/usr-backup/node_modules'), false);
    assert.equal(isStrictlyInside('/work/app', '/work/app-2/node_modules'), false);
    assert.equal(isStrictlyInside('/work/app', '/work'), false);
    assert.equal(isStrictlyInside('/work/app', '/etc/node_modules'), false);
  });

  it('contains Windows descendants and rejects the drive root as a parent of itself', () => {
    assert.equal(isStrictlyInside('C:\\work\\app', 'C:\\work\\app\\node_modules'), true);
    assert.equal(isStrictlyInside('C:\\work\\app', 'C:\\work\\app'), false);
    assert.equal(isStrictlyInside('C:\\work\\app', 'C:\\work\\app-2\\node_modules'), false);
    assert.equal(isSameOrInside('C:\\Windows', 'C:\\Windows\\System32'), true);
  });
});

describe('assertSafeScanRoot', () => {
  it('refuses to scan /', async () => {
    await assert.rejects(() => assertSafeScanRoot('/'), SafetyError);
  });

  it('refuses to scan /usr and /etc', async () => {
    await assert.rejects(() => assertSafeScanRoot('/usr'), /system path/);
    await assert.rejects(() => assertSafeScanRoot('/etc'), /system path/);
  });

  it('reports a missing path as a usage error', async () => {
    await assert.rejects(() => assertSafeScanRoot('/no/such/vacuum-node-path'), /does not exist/);
  });

  it('rejects a file', async () => {
    const dir = await makeTemp();
    try {
      const file = path.join(dir, 'file.txt');
      await fs.writeFile(file, 'x');
      await assert.rejects(() => assertSafeScanRoot(file), /not a directory/);
    } finally {
      await removeTemp(dir);
    }
  });

  it('returns the real path of a normal directory', async () => {
    const dir = await makeTemp();
    try {
      const real = await assertSafeScanRoot(dir);
      assert.equal(real, await fs.realpath(dir));
    } finally {
      await removeTemp(dir);
    }
  });

  it('rejects an empty path', async () => {
    await assert.rejects(() => assertSafeScanRoot(''), /non-empty/);
    await assert.rejects(() => assertSafeScanRoot('bad\0path'), /non-empty/);
  });
});

describe('assertSafeToDelete', () => {
  it('allows a real node_modules directory inside the root', async () => {
    const dir = await makeTemp();
    try {
      const target = path.join(dir, 'pkg', 'node_modules');
      await fs.mkdir(target, { recursive: true });
      await assert.doesNotReject(() => assertSafeToDelete(dir, target));
    } finally {
      await removeTemp(dir);
    }
  });

  it('refuses the scan root itself, even when it is named node_modules', async () => {
    const parent = await makeTemp();
    try {
      const root = path.join(parent, 'node_modules');
      await fs.mkdir(root);
      await assert.rejects(() => assertSafeToDelete(root, root), /outside scan root/);
    } finally {
      await removeTemp(parent);
    }
  });

  it('refuses a directory whose name is not a known cache', async () => {
    const dir = await makeTemp();
    try {
      const src = path.join(dir, 'src');
      await fs.mkdir(src);
      await assert.rejects(() => assertSafeToDelete(dir, src), /unexpected directory name/);
    } finally {
      await removeTemp(dir);
    }
  });

  it('refuses a symlink even when its target is inside the root', async () => {
    const dir = await makeTemp();
    try {
      const real = path.join(dir, 'pkg', 'node_modules');
      await fs.mkdir(real, { recursive: true });
      const link = path.join(dir, 'link-modules');
      await fs.symlink(real, link);
      await assert.rejects(() => assertSafeToDelete(dir, link), /symlink/);
    } finally {
      await removeTemp(dir);
    }
  });

  it('refuses a symlink whose target lives outside the root', async () => {
    const root = await makeTemp();
    const outside = await makeTemp();
    try {
      const external = path.join(outside, 'node_modules');
      await fs.mkdir(external);
      await fs.writeFile(path.join(external, 'precious.txt'), 'keep');
      const link = path.join(root, 'node_modules');
      await fs.symlink(external, link);
      await assert.rejects(() => assertSafeToDelete(root, link), /symlink/);
      assert.equal(await fs.readFile(path.join(external, 'precious.txt'), 'utf8'), 'keep');
    } finally {
      await removeTemp(root);
      await removeTemp(outside);
    }
  });

  it('refuses a real directory that resolves outside the scan root', async () => {
    const root = await makeTemp();
    const outside = await makeTemp();
    try {
      const external = path.join(outside, 'node_modules');
      await fs.mkdir(external);
      const escaped = path.join(root, '..', path.basename(outside), 'node_modules');
      await assert.rejects(() => assertSafeToDelete(root, escaped), /outside scan root/);
    } finally {
      await removeTemp(root);
      await removeTemp(outside);
    }
  });

  it('refuses a file and a missing path', async () => {
    const dir = await makeTemp();
    try {
      const file = path.join(dir, 'node_modules');
      await fs.writeFile(file, 'nope');
      await assert.rejects(() => assertSafeToDelete(dir, file), /non-directory/);
      await assert.rejects(() => assertSafeToDelete(dir, path.join(dir, 'missing')), /missing path/);
    } finally {
      await removeTemp(dir);
    }
  });

  it('refuses to delete a cache directory that realpath-escapes through a parent symlink', async () => {
    const root = await makeTemp();
    const outside = await makeTemp();
    try {
      const external = path.join(outside, 'node_modules');
      await fs.mkdir(external);
      const linkedParent = path.join(root, 'linked');
      await fs.symlink(outside, linkedParent);
      await assert.rejects(
        () => assertSafeToDelete(root, path.join(linkedParent, 'node_modules')),
        /outside scan root|symlink/,
      );
    } finally {
      await removeTemp(root);
      await removeTemp(outside);
    }
  });
});
