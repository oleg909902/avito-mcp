// Мои объявления и избранное: страницы кабинета рисуются скриптами, поэтому читаются во временной вкладке
import type { AvitoClient } from "../avito/client.js";
import { sleep } from "../cdp/browser.js";

export type CabinetItem = { id: string; title: string | null; price: string | null; details: string; url: string };

export async function myListings(avito: AvitoClient) {
  const { items, tabs } = await readCabinetPage(avito, "/profile");
  return {
    count: items.length,
    items,
    // Вкладки кабинета с числом объявлений: «Активные», «Можно продать», «Архив»…
    tabs,
    ...(items.length ? {} : { note: "Активных объявлений нет" }),
  };
}

export async function favorites(avito: AvitoClient) {
  const { items } = await readCabinetPage(avito, "/favorites");
  return { count: items.length, items, ...(items.length ? {} : { note: "В избранном нет объявлений" }) };
}

function readCabinetPage(avito: AvitoClient, path: string): Promise<{ items: CabinetItem[]; tabs: string[] }> {
  return avito.withTab(path, async (tab) => {
    const { browser } = avito;
    // Ждём ссылок на объявления (или пустого списка)
    await browser
      .waitFor(tab, () => [...document.querySelectorAll("a[href]")].some((a) => /_\d{8,}(?:[/?#]|$)/.test(a.getAttribute("href")!)), 15_000)
      .catch(() => {});
    await sleep(1_000);
    if (/\/login|auth/.test(await browser.evaluate(tab, () => location.href))) throw new Error("Avito: нет входа в аккаунт в серверном браузере");
    const tabs = await browser.evaluate(tab, () =>
      [...document.querySelectorAll('[data-marker^="personal-items-tabs/tab("]')].map((t) => (t as HTMLElement).innerText.replace(/\s+/g, " ").trim())
    );
    return { items: await browser.evaluate(tab, readItemCards), tabs };
  });
}

/**
 * Карточки объявлений на отрисованной странице (выполняется в браузере):
 * ищем ссылки на объявления и собираем текст их карточки.
 */
function readItemCards(): CabinetItem[] {
  const clean = (t: string | null | undefined) => t?.replace(/\s+/g, " ").trim() || "";
  const byId = new Map<string, CabinetItem>();
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href")!;
    const id = href.match(/_(\d{8,})(?:[/?#]|$)/)?.[1];
    if (!id) continue;
    const title = clean(a.getAttribute("title") ?? a.textContent) || null;
    const known = byId.get(id);
    if (known) {
      // Первая ссылка часто картинка без текста — название берём из следующей
      known.title ??= title;
      continue;
    }
    // Поднимаемся до карточки: первый предок с ценой и заметным текстом
    let card: Element = a;
    for (let i = 0; i < 8 && card.parentElement; i++) {
      card = card.parentElement;
      if (/₽|Цена не указана/.test(card.textContent ?? "") && (card.textContent ?? "").length > 40) break;
    }
    const text = clean(card.textContent);
    byId.set(id, {
      id,
      title,
      price: text.match(/(\d[\d\s ]*)\s*₽/)?.[0]?.replace(/\s+/g, " ") ?? null,
      details: text.slice(0, 300),
      url: new URL(href, location.origin).href.split("?")[0],
    });
  }
  return [...byId.values()];
}
