// Отправка сообщений. Ограничена (анти-спам): по одному сообщению за вызов, пауза между отправками,
// дневной лимит и запрет повторять тот же текст в том же чате. Массовые рассылки Avito банит.
import type { AvitoClient } from "../avito/client.js";
import { rpc } from "./chats.js";

const DAY_MS = 24 * 3600 * 1000;
const MAX_LENGTH = 1000;

/** Учёт отправленных сообщений (в памяти процесса) */
export class SendLimiter {
  private sent: { at: number; chatId: string; text: string }[] = [];

  constructor(
    private minGapMs: number,
    readonly dailyLimit: number
  ) {}

  /** Бросает ошибку, если отправка сейчас нарушит лимиты */
  check(chatId: string, text: string): void {
    const now = Date.now();
    if (this.sentToday() >= this.dailyLimit) {
      throw new Error(`Достигнут лимит ${this.dailyLimit} сообщений в сутки (защита от бана за спам)`);
    }
    const last = this.sent.at(-1);
    if (last && now - last.at < this.minGapMs) {
      const wait = Math.ceil((this.minGapMs - (now - last.at)) / 1000);
      throw new Error(`Слишком часто: подожди ${wait} с перед следующим сообщением (защита от бана за спам)`);
    }
    if (this.sent.some((s) => s.chatId === chatId && s.text === text)) throw new Error("Это сообщение уже отправлено в этот чат");
  }

  record(chatId: string, text: string): void {
    const now = Date.now();
    this.sent = this.sent.filter((s) => now - s.at < DAY_MS);
    this.sent.push({ at: now, chatId, text });
  }

  sentToday(): number {
    const now = Date.now();
    return this.sent.filter((s) => now - s.at < DAY_MS).length;
  }
}

/** Отправить сообщение: в существующий чат (chatId) или продавцу по объявлению (itemId) */
export async function sendMessage(
  avito: AvitoClient,
  limiter: SendLimiter,
  { chatId, itemId, text: rawText }: { chatId?: string; itemId?: string; text: string }
) {
  const text = rawText.trim();
  if (!text) throw new Error("Пустое сообщение");
  if (text.length > MAX_LENGTH) throw new Error(`Сообщение длиннее ${MAX_LENGTH} символов`);

  let channelId = chatId;
  let created = false;
  if (!channelId) {
    if (!itemId) throw new Error("Нужен chat_id или item_id");
    const r = await rpc(avito, "avito.chatCreateByItemId.v2", { itemId: Number(itemId) });
    channelId = r?.channel?.channelId ?? r?.channelId ?? r?.id;
    if (!channelId) throw new Error("Avito не создал чат по этому объявлению (возможно, продавец отключил сообщения)");
    created = true;
  }

  limiter.check(channelId, text);

  // Не пишем повторно тот же текст, если он уже есть в переписке
  const history = await rpc(avito, "messenger.history.v2", { channelId, limit: 20 }).catch(() => null);
  if ((history?.items ?? []).some((m: any) => m.type === "text" && m.body?.text?.trim() === text)) {
    throw new Error("Такое сообщение уже есть в этой переписке");
  }

  const r = await rpc(avito, "avito.sendTextMessage.v2", { channelId, randomId: crypto.randomUUID(), text });
  limiter.record(channelId, text);
  return {
    sent: true,
    chat_id: channelId,
    new_chat: created,
    message_id: r?.id ?? r?.message?.id ?? null,
    sent_today: limiter.sentToday(),
    daily_limit: limiter.dailyLimit,
  };
}
