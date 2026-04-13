import { beforeEach, describe, expect, it } from 'vitest';
import type { AnisetteData } from '../anisette-service';
import type { AppleDeveloperContext } from '../apple-signing';
import {
  decodeAnisetteData,
  encodeAnisetteData,
  loadStoredAccountList,
  loadStoredAccountSummary,
  persistAccountSession,
  persistAccountSummary,
  readAccountSessionMap,
  removeStoredAccountSession,
  restorePersistedAccountContexts,
  setStoredAccountSummary,
  writeAccountSessionMap,
  type StoredAccountSessionPayload,
  type StoredAccountSummary,
  type StoredAnisetteDataPayload,
} from './account-session';
import {
  APPLE_ACCOUNT_LIST_STORAGE_KEY,
  APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY,
  APPLE_ACCOUNT_SUMMARY_STORAGE_KEY,
  loadText,
  saveText,
} from './storage';

const sampleAnisette: AnisetteData = {
  machineID: 'MID',
  oneTimePassword: 'OTP',
  localUserID: 'LUID',
  routingInfo: 17106176,
  deviceUniqueIdentifier: 'DUI',
  deviceDescription: 'desc',
  deviceSerialNumber: '0',
  date: new Date('2024-01-02T03:04:05.000Z'),
  locale: 'en_US',
  timeZone: 'UTC',
};

function makeContext(overrides: Partial<AppleDeveloperContext> = {}): AppleDeveloperContext {
  return {
    appleId: 'user@example.com',
    session: {
      anisetteData: sampleAnisette,
      dsid: 'dsid-1',
      authToken: 'auth-1',
    },
    team: {
      identifier: 'TEAMA',
      name: 'Team A',
    } as AppleDeveloperContext['team'],
    certificates: [],
    devices: [],
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('encode/decodeAnisetteData', () => {
  it('round-trips a valid payload', () => {
    const encoded = encodeAnisetteData(sampleAnisette);
    const decoded = decodeAnisetteData(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.machineID).toBe(sampleAnisette.machineID);
    expect(decoded?.date.getTime()).toBe(sampleAnisette.date.getTime());
  });

  it('defaults a missing serial number to "0"', () => {
    const encoded: StoredAnisetteDataPayload = {
      ...encodeAnisetteData(sampleAnisette),
      deviceSerialNumber: '',
    };
    expect(decodeAnisetteData(encoded)?.deviceSerialNumber).toBe('0');
  });

  it('returns null when any required string field is empty', () => {
    const encoded = encodeAnisetteData(sampleAnisette);
    expect(decodeAnisetteData({ ...encoded, machineID: '' })).toBeNull();
    expect(decodeAnisetteData({ ...encoded, deviceUniqueIdentifier: '' })).toBeNull();
    expect(decodeAnisetteData({ ...encoded, timeZone: '' })).toBeNull();
  });

  it("returns null when routing info isn't finite", () => {
    const encoded = encodeAnisetteData(sampleAnisette);
    expect(decodeAnisetteData({ ...encoded, routingInfo: Number.NaN })).toBeNull();
  });

  it('returns null when the date is invalid', () => {
    const encoded = encodeAnisetteData(sampleAnisette);
    expect(decodeAnisetteData({ ...encoded, dateIso: 'not-a-date' })).toBeNull();
  });
});

describe('loadStoredAccountSummary / setStoredAccountSummary', () => {
  const summary: StoredAccountSummary = {
    appleId: 'u@e.com',
    teamId: 'T1',
    teamName: 'Team One',
    updatedAtIso: '2024-01-01T00:00:00.000Z',
  };

  it('returns null when nothing is stored', () => {
    expect(loadStoredAccountSummary()).toBeNull();
  });

  it('round-trips a summary', () => {
    setStoredAccountSummary(summary);
    expect(loadStoredAccountSummary()).toEqual(summary);
  });

  it('returns null for malformed JSON', () => {
    saveText(APPLE_ACCOUNT_SUMMARY_STORAGE_KEY, '{not json');
    expect(loadStoredAccountSummary()).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    saveText(APPLE_ACCOUNT_SUMMARY_STORAGE_KEY, JSON.stringify({ appleId: 'x' }));
    expect(loadStoredAccountSummary()).toBeNull();
  });
});

describe('loadStoredAccountList', () => {
  it('falls back to the single summary when no list is stored', () => {
    setStoredAccountSummary({
      appleId: 'solo@e.com',
      teamId: 'T1',
      teamName: 'Solo',
      updatedAtIso: '2024-01-01T00:00:00.000Z',
    });
    expect(loadStoredAccountList()).toHaveLength(1);
  });

  it('returns [] when nothing is stored', () => {
    expect(loadStoredAccountList()).toEqual([]);
  });

  it('filters out malformed entries from a stored list', () => {
    saveText(
      APPLE_ACCOUNT_LIST_STORAGE_KEY,
      JSON.stringify([
        { appleId: 'ok@e.com', teamId: 'T1', teamName: 'n', updatedAtIso: '2024-01-01' },
        { appleId: '', teamId: 'bad' },
        null,
      ]),
    );
    const list = loadStoredAccountList();
    expect(list).toHaveLength(1);
    expect(list[0].appleId).toBe('ok@e.com');
  });

  it('returns [] when list JSON is malformed', () => {
    saveText(APPLE_ACCOUNT_LIST_STORAGE_KEY, 'garbage');
    expect(loadStoredAccountList()).toEqual([]);
  });
});

describe('persistAccountSummary', () => {
  it('writes the summary and prepends it into the list, capping at 12 + dedup', () => {
    persistAccountSummary(
      makeContext({ appleId: 'a@e.com', team: { identifier: 'T1', name: 'One' } as AppleDeveloperContext['team'] }),
    );
    persistAccountSummary(
      makeContext({ appleId: 'b@e.com', team: { identifier: 'T2', name: 'Two' } as AppleDeveloperContext['team'] }),
    );
    // Re-persist A — should move to the top, not duplicate.
    persistAccountSummary(
      makeContext({ appleId: 'a@e.com', team: { identifier: 'T1', name: 'One' } as AppleDeveloperContext['team'] }),
    );

    const list = loadStoredAccountList();
    expect(list.map((entry) => entry.appleId)).toEqual(['a@e.com', 'b@e.com']);
    expect(loadStoredAccountSummary()?.appleId).toBe('a@e.com');
  });
});

describe('readAccountSessionMap / writeAccountSessionMap', () => {
  it('returns {} when the key is missing', () => {
    expect(readAccountSessionMap()).toEqual({});
  });

  it('skips entries that fail shape validation', () => {
    saveText(
      APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY,
      JSON.stringify({
        good: {
          appleId: 'a@e.com',
          teamId: 'T1',
          teamName: 'One',
          dsid: 'd',
          authToken: 't',
          anisetteData: encodeAnisetteData(sampleAnisette),
          updatedAtIso: '2024-01-01',
        },
        bad: { appleId: 'only' },
      }),
    );
    const map = readAccountSessionMap();
    expect(Object.keys(map)).toEqual(['good']);
  });

  it('returns {} when the stored value is an array', () => {
    saveText(APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY, '[]');
    expect(readAccountSessionMap()).toEqual({});
  });

  it('returns {} for malformed JSON', () => {
    saveText(APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY, 'not-json');
    expect(readAccountSessionMap()).toEqual({});
  });

  it('round-trips via writeAccountSessionMap', () => {
    const payload: StoredAccountSessionPayload = {
      appleId: 'a@e.com',
      teamId: 'T1',
      teamName: 'One',
      dsid: 'd',
      authToken: 't',
      anisetteData: encodeAnisetteData(sampleAnisette),
      updatedAtIso: '2024-01-01',
    };
    writeAccountSessionMap({ key: payload });
    expect(readAccountSessionMap()).toEqual({ key: payload });
  });
});

describe('persistAccountSession / removeStoredAccountSession', () => {
  it('persists under the canonical account key and removes on request', () => {
    const ctx = makeContext();
    persistAccountSession(ctx, sampleAnisette);
    const map = readAccountSessionMap();
    expect(Object.keys(map)).toHaveLength(1);
    expect(Object.keys(map)[0]).toBe('user@example.com::TEAMA');

    expect(removeStoredAccountSession(ctx.appleId, ctx.team.identifier)).toBe(true);
    expect(readAccountSessionMap()).toEqual({});
    // Idempotent: second removal is a no-op and returns false.
    expect(removeStoredAccountSession(ctx.appleId, ctx.team.identifier)).toBe(false);
  });

  it('falls back to context.session.anisetteData when no anisette is passed', () => {
    persistAccountSession(makeContext(), null);
    const map = readAccountSessionMap();
    const entry = map[Object.keys(map)[0]];
    expect(entry.anisetteData.machineID).toBe(sampleAnisette.machineID);
  });
});

describe('restorePersistedAccountContexts', () => {
  it('rebuilds the in-memory context map from stored sessions', () => {
    const payload: StoredAccountSessionPayload = {
      appleId: 'a@e.com',
      teamId: 'T1',
      teamName: 'One',
      dsid: 'd',
      authToken: 't',
      anisetteData: encodeAnisetteData(sampleAnisette),
      updatedAtIso: '2024-01-01',
    };
    writeAccountSessionMap({ 'a@e.com::T1': payload });

    const restored = restorePersistedAccountContexts();
    expect(restored.size).toBe(1);
    const ctx = restored.get('a@e.com::T1');
    expect(ctx?.appleId).toBe('a@e.com');
    expect(ctx?.team.identifier).toBe('T1');
    expect(ctx?.session.dsid).toBe('d');
  });

  it('skips entries whose anisette payload fails to decode', () => {
    const goodAnisette = encodeAnisetteData(sampleAnisette);
    const badAnisette: StoredAnisetteDataPayload = { ...goodAnisette, machineID: '' };
    writeAccountSessionMap({
      'good::T1': {
        appleId: 'good@e.com',
        teamId: 'T1',
        teamName: 'n',
        dsid: 'd',
        authToken: 't',
        anisetteData: goodAnisette,
        updatedAtIso: '2024-01-01',
      },
      'bad::T2': {
        appleId: 'bad@e.com',
        teamId: 'T2',
        teamName: 'n',
        dsid: 'd',
        authToken: 't',
        anisetteData: badAnisette,
        updatedAtIso: '2024-01-01',
      },
    });
    const restored = restorePersistedAccountContexts();
    // Keys are rebuilt from payload.appleId / payload.teamId, not from the
    // original map key.
    expect(Array.from(restored.keys())).toEqual(['good@e.com::T1']);
  });
});

describe('integration: summary + list + loadText all stay in sync', () => {
  it('exposes via loadText the raw serialized values', () => {
    persistAccountSummary(makeContext());
    expect(loadText(APPLE_ACCOUNT_SUMMARY_STORAGE_KEY)).toContain('"appleId":"user@example.com"');
    expect(loadText(APPLE_ACCOUNT_LIST_STORAGE_KEY)).toContain('TEAMA');
  });
});
