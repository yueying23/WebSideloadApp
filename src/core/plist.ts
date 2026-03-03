export type PlistValue =
  | string
  | number
  | boolean
  | Uint8Array
  | ArrayBuffer
  | PlistValue[]
  | { [key: string]: PlistValue }

const XML_HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
  '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">'

export const encodePlistXml = (value: { [key: string]: PlistValue }): Uint8Array => {
  const xml = `${XML_HEADER}<plist version="1.0">${encodeValue(value)}</plist>`
  return encodeUtf8(xml)
}

const encodeValue = (value: PlistValue): string => {
  if (typeof value === "string") {
    return `<string>${escapeXml(value)}</string>`
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return `<integer>${String(value)}</integer>`
    }
    return `<real>${String(value)}</real>`
  }
  if (typeof value === "boolean") {
    return value ? "<true/>" : "<false/>"
  }
  if (value instanceof Uint8Array) {
    return `<data>${encodeBase64(value)}</data>`
  }
  if (value instanceof ArrayBuffer) {
    return `<data>${encodeBase64(new Uint8Array(value))}</data>`
  }
  if (Array.isArray(value)) {
    let out = "<array>"
    for (const item of value) {
      out += encodeValue(item)
    }
    out += "</array>"
    return out
  }
  if (value && typeof value === "object") {
    let out = "<dict>"
    for (const [key, objectValue] of Object.entries(value)) {
      out += `<key>${escapeXml(key)}</key>${encodeValue(objectValue)}`
    }
    out += "</dict>"
    return out
  }
  throw new Error(`Unsupported plist value type: ${String(value)}`)
}

const escapeXml = (input: string): string => {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

const encodeBase64 = (value: Uint8Array): string => {
  if (typeof btoa === "function") {
    let binary = ""
    for (const byte of value) {
      binary += String.fromCharCode(byte)
    }
    return btoa(binary)
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value).toString("base64")
  }
  throw new Error("No base64 implementation is available in this environment")
}

const encodeUtf8 = (value: string): Uint8Array => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value)
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "utf8"))
  }
  throw new Error("No UTF-8 encoder is available in this environment")
}
