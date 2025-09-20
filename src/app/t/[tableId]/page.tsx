"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { flush, enqueue } from "@/lib/offlineQueue";
import { nextLabels } from "@/lib/labels";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useParams } from "next/navigation";
import { priceForRoomSession, pricePerTicket } from "@/pricing/engine";

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

    let pricing;
    try {
      pricing = pricePerTicket({
        tableName: meta.name,
        area: meta.area ?? "",
        startedAt: new Date(t.started_at),
        endedAt,
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

    const { error: updErr } = await supabase
      .from("tickets")
      .update({
        ended_at: endedAt.toISOString(),
        minutes: pricing.minutes,
        price_cents: pricing.price_cents,
        auto_ended: auto,
      })
      .eq("id", ticketId);
    if (updErr) throw updErr;

    setUndoTicket({
      ...t,
      ended_at: endedAt.toISOString(),
      minutes: pricing.minutes,
      price_cents: pricing.price_cents,
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

      // 結束所有未結束票
      const { data: opens, error: listErr } = await supabase
        .from("tickets")
        .select("*")
        .eq("session_id", s.id)
        .is("ended_at", null);
      if (listErr) throw listErr;

      const now = new Date();
      const openList = (opens as Ticket[]) ?? [];

      if (meta.name.includes("包廂")) {
        try {
          const roomSummary = priceForRoomSession({
            tableName: meta.name,
            area: meta.area ?? "",
            sessionOpenedAt: new Date(s.opened_at),
            sessionEndedAt: now,
            people: openList.length,
            teaching,
          });
          const summaryLines = [
            `日期類型：${roomSummary.day}`,
            `總時長：${roomSummary.minutes} 分鐘`,
          ];
          if (roomSummary.meta.mode === "room_hourly") {
            summaryLines.push(`計費小時：${roomSummary.meta.billedHours}`);
          } else {
            summaryLines.push(
              `每人：NT$${(
                roomSummary.meta.perPersonCents / 100
              ).toFixed(0)} × ${roomSummary.meta.billedPeople} 人`
            );
          }
          summaryLines.push(
            `總計：NT$${(roomSummary.total_cents / 100).toFixed(0)}`
          );
          alert(summaryLines.join("\n"));
        } catch (error) {
          console.error("priceForRoomSession failed", error);
          alert(
            `包廂計價失敗：${
              error instanceof Error ? error.message : "未知的計價錯誤"
            }`
          );
          return;
        }
      }

      const calculations: Array<{
        ticket: Ticket;
        minutes: number;
        price_cents: number;
      }> = [];

      if (!isRoom) {
        for (const t of openList) {
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
        // 包廂票券改以房間總價平均，避免缺 per-person tier。
        const roomPricing = priceForRoomSession({
          tableName: meta.name,
          area: meta.area ?? "",
          sessionOpenedAt: new Date(s.opened_at),
          sessionEndedAt: now,
          people: openList.length || 1,
          teaching,
        });
        const perTicket = Math.round(
          openList.length
            ? roomPricing.total_cents / openList.length
            : roomPricing.total_cents
        );
        calculations.push(
          ...openList.map((ticket) => ({
            ticket,
            minutes: roomPricing.minutes,
            price_cents: perTicket,
          }))
        );
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
    <main className="max-w-xl mx-auto p-4 space-y-6">
      <header className="space-y-2">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {process.env.NEXT_PUBLIC_APP_TITLE || "SeatCounter"}
          </p>
          <h1 className="text-2xl font-bold">
            {tableMeta?.name ?? `桌位 ${tableId}`}
          </h1>
        </div>
        <div className="space-y-1 text-sm text-gray-600">
          <p>桌標識：{tableId}</p>
          {tableMeta?.area ? <p>區域：{tableMeta.area}</p> : null}
          {tableMetaLoading && !tableMeta ? <p>桌位資料載入中…</p> : null}
          {tableMetaError ? (
            <p className="text-red-500">桌位資料錯誤：{tableMetaError}</p>
          ) : null}
          {openedAt && (
            <p>
              已入座：
              {formatDistanceToNowStrict(openedAt, { addSuffix: false })}
            </p>
          )}
        </div>
        {isRoom ? (
          <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
            <div className="flex flex-col">
              <span className="font-semibold text-gray-700">教學加價</span>
              <span className="text-xs text-gray-500">
                勾選後結帳時計入教學方案
              </span>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={teaching}
              onChange={(event) => setTeaching(event.target.checked)}
            />
          </label>
        ) : null}
      </header>

      <section className="flex items-center justify-between">
        <div className="text-4xl font-extrabold">目前人數：{headcount}</div>
        <div className="text-sm text-gray-600">
          {session ? `Session: ${session.id.slice(0, 8)}...` : "尚未開桌"}
        </div>
      </section>

      <section className="grid grid-cols-5 gap-2">
        <button
          disabled={busy}
          onClick={() => handleEnter(1)}
          className="col-span-1 py-3 rounded-xl border"
        >
          +1
        </button>
        <button
          disabled={busy}
          onClick={() => handleEnter(2)}
          className="col-span-1 py-3 rounded-xl border"
        >
          +2
        </button>
        <button
          disabled={busy}
          onClick={() => handleEnter(3)}
          className="col-span-1 py-3 rounded-xl border"
        >
          +3
        </button>
        <button
          disabled={busy || headcount === 0}
          onClick={handleLeaveOldest}
          className="col-span-1 py-3 rounded-xl border"
        >
          離場（最早）
        </button>
        <button
          disabled={busy || headcount === 0}
          onClick={() => setPickOpen(true)}
          className="col-span-1 py-3 rounded-xl border"
        >
          離場（指定）
        </button>
      </section>

      {undoTicket && (
        <section className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 flex items-center justify-between">
          <div>
            已結束：{undoTicket.label}（
            {format(new Date(undoTicket.started_at), "HH:mm")} →{" "}
            {format(new Date(undoTicket.ended_at!), "HH:mm")}）
          </div>
          <button onClick={handleUndo} className="px-3 py-1 rounded-md border">
            撤銷
          </button>
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-2">進行中</h2>
        <ul className="space-y-1">
          {openTickets.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between px-3 py-2 rounded-md border"
            >
              <div className="flex flex-col">
                <span className="font-bold">{t.label}</span>
                <span className="text-xs text-gray-600">
                  {format(new Date(t.started_at), "HH:mm")} • 已{" "}
                  {formatDistanceToNowStrict(new Date(t.started_at))}
                </span>
              </div>
              <button
                disabled={busy}
                onClick={() => handleLeavePick(t.id)}
                className="px-3 py-1 rounded-md border"
              >
                結束
              </button>
            </li>
          ))}
          {openTickets.length === 0 && (
            <li className="text-sm text-gray-500">目前無進行中的票</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold mb-2">已完成（最近）</h2>
        <ul className="space-y-1">
          {closedTickets.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between px-3 py-2 rounded-md border"
            >
              <div className="flex flex-col">
                <span className="font-bold">{t.label}</span>
                <span className="text-xs text-gray-600">
                  {format(new Date(t.started_at), "HH:mm")} →{" "}
                  {t.ended_at ? format(new Date(t.ended_at), "HH:mm") : "-"}
                </span>
              </div>
              <div className="text-sm">
                {t.minutes ?? "-"} 分 • NT$
                {t.price_cents ? (t.price_cents / 100).toFixed(0) : "-"}
              </div>
            </li>
          ))}
          {closedTickets.length === 0 && (
            <li className="text-sm text-gray-500">尚無已完成的票</li>
          )}
        </ul>
      </section>

      <section>
        <button
          disabled={busy}
          onClick={handleCheckout}
          className="w-full py-3 rounded-xl border"
        >
          結帳（結束全部）
        </button>
      </section>

      {/* 指定離場選擇器（簡化版） */}
      {pickOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-end">
          <div className="bg-white w-full p-4 rounded-t-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">選擇要結束的票</h3>
              <button
                className="px-3 py-1 border rounded-md"
                onClick={() => setPickOpen(false)}
              >
                關閉
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {openTickets.map((t) => (
                <button
                  key={t.id}
                  className="py-3 rounded-xl border"
                  onClick={() => {
                    setPickOpen(false);
                    handleLeavePick(t.id);
                  }}
                >
                  {t.label}
                  <div className="text-xs text-gray-600">
                    {format(new Date(t.started_at), "HH:mm")}
                  </div>
                </button>
              ))}
              {openTickets.length === 0 && (
                <div className="text-sm text-gray-500 col-span-3">
                  沒有可選的票
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
