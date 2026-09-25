import type { AvitoClient } from "../avito/client.js";
import { searchPath, type SearchLocation } from "./search.js";

export type FilterGroup = {
  key: string;
  title: string | null;
  type: "multi" | "one" | "text";
  options?: { value: string; label: string | null }[];
};

export type Category = { name: string | null; path: string };

const HOW_TO_USE =
  "В search_listings передай filters: {<key>: [value, ...]} для type=multi, {<key>: value} для type=one, " +
  '{<key>: "текст"} для type=text. Цена — price_min/price_max, продавец — seller_type, доставка — delivery. ' +
  "Чтобы искать внутри подкатегории — category: <path из categories>.";

/**
 * Доступные фильтры для запроса: характеристики категории, подкатегории.
 * Панель фильтров рисуется скриптами, поэтому читается с живой страницы во временной вкладке.
 */
export async function getSearchFilters(avito: AvitoClient, o: SearchLocation & { query: string }) {
  return avito.withTab(searchPath(o, { forTab: true }), async (tab) => {
    await avito.browser.waitFor(tab, () => Boolean(document.querySelector('[data-marker="search-filters"]')), 20_000).catch(() => {});
    const panel = await avito.browser.evaluate(tab, readFilterPanel);
    return {
      query: o.query,
      search_path: panel.path, // Avito мог перевести запрос в категорию
      how_to_use: HOW_TO_USE,
      filters: panel.groups,
      categories: panel.categories.slice(0, 30),
    };
  });
}

/** Читает панель фильтров живой страницы (выполняется в браузере) */
function readFilterPanel(): { path: string; groups: FilterGroup[]; categories: Category[] } {
  const path = location.pathname;
  const panel = document.querySelector('[data-marker="search-filters"]');
  if (!panel) return { path, groups: [], categories: [] };
  const clean = (t: string | null | undefined) => t?.replace(/\s+/g, " ").trim() || null;
  const marker = (el: Element) => el.getAttribute("data-marker") ?? "";

  // Все элементы группы начинаются с одного ключа: params[110405]/checkbox/…, params[110405]/input
  const firstByKey = new Map<string, Element>();
  for (const el of panel.querySelectorAll('[data-marker^="params["]')) {
    const key = marker(el).match(/^params\[\d+\]/)?.[0];
    if (key && !firstByKey.has(key)) firstByKey.set(key, el);
  }
  const titleOf = (el: Element) => {
    let box: Element | null = el;
    for (let i = 0; i < 8 && box; i++, box = box.parentElement) {
      const h = box.querySelector("h5, h4, h3, legend, [class*='title'], [class*='Title']");
      if (h && clean(h.textContent)) return clean(h.textContent);
    }
    return null;
  };
  const labelOf = (el: Element) => clean((el.closest("label") ?? el).textContent);

  const groups: FilterGroup[] = [];
  for (const [key, first] of firstByKey) {
    const els = [...panel.querySelectorAll(`[data-marker^="${key}"]`)];
    const checks = els.filter((e) => /\/checkbox\/(?!toggle)/.test(marker(e)));
    const opts = els.filter((e) => /\/option\((?!all\))/.test(marker(e)));
    const title = titleOf(first);
    if (checks.length) {
      groups.push({ key, title, type: "multi", options: checks.map((e) => ({ value: marker(e).split("/checkbox/")[1], label: labelOf(e) })) });
    } else if (opts.length) {
      groups.push({ key, title, type: "one", options: opts.map((e) => ({ value: marker(e).match(/option\((.+)\)/)![1], label: labelOf(e) })) });
    } else if (els.some((e) => /\/input$/.test(marker(e)))) {
      groups.push({ key, title, type: "text" });
    }
  }

  const categories = new Map<string, Category>();
  for (const a of document.querySelectorAll('[data-marker^="category["] a[href]')) {
    const p = a.getAttribute("href")!.split("?")[0];
    if (!categories.has(p)) categories.set(p, { name: clean(a.textContent), path: p });
  }
  return { path, groups, categories: [...categories.values()] };
}
