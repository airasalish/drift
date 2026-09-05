import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BenchmarkOut } from "../api";
import type { WatchlistItem } from "../types";

const REFRESH_MS = 15_000;

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const itemsRef = useRef<WatchlistItem[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetCountdown() {
    setCountdown(REFRESH_MS / 1000);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c <= 1 ? REFRESH_MS / 1000 : c - 1));
    }, 1000);
  }

  const refresh = useCallback(async () => {
    try {
      const [data, bench] = await Promise.all([
        api.list(),
        // context-only -- never let a benchmark hiccup block the core feed
        api.benchmark().catch(() => null),
      ]);
      setItems(data);
      itemsRef.current = data;
      setBenchmark(bench);
      setError(null);
      setLastRefreshedAt(new Date());
      resetCountdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      clearInterval(id);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [refresh]);

  // auto-mark-seen on tab hide: only for items currently in the attention
  // feed -- you had it in front of you, leaving is a real acknowledgment.
  // Deliberately NOT for every never-viewed item: that used to silently
  // establish a 0%-change baseline for anything you'd just added the
  // moment you switched tabs for any reason, before you'd ever actually
  // looked at it -- which made "since last view" read as 0% across the
  // whole watchlist and defeated the entire point of tracking real drift.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== "hidden") return;
      for (const item of itemsRef.current) {
        if (item.has_attention) {
          api.markSeenBeacon(item.id);
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  async function add(symbol: string, note: string, companyName?: string) {
    try {
      await api.add(symbol, note, companyName);
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to add symbol");
      throw e;
    }
  }

  async function remove(id: number) {
    try {
      await api.remove(id);
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to remove symbol");
      throw e;
    }
  }

  async function markSeen(id: number) {
    try {
      await api.markSeen(id);
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update");
      throw e;
    }
  }

  async function resetToSample() {
    try {
      await api.resetToSample();
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to reset watchlist");
      throw e;
    }
  }

  async function updateNote(id: number, note: string) {
    try {
      await api.updateNote(id, note);
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to save");
      throw e;
    }
  }

  return {
    items,
    benchmark,
    loading,
    error,
    lastRefreshedAt,
    countdown,
    refresh,
    add,
    remove,
    markSeen,
    updateNote,
    resetToSample,
  };
}
