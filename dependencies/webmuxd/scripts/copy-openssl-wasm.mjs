import { cp, mkdir, rm } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(scriptDir, "..")
const workspaceRootDir = resolve(packageDir, "../..")
const sourceDir = resolve(workspaceRootDir, "wasm/openssl")
const targetDir = resolve(packageDir, "lib/openssl-wasm")
const directoriesToCopy = ["dist", "binary"]

await rm(targetDir, { recursive: true, force: true })
await mkdir(targetDir, { recursive: true })

for (const directoryName of directoriesToCopy) {
  await cp(resolve(sourceDir, directoryName), resolve(targetDir, directoryName), {
    recursive: true,
  })
}
