/* tslint:disable */
/* eslint-disable */

export class OpensslClient {
    free(): void;
    [Symbol.dispose](): void;
    feed_tls(data: Uint8Array): void;
    is_handshaking(): boolean;
    constructor(_server_name: string, _ca_cert_pem: string, client_cert_pem: string, client_key_pem: string);
    take_plain_out(): Uint8Array;
    take_tls_out(): Uint8Array;
    write_plaintext(data: Uint8Array): void;
}

export function debug_runtime_stats(): string;

export function libimobiledevice_generate_pair_record(device_public_key: Uint8Array, host_id: string, system_buid: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly SSL_add_dir_cert_subjects_to_stack: (a: number, b: number) => number;
    readonly __cxa_atexit: (a: number, b: number, c: number) => number;
    readonly __wbg_opensslclient_free: (a: number, b: number) => void;
    readonly abort: () => void;
    readonly arc4random_buf: (a: number, b: number) => void;
    readonly atoi: (a: number) => number;
    readonly calloc: (a: number, b: number) => number;
    readonly clock_gettime: (a: number, b: number) => number;
    readonly close: (a: number) => number;
    readonly closedir: (a: number) => number;
    readonly debug_runtime_stats: () => [number, number];
    readonly free: (a: number) => void;
    readonly fstat: (a: number, b: number) => number;
    readonly getentropy: (a: number, b: number) => number;
    readonly getenv: (a: number) => number;
    readonly getpid: () => number;
    readonly gettimeofday: (a: number, b: number) => number;
    readonly libimobiledevice_generate_pair_record: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly malloc: (a: number) => number;
    readonly memchr: (a: number, b: number, c: number) => number;
    readonly open: (a: number, b: number, c: number) => number;
    readonly opendir: (a: number) => number;
    readonly opensslclient_feed_tls: (a: number, b: number, c: number) => [number, number];
    readonly opensslclient_is_handshaking: (a: number) => number;
    readonly opensslclient_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly opensslclient_take_plain_out: (a: number) => [number, number];
    readonly opensslclient_take_tls_out: (a: number) => [number, number];
    readonly opensslclient_write_plaintext: (a: number, b: number, c: number) => [number, number];
    readonly posix_memalign: (a: number, b: number, c: number) => number;
    readonly qsort: (a: number, b: number, c: number, d: number) => void;
    readonly read: (a: number, b: number, c: number) => number;
    readonly readdir: (a: number) => number;
    readonly realloc: (a: number, b: number) => number;
    readonly sscanf: (a: number, b: number, c: number) => number;
    readonly stat: (a: number, b: number) => number;
    readonly strchr: (a: number, b: number) => number;
    readonly strcmp: (a: number, b: number) => number;
    readonly strcpy: (a: number, b: number) => number;
    readonly strcspn: (a: number, b: number) => number;
    readonly strerror: (a: number) => number;
    readonly strncmp: (a: number, b: number, c: number) => number;
    readonly strncpy: (a: number, b: number, c: number) => number;
    readonly strpbrk: (a: number, b: number) => number;
    readonly strrchr: (a: number, b: number) => number;
    readonly strspn: (a: number, b: number) => number;
    readonly strstr: (a: number, b: number) => number;
    readonly strtol: (a: number, b: number, c: number) => number;
    readonly strtoul: (a: number, b: number, c: number) => number;
    readonly time: (a: number) => bigint;
    readonly tolower: (a: number) => number;
    readonly __wbindgen_exn_store_command_export: (a: number) => void;
    readonly __externref_table_alloc_command_export: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free_command_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc_command_export: (a: number, b: number) => number;
    readonly __wbindgen_realloc_command_export: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc_command_export: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
