import type { AvitoClient } from "../avito/client.js";
import { SITE, stripQuery } from "../avito/format.js";
import { sleep } from "../cdp/browser.js";
import { parseSearchPage, type SearchPage } from "./search-page.js";

/** Сортировки Avito (параметр s): 1 — дешевле, 2 — дороже, 104 — по дате */
const SORTS = { default: null, price: "1", price_desc: "2", date: "104" } as const;
export type SearchSort = keyof typeof SORTS;
export const SEARCH_SORTS = Object.keys(SORTS) as [SearchSort, ...SearchSort[]];

export type SellerType = "private" | "company";

/** Значения фильтров из get_search_filters: {key: value} или {key: [value, …]} */
export type SearchFilters = Record<string, string | number | (string | number)[]>;

export type SearchLocation = {
  /** Слаг города из адреса Avito (krasnodar, moskva, all — вся Россия) */
  region: string;
  /** Путь подкатегории из get_search_filters (например /krasnodar/mebel_i_interer/zerkala-…) */
  category?: string;
};

export type SearchOptions = SearchLocation & {
  query: string;
  sort?: SearchSort;
  page?: number;
  priceMin?: number;
  priceMax?: number;
  delivery?: boolean;
  sellerType?: SellerType;
  filters?: SearchFilters;
};

export type SearchResult = Omit<SearchPage, "items"> & {
  query: string;
  region: string;
  resolved_to: string;
  page: number;
  count: number;
  items: SearchPage["items"];
  filters?: SearchFilters;
  not_applied?: string[];
};

/**
 * Путь страницы выдачи с параметрами, которые Avito понимает в адресе.
 * forTab — для открытия во вкладке: там скрипт Avito сам переводит запрос в подходящую категорию
 * (и в панели появляются её фильтры). Для фонового запроса нужен cd=1: без него на /<город>?q=…
 * приходит заглушка без объявлений.
 */
export function searchPath(o: Omit<SearchOptions, "filters">, { forTab = false } = {}): string {
  const params = new URLSearchParams();
  if (!o.category && !forTab) params.set("cd", "1");
  if (o.query) params.set("q", o.query);
  const base = o.category ? stripQuery(o.category.replace(/^https?:\/\/[^/]+/, "")) : `/${o.region}`;
  return withParams(`${base}?${params}`, o);
}

/** Добавляет к пути (или ссылке) выдачи сортировку, цену, доставку, тип продавца и страницу */
function withParams(path: string, o: Omit<SearchOptions, "filters" | "query" | "region">): string {
  const u = new URL(path, SITE);
  const set = (key: string, value: string | number | null | undefined) => {
    if (value != null) u.searchParams.set(key, String(value));
  };
  u.searchParams.delete("context"); // одноразовый токен Avito, в адресе только мешает
  set("s", o.sort ? SORTS[o.sort] : null);
  set("pmin", o.priceMin);
  set("pmax", o.priceMax);
  if (o.delivery) set("d", 1);
  if (o.sellerType) set("user", o.sellerType === "private" ? 1 : 2);
  if (o.page && o.page > 1) set("p", o.page);
  return u.pathname + u.search;
}

/**
 * Поиск, 50 объявлений на страницу.
 * Фильтры категории (filters) Avito кодирует в адресе недокументированным параметром f, поэтому
 * они применяются кликами в панели фильтров временной вкладки; из получившегося адреса выдача
 * загружается обычным запросом — вместе с ценой, сортировкой и страницей.
 */
export async function searchListings(avito: AvitoClient, o: SearchOptions): Promise<SearchResult> {
  let path = searchPath(o);
  let notApplied: string[] = [];
  if (o.filters && Object.keys(o.filters).length) {
    const filtered = await applyFilters(avito, { query: o.query, region: o.region, category: o.category }, o.filters);
    path = withParams(filtered.path, o);
    notApplied = filtered.notApplied;
  }

  const r = await avito.fetchPage(path, parseSearchPage);
  return {
    query: o.query,
    region: o.region,
    resolved_to: withParams(r.final_url, {}),
    title: r.title,
    total: r.total,
    page: o.page ?? 1,
    last_page: r.last_page,
    count: r.items.length,
    items: r.items,
    ...(o.filters ? { filters: o.filters } : {}),
    ...(notApplied.length ? { not_applied: notApplied } : {}),
  };
}

/**
 * Открывает выдачу во временной вкладке (тот же адрес, что и у get_search_filters), кликает по
 * значениям фильтров и возвращает получившийся путь и то, что применить не удалось.
 */
function applyFilters(avito: AvitoClient, where: SearchLocation & { query: string }, filters: SearchFilters) {
  const { browser } = avito;
  return avito.withTab(searchPath(where, { forTab: true }), async (tab) => {
    await browser.waitFor(tab, () => Boolean(document.querySelector('[data-marker="search-filters"]')), 20_000);
    await sleep(1_500); // панель перерисовывается после загрузки скриптов — раньше ввод сбрасывается

    const notApplied: string[] = [];
    for (const [key, raw] of Object.entries(filters)) {
      // Текстовый фильтр (слова в описании) — ввод и Enter
      if (typeof raw === "string" && (await browser.fill(tab, `[data-marker="${key}/input"]`, raw))) {
        await browser.pressEnter(tab);
        await sleep(700);
        continue;
      }
      for (const v of Array.isArray(raw) ? raw : [raw]) {
        const checkbox = `[data-marker="${key}/checkbox/${v}"]`;
        const clicked = await browser.click(tab, `${checkbox}, [data-marker="${key}/option(${v})"]`).catch(() => false);
        await sleep(700);
        const checked = await browser.evaluate(tab, (sel) => document.querySelector(sel)?.getAttribute("aria-checked") ?? "none", checkbox);
        if (!clicked || checked === "false") notApplied.push(`${key}=${v}`);
      }
    }
    // Avito обновляет адрес и выдачу с задержкой после последнего изменения
    await sleep(4_000);
    const path = await browser.evaluate(tab, () => location.pathname + location.search);
    return { path, notApplied };
  });
}
