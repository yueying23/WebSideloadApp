#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>

typedef enum {
    LEN_DEFAULT = 0,
    LEN_HH,
    LEN_H,
    LEN_L,
    LEN_LL,
    LEN_Z,
    LEN_T,
    LEN_J
} length_mod_t;

static void out_char(char *dst, size_t size, size_t *written, char ch) {
    if (*written + 1 < size && dst != NULL) {
        dst[*written] = ch;
    }
    *written += 1;
}

static void out_str(char *dst, size_t size, size_t *written, const char *str) {
    if (!str) {
        str = "(null)";
    }
    while (*str) {
        out_char(dst, size, written, *str++);
    }
}

static void out_uint(
    char *dst,
    size_t size,
    size_t *written,
    unsigned long long value,
    unsigned base,
    int uppercase
) {
    char buf[64];
    size_t i = 0;
    const char *digits = uppercase ? "0123456789ABCDEF" : "0123456789abcdef";

    if (base < 2 || base > 16) {
        return;
    }
    if (value == 0) {
        out_char(dst, size, written, '0');
        return;
    }
    while (value != 0 && i < sizeof(buf)) {
        buf[i++] = digits[value % base];
        value /= base;
    }
    while (i > 0) {
        out_char(dst, size, written, buf[--i]);
    }
}

static long long read_signed_arg(va_list *ap, length_mod_t len) {
    switch (len) {
        case LEN_HH: return (signed char)va_arg(*ap, int);
        case LEN_H: return (short)va_arg(*ap, int);
        case LEN_L: return va_arg(*ap, long);
        case LEN_LL: return va_arg(*ap, long long);
        case LEN_Z: return (long long)va_arg(*ap, size_t);
        case LEN_T: return (long long)va_arg(*ap, ptrdiff_t);
        case LEN_J: return (long long)va_arg(*ap, intmax_t);
        case LEN_DEFAULT:
        default:
            return va_arg(*ap, int);
    }
}

static unsigned long long read_unsigned_arg(va_list *ap, length_mod_t len) {
    switch (len) {
        case LEN_HH: return (unsigned char)va_arg(*ap, unsigned int);
        case LEN_H: return (unsigned short)va_arg(*ap, unsigned int);
        case LEN_L: return va_arg(*ap, unsigned long);
        case LEN_LL: return va_arg(*ap, unsigned long long);
        case LEN_Z: return (unsigned long long)va_arg(*ap, size_t);
        case LEN_T: return (unsigned long long)va_arg(*ap, ptrdiff_t);
        case LEN_J: return (unsigned long long)va_arg(*ap, uintmax_t);
        case LEN_DEFAULT:
        default:
            return va_arg(*ap, unsigned int);
    }
}

int vsnprintf(char *dst, size_t size, const char *format, va_list ap) {
    size_t written = 0;

    if (!format) {
        if (dst != NULL && size > 0) {
            dst[0] = '\0';
        }
        return 0;
    }

    while (*format) {
        if (*format != '%') {
            out_char(dst, size, &written, *format++);
            continue;
        }
        format++;
        if (*format == '%') {
            out_char(dst, size, &written, '%');
            format++;
            continue;
        }

        while (*format == '-' || *format == '+' || *format == ' ' || *format == '#' || *format == '0') {
            format++;
        }

        if (*format == '*') {
            (void)va_arg(ap, int);
            format++;
        } else {
            while (*format >= '0' && *format <= '9') {
                format++;
            }
        }

        if (*format == '.') {
            format++;
            if (*format == '*') {
                (void)va_arg(ap, int);
                format++;
            } else {
                while (*format >= '0' && *format <= '9') {
                    format++;
                }
            }
        }

        length_mod_t len = LEN_DEFAULT;
        if (*format == 'h') {
            format++;
            len = (*format == 'h') ? (format++, LEN_HH) : LEN_H;
        } else if (*format == 'l') {
            format++;
            len = (*format == 'l') ? (format++, LEN_LL) : LEN_L;
        } else if (*format == 'z') {
            len = LEN_Z;
            format++;
        } else if (*format == 't') {
            len = LEN_T;
            format++;
        } else if (*format == 'j') {
            len = LEN_J;
            format++;
        }

        switch (*format) {
            case 'c': {
                int ch = va_arg(ap, int);
                out_char(dst, size, &written, (char)ch);
                break;
            }
            case 's': {
                const char *str = va_arg(ap, const char *);
                out_str(dst, size, &written, str);
                break;
            }
            case 'd':
            case 'i': {
                long long value = read_signed_arg(&ap, len);
                unsigned long long mag = (value < 0)
                    ? (unsigned long long)(-(value + 1)) + 1ULL
                    : (unsigned long long)value;
                if (value < 0) {
                    out_char(dst, size, &written, '-');
                }
                out_uint(dst, size, &written, mag, 10, 0);
                break;
            }
            case 'u': {
                unsigned long long value = read_unsigned_arg(&ap, len);
                out_uint(dst, size, &written, value, 10, 0);
                break;
            }
            case 'x': {
                unsigned long long value = read_unsigned_arg(&ap, len);
                out_uint(dst, size, &written, value, 16, 0);
                break;
            }
            case 'X': {
                unsigned long long value = read_unsigned_arg(&ap, len);
                out_uint(dst, size, &written, value, 16, 1);
                break;
            }
            case 'o': {
                unsigned long long value = read_unsigned_arg(&ap, len);
                out_uint(dst, size, &written, value, 8, 0);
                break;
            }
            case 'p': {
                uintptr_t value = (uintptr_t)va_arg(ap, void *);
                out_str(dst, size, &written, "0x");
                out_uint(dst, size, &written, (unsigned long long)value, 16, 0);
                break;
            }
            default: {
                out_char(dst, size, &written, '%');
                if (*format) {
                    out_char(dst, size, &written, *format);
                }
                break;
            }
        }

        if (*format) {
            format++;
        }
    }

    if (dst != NULL && size > 0) {
        size_t end = (written < size) ? written : (size - 1);
        dst[end] = '\0';
    }
    return (int)written;
}
