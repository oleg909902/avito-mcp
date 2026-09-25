import type { AvitoClient } from "../avito/client.js";
import { itemPath, stripQuery } from "../avito/format.js";
import { parseListingPage, type ListingPage } from "./listing-page.js";

export type Listing = ListingPage & { url: string };

/** Объявление по ссылке или номеру */
export async function getListing(avito: AvitoClient, listing: string): Promise<Listing> {
  const { final_url, ...item } = await avito.fetchPage(itemPath(listing), parseListingPage);
  return { ...item, url: stripQuery(final_url) };
}

export type ListingImage = { url: string; mimeType: string; data: string };

/** Фото объявления как картинки (base64). Публичный CDN img.avito.st — качаем напрямую, без браузера. */
export async function getListingImages(avito: AvitoClient, listing: string, { limit = 4 }: { limit?: number } = {}) {
  const item = await getListing(avito, listing);
  const images: ListingImage[] = [];
  for (const url of item.photos.slice(0, limit)) {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) continue;
    images.push({
      url,
      mimeType: res.headers.get("content-type")?.split(";")[0] || "image/jpeg",
      data: Buffer.from(await res.arrayBuffer()).toString("base64"),
    });
  }
  return { id: item.id, title: item.title, total: item.photos.length, urls: item.photos, images };
}
