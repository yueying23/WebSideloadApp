import { describe, expect, it } from 'vitest';
import { parseInstallProgress, parseProgressFromLog, parseSigningProgress } from './log-parser';

describe('parseInstallProgress', () => {
  it('returns null when the message lacks an InstProxy status', () => {
    expect(parseInstallProgress('nothing to see', 0)).toBeNull();
  });

  it('parses an explicit percent', () => {
    const out = parseInstallProgress('InstProxy status: Installing, Percent=42%', 0);
    expect(out).toEqual({ source: 'install', percent: 42, status: 'Installing' });
  });

  it('reports 100% when status is complete', () => {
    const out = parseInstallProgress('InstProxy status: Complete', 0);
    expect(out).toEqual({ source: 'install', percent: 100, status: 'Complete' });
  });

  it('uses the provided last percent when no percent is in the message', () => {
    const out = parseInstallProgress('InstProxy status: Preparing', 17);
    expect(out).toEqual({ source: 'install', percent: 17, status: 'Preparing' });
  });
});

describe('parseSigningProgress', () => {
  it('maps known signing stage messages to percents', () => {
    const cases: Array<[string, number]> = [
      ['sign: preparing ipa for upload', 8],
      ['signing stage: refreshing team', 14],
      ['signing stage: refreshed team info', 22],
      ['signing stage: using team T1', 28],
      ['signing stage: creating development certificate', 36],
      ['signing stage: using cached certificate', 40],
      ['signing stage: certificate ready', 48],
      ['signing stage: registering device', 56],
      ['signing stage: device already registered', 62],
      ['signing stage: device registered', 62],
      ['signing stage: device confirmed', 62],
      ['signing stage: creating app id', 72],
      ['signing stage: reuse app id XYZ', 72],
      ['signing stage: fetching provisioning profile', 82],
      ['signing stage: resigning ipa', 90],
      ['signing stage: complete', 100],
      ['sign: done -> foo.ipa', 100],
    ];
    for (const [message, percent] of cases) {
      const update = parseSigningProgress(message);
      expect(update).not.toBeNull();
      expect(update?.percent).toBe(percent);
      expect(update?.source).toBe('sign');
    }
  });

  it('returns null for unrelated messages', () => {
    expect(parseSigningProgress('nothing relevant')).toBeNull();
  });
});

describe('parseProgressFromLog', () => {
  it('prefers install parser when both could match', () => {
    // InstProxy wins via short-circuit, sign keyword is ignored.
    const update = parseProgressFromLog('InstProxy status: Installing, Percent=55% signing stage: complete', 0);
    expect(update?.source).toBe('install');
    expect(update?.percent).toBe(55);
  });

  it('falls back to signing parser when install status is absent', () => {
    const update = parseProgressFromLog('signing stage: resigning ipa', 0);
    expect(update?.source).toBe('sign');
    expect(update?.percent).toBe(90);
  });

  it('returns null when nothing matches', () => {
    expect(parseProgressFromLog('whatever', 0)).toBeNull();
  });
});
