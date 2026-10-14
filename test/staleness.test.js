const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MS_PER_DAY } = require('../dist/constants');
const { ageInDays, isStale } = require('../dist/staleness');

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

describe('isStale', () => {
  it('treats an mtime older than the threshold as stale', () => {
    const mtime = NOW - 45 * MS_PER_DAY;
    assert.equal(isStale(mtime, 30, NOW), true);
  });

  it('treats an mtime exactly N days old as stale', () => {
    const mtime = NOW - 30 * MS_PER_DAY;
    assert.equal(isStale(mtime, 30, NOW), true);
    assert.equal(ageInDays(mtime, NOW), 30);
  });

  it('keeps an mtime one millisecond newer than the threshold', () => {
    const mtime = NOW - 30 * MS_PER_DAY + 1;
    assert.equal(isStale(mtime, 30, NOW), false);
  });

  it('does not treat a future mtime as stale', () => {
    assert.equal(isStale(NOW + MS_PER_DAY, 30, NOW), false);
    assert.equal(isStale(NOW + 1, 0, NOW), false);
  });

  it('treats every past-or-present mtime as stale when days is 0', () => {
    assert.equal(isStale(NOW, 0, NOW), true);
    assert.equal(isStale(NOW - 1, 0, NOW), true);
  });

  it('does not treat a negative threshold as stale', () => {
    assert.equal(isStale(NOW - 10 * MS_PER_DAY, -1, NOW), false);
  });

  it('returns false for non-finite inputs', () => {
    assert.equal(isStale(Number.NaN, 30, NOW), false);
    assert.equal(isStale(NOW, Number.POSITIVE_INFINITY, NOW), false);
    assert.equal(isStale(NOW, 30, Number.NaN), false);
  });

  it('supports fractional day thresholds', () => {
    const mtime = NOW - 0.5 * MS_PER_DAY;
    assert.equal(isStale(mtime, 0.5, NOW), true);
    assert.equal(isStale(mtime + 1, 0.5, NOW), false);
  });
});

describe('ageInDays', () => {
  it('returns 0 when mtime is now', () => {
    assert.equal(ageInDays(NOW, NOW), 0);
  });

  it('returns a fractional age', () => {
    assert.equal(ageInDays(NOW - 1.5 * MS_PER_DAY, NOW), 1.5);
  });

  it('returns a negative age for a future mtime', () => {
    assert.equal(ageInDays(NOW + 2 * MS_PER_DAY, NOW), -2);
  });

  it('uses a 24 hour day', () => {
    assert.equal(MS_PER_DAY, 86_400_000);
    assert.equal(ageInDays(NOW - MS_PER_DAY, NOW), 1);
  });
});
