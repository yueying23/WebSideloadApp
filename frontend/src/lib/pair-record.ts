import {
  createHostId,
  createSystemBuid,
  decodeStoredPairRecord,
  encodeStoredPairRecord,
  generatePairRecordWithOpenSslWasm,
  type PairRecord,
  type StoredPairRecordPayload,
} from 'webmuxd';
import {
  HOST_ID_STORAGE_KEY,
  LEGACY_PAIR_RECORD_STORAGE_KEY,
  PAIR_RECORDS_STORAGE_KEY,
  SYSTEM_BUID_STORAGE_KEY,
  loadText,
  removeText,
  saveText,
  writeJson,
} from './storage';
import { normalizePem } from './ids';

type WasmPairRecordPayload = Pick<
  PairRecord,
  | 'hostId'
  | 'systemBuid'
  | 'hostCertificatePem'
  | 'hostPrivateKeyPem'
  | 'rootCertificatePem'
  | 'rootPrivateKeyPem'
  | 'deviceCertificatePem'
>;

export function getOrCreateHostId(): string {
  const existing = loadText(HOST_ID_STORAGE_KEY);
  if (existing && existing.trim().length > 0) return existing;
  const created = createHostId();
  saveText(HOST_ID_STORAGE_KEY, created);
  return created;
}

export function getOrCreateSystemBuid(): string {
  const existing = loadText(SYSTEM_BUID_STORAGE_KEY);
  if (existing && existing.trim().length > 0) return existing;
  const created = createSystemBuid();
  saveText(SYSTEM_BUID_STORAGE_KEY, created);
  return created;
}

export function readPairRecordMap(): Record<string, StoredPairRecordPayload> {
  const raw = loadText(PAIR_RECORDS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, StoredPairRecordPayload>;
  } catch {
    return {};
  }
}

export function writePairRecordMap(map: Record<string, StoredPairRecordPayload>): void {
  writeJson(PAIR_RECORDS_STORAGE_KEY, map);
}

export function savePairRecordForUdid(udid: string, record: PairRecord): void {
  const normalizedUdid = udid.trim();
  if (normalizedUdid.length === 0) return;
  const map = readPairRecordMap();
  map[normalizedUdid] = encodeStoredPairRecord(record);
  writePairRecordMap(map);
}

function loadLegacyPairRecord(): PairRecord | null {
  const raw = loadText(LEGACY_PAIR_RECORD_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPairRecordPayload;
    return decodeStoredPairRecord(parsed);
  } catch {
    return null;
  }
}

export function loadPairRecordForUdid(udid: string): PairRecord | null {
  const normalizedUdid = udid.trim();
  if (normalizedUdid.length === 0) return null;

  const map = readPairRecordMap();
  const fromMap = map[normalizedUdid];
  if (fromMap) {
    try {
      return decodeStoredPairRecord(fromMap);
    } catch {
      return null;
    }
  }

  const legacy = loadLegacyPairRecord();
  if (legacy) {
    savePairRecordForUdid(normalizedUdid, legacy);
    removeText(LEGACY_PAIR_RECORD_STORAGE_KEY);
  }
  return legacy;
}

export async function createPairRecord(
  devicePublicKeyBytes: Uint8Array,
  hostId: string,
  systemBuid: string,
): Promise<PairRecord> {
  const payloadText = await generatePairRecordWithOpenSslWasm({
    devicePublicKey: devicePublicKeyBytes,
    hostId,
    systemBuid,
  });
  const payload = JSON.parse(payloadText) as WasmPairRecordPayload;
  return {
    hostId: payload.hostId,
    systemBuid: payload.systemBuid,
    hostCertificatePem: normalizePem(payload.hostCertificatePem),
    hostPrivateKeyPem: normalizePem(payload.hostPrivateKeyPem),
    rootCertificatePem: normalizePem(payload.rootCertificatePem),
    rootPrivateKeyPem: normalizePem(payload.rootPrivateKeyPem),
    deviceCertificatePem: normalizePem(payload.deviceCertificatePem),
    devicePublicKey: new Uint8Array(devicePublicKeyBytes),
  };
}

export function listKnownDeviceUdids(extra?: string | null): string[] {
  const known = new Set(Object.keys(readPairRecordMap()));
  if (extra && extra.trim().length > 0) known.add(extra);
  return Array.from(known).sort((a, b) => a.localeCompare(b));
}
