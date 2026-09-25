import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSearchFilters } from "../listings/filters.js";
import { getListing, getListingImages } from "../listings/listing.js";
import { SEARCH_SORTS, searchListings } from "../listings/search.js";
import { jsonResult, READ_ONLY, safe } from "./results.js";
import type { Services } from "./server.js";

const listingArg = z.string().min(1).describe("Ссылка на объявление Avito или его номер");
const regionArg = z
  .string()
  .optional()
  .describe("Город как в адресе Avito: krasnodar, moskva, sankt-peterburg, ekaterinburg… или all — вся Россия. По умолчанию — город пользователя");
const categoryArg = z.string().optional().describe("Путь подкатегории из get_search_filters.categories");
const filtersArg = z
  .record(z.string(), z.union([z.array(z.union([z.string(), z.number()])), z.string(), z.number()]))
  .optional()
  .describe(
    'Фильтры из get_search_filters: {"params[110405]": "431261"} (type=one), {"params[173228]": ["22081724"]} (type=multi), {"params[149569]": "слово"} (type=text)'
  );

export function registerListingTools(server: McpServer, { avito, region: defaultRegion }: Services): void {
  server.registerTool(
    "search_listings",
    {
      title: "Поиск объявлений на Avito",
      description:
        "Ищет объявления на Avito (50 на страницу): номер, название, цена, место, продавец и его рейтинг, доставка, бейджи, фото, ссылка. " +
        "Для уточнения (состояние новое/б/у, характеристики, наличие, слова в описании, подкатегория) сначала вызови get_search_filters " +
        "и передай выбранные значения в filters (или category). Цена, тип продавца, доставка и сортировка задаются отдельными параметрами.",
      inputSchema: {
        query: z.string().min(1).describe("Что ищем, например 'зеркало в полный рост'"),
        region: regionArg,
        category: categoryArg,
        sort: z.enum(SEARCH_SORTS).optional().describe("default, price — дешевле, price_desc — дороже, date — новые"),
        page: z.number().int().min(1).max(100).optional(),
        price_min: z.number().int().min(0).optional().describe("Цена от, ₽"),
        price_max: z.number().int().min(0).optional().describe("Цена до, ₽"),
        delivery: z.boolean().optional().describe("Только с Авито Доставкой"),
        seller_type: z.enum(["private", "company"]).optional().describe("private — частные, company — компании"),
        filters: filtersArg,
      },
      annotations: READ_ONLY,
    },
    safe(async (a) =>
      jsonResult(
        await searchListings(avito, {
          query: a.query,
          region: a.region || defaultRegion,
          category: a.category,
          sort: a.sort,
          page: a.page,
          priceMin: a.price_min,
          priceMax: a.price_max,
          delivery: a.delivery,
          sellerType: a.seller_type,
          filters: a.filters,
        })
      )
    )
  );

  server.registerTool(
    "get_search_filters",
    {
      title: "Фильтры поиска Avito",
      description:
        "Доступные фильтры для запроса: характеристики категории (состояние, бренд, размеры и т.п.), подкатегории, наличие, " +
        "способы связи, слова в описании. Возвращает key, тип и значения для search_listings.filters.",
      inputSchema: { query: z.string().min(1), region: regionArg, category: categoryArg },
      annotations: READ_ONLY,
    },
    safe(async ({ query, region, category }) => jsonResult(await getSearchFilters(avito, { query, region: region || defaultRegion, category })))
  );

  server.registerTool(
    "get_listing",
    {
      title: "Объявление Avito",
      description:
        "Всё об объявлении: цена, описание, характеристики, дата, просмотры, адрес, доставка, продавец (рейтинг, отзывы, тип), категория, ссылки на фото.",
      inputSchema: { listing: listingArg },
      annotations: READ_ONLY,
    },
    safe(async ({ listing }) => jsonResult(await getListing(avito, listing)))
  );

  server.registerTool(
    "get_listing_images",
    {
      title: "Фото объявления Avito",
      description: "Фотографии объявления как изображения, чтобы рассмотреть товар.",
      inputSchema: { listing: listingArg, limit: z.number().int().min(1).max(10).optional().describe("Сколько фото, по умолчанию 4") },
      annotations: READ_ONLY,
    },
    safe(async ({ listing, limit }) => {
      const r = await getListingImages(avito, listing, { limit });
      const summary = { id: r.id, title: r.title, shown: r.images.length, total: r.total, urls: r.urls };
      return {
        content: [
          { type: "text", text: JSON.stringify(summary, null, 1) },
          ...r.images.map((i) => ({ type: "image" as const, data: i.data, mimeType: i.mimeType })),
        ],
      };
    })
  );
}
