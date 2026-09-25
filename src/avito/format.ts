// Адреса Avito и мелкие преобразования
export const SITE = "https://www.avito.ru";

/** Путь запроса из ссылки на объявление или его номера */
export function itemPath(input: string): string {
  const s = input.trim();
  if (/^\d{6,}$/.test(s)) return `/items/${s}`; // Avito редиректит /items/<id> на объявление
  const u = new URL(s.startsWith("http") ? s : `${SITE}/${s.replace(/^\//, "")}`);
  if (!/(^|\.)avito\.ru$/.test(u.hostname)) throw new Error("Нужна ссылка на avito.ru или номер объявления");
  return u.pathname;
}

/** Ссылка без параметров запроса */
export const stripQuery = (url: string): string => url.split("?")[0];

/** Время у Avito бывает в секундах, миллисекундах, микросекундах или наносекундах — приводим к секундам */
export function toSeconds(t: number | null | undefined): number | null {
  if (!t) return null;
  while (t >= 1e10) t /= 10;
  return Math.floor(t);
}

/** "2026-09-25 14:03" (UTC) из времени Avito в любых единицах */
export function formatTime(t: number | null | undefined): string | null {
  const sec = toSeconds(t);
  return sec ? new Date(sec * 1000).toISOString().slice(0, 16).replace("T", " ") : null;
}
