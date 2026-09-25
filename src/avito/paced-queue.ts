import { sleep } from "../cdp/browser.js";

/**
 * Выполняет задачи строго по одной, в порядке поступления, с паузой между ними:
 * Avito быстро режет частые запросы (ответ 439).
 */
export class PacedQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private lastFinishedAt = 0;

  constructor(private minGapMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const paced = async () => {
      const wait = this.lastFinishedAt + this.minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        this.lastFinishedAt = Date.now();
      }
    };
    const result = this.tail.then(paced, paced);
    this.tail = result.catch(() => {});
    return result;
  }
}
