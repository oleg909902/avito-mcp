// Разбор страницы выдачи Avito. Выполняется в браузере (см. DocParser) — функция самодостаточна.

export type SearchItem = {
  id: string | null;
  title: string | null;
  price: number | null;
  price_text: string | null;
  old_price: number | null;
  discount: string | null;
  location: string | null;
  date: string | null;
  seller: string | null;
  seller_rating: string | null;
  delivery: boolean;
  badges: string[];
  description: string | null;
  image: string | null;
  photos: number;
  url: string | null;
};

export type SearchPage = { title: string | null; total: number | null; last_page: number | null; items: SearchItem[] };

export function parseSearchPage(doc: Document): SearchPage {
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() || null;
  const num = (s: string | null | undefined) => (s ? Number(String(s).replace(/[^\d]/g, "")) || null : null);
  const biggest = (srcset: string | null | undefined) =>
    srcset?.split(",").map((s) => s.trim().split(" ")[0]).filter(Boolean).at(-1) ?? null;

  const items = [...doc.querySelectorAll('[data-marker="item"]')].map((el): SearchItem => {
    const link = el.querySelector('[data-marker="item-title"]');
    const images = [...el.querySelectorAll('[data-marker^="slider-image/image-"]')].map((li) =>
      li.getAttribute("data-marker")!.replace("slider-image/image-", "")
    );
    const seller = el.querySelector('[data-marker="seller-info"]');
    const img = el.querySelector("img");
    const href = link?.getAttribute("href");
    return {
      id: el.getAttribute("data-item-id"),
      title: link?.getAttribute("title") ?? text(link),
      price: num(el.querySelector('meta[itemprop="price"]')?.getAttribute("content")),
      price_text: text(el.querySelector('[data-marker="item-price"]')),
      old_price: num(text(el.querySelector('[data-marker="old-price-value"]'))),
      discount: text(el.querySelector('[data-marker="discount-value"]')),
      location: text(el.querySelector('[data-marker="item-location"]')),
      date: text(el.querySelector('[data-marker="item-date"]')),
      seller: seller ? text(seller.querySelector("a, p, span")) : null,
      seller_rating: text(el.querySelector('[data-marker="seller-rating"]')),
      delivery: Boolean(el.querySelector('[data-icon-name="delivery"]')) || /доставка/i.test(text(el) ?? ""),
      badges: [...el.querySelectorAll('[data-marker^="badge-title"]')].map(text).filter((b): b is string => Boolean(b)),
      description: el.querySelector('meta[itemprop="description"]')?.getAttribute("content")?.slice(0, 300) ?? null,
      image: images[0] ?? biggest(img?.getAttribute("srcset")) ?? img?.getAttribute("src") ?? null,
      photos: images.length,
      url: href ? new URL(href, "https://www.avito.ru").href.split("?")[0] : null,
    };
  });

  const pages = [...doc.querySelectorAll('[data-marker^="pagination-button/page("]')].map((a) => num(a.getAttribute("data-marker")) ?? 0);
  return {
    title: text(doc.querySelector("h1")),
    total: num(text(doc.querySelector('[data-marker="page-title/count"]'))),
    last_page: pages.length ? Math.max(...pages) : null,
    items,
  };
}
