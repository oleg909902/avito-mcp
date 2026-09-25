// Доступ к Avito через уже запущенный Chrome.
// Страницы запрашиваются fetch'ем из вкладки avito.ru (с её cookie и прокси браузера)
// и разбираются прямо в браузере через DOMParser — наружу уходят только готовые данные.
import { Browser, sleep, type PageInfo } from "../cdp/browser.js";
import { SITE } from "./format.js";
import { PacedQueue } from "./paced-queue.js";

/**
 * Разбор HTML-документа. Выполняется в браузере, поэтому функция должна быть самодостаточной:
 * без импортов и замыканий на переменные модуля.
 */
export type DocParser<R, A = undefined> = (doc: Document, arg: A) => R;

export type RpcCall = [method: string, params: object];
export type RpcResult = { result?: any; error?: { code?: number; message?: string } };

const MIN_GAP_MS = 3_000; // не чаще раза в 3 секунды
const FETCH_TIMEOUT_MS = 25_000;
const MESSENGER_URL = "wss://socket.avito.ru/?use_seq=true&id_version=v3&app_name=web&app_version=v418";

const BLOCKED_TEXT = "Avito ограничил доступ (проверка безопасности).";
const NOT_FOUND_TEXT = "Avito: страница не найдена (объявление снято или неверная ссылка)";

class RateLimitedError extends Error {}

export class AvitoClient {
  readonly browser: Browser;
  private queue = new PacedQueue(MIN_GAP_MS);

  constructor(cdpUrl: string) {
    this.browser = new Browser(cdpUrl);
  }

  /** Загружает страницу Avito и разбирает её в браузере: parse(doc, arg) */
  async fetchPage<R, A = undefined>(path: string, parse: DocParser<R, A>, arg?: A): Promise<R & { final_url: string }> {
    try {
      return await this.queue.run(() => this.fetchAndParse(path, parse, arg));
    } catch (e) {
      if (!(e instanceof RateLimitedError)) throw e;
      // Проверка безопасности Avito срабатывает на фоновые fetch-запросы, а обычный переход
      // по ссылке она пропускает: открываем страницу во временной вкладке и разбираем её
      await sleep(MIN_GAP_MS);
      return this.withTab(path, (tab) => this.parseOpenedPage(tab, parse, arg));
    }
  }

  /**
   * Временная вкладка для действий, которым нужна живая страница (панель фильтров, кабинет).
   * Всегда закрывается — вкладки не копятся.
   */
  withTab<R>(path: string, fn: (tab: PageInfo) => Promise<R>): Promise<R> {
    return this.queue.run(async () => {
      const tab = await this.browser.openPage(SITE + path);
      try {
        return await fn(tab);
      } finally {
        await this.browser.closePage(tab);
      }
    });
  }

  /** GET JSON с сайта Avito (с cookie пользователя) */
  getJson<T = any>(path: string): Promise<T> {
    return this.requestJson(path);
  }

  /** POST JSON на сайт Avito (с cookie пользователя) */
  postJson<T = any>(path: string, body: unknown): Promise<T> {
    return this.requestJson(path, body);
  }

  /**
   * Вызовы JSON-RPC мессенджера Avito (wss://socket.avito.ru) из вкладки — с cookie пользователя.
   * Результаты в том же порядке, что и вызовы.
   */
  rpc(calls: RpcCall[]): Promise<RpcResult[]> {
    return this.queue.run(async () => {
      const tab = await this.avitoTab();
      const r = await this.browser.evaluate(tab, messengerCalls, MESSENGER_URL, calls);
      if (r.error) throw new Error(r.error);
      return r.results;
    });
  }

  /**
   * Вкладка Avito для фоновых запросов. Берём уже открытую (запросы идут без навигации, человеку не мешают);
   * новую открываем, только если вкладок Avito нет — иначе они копятся и съедают память сервера.
   */
  private async avitoTab(): Promise<PageInfo> {
    const pages = await this.browser.pages();
    return pages.find((p) => p.url.startsWith(SITE)) ?? this.browser.openPage(SITE + "/");
  }

  private async fetchAndParse<R, A>(path: string, parse: DocParser<R, A>, arg: A | undefined): Promise<R & { final_url: string }> {
    const tab = await this.avitoTab();
    const res = await this.browser.evaluateCode<{ status: number; url?: string; error?: string; data?: R }>(
      tab,
      `(${fetchDocument})(${JSON.stringify(path)}, ${FETCH_TIMEOUT_MS})` +
        `.then((r) => r.doc ? { status: r.status, url: r.url, data: (${parse})(r.doc, ${JSON.stringify(arg)}) } : r)`
    );
    if (res.status === 599) throw new Error(`Avito: нет ответа (${res.error})`);
    if (res.status === 439) throw new RateLimitedError(`${BLOCKED_TEXT} Подожди пару минут или открой avito.ru в серверном браузере и пройди проверку`);
    if (res.status === 404) throw new Error(NOT_FOUND_TEXT);
    if (res.status >= 400) throw new Error(`Avito HTTP ${res.status}`);
    return { ...(res.data as R), final_url: res.url! };
  }

  private async parseOpenedPage<R, A>(tab: PageInfo, parse: DocParser<R, A>, arg: A | undefined): Promise<R & { final_url: string }> {
    const { status, title, url } = await this.browser.evaluate(tab, () => ({
      status: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.responseStatus ?? 0,
      title: document.title,
      url: location.href,
    }));
    if (status === 439 || /Доступ ограничен|проблема с IP/i.test(title)) {
      throw new Error(`${BLOCKED_TEXT} Открой avito.ru в серверном браузере и пройди проверку`);
    }
    if (status === 404) throw new Error(NOT_FOUND_TEXT);
    const data = await this.browser.evaluateCode<R>(tab, `(${parse})(document, ${JSON.stringify(arg)})`);
    return { ...data, final_url: url };
  }

  private requestJson<T>(path: string, body?: unknown): Promise<T> {
    return this.queue.run(async () => {
      const tab = await this.avitoTab();
      const r = await this.browser.evaluate(tab, fetchText, path, body === undefined ? null : JSON.stringify(body), FETCH_TIMEOUT_MS);
      if (r.status === 401 || r.status === 403) throw new Error("Avito: нет входа в аккаунт в серверном браузере или нет прав на это действие");
      if (r.status >= 400) throw new Error(`Avito HTTP ${r.status} ${path.split("?")[0]}: ${r.text.slice(0, 200)}`);
      return JSON.parse(r.text) as T;
    });
  }
}

// --- Функции ниже выполняются в браузере ---

/** fetch страницы с cookie и разбор HTML; при блокировке статус 439 */
async function fetchDocument(path: string, timeout: number) {
  try {
    const r = await fetch(path, { credentials: "include", signal: AbortSignal.timeout(timeout) });
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    const blocked = r.status === 439 || /Доступ ограничен|проблема с IP/i.test(doc.title);
    const status = blocked ? 439 : r.status;
    return { status, url: r.url, doc: status < 400 ? doc : undefined };
  } catch (e) {
    return { status: 599, error: String(e) };
  }
}

/** GET (body = null) или POST JSON с cookie */
async function fetchText(path: string, body: string | null, timeout: number) {
  try {
    const res = await fetch(path, {
      method: body === null ? "GET" : "POST",
      credentials: "include",
      headers:
        body === null
          ? { Accept: "application/json" }
          : { Accept: "application/json", "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body,
      signal: AbortSignal.timeout(timeout),
    });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    return { status: 599, text: String(e) };
  }
}

/** Открывает WebSocket мессенджера, после сессии отправляет вызовы и собирает ответы */
function messengerCalls(url: string, calls: [string, object][]) {
  return new Promise<{ results: { result?: any; error?: any }[]; error?: string }>((resolve) => {
    const ws = new WebSocket(url);
    const results: { result?: any; error?: any }[] = new Array(calls.length);
    let left = calls.length;
    const finish = (error?: string) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      resolve({ results, error });
    };
    const timer = setTimeout(() => finish(), 20_000);
    ws.onerror = () => finish("Не удалось подключиться к мессенджеру Avito");
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "session") {
        calls.forEach(([method, params], i) => ws.send(JSON.stringify({ method, params, id: 1000 + i, jsonrpc: "2.0" })));
        return;
      }
      const i = typeof m.id === "number" ? m.id - 1000 : -1;
      if (i >= 0 && i < calls.length) {
        results[i] = m.error ? { error: m.error } : { result: m.result };
        if (--left === 0) finish();
      }
    };
  });
}
