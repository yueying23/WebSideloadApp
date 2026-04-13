import { DirectUsbMuxClient, LOCKDOWN_PORT, WebUsbTransport, createOpenSslWasmTlsFactory } from 'webmuxd';
import {
  createPairRecord,
  getOrCreateHostId,
  getOrCreateSystemBuid,
  loadPairRecordForUdid,
  savePairRecordForUdid,
} from '../lib/pair-record';
import { HOST_ID_STORAGE_KEY, SYSTEM_BUID_STORAGE_KEY, saveText } from '../lib/storage';

export interface PairedDeviceInfo {
  udid: string;
  name: string | null;
}

export interface PairContext {
  log: (message: string) => void;
  clientRef: { current: DirectUsbMuxClient | null };
  onStateChange: () => void;
  onTrustPending: () => void;
}

export function isPairingDialogPendingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('PairingDialogResponsePending');
}

export async function ensureClientSelected(ctx: PairContext): Promise<DirectUsbMuxClient> {
  if (ctx.clientRef.current) return ctx.clientRef.current;

  const transport = await WebUsbTransport.requestAppleDevice();
  const client = new DirectUsbMuxClient(transport, {
    log: ctx.log,
    onStateChange: ctx.onStateChange,
    lockdownLabel: 'webmuxd.frontend',
    tlsFactory: createOpenSslWasmTlsFactory(),
    pairRecordFactory: {
      createPairRecord: async (request) => {
        return await createPairRecord(request.devicePublicKey, request.hostId, request.systemBuid);
      },
    },
  });
  ctx.clientRef.current = client;

  ctx.log('device selected from browser popup');
  ctx.onStateChange();
  return client;
}

export async function pairDeviceFlow(ctx: PairContext): Promise<PairedDeviceInfo> {
  const client = await ensureClientSelected(ctx);

  if (!client.isHandshakeComplete) {
    ctx.log('pair: opening mux handshake...');
    await client.openAndHandshake();
  }
  if (!client.isLockdownConnected) {
    ctx.log('pair: connecting lockdownd...');
    await client.connectLockdown(LOCKDOWN_PORT);
  }

  const udid = await client.getOrFetchDeviceUdid();
  const name = await client.getOrFetchDeviceName();

  let hostId = getOrCreateHostId();
  let systemBuid = getOrCreateSystemBuid();

  const storedPair = loadPairRecordForUdid(udid);
  if (storedPair && !client.isPaired) {
    client.loadPairRecord(storedPair);
    hostId = storedPair.hostId;
    systemBuid = storedPair.systemBuid;
    saveText(HOST_ID_STORAGE_KEY, hostId);
    saveText(SYSTEM_BUID_STORAGE_KEY, systemBuid);
    ctx.log(`pair: loaded local pair record for ${udid}`);
  }

  if (!client.isPaired) {
    ctx.log('pair: creating pair record...');
    try {
      const pairResult = await client.pairDevice(hostId, systemBuid);
      savePairRecordForUdid(udid, pairResult);
      ctx.log('pair: success');
    } catch (error) {
      if (isPairingDialogPendingError(error)) {
        ctx.onTrustPending();
      }
      throw error;
    }
  }

  if (!client.isSessionStarted) {
    const session = await client.startSession(hostId, systemBuid);
    ctx.log(`pair: session ready, ssl=${String(session.enableSessionSsl)}`);
  }

  ctx.log(`pair: udid=${udid}${name ? ` (${name})` : ''}`);
  return { udid, name };
}
