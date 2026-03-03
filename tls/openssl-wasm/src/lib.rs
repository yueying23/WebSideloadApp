use core::ffi::{c_char, c_int, c_long, c_ulong, c_void};
use std::alloc::{alloc, alloc_zeroed, dealloc, realloc as rust_realloc, Layout};
use std::io::{ErrorKind, Read, Write};
use std::mem;
use std::ptr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Once, OnceLock};

use openssl::error::ErrorStack;
use openssl::hash::MessageDigest;
use openssl::nid::Nid;
use openssl::pkey::{HasPublic, PKey, Private};
use openssl::provider::Provider;
use openssl::rsa::Rsa;
use openssl::ssl::{
    HandshakeError, MidHandshakeSslStream, Ssl, SslContextBuilder, SslMethod, SslStream,
    SslVerifyMode, SslVersion,
};
use openssl::x509::extension::{BasicConstraints, KeyUsage, SubjectKeyIdentifier};
use openssl_sys as ffi;
use openssl::x509::{X509NameBuilder, X509};
use openssl::{asn1::{Asn1Integer, Asn1Time}, bn::BigNum};
use serde::Serialize;
use wasm_bindgen::prelude::*;
use web_sys::window;

static OPENSSL_PROVIDER_INIT: Once = Once::new();
static OPENSSL_PROVIDER_STATUS: OnceLock<String> = OnceLock::new();
static COUNT_QSORT: AtomicUsize = AtomicUsize::new(0);
static COUNT_VSNPRINTF: AtomicUsize = AtomicUsize::new(0);
static COUNT_SSCANF: AtomicUsize = AtomicUsize::new(0);
static COUNT_STRTOL: AtomicUsize = AtomicUsize::new(0);
static COUNT_STRTOUL: AtomicUsize = AtomicUsize::new(0);
static COUNT_GETENV: AtomicUsize = AtomicUsize::new(0);
static COUNT_OPEN: AtomicUsize = AtomicUsize::new(0);
static COUNT_READ: AtomicUsize = AtomicUsize::new(0);
static COUNT_STAT: AtomicUsize = AtomicUsize::new(0);
static COUNT_OPENDIR: AtomicUsize = AtomicUsize::new(0);
static ARC4_FALLBACK_SEED: AtomicUsize = AtomicUsize::new(0x9E37_79B9);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairRecordWasmOut {
    host_id: String,
    system_buid: String,
    host_certificate_pem: String,
    host_private_key_pem: String,
    root_certificate_pem: String,
    root_private_key_pem: String,
    device_certificate_pem: String,
}

#[derive(Copy, Clone)]
enum PairCertProfile {
    Root,
    Host,
    Device,
}

fn bump(counter: &AtomicUsize) {
    counter.fetch_add(1, Ordering::Relaxed);
}

fn ensure_openssl_providers() {
    OPENSSL_PROVIDER_INIT.call_once(|| {
        let mut status = Vec::new();
        for name in ["default", "base", "legacy"] {
            match Provider::load(None, name) {
                Ok(provider) => {
                    // Keep providers loaded for the whole process lifetime.
                    mem::forget(provider);
                    status.push(format!("{name}=ok"));
                }
                Err(error) => {
                    status.push(format!("{name}=err({error})"));
                }
            }
        }
        let _ = OPENSSL_PROVIDER_STATUS.set(status.join(","));
    });
}

fn openssl_provider_status() -> &'static str {
    OPENSSL_PROVIDER_STATUS
        .get()
        .map(String::as_str)
        .unwrap_or("<uninitialized>")
}

#[wasm_bindgen]
pub fn libimobiledevice_generate_pair_record(
    device_public_key: Vec<u8>,
    host_id: String,
    system_buid: String,
) -> Result<String, JsValue> {
    openssl::init();
    ensure_openssl_providers();

    let device_pubkey = parse_device_public_key(&device_public_key)
        .map_err(|error| js_err("parse device public key failed", error))?;
    let root_key = PKey::from_rsa(Rsa::generate(2048).map_err(|error| js_err("generate root RSA failed", error))?)
        .map_err(|error| js_err("create root pkey failed", error))?;
    let host_key = PKey::from_rsa(Rsa::generate(2048).map_err(|error| js_err("generate host RSA failed", error))?)
        .map_err(|error| js_err("create host pkey failed", error))?;

    let root_cert = build_pair_certificate(&root_key, &root_key, None, PairCertProfile::Root)
        .map_err(|error| js_err("build root cert failed", error))?;
    let host_cert =
        build_pair_certificate(&host_key, &root_key, Some(&root_cert), PairCertProfile::Host)
            .map_err(|error| js_err("build host cert failed", error))?;
    let device_cert = build_pair_certificate(
        &device_pubkey,
        &root_key,
        Some(&root_cert),
        PairCertProfile::Device,
    )
    .map_err(|error| js_err("build device cert failed", error))?;

    let root_rsa = root_key
        .rsa()
        .map_err(|error| js_err("extract root rsa failed", error))?;
    let host_rsa = host_key
        .rsa()
        .map_err(|error| js_err("extract host rsa failed", error))?;

    let output = PairRecordWasmOut {
        host_id,
        system_buid,
        host_certificate_pem: pem_bytes_to_string(
            host_cert
                .to_pem()
                .map_err(|error| js_err("export host cert failed", error))?,
        )?,
        host_private_key_pem: pem_bytes_to_string(
            host_rsa
                .private_key_to_pem()
                .map_err(|error| js_err("export host key failed", error))?,
        )?,
        root_certificate_pem: pem_bytes_to_string(
            root_cert
                .to_pem()
                .map_err(|error| js_err("export root cert failed", error))?,
        )?,
        root_private_key_pem: pem_bytes_to_string(
            root_rsa
                .private_key_to_pem()
                .map_err(|error| js_err("export root key failed", error))?,
        )?,
        device_certificate_pem: pem_bytes_to_string(
            device_cert
                .to_pem()
                .map_err(|error| js_err("export device cert failed", error))?,
        )?,
    };

    serde_json::to_string(&output)
        .map_err(|error| JsValue::from_str(&format!("serialize pair record failed: {error}")))
}

fn parse_device_public_key(device_public_key: &[u8]) -> Result<PKey<openssl::pkey::Public>, ErrorStack> {
    if let Ok(key) = PKey::public_key_from_pem(device_public_key) {
        return Ok(key);
    }
    PKey::public_key_from_der(device_public_key)
}

fn build_pair_certificate<T: HasPublic>(
    subject_key: &PKey<T>,
    issuer_key: &PKey<Private>,
    issuer_cert: Option<&X509>,
    profile: PairCertProfile,
) -> Result<X509, ErrorStack> {
    let mut builder = X509::builder()?;
    builder.set_version(2)?;

    let serial_bn = BigNum::from_u32(0)?;
    let serial = Asn1Integer::from_bn(&serial_bn)?;
    builder.set_serial_number(&serial)?;

    // Avoid runtime time dependencies in wasm libc shims.
    let not_before = Asn1Time::from_str_x509("20240101000000Z")?;
    builder.set_not_before(not_before.as_ref())?;
    let not_after = Asn1Time::from_str_x509("20340101000000Z")?;
    builder.set_not_after(not_after.as_ref())?;

    let subject_name = X509NameBuilder::new()?.build();
    builder.set_subject_name(&subject_name)?;
    if let Some(cert) = issuer_cert {
        builder.set_issuer_name(cert.subject_name())?;
    } else {
        builder.set_issuer_name(&subject_name)?;
    }
    builder.set_pubkey(subject_key)?;

    match profile {
        PairCertProfile::Root => {
            let ext = BasicConstraints::new().critical().ca().build()?;
            builder.append_extension(ext)?;
        }
        PairCertProfile::Host => {
            let basic = BasicConstraints::new().critical().build()?;
            builder.append_extension(basic)?;
            let usage = KeyUsage::new()
                .critical()
                .digital_signature()
                .key_encipherment()
                .build()?;
            builder.append_extension(usage)?;
        }
        PairCertProfile::Device => {
            let basic = BasicConstraints::new().critical().build()?;
            builder.append_extension(basic)?;
            let subject_key_id =
                SubjectKeyIdentifier::new().build(&builder.x509v3_context(issuer_cert.map(|v| v.as_ref()), None))?;
            builder.append_extension(subject_key_id)?;
            let usage = KeyUsage::new()
                .critical()
                .digital_signature()
                .key_encipherment()
                .build()?;
            builder.append_extension(usage)?;
        }
    }

    builder.sign(issuer_key, MessageDigest::sha256())?;
    Ok(builder.build())
}

fn pem_bytes_to_string(value: Vec<u8>) -> Result<String, JsValue> {
    let text = String::from_utf8(value)
        .map_err(|error| JsValue::from_str(&format!("invalid utf8 pem: {error}")))?;
    Ok(text.replace('\0', ""))
}

#[wasm_bindgen]
pub struct OpensslClient {
    state: Option<TlsState>,
    tls_out: Vec<u8>,
    plain_out: Vec<u8>,
}

enum TlsState {
    Handshaking(MidHandshakeSslStream<PumpIo>),
    Ready(SslStream<PumpIo>),
}

#[wasm_bindgen]
impl OpensslClient {
    #[wasm_bindgen(constructor)]
    pub fn new(
        _server_name: String,
        _ca_cert_pem: String,
        client_cert_pem: String,
        client_key_pem: String,
    ) -> Result<OpensslClient, JsValue> {
        openssl::init();
        ensure_openssl_providers();

        let cert = X509::from_pem(client_cert_pem.as_bytes())
            .map_err(|error| js_err("X509::from_pem failed", error))?;
        let key = PKey::private_key_from_pem(client_key_pem.as_bytes())
            .map_err(|error| js_err("PKey::private_key_from_pem failed", error))?;
        let cert_pubkey = cert.public_key().map_err(|error| {
            JsValue::from_str(&format!(
                "cert.public_key failed: {error}; providers={} cert_len={} cert_head={} cert_tail={}",
                openssl_provider_status(),
                client_cert_pem.len(),
                pem_head_line(&client_cert_pem),
                pem_tail_line(&client_cert_pem),
            ))
        })?;
        let cert_cn = cert_common_name(&cert);
        let cert_pub_alg = format!("{:?}", cert_pubkey.id());
        let key_alg = format!("{:?}", key.id());
        let key_matches_cert = cert_pubkey.public_eq(&key);

        let mut builder =
            SslContextBuilder::new(SslMethod::tls()).map_err(|error| js_err("SslContextBuilder::new failed", error))?;
        unsafe {
            // Match libimobiledevice OpenSSL behavior for newer OpenSSL branches.
            let options = ffi::SSL_OP_LEGACY_SERVER_CONNECT as u64;
            let _ = ffi::SSL_CTX_set_options(builder.as_ptr(), options);
        }
        builder.set_security_level(0);
        builder.set_verify(SslVerifyMode::NONE);
        let _ = builder.set_min_proto_version(Some(SslVersion::TLS1));
        builder.set_certificate(&cert).map_err(|error| {
            JsValue::from_str(&format!(
                "set_certificate failed: {error}; providers={} cert_cn={cert_cn} cert_pub_alg={cert_pub_alg} key_alg={key_alg} key_matches_cert={key_matches_cert} cert_len={} cert_head={} cert_tail={}",
                openssl_provider_status(),
                client_cert_pem.len(),
                pem_head_line(&client_cert_pem),
                pem_tail_line(&client_cert_pem),
            ))
        })?;
        builder
            .set_private_key(&key)
            .map_err(|error| js_err("set_private_key failed", error))?;
        builder
            .check_private_key()
            .map_err(|error| js_err("check_private_key failed", error))?;

        let context = builder.build();
        let mut ssl = Ssl::new(&context).map_err(|error| js_err("Ssl::new failed", error))?;
        ssl.set_connect_state();
        ssl.set_verify(SslVerifyMode::NONE);

        let io = PumpIo::new();
        let state = match ssl.connect(io) {
            Ok(stream) => TlsState::Ready(stream),
            Err(HandshakeError::WouldBlock(mid)) => TlsState::Handshaking(mid),
            Err(HandshakeError::Failure(mid)) => {
                return Err(JsValue::from_str(&format!(
                    "initial handshake failure: {}",
                    mid.error()
                )))
            }
            Err(HandshakeError::SetupFailure(error)) => {
                return Err(js_err("initial handshake setup failure", error))
            }
        };

        let mut client = OpensslClient {
            state: Some(state),
            tls_out: Vec::new(),
            plain_out: Vec::new(),
        };
        client.collect_tls_out();
        Ok(client)
    }

    pub fn is_handshaking(&self) -> bool {
        matches!(self.state, Some(TlsState::Handshaking(_)))
    }

    pub fn write_plaintext(&mut self, data: &[u8]) -> Result<(), JsValue> {
        let mut state = self.take_state()?;
        match &mut state {
            TlsState::Ready(stream) => {
                stream
                    .write_all(data)
                    .map_err(|error| JsValue::from_str(&format!("SSL write failed: {error}")))?;
            }
            TlsState::Handshaking(_) => {
                self.state = Some(state);
                return Err(JsValue::from_str("TLS handshake is not completed"));
            }
        }
        self.state = Some(state);
        self.collect_tls_out();
        Ok(())
    }

    pub fn feed_tls(&mut self, data: &[u8]) -> Result<(), JsValue> {
        let mut state = self.take_state()?;
        state.io_mut().push_inbound(data);

        state = advance_handshake(state)?;

        if let TlsState::Ready(stream) = &mut state {
            let mut buf = [0u8; 4096];
            loop {
                match stream.read(&mut buf) {
                    Ok(0) => break,
                    Ok(read) => self.plain_out.extend_from_slice(&buf[..read]),
                    Err(error) if error.kind() == ErrorKind::WouldBlock => break,
                    Err(error) => {
                        self.state = Some(state);
                        return Err(JsValue::from_str(&format!("SSL read failed: {error}")));
                    }
                }
            }
        }

        self.state = Some(state);
        self.collect_tls_out();
        Ok(())
    }

    pub fn take_tls_out(&mut self) -> Vec<u8> {
        mem::take(&mut self.tls_out)
    }

    pub fn take_plain_out(&mut self) -> Vec<u8> {
        mem::take(&mut self.plain_out)
    }
}

#[wasm_bindgen]
pub fn debug_runtime_stats() -> String {
    format!(
        "providers={}; qsort={} vsnprintf={} sscanf={} strtol={} strtoul={} getenv={} open={} read={} stat={} opendir={}",
        openssl_provider_status(),
        COUNT_QSORT.load(Ordering::Relaxed),
        COUNT_VSNPRINTF.load(Ordering::Relaxed),
        COUNT_SSCANF.load(Ordering::Relaxed),
        COUNT_STRTOL.load(Ordering::Relaxed),
        COUNT_STRTOUL.load(Ordering::Relaxed),
        COUNT_GETENV.load(Ordering::Relaxed),
        COUNT_OPEN.load(Ordering::Relaxed),
        COUNT_READ.load(Ordering::Relaxed),
        COUNT_STAT.load(Ordering::Relaxed),
        COUNT_OPENDIR.load(Ordering::Relaxed),
    )
}

impl OpensslClient {
    fn take_state(&mut self) -> Result<TlsState, JsValue> {
        self.state
            .take()
            .ok_or_else(|| JsValue::from_str("TLS state is unavailable"))
    }

    fn collect_tls_out(&mut self) {
        if let Some(state) = &mut self.state {
            let bytes = state.io_mut().take_outbound();
            if !bytes.is_empty() {
                self.tls_out.extend_from_slice(&bytes);
            }
        }
    }
}

impl TlsState {
    fn io_mut(&mut self) -> &mut PumpIo {
        match self {
            TlsState::Handshaking(mid) => mid.get_mut(),
            TlsState::Ready(stream) => stream.get_mut(),
        }
    }
}

fn advance_handshake(mut state: TlsState) -> Result<TlsState, JsValue> {
    loop {
        match state {
            TlsState::Handshaking(mid) => match mid.handshake() {
                Ok(stream) => {
                    state = TlsState::Ready(stream);
                }
                Err(HandshakeError::WouldBlock(next_mid)) => {
                    return Ok(TlsState::Handshaking(next_mid));
                }
                Err(HandshakeError::Failure(failed_mid)) => {
                    return Err(JsValue::from_str(&format!(
                        "handshake failure: {}",
                        failed_mid.error()
                    )))
                }
                Err(HandshakeError::SetupFailure(error)) => {
                    return Err(js_err("handshake setup failure", error))
                }
            },
            TlsState::Ready(_) => return Ok(state),
        }
    }
}

fn js_err(prefix: &str, error: ErrorStack) -> JsValue {
    JsValue::from_str(&format!("{prefix}: {error}"))
}

fn pem_head_line(pem: &str) -> &str {
    pem.lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("<empty>")
}

fn pem_tail_line(pem: &str) -> &str {
    pem.lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("<empty>")
}

fn cert_common_name(cert: &X509) -> String {
    cert.subject_name()
        .entries_by_nid(Nid::COMMONNAME)
        .next()
        .and_then(|entry| entry.data().as_utf8().ok().map(|v| v.to_string()))
        .unwrap_or_else(|| "<none>".to_string())
}

struct PumpIo {
    inbound: Vec<u8>,
    outbound: Vec<u8>,
}

impl PumpIo {
    fn new() -> Self {
        Self {
            inbound: Vec::new(),
            outbound: Vec::new(),
        }
    }

    fn push_inbound(&mut self, data: &[u8]) {
        if !data.is_empty() {
            self.inbound.extend_from_slice(data);
        }
    }

    fn take_outbound(&mut self) -> Vec<u8> {
        mem::take(&mut self.outbound)
    }
}

impl Read for PumpIo {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.inbound.is_empty() {
            return Err(std::io::Error::from(ErrorKind::WouldBlock));
        }
        let read_len = buf.len().min(self.inbound.len());
        buf[..read_len].copy_from_slice(&self.inbound[..read_len]);
        self.inbound.drain(..read_len);
        Ok(read_len)
    }
}

impl Write for PumpIo {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if !buf.is_empty() {
            self.outbound.extend_from_slice(buf);
        }
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[repr(C)]
struct AllocHeader {
    payload_size: usize,
    align: usize,
}

fn alloc_payload(size: usize, align: usize, zeroed: bool) -> *mut c_void {
    let safe_align = align.max(mem::align_of::<AllocHeader>()).max(8);
    let total_size = match size.checked_add(mem::size_of::<AllocHeader>()) {
        Some(value) => value,
        None => return ptr::null_mut(),
    };
    let layout = match Layout::from_size_align(total_size, safe_align) {
        Ok(value) => value,
        Err(_) => return ptr::null_mut(),
    };
    let raw = unsafe {
        if zeroed {
            alloc_zeroed(layout)
        } else {
            alloc(layout)
        }
    };
    if raw.is_null() {
        return ptr::null_mut();
    }
    unsafe {
        let header = raw as *mut AllocHeader;
        (*header).payload_size = size;
        (*header).align = safe_align;
        raw.add(mem::size_of::<AllocHeader>()) as *mut c_void
    }
}

unsafe fn header_from_payload(payload: *mut c_void) -> *mut AllocHeader {
    (payload as *mut u8).sub(mem::size_of::<AllocHeader>()) as *mut AllocHeader
}

unsafe fn c_strlen(ptr_in: *const c_char) -> usize {
    if ptr_in.is_null() {
        return 0;
    }
    let mut len = 0usize;
    let mut cursor = ptr_in;
    while *cursor != 0 {
        len += 1;
        cursor = cursor.add(1);
    }
    len
}

unsafe fn c_strcmp(a: *const c_char, b: *const c_char, limit: Option<usize>) -> c_int {
    let mut index = 0usize;
    loop {
        if let Some(max_len) = limit {
            if index >= max_len {
                return 0;
            }
        }
        let av = if a.is_null() { 0 } else { *a.add(index) as i32 };
        let bv = if b.is_null() { 0 } else { *b.add(index) as i32 };
        if av != bv {
            return av - bv;
        }
        if av == 0 {
            return 0;
        }
        index += 1;
    }
}

unsafe fn c_find_char(haystack: *const c_char, needle: c_int, from_end: bool) -> *mut c_char {
    if haystack.is_null() {
        return ptr::null_mut();
    }
    let n = (needle & 0xff) as u8;
    if from_end {
        let len = c_strlen(haystack);
        let mut index = len;
        loop {
            let value = *haystack.add(index) as u8;
            if value == n {
                return haystack.add(index) as *mut c_char;
            }
            if index == 0 {
                break;
            }
            index -= 1;
        }
        return ptr::null_mut();
    }
    let mut index = 0usize;
    loop {
        let value = *haystack.add(index) as u8;
        if value == n {
            return haystack.add(index) as *mut c_char;
        }
        if value == 0 {
            return ptr::null_mut();
        }
        index += 1;
    }
}

#[no_mangle]
pub extern "C" fn malloc(size: usize) -> *mut c_void {
    alloc_payload(size, 16, false)
}

#[no_mangle]
pub extern "C" fn calloc(count: usize, size: usize) -> *mut c_void {
    let total = match count.checked_mul(size) {
        Some(value) => value,
        None => return ptr::null_mut(),
    };
    alloc_payload(total, 16, true)
}

#[no_mangle]
pub extern "C" fn realloc(ptr_in: *mut c_void, size: usize) -> *mut c_void {
    if ptr_in.is_null() {
        return malloc(size);
    }
    unsafe {
        let old_header = header_from_payload(ptr_in);
        let old_payload_size = (*old_header).payload_size;
        let align = (*old_header).align;
        let old_total = old_payload_size + mem::size_of::<AllocHeader>();
        let new_total = match size.checked_add(mem::size_of::<AllocHeader>()) {
            Some(value) => value,
            None => return ptr::null_mut(),
        };
        let layout = match Layout::from_size_align(old_total, align) {
            Ok(value) => value,
            Err(_) => return ptr::null_mut(),
        };
        let new_raw = rust_realloc(old_header as *mut u8, layout, new_total);
        if new_raw.is_null() {
            return ptr::null_mut();
        }
        let new_header = new_raw as *mut AllocHeader;
        (*new_header).payload_size = size;
        (*new_header).align = align;
        new_raw.add(mem::size_of::<AllocHeader>()) as *mut c_void
    }
}

#[no_mangle]
pub extern "C" fn free(ptr_in: *mut c_void) {
    if ptr_in.is_null() {
        return;
    }
    unsafe {
        let header = header_from_payload(ptr_in);
        let payload_size = (*header).payload_size;
        let align = (*header).align;
        let total = payload_size + mem::size_of::<AllocHeader>();
        if let Ok(layout) = Layout::from_size_align(total, align) {
            dealloc(header as *mut u8, layout);
        }
    }
}

#[no_mangle]
pub extern "C" fn posix_memalign(out: *mut *mut c_void, align: usize, size: usize) -> c_int {
    if out.is_null() {
        return 22;
    }
    let ptr_out = alloc_payload(size, align.max(16), false);
    if ptr_out.is_null() {
        return 12;
    }
    unsafe {
        *out = ptr_out;
    }
    0
}

#[no_mangle]
pub extern "C" fn memchr(ptr_in: *const c_void, value: c_int, len: usize) -> *mut c_void {
    if ptr_in.is_null() {
        return ptr::null_mut();
    }
    let needle = (value & 0xff) as u8;
    unsafe {
        let bytes = std::slice::from_raw_parts(ptr_in as *const u8, len);
        for (index, byte) in bytes.iter().enumerate() {
            if *byte == needle {
                return (ptr_in as *const u8).add(index) as *mut c_void;
            }
        }
    }
    ptr::null_mut()
}

#[no_mangle]
pub extern "C" fn strcmp(a: *const c_char, b: *const c_char) -> c_int {
    unsafe { c_strcmp(a, b, None) }
}

#[no_mangle]
pub extern "C" fn strncmp(a: *const c_char, b: *const c_char, n: usize) -> c_int {
    unsafe { c_strcmp(a, b, Some(n)) }
}

#[no_mangle]
pub extern "C" fn strchr(haystack: *const c_char, needle: c_int) -> *mut c_char {
    unsafe { c_find_char(haystack, needle, false) }
}

#[no_mangle]
pub extern "C" fn strrchr(haystack: *const c_char, needle: c_int) -> *mut c_char {
    unsafe { c_find_char(haystack, needle, true) }
}

#[no_mangle]
pub extern "C" fn strcpy(dst: *mut c_char, src: *const c_char) -> *mut c_char {
    if dst.is_null() || src.is_null() {
        return dst;
    }
    unsafe {
        let mut index = 0usize;
        loop {
            let byte = *src.add(index);
            *dst.add(index) = byte;
            if byte == 0 {
                break;
            }
            index += 1;
        }
    }
    dst
}

#[no_mangle]
pub extern "C" fn strncpy(dst: *mut c_char, src: *const c_char, n: usize) -> *mut c_char {
    if dst.is_null() || src.is_null() {
        return dst;
    }
    unsafe {
        let mut index = 0usize;
        while index < n {
            let byte = *src.add(index);
            *dst.add(index) = byte;
            index += 1;
            if byte == 0 {
                break;
            }
        }
        while index < n {
            *dst.add(index) = 0;
            index += 1;
        }
    }
    dst
}

#[no_mangle]
pub extern "C" fn strstr(haystack: *const c_char, needle: *const c_char) -> *mut c_char {
    if haystack.is_null() || needle.is_null() {
        return ptr::null_mut();
    }
    unsafe {
        let needle_len = c_strlen(needle);
        if needle_len == 0 {
            return haystack as *mut c_char;
        }
        let hay_len = c_strlen(haystack);
        if hay_len < needle_len {
            return ptr::null_mut();
        }
        for start in 0..=(hay_len - needle_len) {
            if c_strcmp(haystack.add(start), needle, Some(needle_len)) == 0 {
                return haystack.add(start) as *mut c_char;
            }
        }
    }
    ptr::null_mut()
}

#[no_mangle]
pub extern "C" fn strpbrk(haystack: *const c_char, accept: *const c_char) -> *mut c_char {
    if haystack.is_null() || accept.is_null() {
        return ptr::null_mut();
    }
    unsafe {
        let mut index = 0usize;
        loop {
            let ch = *haystack.add(index);
            if ch == 0 {
                break;
            }
            if !c_find_char(accept, ch as c_int, false).is_null() {
                return haystack.add(index) as *mut c_char;
            }
            index += 1;
        }
    }
    ptr::null_mut()
}

#[no_mangle]
pub extern "C" fn strspn(s: *const c_char, accept: *const c_char) -> usize {
    if s.is_null() || accept.is_null() {
        return 0;
    }
    unsafe {
        let mut count = 0usize;
        loop {
            let ch = *s.add(count);
            if ch == 0 {
                return count;
            }
            if c_find_char(accept, ch as c_int, false).is_null() {
                return count;
            }
            count += 1;
        }
    }
}

#[no_mangle]
pub extern "C" fn strcspn(s: *const c_char, reject: *const c_char) -> usize {
    if s.is_null() || reject.is_null() {
        return 0;
    }
    unsafe {
        let mut count = 0usize;
        loop {
            let ch = *s.add(count);
            if ch == 0 {
                return count;
            }
            if !c_find_char(reject, ch as c_int, false).is_null() {
                return count;
            }
            count += 1;
        }
    }
}

#[no_mangle]
pub extern "C" fn atoi(s: *const c_char) -> c_int {
    strtol(s, ptr::null_mut(), 10) as c_int
}

#[no_mangle]
pub extern "C" fn strtol(s: *const c_char, endptr: *mut *mut c_char, base: c_int) -> c_long {
    bump(&COUNT_STRTOL);
    let (signed, value, parsed, end) = unsafe { parse_c_integer(s, base) };
    if !endptr.is_null() {
        unsafe {
            *endptr = if parsed { end as *mut c_char } else { s as *mut c_char };
        }
    }
    if !parsed {
        return 0;
    }

    if signed {
        let neg = value as i128;
        let v = -neg;
        if v < c_long::MIN as i128 {
            return c_long::MIN;
        }
        return v as c_long;
    }

    if value > c_long::MAX as u128 {
        return c_long::MAX;
    }
    value as c_long
}

#[no_mangle]
pub extern "C" fn strtoul(s: *const c_char, endptr: *mut *mut c_char, base: c_int) -> c_ulong {
    bump(&COUNT_STRTOUL);
    let (signed, value, parsed, end) = unsafe { parse_c_integer(s, base) };
    if !endptr.is_null() {
        unsafe {
            *endptr = if parsed { end as *mut c_char } else { s as *mut c_char };
        }
    }
    if !parsed {
        return 0;
    }
    if signed {
        let wrapped = (0u128).wrapping_sub(value) as u128;
        return wrapped as c_ulong;
    }
    if value > c_ulong::MAX as u128 {
        return c_ulong::MAX;
    }
    value as c_ulong
}

unsafe fn parse_c_integer(
    s: *const c_char,
    base_in: c_int,
) -> (bool, u128, bool, *const c_char) {
    if s.is_null() {
        return (false, 0, false, s);
    }
    let mut p = s as *const u8;

    while !p.is_null() {
        let ch = *p;
        if ch == b' ' || (b'\t'..=b'\r').contains(&ch) {
            p = p.add(1);
            continue;
        }
        break;
    }

    let mut negative = false;
    if !p.is_null() {
        match *p {
            b'-' => {
                negative = true;
                p = p.add(1);
            }
            b'+' => {
                p = p.add(1);
            }
            _ => {}
        }
    }

    let mut base = base_in as i32;
    if base == 0 {
        if *p == b'0' {
            let next = *p.add(1);
            if next == b'x' || next == b'X' {
                base = 16;
                p = p.add(2);
            } else {
                base = 8;
                p = p.add(1);
            }
        } else {
            base = 10;
        }
    } else if base == 16 {
        if *p == b'0' {
            let next = *p.add(1);
            if next == b'x' || next == b'X' {
                p = p.add(2);
            }
        }
    }

    if !(2..=36).contains(&base) {
        return (negative, 0, false, s);
    }

    let base_u = base as u128;
    let mut value: u128 = 0;
    let mut parsed = false;
    let mut cursor = p;
    loop {
        let ch = *cursor;
        if ch == 0 {
            break;
        }
        let digit = match ch {
            b'0'..=b'9' => (ch - b'0') as u32,
            b'a'..=b'z' => (ch - b'a' + 10) as u32,
            b'A'..=b'Z' => (ch - b'A' + 10) as u32,
            _ => break,
        };
        if digit >= base as u32 {
            break;
        }
        parsed = true;
        value = value
            .saturating_mul(base_u)
            .saturating_add(digit as u128);
        cursor = cursor.add(1);
    }

    if !parsed {
        return (negative, 0, false, s);
    }
    (negative, value, true, cursor as *const c_char)
}

#[no_mangle]
pub extern "C" fn tolower(value: c_int) -> c_int {
    if (65..=90).contains(&value) {
        value + 32
    } else {
        value
    }
}

#[no_mangle]
pub extern "C" fn qsort(
    base: *mut c_void,
    nmemb: usize,
    size: usize,
    compar: extern "C" fn(*const c_void, *const c_void) -> c_int,
) {
    bump(&COUNT_QSORT);
    if base.is_null() || size == 0 || nmemb < 2 {
        return;
    }
    unsafe {
        let base_ptr = base as *mut u8;
        let mut tmp = vec![0u8; size];
        for i in 1..nmemb {
            let mut j = i;
            while j > 0 {
                let left = base_ptr.add((j - 1) * size) as *const c_void;
                let right = base_ptr.add(j * size) as *const c_void;
                if compar(left, right) <= 0 {
                    break;
                }
                ptr::copy_nonoverlapping(base_ptr.add((j - 1) * size), tmp.as_mut_ptr(), size);
                ptr::copy(
                    base_ptr.add(j * size),
                    base_ptr.add((j - 1) * size),
                    size,
                );
                ptr::copy_nonoverlapping(tmp.as_ptr(), base_ptr.add(j * size), size);
                j -= 1;
            }
        }
    }
}

#[no_mangle]
pub extern "C" fn sscanf(_src: *const c_char, _format: *const c_char, _arg: *mut c_void) -> c_int {
    bump(&COUNT_SSCANF);
    0
}

#[no_mangle]
pub extern "C" fn getenv(_name: *const c_char) -> *mut c_char {
    bump(&COUNT_GETENV);
    ptr::null_mut()
}

static ERRNO_TEXT: &[u8] = b"error\0";

#[no_mangle]
pub extern "C" fn strerror(_errnum: c_int) -> *mut c_char {
    ERRNO_TEXT.as_ptr() as *mut c_char
}

#[no_mangle]
pub extern "C" fn getpid() -> c_int {
    1
}

#[no_mangle]
pub extern "C" fn abort() {
    panic!("abort called")
}

#[no_mangle]
pub extern "C" fn __cxa_atexit(
    _func: extern "C" fn(*mut c_void),
    _arg: *mut c_void,
    _dso: *mut c_void,
) -> c_int {
    0
}

#[no_mangle]
pub extern "C" fn time(out: *mut i64) -> i64 {
    let now = 0i64;
    if !out.is_null() {
        unsafe {
            *out = now;
        }
    }
    now
}

#[no_mangle]
pub extern "C" fn gettimeofday(tv: *mut c_void, _tz: *mut c_void) -> c_int {
    if tv.is_null() {
        return -1;
    }
    unsafe {
        let seconds = tv as *mut i64;
        let micros = seconds.add(1);
        *seconds = 0;
        *micros = 0;
    }
    0
}

#[no_mangle]
pub extern "C" fn clock_gettime(_clock_id: c_int, tp: *mut c_void) -> c_int {
    if tp.is_null() {
        return -1;
    }
    unsafe {
        let sec = tp as *mut i64;
        let nsec = sec.add(1);
        *sec = 0;
        *nsec = 0;
    }
    0
}

#[no_mangle]
pub extern "C" fn arc4random_buf(buf: *mut c_void, len: usize) {
    if buf.is_null() {
        return;
    }
    unsafe {
        let out = std::slice::from_raw_parts_mut(buf as *mut u8, len);
        if fill_random_with_webcrypto(out) {
            return;
        }

        // Fallback for non-browser runtime paths.
        let mut state = (ARC4_FALLBACK_SEED.fetch_add(0x7f4a7c15, Ordering::Relaxed) as u64)
            ^ ((out.as_ptr() as usize as u64) << 1)
            ^ (len as u64).wrapping_mul(0x9e3779b97f4a7c15);
        for byte in out.iter_mut() {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            *byte = (state & 0xff) as u8;
        }
    }
}

fn fill_random_with_webcrypto(out: &mut [u8]) -> bool {
    if out.is_empty() {
        return true;
    }
    if let Some(win) = window() {
        if let Ok(crypto) = win.crypto() {
            // Browser RNG source, equivalent to native secure random for this runtime.
            return crypto.get_random_values_with_u8_array(out).is_ok();
        }
    }
    false
}

#[no_mangle]
pub extern "C" fn getentropy(buf: *mut c_void, len: usize) -> c_int {
    arc4random_buf(buf, len);
    0
}

#[no_mangle]
pub extern "C" fn open(_path: *const c_char, _flags: c_int, _mode: c_int) -> c_int {
    bump(&COUNT_OPEN);
    -1
}

#[no_mangle]
pub extern "C" fn read(_fd: c_int, _buf: *mut c_void, _count: usize) -> c_int {
    bump(&COUNT_READ);
    -1
}

#[no_mangle]
pub extern "C" fn close(_fd: c_int) -> c_int {
    0
}

#[no_mangle]
pub extern "C" fn stat(_path: *const c_char, _out: *mut c_void) -> c_int {
    bump(&COUNT_STAT);
    -1
}

#[no_mangle]
pub extern "C" fn fstat(_fd: c_int, _out: *mut c_void) -> c_int {
    -1
}

#[no_mangle]
pub extern "C" fn opendir(_name: *const c_char) -> *mut c_void {
    bump(&COUNT_OPENDIR);
    ptr::null_mut()
}

#[no_mangle]
pub extern "C" fn readdir(_dir: *mut c_void) -> *mut c_void {
    ptr::null_mut()
}

#[no_mangle]
pub extern "C" fn closedir(_dir: *mut c_void) -> c_int {
    0
}

#[no_mangle]
pub extern "C" fn SSL_add_dir_cert_subjects_to_stack(_stack: *mut c_void, _dir: *const c_char) -> c_int {
    1
}
