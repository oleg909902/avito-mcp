// Готовые сценарии: действия с подтверждением пользователя перед отправкой/закрытием
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const userMessage = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "close_my_listing",
    {
      title: "Закрыть моё объявление",
      description: "Находит моё объявление, спрашивает причину и закрывает его после подтверждения",
      argsSchema: { which: z.string().optional().describe("Какое объявление, например 'чехлы' (если не указано — покажет все)") },
    },
    ({ which }) =>
      userMessage(
        `Хочу закрыть объявление на Avito${which ? `: ${which}` : ""}.\n` +
          `1. Вызови my_listings и найди подходящее объявление (если их несколько или не ясно какое — спроси меня).\n` +
          `2. Вызови close_reasons и спроси, по какой причине закрываем (продал на Авито, с доставкой, где-то ещё, другая).\n` +
          `3. Покажи объявление и причину и дождись моего подтверждения. Только потом вызови close_listing.`
      )
  );

  server.registerPrompt(
    "ask_sellers",
    {
      title: "Найти объявления и написать продавцам",
      description: "Подбирает объявления по запросу и готовит продавцам вопросы; отправляет только после согласия",
      argsSchema: {
        what: z.string().describe("Что ищем, например 'зеркало в полный рост'"),
        question: z.string().describe("Что спросить у продавцов, например 'можно ли сегодня забрать и уступите ли в цене'"),
        budget: z.string().optional().describe("Бюджет, например 'до 5000'"),
        city: z.string().optional().describe("Город как в адресе Avito, например krasnodar"),
        count: z.string().optional().describe("Скольким продавцам написать, по умолчанию 5"),
      },
    },
    ({ what, question, budget, city, count }) =>
      userMessage(
        `Найди на Avito: ${what}${budget ? `, бюджет ${budget}` : ""}${city ? `, город ${city}` : ""}.\n` +
          `1. Вызови get_search_filters и подбери фильтры, затем search_listings.\n` +
          `2. Выбери до ${count || 5} лучших объявлений (цена, состояние, рейтинг продавца, описание). Для сомнительных вызови get_listing.\n` +
          `3. Покажи мне таблицу: объявление, цена, продавец, почему выбрано.\n` +
          `4. Для каждого подготовь короткое вежливое сообщение продавцу с вопросом: "${question}" — с учётом его объявления, без шаблонной рекламы.\n` +
          `5. Ничего не отправляй, пока я не подтвержу. После подтверждения отправляй send_message по одному (item_id), сообщая результат каждой отправки.`
      )
  );
}
