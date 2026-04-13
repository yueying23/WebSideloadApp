import { installIpaViaInstProxy, sanitizeIpaFileName, type DirectUsbMuxClient } from 'webmuxd';

export interface InstallRequest {
  client: DirectUsbMuxClient;
  signedFile: File;
  log: (msg: string) => void;
}

export async function installFlow(req: InstallRequest): Promise<void> {
  req.log('install: uploading and installing...');
  const bytes = new Uint8Array(await req.signedFile.arrayBuffer());
  const safeName = sanitizeIpaFileName(req.signedFile.name);
  await installIpaViaInstProxy(req.client, bytes, safeName, req.log);
  req.log('install: complete');
}
