// Разбор страницы объявления Avito. Выполняется в браузере (см. DocParser) — функция самодостаточна.

export type ListingPage = {
  id: string | null;
  title: string | null;
  price: number | null;
  price_text: string | null;
  published: string | null;
  views: string | null;
  address: string | null;
  delivery_available: boolean;
  params: Record<string, string>;
  description: string | null;
  seller: {
    name: string | null;
    rating: number | null;
    reviews: number | null;
    type: "company" | "private" | null;
    on_avito_since: string | null;
    url: string | null;
  };
  category: string[];
  photos: string[];
};

export function parseListingPage(doc: Document): ListingPage {
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() || null;
  const q = (m: string) => doc.querySelector(`[data-marker="${m}"]`);
  const num = (s: string | null | undefined) => (s ? Number(String(s).replace(/[^\d]/g, "")) || null : null);
  // Первое число из текста: у цены бывает диапазон «1 683 — 1 980 ₽»
  const firstNum = (s: string | null | undefined) => num(s?.match(/\d[\d\s\u00a0]*/)?.[0]);

  const params = Object.fromEntries(
    [...(q("item-view/item-params")?.querySelectorAll("li") ?? [])]
      .map((li) => text(li)?.split(/:\s*/))
      .filter((kv): kv is string[] => (kv?.length ?? 0) >= 2)
      .map(([k, ...v]) => [k, v.join(": ")])
  );

  // Фото: все картинки img.avito.st в галерее, из srcset берём самый крупный вариант
  const gallery = q("item-view/gallery") ?? q("card-gallery") ?? doc;
  const photos = new Set<string>();
  for (const img of gallery.querySelectorAll("img")) {
    const set = img.getAttribute("srcset");
    const best = set ? set.split(",").map((s) => s.trim().split(" ")[0]).at(-1) : img.getAttribute("src");
    if (best && /img\.avito\.st/.test(best)) photos.add(best);
  }
  for (const el of gallery.querySelectorAll("[data-url]")) {
    const u = el.getAttribute("data-url");
    if (u && /img\.avito\.st/.test(u)) photos.add(u);
  }

  const idText = text(q("item-view/item-id"));
  const dateText = text(q("item-view/item-date"));
  const viewsText = text(q("item-view/total-views"));
  const priceText = text(q("item-view/item-price"));
  const sellerText = text(q("seller-info") ?? q("sellerInfo")) ?? "";
  const sellerHref = doc.querySelector('[data-marker="seller-link/link"]')?.getAttribute("href");
  const description = q("item-view/item-description") as HTMLElement | null;

  return {
    id: idText?.match(/\d{6,}/)?.[0] ?? null,
    title: text(q("item-view/title-info")) ?? text(doc.querySelector("h1")),
    price: num(doc.querySelector('[itemprop="price"]')?.getAttribute("content")) ?? firstNum(priceText),
    price_text: priceText ? priceText.split("₽")[0].trim() + " ₽" : null,
    published: dateText?.replace(/^·\s*/, "") ?? null,
    views: viewsText?.match(/^[\d\s]+просмотр\S*(\s*\(\+\d+ сегодня\))?/)?.[0]?.trim() ?? null,
    address:
      text(doc.querySelector('[itemprop="address"]')) ??
      text(q("address-and-delivery-element")?.querySelector("span, p"))?.replace(/^Адрес и доставка\s*/, "") ??
      null,
    delivery_available: Boolean(q("delivery-item-button-main") || q("delivery")),
    params,
    // innerText сохраняет переносы строк; у документа из DOMParser его нет — тогда просто текст
    description: description?.innerText?.trim() || text(description),
    seller: {
      name: text(q("seller-info/name"))?.replace(/\s*\d[,.]\d.*$/, "") ?? null,
      rating: Number(sellerText.match(/\b([0-5][,.]\d)\b/)?.[1]?.replace(",", ".")) || null,
      reviews: num(text(q("rating-caption/rating"))?.match(/[\d\s]+(?=\s*отзыв)/)?.[0]) ?? num(sellerText.match(/(\d[\d\s]*)\s*отзыв/)?.[1]),
      type: /компани|магазин|ИП |ООО/i.test(sellerText) ? "company" : /частное лицо/i.test(sellerText) ? "private" : null,
      on_avito_since: sellerText.match(/На Авито с [^·]+?\d{4}/)?.[0] ?? null,
      url: sellerHref ? new URL(sellerHref, "https://www.avito.ru").href.split("?")[0] : null,
    },
    category: [...doc.querySelectorAll('[data-marker="breadcrumbs"] a, [itemtype*="BreadcrumbList"] [itemprop="name"]')]
      .map(text)
      .filter((c): c is string => Boolean(c)),
    photos: [...photos],
  };
}
