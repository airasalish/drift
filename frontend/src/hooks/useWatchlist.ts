import { useCallback, useEffect, useRef, useState } from "react";
import { api, getActiveWatchlistId, setActiveWatchlistId, type BenchmarkOut } from "../api";
import type { Watchlist, WatchlistItem } from "../types";

const REFRESH_MS = 15_000;

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeWatchlistId, setActiveWatchlistIdState] = useState<number | null>(() => getActiveWatchlistId());
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
      // Load watchlists first
      const watchlistsData = await api.watchlists.list();
      setWatchlists(watchlistsData);

      // Determine which watchlist to use
      let targetWatchlistId = activeWatchlistId;
      if (!targetWatchlistId && watchlistsData.length > 0) {
        // If no active watchlist set, use the first one (default)
        targetWatchlistId = watchlistsData[0].id;
        setActiveWatchlistIdState(targetWatchlistId);
        setActiveWatchlistId(targetWatchlistId);
      }

      // Load items for the target watchlist
      let data: WatchlistItem[];
      let bench: BenchmarkOut | null;
      
      if (targetWatchlistId) {
        // Use multi-watchlist-aware API
        [data, bench] = await Promise.all([
          api.watchlists.listItems(targetWatchlistId),
          api.watchlists.benchmark(targetWatchlistId).catch(() => null),
        ]);
      } else {
        // Fall back to single-watchlist API for backward compatibility
        [data, bench] = await Promise.all([
          api.list(),
          api.benchmark().catch(() => null),
        ]);
      }

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
  }, [activeWatchlistId]);

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
          api.markSeenBeacon(item.id, activeWatchlistId || undefined);
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [activeWatchlistId]);

  async function add(symbol: string, note: string, companyName?: string) {
    try {
      if (activeWatchlistId) {
        await api.watchlists.addItem(activeWatchlistId, symbol, note, companyName);
      } else {
        await api.add(symbol, note, companyName);
      }
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to add symbol");
      throw e;
    }
  }

  async function remove(id: number) {
    try {
      if (activeWatchlistId) {
        await api.watchlists.removeItem(activeWatchlistId, id);
      } else {
        await api.remove(id);
      }
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to remove symbol");
      throw e;
    }
  }

  async function markSeen(id: number) {
    try {
      if (activeWatchlistId) {
        await api.watchlists.markSeenItem(activeWatchlistId, id);
      } else {
        await api.markSeen(id);
      }
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update");
      throw e;
    }
  }

  async function resetToSample() {
    try {
      if (activeWatchlistId) {
        await api.watchlists.resetToSample(activeWatchlistId);
      } else {
        await api.resetToSample();
      }
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to reset watchlist");
      throw e;
    }
  }

  async function updateNote(id: number, note: string) {
    try {
      if (activeWatchlistId) {
        await api.watchlists.updateItemNote(activeWatchlistId, id, note);
      } else {
        await api.updateNote(id, note);
      }
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to save");
      throw e;
    }
  }

  async function createWatchlist(name: string) {
    try {
      const newWatchlist = await api.watchlists.create(name);
      setError(null);
      await refresh();
      // Switch to the new watchlist
      setActiveWatchlistIdState(newWatchlist.id);
      setActiveWatchlistId(newWatchlist.id);
      return newWatchlist;
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create watchlist");
      throw e;
    }
  }

  async function renameWatchlist(id: number, name: string) {
    try {
      const updated = await api.watchlists.rename(id, name);
      setError(null);
      await refresh();
      return updated;
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to rename watchlist");
      throw e;
    }
  }

  async function deleteWatchlist(id: number) {
    try {
      await api.watchlists.delete(id);
      setError(null);
      // If we deleted the active watchlist, switch to another
      if (activeWatchlistId === id) {
        setActiveWatchlistIdState(null);
        setActiveWatchlistId(null);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete watchlist");
      throw e;
    }
  }

  function switchWatchlist(id: number) {
    setActiveWatchlistIdState(id);
    setActiveWatchlistId(id);
    refresh();
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
    watchlists,
    activeWatchlistId,
    createWatchlist,
    renameWatchlist,
    deleteWatchlist,
    switchWatchlist,
  };
}
