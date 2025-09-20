"use client";

import { useCallback, useEffect, useState } from "react";
import { differenceInMinutes, format, formatDistanceToNowStrict } from "date-fns";
import { useParams } from "next/navigation";

import { flush, enqueue } from "@/lib/offlineQueue";
import { nextLabels } from "@/lib/labels";
import { supabase } from "@/lib/supabaseClient";
import {
  computeRoomHourly,
  computeTeachingPerPerson,
  pricePerTicket,
  resolvePlan,
} from "@/pricing/engine";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Toggle } from "@/ui/Toggle";
import { font } from "@/ui/theme";

type Session = {
  id: string;
  table_id: string;
  opened_at: string;
  closed_at: string | null;
};
type Ticket = {
  id: string;
  session_id: string;
  label: string;
  started_at: string;
  ended_at: string | null;
  minutes: number | null;
  price_cents: number | null;
  auto_ended: boolean;
  note: string | null;
};

type TableMeta = {
  id: string;
  name: string;
  area: string | null;
};

export default function TablePage() {
  const params = useParams();

  const tableId = Array.isArray(params.tableId)
    ? params.tableId[0]
    : (params.tableId as string);

  const [session, setSession] = useState<Session | null>(null);
  const [openTickets, setOpenTickets] = useState<Ticket[]>([]);
  const [closedTickets, setClosedTickets] = useState<Ticket[]>([]);
  const [busy, setBusy] = useState(false);
  const [undoTicket, setUndoTicket] = useState<Ticket | null>(null);
  const [tableMeta, setTableMeta] = useState<TableMeta | null>(null);
  const [tableMetaLoading, setTableMetaLoading] = useState(true);
  const [tableMetaError, setTableMetaError] = useState<string | null>(null);
  const [teaching, setTeaching] = useState(false);
  const isRoom = tableMeta?.name.includes("包廂") ?? false;

  useEffect(() => {
    if (!isRoom && teaching) {
      setTeaching(false);
    }
  }, [isRoom, teaching]);

  const fetchTableMeta = useCallback(async (): Promise<TableMeta | null> => {
    const { data, error } = await supabase
      .from("tables")
      .select("id, name, area")
      .eq("id", tableId)
      .maybeSingle();
    if (error) throw error;
    return (data as TableMeta | null) ?? null;
  }, [tableId]);

  const ensureTableMeta = useCallback(async (): Promise<TableMeta | null> => {
    if (tableMeta) return tableMeta;
    try {
      const meta = await fetchTableMeta();
      if (!meta) {
        setTableMetaError("找不到桌位資料");
        setTableMetaLoading(false);
        return null;
      }
      setTableMeta(meta);
      setTableMetaError(null);
      setTableMetaLoading(false);
      return meta;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "無法讀取桌位資料";
      setTableMetaError(message);
      alert(`無法讀取桌位資料：${message}`);
      setTableMetaLoading(false);
      return null;
    }
  }, [fetchTableMeta, tableMeta]);

  useEffect(() => {
    let active = true;
    setTableMeta(null);
    setTableMetaError(null);
    setTableMetaLoading(true);
    fetchTableMeta()
      .then((meta) => {
        if (!active) return;
        if (meta) {
          setTableMeta(meta);
          setTableMetaError(null);
        } else {
          setTableMetaError("找不到桌位資料");
        }
      })
      .catch((error) => {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : "無法讀取桌位資料";
        setTableMetaError(message);
      })
      .finally(() => {
        if (active) setTableMetaLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchTableMeta]);

  async function getOpenSession(): Promise<Session | null> {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("table_id", tableId)
      .is("closed_at", null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as Session | null;
  }

  async function createSession(): Promise<Session> {
    const { data, error } = await supabase
      .from("sessions")
      .insert({ table_id: tableId })
      .select("*")
      .single();
    if (error) throw error;
    return data as Session;
  }

  async function loadTickets(sess: Session) {
    // open
    const openResp = await supabase
      .from("tickets")
      .select("*")
      .eq("session_id", sess.id)
      .is("ended_at", null)
      .order("started_at", { ascending: true });

    if (openResp.error) throw openResp.error;

    // recently closed（僅顯示近50筆）
    const closedResp = await supabase
      .from("tickets")
      .select("*")
      .eq("session_id", sess.id)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(50);

    if (closedResp.error) throw closedResp.error;

    setOpenTickets(openResp.data as Ticket[]);
    setClosedTickets(closedResp.data as Ticket[]);
  }

  async function ensureSession() {
    let s = await getOpenSession();
    if (!s) s = await createSession();
    setSession(s);
    await loadTickets(s);
  }

  // 進入頁面：嘗試清空離線佇列，再讀資料
  useEffect(() => {
    (async () => {
      await ensureTableMeta();
      await flush(async (item) => {
        // 簡化處理：依 kind 直接呼叫對應操作
        if (item.kind === "enter") await handleEnter(item.payload.count);
        if (item.kind === "leave_oldest") await handleLeaveOldest();
        if (item.kind === "leave_pick")
          await handleLeavePick(item.payload.ticketId);
        if (item.kind === "checkout") await handleCheckout();
        if (item.kind === "undo") await handleUndo();
      });
      // 初次載入只讀資料，不自動新開
      const s = await getOpenSession();
      if (s) {
        setSession(s);
        await loadTickets(s);
      }
    })().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const headcount = openTickets.length;
  const openedAt = session?.opened_at ? new Date(session.opened_at) : null;

  async function handleEnter(count: number) {
    try {
      setBusy(true);
      const s = session ?? (await createSession());
      if (!session) setSession(s);

      // 計算下一批標籤
      const { count: existCount, error: cntErr } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("session_id", s.id);
      if (cntErr) throw cntErr;

      const labels = nextLabels(existCount || 0, count);
      const rows = labels.map((l) => ({ session_id: s.id, label: l }));

      const { error: insErr } = await supabase.from("tickets").insert(rows);
      if (insErr) throw insErr;

      await loadTickets(s);
    } catch (error) {
      console.error(error);
      await enqueue({ kind: "enter", payload: { count } });
      alert("目前離線，已加入待傳佇列。");
    } finally {
      setBusy(false);
    }
  }

  async function endTicket(ticketId: string, auto: boolean) {
    const s = session!;
    const endedAt = new Date();
    // 查該票
    const t = openTickets.find((x) => x.id === ticketId);
    if (!t) return;

    const meta = await ensureTableMeta();
    if (!meta) {
      alert("找不到桌位資料，無法結束票。");
      return;
    }

    const isRoomTable = meta.name.includes("包廂");

    let minutes: number;
    let price_cents: number;
    if (isRoomTable) {
      const startedAt = new Date(t.started_at);
      minutes = Math.max(
        1,
        Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)
      );
      price_cents = 0;
    } else {
      try {
        const result = pricePerTicket({
          tableName: meta.name,
          area: meta.area ?? "",
          startedAt: new Date(t.started_at),
          endedAt,
        });
        minutes = result.minutes;
        price_cents = result.price_cents;
      } catch (error) {
        console.error("pricePerTicket failed", error);
        alert(
          `計價失敗：${
            error instanceof Error ? error.message : "未知的計價錯誤"
          }`
        );
        return;
      }
    }

    const { error: updErr } = await supabase
      .from("tickets")
      .update({
        ended_at: endedAt.toISOString(),
        minutes,
        price_cents,
        auto_ended: auto,
      })
      .eq("id", ticketId);
    if (updErr) throw updErr;

    setUndoTicket({
      ...t,
      ended_at: endedAt.toISOString(),
      minutes,
      price_cents,
      auto_ended: auto,
    });
    await loadTickets(s);
  }

  async function handleLeaveOldest() {
    try {
      setBusy(true);
      const s = session ?? (await createSession());
      if (!session) setSession(s);
      // 取最早一張未結束票
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("session_id", s.id)
        .is("ended_at", null)
        .order("started_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      if (!data || data.length === 0) return;
      await endTicket(data[0].id, true);
    } catch (error) {
      console.error(error);
      await enqueue({ kind: "leave_oldest", payload: {} });
      alert("目前離線，已加入待傳佇列。");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeavePick(ticketId: string) {
    try {
      setBusy(true);
      if (!session) await ensureSession();
      await endTicket(ticketId, false);
    } catch (error) {
      console.error(error);
      await enqueue({ kind: "leave_pick", payload: { ticketId } });
      alert("目前離線，已加入待傳佇列。");
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo() {
    try {
      setBusy(true);
      const t = undoTicket;
      if (!t) return;
      const { error } = await supabase
        .from("tickets")
        .update({
          ended_at: null,
          minutes: null,
          price_cents: null,
          auto_ended: false,
        })
        .eq("id", t.id);
      if (error) throw error;
      setUndoTicket(null);
      if (session) await loadTickets(session);
    } catch (error) {
      console.error(error);
      await enqueue({ kind: "undo", payload: {} });
      alert("目前離線，已加入待傳佇列。");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckout() {
    try {
      setBusy(true);
      const s = session ?? (await createSession());
      if (!session) setSession(s);

      const meta = await ensureTableMeta();
      if (!meta) {
        alert("找不到桌位資料，無法結帳。");
        return;
      }

      const { data: ticketRows, error: ticketsErr } = await supabase
        .from("tickets")
        .select("*")
        .eq("session_id", s.id)
        .order("started_at", { ascending: true });
      if (ticketsErr) throw ticketsErr;

      const now = new Date();
      const allTickets = (ticketRows as Ticket[]) ?? [];
      const openTicketsForCheckout = allTickets.filter((t) => !t.ended_at);

      const calculations: Array<{
        ticket: Ticket;
        minutes: number;
        price_cents: number;
      }> = [];
      let summaryLines: string[] | null = null;

      if (!isRoom) {
        for (const t of openTicketsForCheckout) {
          try {
            const pricing = pricePerTicket({
              tableName: meta.name,
              area: meta.area ?? "",
              startedAt: new Date(t.started_at),
              endedAt: now,
            });
            calculations.push({
              ticket: t,
              minutes: pricing.minutes,
              price_cents: pricing.price_cents,
            });
          } catch (error) {
            console.error("pricePerTicket failed", error);
            alert(
              `計價失敗：${
                error instanceof Error ? error.message : "未知的計價錯誤"
              }`
            );
            return;
          }
        }
      } else {
        const allTicketsWithSpans = allTickets.map((t) => ({
          ticket: t,
          startedAt: new Date(t.started_at),
          endedAt: t.ended_at ? new Date(t.ended_at) : now,
        }));
        const earliest = allTicketsWithSpans.reduce<Date | null>((acc, item) => {
          if (!acc || item.startedAt < acc) return item.startedAt;
          return acc;
        }, null);
        const earliestStart = earliest ?? (s.opened_at ? new Date(s.opened_at) : now);

        if (!teaching) {
          // room_hourly: bill from earliest ticket start through checkout.
          const { rules, day } = resolvePlan({
            tableName: meta.name,
            area: meta.area ?? "",
            at: earliestStart,
          });
          const minutes = Math.max(1, differenceInMinutes(now, earliestStart));
          const hourly = computeRoomHourly(minutes, rules);
          const totalCents = hourly.totalCents;
          const openCount = openTicketsForCheckout.length;

          const baseShare = openCount > 0 ? Math.floor(totalCents / openCount) : 0;
          const remainder = openCount > 0 ? totalCents - baseShare * openCount : 0;

          openTicketsForCheckout.forEach((ticket, index) => {
            const startedAt = new Date(ticket.started_at);
            const mins = Math.max(1, differenceInMinutes(now, startedAt));
            const share =
              openCount === 0
                ? 0
                : baseShare + (index < remainder ? 1 : 0);
            calculations.push({
              ticket,
              minutes: mins,
              price_cents: share,
            });
          });

          summaryLines = [
            "包廂：時段計價",
            `日期類型：${day}`,
            `計費時段：${minutes} 分鐘（約 ${hourly.billedHours} 小時）`,
            `總計：NT$${(totalCents / 100).toFixed(0)}`,
            "* 說明：以最早入座者的開局時間至結帳時間計算。",
          ];
        } else {
          // teaching: charge per person based on individual stay; enforce min_people.
          const openPricing = openTicketsForCheckout.map((ticket) => {
            const startedAt = new Date(ticket.started_at);
            const mins = Math.max(
              1,
              differenceInMinutes(now, startedAt)
            );
            const { rules, day } = resolvePlan({
              tableName: meta.name,
              area: meta.area ?? "",
              at: startedAt,
            });
            const perPersonCents = computeTeachingPerPerson(mins, rules);
            return {
              ticket,
              minutes: mins,
              price_cents: perPersonCents,
              minPeople: rules.teaching.min_people,
              day,
            };
          });

          const actualPeople = openPricing.length;
          const minPeople = openPricing.reduce(
            (max, item) => Math.max(max, item.minPeople),
            0
          );
          let totalCents = openPricing.reduce(
            (sum, item) => sum + item.price_cents,
            0
          );

          let billedPeople = actualPeople;
          if (actualPeople > 0 && minPeople > actualPeople) {
            const targetTotal = Math.round(
              (totalCents / actualPeople) * minPeople
            );
            const multiplier = totalCents === 0 ? 0 : targetTotal / totalCents;
            let running = 0;
            openPricing.forEach((item, index) => {
              let price =
                totalCents === 0
                  ? Math.floor(targetTotal / actualPeople)
                  : Math.round(item.price_cents * multiplier);
              if (index === openPricing.length - 1) {
                price = targetTotal - running;
              }
              running += price;
              item.price_cents = price;
            });
            totalCents = targetTotal;
            billedPeople = minPeople;
          }

          openPricing.forEach((item) => {
            calculations.push({
              ticket: item.ticket,
              minutes: item.minutes,
              price_cents: item.price_cents,
            });
          });

          const totalMinutes = openPricing.reduce(
            (sum, item) => sum + item.minutes,
            0
          );
          const dayLabels = Array.from(new Set(openPricing.map((i) => i.day)));

          summaryLines = [
            "包廂：教學計價",
            `日期類型：${dayLabels.join(", ") || "-"}`,
            `實際人數：${actualPeople}，計費人數：${billedPeople}`,
            `累積時數：${totalMinutes} 分鐘`,
            `總計：NT$${(totalCents / 100).toFixed(0)}`,
            "* 說明：每位顧客以其入座時間起算，若低於教學最低人數則依最低人數計費。",
          ];
        }
      }

      for (const result of calculations) {
        const { error: updErr } = await supabase
          .from("tickets")
          .update({
            ended_at: now.toISOString(),
            minutes: result.minutes,
            price_cents: result.price_cents,
            auto_ended: result.ticket.auto_ended,
          })
          .eq("id", result.ticket.id);
        if (updErr) throw updErr;
      }

      // 關閉 session
      const { error: closeErr } = await supabase
        .from("sessions")
        .update({
          closed_at: now.toISOString(),
        })
        .eq("id", s.id);
      if (closeErr) throw closeErr;

      await loadTickets({ ...s, closed_at: now.toISOString() });

      if (summaryLines) {
        alert(summaryLines.join("\n"));
      }
    } catch (error) {
      console.error(error);
      await enqueue({ kind: "checkout", payload: {} });
      alert("目前離線，已加入待傳佇列。");
    } finally {
      setBusy(false);
    }
  }

  const [pickOpen, setPickOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {process.env.NEXT_PUBLIC_APP_TITLE || "SeatCounter"}
            </p>
            <h1 className={font.h1}>{tableMeta?.name ?? `桌位 ${tableId}`}</h1>
          </div>
          <div className="space-y-1 text-sm text-[var(--muted-foreground)]">
            <p>桌標識：{tableId}</p>
            {tableMeta?.area ? <p>區域：{tableMeta.area}</p> : null}
            {tableMetaLoading && !tableMeta ? <p>桌位資料載入中…</p> : null}
            {tableMetaError ? (
              <p className="text-[var(--destructive)]">桌位資料錯誤：{tableMetaError}</p>
            ) : null}
            {openedAt ? (
              <p>
                已入座：
                {formatDistanceToNowStrict(openedAt, { addSuffix: false })}
              </p>
            ) : null}
          </div>
          {isRoom ? (
            <Toggle
              checked={teaching}
              onChange={setTeaching}
              label="教學加價"
              description="勾選後結帳時計入教學方案"
            />
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-[var(--muted-foreground)]">目前人數</p>
            <p className="text-4xl font-extrabold text-[var(--foreground)]">
              {headcount}
            </p>
          </div>
          <div className="text-sm text-[var(--muted-foreground)]">
            <p>{session ? `Session: ${session.id.slice(0, 8)}…` : "尚未開桌"}</p>
            {session?.opened_at ? (
              <p>開桌時間：{format(new Date(session.opened_at), "HH:mm")}</p>
            ) : null}
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              fullWidth
              variant="primary"
              disabled={busy}
              onClick={() => handleEnter(1)}
            >
              +1
            </Button>
            <Button
              fullWidth
              variant="primary"
              disabled={busy}
              onClick={() => handleEnter(2)}
            >
              +2
            </Button>
            <Button
              fullWidth
              variant="primary"
              disabled={busy}
              onClick={() => handleEnter(3)}
            >
              +3
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              fullWidth
              variant="secondary"
              disabled={busy || headcount === 0}
              onClick={handleLeaveOldest}
            >
              離場（最早）
            </Button>
            <Button
              fullWidth
              variant="secondary"
              disabled={busy || headcount === 0}
              onClick={() => setPickOpen(true)}
            >
              離場（指定）
            </Button>
          </div>
          <Button
            variant="danger"
            fullWidth
            disabled={busy}
            loading={busy}
            onClick={handleCheckout}
          >
            結帳（結束全部）
          </Button>
        </Card>

        {undoTicket ? (
          <Card className="flex items-center justify-between gap-4 border-[var(--accent)]/40 bg-[var(--accent)]/20 text-sm">
            <div>
              已結束：{undoTicket.label}（
              {format(new Date(undoTicket.started_at), "HH:mm")} → {" "}
              {format(new Date(undoTicket.ended_at!), "HH:mm")}）
            </div>
            <Button variant="ghost" size="sm" onClick={handleUndo}>
              撤銷
            </Button>
          </Card>
        ) : null}

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className={font.h2}>進行中</h2>
            <span className="text-sm text-[var(--muted-foreground)]">
              {openTickets.length} 張
            </span>
          </div>
          <div className="space-y-2">
            {openTickets.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-[var(--foreground)]">
                    {t.label}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {format(new Date(t.started_at), "HH:mm")} • 已 {" "}
                    {formatDistanceToNowStrict(new Date(t.started_at))}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={() => handleLeavePick(t.id)}
                >
                  結束
                </Button>
              </div>
            ))}
            {openTickets.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                目前無進行中的票
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className={font.h2}>已完成（最近）</h2>
            <span className="text-sm text-[var(--muted-foreground)]">
              {closedTickets.length} 張
            </span>
          </div>
          <div className="space-y-2">
            {closedTickets.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-[var(--foreground)]">
                    {t.label}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {format(new Date(t.started_at), "HH:mm")} → {" "}
                    {t.ended_at ? format(new Date(t.ended_at), "HH:mm") : "-"}
                  </span>
                </div>
                <div className="text-sm text-[var(--muted-foreground)]">
                  {t.minutes ?? "-"} 分 • NT$
                  {t.price_cents ? (t.price_cents / 100).toFixed(0) : "-"}
                </div>
              </div>
            ))}
            {closedTickets.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                尚無已完成的票
              </p>
            ) : null}
          </div>
        </Card>

        {pickOpen && (
          <div className="fixed inset-0 z-10 flex items-end bg-black/40 p-4">
            <div className="w-full space-y-4 rounded-2xl bg-[var(--card)] p-6 text-[var(--card-foreground)] shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className={font.h2}>選擇要結束的票</h3>
                <Button variant="ghost" size="sm" onClick={() => setPickOpen(false)}>
                  關閉
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {openTickets.map((t) => (
                  <Button
                    key={t.id}
                    variant="secondary"
                    onClick={() => {
                      setPickOpen(false);
                      handleLeavePick(t.id);
                    }}
                  >
                    <span className="flex flex-col text-left">
                      <span className="font-semibold">{t.label}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {format(new Date(t.started_at), "HH:mm")}
                      </span>
                    </span>
                  </Button>
                ))}
                {openTickets.length === 0 ? (
                  <p className="col-span-full text-sm text-[var(--muted-foreground)]">
                    沒有可選的票
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
