"use client";
import { set, get, del, keys } from "idb-keyval";

type QueuedAction = {
  id: string; // client-side uuid
  kind: "enter" | "leave_oldest" | "leave_pick" | "checkout" | "undo";
  payload: any; // { tableId, sessionId?, labels?, ticketId? ... }
  created_at: string; // ISO
};

const prefix = "queue:";

export async function enqueue(action: Omit<QueuedAction, "id" | "created_at">) {
  const id = crypto.randomUUID();
  const item: QueuedAction = {
    id,
    created_at: new Date().toISOString(),
    ...action,
  };
  await set(prefix + id, item);
  return item;
}

export async function flush(sendFn: (item: QueuedAction) => Promise<void>) {
  const allKeys = await keys();
  const target = allKeys.filter(
    (k) => typeof k === "string" && (k as string).startsWith(prefix)
  ) as string[];
  // 依建立時間排序
  const items: QueuedAction[] = [];
  for (const k of target) {
    const v = await get(k);
    if (v) items.push(v as QueuedAction);
  }
  items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const item of items) {
    await sendFn(item);
    await del(prefix + item.id);
  }
}
