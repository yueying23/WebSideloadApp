import { cp, mkdir, rm } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = dirname(fileURLToPath(import.meta.url))
const sourceDir = resolve(packageDir, "src")
const distDir = resolve(packageDir, "dist")

await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })
await cp(sourceDir, distDir, { recursive: true })
