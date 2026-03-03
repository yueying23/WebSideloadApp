fn main() {
    cc::Build::new()
        .file("src/c_shim/vsnprintf_shim.c")
        .flag_if_supported("-std=c99")
        .compile("vsnprintf_shim");
}
