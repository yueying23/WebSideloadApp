import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 22+ ships an experimental `localStorage` global that lacks a working
// `clear()` (it requires a `--localstorage-file=` flag to be fully wired).
// Happy-dom's Window.localStorage is shadowed by that stub. Replace it with a
// plain in-memory implementation so tests are deterministic.
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key) ?? null : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

function installStorage(name: 'localStorage' | 'sessionStorage'): void {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, name, { configurable: true, value: storage });
  Object.defineProperty(window, name, { configurable: true, value: storage });
}

installStorage('localStorage');
installStorage('sessionStorage');

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
