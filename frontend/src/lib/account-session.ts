import type { AnisetteData } from '../anisette-service';
import type { AppleDeveloperContext } from '../apple-signing';
import {
  APPLE_ACCOUNT_LIST_STORAGE_KEY,
  APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY,
  APPLE_ACCOUNT_SUMMARY_STORAGE_KEY,
  loadText,
  writeJson,
} from './storage';
import { accountKey } from './ids';

export interface StoredAccountSummary {
  appleId: string;
  teamId: string;
  teamName: string;
  updatedAtIso: string;
}

export interface StoredAnisetteDataPayload {
  machineID: string;
  oneTimePassword: string;
  localUserID: string;
  routingInfo: number;
  deviceUniqueIdentifier: string;
  deviceDescription: string;
  deviceSerialNumber: string;
  dateIso: string;
  locale: string;
  timeZone: string;
}

export interface StoredAccountSessionPayload {
  appleId: string;
  teamId: string;
  teamName: string;
  dsid: string;
  authToken: string;
  anisetteData: StoredAnisetteDataPayload;
  updatedAtIso: string;
}

export function encodeAnisetteData(data: AnisetteData): StoredAnisetteDataPayload {
  return {
    machineID: data.machineID,
    oneTimePassword: data.oneTimePassword,
    localUserID: data.localUserID,
    routingInfo: data.routingInfo,
    deviceUniqueIdentifier: data.deviceUniqueIdentifier,
    deviceDescription: data.deviceDescription,
    deviceSerialNumber: data.deviceSerialNumber,
    dateIso: data.date.toISOString(),
    locale: data.locale,
    timeZone: data.timeZone,
  };
}

export function decodeAnisetteData(payload: StoredAnisetteDataPayload): AnisetteData | null {
  if (
    !payload.machineID ||
    !payload.oneTimePassword ||
    !payload.localUserID ||
    !payload.deviceUniqueIdentifier ||
    !payload.deviceDescription ||
    !payload.locale ||
    !payload.timeZone
  ) {
    return null;
  }
  if (!Number.isFinite(payload.routingInfo)) return null;
  const date = new Date(payload.dateIso);
  if (Number.isNaN(date.getTime())) return null;

  return {
    machineID: payload.machineID,
    oneTimePassword: payload.oneTimePassword,
    localUserID: payload.localUserID,
    routingInfo: payload.routingInfo,
    deviceUniqueIdentifier: payload.deviceUniqueIdentifier,
    deviceDescription: payload.deviceDescription,
    deviceSerialNumber: payload.deviceSerialNumber || '0',
    date,
    locale: payload.locale,
    timeZone: payload.timeZone,
  };
}

export function loadStoredAccountSummary(): StoredAccountSummary | null {
  const raw = loadText(APPLE_ACCOUNT_SUMMARY_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAccountSummary;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.appleId || !parsed.teamId || !parsed.teamName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredAccountSummary(summary: StoredAccountSummary): void {
  writeJson(APPLE_ACCOUNT_SUMMARY_STORAGE_KEY, summary);
}

export function loadStoredAccountList(): StoredAccountSummary[] {
  const raw = loadText(APPLE_ACCOUNT_LIST_STORAGE_KEY);
  if (!raw) {
    const single = loadStoredAccountSummary();
    return single ? [single] : [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const normalized: StoredAccountSummary[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as StoredAccountSummary;
      if (!candidate.appleId || !candidate.teamId || !candidate.teamName || !candidate.updatedAtIso) continue;
      normalized.push(candidate);
    }

    return normalized;
  } catch {
    return [];
  }
}

export function persistAccountSummary(context: AppleDeveloperContext): void {
  const payload: StoredAccountSummary = {
    appleId: context.appleId,
    teamId: context.team.identifier,
    teamName: context.team.name,
    updatedAtIso: new Date().toISOString(),
  };
  setStoredAccountSummary(payload);

  const existing = loadStoredAccountList();
  const next = [
    payload,
    ...existing.filter((item) => !(item.appleId === payload.appleId && item.teamId === payload.teamId)),
  ].slice(0, 12);
  writeJson(APPLE_ACCOUNT_LIST_STORAGE_KEY, next);
}

export function readAccountSessionMap(): Record<string, StoredAccountSessionPayload> {
  const raw = loadText(APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const normalized: Record<string, StoredAccountSessionPayload> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const candidate = value as Partial<StoredAccountSessionPayload>;
      if (
        typeof candidate.appleId !== 'string' ||
        typeof candidate.teamId !== 'string' ||
        typeof candidate.teamName !== 'string' ||
        typeof candidate.dsid !== 'string' ||
        typeof candidate.authToken !== 'string' ||
        !candidate.anisetteData ||
        typeof candidate.updatedAtIso !== 'string'
      ) {
        continue;
      }
      normalized[key] = {
        appleId: candidate.appleId,
        teamId: candidate.teamId,
        teamName: candidate.teamName,
        dsid: candidate.dsid,
        authToken: candidate.authToken,
        anisetteData: candidate.anisetteData as StoredAnisetteDataPayload,
        updatedAtIso: candidate.updatedAtIso,
      };
    }
    return normalized;
  } catch {
    return {};
  }
}

export function writeAccountSessionMap(map: Record<string, StoredAccountSessionPayload>): void {
  writeJson(APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY, map);
}

export function persistAccountSession(context: AppleDeveloperContext, anisette: AnisetteData | null): void {
  const map = readAccountSessionMap();
  const key = accountKey(context.appleId, context.team.identifier);
  const anisetteData = anisette ?? context.session.anisetteData;
  map[key] = {
    appleId: context.appleId,
    teamId: context.team.identifier,
    teamName: context.team.name,
    dsid: context.session.dsid,
    authToken: context.session.authToken,
    anisetteData: encodeAnisetteData(anisetteData),
    updatedAtIso: new Date().toISOString(),
  };
  writeAccountSessionMap(map);
}

export function removeStoredAccountSession(appleId: string, teamId: string): boolean {
  const key = accountKey(appleId, teamId);
  const map = readAccountSessionMap();
  if (!(key in map)) return false;
  delete map[key];
  writeAccountSessionMap(map);
  return true;
}

export function restorePersistedAccountContexts(): Map<string, AppleDeveloperContext> {
  const result = new Map<string, AppleDeveloperContext>();
  const sessionMap = readAccountSessionMap();
  for (const payload of Object.values(sessionMap)) {
    const anisette = decodeAnisetteData(payload.anisetteData);
    if (!anisette) continue;

    const restored: AppleDeveloperContext = {
      appleId: payload.appleId,
      session: {
        anisetteData: anisette,
        dsid: payload.dsid,
        authToken: payload.authToken,
      },
      team: {
        identifier: payload.teamId,
        name: payload.teamName,
      } as AppleDeveloperContext['team'],
      certificates: [],
      devices: [],
    };
    result.set(accountKey(payload.appleId, payload.teamId), restored);
  }
  return result;
}
