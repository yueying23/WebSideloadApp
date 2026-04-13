import { describe, expect, it } from 'vitest';
import { accountKey, buildPreparedSourceKey, formatError, formatFileSize, normalizePem, shortToken } from './ids';

describe('accountKey', () => {
  it('normalizes the apple id to lower-case and the team id to upper-case', () => {
    expect(accountKey('User@Example.com', 'abc123')).toBe('user@example.com::ABC123');
  });

  it('trims surrounding whitespace', () => {
    expect(accountKey('  a@b.com  ', '  xyz  ')).toBe('a@b.com::XYZ');
  });
});

describe('buildPreparedSourceKey', () => {
  it('combines name, size, lastModified and udid', () => {
    const file = new File([new Uint8Array(10)], 'app.ipa', { lastModified: 12345 });
    expect(buildPreparedSourceKey(file, 'UDID-1')).toBe('app.ipa:10:12345:UDID-1');
  });
});

describe('shortToken', () => {
  it('passes through short strings unchanged', () => {
    expect(shortToken('abcdef')).toBe('abcdef');
    expect(shortToken('abcdefghij')).toBe('abcdefghij');
  });

  it('truncates long strings with the 6..4 pattern', () => {
    expect(shortToken('abcdef1234567890xyzt')).toBe('abcdef...xyzt');
  });

  it('trims before measuring length', () => {
    expect(shortToken('   short   ')).toBe('short');
  });
});

describe('normalizePem', () => {
  it('strips NULs and normalizes CRLF', () => {
    expect(normalizePem('line1\r\nline2\0\r\n')).toBe('line1\nline2\n');
  });

  it('ensures a trailing newline', () => {
    expect(normalizePem('no-newline')).toBe('no-newline\n');
  });
});

describe('formatError', () => {
  it('returns the message for an Error instance', () => {
    expect(formatError(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    expect(formatError(42)).toBe('42');
    expect(formatError({ toString: () => 'obj' })).toBe('obj');
  });
});

describe('formatFileSize', () => {
  it('handles zero / negative as 0 B', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(-1)).toBe('0 B');
  });

  it('shows bytes below 1KiB', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('shows KB below 1MiB', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('shows MB at or above 1MiB', () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.00 MB');
  });
});
