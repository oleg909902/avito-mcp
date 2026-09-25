import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AvitoClient } from "../avito/client.js";
import type { SendLimiter } from "../messenger/send.js";
import { registerCabinetTools } from "./cabinet-tools.js";
import { registerListingTools } from "./listing-tools.js";
import { registerMessengerTools } from "./messenger-tools.js";
import { registerPrompts } from "./prompts.js";

/** Общее для всех инструментов */
export type Services = {
  avito: AvitoClient;
  limiter: SendLimiter;
  /** Город по умолчанию */
  region: string;
};

const INSTRUCTIONS = [
  "Avito: объявления, сообщения, кабинет. Как работать лучше:",
  "- Для уточнения (состояние, характеристики, подкатегория) сначала get_search_filters, потом search_listings с filters/category.",
  "- Avito строго ограничивает частоту запросов: не открывай десятки объявлений подряд — выбирай 3–5 самых подходящих.",
  "- send_message и close_listing — только после явного согласия пользователя с точным текстом/причиной; не рассылай одинаковые сообщения.",
  "- Город по умолчанию — город пользователя; для другого передай region.",
].join("\n");

export function createMcpServer(services: Services): McpServer {
  const server = new McpServer({ name: "avito", version: "0.2.0" }, { instructions: INSTRUCTIONS });
  registerListingTools(server, services);
  registerMessengerTools(server, services);
  registerCabinetTools(server, services);
  registerPrompts(server);
  return server;
}
