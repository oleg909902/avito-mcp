// MCP сервер для Avito.
// Запуск: node dist/index.js          — HTTP (Streamable HTTP) на :3000/mcp, для ChatGPT
//         node dist/index.js --stdio  — stdio, для Claude Code / локальной отладки
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AvitoClient } from "./avito/client.js";
import { config } from "./config.js";
import { createMcpServer, type Services } from "./mcp/server.js";
import { SendLimiter } from "./messenger/send.js";
import { serveHttp } from "./transport/http.js";

// Один клиент и один учёт отправок на процесс: очередь запросов и лимиты общие для всех подключений
const services: Services = {
  avito: new AvitoClient(config.cdpUrl),
  limiter: new SendLimiter(config.sendGapSec * 1000, config.dailyLimit),
  region: config.region,
};

if (process.argv.includes("--stdio")) {
  await createMcpServer(services).connect(new StdioServerTransport());
  console.error("avito-mcp: stdio");
} else {
  await serveHttp(() => createMcpServer(services), config);
  console.log(`avito-mcp: http://${config.host}:${config.port}/mcp  (CDP: ${config.cdpUrl})`);
}
