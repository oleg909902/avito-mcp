// Настройки из переменных окружения
export const config = {
  /** HTTP-адрес отладочного порта Chrome */
  cdpUrl: process.env.CDP_URL ?? "http://127.0.0.1:9223",
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  /** Город по умолчанию — слаг из адреса Avito (krasnodar, moskva…), all — вся Россия */
  region: process.env.AVITO_REGION ?? "all",
  /** Минимальная пауза между отправками сообщений, с */
  sendGapSec: Number(process.env.AVITO_SEND_GAP_SEC ?? 60),
  /** Сколько сообщений можно отправить за сутки */
  dailyLimit: Number(process.env.AVITO_DAILY_LIMIT ?? 20),
};

export type Config = typeof config;
