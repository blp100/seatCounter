"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";

type TableRow = {
  id: string;
  name: string;
  area: string | null;
  is_active: boolean;
};

const PIN_STORAGE_KEY = "seatCounter:testPinVerified";
const FALLBACK_AREA_LABEL = "Other";

export default function HomePage() {
  const router = useRouter();

  const testPin = (process.env.NEXT_PUBLIC_TEST_PIN ?? "").trim();
  const pinRequired = testPin.length > 0;

  const [pinVerified, setPinVerified] = useState<boolean>(() => !pinRequired);
  const [pinInitialized, setPinInitialized] = useState<boolean>(
    () => !pinRequired
  );
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    if (!pinRequired) return;
    const stored = sessionStorage.getItem(PIN_STORAGE_KEY);
    setPinVerified(stored === "true");
    setPinInitialized(true);
  }, [pinRequired]);

  const handlePinSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!pinRequired) return;

      const value = pinValue.trim();
      if (value === testPin) {
        sessionStorage.setItem(PIN_STORAGE_KEY, "true");
        setPinVerified(true);
        setPinInitialized(true);
        setPinValue("");
        setPinError(null);
      } else {
        setPinError("Incorrect PIN. Try again.");
      }
    },
    [pinRequired, pinValue, testPin]
  );

  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: supabaseError } = await supabase
        .from("tables")
        .select("id, name, area, is_active")
        .eq("is_active", true)
        .order("area", { ascending: true, nullsFirst: true })
        .order("name", { ascending: true });

      if (supabaseError) throw supabaseError;

      setTables((data as TableRow[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tables.");
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pinRequired && (!pinInitialized || !pinVerified)) return;
    void loadTables();
  }, [pinRequired, pinInitialized, pinVerified, loadTables]);

  const handleRefresh = useCallback(() => {
    void loadTables();
  }, [loadTables]);

  const handleSelectTable = useCallback(
    (tableId: string) => {
      router.push(`/t/${tableId}`);
    },
    [router]
  );

  const normalizedSearch = search.trim().toLowerCase();
  const groupedTables = useMemo(() => {
    const filtered = normalizedSearch
      ? tables.filter((table) => {
          const name = table.name.toLowerCase();
          const area = (table.area ?? "").toLowerCase();
          return (
            name.includes(normalizedSearch) || area.includes(normalizedSearch)
          );
        })
      : tables;

    const map = new Map<string, TableRow[]>();
    for (const table of filtered) {
      const areaLabel = table.area?.trim() || FALLBACK_AREA_LABEL;
      const existing = map.get(areaLabel);
      if (existing) {
        existing.push(table);
      } else {
        map.set(areaLabel, [table]);
      }
    }
    return Array.from(map.entries());
  }, [tables, normalizedSearch]);

  if (pinRequired && !pinInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
        <div className="text-lg text-slate-200">Loading…</div>
      </div>
    );
  }

  if (pinRequired && !pinVerified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
        <form
          onSubmit={handlePinSubmit}
          className="w-full max-w-md space-y-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-lg"
        >
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold text-white">
              Enter Test PIN
            </h1>
            <p className="text-sm text-slate-400">
              This environment is protected. Please enter the test PIN to
              continue.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-left text-sm font-medium text-slate-300">
              PIN
            </label>
            <input
              type="password"
              value={pinValue}
              onChange={(event) => {
                setPinValue(event.target.value);
                if (pinError) setPinError(null);
              }}
              className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-lg text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
              autoFocus
              inputMode="numeric"
            />
            {pinError ? (
              <p className="text-sm text-rose-400">{pinError}</p>
            ) : null}
          </div>
          <button
            type="submit"
            className="h-12 w-full rounded-2xl bg-indigo-500 text-lg font-semibold text-white transition hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-white">Select a Table</h1>
          <p className="text-base text-slate-400">
            Choose a table to view or update its current session.
          </p>
        </header>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="flex w-full max-w-md flex-col gap-2">
            <span className="text-sm font-medium uppercase tracking-wide text-slate-400">
              Search
            </span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter by table name or area"
              className="h-12 rounded-2xl border border-slate-800 bg-slate-900 px-4 text-lg text-white shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
            />
          </label>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="h-12 w-full max-w-[160px] rounded-2xl bg-indigo-500 text-lg font-semibold text-white shadow-sm transition hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/70 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-rose-200">
            <p className="text-sm font-medium">Failed to load tables.</p>
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        ) : null}
        {loading && tables.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-20 text-lg text-slate-300">
            Loading tables…
          </div>
        ) : null}
        {!loading && groupedTables.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-300">
            No tables match your filters.
          </div>
        ) : (
          groupedTables.map(([area, tablesInArea]) => (
            <section key={area} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-2xl font-semibold text-white">{area}</h2>
                <span className="text-sm text-slate-400">
                  {tablesInArea.length} table
                  {tablesInArea.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tablesInArea.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => handleSelectTable(table.id)}
                    className="flex h-32 flex-col justify-between rounded-3xl border border-slate-800 bg-slate-900 px-6 py-5 text-left shadow-sm transition hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/70 active:scale-[.98]"
                  >
                    <span className="text-2xl font-semibold text-white">
                      {table.name}
                    </span>
                    <span className="text-sm text-slate-400">Tap to open</span>
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
