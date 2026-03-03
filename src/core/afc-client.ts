import { LockdownClient } from "./lockdown-client"

export interface AfcEntry {
  path: string
  size?: number
  type?: string
}

export class AfcClient {
  private readonly lockdown: LockdownClient

  constructor(lockdown: LockdownClient) {
    this.lockdown = lockdown
  }

  async connect(): Promise<void> {
    await this.lockdown.startService("com.apple.afc")
  }

  listDirectory(_path: string): Promise<AfcEntry[]> {
    return Promise.reject(new Error("AFC listDirectory is not implemented yet"))
  }

  readFile(_path: string): Promise<Uint8Array> {
    return Promise.reject(new Error("AFC readFile is not implemented yet"))
  }

  writeFile(_path: string, _data: Uint8Array): Promise<void> {
    return Promise.reject(new Error("AFC writeFile is not implemented yet"))
  }
}
