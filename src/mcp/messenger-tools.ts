import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getChat, listChats } from "../messenger/chats.js";
import { sendMessage } from "../messenger/send.js";
import { jsonResult, READ_ONLY, safe } from "./results.js";
import type { Services } from "./server.js";

export function registerMessengerTools(server: McpServer, { avito, limiter }: Services): void {
  server.registerTool(
    "list_chats",
    {
      title: "Чаты Avito",
      description: "Список переписок: с кем, по какому объявлению, последнее сообщение (кто написал, когда), прочитан ли чат.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe("Сколько чатов, по умолчанию 20"),
        offset: z.number().int().min(0).optional(),
        unread_only: z.boolean().optional().describe("Только непрочитанные"),
      },
      annotations: READ_ONLY,
    },
    safe(async ({ limit, offset, unread_only }) => jsonResult(await listChats(avito, { limit, offset, unreadOnly: unread_only })))
  );

  server.registerTool(
    "get_chat",
    {
      title: "Переписка Avito",
      description: "Сообщения чата по chat_id (из list_chats): кто написал, текст, время.",
      inputSchema: {
        chat_id: z.string().min(1),
        limit: z.number().int().min(1).max(100).optional().describe("Сколько последних сообщений, по умолчанию 30"),
      },
      annotations: READ_ONLY,
    },
    safe(async ({ chat_id, limit }) => jsonResult(await getChat(avito, { chatId: chat_id, limit })))
  );

  server.registerTool(
    "send_message",
    {
      title: "Написать на Avito",
      description:
        "Отправляет ОДНО сообщение: продавцу по объявлению (item_id — начнёт чат) или в существующий чат (chat_id). " +
        "Правила: перед отправкой покажи пользователю точный текст и получи согласие; пиши каждому продавцу отдельно, " +
        "по делу и с учётом его объявления; не рассылай одинаковую рекламу — Avito банит за спам. " +
        `Лимиты сервера: не чаще раза в минуту, до ${limiter.dailyLimit} сообщений в сутки, без повторов в одном чате.`,
      inputSchema: {
        item_id: z.string().optional().describe("Номер объявления — чтобы написать продавцу"),
        chat_id: z.string().optional().describe("Чат из list_chats — чтобы ответить в переписке"),
        text: z.string().min(1).max(1000).describe("Текст сообщения"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    safe(async ({ item_id, chat_id, text }) => jsonResult(await sendMessage(avito, limiter, { itemId: item_id, chatId: chat_id, text })))
  );
}
