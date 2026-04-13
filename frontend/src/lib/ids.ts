export function accountKey(appleId: string, teamId: string): string {
  return `${appleId.trim().toLowerCase()}::${teamId.trim().toUpperCase()}`;
}

export function buildPreparedSourceKey(file: File, udid: string): string {
  return `${file.name}:${file.size}:${file.lastModified}:${udid}`;
}

export function shortToken(value: string): string {
  const text = value.trim();
  if (text.length <= 10) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

export function normalizePem(value: string): string {
  const normalized = value.replace(/\0/g, '').replace(/\r\n/g, '\n').trim();
  return `${normalized}\n`;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
