// Мессенджер Avito: список чатов и переписка (JSON-RPC через socket.avito.ru)
import type { AvitoClient, RpcCall } from "../avito/client.js";
import { formatTime, SITE } from "../avito/format.js";

/** Один вызов RPC мессенджера; ошибка Avito — исключение */
export async function rpc(avito: AvitoClient, method: string, params: object): Promise<any> {
  const [r] = await avito.rpc([[method, params] satisfies RpcCall]);
  if (!r) throw new Error(`Avito: нет ответа на ${method}`);
  if (r.error) throw new Error(`Avito ${method}: ${r.error.message ?? r.error.code}`);
  return r.result;
}

/** Сообщение одной строкой: текст или пометка о типе вложения */
function messageText(m: any): string {
  switch (m.type) {
    case "text":
      return m.body?.text ?? "";
    case "item":
      return `[объявление] ${m.body?.item?.title ?? ""}`;
    case "image":
      return "[фото]";
    case "voice":
      return "[голосовое]";
    case "system":
      return `[системное] ${m.body?.text ?? ""}`;
    default:
      return `[${m.type}] ${m.body?.text ?? ""}`.trim();
  }
}

function parseChat(c: any) {
  const item = c.context?.type === "item" ? c.context.value : null;
  const otherUid = c.info?.userId;
  const last = c.lastMessage;
  return {
    chat_id: c.channelId as string,
    with: (c.info?.name as string) ?? null,
    item: item
      ? {
          id: String(item.id),
          title: item.title,
          price: item.priceString ?? null,
          location: item.location ?? null,
          url: item.urlPath ? SITE + item.urlPath : null,
        }
      : null,
    unread: c.isRead === false,
    answered: c.isAnswered ?? null,
    last_message: last ? { from_me: last.fromUid !== otherUid, text: messageText(last).slice(0, 300), at: formatTime(last.created) } : null,
    updated: formatTime(c.updated),
  };
}

export async function listChats(avito: AvitoClient, { limit = 20, offset = 0, unreadOnly = false } = {}) {
  const r = await rpc(avito, "avito.getChats.v5", { limit, offset, filters: unreadOnly ? { readOnly: false, unread: true } : {} });
  let chats = (r.channels ?? []).map(parseChat);
  if (unreadOnly) chats = chats.filter((c: ReturnType<typeof parseChat>) => c.unread);
  return { count: chats.length, has_more: Boolean(r.hasMore), offset, chats };
}

export async function getChat(avito: AvitoClient, { chatId, limit = 30 }: { chatId: string; limit?: number }) {
  const [chat, history] = await avito.rpc([
    ["avito.getChatById.v3", { channelId: chatId }],
    ["messenger.history.v2", { channelId: chatId, limit }],
  ]);
  if (!chat?.result) throw new Error(`Avito: чат не найден (${chat?.error?.message ?? "нет ответа"})`);
  const otherUid = chat.result.info?.userId;
  const messages = (history?.result?.items ?? [])
    .map((m: any) => ({ from_me: m.fromUid !== otherUid, text: messageText(m), at: formatTime(m.created), read: Boolean(m.read) }))
    .reverse(); // старые сверху
  return { ...parseChat(chat.result), messages };
}
