declare module 'webmuxd' {
  export interface WebUsbTransportInstance {
    readonly isOpen: boolean;
    open(): Promise<void>;
    close(): Promise<void>;
    send(data: ArrayBuffer): Promise<void>;
    setDataHandler(handler: ((data: ArrayBuffer) => void) | null): void;
    setDisconnectHandler(handler: ((reason?: unknown) => void) | null): void;
  }

  export interface PairRecord {
    hostId: string;
    systemBuid: string;
    hostCertificatePem: string;
    hostPrivateKeyPem: string;
    rootCertificatePem: string;
    rootPrivateKeyPem: string;
    deviceCertificatePem: string;
    devicePublicKey: Uint8Array;
    escrowBag?: Uint8Array;
  }

  export interface StoredPairRecordPayload {
    hostId: string;
    systemBuid: string;
    hostCertificatePem: string;
    hostPrivateKeyPem: string;
    rootCertificatePem: string;
    rootPrivateKeyPem: string;
    deviceCertificatePem: string;
    devicePublicKey: string;
    escrowBag: string | null;
  }

  export interface TlsConnection {
    is_handshaking(): boolean;
    write_plaintext(data: Uint8Array): void;
    feed_tls(data: Uint8Array): void;
    take_tls_out(): Uint8Array;
    take_plain_out(): Uint8Array;
    free(): void;
  }

  export interface TlsConnectionFactory {
    ensureReady?(): Promise<void>;
    createConnection(request: {
      serverName: string;
      caCertificatePem: string;
      certificatePem: string;
      privateKeyPem: string;
    }): TlsConnection;
  }

  export class WebUsbTransport implements WebUsbTransportInstance {
    constructor(device: unknown, options?: { logger?: unknown; transferSize?: number });
    readonly isOpen: boolean;
    static supported(): boolean;
    static requestAppleDevice(logger?: unknown): Promise<WebUsbTransport>;
    open(): Promise<void>;
    close(): Promise<void>;
    send(data: ArrayBuffer): Promise<void>;
    setDataHandler(handler: ((data: ArrayBuffer) => void) | null): void;
    setDisconnectHandler(handler: ((reason?: unknown) => void) | null): void;
  }

  export class DirectUsbMuxClient {
    constructor(
      transport: WebUsbTransportInstance,
      options?: {
        log?: (message: string) => void;
        onStateChange?: () => void;
        lockdownLabel?: string;
        tlsFactory?: TlsConnectionFactory;
        pairRecordFactory?: {
          createPairRecord(request: {
            devicePublicKey: Uint8Array;
            hostId: string;
            systemBuid: string;
          }): Promise<PairRecord>;
        };
      },
    );
    readonly isHandshakeComplete: boolean;
    readonly isLockdownConnected: boolean;
    readonly isSessionStarted: boolean;
    readonly isSessionSslEnabled: boolean;
    readonly isTlsActive: boolean;
    readonly isPaired: boolean;
    loadPairRecord(record: PairRecord | null): void;
    openAndHandshake(): Promise<void>;
    connectLockdown(port?: number): Promise<void>;
    getOrFetchDeviceUdid(): Promise<string>;
    getOrFetchDeviceName(): Promise<string | null>;
    pairDevice(hostId: string, systemBuid: string): Promise<PairRecord>;
    startSession(
      hostId: string,
      systemBuid: string,
    ): Promise<{
      sessionId: string;
      enableSessionSsl: boolean;
    }>;
    close(): Promise<void>;
  }

  export const LOCKDOWN_PORT: number;
  export function installIpaViaInstProxy(
    client: DirectUsbMuxClient,
    ipaData: Uint8Array,
    fileName: string,
    onLog?: (message: string) => void,
  ): Promise<void>;
  export function sanitizeIpaFileName(fileName: string): string;
  export function createHostId(): string;
  export function createSystemBuid(): string;
  export function encodeStoredPairRecord(record: PairRecord): StoredPairRecordPayload;
  export function decodeStoredPairRecord(parsed: StoredPairRecordPayload): PairRecord | null;
  export function createOpenSslWasmTlsFactory(): TlsConnectionFactory;
  export function generatePairRecordWithOpenSslWasm(request: {
    devicePublicKey: Uint8Array;
    hostId: string;
    systemBuid: string;
  }): Promise<string>;
}
