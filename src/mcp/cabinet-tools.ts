import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { closeListing, closeReasons } from "../cabinet/close.js";
import { favorites, myListings } from "../cabinet/items.js";
import { listOrders, ORDER_STATUSES } from "../cabinet/orders.js";
import { jsonResult, READ_ONLY, safe } from "./results.js";
import type { Services } from "./server.js";

export function registerCabinetTools(server: McpServer, { avito }: Services): void {
  server.registerTool(
    "list_orders",
    {
      title: "Заказы Avito",
      description: "Заказы с Авито Доставкой: статус, сумма, служба доставки, трек-номер, чат по заказу. action: buy — покупки, sell — продажи.",
      inputSchema: {
        action: z.enum(["buy", "sell"]).optional(),
        status: z.enum(ORDER_STATUSES).optional().describe("waiting_shipment, in_transit, delivered_in_pvz, finished, canceled…"),
        page: z.number().int().min(1).optional(),
      },
      annotations: READ_ONLY,
    },
    safe(async ({ action, status, page }) => jsonResult(await listOrders(avito, { action, status, page })))
  );

  server.registerTool(
    "my_listings",
    {
      title: "Мои объявления Avito",
      description: "Мои активные объявления: название, цена, статус и детали карточки, ссылка.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    safe(async () => jsonResult(await myListings(avito)))
  );

  server.registerTool(
    "favorites",
    { title: "Избранное Avito", description: "Объявления в избранном.", inputSchema: {}, annotations: READ_ONLY },
    safe(async () => jsonResult(await favorites(avito)))
  );

  server.registerTool(
    "close_reasons",
    {
      title: "Причины закрытия объявления Avito",
      description:
        "Для МОЕГО объявления возвращает варианты причины закрытия (reason): продал на Авито, с Авито Доставкой, где-то ещё, другая причина.",
      inputSchema: { item_id: z.string().min(1).describe("Номер моего объявления (из my_listings)") },
      annotations: READ_ONLY,
    },
    safe(async ({ item_id }) => jsonResult(await closeReasons(avito, item_id)))
  );

  server.registerTool(
    "close_listing",
    {
      title: "Снять объявление с публикации",
      description:
        "Закрывает МОЁ объявление на Avito (уходит в архив, его можно восстановить в личном кабинете). " +
        "Перед вызовом: найди объявление через my_listings, узнай причины через close_reasons, " +
        "покажи пользователю объявление и причину и получи явное согласие.",
      inputSchema: {
        item_id: z.string().min(1).describe("Номер моего объявления"),
        reason: z
          .number()
          .int()
          .describe("Код причины из close_reasons: 22 — продал на Авито, 23 — с Авито Доставкой, 21 — продал где-то ещё, 9 — другая причина"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    safe(async ({ item_id, reason }) => jsonResult(await closeListing(avito, item_id, reason)))
  );
}
