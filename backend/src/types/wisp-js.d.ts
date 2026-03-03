declare module "@mercuryworkshop/wisp-js/server" {
  interface WispOptions {
    hostname_blacklist: RegExp[] | null;
    hostname_whitelist: RegExp[] | null;
    port_blacklist: (number | [number, number])[] | null;
    port_whitelist: (number | [number, number])[] | null;
    allow_direct_ip: boolean;
    allow_private_ips: boolean;
    allow_loopback_ips: boolean;
    allow_udp_streams: boolean;
    allow_tcp_streams: boolean;
    wisp_version: number;
  }

  interface ServerConnectionOptions {
    TCPSocket?: new (hostname: string, port: number) => unknown;
    UDPSocket?: new (hostname: string, port: number) => unknown;
    ping_interval?: number;
    wisp_version?: number;
  }

  interface ServerConnectionInstance {
    setup(): Promise<void>;
    run(): Promise<void>;
  }

  interface ServerNamespace {
    options: WispOptions;
    ServerConnection: new (
      ws: WebSocket,
      path: string,
      options?: ServerConnectionOptions,
    ) => ServerConnectionInstance;
  }

  export const server: ServerNamespace;
}
