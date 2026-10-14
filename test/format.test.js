const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatAge, formatBytes, formatGb, bytesToGb } = require('../dist/format');

describe('formatBytes', () => {
  it('formats zero as an integer byte count', () => {
    assert.equal(formatBytes(0), '0 B');
  });

  it('formats a single byte', () => {
    assert.equal(formatBytes(1), '1 B');
  });

  it('keeps values under 1 KB in bytes', () => {
    assert.equal(formatBytes(1023), '1023 B');
  });

  it('formats an exact kibibyte with one decimal', () => {
    assert.equal(formatBytes(1024), '1.0 KB');
  });

  it('formats a fractional kibibyte', () => {
    assert.equal(formatBytes(1536), '1.5 KB');
  });

  it('formats an exact mebibyte', () => {
    assert.equal(formatBytes(1024 * 1024), '1.0 MB');
  });

  it('formats a fractional mebibyte', () => {
    assert.equal(formatBytes(1024 * 1024 * 2.5), '2.5 MB');
  });

  it('formats an exact gibibyte', () => {
    assert.equal(formatBytes(1024 ** 3), '1.0 GB');
  });

  it('formats a fractional gibibyte', () => {
    assert.equal(formatBytes(1024 ** 3 * 2.25), '2.3 GB');
  });

  it('formats an exact tebibyte', () => {
    assert.equal(formatBytes(1024 ** 4), '1.0 TB');
  });

  it('formats an exact pebibyte', () => {
    assert.equal(formatBytes(1024 ** 5), '1.0 PB');
  });

  it('rejects a negative size', () => {
    assert.throws(() => formatBytes(-1), /non-negative/);
  });

  it('rejects NaN', () => {
    assert.throws(() => formatBytes(Number.NaN), TypeError);
  });

  it('rejects Infinity', () => {
    assert.throws(() => formatBytes(Number.POSITIVE_INFINITY), TypeError);
  });
});

describe('formatGb', () => {
  it('formats zero gigabytes', () => {
    assert.equal(formatGb(0), '0.00 GB');
  });

  it('formats one gibibyte', () => {
    assert.equal(formatGb(1024 ** 3), '1.00 GB');
  });

  it('formats a half gibibyte', () => {
    assert.equal(formatGb(1024 ** 3 / 2), '0.50 GB');
  });

  it('rounds the numeric gigabyte helper to 4 decimal places', () => {
    assert.equal(bytesToGb(1024 ** 3), 1);
    assert.equal(bytesToGb(0), 0);
  });

  it('rejects a negative gigabyte input', () => {
    assert.throws(() => formatGb(-5), TypeError);
    assert.throws(() => bytesToGb(Number.NaN), TypeError);
  });
});

describe('formatAge', () => {
  it('labels sub-day ages', () => {
    assert.equal(formatAge(0), '<1d');
    assert.equal(formatAge(0.9), '<1d');
  });

  it('floors ages of at least one day', () => {
    assert.equal(formatAge(1), '1d');
    assert.equal(formatAge(45.9), '45d');
  });

  it('uses a placeholder for invalid ages', () => {
    assert.equal(formatAge(-1), '?');
    assert.equal(formatAge(Number.NaN), '?');
  });
});
