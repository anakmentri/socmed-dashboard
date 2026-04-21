"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getCached, setCached, DEFAULT_TTL_MS } from "@/lib/cache";

type UseCachedDataOptions<T> = {
  key: string;
  fetcher: () => Promise<T>;
  ttl?: number;
  // Auto-revalidate saat window jadi focus (user balik ke tab)
  revalidateOnFocus?: boolean;
};

/**
 * Hook untuk load data dengan cache.
 *
 * Cara kerja:
 * 1. Saat mount: tampilkan data dari cache SEKALI JALAN (instant, 0 loading)
 * 2. Kalau cache masih fresh (< TTL) → done, tidak fetch ulang
 * 3. Kalau cache stale atau tidak ada → fetch di background, update UI
 * 4. Saat fetch selesai → update cache + UI
 */
export function useCachedData<T>({
  key,
  fetcher,
  ttl = DEFAULT_TTL_MS,
  revalidateOnFocus = true,
}: UseCachedDataOptions<T>) {
  const [data, setData] = useState<T | null>(() => getCached<T>(key).data);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const revalidate = useCallback(
    async (force = false) => {
      const cached = getCached<T>(key);
      // Kalau data masih fresh dan tidak force, skip
      if (!force && cached.data !== null && cached.age < ttl) {
        return cached.data;
      }
      // Kalau tidak ada cache sama sekali, tampilkan loading
      if (cached.data === null) setLoading(true);
      try {
        const fresh = await fetcherRef.current();
        setCached(key, fresh);
        setData(fresh);
        setError(null);
        return fresh;
      } catch (e) {
        setError(e instanceof Error ? e : new Error("Fetch error"));
        return cached.data; // tetap pakai cache lama kalau gagal
      } finally {
        setLoading(false);
      }
    },
    [key, ttl]
  );

  // Initial load + background revalidation
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
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ttl, revalidateOnFocus]);

  const mutate = useCallback(
    (newData: T | ((prev: T | null) => T)) => {
      const value =
        typeof newData === "function"
          ? (newData as (prev: T | null) => T)(data)
          : newData;
      setCached(key, value);
      setData(value);
    },
    [key, data]
  );

  return {
    data,
    loading,
    error,
    refresh: () => revalidate(true),
    mutate,
    // isStale: cache lebih tua dari TTL
    isStale: data !== null && getCached<T>(key).age > ttl,
  };
}
