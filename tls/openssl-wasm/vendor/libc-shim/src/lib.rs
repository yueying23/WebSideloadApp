#![no_std]
#![allow(non_camel_case_types)]

pub use core::ffi::{
    c_char, c_double, c_float, c_int, c_long, c_longlong, c_schar, c_short, c_uchar, c_uint,
    c_ulong, c_ulonglong, c_ushort, c_void,
};

pub type intptr_t = isize;
pub type uintptr_t = usize;
pub type ptrdiff_t = isize;
pub type size_t = usize;
pub type ssize_t = isize;
pub type time_t = i64;
pub type suseconds_t = i64;

#[repr(C)]
pub struct FILE {
    _private: [u8; 0],
}

#[repr(C)]
pub struct tm {
    _private: [u8; 0],
}

#[repr(C)]
pub struct timeval {
    pub tv_sec: time_t,
    pub tv_usec: suseconds_t,
}

pub unsafe fn pthread_self() -> usize {
    1
}

pub unsafe fn strlen(mut ptr: *const c_char) -> size_t {
    let mut len: size_t = 0;
    while !ptr.is_null() && *ptr != 0 {
        len += 1;
        ptr = ptr.add(1);
    }
    len
}
