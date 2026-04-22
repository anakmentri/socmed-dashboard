"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getCached, setCached, DEFAULT_TTL_MS } from "@/lib/cache";

type UseCachedDataOptions<T> = {
  key: string;
  fetcher: () => Promise<T>;
  ttl?: number;
  revalidateOnFocus?: boolean;
  // Kalau true, hasil fetch yg "kosong" tidak akan menimpa cache lama yg lebih banyak
  preserveOnEmpty?: boolean;
};

// Module-level: dedup in-flight requests across components
const inFlight = new Map<string, Promise<unknown>>();

function isLikelyEmpty<T>(value: T): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function isCountedSmaller<T>(fresh: T, prev: T | null): boolean {
  if (!prev) return false;
  if (Array.isArray(fresh) && Array.isArray(prev)) {
    return fresh.length < prev.length;
  }
  return false;
}

/**
 * Stale-while-revalidate cache hook dengan safeguards:
 * - In-flight dedup: revalidate berbarengan share 1 promise
 * - preserveOnEmpty: kalau fresh result kosong tapi cache lama ada isi → JANGAN overwrite
 * - Error fallback: tetap pakai cache lama, tidak set null
 * - Refresh on focus
 * - Refresh on visibility change (tab balik aktif)
 */
export function useCachedData<T>({
  key,
  fetcher,
  ttl = DEFAULT_TTL_MS,
  revalidateOnFocus = true,
  preserveOnEmpty = true,
}: UseCachedDataOptions<T>) {
  const [data, setData] = useState<T | null>(() => getCached<T>(key).data);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const revalidate = useCallback(async (): Promise<T | null> => {
    // Dedup: kalau ada request berjalan utk key yg sama, share promise
    const existing = inFlight.get(key);
    if (existing) {
      return (existing as Promise<T | null>).catch(() => getCached<T>(key).data);
    }

    const cached = getCached<T>(key);
    if (cached.data === null) setLoading(true);

    const promise = (async (): Promise<T | null> => {
      try {
        const fresh = await fetcherRef.current();

        // Safeguard 1: kalau hasil empty tapi cache punya data → JANGAN overwrite
        if (preserveOnEmpty && isLikelyEmpty(fresh) && !isLikelyEmpty(cached.data as T)) {
          // Mungkin glitch jaringan — pertahankan cache lama
          setError(null);
          setLoading(false);
          return cached.data;
        }

        // Safeguard 2: warning kalau hasil mendadak shrink drastis (>50%)
        // Ini bisa indikasi error filter/RLS, tapi tetap save dengan logging
        if (
          isCountedSmaller(fresh, cached.data) &&
          Array.isArray(fresh) &&
          Array.isArray(cached.data) &&
          fresh.length < cached.data.length * 0.5 &&
          cached.data.length > 5
        ) {
          // Skip update — kemungkinan glitch
          setError(null);
          setLoading(false);
          return cached.data;
        }

        setCached(key, fresh);
        setData(fresh);
        setError(null);
        return fresh;
      } catch (e) {
        setError(e instanceof Error ? e : new Error("Fetch error"));
        // Pertahankan data lama on error
        return cached.data;
      } finally {
        setLoading(false);
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, promise);
    return promise;
  }, [key, preserveOnEmpty]);

  // Initial load + revalidate setelah hydrate
  useEffect(() => {
    revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Revalidate saat tab kembali fokus
  useEffect(() => {
    if (!revalidateOnFocus) return;
    const onFocus = () => {
      const cached = getCached<T>(key);
      if (cached.age > ttl) revalidate();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        const cached = getCached<T>(key);
        if (cached.age > ttl) revalidate();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ttl, revalidateOnFocus]);

  // Optimistic update — pakai ini setelah create/update/delete biar UI instant
  const mutate = useCallback(
    (newData: T | ((prev: T | null) => T)) => {
      const value =
        typeof newData === "function"
          ? (newData as (prev: T | null) => T)(getCached<T>(key).data)
          : newData;
      setCached(key, value);
      setData(value);
    },
    [key]
  );

  return {
    data,
    loading,
    error,
    refresh: () => revalidate(),
    mutate,
    isStale: data !== null && getCached<T>(key).age > ttl,
  };
}
