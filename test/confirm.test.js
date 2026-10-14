const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isAffirmative, shouldPrompt } = require('../dist/confirm');

describe('isAffirmative', () => {
  it('accepts y and yes in any case', () => {
    for (const answer of ['y', 'Y', 'yes', 'YES', 'Yes']) {
      assert.equal(isAffirmative(answer), true, answer);
    }
  });

  it('accepts surrounding whitespace', () => {
    assert.equal(isAffirmative('  y  '), true);
    assert.equal(isAffirmative('\tyes\n'), true);
  });

  it('rejects other confirmations', () => {
    for (const answer of ['', 'n', 'no', 'N', 'yeah', 'yep', 'yy', 'yes!', ' y e s ']) {
      assert.equal(isAffirmative(answer), false, JSON.stringify(answer));
    }
  });

  it('rejects non-strings', () => {
    assert.equal(isAffirmative(undefined), false);
    assert.equal(isAffirmative(1), false);
  });
});

describe('shouldPrompt', () => {
  it('prompts only on an interactive terminal without --yes or --json', () => {
    assert.equal(shouldPrompt({ yes: false, json: false, isTTY: true }), true);
  });

  it('stays quiet when stdin/stdout are not a TTY', () => {
    assert.equal(shouldPrompt({ yes: false, json: false, isTTY: false }), false);
  });

  it('stays quiet in JSON mode even on a TTY', () => {
    assert.equal(shouldPrompt({ yes: false, json: true, isTTY: true }), false);
  });

  it('does not prompt when --yes is already set', () => {
    assert.equal(shouldPrompt({ yes: true, json: false, isTTY: true }), false);
    assert.equal(shouldPrompt({ yes: true, json: true, isTTY: false }), false);
  });
});
