import { describe, expect, it } from 'vitest';
import {
  APPLE_ACCOUNT_LIST_STORAGE_KEY,
  APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY,
  APPLE_ACCOUNT_SUMMARY_STORAGE_KEY,
  APPLE_ID_STORAGE_KEY,
  APPLE_REMEMBER_SESSION_STORAGE_KEY,
  HOST_ID_STORAGE_KEY,
  LEGACY_PAIR_RECORD_STORAGE_KEY,
  PAIR_RECORDS_STORAGE_KEY,
  SELECTED_DEVICE_UDID_STORAGE_KEY,
  SYSTEM_BUID_STORAGE_KEY,
  loadText,
  readJson,
  removeText,
  saveText,
  writeJson,
} from './storage';

describe('storage keys', () => {
  it('preserves the canonical webmuxd keys (existing users must not lose data)', () => {
    expect(HOST_ID_STORAGE_KEY).toBe('webmuxd:host-id');
    expect(SYSTEM_BUID_STORAGE_KEY).toBe('webmuxd:system-buid');
    expect(PAIR_RECORDS_STORAGE_KEY).toBe('webmuxd:pair-records-by-udid');
    expect(LEGACY_PAIR_RECORD_STORAGE_KEY).toBe('webmuxd:pair-record');
    expect(APPLE_ID_STORAGE_KEY).toBe('webmuxd:apple-id');
    expect(APPLE_ACCOUNT_SUMMARY_STORAGE_KEY).toBe('webmuxd:apple-account-summary');
    expect(APPLE_ACCOUNT_LIST_STORAGE_KEY).toBe('webmuxd:apple-account-list');
    expect(APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY).toBe('webmuxd:apple-account-session-map');
    expect(APPLE_REMEMBER_SESSION_STORAGE_KEY).toBe('webmuxd:apple-remember-session');
    expect(SELECTED_DEVICE_UDID_STORAGE_KEY).toBe('webmuxd:selected-device-udid');
  });
});

describe('loadText / saveText / removeText', () => {
  it('round-trips a string', () => {
    saveText('k', 'v');
    expect(loadText('k')).toBe('v');
  });

  it('returns null for a missing key', () => {
    expect(loadText('missing')).toBeNull();
  });

  it('removes a key', () => {
    saveText('k', 'v');
    removeText('k');
    expect(loadText('k')).toBeNull();
  });
});

describe('readJson / writeJson', () => {
  const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

  it('round-trips a value that passes the guard', () => {
    writeJson('arr', ['a', 'b']);
    expect(readJson('arr', isStringArray)).toEqual(['a', 'b']);
  });

  it('returns null when the stored value fails the guard', () => {
    saveText('arr', JSON.stringify({ not: 'array' }));
    expect(readJson('arr', isStringArray)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    saveText('arr', 'not-json');
    expect(readJson('arr', isStringArray)).toBeNull();
  });

  it('returns null when the key is missing', () => {
    expect(readJson('missing', isStringArray)).toBeNull();
  });
});
