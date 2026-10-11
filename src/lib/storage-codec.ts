import { safeSetItem } from "./safe-storage";

export interface StorageCodec<T> {
  decode(stored: string | null): T | null;
  encode(value: T): string;
  // Pruning affects storage only; live RPC or UI state can remain complete.
  prune?(value: T): T;
}

export function readStorageRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function decodeStoredValue<T>(stored: string | null, codec: StorageCodec<T>): T | null {
  try {
    return codec.decode(stored);
  } catch {
    return null;
  }
}

export function readStoredValue<T>(key: string, codec: StorageCodec<T>): T | null {
  try {
    return codec.decode(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writeStoredValue<T>(key: string, codec: StorageCodec<T>, value: T): boolean {
  return safeSetItem(key, codec.encode(codec.prune ? codec.prune(value) : value));
}
