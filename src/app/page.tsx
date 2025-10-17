"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Input } from "@/ui/Input";
import { font } from "@/ui/theme";

type TableRow = {
  id: string;
  name: string;
  area: string | null;
  is_active: boolean;
};

type TicketRow = {
  id: string;
  ended_at: string | null;
  sessions:
    | {
        table_id: string | null;
        closed_at: string | null;
      }
    | Array<{
        table_id: string | null;
        closed_at: string | null;
      }>
    | null;
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
  const [openTicketCounts, setOpenTicketCounts] = useState<Map<string, number>>(
    () => new Map<string, number>()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tablesResponse, ticketsResponse] = await Promise.all([
        supabase
          .from("tables")
          .select("id, name, area, is_active")
          .eq("is_active", true)
          .order("area", { ascending: true, nullsFirst: true })
          .order("name", { ascending: true }),
        supabase
          .from("tickets")
          .select("id, ended_at, sessions!inner(table_id, closed_at)")
          .is("ended_at", null)
          .is("sessions.closed_at", null),
      ]);

      if (tablesResponse.error) throw tablesResponse.error;
      if (ticketsResponse.error) throw ticketsResponse.error;

      const counts = new Map<string, number>();
      (ticketsResponse.data as TicketRow[] | null)?.forEach((ticket) => {
        const sessionData = ticket.sessions;
        const tableId = Array.isArray(sessionData)
          ? sessionData[0]?.table_id
          : sessionData?.table_id;
        const sessionClosed = Array.isArray(sessionData)
          ? sessionData[0]?.closed_at
          : sessionData?.closed_at;
        if (!tableId || sessionClosed) return;
        const key = String(tableId);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });

      setTables((tablesResponse.data as TableRow[]) ?? []);
      setOpenTicketCounts(counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tables.");
      setTables([]);
      setOpenTicketCounts(new Map<string, number>());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pinRequired && (!pinInitialized || !pinVerified)) return;
    void loadTables();
  }, [pinRequired, pinInitialized, pinVerified, loadTables]);

  useEffect(() => {
    if (pinRequired && (!pinInitialized || !pinVerified)) return;
    const intervalId = window.setInterval(() => {
      void loadTables();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
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
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
        <div className="text-lg text-[var(--muted-foreground)]">Loading…</div>
      </div>
    );
  }

  if (pinRequired && !pinVerified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
        <form
          onSubmit={handlePinSubmit}
          className="w-full max-w-md space-y-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-lg"
        >
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold text-[var(--foreground)]">
              Enter Test PIN
            </h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              This environment is protected. Please enter the test PIN to
              continue.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-left text-sm font-medium text-[var(--foreground)]">
              PIN
            </label>
            <input
              type="password"
              value={pinValue}
              onChange={(event) => {
                setPinValue(event.target.value);
                if (pinError) setPinError(null);
              }}
              className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 text-lg text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              autoFocus
              inputMode="numeric"
            />
            {pinError ? (
              <p className="text-sm text-[var(--destructive)]">{pinError}</p>
            ) : null}
          </div>
          <Button type="submit" variant="primary" fullWidth>
            Unlock
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="space-y-2">
          <h1 className={font.h1}>Select a Table</h1>
          <p className="text-base text-[var(--muted-foreground)]">
            Choose a table to view or update its current session.
          </p>
        </header>

        <Card className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full max-w-md">
            <Input
              label="Search"
              placeholder="Filter by table name or area"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button
            variant="primary"
            onClick={handleRefresh}
            loading={loading}
            className="sm:w-auto"
          >
            Refresh
          </Button>
        </Card>

        {error ? (
          <Card className="border-[var(--destructive)]/40 bg-[var(--destructive)]/10 text-[var(--destructive)]">
            <p className="text-sm font-medium">Failed to load tables.</p>
            <p className="text-sm">{error}</p>
          </Card>
        ) : null}

        {loading && tables.length === 0 ? (
          <Card className="text-center text-[var(--muted-foreground)]">
            Loading tables…
          </Card>
        ) : null}

        {!loading && groupedTables.length === 0 ? (
          <Card className="text-center text-[var(--muted-foreground)]">
            No tables match your filters.
          </Card>
        ) : (
          groupedTables.map(([area, tablesInArea]) => (
            <Card key={area} className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={font.h2}>{area}</h2>
                <span className="text-sm text-[var(--muted-foreground)]">
                  {tablesInArea.length} table
                  {tablesInArea.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tablesInArea.map((table) => (
                  <Button
                    key={table.id}
                    variant="secondary"
                    size="lg"
                    onClick={() => handleSelectTable(table.id)}
                    className="h-32 w-full flex-col items-start justify-between text-left"
                  >
                    <div className="flex w-full items-start justify-between">
                      <span className="text-xl font-semibold">
                        {table.name}
                      </span>
                      <span className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                        {(openTicketCounts.get(String(table.id)) ?? 0) + "人"}
                      </span>
                    </div>
                    <span className="text-sm text-[var(--muted-foreground)]">
                      Tap to open
                    </span>
                  </Button>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
