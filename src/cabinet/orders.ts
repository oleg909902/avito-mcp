// Заказы с Авито Доставкой (только чтение)
import type { AvitoClient } from "../avito/client.js";

export const ORDER_STATUSES = [
  "waiting_confirmation",
  "waiting_shipment",
  "in_transit",
  "delivered_in_pvz",
  "payout_wait",
  "on_return",
  "disputed",
  "finished",
  "canceled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** action: buy — покупаю, sell — продаю */
export type OrderAction = "buy" | "sell";

export async function listOrders(avito: AvitoClient, { action = "buy", status, page = 1 }: { action?: OrderAction; status?: OrderStatus; page?: number } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: "20", action });
  if (status) params.append("status", status);
  const d = await avito.getJson(`/web/1/orders?${params}`);
  return {
    action,
    page,
    has_more: Boolean(d.hasMore),
    orders: (d.orders ?? []).map((o: any) => ({
      order_id: o.orderId,
      title: o.imgSet?.[0]?.alt ?? null,
      status: o.status?.label ?? null,
      status_code: o.status?.value ?? null,
      total: o.cost?.total ?? null,
      items: o.totalItemsCount ?? null,
      delivery: o.provider?.label ?? null,
      tracking_number: o.provider?.trackingNumber || null,
      created: o.createdAt ?? null,
      updated: o.updatedAt ?? null,
      chat_id: o.channelId ?? null,
      image: o.imgSet?.[0]?.src ?? null,
    })),
  };
}
