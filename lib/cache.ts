/**
 * Simple module-level cache with localStorage persistence.
 * Data tetap tersedia sepanjang browser tab terbuka.
 * Kalau browser ditutup, data ter-restore dari localStorage.
 */

type CacheEntry<T> = {
  data: T;
  ts: number;
};

// Bump version (v2) untuk paksa invalidate semua cache lama saat schema/source berubah.
// Cache lama "dashboard_cache_*" jadi orphan, fetch ulang otomatis dari DB.
const CACHE_PREFIX = "dashboard_cache_v2_";
const MEMORY_CACHE = new Map<string, CacheEntry<unknown>>();

// Default TTL: 5 menit. Setelah ini data dianggap "stale" (butuh refresh background)
// Tapi stale data tetap ditampilkan sambil fetch ulang (stale-while-revalidate).
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function getCached<T>(key: string): { data: T | null; age: number } {
  // Coba dari memory dulu (fastest)
  const mem = MEMORY_CACHE.get(key) as CacheEntry<T> | undefined;
  if (mem) return { data: mem.data, age: Date.now() - mem.ts };

  // Fallback: localStorage
  if (typeof window === "undefined") return { data: null, age: Infinity };
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return { data: null, age: Infinity };
    const entry = JSON.parse(raw) as CacheEntry<T>;
    MEMORY_CACHE.set(key, entry);
    return { data: entry.data, age: Date.now() - entry.ts };
  } catch {
    return { data: null, age: Infinity };
  }
}

export function setCached<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, ts: Date.now() };
  MEMORY_CACHE.set(key, entry);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage penuh — skip persistence tapi memory tetap jalan
  }
}

export function invalidateCache(keyOrPrefix: string, prefix = false): void {
  if (prefix) {
    // Hapus semua key yg start dengan prefix
    for (const k of MEMORY_CACHE.keys()) {
      if (k.startsWith(keyOrPrefix)) MEMORY_CACHE.delete(k);
    }
    if (typeof window !== "undefined") {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith(CACHE_PREFIX + keyOrPrefix)) localStorage.removeItem(k);
      }
    }
  } else {
    MEMORY_CACHE.delete(keyOrPrefix);
    if (typeof window !== "undefined") {
      localStorage.removeItem(CACHE_PREFIX + keyOrPrefix);
    }
  }
}

export function clearAllCache(): void {
  MEMORY_CACHE.clear();
  if (typeof window === "undefined") return;
  const keys = Object.keys(localStorage);
  for (const k of keys) {
    if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
  }
}
