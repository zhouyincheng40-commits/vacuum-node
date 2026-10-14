const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('package and docs', () => {
  const root = path.join(__dirname, '..');
  const pkg = require('../package.json');

  it('publishes the vacuum-node bin, MIT license, and keyword set', () => {
    assert.equal(pkg.name, 'vacuum-node');
    assert.equal(pkg.description, 'One-command cleanup for stale node_modules and regenerable JS caches.');
    assert.equal(pkg.license, 'MIT');
    assert.equal(pkg.bin['vacuum-node'], 'dist/cli.js');
    assert.equal(pkg.main, 'dist/index.js');
    assert.ok(pkg.files.includes('dist'));
    assert.ok(pkg.files.includes('LICENSE'));
    for (const keyword of ['cli', 'nodejs', 'disk-cleanup', 'node_modules', 'developer-tools', 'typescript']) {
      assert.ok(pkg.keywords.includes(keyword), keyword);
    }
  });

  it('runs tests from prepublishOnly and exposes build, test, and start', () => {
    assert.match(pkg.scripts.build, /tsc/);
    assert.match(pkg.scripts.test, /node --test/);
    assert.match(pkg.scripts.start, /dist\/cli\.js/);
    assert.match(pkg.scripts.prepublishOnly, /npm test/);
  });

  it('documents English usage, a short Chinese section, safety, and three examples', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /One-command cleanup for stale node_modules and regenerable JS caches\./);
    assert.match(readme, /npx vacuum-node/);
    assert.match(readme, /中文/);
    assert.match(readme, /docs\/demo\.gif/);
    assert.match(readme, /--path/);
    assert.match(readme, /--days/);
    assert.match(readme, /--caches/);
    assert.match(readme, /--yes/);
    assert.match(readme, /--json/);
    const examples = readme.match(/```bash[\s\S]*?```/g) ?? [];
    assert.ok(examples.length >= 3);
    for (const topic of ['cli', 'nodejs', 'node-modules', 'disk-cleanup', 'developer-tools', 'typescript']) {
      assert.ok(readme.includes(topic), topic);
    }
    assert.match(readme, /system/i);
    assert.match(readme, /symlink/i);
  });

  it('ships a license, contributing notes, and a GIF placeholder', () => {
    const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
    assert.match(license, /MIT License/);
    const contributing = fs.readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8');
    assert.match(contributing, /npm test/);
    const gif = fs.readFileSync(path.join(root, 'docs', 'demo.gif'));
    assert.equal(gif.subarray(0, 6).toString('ascii'), 'GIF89a');
  });
});
