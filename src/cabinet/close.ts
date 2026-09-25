// Снятие моего объявления с публикации (уходит в архив, можно восстановить из кабинета)
import type { AvitoClient } from "../avito/client.js";
import { SITE } from "../avito/format.js";

export type CloseReason = { reason: number; text: string; note: string | null };

/** Варианты причины закрытия для моего объявления (reason: 22, 23, 21, 9 …) */
export async function closeReasons(avito: AvitoClient, itemId: string) {
  const d = await avito.getJson(`/web/1/items/close-reasons?item_id=${encodeURIComponent(itemId)}`);
  const item = d.items?.[0];
  if (!item) throw new Error("Это не твоё объявление или оно уже закрыто");
  const reasons: CloseReason[] = (d.buttons ?? []).map((b: any) => ({ reason: b.reason, text: b.text, note: b.motivationText?.text ?? null }));
  return {
    item: { id: String(item.item_id), title: item.title as string, price: item.price, url: item.url ? SITE + item.url : null },
    reasons,
  };
}

export async function closeListing(avito: AvitoClient, itemId: string, reason: number) {
  const { item, reasons } = await closeReasons(avito, itemId);
  const chosen = reasons.find((r) => r.reason === reason);
  if (!chosen) throw new Error(`Неизвестная причина ${reason}. Возможные: ${reasons.map((r) => `${r.reason} — ${r.text}`).join("; ")}`);
  const r = await avito.postJson("/web/1/profile/items/close", { itemIds: [Number(itemId)], reason });
  if (r.status !== "ok" || !r.result?.closed) {
    throw new Error(`Avito не закрыл объявление: ${r.result?.messages?.[0] ?? r.result?.message ?? JSON.stringify(r).slice(0, 200)}`);
  }
  return { closed: true, item, reason: chosen.text };
}
