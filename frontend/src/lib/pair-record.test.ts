import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the webmuxd barrel so no WASM / WebUSB plumbing is pulled into the
// test module graph. Only the primitives pair-record.ts uses are needed.
vi.mock('webmuxd', () => {
  let hostCounter = 0;
  let buidCounter = 0;
  return {
    createHostId: () => `host-${++hostCounter}`,
    createSystemBuid: () => `buid-${++buidCounter}`,
    encodeStoredPairRecord: (record: { hostId: string; systemBuid: string; devicePublicKey: Uint8Array }) => ({
      hostId: record.hostId,
      systemBuid: record.systemBuid,
      hostCertificatePem: 'host-cert',
      hostPrivateKeyPem: 'host-key',
      rootCertificatePem: 'root-cert',
      rootPrivateKeyPem: 'root-key',
      deviceCertificatePem: 'device-cert',
      devicePublicKey: btoa(String.fromCharCode(...Array.from(record.devicePublicKey))),
      escrowBag: null,
    }),
    decodeStoredPairRecord: (payload: { hostId: string; systemBuid: string; devicePublicKey: string }) => ({
      hostId: payload.hostId,
      systemBuid: payload.systemBuid,
      hostCertificatePem: 'host-cert',
      hostPrivateKeyPem: 'host-key',
      rootCertificatePem: 'root-cert',
      rootPrivateKeyPem: 'root-key',
      deviceCertificatePem: 'device-cert',
      devicePublicKey: new Uint8Array(Array.from(atob(payload.devicePublicKey)).map((c) => c.charCodeAt(0))),
    }),
    generatePairRecordWithOpenSslWasm: async (req: {
      devicePublicKey: Uint8Array;
      hostId: string;
      systemBuid: string;
    }): Promise<string> =>
      JSON.stringify({
        hostId: req.hostId,
        systemBuid: req.systemBuid,
        hostCertificatePem: 'HCERT\0',
        hostPrivateKeyPem: 'HKEY\0',
        rootCertificatePem: 'RCERT\0',
        rootPrivateKeyPem: 'RKEY\0',
        deviceCertificatePem: 'DCERT\0',
      }),
  };
});

import {
  createPairRecord,
  getOrCreateHostId,
  getOrCreateSystemBuid,
  listKnownDeviceUdids,
  loadPairRecordForUdid,
  readPairRecordMap,
  savePairRecordForUdid,
  writePairRecordMap,
} from './pair-record';
import {
  HOST_ID_STORAGE_KEY,
  LEGACY_PAIR_RECORD_STORAGE_KEY,
  PAIR_RECORDS_STORAGE_KEY,
  SYSTEM_BUID_STORAGE_KEY,
  loadText,
  saveText,
} from './storage';

beforeEach(() => {
  window.localStorage.clear();
});

describe('getOrCreateHostId / getOrCreateSystemBuid', () => {
  it('creates and persists a fresh id when missing', () => {
    const host = getOrCreateHostId();
    expect(host).toMatch(/^host-\d+$/);
    expect(loadText(HOST_ID_STORAGE_KEY)).toBe(host);
  });

  it('returns the existing id when already stored', () => {
    saveText(HOST_ID_STORAGE_KEY, 'stored-host');
    expect(getOrCreateHostId()).toBe('stored-host');
  });

  it('treats whitespace-only stored value as missing', () => {
    saveText(HOST_ID_STORAGE_KEY, '   ');
    const created = getOrCreateHostId();
    expect(created).toMatch(/^host-\d+$/);
  });

  it('creates system buid when missing', () => {
    const buid = getOrCreateSystemBuid();
    expect(buid).toMatch(/^buid-\d+$/);
    expect(loadText(SYSTEM_BUID_STORAGE_KEY)).toBe(buid);
  });
});

describe('readPairRecordMap / writePairRecordMap', () => {
  it('returns an empty object when no map is stored', () => {
    expect(readPairRecordMap()).toEqual({});
  });

  it('returns an empty object for malformed JSON', () => {
    saveText(PAIR_RECORDS_STORAGE_KEY, 'garbage');
    expect(readPairRecordMap()).toEqual({});
  });

  it('returns an empty object when the stored value is an array', () => {
    saveText(PAIR_RECORDS_STORAGE_KEY, '[]');
    expect(readPairRecordMap()).toEqual({});
  });

  it('round-trips a map', () => {
    writePairRecordMap({ 'UDID-A': { hostId: 'h', systemBuid: 'b' } as never });
    expect(readPairRecordMap()).toEqual({ 'UDID-A': { hostId: 'h', systemBuid: 'b' } });
  });
});

describe('savePairRecordForUdid / loadPairRecordForUdid', () => {
  const record = {
    hostId: 'host-x',
    systemBuid: 'buid-x',
    hostCertificatePem: 'host-cert',
    hostPrivateKeyPem: 'host-key',
    rootCertificatePem: 'root-cert',
    rootPrivateKeyPem: 'root-key',
    deviceCertificatePem: 'device-cert',
    devicePublicKey: new Uint8Array([1, 2, 3, 4]),
  };

  it('ignores an empty udid', () => {
    savePairRecordForUdid('', record);
    expect(readPairRecordMap()).toEqual({});
  });

  it('stores and loads a record by udid', () => {
    savePairRecordForUdid('UDID-1', record);
    const loaded = loadPairRecordForUdid('UDID-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.hostId).toBe('host-x');
    expect(loaded?.devicePublicKey).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('returns null for unknown udid when legacy record missing', () => {
    expect(loadPairRecordForUdid('missing')).toBeNull();
  });

  it('migrates a legacy single pair record under the requested udid', () => {
    saveText(
      LEGACY_PAIR_RECORD_STORAGE_KEY,
      JSON.stringify({
        hostId: 'legacy-host',
        systemBuid: 'legacy-buid',
        hostCertificatePem: '',
        hostPrivateKeyPem: '',
        rootCertificatePem: '',
        rootPrivateKeyPem: '',
        deviceCertificatePem: '',
        devicePublicKey: btoa('\x01\x02'),
      }),
    );
    const loaded = loadPairRecordForUdid('UDID-LEG');
    expect(loaded?.hostId).toBe('legacy-host');
    // Migration persists under the modern map and clears the legacy slot.
    expect(readPairRecordMap()['UDID-LEG']).toBeDefined();
    expect(loadText(LEGACY_PAIR_RECORD_STORAGE_KEY)).toBeNull();
  });
});

describe('listKnownDeviceUdids', () => {
  it('returns only stored UDIDs when no extra is passed', () => {
    writePairRecordMap({
      'UDID-B': {} as never,
      'UDID-A': {} as never,
    });
    expect(listKnownDeviceUdids(null)).toEqual(['UDID-A', 'UDID-B']);
  });

  it('includes the extra UDID and deduplicates', () => {
    writePairRecordMap({ 'UDID-A': {} as never });
    expect(listKnownDeviceUdids('UDID-A')).toEqual(['UDID-A']);
    expect(listKnownDeviceUdids('UDID-C')).toEqual(['UDID-A', 'UDID-C']);
  });
});

describe('createPairRecord', () => {
  it('calls the WASM generator and normalizes the returned PEM blocks', async () => {
    const devicePubkey = new Uint8Array([0x10, 0x20]);
    const record = await createPairRecord(devicePubkey, 'host-1', 'buid-1');
    expect(record.hostId).toBe('host-1');
    expect(record.systemBuid).toBe('buid-1');
    // normalizePem strips NULs and ensures trailing newline.
    expect(record.hostCertificatePem).toBe('HCERT\n');
    expect(record.hostPrivateKeyPem).toBe('HKEY\n');
    expect(record.deviceCertificatePem).toBe('DCERT\n');
    expect(record.devicePublicKey).toEqual(devicePubkey);
    // The returned buffer is a copy, not the input reference.
    expect(record.devicePublicKey).not.toBe(devicePubkey);
  });
});
