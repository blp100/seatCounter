"use client";
import { set, get, del, keys } from "idb-keyval";

type QueuedActionPayloadMap = {
  enter: { count: number };
  leave_oldest: Record<string, never>;
  leave_pick: { ticketId: string };
  checkout: Record<string, never>;
  undo: Record<string, never>;
};

type NewQueuedAction = {
  [K in keyof QueuedActionPayloadMap]: {
    kind: K;
    payload: QueuedActionPayloadMap[K];
  };
}[keyof QueuedActionPayloadMap];

export type QueuedAction = NewQueuedAction & {
  id: string; // client-side uuid
  created_at: string; // ISO
};

const prefix = "queue:";

export async function enqueue(action: NewQueuedAction) {
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
    const v = await get<QueuedAction>(k);
    if (v) items.push(v);
  }
  items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const item of items) {
    await sendFn(item);
    await del(prefix + item.id);
  }
}
