const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { DEFAULT_DAYS } = require('../dist/constants');
const { parseArgs, wantsJson } = require('../dist/args');

describe('parseArgs', () => {
  it('defaults to the provided working directory and 30 days, not $HOME', () => {
    const cwd = '/srv/projects/app';
    const parsed = parseArgs([], cwd);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.args.path, cwd);
    assert.notEqual(parsed.args.path, os.homedir());
    assert.equal(parsed.args.days, DEFAULT_DAYS);
    assert.equal(DEFAULT_DAYS, 30);
    assert.equal(parsed.args.caches, false);
    assert.equal(parsed.args.yes, false);
    assert.equal(parsed.args.json, false);
  });

  it('reads --path and --days', () => {
    const parsed = parseArgs(['--path', '/work', '--days', '14'], '/ignored');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.args.path, '/work');
    assert.equal(parsed.args.days, 14);
  });

  it('reads equals-form flags and fractional days', () => {
    const parsed = parseArgs(['--path=/work/app', '--days=0.5', '--caches', '--json'], '/ignored');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.args.path, '/work/app');
    assert.equal(parsed.args.days, 0.5);
    assert.equal(parsed.args.caches, true);
    assert.equal(parsed.args.json, true);
  });

  it('accepts short flags and clusters boolean shorts', () => {
    const parsed = parseArgs(['-p', '/work', '-d', '7', '-yc'], '/ignored');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.args.path, '/work');
    assert.equal(parsed.args.days, 7);
    assert.equal(parsed.args.yes, true);
    assert.equal(parsed.args.caches, true);
  });

  it('accepts --yes and -y', () => {
    assert.equal(parseArgs(['--yes'], '/tmp').args.yes, true);
    assert.equal(parseArgs(['-y'], '/tmp').args.yes, true);
  });

  it('rejects a missing --path value', () => {
    const parsed = parseArgs(['--path'], '/tmp');
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /missing value for --path/);
  });

  it('rejects a flag used as a --path value', () => {
    const parsed = parseArgs(['--path', '--json'], '/tmp');
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /missing value for --path/);
  });

  it('rejects a missing --days value', () => {
    const parsed = parseArgs(['--days'], '/tmp');
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /missing value/);
  });

  it('rejects invalid day counts', () => {
    for (const value of ['-1', 'nope', '1day', '']) {
      const parsed = parseArgs(['--days', value], '/tmp');
      assert.equal(parsed.ok, false, value);
      assert.match(parsed.error, /invalid --days/);
    }
  });

  it('rejects unknown options and extra positionals', () => {
    assert.match(parseArgs(['--force'], '/tmp').error, /unknown option/);
    assert.match(parseArgs(['projects'], '/tmp').error, /unexpected argument/);
    assert.match(parseArgs(['--', 'extra'], '/tmp').error, /unexpected argument/);
  });

  it('rejects clustered flags that need values', () => {
    const parsed = parseArgs(['-pd'], '/tmp');
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /cannot cluster/);
  });

  it('recognizes help and version', () => {
    assert.equal(parseArgs(['--help'], '/tmp').args.help, true);
    assert.equal(parseArgs(['-h'], '/tmp').args.help, true);
    assert.equal(parseArgs(['--version'], '/tmp').args.version, true);
    assert.equal(parseArgs(['-v'], '/tmp').args.version, true);
  });

  it('detects --json even when parsing later fails', () => {
    assert.equal(wantsJson(['--json', '--days', 'nope']), true);
    assert.equal(wantsJson(['--days', '1']), false);
  });
});
